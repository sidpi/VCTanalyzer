"""Security utilities (Master Plan §49).

MVP: password hashing + JWT bearer tokens. Kept behind small functions so
middleware (rate limiting, org scoping) can evolve independently.
"""

from datetime import datetime, timedelta, timezone

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt
from passlib.context import CryptContext
from sqlalchemy.orm import Session

from .config import get_settings
from .db import get_db
from . import models

_pwd = CryptContext(schemes=["pbkdf2_sha256"], deprecated="auto")
_bearer = HTTPBearer(auto_error=False)


def decode_token(token: str) -> dict | None:
    """Decode a JWT without FastAPI dependency machinery — used by endpoints
    that can't receive headers (e.g. <video src> streaming)."""
    from jose import JWTError, jwt

    settings = get_settings()
    try:
        return jwt.decode(
            token, settings.jwt_secret, algorithms=[settings.jwt_algorithm]
        )
    except JWTError:
        return None


def hash_password(plain: str) -> str:
    return _pwd.hash(plain)


def verify_password(plain: str, hashed: str) -> bool:
    return _pwd.verify(plain, hashed)


def create_access_token(user_id: str) -> str:
    settings = get_settings()
    expire = datetime.now(timezone.utc) + timedelta(
        minutes=settings.access_token_minutes
    )
    payload = {"sub": user_id, "exp": expire}
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def _unauthorized() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated"
    )


def get_current_user(
    creds: HTTPAuthorizationCredentials | None = Depends(_bearer),
    db: Session = Depends(get_db),
) -> models.User:
    if creds is None:
        raise _unauthorized()
    settings = get_settings()
    try:
        payload = jwt.decode(
            creds.credentials, settings.jwt_secret, algorithms=[settings.jwt_algorithm]
        )
    except JWTError as exc:
        raise _unauthorized() from exc
    user = db.get(models.User, payload.get("sub", ""))
    if user is None:
        raise _unauthorized()
    return user


def get_admin_user(user: models.User = Depends(get_current_user)) -> models.User:
    if not user.is_admin:
        raise HTTPException(status_code=403, detail="Admin only")
    return user


# ---------------------------------------------------------------------
# Organization scoping (Master Plan §51: every sensitive resource belongs
# to an organization; users only access their own org's data).
# ---------------------------------------------------------------------

def ensure_org_access(user: models.User, organization_id: str | None) -> None:
    """Raise unless the resource belongs to the user's org.

    - Admins bypass the check (platform staff, Master Plan §43).
    - None on the resource means unscoped/legacy/global — not org-private.
    """
    if user.is_admin:
        return
    if organization_id is None or organization_id != user.organization_id:
        raise HTTPException(status_code=403, detail="Not your organization")


def require_org_id(user: models.User) -> str:
    """Org id required to create org-scoped resources."""
    if user.is_admin:
        raise HTTPException(
            status_code=403,
            detail="Admins own no organization; create or join one first",
        )
    if not user.organization_id:
        raise HTTPException(
            status_code=403,
            detail="Join or create an organization before creating teams",
        )
    return user.organization_id
