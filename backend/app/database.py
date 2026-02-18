from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from app.models.base import Base
import os

DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql://shield_user:shield_password@localhost:5432/shield_procure",
)

engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
