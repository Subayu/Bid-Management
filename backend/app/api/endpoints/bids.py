import asyncio
import json
import logging
import re
from urllib.parse import urlparse

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, Header, Body, Response
from sqlalchemy.orm import Session, joinedload

from app.database import get_db
from app.models.rfp import RFP
from app.models.bid import Bid
from app.models.bid_audit import BidAuditEvent
from app.models.vendor import Vendor, VendorRep
from app.models.bid_evaluation_history import BidEvaluationHistory
from app.schemas.bid import (
    BidResponse,
    BidDetailResponse,
    BidHumanUpdate,
    BidStatusUpdate,
    BidReEvaluateBody,
    RFPRef,
    BidAuditEventResponse,
    BidEvaluationHistoryResponse,
    VendorResponse,
    VendorRepResponse,
)
from app.services.file_service import save_uploaded_file
from app.services.ocr_service import extract_text_from_pdf
from app.services.ai_service import (
    evaluate_bid as ai_evaluate_bid,
    evaluate_bid_with_context,
    extract_vendor_and_rep,
)
from app.services.digital_agents import verify_website, verify_phone

router = APIRouter(tags=["bids"])
logger = logging.getLogger(__name__)

FINAL_BID_STATUSES = ("Approved", "Rejected")
VENDOR_EXTRACT_PLACEHOLDER = "Processing…"


def _domain_from_website(website: str | None) -> str | None:
    if not website or not str(website).strip():
        return None
    s = str(website).strip()
    if not s.startswith(("http://", "https://")):
        s = "https://" + s
    try:
        parsed = urlparse(s)
        host = (parsed.netloc or parsed.path or "").split("/")[0].lower()
        if host and re.match(r"^[a-z0-9\.\-]+\.[a-z]{2,}$", host):
            return host
        return host or None
    except Exception:
        return None


def _find_or_create_vendor(db: Session, extraction: dict) -> tuple[Vendor, list[VendorRep]]:
    """Match vendor by name or website; if not found create Vendor and reps. Run digital agents."""
    v = (extraction.get("vendor") or {})
    name = (v.get("name") or "").strip() or "Unknown Vendor"
    address = (v.get("address") or "").strip() or None
    website = (v.get("website") or "").strip() or None
    domain = (v.get("domain") or "").strip() or _domain_from_website(website)

    existing = None
    if name and name != "Unknown Vendor":
        existing = db.query(Vendor).filter(Vendor.name.ilike(name)).first()
    if existing is None and website:
        existing = db.query(Vendor).filter(Vendor.website == website).first()
    if existing:
        vendor = existing
        reps = list(vendor.representatives)
    else:
        website_verified = verify_website(website) if website else None
        vendor = Vendor(
            name=name,
            address=address,
            website=website or None,
            domain=domain,
            website_verified=website_verified,
        )
        db.add(vendor)
        db.flush()
        reps = []
        for r in (extraction.get("representatives") or [])[:5]:
            rep = VendorRep(
                vendor_id=vendor.id,
                name=(r.get("name") or "").strip() or None,
                email=(r.get("email") or "").strip() or None,
                phone=(r.get("phone") or "").strip() or None,
                designation=(r.get("designation") or "").strip() or None,
                phone_verified=verify_phone((r.get("phone") or "").strip() or None) if r.get("phone") else None,
            )
            db.add(rep)
            reps.append(rep)
        db.flush()
    return vendor, reps


