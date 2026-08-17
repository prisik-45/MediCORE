"""Configuration for document extraction pipeline engines and parameters."""

from dataclasses import dataclass, field
from typing import Dict, Literal

from backend.app.config import get_settings


@dataclass
class PipelineConfig:
    # Target DPI for PDF page rendering. Keep conservative for memory-limited workers.
    target_dpi: int = 200
    min_image_dpi_upscale: int = 200
    max_image_dpi_downsample: int = 400
    max_image_dimension: int = 3000

    # Image tiling threshold (Phase 3 requirement: split >3000px)
    tile_max_dimension: int = 3000
    tile_overlap_px: int = 200

    # RapidOCR tuning (Phase 3 requirement)
    ocr_box_thresh: float = 0.3
    ocr_unclip_ratio: float = 1.6
    ocr_use_angle_cls: bool = True

    # Preprocessing options
    enable_deskew: bool = True
    enable_adaptive_binarization: bool = True
    enable_img2table: bool = True
    denoise_kernel_size: int = 3

    # Confidence fallback threshold (Phase 3 requirement)
    min_block_confidence: float = 0.60

    # Engine mapping per source file type
    engine_mapping: Dict[str, str] = field(
        default_factory=lambda: {
            "pdf": "pymupdf_rapidocr_img2table",
            "image": "rapidocr_img2table",
            "docx": "mammoth",
            "xlsx": "openpyxl_xlrd",
            "xls": "openpyxl_xlrd",
            "csv": "openpyxl_xlrd",
        }
    )

    @classmethod
    def from_settings(cls) -> "PipelineConfig":
        settings = get_settings()
        target_dpi = max(120, min(int(settings.pipeline_pdf_render_dpi), 300))
        max_image_dim = max(1800, min(int(settings.pipeline_max_image_dim), 4500))
        return cls(
            target_dpi=target_dpi,
            max_image_dimension=max_image_dim,
            tile_max_dimension=max_image_dim,
            enable_img2table=bool(settings.pipeline_enable_img2table),
        )


# Singleton default config instance
default_config = PipelineConfig.from_settings()
