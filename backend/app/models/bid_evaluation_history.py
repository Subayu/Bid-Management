from sqlalchemy import Column, Integer, Text, DateTime, ForeignKey, Float
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.models.base import Base


class BidEvaluationHistory(Base):
    """History of past evaluations when re-evaluation is triggered."""
    __tablename__ = "bid_evaluation_history"

    id = Column(Integer, primary_key=True, index=True)
    bid_id = Column(Integer, ForeignKey("bids.id", ondelete="CASCADE"), nullable=False, index=True)
    ai_score = Column(Float, nullable=True)
    ai_reasoning = Column(Text, nullable=True)
    ai_requirements_breakdown = Column(Text, nullable=True)  # JSON
    human_score = Column(Float, nullable=True)
    human_notes = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    bid = relationship("Bid", back_populates="evaluation_history")
