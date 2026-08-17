"""PDF file loader using PyMuPDF (fitz).

Owned by: pipeline/ingestion/loader_pdf.py
"""

from pathlib import Path
import fitz
from PIL import Image

Image.MAX_IMAGE_PIXELS = None


class PDFDocumentWrapper:
    """Wrapper around PyMuPDF Document to keep file opening encapsulated in ingestion/."""

    def __init__(self, doc: fitz.Document, file_path: Path):
        self.doc = doc
        self.file_path = file_path
        self.page_count = len(doc)

    def get_page(self, page_num_1indexed: int) -> fitz.Page:
        return self.doc[page_num_1indexed - 1]

    def render_page_image(
        self,
        page_num_1indexed: int,
        target_dpi: int = 300,
        max_dimension: int | None = None,
    ) -> Image.Image:
        page = self.get_page(page_num_1indexed)
        scale = target_dpi / 72.0
        if max_dimension:
            rect = page.rect
            long_edge = max(float(rect.width), float(rect.height))
            if long_edge > 0:
                scale = min(scale, max_dimension / long_edge)
        matrix = fitz.Matrix(scale, scale)
        pix = page.get_pixmap(matrix=matrix, alpha=False)
        return Image.frombytes("RGB", (pix.width, pix.height), pix.samples)

    def close(self) -> None:
        self.doc.close()

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        self.close()


def load_pdf(file_path: Path) -> PDFDocumentWrapper:
    """Open PDF file and return PDFDocumentWrapper."""
    doc = fitz.open(file_path)
    return PDFDocumentWrapper(doc, file_path)