@router.post("/rfps/{rfp_id}/bids", response_model=BidResponse)
async def upload_bid(
    rfp_id: int,
    file: UploadFile = File(...),
    actor: str | None = Form(None),
    db: Session = Depends(get_db),
):
    """Phase 1: Save PDF and OCR only. Frontend then calls POST /bids/{id}/extract-vendor for AI processing."""
    rfp = db.query(RFP).filter(RFP.id == rfp_id).first()
    if not rfp:
        raise HTTPException(status_code=404, detail="RFP not found")
    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="A PDF file is required")

    relative_path, original_filename, absolute_path = save_uploaded_file(file)
    extracted_text = extract_text_from_pdf(absolute_path)
    text = extracted_text or ""

    bid = Bid(
        rfp_id=rfp_id,
        vendor_id=None,
        filename=original_filename,
        file_path=relative_path,
        extracted_text=text or None,
        vendor_name=VENDOR_EXTRACT_PLACEHOLDER,
        status="Uploaded",
    )
    db.add(bid)
    db.commit()
    db.refresh(bid)
    db.add(BidAuditEvent(bid_id=bid.id, action="created", actor=actor or "Bid Manager"))
    db.commit()
    db.refresh(bid)
    return bid


@router.post("/bids/{bid_id}/extract-vendor")
async def extract_vendor(
    bid_id: int,
    actor: str | None = Form(None),
    db: Session = Depends(get_db),
):
    """Extract vendor from bid text and save to bid. Runs in request; returns small JSON so client gets a quick response."""
    bid = db.query(Bid).filter(Bid.id == bid_id).first()
    if not bid:
        raise HTTPException(status_code=404, detail="Bid not found")
    text = bid.extracted_text or ""
    logger.info("extract-vendor: bid_id=%s, starting", bid_id)
    extraction = await asyncio.to_thread(extract_vendor_and_rep, text)
    vendor, _ = _find_or_create_vendor(db, extraction)
    bid.vendor_id = vendor.id
    bid.vendor_name = vendor.name
    db.commit()
    logger.info("extract-vendor: bid_id=%s, done vendor_name=%s", bid_id, vendor.name)
    return {"status": "ok", "bid_id": bid_id, "vendor_name": vendor.name}


@router.get("/rfps/{rfp_id}/bids", response_model=list[BidResponse])
def list_bids(rfp_id: int, db: Session = Depends(get_db)):
    rfp = db.query(RFP).filter(RFP.id == rfp_id).first()
    if not rfp:
        raise HTTPException(status_code=404, detail="RFP not found")
    return db.query(Bid).filter(Bid.rfp_id == rfp_id).order_by(Bid.created_at.desc()).all()


@router.get("/bids", response_model=list[BidResponse])
def list_all_bids(db: Session = Depends(get_db)):
    """List all bids across RFPs, newest first."""
    return db.query(Bid).order_by(Bid.created_at.desc()).all()


@router.get("/bids/{bid_id}", response_model=BidDetailResponse)
def get_bid(bid_id: int, response: Response, db: Session = Depends(get_db)):
    """Get a single bid with its RFP, vendor (and reps with verification), audit trail, and evaluation history."""
    response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate"
    bid = (
        db.query(Bid)
        .options(
            joinedload(Bid.rfp),
            joinedload(Bid.audit_events),
            joinedload(Bid.vendor).joinedload(Vendor.representatives),
            joinedload(Bid.evaluation_history),
        )
        .filter(Bid.id == bid_id)
        .first()
    )
    if not bid:
        raise HTTPException(status_code=404, detail="Bid not found")
    rfp = bid.rfp
    events = sorted(bid.audit_events, key=lambda e: e.created_at or "")
    history = sorted(bid.evaluation_history or [], key=lambda h: h.created_at or "", reverse=True)
    vendor_data = None
    if bid.vendor:
        from app.schemas.bid import VendorResponse, VendorRepResponse
        vendor_data = VendorResponse(
            id=bid.vendor.id,
            name=bid.vendor.name,
            address=bid.vendor.address,
            website=bid.vendor.website,
            domain=bid.vendor.domain,
            website_verified=bid.vendor.website_verified,
            representatives=[VendorRepResponse.model_validate(r) for r in (bid.vendor.representatives or [])],
        )
    return BidDetailResponse(
        id=bid.id,
        rfp_id=bid.rfp_id,
        filename=bid.filename,
        file_path=bid.file_path,
        extracted_text=bid.extracted_text,
        vendor_name=bid.vendor_name,
        status=bid.status,
        ai_score=bid.ai_score,
        ai_reasoning=bid.ai_reasoning,
        ai_evaluation_source=bid.ai_evaluation_source,
        ai_requirements_breakdown=bid.ai_requirements_breakdown,
        human_score=bid.human_score,
        human_notes=bid.human_notes,
        created_at=bid.created_at,
        updated_at=bid.updated_at,
        rfp=RFPRef(id=rfp.id, title=rfp.title, requirements=rfp.requirements, bids_locked=getattr(rfp, "bids_locked", False)),
        vendor=vendor_data,
        audit_events=[BidAuditEventResponse.model_validate(e) for e in events],
        evaluation_history=[BidEvaluationHistoryResponse.model_validate(h) for h in history],
    )


