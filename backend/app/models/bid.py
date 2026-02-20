from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey, Float
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.models.base import Base


class Bid(Base):
    __tablename__ = "bids"

    id = Column(Integer, primary_key=True, index=True)
    rfp_id = Column(Integer, ForeignKey("rfps.id"), nullable=False, index=True)
    vendor_id = Column(Integer, ForeignKey("vendors.id"), nullable=True, index=True)
    filename = Column(String(255), nullable=False)
    file_path = Column(String(512), nullable=False)
    extracted_text = Column(Text)
    text_chunks = Column(Text, nullable=True)  # JSON array of chunks from upload, reused at evaluation
    evaluation_summary = Column(Text, nullable=True)  # short summary from upload, used for faster evaluation
    vendor_name = Column(String(255), nullable=False)  # denormalized from Vendor.name for display
    status = Column(String(50), default="Uploaded", nullable=False)
    ai_score = Column(Float, nullable=True)
    ai_reasoning = Column(Text, nullable=True)
    ai_evaluation_source = Column(String(50), nullable=True)  # "ollama" | "mock"
    last_eval_duration_seconds = Column(Float, nullable=True)  # elapsed time of last AI evaluation
    ai_requirements_breakdown = Column(Text, nullable=True)   # JSON array
    ai_annotations = Column(Text, nullable=True)  # JSON array of {quote, reason, reviewer_notes?} for areas needing review
    human_score = Column(Float, nullable=True)
    human_notes = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    rfp = relationship("RFP", back_populates="bids")
    vendor = relationship("Vendor", back_populates="bids")
    audit_events = relationship("BidAuditEvent", back_populates="bid", order_by="BidAuditEvent.created_at")
    evaluation_history = relationship(
        "BidEvaluationHistory", back_populates="bid", order_by="BidEvaluationHistory.created_at"
    )
