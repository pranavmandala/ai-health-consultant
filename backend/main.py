from fastapi import FastAPI, Depends, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from sqlalchemy import text
from sqlalchemy.orm import Session
from backend.database import engine, Base, get_db
from backend import models
from backend.models import Documents, User
from backend.schemas import UserCreate, UserLogin
from backend.auth import hash_password, verify_password, create_token, get_current_user

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