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


class BidReEvaluateBody(BaseModel):
    human_notes_context: Optional[str] = None  # Reviewer notes passed to AI for re-evaluation


class VendorRepResponse(BaseModel):
    id: int
    name: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    designation: Optional[str] = None
    phone_verified: Optional[bool] = None

    class Config:
        from_attributes = True


class VendorResponse(BaseModel):
    id: int
    name: str
    address: Optional[str] = None
    website: Optional[str] = None
    domain: Optional[str] = None
    website_verified: Optional[bool] = None
    representatives: List["VendorRepResponse"] = []

    class Config:
        from_attributes = True


class BidEvaluationHistoryResponse(BaseModel):
    id: int
    bid_id: int
    ai_score: Optional[float] = None
    ai_reasoning: Optional[str] = None
    human_score: Optional[float] = None
    human_notes: Optional[str] = None
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class RFPRef(BaseModel):
    id: int
    title: str
    requirements: Optional[str] = None
    bids_locked: bool = False

    class Config:
        from_attributes = True


class BidDetailResponse(BidResponse):
    rfp: RFPRef
    vendor: Optional[VendorResponse] = None
    audit_events: List[BidAuditEventResponse] = []
    evaluation_history: List[BidEvaluationHistoryResponse] = []
