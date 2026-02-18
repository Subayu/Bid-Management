import fitz  # PyMuPDF


def extract_text_from_pdf(file_path: str) -> str:
    """
    Open the PDF at file_path and extract text. file_path should be absolute or relative to CWD.
    Returns extracted text or empty string on error.
    """
    try:
        doc = fitz.open(file_path)
        parts = []
        for page in doc:
            parts.append(page.get_text())
        doc.close()
        return "\n".join(parts).strip()
    except Exception:
        return ""
