from sqlalchemy import Column, Integer, String, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.models.base import Base


class BidAuditEvent(Base):
    """Audit trail: who did what on a bid and when."""
    __tablename__ = "bid_audit_events"

    id = Column(Integer, primary_key=True, index=True)
    bid_id = Column(Integer, ForeignKey("bids.id", ondelete="CASCADE"), nullable=False, index=True)
    action = Column(String(50), nullable=False)  # created, evaluated, human_review, approved, rejected
    actor = Column(String(100), nullable=True)   # e.g. "Reviewer", "Approver" (persona for POC)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    bid = relationship("Bid", back_populates="audit_events")
