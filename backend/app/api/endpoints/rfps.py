from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.rfp import RFP, RFPStatus
from app.schemas.rfp import RFPCreate, RFPResponse

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
