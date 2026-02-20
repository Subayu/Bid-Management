import json
from datetime import datetime
from typing import Optional, List, Any
from pydantic import BaseModel, field_validator


class RFPBase(BaseModel):
    title: str
    description: str = ""
    requirements: str = ""
    budget: Optional[float] = None


class RFPCreate(RFPBase):
    process_type: Optional[str] = "Direct RFP"
    weight_technical: Optional[float] = 40.0
    weight_financial: Optional[float] = 30.0
    weight_compliance: Optional[float] = 30.0
    publish_date: Optional[datetime] = None
    qa_deadline: Optional[datetime] = None
    submission_deadline: Optional[datetime] = None
    review_date: Optional[datetime] = None
    decision_date: Optional[datetime] = None
    assigned_reviewers: Optional[List[str]] = None
    assigned_approvers: Optional[List[str]] = None


class RFPPatch(BaseModel):
    current_stage: Optional[str] = None
    title: Optional[str] = None
    description: Optional[str] = None
    requirements: Optional[str] = None
    budget: Optional[float] = None
    process_type: Optional[str] = None
    weight_technical: Optional[float] = None
    weight_financial: Optional[float] = None
    weight_compliance: Optional[float] = None
    publish_date: Optional[datetime] = None
    qa_deadline: Optional[datetime] = None
    submission_deadline: Optional[datetime] = None
    review_date: Optional[datetime] = None
    decision_date: Optional[datetime] = None
    assigned_reviewers: Optional[List[str]] = None
    assigned_approvers: Optional[List[str]] = None


class RFPResponse(RFPBase):
    id: int
    status: str
    bids_locked: bool = False
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    closing_date: Optional[datetime] = None
    process_type: Optional[str] = "Direct RFP"
    current_stage: Optional[str] = "Draft"
    weight_technical: Optional[float] = 40.0
    weight_financial: Optional[float] = 30.0
    weight_compliance: Optional[float] = 30.0
    publish_date: Optional[datetime] = None
    qa_deadline: Optional[datetime] = None
    submission_deadline: Optional[datetime] = None
    review_date: Optional[datetime] = None
    decision_date: Optional[datetime] = None
    assigned_reviewers: Optional[List[str]] = None
    assigned_approvers: Optional[List[str]] = None

    class Config:
        from_attributes = True

    @field_validator("assigned_reviewers", "assigned_approvers", mode="before")
    @classmethod
    def parse_json_list(cls, v: Any) -> Optional[List[str]]:
        if v is None:
            return None
        if isinstance(v, list):
            return v
        if isinstance(v, str):
            try:
                out = json.loads(v)
                return out if isinstance(out, list) else None
            except (TypeError, json.JSONDecodeError):
                return None
        return None


class ComparativeBidRow(BaseModel):
    """One row for Comparative Analysis matrix: vendor, scores, status."""
    bid_id: int
    vendor_name: str
    filename: str
    ai_score: Optional[float] = None
    human_score: Optional[float] = None
    status: str
    requirements_breakdown: Optional[List[Any]] = None  # parsed JSON
