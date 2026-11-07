from datetime import datetime
from typing import List, Optional
from pydantic import BaseModel, ConfigDict

class UserCreate(BaseModel):
    username: str
    password: str

class UserLogin(BaseModel):
    username: str
    password: str

class DocumentResponse(BaseModel):
    model_config = ConfigDict(from_attributes = True)

    id: int
    title: str
    description: Optional[str] = None
    filename: str
    content_type: str
    size: int
    uploaded_at: Optional[datetime] = None
    user_id: int

class ProfileData(BaseModel):
    conditions: List[str]
    medications: List[str]
    allergies: List[str]
    symptoms: List[str]
    other: List[str]

class ProfileConfirm(BaseModel):
    document_id: int
    profile: ProfileData

class ProfileResponse(BaseModel):
    profile: ProfileData
    updated_at: Optional[datetime] = None