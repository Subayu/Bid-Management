import logging
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s %(message)s")
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.database import engine
from app.models.base import Base
import app.models  # noqa: F401 - register BidAuditEvent etc. for create_all
from app.api.endpoints import admin, rfps, bids
from app.services.file_service import ensure_upload_dir

UPLOAD_DIR = Path("/app/data/uploads")


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Reset tables for POC so new columns apply (dev only)
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    ensure_upload_dir()
    yield


app = FastAPI(title="ShieldProcure API", version="0.1.0", lifespan=lifespan)

# Serve uploaded files at /static/<filename> so frontend can load PDFs
app.mount("/static", StaticFiles(directory=str(UPLOAD_DIR)), name="static")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(admin.router)
app.include_router(rfps.router)
app.include_router(bids.router)


def _ai_provider() -> str:
    """Which AI backend is configured for bid evaluation."""
    import os
    if os.getenv("OLLAMA_BASE_URL", "").strip():
        return "ollama"
    if os.getenv("OPENAI_API_KEY", "").strip():
        return "openai"
    return "mock"


@app.get("/health")
def health():
    """Health check endpoint for load balancers and readiness probes."""
    return {
        "status": "ok",
        "service": "shieldprocure-backend",
        "ai_provider": _ai_provider(),
    }
