import asyncio
import json

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, Header
from sqlalchemy.orm import Session, joinedload

from app.database import get_db
from app.models.rfp import RFP
from app.models.bid import Bid
from app.models.bid_audit import BidAuditEvent
from app.schemas.bid import (
    BidResponse,
    BidDetailResponse,
    BidHumanUpdate,
    BidStatusUpdate,
    RFPRef,
    BidAuditEventResponse,
)
from app.services.file_service import save_uploaded_file
from app.services.ocr_service import extract_text_from_pdf
from app.services.ai_service import evaluate_bid as ai_evaluate_bid

router = APIRouter(tags=["bids"])


@router.post("/rfps/{rfp_id}/bids", response_model=BidResponse)
async def upload_bid(
    rfp_id: int,
    vendor_name: str = Form(...),
    file: UploadFile = File(...),
    actor: str | None = Form(None),
    db: Session = Depends(get_db),
):
    rfp = db.query(RFP).filter(RFP.id == rfp_id).first()
    if not rfp:
        raise HTTPException(status_code=404, detail="RFP not found")
    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="A PDF file is required")

    relative_path, original_filename, absolute_path = save_uploaded_file(file)
    extracted_text = extract_text_from_pdf(absolute_path)

    bid = Bid(
        rfp_id=rfp_id,
        filename=original_filename,
        file_path=relative_path,
        extracted_text=extracted_text or None,
        vendor_name=vendor_name,
        status="Uploaded",
    )
    db.add(bid)
    db.commit()
    db.refresh(bid)
    db.add(BidAuditEvent(bid_id=bid.id, action="created", actor=actor or "Bid Manager"))
    db.commit()
    return bid


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
def get_bid(bid_id: int, db: Session = Depends(get_db)):
    """Get a single bid with its RFP details and audit trail."""
    bid = (
        db.query(Bid)
        .options(joinedload(Bid.rfp), joinedload(Bid.audit_events))
        .filter(Bid.id == bid_id)
        .first()
    )
    if not bid:
        raise HTTPException(status_code=404, detail="Bid not found")
    rfp = bid.rfp
    events = sorted(bid.audit_events, key=lambda e: e.created_at or "")
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
        rfp=RFPRef(id=rfp.id, title=rfp.title, requirements=rfp.requirements),
        audit_events=[BidAuditEventResponse.model_validate(e) for e in events],
    )


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
    rfp_text = (rfp.requirements or "") + "\n" + (getattr(rfp, "description", None) or "")
    bid_text = bid.extracted_text or ""
    result = await asyncio.to_thread(
        ai_evaluate_bid, rfp_text.strip(), bid_text
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
    """Update human reviewer score and notes."""
    bid = db.query(Bid).filter(Bid.id == bid_id).first()
    if not bid:
        raise HTTPException(status_code=404, detail="Bid not found")
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
    """Update bid status (Approver workflow: Approved | Rejected)."""
    if payload.status not in ("Approved", "Rejected"):
        raise HTTPException(
            status_code=400,
            detail="status must be 'Approved' or 'Rejected'",
        )
    bid = db.query(Bid).filter(Bid.id == bid_id).first()
    if not bid:
        raise HTTPException(status_code=404, detail="Bid not found")
    bid.status = payload.status
    db.commit()
    db.refresh(bid)
    db.add(BidAuditEvent(bid_id=bid.id, action=payload.status.lower(), actor=x_persona or "Approver"))
    db.commit()
    db.refresh(bid)
    return bid
