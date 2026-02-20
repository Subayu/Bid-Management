from datetime import datetime
from typing import Optional
from pydantic import BaseModel


class VendorQABase(BaseModel):
    vendor_name: str
    question: str


class VendorQACreate(VendorQABase):
    pass


class VendorQAAnswer(BaseModel):
    answer: str


class VendorQAResponse(BaseModel):
    id: int
    rfp_id: int
    vendor_name: str
    question: str
    answer: Optional[str] = None
    status: str
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True