def _ensure_bid_editable(bid: Bid, rfp: RFP) -> None:
    """Raise 400 if RFP is locked or bid is in final state."""
    if getattr(rfp, "bids_locked", False):
        raise HTTPException(status_code=400, detail="Bids are locked for final decision; no edits or re-evaluation allowed.")
    if bid.status in FINAL_BID_STATUSES:
        raise HTTPException(status_code=400, detail="Bid is already in a final state (Approved/Rejected); no edits allowed.")


@router.post("/bids/{bid_id}/evaluate", response_model=BidResponse)
async def evaluate_bid_endpoint(
    bid_id: int,
    x_persona: str | None = Header(None, alias="X-Persona"),
    db: Session = Depends(get_db),
):
    """Run AI evaluation on the bid; updates ai_score, ai_reasoning, status to Evaluated."""
    bid = (
        db.query(Bid)
        .options(joinedload(Bid.rfp))
        .filter(Bid.id == bid_id)
        .first()
    )
    if not bid:
        raise HTTPException(status_code=404, detail="Bid not found")
    rfp = bid.rfp
    _ensure_bid_editable(bid, rfp)
    rfp_text = (rfp.requirements or "") + "\n" + (getattr(rfp, "description", None) or "")
    bid_text = bid.extracted_text or ""
    text_chunks = None
    if bid.text_chunks:
        try:
            text_chunks = json.loads(bid.text_chunks)
            if not isinstance(text_chunks, list):
                text_chunks = None
        except Exception:
            text_chunks = None
    result = await asyncio.to_thread(
        ai_evaluate_bid,
        rfp_text.strip(),
        bid_text,
        evaluation_summary=getattr(bid, "evaluation_summary", None) or None,
        text_chunks=text_chunks,
    )
    score = result.get("score")
    reasoning = result.get("reasoning")
    if score is not None:
        bid.ai_score = float(score)
    if reasoning is not None:
        bid.ai_reasoning = str(reasoning)
    if result.get("evaluation_source"):
        bid.ai_evaluation_source = str(result["evaluation_source"])
    if "requirements_breakdown" in result and result["requirements_breakdown"]:
        bid.ai_requirements_breakdown = json.dumps(result["requirements_breakdown"])
    bid.status = "Evaluated"
    db.commit()
    db.refresh(bid)
    db.add(BidAuditEvent(bid_id=bid.id, action="evaluated", actor=x_persona or "Reviewer"))
    db.commit()
    db.refresh(bid)
    return bid


