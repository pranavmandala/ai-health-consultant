import base64
import logging
import os
from concurrent.futures import ThreadPoolExecutor, TimeoutError as FutureTimeout
from typing import List, Optional
from urllib.parse import quote
from pydantic import ValidationError
from google import genai
from fastapi import FastAPI, Depends, HTTPException, UploadFile, File, Form
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, Response
from sqlalchemy import text
from sqlalchemy.orm import Session, defer
from backend.database import engine, Base, get_db
from backend import models
from backend.models import Documents, User, MedicalProfile
from backend.schemas import UserCreate, UserLogin, DocumentResponse, ProfileData, ProfileConfirm, ProfileResponse
from backend.auth import hash_password, verify_password, create_token, get_current_user

MAX_FILE_SIZE = 10 * 1024 * 1024
ALLOWED_EXTENSIONS = {".txt", ".json", ".pdf", ".png", ".jpg", ".jpeg", ".gif", ".webp"}
ALLOWED_CONTENT_TYPES = {
    "text/plain",
    "application/json",
    "application/pdf",
    "image/png",
    "image/jpeg",
    "image/gif",
    "image/webp",
}

GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-3.8-flash")
GEMINI_TIMEOUT_SECONDS = int(os.getenv("GEMINI_TIMEOUT_SECONDS", "60"))
_gemini_pool = ThreadPoolExecutor(max_workers = 4)
PROFILE_CATEGORIES = ["conditions", "medications", "allergies", "symptoms", "other"]
MAX_KEYWORD_LENGTH = 120
MAX_KEYWORDS_PER_CATEGORY = 50

logger = logging.getLogger("health")

ANALYSIS_PROMPT = (
    "You are extracting a patient's medical profile from the attached document. "
    "Return keywords or short phrases (1 to 6 words each) in these categories: "
    "conditions (diagnoses, health problems), medications (include dose if written), "
    "allergies, symptoms, and other (procedures, test results, vitals, anything medically "
    "relevant that fits nowhere else). Only include what the document explicitly states. "
    "Do not diagnose, infer or add advice. Use an empty list for a category with nothing."
)

app = FastAPI()
Base.metadata.create_all(bind = engine)
app.mount("/static", StaticFiles(directory="frontend"), name="static")

@app.get("/")
def serve_frontend():
    return FileResponse("frontend/index.html")

@app.post("/api/bugs/register")
def register_user(
    user_data : UserCreate,
    db: Session = Depends(get_db)
    ):

    existing_user = db.query(User).filter(User.username == user_data.username).first()
    if existing_user:
        raise HTTPException(
            status_code = 409,
            detail = "Username already exists"
        )

    hashed_password = hash_password(user_data.password)
    user = User(
        username = user_data.username,
        hashed_password = hashed_password)
    db.add(user)
    db.commit()
    db.refresh(user)

    return {
        "id" : user.id,
        "username" : user.username
    }

@app.post("/api/auth/login")
def login_user(
    user_data: UserLogin,
    db: Session = Depends(get_db)
    ):
    user = db.query(User).filter(
        User.username == user_data.username
    ).first()

    if user is None:
        raise HTTPException(
            status_code=404,
            detail="User not found"
        )

    if not verify_password(
        user_data.password,
        user.hashed_password
    ):
        raise HTTPException(
            status_code=401,
            detail="Invalid username or password"
        )

    token = create_token(user.id)

    return {
        "access_token": token,
        "token_type": "bearer"
    }

