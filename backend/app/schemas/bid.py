from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel


class BidAuditEventResponse(BaseModel):
    id: int
    bid_id: int
    action: str
    actor: Optional[str] = None
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class BidBase(BaseModel):
    filename: str
    file_path: str
    extracted_text: Optional[str] = None
    vendor_name: str


class BidCreate(BidBase):
    pass


class BidResponse(BidBase):
    id: int
    rfp_id: int
    status: str
    ai_score: Optional[float] = None
    ai_reasoning: Optional[str] = None
    ai_evaluation_source: Optional[str] = None
    ai_requirements_breakdown: Optional[str] = None  # JSON string
    human_score: Optional[float] = None
    human_notes: Optional[str] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class BidHumanUpdate(BaseModel):
    human_score: Optional[float] = None
    human_notes: Optional[str] = None


class BidStatusUpdate(BaseModel):
    status: str  # "Approved" | "Rejected"


class RFPRef(BaseModel):
    id: int
    title: str
    requirements: Optional[str] = None

    class Config:
        from_attributes = True


class BidDetailResponse(BidResponse):
    rfp: RFPRef
    audit_events: List[BidAuditEventResponse] = []
