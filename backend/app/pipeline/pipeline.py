"""Main orchestrator entry point for the document extraction pipeline.

Owned by: pipeline/pipeline.py
"""

import logging
import gc
import os
from pathlib import Path
from typing import Union

from backend.app.pipeline.classification.page_classifier import classify_pdf_page
from backend.app.pipeline.config import default_config
from backend.app.pipeline.extraction.tables import extract_tables_from_image, extract_tables_from_pdf_page
from backend.app.pipeline.extraction.text_native import extract_native_text
from backend.app.pipeline.extraction.text_ocr import extract_text_with_ocr
from backend.app.pipeline.ingestion.loader_docx import load_docx
from backend.app.pipeline.ingestion.loader_image import load_image
from backend.app.pipeline.ingestion.loader_pdf import load_pdf
from backend.app.pipeline.ingestion.loader_xlsx import format_df_to_markdown, load_xlsx
from backend.app.pipeline.normalization.merge import create_document_page_result, merge_page_blocks
from backend.app.pipeline.normalization.schema import DocumentPageResult, ExtractedBlock, ExtractionResult, SourceType
from backend.app.pipeline.preprocessing.preprocess import normalize_image_resolution
from backend.app.pipeline.validation.confidence import validate_and_retry_low_confidence_blocks

logger = logging.getLogger(__name__)


def _memory_rss_mb() -> float | None:
    try:
        if os.name == "posix":
            with open("/proc/self/status", encoding="utf-8") as status_file:
                for line in status_file:
                    if line.startswith("VmRSS:"):
                        return float(line.split()[1]) / 1024.0
    except Exception:
        return None
    return None


def _log_memory(stage: str) -> None:
    rss_mb = _memory_rss_mb()
    if rss_mb is not None:
        logger.info("Pipeline memory rss=%.1f MB stage=%s", rss_mb, stage)


def process_document(file_path: Union[str, Path]) -> ExtractionResult:
    """Single entry point for processing documents (PDF, Image, DOCX, XLSX/XLS/CSV)."""
    path = Path(file_path)
    if not path.is_file():
        raise FileNotFoundError(f"Document file not found: {path}")

    suffix = path.suffix.lower()

    if suffix == ".pdf":
        return _process_pdf_document(path)
    elif suffix in {".png", ".jpg", ".jpeg", ".tiff", ".bmp", ".webp"}:
        return _process_image_document(path)
    elif suffix == ".docx":
        return _process_docx_document(path)
    elif suffix in {".xlsx", ".xls", ".csv", ".xlsm"}:
        return _process_xlsx_document(path)
    else:
        try:
            return _process_image_document(path)
        except Exception:
            return _process_text_fallback(path)


def _process_pdf_document(path: Path) -> ExtractionResult:
    result = ExtractionResult(source="pdf", file_path=str(path))

    with load_pdf(path) as pdf_wrapper:
        for page_num in range(1, pdf_wrapper.page_count + 1):
            _log_memory(f"pdf page {page_num} start")
            fitz_page = pdf_wrapper.get_page(page_num)
            classification = classify_pdf_page(fitz_page, page_number=page_num)
            logger.info(
                "PDF page %s classified as %s text_chars=%s images=%s image_coverage=%.2f",
                page_num,
                classification.page_type,
                classification.text_char_count,
                classification.image_count,
                classification.image_coverage_ratio,
            )

            native_blocks: list[ExtractedBlock] = []
            ocr_blocks: list[ExtractedBlock] = []
            table_blocks: list[ExtractedBlock] = []
            page_img = None
            norm_img = None

            if classification.page_type == "native_text":
                native_blocks = extract_native_text(fitz_page)
                if default_config.enable_img2table:
                    table_blocks = extract_tables_from_pdf_page(fitz_page)
            elif classification.page_type == "scanned":
                page_img = pdf_wrapper.render_page_image(
                    page_num,
                    target_dpi=default_config.target_dpi,
                    max_dimension=default_config.max_image_dimension,
                )
                _log_memory(f"pdf page {page_num} rendered dpi={default_config.target_dpi} size={page_img.size}")
                norm_img = normalize_image_resolution(page_img, max_dim=default_config.max_image_dimension)
                _log_memory(f"pdf page {page_num} normalized size={norm_img.size}")
                ocr_blocks = extract_text_with_ocr(norm_img)
                _log_memory(f"pdf page {page_num} rapidocr blocks={len(ocr_blocks)}")
                ocr_blocks = validate_and_retry_low_confidence_blocks(norm_img, ocr_blocks)
                if default_config.enable_img2table:
                    table_blocks = extract_tables_from_image(norm_img)
                    _log_memory(f"pdf page {page_num} img2table blocks={len(table_blocks)}")
            else:  # mixed page
                native_blocks = extract_native_text(fitz_page)
                page_img = pdf_wrapper.render_page_image(
                    page_num,
                    target_dpi=default_config.target_dpi,
                    max_dimension=default_config.max_image_dimension,
                )
                _log_memory(f"pdf page {page_num} rendered dpi={default_config.target_dpi} size={page_img.size}")
                norm_img = normalize_image_resolution(page_img, max_dim=default_config.max_image_dimension)
                _log_memory(f"pdf page {page_num} normalized size={norm_img.size}")
                ocr_blocks = extract_text_with_ocr(norm_img)
                _log_memory(f"pdf page {page_num} rapidocr blocks={len(ocr_blocks)}")
                ocr_blocks = validate_and_retry_low_confidence_blocks(norm_img, ocr_blocks)
                if default_config.enable_img2table:
                    table_blocks = extract_tables_from_pdf_page(fitz_page) or extract_tables_from_image(norm_img)
                    _log_memory(f"pdf page {page_num} table blocks={len(table_blocks)}")

            merged = merge_page_blocks(
                native_blocks=native_blocks,
                ocr_blocks=ocr_blocks,
                table_blocks=table_blocks,
                is_mixed_page=(classification.page_type == "mixed"),
            )

            result.pages.append(create_document_page_result(page_num=page_num, source="pdf", blocks=merged))
            del page_img
            del norm_img
            gc.collect()
            _log_memory(f"pdf page {page_num} complete")

    return result


