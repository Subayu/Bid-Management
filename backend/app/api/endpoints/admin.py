"""Admin/demo endpoints (e.g. reset for fresh demo)."""
import logging
from pathlib import Path

from fastapi import APIRouter
from sqlalchemy import text

from app.database import engine
from app.models.base import Base
import app.models  # noqa: F401
from app.services.file_service import ensure_upload_dir, UPLOAD_DIR

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/admin", tags=["admin"])


@router.post("/reset")
def reset_demo():
    """Clear all RFPs, bids, audit events, and uploaded files for a fresh demo."""
    # Terminate other DB connections so we can drop tables without waiting for locks.
    try:
        with engine.connect() as conn:
            conn.execute(text("""
                SELECT pg_terminate_backend(pid) FROM pg_stat_activity
                WHERE datname = current_database() AND pid <> pg_backend_pid()
            """))
            conn.commit()
    except Exception as e:
        logger.warning("Could not terminate other connections: %s. Proceeding anyway.", e)

    engine.dispose()

    # Use raw DROP TABLE ... CASCADE in one connection so we never wait on pool/lock ordering.
    with engine.connect() as conn:
        for table in reversed(Base.metadata.sorted_tables):
            conn.execute(text(f'DROP TABLE IF EXISTS "{table.name}" CASCADE'))
        conn.commit()

    Base.metadata.create_all(bind=engine)

    # Remove all uploaded files
    if UPLOAD_DIR.exists():
        for f in UPLOAD_DIR.iterdir():
            if f.is_file():
                f.unlink()
    ensure_upload_dir()
    return {"status": "ok", "message": "All data and uploads cleared."}
