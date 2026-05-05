from pathlib import Path

import fitz
import pdfplumber


def extract_pdf_text(path: str | Path) -> str:
    pdf_path = Path(path)
    text_parts: list[str] = []

    with fitz.open(pdf_path) as doc:
        for page in doc:
            text_parts.append(page.get_text("text"))

    text = "\n".join(part.strip() for part in text_parts if part.strip())
    if text:
        return text

    with pdfplumber.open(pdf_path) as pdf:
        return "\n".join(page.extract_text() or "" for page in pdf.pages).strip()
