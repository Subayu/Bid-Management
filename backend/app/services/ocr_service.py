import re
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


def extract_text_per_page(file_path: str) -> list[str]:
    """
    Extract text from each page of the PDF. Returns a list of strings, one per page (1-based index = 1 + list index).
    Used to correct annotation page numbers by searching for the quote in the right page.
    """
    try:
        doc = fitz.open(file_path)
        parts = [page.get_text() for page in doc]
        doc.close()
        return parts
    except Exception:
        return []


def _normalize_for_search(s: str) -> str:
    """Collapse whitespace and normalize for substring search."""
    if not s or not isinstance(s, str):
        return ""
    return re.sub(r"\s+", " ", s.strip().lower())


def correct_annotation_pages(annotations: list[dict], page_texts: list[str]) -> list[dict]:
    """
    Set each annotation's 'page' to the 1-based page number where its quote appears.
    If the quote is found in page_texts[i], set page = i + 1. If not found, leave page as-is (or unset).
    """
    if not page_texts or not annotations:
        return annotations
    result = []
    for ann in annotations:
        if not isinstance(ann, dict):
            result.append(ann)
            continue
        ann = dict(ann)
        quote = (ann.get("quote") or "").strip()
        if not quote or len(quote) < 10:
            result.append(ann)
            continue
        norm_quote = _normalize_for_search(quote)
        if len(norm_quote) < 8:
            result.append(ann)
            continue
        # Search for the quote (or a substantial substring) in each page
        found_page = None
        for i, page_text in enumerate(page_texts):
            if not page_text:
                continue
            norm_page = _normalize_for_search(page_text)
            if norm_quote in norm_page:
                found_page = i + 1
                break
            # Try progressively shorter substrings in case of OCR/formatting differences
            for length in (80, 50, 35, 25):
                if len(norm_quote) >= length and norm_quote[:length] in norm_page:
                    found_page = i + 1
                    break
            if found_page is not None:
                break
        if found_page is not None:
            ann["page"] = found_page
        result.append(ann)
    return result