@router.post("/bids/{bid_id}/re-evaluate", response_model=BidResponse)
async def re_evaluate_bid_endpoint(
    bid_id: int,
    body: BidReEvaluateBody | None = Body(None),
    x_persona: str | None = Header(None, alias="X-Persona"),
    db: Session = Depends(get_db),
):
    """Submit for re-evaluation: archive current scores to history, then run AI with optional reviewer notes."""
    bid = (
        db.query(Bid)
        .options(joinedload(Bid.rfp))
        .filter(Bid.id == bid_id)
        .first()
    )
    if not bid:
        raise HTTPException(status_code=404, detail="Bid not found")
    rfp = bid.rfp
    _ensure_bid_editable(bid, rfp)
    # Archive current evaluation to history
    db.add(BidEvaluationHistory(
        bid_id=bid.id,
        ai_score=bid.ai_score,
        ai_reasoning=bid.ai_reasoning,
        ai_requirements_breakdown=bid.ai_requirements_breakdown,
        human_score=bid.human_score,
        human_notes=bid.human_notes,
    ))
    db.flush()
    rfp_text = (rfp.requirements or "") + "\n" + (getattr(rfp, "description", None) or "")
    bid_text = bid.extracted_text or ""
    text_chunks = None
    if bid.text_chunks:
        try:
            text_chunks = json.loads(bid.text_chunks)
            if not isinstance(text_chunks, list):
                text_chunks = None
        except Exception:
            text_chunks = None
    human_notes_context = (body and body.human_notes_context) or bid.human_notes
    result = await asyncio.to_thread(
        evaluate_bid_with_context,
        rfp_text.strip(),
        bid_text,
        human_notes_context,
        evaluation_summary=getattr(bid, "evaluation_summary", None) or None,
        text_chunks=text_chunks,
    )
    score = result.get("score")
    reasoning = result.get("reasoning")
    if score is not None:
        bid.ai_score = float(score)
    if reasoning is not None:
        bid.ai_reasoning = str(reasoning)
    if result.get("evaluation_source"):
        bid.ai_evaluation_source = str(result["evaluation_source"])
    if "requirements_breakdown" in result and result["requirements_breakdown"]:
        bid.ai_requirements_breakdown = json.dumps(result["requirements_breakdown"])
    bid.status = "Evaluated"
    db.commit()
    db.refresh(bid)
    db.add(BidAuditEvent(bid_id=bid.id, action="evaluated", actor=x_persona or "Reviewer"))
    db.commit()
    db.refresh(bid)
    return bid


@router.patch("/bids/{bid_id}", response_model=BidResponse)
def update_bid_human(
    bid_id: int,
    payload: BidHumanUpdate,
    x_persona: str | None = Header(None, alias="X-Persona"),
    db: Session = Depends(get_db),
):
    """Update human reviewer score and notes. Rejected when RFP bids locked or bid is Approved/Rejected."""
    bid = db.query(Bid).options(joinedload(Bid.rfp)).filter(Bid.id == bid_id).first()
    if not bid:
        raise HTTPException(status_code=404, detail="Bid not found")
    _ensure_bid_editable(bid, bid.rfp)
    if payload.human_score is not None:
        bid.human_score = payload.human_score
    if payload.human_notes is not None:
        bid.human_notes = payload.human_notes
    db.commit()
    db.refresh(bid)
    db.add(BidAuditEvent(bid_id=bid.id, action="human_review", actor=x_persona or "Reviewer"))
    db.commit()
    db.refresh(bid)
    return bid


@router.patch("/bids/{bid_id}/status", response_model=BidResponse)
def update_bid_status(
    bid_id: int,
    payload: BidStatusUpdate,
    x_persona: str | None = Header(None, alias="X-Persona"),
    db: Session = Depends(get_db),
):
    """Update bid status (Approver workflow: Approved | Rejected). Allowed even when RFP locked."""
    if payload.status not in ("Approved", "Rejected"):
        raise HTTPException(
            status_code=400,
            detail="status must be 'Approved' or 'Rejected'",
        )
    bid = db.query(Bid).options(joinedload(Bid.rfp)).filter(Bid.id == bid_id).first()
    if not bid:
        raise HTTPException(status_code=404, detail="Bid not found")
    if bid.status in FINAL_BID_STATUSES:
        raise HTTPException(status_code=400, detail="Bid is already in a final state.")
    bid.status = payload.status
    db.commit()
    db.refresh(bid)
    db.add(BidAuditEvent(bid_id=bid.id, action=payload.status.lower(), actor=x_persona or "Approver"))
    db.commit()
    db.refresh(bid)
    return bid
