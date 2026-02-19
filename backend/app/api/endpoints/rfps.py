import json
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.rfp import RFP, RFPStatus
from app.models.bid import Bid
from app.schemas.rfp import RFPCreate, RFPResponse, ComparativeBidRow

router = APIRouter(prefix="/rfps", tags=["rfps"])


@router.post("", response_model=RFPResponse)
def create_rfp(payload: RFPCreate, db: Session = Depends(get_db)):
    rfp = RFP(
        title=payload.title,
        description=payload.description,
        requirements=payload.requirements,
        budget=payload.budget,
        status=RFPStatus.DRAFT,
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
