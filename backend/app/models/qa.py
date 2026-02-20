from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.models.base import Base


class VendorQA(Base):
    __tablename__ = "vendor_qa"

    id = Column(Integer, primary_key=True, index=True)
    rfp_id = Column(Integer, ForeignKey("rfps.id", ondelete="CASCADE"), nullable=False, index=True)
    vendor_name = Column(String(255), nullable=False)
    question = Column(Text, nullable=False)
    answer = Column(Text, nullable=True)
    status = Column(String(50), default="Unanswered", nullable=False)  # "Unanswered" | "Answered"
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    rfp = relationship("RFP", backref="vendor_qa_list")
