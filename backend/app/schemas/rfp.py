from datetime import datetime
from typing import Optional, List, Any
from pydantic import BaseModel


class RFPBase(BaseModel):
    title: str
    description: str = ""
    requirements: str = ""
    budget: Optional[float] = None


class RFPCreate(RFPBase):
    pass


class RFPResponse(RFPBase):
    id: int
    status: str
    bids_locked: bool = False
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    closing_date: Optional[datetime] = None

    class Config:
        from_attributes = True


class ComparativeBidRow(BaseModel):
    """One row for Comparative Analysis matrix: vendor, scores, status."""
    bid_id: int
    vendor_name: str
    filename: str
    ai_score: Optional[float] = None
    human_score: Optional[float] = None
    status: str
    requirements_breakdown: Optional[List[Any]] = None  # parsed JSON
