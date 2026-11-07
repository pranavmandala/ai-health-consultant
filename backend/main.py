from typing import List, Optional
from urllib.parse import quote
from fastapi import FastAPI, Depends, HTTPException, UploadFile, File, Form
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, Response
from sqlalchemy import text
from sqlalchemy.orm import Session, defer
from backend.database import engine, Base, get_db
from backend import models
from backend.models import Documents, User
from backend.schemas import UserCreate, UserLogin, DocumentResponse
from backend.auth import hash_password, verify_password, create_token, get_current_user

MAX_FILE_SIZE = 10 * 1024 * 1024  # 10 MB
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

# DOCUMENTS
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

    # Read one byte past the limit so oversized files are caught without loading everything
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
    # defer(data) keeps the file bytes out of the list query
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