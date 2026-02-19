from sqlalchemy import Column, Integer, String, Text, Boolean, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.models.base import Base


class Vendor(Base):
    __tablename__ = "vendors"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False, index=True)
    address = Column(Text, nullable=True)
    website = Column(String(512), nullable=True)
    domain = Column(String(255), nullable=True)  # extracted from email/website
    website_verified = Column(Boolean, nullable=True)  # True=live, False=unreachable, None=not checked
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    representatives = relationship("VendorRep", back_populates="vendor")
    bids = relationship("Bid", back_populates="vendor")


class VendorRep(Base):
    __tablename__ = "vendor_reps"

    id = Column(Integer, primary_key=True, index=True)
    vendor_id = Column(Integer, ForeignKey("vendors.id", ondelete="CASCADE"), nullable=False, index=True)
    name = Column(String(255), nullable=True)
    email = Column(String(255), nullable=True)
    phone = Column(String(64), nullable=True)
    designation = Column(String(255), nullable=True)
    phone_verified = Column(Boolean, nullable=True)  # True=valid format, False=invalid, None=not checked
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    vendor = relationship("Vendor", back_populates="representatives")
