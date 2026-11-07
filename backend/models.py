from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey, LargeBinary, JSON
from sqlalchemy.sql import func
from backend.database import Base

class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key = True, index = True)
    username = Column(String(100), unique = True, nullable = False)
    hashed_password = Column(String(255), nullable = False)

class Documents(Base):
    __tablename__ = "documents"
    id = Column(Integer, primary_key = True, index = True)
    title = Column(String(200), nullable = False)
    description = Column(Text)
    filename = Column(String(255), nullable = False)
    content_type = Column(String(100), nullable = False)
    size = Column(Integer, nullable = False)
    data = Column(LargeBinary, nullable = False)
    uploaded_at = Column(DateTime(timezone = True), server_default = func.now())
    user_id = Column(Integer, ForeignKey("users.id"), nullable = False)

class MedicalProfile(Base):
    __tablename__ = "medical_profiles"
    id = Column(Integer, primary_key = True, index = True)
    user_id = Column(Integer, ForeignKey("users.id"), unique = True, nullable = False)
    data = Column(JSON, nullable = False)
    updated_at = Column(DateTime(timezone = True), server_default = func.now(), onupdate = func.now())