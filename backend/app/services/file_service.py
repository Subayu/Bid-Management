import os
import uuid
from pathlib import Path

from fastapi import UploadFile

UPLOAD_DIR = Path("/app/data/uploads")


def ensure_upload_dir() -> Path:
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    return UPLOAD_DIR


def save_uploaded_file(upload: UploadFile) -> tuple[str, str, str]:
    """
    Save an uploaded file to /app/data/uploads.
    Returns (relative_path, original_filename, absolute_path).
    relative_path for DB (e.g. data/uploads/abc123.pdf); absolute_path for OCR.
    """
    ensure_upload_dir()
    ext = Path(upload.filename or "bin").suffix
    unique_name = f"{uuid.uuid4().hex}{ext}"
    path = UPLOAD_DIR / unique_name
    with open(path, "wb") as f:
        content = upload.file.read()
        f.write(content)
    relative_path = f"data/uploads/{unique_name}"
    absolute_path = str(path)
    return relative_path, upload.filename or unique_name, absolute_path