def _process_image_document(path: Path) -> ExtractionResult:
    result = ExtractionResult(source="image", file_path=str(path))
    img_wrapper = load_image(path)
    norm_img = normalize_image_resolution(img_wrapper.image, max_dim=default_config.max_image_dimension)

    ocr_blocks = extract_text_with_ocr(norm_img)
    ocr_blocks = validate_and_retry_low_confidence_blocks(norm_img, ocr_blocks)
    table_blocks = extract_tables_from_image(norm_img) if default_config.enable_img2table else []

    merged = merge_page_blocks(
        native_blocks=[],
        ocr_blocks=ocr_blocks,
        table_blocks=table_blocks,
        is_mixed_page=False,
    )

    result.pages.append(create_document_page_result(page_num=1, source="image", blocks=merged))
    return result


def _process_docx_document(path: Path) -> ExtractionResult:
    result = ExtractionResult(source="docx", file_path=str(path))
    docx_wrapper = load_docx(path)

    blocks: list[ExtractedBlock] = []
    parts = docx_wrapper.get_formatted_parts()
    for part in parts:
        block_type = "table" if part.strip().startswith("|") else "text"
        blocks.append(
            ExtractedBlock(
                type=block_type,
                bbox=[0.0, 0.0, 0.0, 0.0],
                content=part.strip(),
                confidence=1.0,
                engine="mammoth",
            )
        )

    result.pages.append(create_document_page_result(page_num=1, source="docx", blocks=blocks))
    return result


def _process_xlsx_document(path: Path) -> ExtractionResult:
    result = ExtractionResult(source="xlsx", file_path=str(path))
    excel_wrapper = load_xlsx(path)

    engine_name = "xlrd" if path.suffix.lower() == ".xls" else "openpyxl"

    for idx, (sheet_name, df) in enumerate(excel_wrapper.sheets_data.items(), start=1):
        blocks: list[ExtractedBlock] = []
        if not df.empty:
            md_text = format_df_to_markdown(df)
            blocks.append(
                ExtractedBlock(
                    type="table",
                    bbox=[0.0, 0.0, 0.0, 0.0],
                    content=f"### Sheet: {sheet_name}\n{md_text}".strip(),
                    confidence=1.0,
                    engine=engine_name,
                )
            )
        result.pages.append(create_document_page_result(page_num=idx, source="xlsx", blocks=blocks))

    return result


def _process_text_fallback(path: Path) -> ExtractionResult:
    result = ExtractionResult(source="image", file_path=str(path))
    try:
        content = path.read_text(encoding="utf-8", errors="ignore")
        if content.strip():
            blocks = [
                ExtractedBlock(
                    type="text",
                    bbox=[0.0, 0.0, 0.0, 0.0],
                    content=content.strip(),
                    confidence=1.0,
                    engine="pymupdf",
                )
            ]
            result.pages.append(create_document_page_result(page_num=1, source="image", blocks=blocks))
    except Exception as err:
        logger.warning("Text fallback failed for %s: %s", path.name, err)

    return result
