"""Admin/demo endpoints (e.g. reset for fresh demo)."""
from pathlib import Path

from fastapi import APIRouter

from app.database import engine
from app.models.base import Base
import app.models  # noqa: F401
from app.services.file_service import ensure_upload_dir, UPLOAD_DIR

router = APIRouter(prefix="/admin", tags=["admin"])


@router.post("/reset")
def reset_demo():
    """Clear all RFPs, bids, audit events, and uploaded files for a fresh demo."""
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    # Remove all uploaded files
    if UPLOAD_DIR.exists():
        for f in UPLOAD_DIR.iterdir():
            if f.is_file():
                f.unlink()
    ensure_upload_dir()
    return {"status": "ok", "message": "All data and uploads cleared."}
