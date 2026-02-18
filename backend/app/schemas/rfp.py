from datetime import datetime
from typing import Optional
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
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    closing_date: Optional[datetime] = None

    class Config:
        from_attributes = True
