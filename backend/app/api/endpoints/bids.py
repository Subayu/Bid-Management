import asyncio
import json
import logging
import re
import time
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
    AnnotationVerifyBody,
    RFPRef,
    BidAuditEventResponse,
    BidEvaluationHistoryResponse,
    VendorResponse,
    VendorRepResponse,
)
from pathlib import Path

from app.services.file_service import save_uploaded_file, UPLOAD_DIR
from app.services.ocr_service import extract_text_from_pdf, extract_text_per_page, correct_annotation_pages
from app.services.ai_service import (
    evaluate_bid as ai_evaluate_bid,
    evaluate_bid_with_context,
    extract_vendor_and_rep,
)
from app.services.digital_agents import (
    verify_website,
    verify_phone,
    verify_email,
    process_annotation_verify_online,
    process_annotation_email_vendor,
)

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
            rep_email = (r.get("email") or "").strip() or None
            rep_phone = (r.get("phone") or "").strip() or None
            rep = VendorRep(
                vendor_id=vendor.id,
                name=(r.get("name") or "").strip() or None,
                email=rep_email,
                phone=rep_phone,
                designation=(r.get("designation") or "").strip() or None,
                phone_verified=verify_phone(rep_phone) if rep_phone else None,
                email_verified=verify_email(rep_email) if rep_email else None,
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
    page_texts = extract_text_per_page(absolute_path)
    text_chunks_json = json.dumps(page_texts) if page_texts else None

    bid = Bid(
        rfp_id=rfp_id,
        vendor_id=None,
        filename=original_filename,
        file_path=relative_path,
        extracted_text=text or None,
        text_chunks=text_chunks_json,
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
    """Extract vendor from bid text and save to bid. Returns vendor payload so the client can show details without refetch."""
    bid = db.query(Bid).filter(Bid.id == bid_id).first()
    if not bid:
        raise HTTPException(status_code=404, detail="Bid not found")
    text = bid.extracted_text or ""
    logger.info("extract-vendor: bid_id=%s, starting", bid_id)
    extraction = await asyncio.to_thread(extract_vendor_and_rep, text)
    vendor, reps = _find_or_create_vendor(db, extraction)
    bid.vendor_id = vendor.id
    bid.vendor_name = vendor.name
    db.commit()
    db.refresh(vendor)
    # Reload vendor with reps for response (relationship may not be loaded)
    vendor_with_reps = db.query(Vendor).options(joinedload(Vendor.representatives)).filter(Vendor.id == vendor.id).first()
    if vendor_with_reps:
        vendor = vendor_with_reps
    reps = list(vendor.representatives) if vendor.representatives else []
    vendor_data = VendorResponse(
        id=vendor.id,
        name=vendor.name,
        address=vendor.address,
        website=vendor.website,
        domain=vendor.domain,
        website_verified=vendor.website_verified,
        representatives=[VendorRepResponse.model_validate(r) for r in reps],
    )
    logger.info("extract-vendor: bid_id=%s, done vendor_name=%s", bid_id, vendor.name)
    return {"status": "ok", "bid_id": bid_id, "vendor_name": vendor.name, "vendor": vendor_data}


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
        last_eval_duration_seconds=getattr(bid, "last_eval_duration_seconds", None),
        ai_requirements_breakdown=bid.ai_requirements_breakdown,
        ai_annotations=getattr(bid, "ai_annotations", None),
        human_score=bid.human_score,
        human_notes=bid.human_notes,
        created_at=bid.created_at,
        updated_at=bid.updated_at,
        rfp=RFPRef(id=rfp.id, title=rfp.title, requirements=rfp.requirements, bids_locked=getattr(rfp, "bids_locked", False)),
        vendor=vendor_data,
        audit_events=[BidAuditEventResponse.model_validate(e) for e in events],
        evaluation_history=[BidEvaluationHistoryResponse.model_validate(h) for h in history],
    )
    logger.info(
        "get_bid: bid_id=%s vendor_id=%s has_vendor=%s last_eval_duration_seconds=%s",
        bid_id,
        getattr(bid, "vendor_id", None),
        vendor_data is not None,
        getattr(bid, "last_eval_duration_seconds", None),
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
    t0 = time.perf_counter()
    result = await asyncio.to_thread(
        ai_evaluate_bid,
        rfp_text.strip(),
        bid_text,
        evaluation_summary=getattr(bid, "evaluation_summary", None) or None,
        text_chunks=text_chunks,
    )
    elapsed = time.perf_counter() - t0
    score = result.get("score")
    reasoning = result.get("reasoning")
    if score is not None:
        bid.ai_score = float(score)
    if reasoning is not None:
        bid.ai_reasoning = str(reasoning)
    if result.get("evaluation_source"):
        bid.ai_evaluation_source = str(result["evaluation_source"])
    bid.last_eval_duration_seconds = round(elapsed, 2)
    if "requirements_breakdown" in result and result["requirements_breakdown"]:
        bid.ai_requirements_breakdown = json.dumps(result["requirements_breakdown"])
    if "annotations" in result and result["annotations"]:
        page_texts = text_chunks
        if not page_texts and bid.file_path:
            try:
                abs_path = UPLOAD_DIR / Path(bid.file_path).name
                if abs_path.exists():
                    page_texts = extract_text_per_page(str(abs_path))
            except Exception:
                page_texts = []
        annotations = correct_annotation_pages(result["annotations"], page_texts or [])
        bid.ai_annotations = json.dumps(annotations)
    else:
        bid.ai_annotations = None
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
    human_notes_context = (body and body.human_notes_context) or bid.human_notes or ""
    human_notes_context = (human_notes_context or "").strip()
    # Include reviewer notes from each annotation so re-evaluation gets full context
    try:
        existing_annotations = json.loads(bid.ai_annotations) if bid.ai_annotations else []
        if isinstance(existing_annotations, list):
            annotation_notes = [
                (a.get("reviewer_notes") or "").strip()
                for a in existing_annotations
                if isinstance(a, dict) and (a.get("reviewer_notes") or "").strip()
            ]
            if annotation_notes:
                human_notes_context += "\n\nAnnotation notes from reviewer:\n" + "\n".join(f"- {n}" for n in annotation_notes)
    except (json.JSONDecodeError, TypeError):
        pass
    human_notes_context = human_notes_context.strip() or None
    t0 = time.perf_counter()
    result = await asyncio.to_thread(
        evaluate_bid_with_context,
        rfp_text.strip(),
        bid_text,
        human_notes_context,
        evaluation_summary=getattr(bid, "evaluation_summary", None) or None,
        text_chunks=text_chunks,
    )
    elapsed = time.perf_counter() - t0
    score = result.get("score")
    reasoning = result.get("reasoning")
    if score is not None:
        bid.ai_score = float(score)
    if reasoning is not None:
        bid.ai_reasoning = str(reasoning)
    if result.get("evaluation_source"):
        bid.ai_evaluation_source = str(result["evaluation_source"])
    bid.last_eval_duration_seconds = round(elapsed, 2)
    if "requirements_breakdown" in result and result["requirements_breakdown"]:
        bid.ai_requirements_breakdown = json.dumps(result["requirements_breakdown"])
    if "annotations" in result and result["annotations"]:
        page_texts = text_chunks
        if not page_texts and bid.file_path:
            try:
                abs_path = UPLOAD_DIR / Path(bid.file_path).name
                if abs_path.exists():
                    page_texts = extract_text_per_page(str(abs_path))
            except Exception:
                page_texts = []
        new_ann = correct_annotation_pages(result["annotations"], page_texts or [])
        try:
            old_ann = json.loads(bid.ai_annotations) if bid.ai_annotations else []
            if isinstance(old_ann, list):
                for i, na in enumerate(new_ann):
                    if isinstance(na, dict) and i < len(old_ann) and isinstance(old_ann[i], dict):
                        oa = old_ann[i]
                        if (oa.get("reviewer_notes") or "").strip():
                            na["reviewer_notes"] = oa.get("reviewer_notes")
                        if oa.get("verification_status"):
                            na["verification_status"] = oa.get("verification_status")
                        if (oa.get("verification_note") or "").strip():
                            na["verification_note"] = oa.get("verification_note")
                        if na.get("page") is None and oa.get("page") is not None:
                            na["page"] = oa.get("page")
        except (json.JSONDecodeError, TypeError):
            pass
        bid.ai_annotations = json.dumps(new_ann)
    else:
        bid.ai_annotations = None
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
    """Update human reviewer score, notes, and/or annotation notes. Rejected when RFP bids locked or bid is Approved/Rejected."""
    bid = db.query(Bid).options(joinedload(Bid.rfp)).filter(Bid.id == bid_id).first()
    if not bid:
        raise HTTPException(status_code=404, detail="Bid not found")
    _ensure_bid_editable(bid, bid.rfp)
    if payload.human_score is not None:
        bid.human_score = payload.human_score
    if payload.human_notes is not None:
        bid.human_notes = payload.human_notes
    if payload.ai_annotations is not None:
        try:
            arr = json.loads(payload.ai_annotations)
            if isinstance(arr, list):
                bid.ai_annotations = payload.ai_annotations
            else:
                raise ValueError("ai_annotations must be a JSON array")
        except (json.JSONDecodeError, ValueError) as e:
            raise HTTPException(status_code=400, detail=f"Invalid ai_annotations: {e}") from e
    db.commit()
    db.refresh(bid)
    db.add(BidAuditEvent(bid_id=bid.id, action="human_review", actor=x_persona or "Reviewer"))
    db.commit()
    db.refresh(bid)
    return bid


@router.post("/bids/{bid_id}/annotations/verify", response_model=BidResponse)
def verify_annotation(
    bid_id: int,
    body: AnnotationVerifyBody,
    db: Session = Depends(get_db),
):
    """Run digital agent for an annotation: verify_online or email_vendor. Updates that annotation's verification_status and verification_note."""
    bid = (
        db.query(Bid)
        .options(joinedload(Bid.rfp), joinedload(Bid.vendor).joinedload(Vendor.representatives))
        .filter(Bid.id == bid_id)
        .first()
    )
    if not bid:
        raise HTTPException(status_code=404, detail="Bid not found")
    _ensure_bid_editable(bid, bid.rfp)
    annotations = []
    if bid.ai_annotations:
        try:
            annotations = json.loads(bid.ai_annotations)
        except json.JSONDecodeError:
            raise HTTPException(status_code=400, detail="Invalid ai_annotations JSON") from None
    if not isinstance(annotations, list):
        raise HTTPException(status_code=400, detail="ai_annotations must be an array")
    idx = body.index
    if idx < 0 or idx >= len(annotations):
        raise HTTPException(status_code=400, detail="Annotation index out of range")
    ann = annotations[idx]
    if not isinstance(ann, dict):
        ann = {}
    if body.action == "verify_online":
        result = process_annotation_verify_online(ann)
    else:
        vendor_email = None
        if bid.vendor and bid.vendor.representatives:
            for rep in bid.vendor.representatives:
                if rep.email and str(rep.email).strip():
                    vendor_email = str(rep.email).strip()
                    break
        result = process_annotation_email_vendor(ann, vendor_email)
    ann["verification_status"] = result.get("status", "pending")
    ann["verification_note"] = result.get("note", "")
    annotations[idx] = ann
    bid.ai_annotations = json.dumps(annotations)
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
