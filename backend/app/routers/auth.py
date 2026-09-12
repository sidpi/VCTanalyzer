"""Auth endpoints (/auth, /users — Master Plan §41)."""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from .. import models, schemas, security
from ..db import get_db

router = APIRouter(tags=["auth"])


@router.post("/auth/register", response_model=schemas.TokenOut, status_code=201)
def register(payload: schemas.RegisterIn, db: Session = Depends(get_db)):
    exists = (
        db.query(models.User).filter(models.User.email == payload.email).first()
    )
    if exists:
        raise HTTPException(status_code=409, detail="Email already registered")

    org_id = None
    if payload.organization_name:
        org = models.Organization(name=payload.organization_name)
        db.add(org)
        db.flush()
        org_id = org.id

    user = models.User(
        email=payload.email,
        password_hash=security.hash_password(payload.password),
        display_name=payload.display_name,
        organization_id=org_id,
    )
    db.add(user)
    db.commit()

    return schemas.TokenOut(
        access_token=security.create_access_token(user.id),
        user_id=user.id,
        organization_id=org_id,
    )


@router.post("/auth/login", response_model=schemas.TokenOut)
def login(payload: schemas.LoginIn, db: Session = Depends(get_db)):
    user = (
        db.query(models.User).filter(models.User.email == payload.email).first()
    )
    if not user or not security.verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid email or password")

    return schemas.TokenOut(
        access_token=security.create_access_token(user.id),
        user_id=user.id,
        organization_id=user.organization_id,
    )


@router.get("/users/me", response_model=schemas.UserOut)
def me(user: models.User = Depends(security.get_current_user)):
    return user
