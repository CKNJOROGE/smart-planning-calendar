from fastapi import Depends, HTTPException, Request
from jose import jwt
from sqlalchemy.orm import Session
from .config import settings
from .db import get_db
from .models import User

SAFE_METHODS = {"GET", "HEAD", "OPTIONS", "TRACE"}


def _extract_bearer_token(request: Request) -> tuple[str | None, str | None]:
    auth_header = request.headers.get("Authorization", "")
    if auth_header.lower().startswith("bearer "):
        return auth_header.split(" ", 1)[1].strip(), "header"

    cookie_token = request.cookies.get(settings.AUTH_COOKIE_NAME)
    if cookie_token:
        return cookie_token, "cookie"

    return None, None

def get_current_user(
    request: Request,
    db: Session = Depends(get_db)
) -> User:
    token, token_source = _extract_bearer_token(request)
    if not token:
        raise HTTPException(status_code=401, detail="Invalid or expired token")

    try:
        payload = jwt.decode(token, settings.JWT_SECRET, algorithms=[settings.JWT_ALGORITHM])
        email = payload.get("sub")
        if not email:
            raise ValueError("Missing subject")
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid or expired token")

    if token_source == "cookie" and request.method.upper() not in SAFE_METHODS:
        csrf_expected = payload.get("csrf")
        csrf_provided = request.headers.get(settings.CSRF_HEADER_NAME, "")
        if not csrf_expected or csrf_provided != csrf_expected:
            raise HTTPException(status_code=403, detail="Missing or invalid CSRF token")

    user = db.query(User).filter(User.email == email).first()
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return user

def require_admin(user: User = Depends(get_current_user)) -> User:
    if user.role not in {"admin", "ceo"}:
        raise HTTPException(status_code=403, detail="Admin only")
    return user


def require_leave_approver(user: User = Depends(get_current_user)) -> User:
    if user.role not in {"admin", "ceo", "supervisor"}:
        raise HTTPException(status_code=403, detail="Approvers only")
    return user
