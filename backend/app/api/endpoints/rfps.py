import json
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.rfp import RFP, RFPStatus
from app.models.bid import Bid
from app.schemas.rfp import RFPCreate, RFPResponse, RFPPatch, ComparativeBidRow

router = APIRouter(prefix="/rfps", tags=["rfps"])


def _serialize_list(v: list | None) -> str | None:
    if v is None:
        return None
    return json.dumps(v) if v else None


@router.post("", response_model=RFPResponse)
def create_rfp(payload: RFPCreate, db: Session = Depends(get_db)):
    rfp = RFP(
        title=payload.title,
        description=payload.description or "",
        requirements=payload.requirements or "",
        budget=payload.budget,
        status=RFPStatus.DRAFT,
        process_type=payload.process_type or "Direct RFP",
        weight_technical=payload.weight_technical if payload.weight_technical is not None else 40.0,
        weight_financial=payload.weight_financial if payload.weight_financial is not None else 30.0,
        weight_compliance=payload.weight_compliance if payload.weight_compliance is not None else 30.0,
        publish_date=payload.publish_date,
        qa_deadline=payload.qa_deadline,
        submission_deadline=payload.submission_deadline,
        review_date=payload.review_date,
        decision_date=payload.decision_date,
        assigned_reviewers=_serialize_list(payload.assigned_reviewers),
        assigned_approvers=_serialize_list(payload.assigned_approvers),
    )
    db.add(rfp)
    db.commit()
    db.refresh(rfp)
    return rfp


@router.get("", response_model=list[RFPResponse])
def list_rfps(db: Session = Depends(get_db)):
    return db.query(RFP).order_by(RFP.created_at.desc()).all()


@router.get("/{rfp_id}", response_model=RFPResponse)
def get_rfp(rfp_id: int, db: Session = Depends(get_db)):
    rfp = db.query(RFP).filter(RFP.id == rfp_id).first()
    if not rfp:
        raise HTTPException(status_code=404, detail="RFP not found")
    return rfp


def _rfp_editable(rfp: RFP) -> bool:
    """True if RFP is in Draft and can be edited (title, requirements, weights, timeline, team)."""
    return getattr(rfp, "current_stage", None) == "Draft"


@router.patch("/{rfp_id}", response_model=RFPResponse)
def update_rfp(rfp_id: int, payload: RFPPatch, db: Session = Depends(get_db)):
    """Update RFP fields. Only Draft RFPs can have content updated; current_stage can be set to Published anytime."""
    rfp = db.query(RFP).filter(RFP.id == rfp_id).first()
    if not rfp:
        raise HTTPException(status_code=404, detail="RFP not found")
    if not _rfp_editable(rfp):
        # Allow only current_stage update when not Draft (e.g. for publish flow)
        if any([
            payload.title is not None, payload.description is not None, payload.requirements is not None,
            payload.budget is not None, payload.process_type is not None,
            payload.weight_technical is not None, payload.weight_financial is not None, payload.weight_compliance is not None,
            payload.publish_date is not None, payload.qa_deadline is not None, payload.submission_deadline is not None,
            payload.review_date is not None, payload.decision_date is not None,
            payload.assigned_reviewers is not None, payload.assigned_approvers is not None,
        ]):
            raise HTTPException(status_code=400, detail="Only Draft RFPs can be edited. Publish first to lock content.")
    if payload.current_stage is not None:
        rfp.current_stage = payload.current_stage
        if payload.current_stage == "Published":
            rfp.status = RFPStatus.PUBLISHED
    if payload.title is not None:
        rfp.title = payload.title
    if payload.description is not None:
        rfp.description = payload.description
    if payload.requirements is not None:
        rfp.requirements = payload.requirements
    if payload.budget is not None:
        rfp.budget = payload.budget
    if payload.process_type is not None:
        rfp.process_type = payload.process_type
    if payload.weight_technical is not None:
        rfp.weight_technical = payload.weight_technical
    if payload.weight_financial is not None:
        rfp.weight_financial = payload.weight_financial
    if payload.weight_compliance is not None:
        rfp.weight_compliance = payload.weight_compliance
    if payload.publish_date is not None:
        rfp.publish_date = payload.publish_date
    if payload.qa_deadline is not None:
        rfp.qa_deadline = payload.qa_deadline
    if payload.submission_deadline is not None:
        rfp.submission_deadline = payload.submission_deadline
    if payload.review_date is not None:
        rfp.review_date = payload.review_date
    if payload.decision_date is not None:
        rfp.decision_date = payload.decision_date
    if payload.assigned_reviewers is not None:
        rfp.assigned_reviewers = _serialize_list(payload.assigned_reviewers)
    if payload.assigned_approvers is not None:
        rfp.assigned_approvers = _serialize_list(payload.assigned_approvers)
    db.commit()
    db.refresh(rfp)
    return rfp


@router.patch("/{rfp_id}/lock", response_model=RFPResponse)
def lock_rfp_bids(rfp_id: int, db: Session = Depends(get_db)):
    """Lock bids for final decision. Once locked, reviewers cannot change notes or trigger re-evaluation."""
    rfp = db.query(RFP).filter(RFP.id == rfp_id).first()
    if not rfp:
        raise HTTPException(status_code=404, detail="RFP not found")
    rfp.bids_locked = True
    db.commit()
    db.refresh(rfp)
    return rfp


@router.get("/{rfp_id}/comparative", response_model=list[ComparativeBidRow])
def get_comparative_analysis(rfp_id: int, db: Session = Depends(get_db)):
    """Comparative analysis: bids past 'Uploaded' with vendor, AI score, human score, status for matrix view."""
    rfp = db.query(RFP).filter(RFP.id == rfp_id).first()
    if not rfp:
        raise HTTPException(status_code=404, detail="RFP not found")
    bids = (
        db.query(Bid)
        .filter(Bid.rfp_id == rfp_id, Bid.status != "Uploaded")
        .order_by(Bid.vendor_name, Bid.id)
        .all()
    )
    rows = []
    for b in bids:
        breakdown = None
        if b.ai_requirements_breakdown:
            try:
                breakdown = json.loads(b.ai_requirements_breakdown)
            except Exception:
                pass
        rows.append(ComparativeBidRow(
            bid_id=b.id,
            vendor_name=b.vendor_name,
            filename=b.filename,
            ai_score=b.ai_score,
            human_score=b.human_score,
            status=b.status,
            requirements_breakdown=breakdown,
        ))
    return rows
