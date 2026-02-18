from sqlalchemy import Column, Integer, String, Text, DateTime, Float
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.models.base import Base


class RFPStatus:
    DRAFT = "draft"
    PUBLISHED = "published"
    CLOSED = "closed"


class RFP(Base):
    __tablename__ = "rfps"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String(255), nullable=False)
    description = Column(Text)
    requirements = Column(Text)
    budget = Column(Float, nullable=True)
    status = Column(String(50), default=RFPStatus.DRAFT, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    closing_date = Column(DateTime(timezone=True), nullable=True)

    bids = relationship("Bid", back_populates="rfp")
