from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.rfp import RFP
from app.models.qa import VendorQA
from app.schemas.qa import VendorQACreate, VendorQAAnswer, VendorQAResponse

router = APIRouter(tags=["qa"])


@router.get("/rfps/{rfp_id}/qa", response_model=list[VendorQAResponse])
def list_rfp_qa(rfp_id: int, db: Session = Depends(get_db)):
    """List all Q&A for an RFP."""
    rfp = db.query(RFP).filter(RFP.id == rfp_id).first()
    if not rfp:
        raise HTTPException(status_code=404, detail="RFP not found")
    items = db.query(VendorQA).filter(VendorQA.rfp_id == rfp_id).order_by(VendorQA.created_at.desc()).all()
    return items


@router.post("/rfps/{rfp_id}/qa", response_model=VendorQAResponse)
def create_qa(rfp_id: int, payload: VendorQACreate, db: Session = Depends(get_db)):
    """Submit a question (vendor perspective)."""
    rfp = db.query(RFP).filter(RFP.id == rfp_id).first()
    if not rfp:
        raise HTTPException(status_code=404, detail="RFP not found")
    qa = VendorQA(
        rfp_id=rfp_id,
        vendor_name=payload.vendor_name,
        question=payload.question,
        status="Unanswered",
    )
    db.add(qa)
    db.commit()
    db.refresh(qa)
    return qa


@router.patch("/qa/{qa_id}", response_model=VendorQAResponse)
def answer_qa(qa_id: int, payload: VendorQAAnswer, db: Session = Depends(get_db)):
    """Answer a question (Bid Manager)."""
    qa = db.query(VendorQA).filter(VendorQA.id == qa_id).first()
    if not qa:
        raise HTTPException(status_code=404, detail="Q&A not found")
    qa.answer = payload.answer
    qa.status = "Answered"
    db.commit()
    db.refresh(qa)
    return qa