@app.post("/api/documents", response_model = DocumentResponse)
async def upload_document(
    file: UploadFile = File(...),
    title: Optional[str] = Form(None),
    description: Optional[str] = Form(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
    ):
    filename = file.filename or "document"
    extension = "." + filename.rsplit(".", 1)[-1].lower() if "." in filename else ""

    if extension not in ALLOWED_EXTENSIONS or file.content_type not in ALLOWED_CONTENT_TYPES:
        raise HTTPException(
            status_code = 415,
            detail = "Unsupported file type"
        )

    contents = await file.read(MAX_FILE_SIZE + 1)
    if len(contents) > MAX_FILE_SIZE:
        raise HTTPException(
            status_code = 413,
            detail = "File is too large (10 MB max)"
        )
    if len(contents) == 0:
        raise HTTPException(
            status_code = 400,
            detail = "File is empty"
        )

    document = Documents(
        title = (title or filename).strip()[:200],
        description = description,
        filename = filename[:255],
        content_type = file.content_type,
        size = len(contents),
        data = contents,
        user_id = current_user.id
    )
    db.add(document)
    db.commit()
    db.refresh(document)
    return document

@app.get("/api/documents", response_model = List[DocumentResponse])
def get_documents(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
    ):

    documents = (
        db.query(Documents)
        .options(defer(Documents.data))
        .filter(Documents.user_id == current_user.id)
        .order_by(Documents.uploaded_at.desc())
        .all()
    )
    return documents

@app.get("/api/documents/{doc_id}", response_model = DocumentResponse)
def get_document(
    doc_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
    ):
    document = (
        db.query(Documents)
        .options(defer(Documents.data))
        .filter(Documents.id == doc_id, Documents.user_id == current_user.id)
        .first()
    )
    if document:
        return document
    else:
        raise HTTPException(
            status_code = 404,
            detail = "Document not found"
        )

@app.get("/api/documents/{doc_id}/download")
def download_document(
    doc_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
    ):
    document = db.query(Documents).filter(
        Documents.id == doc_id,
        Documents.user_id == current_user.id
    ).first()
    if document:
        return Response(
            content = document.data,
            media_type = document.content_type,
            headers = {
                "Content-Disposition": f"attachment; filename*=UTF-8''{quote(document.filename)}"
            }
        )
    else:
        raise HTTPException(
            status_code = 404,
            detail = "Document not found"
        )

@app.delete("/api/documents/{doc_id}")
def delete_document(
    doc_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
    ):
    document = db.query(Documents).filter(
        Documents.id == doc_id,
        Documents.user_id == current_user.id
    ).first()
    if document:
        db.delete(document)
        db.commit()
        return {"message": "Document deleted"}
    else:
        raise HTTPException(
            status_code = 404,
            detail = "Document not found"
        )


def clean_keywords(items) -> List[str]:
    cleaned, seen = [], set()
    for item in items or []:
        word = " ".join(str(item).split())[:MAX_KEYWORD_LENGTH]
        if word and word.lower() not in seen:
            seen.add(word.lower())
            cleaned.append(word)
    return cleaned[:MAX_KEYWORDS_PER_CATEGORY]

def clean_profile(profile: ProfileData) -> dict:
    return {cat: clean_keywords(getattr(profile, cat)) for cat in PROFILE_CATEGORIES}

def run_gemini_analysis(document: Documents) -> ProfileData:
    if not os.getenv("GEMINI_API_KEY"):
        raise HTTPException(status_code = 503, detail = "AI analysis is not configured (missing GEMINI_API_KEY)")

    content_type = document.content_type
    if content_type == "application/pdf" or content_type.startswith("image/"):
        part_type = "document" if content_type == "application/pdf" else "image"
        parts = [{
            "type": part_type,
            "data": base64.b64encode(document.data).decode("utf-8"),
            "mime_type": content_type
        }]
    else:
        parts = [{"type": "text", "text": "Document contents:\n" + document.data.decode("utf-8", errors = "replace")}]
    parts.append({"type": "text", "text": ANALYSIS_PROMPT})

    def call_gemini():
        client = genai.Client()
        interaction = client.interactions.create(
            model = GEMINI_MODEL,
            input = parts,
            response_format = {
                "type": "text",
                "mime_type": "application/json",
                "schema": ProfileData.model_json_schema()
            }
        )
        return interaction.output_text

    try:
        output_text = _gemini_pool.submit(call_gemini).result(timeout = GEMINI_TIMEOUT_SECONDS)
        return ProfileData.model_validate_json(output_text)
    except FutureTimeout:
        logger.error("Gemini call took longer than %s seconds (model=%s)", GEMINI_TIMEOUT_SECONDS, GEMINI_MODEL)
        raise HTTPException(
            status_code = 504,
            detail = f"The AI took longer than {GEMINI_TIMEOUT_SECONDS} seconds to answer. Please try again."
        )
    except ValidationError:
        logger.exception("Gemini returned data that does not match the schema")
        raise HTTPException(status_code = 502, detail = "The AI returned an unreadable answer. Please try again.")
    except Exception:
        logger.exception("Gemini call failed")
        raise HTTPException(status_code = 502, detail = "AI analysis failed. Please try again in a moment.")

@app.post("/api/documents/{doc_id}/analyze", response_model = ProfileData)
def analyze_document(
    doc_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
    ):
    document = db.query(Documents).filter(
        Documents.id == doc_id,
        Documents.user_id == current_user.id
    ).first()
    if not document:
        raise HTTPException(
            status_code = 404,
            detail = "Document not found"
        )

    return clean_profile(run_gemini_analysis(document))

@app.post("/api/profile/confirm", response_model = ProfileResponse)
def confirm_profile(
    confirm_data: ProfileConfirm,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
    ):
    document = db.query(Documents).options(defer(Documents.data)).filter(
        Documents.id == confirm_data.document_id,
        Documents.user_id == current_user.id
    ).first()
    if not document:
        raise HTTPException(
            status_code = 404,
            detail = "Document not found"
        )

    new_data = clean_profile(confirm_data.profile)
    profile = db.query(MedicalProfile).filter(MedicalProfile.user_id == current_user.id).first()

    if profile:
        merged = {
            cat: clean_keywords(list(profile.data.get(cat, [])) + new_data[cat])
            for cat in PROFILE_CATEGORIES
        }
        profile.data = merged
    else:
        profile = MedicalProfile(user_id = current_user.id, data = new_data)
        db.add(profile)

    db.commit()
    db.refresh(profile)
    return {"profile": profile.data, "updated_at": profile.updated_at}

@app.get("/api/profile", response_model = ProfileResponse)
def get_profile(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
    ):
    profile = db.query(MedicalProfile).filter(MedicalProfile.user_id == current_user.id).first()
    if profile:
        return {"profile": profile.data, "updated_at": profile.updated_at}
    return {"profile": {cat: [] for cat in PROFILE_CATEGORIES}, "updated_at": None}