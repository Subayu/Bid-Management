from sqlalchemy import Boolean, Column, Integer, String, Text, DateTime, Float
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
    bids_locked = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    closing_date = Column(DateTime(timezone=True), nullable=True)

    # Workflow (POC v3)
    process_type = Column(String(50), default="Direct RFP", nullable=False)  # "Direct RFP" | "RFI -> RFP"
    current_stage = Column(String(50), default="Draft", nullable=False)  # "Draft" | "Published" | etc.
    weight_technical = Column(Float, default=40.0, nullable=False)
    weight_financial = Column(Float, default=30.0, nullable=False)
    weight_compliance = Column(Float, default=30.0, nullable=False)
    publish_date = Column(DateTime(timezone=True), nullable=True)
    qa_deadline = Column(DateTime(timezone=True), nullable=True)
    submission_deadline = Column(DateTime(timezone=True), nullable=True)
    review_date = Column(DateTime(timezone=True), nullable=True)
    decision_date = Column(DateTime(timezone=True), nullable=True)
    assigned_reviewers = Column(Text, nullable=True)  # JSON array of names/ids
    assigned_approvers = Column(Text, nullable=True)  # JSON array of names/ids

    bids = relationship("Bid", back_populates="rfp")
