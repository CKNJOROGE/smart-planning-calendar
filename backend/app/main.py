from datetime import datetime, date, timedelta
from typing import List, Optional
from pathlib import Path
from uuid import uuid4

from fastapi import FastAPI, Depends, HTTPException, WebSocket, WebSocketDisconnect, Query, UploadFile, File, Request, Form, Header
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from fastapi.responses import FileResponse, Response
from fastapi.security import OAuth2PasswordRequestForm
from starlette.middleware.base import BaseHTTPMiddleware
from jose import jwt
from sqlalchemy import or_
from sqlalchemy.orm import Session

from .db import Base, engine, get_db
from .models import User, Event, CompanyDocument, ClientAccount, ClientTask, DailyActivity
from .schemas import (
    TokenResponse,
    FirstAdminCreate,
    UserOut,
    UserProfileOut,
    UserProfileUpdate,
    UserCreate,
    AdminUserProfileOut,
    AdminUserProfileUpdate,
    EventCreate,
    EventUpdate,
    EventOut,
    LeaveRequestCreate,
    LeaveRejectRequest,
    LeaveBalanceOut,
    CompanyDocumentOut,
    ClientAccountCreate,
    ClientAccountOut,
    ClientTaskCreate,
    ClientTaskUpdate,
    ClientTaskOut,
    DailyActivityCreate,
    DailyActivityUpdate,
    DailyActivityOut,
    TaskReminderOut,
    DashboardOverviewOut,
)
from .security import verify_password, create_access_token, hash_password
from .deps import get_current_user, require_admin, require_leave_approver
from .config import settings

from .ws_manager import ConnectionManager
from .leave_service import compute_leave_balance, validate_leave_request
from .storage import object_storage

app = FastAPI(title="Smart Planning Calendar API")
ws_manager = ConnectionManager()
UPLOADS_DIR = Path(__file__).resolve().parents[1] / "uploads"
AVATARS_DIR = UPLOADS_DIR / "avatars"
DOCUMENTS_DIR = UPLOADS_DIR / "documents"
LIBRARY_DIR = UPLOADS_DIR / "library"

PROFILE_DOCUMENT_FIELDS = {
    "id_copy": "id_copy_url",
    "kra_copy": "kra_copy_url",
    "offer_letter": "offer_letter_url",
    "employment_contract": "employment_contract_url",
    "disciplinary_records": "disciplinary_records_url",
    "bio_data_form": "bio_data_form_url",
    "bank_details_form": "bank_details_form_url",
}

LIBRARY_CATEGORIES = {
    "Contract",
    "Recruitment",
    "Onboarding",
    "Performance Management",
    "Disciplinary Management",
    "Training Template",
}

AVATARS_DIR.mkdir(parents=True, exist_ok=True)
DOCUMENTS_DIR.mkdir(parents=True, exist_ok=True)
LIBRARY_DIR.mkdir(parents=True, exist_ok=True)


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Referrer-Policy"] = "same-origin"
        response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
        # Frontend is hosted on a different site (vercel.app), so uploaded media
        # must be embeddable cross-site to render in <img> and file viewers.
        if request.url.path.startswith("/avatars/") or request.url.path.startswith("/files/"):
            response.headers["Cross-Origin-Resource-Policy"] = "cross-origin"
        else:
            response.headers["Cross-Origin-Resource-Policy"] = "same-site"
        return response

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.add_middleware(SecurityHeadersMiddleware)
app.add_middleware(
    TrustedHostMiddleware,
    allowed_hosts=settings.trusted_hosts_list or ["localhost", "127.0.0.1"],
)


def _assert_startup_settings():
    if settings.JWT_SECRET == "CHANGE_THIS_TO_A_LONG_RANDOM_STRING" or len(settings.JWT_SECRET) < 32:
        raise RuntimeError("JWT_SECRET is not safe. Set a long random value (>=32 chars).")

    if settings.is_production:
        if not settings.FIRST_ADMIN_BOOTSTRAP_TOKEN:
            raise RuntimeError("FIRST_ADMIN_BOOTSTRAP_TOKEN is required in production.")
        if not settings.cors_origins_list:
            raise RuntimeError("CORS_ORIGINS must be configured in production.")
        if not settings.trusted_hosts_list:
            raise RuntimeError("TRUSTED_HOSTS must be configured in production.")


@app.on_event("startup")
def startup():
    _assert_startup_settings()
    if settings.ENABLE_AUTO_SCHEMA_CREATE:
        Base.metadata.create_all(bind=engine)


@app.get("/healthz")
def healthz():
    return {"status": "ok"}


@app.get("/files/documents/{file_name}")
def get_profile_document_file(
    file_name: str,
    db: Session = Depends(get_db),
    current: User = Depends(get_current_user),
):
    profile_fields = [getattr(User, f) for f in PROFILE_DOCUMENT_FIELDS.values()]
    like_filters = [
        field.like(f"%/uploads/documents/{file_name}") | field.like(f"%/files/documents/{file_name}")
        for field in profile_fields
    ]
    owner = db.query(User).filter(or_(*like_filters)).first()
    if not owner:
        raise HTTPException(status_code=404, detail="File not found")
    if current.role != "admin" and current.id != owner.id:
        raise HTTPException(status_code=403, detail="Not allowed")

    path = DOCUMENTS_DIR / file_name
    return _serve_local_or_object(path, _document_key(file_name))


@app.get("/files/library/{file_name}")
def get_library_document_file(
    file_name: str,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    exists = (
        db.query(CompanyDocument)
        .filter(
            CompanyDocument.file_url.like(f"%/uploads/library/{file_name}")
            | CompanyDocument.file_url.like(f"%/files/library/{file_name}")
        )
        .first()
        is not None
    )
    if not exists:
        raise HTTPException(status_code=404, detail="File not found")

    path = LIBRARY_DIR / file_name
    return _serve_local_or_object(path, _library_key(file_name))


@app.get("/avatars/{file_name}")
def get_avatar_file(file_name: str):
    path = AVATARS_DIR / file_name
    return _serve_local_or_object(path, _avatar_key(file_name))


# -------------------------
# WebSocket
# -------------------------
@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket, token: str = Query(default="")):
    # Auth via token query param: ws://127.0.0.1:8000/ws?token=JWT
    if not token:
        await websocket.close(code=1008)
        return

    try:
        payload = jwt.decode(token, settings.JWT_SECRET, algorithms=[settings.JWT_ALGORITHM])
        email = payload.get("sub")
        if not email:
            raise ValueError("Missing subject")
    except Exception:
        await websocket.close(code=1008)
        return

    # Optional: verify user exists (cheap)
    db = next(get_db())
    try:
        user = db.query(User).filter(User.email == email).first()
        if not user:
            await websocket.close(code=1008)
            return
    finally:
        db.close()

    await ws_manager.connect(websocket)
    try:
        # Keep connection open; client doesn't need to send messages
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        await ws_manager.disconnect(websocket)
    except Exception:
        await ws_manager.disconnect(websocket)


async def broadcast_events_changed(action: str, event_id: Optional[int] = None):
    await ws_manager.broadcast_json(
        {"type": "events_changed", "action": action, "event_id": event_id}
    )


def _avatar_key(file_name: str) -> str:
    return f"avatars/{file_name}"


def _document_key(file_name: str) -> str:
    return f"documents/{file_name}"


def _library_key(file_name: str) -> str:
    return f"library/{file_name}"


def _extract_file_name_from_url(url: str, prefixes: list[str]) -> Optional[str]:
    for prefix in prefixes:
        if url.startswith(prefix):
            return url[len(prefix):]
    return None


def _serve_local_or_object(path: Path, object_key: str) -> Response:
    if path.exists() and path.is_file():
        return FileResponse(path)
    item = object_storage.get_bytes(object_key)
    if not item:
        raise HTTPException(status_code=404, detail="File not found")
    content, content_type = item
    return Response(content=content, media_type=content_type or "application/octet-stream")


def _is_admin_user(db: Session, user_id: Optional[int]) -> bool:
    if user_id is None:
        return False
    u = db.query(User).filter(User.id == user_id).first()
    return bool(u and u.role == "admin")


def _is_supervisor_user(db: Session, user_id: Optional[int]) -> bool:
    if user_id is None:
        return False
    u = db.query(User).filter(User.id == user_id).first()
    return bool(u and u.role == "supervisor")


def _is_valid_role(role: Optional[str]) -> bool:
    return (role or "").strip().lower() in {"employee", "admin", "supervisor"}


async def _upload_profile_document(
    request: Request,
    db: Session,
    user: User,
    doc_type: str,
    file: UploadFile,
) -> User:
    field_name = PROFILE_DOCUMENT_FIELDS.get(doc_type)
    if not field_name:
        raise HTTPException(status_code=400, detail="Unsupported document type")

    ext = Path(file.filename or "").suffix.lower()
    allowed_ext = {".pdf", ".jpg", ".jpeg", ".png", ".webp", ".doc", ".docx"}
    if ext not in allowed_ext:
        ext = ".pdf"

    filename = f"{user.id}_{doc_type}_{uuid4().hex}{ext}"

    allowed_types = {
        "application/pdf",
        "image/jpeg",
        "image/png",
        "image/webp",
        "application/msword",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    }
    if file.content_type and file.content_type not in allowed_types:
        raise HTTPException(status_code=400, detail="Unsupported document content type")

    content = await file.read()
    if len(content) > settings.PROFILE_DOC_MAX_BYTES:
        raise HTTPException(status_code=400, detail=f"Document must be <= {settings.PROFILE_DOC_MAX_BYTES // (1024 * 1024)}MB")
    object_storage.upload_bytes(_document_key(filename), content, file.content_type)
    if not object_storage.enabled:
        destination = DOCUMENTS_DIR / filename
        destination.write_bytes(content)

    base_url = str(request.base_url).rstrip("/")
    new_url = f"{base_url}/files/documents/{filename}"
    old_url = getattr(user, field_name) or ""
    setattr(user, field_name, new_url)

    old_prefixes = [
        f"{base_url}/uploads/documents/",
        f"{base_url}/files/documents/",
        "/uploads/documents/",
        "/files/documents/",
    ]
    old_name = _extract_file_name_from_url(old_url, old_prefixes)
    if old_name:
        object_storage.delete_object(_document_key(old_name))
        old_file = DOCUMENTS_DIR / old_name
        if old_file.exists() and old_file.is_file():
            old_file.unlink()

    db.commit()
    db.refresh(user)
    return user


# -------------------------
# Admin bootstrap
# -------------------------
@app.post("/admin/create-first-admin", response_model=UserOut)
def create_first_admin(
    payload: FirstAdminCreate,
    db: Session = Depends(get_db),
    bootstrap_token: Optional[str] = Header(default=None, alias="X-Bootstrap-Token"),
):
    if not settings.ALLOW_CREATE_FIRST_ADMIN:
        raise HTTPException(status_code=403, detail="First-admin bootstrap is disabled")
    if settings.FIRST_ADMIN_BOOTSTRAP_TOKEN and bootstrap_token != settings.FIRST_ADMIN_BOOTSTRAP_TOKEN:
        raise HTTPException(status_code=403, detail="Invalid bootstrap token")

    existing_admin = db.query(User).filter(User.role == "admin").first()
    if existing_admin:
        raise HTTPException(status_code=400, detail="Admin already exists")
    if db.query(User).filter(User.email == payload.email.lower()).first():
        raise HTTPException(status_code=400, detail="Email already exists")

    admin_name = (payload.name or "").strip()
    if not admin_name:
        raise HTTPException(status_code=400, detail="Name is required")
    if len(payload.password or "") < 12:
        raise HTTPException(status_code=400, detail="Password must be at least 12 characters")

    admin = User(
        name=admin_name,
        email=payload.email.lower(),
        password_hash=hash_password(payload.password),
        role="admin",
        hire_date=date.today(),
    )
    db.add(admin)
    db.commit()
    db.refresh(admin)
    return admin


# -------------------------
# Auth
# -------------------------
@app.post("/auth/login", response_model=TokenResponse)
def login(form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == form_data.username).first()
    if not user or not verify_password(form_data.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Wrong email or password")

    token = create_access_token(subject=user.email)
    return {"access_token": token, "token_type": "bearer"}


@app.get("/me", response_model=UserOut)
def get_me(user: User = Depends(get_current_user)):
    return user


# -------------------------
# Users (admin only list/create)
# -------------------------
@app.get("/users", response_model=List[UserOut])
def list_users(db: Session = Depends(get_db), _: User = Depends(require_admin)):
    return db.query(User).order_by(User.name.asc()).all()


@app.post("/users", response_model=UserOut)
def create_user(
    payload: UserCreate,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    if db.query(User).filter(User.email == payload.email).first():
        raise HTTPException(status_code=400, detail="Email already exists")
    if not _is_valid_role(payload.role):
        raise HTTPException(status_code=400, detail="role must be one of: employee, supervisor, admin")

    u = User(
        name=payload.name,
        email=payload.email,
        password_hash=hash_password(payload.password),
        role=payload.role.lower(),
        avatar_url=payload.avatar_url,
        phone=payload.phone,
        department=payload.department,
        designation=payload.designation,
        gender=payload.gender,
        address=payload.address,
        hire_date=payload.hire_date or date.today(),
    )

    db.add(u)
    db.commit()
    db.refresh(u)
    return u


# -------------------------
# Profiles
# -------------------------
@app.get("/users/{user_id}/profile", response_model=UserProfileOut)
def get_user_profile(
    user_id: int,
    db: Session = Depends(get_db),
    current: User = Depends(get_current_user),
):
    if current.role != "admin" and current.id != user_id:
        raise HTTPException(status_code=403, detail="Not allowed")

    u = db.query(User).filter(User.id == user_id).first()
    if not u:
        raise HTTPException(status_code=404, detail="User not found")
    return u


@app.patch("/users/{user_id}/profile", response_model=UserProfileOut)
def update_user_profile(
    user_id: int,
    payload: UserProfileUpdate,
    db: Session = Depends(get_db),
    current: User = Depends(get_current_user),
):
    if current.role != "admin" and current.id != user_id:
        raise HTTPException(status_code=403, detail="Not allowed")

    u = db.query(User).filter(User.id == user_id).first()
    if not u:
        raise HTTPException(status_code=404, detail="User not found")

    incoming = payload.dict(exclude_unset=True)

    if "name" in incoming:
        name = (incoming["name"] or "").strip()
        if not name:
            raise HTTPException(status_code=400, detail="Name cannot be empty")
        incoming["name"] = name

    for k, v in incoming.items():
        setattr(u, k, v)

    db.commit()
    db.refresh(u)
    return u


@app.delete("/users/{user_id}")
def delete_user(
    user_id: int,
    db: Session = Depends(get_db),
    current: User = Depends(require_admin),
):
    u = db.query(User).filter(User.id == user_id).first()
    if not u:
        raise HTTPException(status_code=404, detail="User not found")
    if current.id == u.id:
        raise HTTPException(status_code=400, detail="You cannot delete your own account")

    if u.role == "admin":
        admin_count = db.query(User).filter(User.role == "admin").count()
        if admin_count <= 1:
            raise HTTPException(status_code=400, detail="Cannot delete the last admin user")

    blockers: list[str] = []

    owned_events = db.query(Event).filter(Event.user_id == u.id).count()
    if owned_events:
        blockers.append(f"owns {owned_events} event(s)")

    acted_events = db.query(Event).filter(
        (Event.requested_by_id == u.id)
        | (Event.approved_by_id == u.id)
        | (Event.first_approved_by_id == u.id)
        | (Event.second_approved_by_id == u.id)
    ).count()
    if acted_events:
        blockers.append(f"is referenced in {acted_events} approval/request field(s)")

    uploaded_docs = db.query(CompanyDocument).filter(CompanyDocument.uploaded_by_id == u.id).count()
    if uploaded_docs:
        blockers.append(f"uploaded {uploaded_docs} library document(s)")

    approver_refs = db.query(User).filter(
        (User.first_approver_id == u.id) | (User.second_approver_id == u.id)
    ).count()
    if approver_refs:
        blockers.append(f"is assigned as approver for {approver_refs} user(s)")

    if blockers:
        raise HTTPException(
            status_code=400,
            detail="Cannot delete user: " + "; ".join(blockers),
        )

    db.delete(u)
    db.commit()
    return {"ok": True}


@app.post("/users/me/avatar", response_model=UserProfileOut)
async def upload_my_avatar(
    request: Request,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current: User = Depends(get_current_user),
):
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="Only image uploads are allowed")

    ext = Path(file.filename or "").suffix.lower()
    if ext not in {".jpg", ".jpeg", ".png", ".gif", ".webp"}:
        ext = ".jpg"

    filename = f"{uuid4().hex}{ext}"

    content = await file.read()
    if len(content) > settings.AVATAR_MAX_BYTES:
        raise HTTPException(status_code=400, detail=f"Image must be <= {settings.AVATAR_MAX_BYTES // (1024 * 1024)}MB")

    object_storage.upload_bytes(_avatar_key(filename), content, file.content_type)
    if not object_storage.enabled:
        destination = AVATARS_DIR / filename
        destination.write_bytes(content)

    old_avatar = current.avatar_url or ""
    base_url = str(request.base_url).rstrip("/")
    current.avatar_url = f"{base_url}/avatars/{filename}"

    old_prefixes = [
        f"{base_url}/uploads/avatars/",
        f"{base_url}/avatars/",
        "/uploads/avatars/",
        "/avatars/",
    ]
    old_name = _extract_file_name_from_url(old_avatar, old_prefixes)
    if old_name:
        object_storage.delete_object(_avatar_key(old_name))
        old_file = AVATARS_DIR / old_name
        if old_file.exists() and old_file.is_file():
            old_file.unlink()

    db.commit()
    db.refresh(current)
    return current


@app.post("/users/me/documents/{doc_type}", response_model=UserProfileOut)
async def upload_my_document(
    doc_type: str,
    request: Request,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current: User = Depends(get_current_user),
):
    if not file.filename:
        raise HTTPException(status_code=400, detail="Missing file")
    return await _upload_profile_document(request, db, current, doc_type, file)


@app.get("/admin/users/{user_id}/profile", response_model=AdminUserProfileOut)
def admin_get_user_profile(
    user_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    u = db.query(User).filter(User.id == user_id).first()
    if not u:
        raise HTTPException(status_code=404, detail="User not found")
    return u


@app.patch("/admin/users/{user_id}/profile", response_model=AdminUserProfileOut)
def admin_update_user_profile(
    user_id: int,
    payload: AdminUserProfileUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    u = db.query(User).filter(User.id == user_id).first()
    if not u:
        raise HTTPException(status_code=404, detail="User not found")

    incoming = payload.dict(exclude_unset=True)

    if "name" in incoming:
        name = (incoming["name"] or "").strip()
        if not name:
            raise HTTPException(status_code=400, detail="Name cannot be empty")
        incoming["name"] = name

    if "email" in incoming:
        email = (incoming["email"] or "").strip().lower()
        exists = db.query(User).filter(User.email == email, User.id != user_id).first()
        if exists:
            raise HTTPException(status_code=400, detail="Email already exists")
        incoming["email"] = email
    if "role" in incoming:
        role = (incoming["role"] or "").strip().lower()
        if not _is_valid_role(role):
            raise HTTPException(status_code=400, detail="role must be one of: employee, supervisor, admin")
        incoming["role"] = role

    first_approver_id = incoming.get("first_approver_id", u.first_approver_id)
    second_approver_id = incoming.get("second_approver_id", u.second_approver_id)
    requires_two_step = incoming.get(
        "require_two_step_leave_approval",
        u.require_two_step_leave_approval,
    )

    if first_approver_id is not None and not _is_supervisor_user(db, first_approver_id):
        raise HTTPException(status_code=400, detail="first_approver_id must be a supervisor user")
    if second_approver_id is not None and not _is_admin_user(db, second_approver_id):
        raise HTTPException(status_code=400, detail="second_approver_id must be an admin user")

    if first_approver_id is not None and second_approver_id is not None and first_approver_id == second_approver_id:
        raise HTTPException(status_code=400, detail="first_approver_id and second_approver_id must be different")

    if requires_two_step and (first_approver_id is None or second_approver_id is None):
        raise HTTPException(
            status_code=400,
            detail="Two-step leave approval requires both first_approver_id (supervisor) and second_approver_id (admin)",
        )

    for k, v in incoming.items():
        setattr(u, k, v)

    db.commit()
    db.refresh(u)
    return u


@app.post("/admin/users/{user_id}/documents/{doc_type}", response_model=AdminUserProfileOut)
async def admin_upload_user_document(
    user_id: int,
    doc_type: str,
    request: Request,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    u = db.query(User).filter(User.id == user_id).first()
    if not u:
        raise HTTPException(status_code=404, detail="User not found")
    if not file.filename:
        raise HTTPException(status_code=400, detail="Missing file")
    return await _upload_profile_document(request, db, u, doc_type, file)


# -------------------------
# Company Library
# -------------------------
@app.get("/library/documents", response_model=List[CompanyDocumentOut])
def list_company_documents(
    category: Optional[str] = None,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    q = db.query(CompanyDocument)
    if category:
        q = q.filter(CompanyDocument.category == category)
    docs = q.order_by(CompanyDocument.created_at.desc()).all()
    for d in docs:
        _ = d.uploaded_by
    return docs


@app.post("/library/documents", response_model=CompanyDocumentOut)
async def upload_company_document(
    request: Request,
    title: str = Form(...),
    category: str = Form(...),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    normalized_title = (title or "").strip()
    normalized_category = (category or "").strip()
    if not normalized_title:
        raise HTTPException(status_code=400, detail="Title is required")
    if normalized_category not in LIBRARY_CATEGORIES:
        raise HTTPException(status_code=400, detail="Invalid library category")
    if not file.filename:
        raise HTTPException(status_code=400, detail="Missing file")

    ext = Path(file.filename).suffix.lower()
    allowed_ext = {".pdf", ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx", ".jpg", ".jpeg", ".png", ".webp"}
    if ext not in allowed_ext:
        ext = ".pdf"

    safe_cat = normalized_category.lower().replace(" ", "_")
    filename = f"{safe_cat}_{uuid4().hex}{ext}"
    allowed_types = {
        "application/pdf",
        "application/msword",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "application/vnd.ms-excel",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "application/vnd.ms-powerpoint",
        "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        "image/jpeg",
        "image/png",
        "image/webp",
    }
    if file.content_type and file.content_type not in allowed_types:
        raise HTTPException(status_code=400, detail="Unsupported library document content type")

    content = await file.read()
    if len(content) > settings.LIBRARY_DOC_MAX_BYTES:
        raise HTTPException(status_code=400, detail=f"Document must be <= {settings.LIBRARY_DOC_MAX_BYTES // (1024 * 1024)}MB")
    object_storage.upload_bytes(_library_key(filename), content, file.content_type)
    if not object_storage.enabled:
        destination = LIBRARY_DIR / filename
        destination.write_bytes(content)

    url = f"{str(request.base_url).rstrip('/')}/files/library/{filename}"
    doc = CompanyDocument(
        title=normalized_title,
        category=normalized_category,
        file_url=url,
        uploaded_by_id=admin.id,
    )
    db.add(doc)
    db.commit()
    db.refresh(doc)
    _ = doc.uploaded_by
    return doc


@app.delete("/library/documents/{doc_id}")
def delete_company_document(
    doc_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    doc = db.query(CompanyDocument).filter(CompanyDocument.id == doc_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    file_name = None
    for prefix in ("/uploads/library/", "/files/library/"):
        if prefix in doc.file_url:
            file_name = doc.file_url.split(prefix, 1)[1]
            break
    if file_name:
        object_storage.delete_object(_library_key(file_name))
        file_path = LIBRARY_DIR / file_name
        if file_path.exists() and file_path.is_file():
            file_path.unlink()

    db.delete(doc)
    db.commit()
    return {"ok": True}


# -------------------------
# Client Task Manager
# -------------------------
@app.get("/task-manager/years", response_model=List[int])
def list_task_years(
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    years = [int(y[0]) for y in db.query(ClientTask.year).distinct().order_by(ClientTask.year.desc()).all()]
    current_year = date.today().year
    if current_year not in years:
        years.append(current_year)
    return sorted(set(years), reverse=True)


@app.get("/task-manager/clients", response_model=List[ClientAccountOut])
def list_task_clients(
    _: Optional[int] = Query(default=None, alias="year"),
    db: Session = Depends(get_db),
    __: User = Depends(get_current_user),
):
    return db.query(ClientAccount).order_by(ClientAccount.name.asc()).all()


@app.post("/task-manager/clients", response_model=ClientAccountOut)
def create_task_client(
    payload: ClientAccountCreate,
    db: Session = Depends(get_db),
    current: User = Depends(get_current_user),
):
    name = (payload.name or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="Client name is required")
    exists = db.query(ClientAccount).filter(ClientAccount.name == name).first()
    if exists:
        raise HTTPException(status_code=400, detail="Client already exists")

    c = ClientAccount(name=name, created_by_id=current.id)
    db.add(c)
    db.commit()
    db.refresh(c)
    return c


@app.get("/task-manager/tasks", response_model=List[ClientTaskOut])
def list_client_tasks(
    year: int,
    client_id: int,
    quarter: Optional[int] = None,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    q = db.query(ClientTask).filter(ClientTask.year == year, ClientTask.client_id == client_id)
    if quarter is not None:
        q = q.filter(ClientTask.quarter == quarter)
    rows = q.order_by(
        ClientTask.task_group_id.asc(),
        ClientTask.completion_date.asc().nulls_last(),
        ClientTask.id.asc(),
    ).all()
    for r in rows:
        _ = r.user
    return rows


@app.post("/task-manager/tasks", response_model=List[ClientTaskOut])
def create_client_task(
    payload: ClientTaskCreate,
    db: Session = Depends(get_db),
    current: User = Depends(get_current_user),
):
    if payload.quarter not in {1, 2, 3, 4}:
        raise HTTPException(status_code=400, detail="quarter must be between 1 and 4")
    if payload.year < 2000 or payload.year > 2100:
        raise HTTPException(status_code=400, detail="year must be between 2000 and 2100")
    task_text = (payload.task or "").strip()
    subtask_text = (payload.subtask or "").strip() if payload.subtask is not None else ""
    if not task_text:
        raise HTTPException(status_code=400, detail="task is required")
    entries: list[tuple[str, Optional[date]]] = []
    if payload.subtasks:
        for item in payload.subtasks:
            st = (item.subtask or "").strip()
            if not st:
                continue
            entries.append((st, item.completion_date))
    elif subtask_text:
        entries.append((subtask_text, payload.completion_date))

    if not entries:
        raise HTTPException(status_code=400, detail="at least one subtask is required")

    client = db.query(ClientAccount).filter(ClientAccount.id == payload.client_id).first()
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")

    group_id = uuid4().hex
    created: list[ClientTask] = []
    for subtask_value, completion_date_value in entries:
        t = ClientTask(
            client_id=payload.client_id,
            user_id=current.id,
            task_group_id=group_id,
            year=payload.year,
            quarter=payload.quarter,
            task=task_text,
            subtask=subtask_value,
            completion_date=completion_date_value,
            completed=False,
            completed_at=None,
        )
        db.add(t)
        created.append(t)
    db.commit()
    for t in created:
        db.refresh(t)
        _ = t.user
    return created


@app.patch("/task-manager/tasks/{task_id}", response_model=ClientTaskOut)
def update_client_task(
    task_id: int,
    payload: ClientTaskUpdate,
    db: Session = Depends(get_db),
    current: User = Depends(get_current_user),
):
    t = db.query(ClientTask).filter(ClientTask.id == task_id).first()
    if not t:
        raise HTTPException(status_code=404, detail="Task not found")
    if current.role not in {"admin", "supervisor"} and t.user_id != current.id:
        raise HTTPException(status_code=403, detail="Not allowed")

    incoming = payload.dict(exclude_unset=True)
    if "task" in incoming:
        task_text = (incoming["task"] or "").strip()
        if not task_text:
            raise HTTPException(status_code=400, detail="task cannot be empty")
        t.task = task_text
    if "subtask" in incoming:
        subtask_text = (incoming["subtask"] or "").strip()
        if not subtask_text:
            raise HTTPException(status_code=400, detail="subtask cannot be empty")
        t.subtask = subtask_text
    if "completion_date" in incoming:
        t.completion_date = incoming["completion_date"]
    if "completed" in incoming:
        t.completed = bool(incoming["completed"])
        t.completed_at = datetime.utcnow() if t.completed else None

    t.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(t)
    _ = t.user
    return t


@app.delete("/task-manager/tasks/{task_id}")
def delete_client_task(
    task_id: int,
    db: Session = Depends(get_db),
    current: User = Depends(get_current_user),
):
    t = db.query(ClientTask).filter(ClientTask.id == task_id).first()
    if not t:
        raise HTTPException(status_code=404, detail="Task not found")
    if current.role not in {"admin", "supervisor"} and t.user_id != current.id:
        raise HTTPException(status_code=403, detail="Not allowed")

    db.delete(t)
    db.commit()
    return {"ok": True}


def _to_task_reminder(task: ClientTask) -> TaskReminderOut:
    if task.completion_date is None:
        raise ValueError("completion_date is required for reminders")
    client_name = task.client.name if task.client else f"Client #{task.client_id}"
    user_name = task.user.name if task.user else f"User #{task.user_id}"
    return TaskReminderOut(
        id=task.id,
        task_group_id=task.task_group_id,
        client_id=task.client_id,
        client_name=client_name,
        user_id=task.user_id,
        user_name=user_name,
        year=task.year,
        quarter=task.quarter,
        task=task.task,
        subtask=task.subtask,
        completion_date=task.completion_date,
        days_until_due=(task.completion_date - date.today()).days,
    )


@app.get("/dashboard/overview", response_model=DashboardOverviewOut)
def get_dashboard_overview(
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    today = date.today()
    history_start = today - timedelta(days=14)
    upcoming_limit = today + timedelta(days=3)

    todays_activities = (
        db.query(DailyActivity)
        .filter(DailyActivity.activity_date == today)
        .order_by(
            DailyActivity.completed.asc(),
            DailyActivity.created_at.desc(),
            DailyActivity.id.desc(),
        )
        .all()
    )
    for item in todays_activities:
        _ = item.user

    history_rows = (
        db.query(DailyActivity)
        .filter(
            DailyActivity.activity_date < today,
            DailyActivity.activity_date >= history_start,
        )
        .order_by(
            DailyActivity.activity_date.desc(),
            DailyActivity.created_at.desc(),
            DailyActivity.id.desc(),
        )
        .all()
    )
    for item in history_rows:
        _ = item.user

    carried_over_rows = (
        db.query(DailyActivity)
        .filter(
            DailyActivity.activity_date < today,
            DailyActivity.completed.is_(False),
        )
        .order_by(
            DailyActivity.activity_date.desc(),
            DailyActivity.created_at.desc(),
            DailyActivity.id.desc(),
        )
        .limit(100)
        .all()
    )
    for item in carried_over_rows:
        _ = item.user

    unfinished_count = (
        db.query(DailyActivity)
        .filter(
            DailyActivity.activity_date < today,
            DailyActivity.completed.is_(False),
        )
        .count()
    )

    upcoming_rows = (
        db.query(ClientTask)
        .filter(
            ClientTask.completed.is_(False),
            ClientTask.completion_date.isnot(None),
            ClientTask.completion_date > today,
            ClientTask.completion_date <= upcoming_limit,
        )
        .order_by(ClientTask.completion_date.asc(), ClientTask.id.asc())
        .all()
    )
    for item in upcoming_rows:
        _ = item.user
        _ = item.client

    due_rows = (
        db.query(ClientTask)
        .filter(
            ClientTask.completed.is_(False),
            ClientTask.completion_date.isnot(None),
            ClientTask.completion_date <= today,
        )
        .order_by(ClientTask.completion_date.asc(), ClientTask.id.asc())
        .all()
    )
    for item in due_rows:
        _ = item.user
        _ = item.client

    return DashboardOverviewOut(
        today=today,
        todays_activities=todays_activities,
        todo_history=history_rows,
        carried_over_activities=carried_over_rows,
        unfinished_count=unfinished_count,
        upcoming_subtasks=[_to_task_reminder(t) for t in upcoming_rows],
        due_subtasks=[_to_task_reminder(t) for t in due_rows],
    )


@app.post("/dashboard/activities/today", response_model=List[DailyActivityOut])
def create_todays_activity(
    payload: DailyActivityCreate,
    db: Session = Depends(get_db),
    current: User = Depends(get_current_user),
):
    raw_text = (payload.activity or "").replace("\r\n", "\n")
    entries = [(line or "").strip() for line in raw_text.split("\n")]
    entries = [line for line in entries if line]
    if not entries:
        raise HTTPException(status_code=400, detail="at least one activity is required")
    if len(entries) > 50:
        raise HTTPException(status_code=400, detail="maximum 50 activities per post")
    for line in entries:
        if len(line) > 1000:
            raise HTTPException(status_code=400, detail="each activity must be <= 1000 characters")

    created: list[DailyActivity] = []
    group_id = uuid4().hex
    for line in entries:
        row = DailyActivity(
            user_id=current.id,
            post_group_id=group_id,
            activity_date=date.today(),
            activity=line,
            completed=False,
            completed_at=None,
        )
        db.add(row)
        created.append(row)

    db.commit()
    for row in created:
        db.refresh(row)
        _ = row.user
    return created


@app.patch("/dashboard/activities/{activity_id}", response_model=DailyActivityOut)
def update_todays_activity(
    activity_id: int,
    payload: DailyActivityUpdate,
    db: Session = Depends(get_db),
    current: User = Depends(get_current_user),
):
    row = db.query(DailyActivity).filter(DailyActivity.id == activity_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Activity not found")
    if current.role != "admin" and row.user_id != current.id:
        raise HTTPException(status_code=403, detail="Not allowed")

    row.completed = bool(payload.completed)
    row.completed_at = datetime.utcnow() if row.completed else None
    db.commit()
    db.refresh(row)
    _ = row.user
    return row


@app.get("/dashboard/activities/history", response_model=List[DailyActivityOut])
def list_todo_history(
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    user_id: Optional[int] = None,
    user_query: Optional[str] = None,
    days: int = Query(default=30, ge=1, le=365),
    db: Session = Depends(get_db),
    current: User = Depends(get_current_user),
):
    today = date.today()
    q = (
        db.query(DailyActivity)
        .join(User, User.id == DailyActivity.user_id)
        .filter(DailyActivity.activity_date < today)
    )

    if start_date is not None:
        q = q.filter(DailyActivity.activity_date >= start_date)
    if end_date is not None:
        q = q.filter(DailyActivity.activity_date <= end_date)
    if start_date is None and end_date is None:
        history_start = today - timedelta(days=days)
        q = q.filter(DailyActivity.activity_date >= history_start)

    if current.role == "admin":
        if user_id is not None:
            q = q.filter(DailyActivity.user_id == user_id)
        if (user_query or "").strip():
            term = f"%{(user_query or '').strip()}%"
            q = q.filter(User.name.ilike(term) | User.email.ilike(term))
    else:
        if user_id is not None and user_id != current.id:
            raise HTTPException(status_code=403, detail="user_id filter is admin only")
        if (user_query or "").strip():
            raise HTTPException(status_code=403, detail="user_query filter is admin only")
        q = q.filter(DailyActivity.user_id == current.id)

    rows = (
        q.order_by(
            DailyActivity.activity_date.desc(),
            DailyActivity.created_at.desc(),
            DailyActivity.id.desc(),
        )
        .all()
    )
    for item in rows:
        _ = item.user
    return rows


# -------------------------
# Leave balance
# -------------------------
@app.get("/leave/balance", response_model=LeaveBalanceOut)
def get_leave_balance(
    as_of: Optional[date] = None,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    d = as_of or date.today()
    bal = compute_leave_balance(db, user, as_of=d)
    return LeaveBalanceOut(
        user_id=bal.user_id,
        as_of=bal.as_of,
        period_start=bal.period_start,
        period_end=bal.period_end,
        months_accrued=bal.months_accrued,
        accrued=bal.accrued,
        used=bal.used,
        remaining=bal.remaining,
    )


# -------------------------
# Events (+ filtering + WS broadcasts + leave enforcement)
# -------------------------
@app.post("/leave/requests", response_model=EventOut)
async def create_leave_request(
    payload: LeaveRequestCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    try:
        validate_leave_request(db, user, payload.start_ts, payload.end_ts, exclude_event_id=None)
    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))

    e = Event(
        user_id=user.id,
        start_ts=payload.start_ts,
        end_ts=payload.end_ts,
        all_day=payload.all_day,
        type="Leave",
        note=payload.note,
        status="pending",
        requested_by_id=user.id,
    )
    db.add(e)
    db.commit()
    db.refresh(e)
    _ = e.user

    await broadcast_events_changed("created", e.id)
    return e


@app.post("/leave/requests/{event_id}/approve", response_model=EventOut)
async def approve_leave_request(
    event_id: int,
    db: Session = Depends(get_db),
    approver: User = Depends(require_leave_approver),
):
    e = db.query(Event).filter(Event.id == event_id, Event.type == "Leave").first()
    if not e:
        raise HTTPException(status_code=404, detail="Leave request not found")

    if e.status != "pending":
        raise HTTPException(status_code=400, detail="Only pending leave can be approved")

    owner = db.query(User).filter(User.id == e.user_id).first()
    if not owner:
        raise HTTPException(status_code=400, detail="Event owner not found")

    requires_two_step = bool(owner.require_two_step_leave_approval)
    first_approver_id = owner.first_approver_id
    second_approver_id = owner.second_approver_id

    if requires_two_step:
        if first_approver_id is None or second_approver_id is None:
            raise HTTPException(
                status_code=400,
                detail="Leave owner has invalid approval setup: missing first/second approver",
            )
        if not _is_supervisor_user(db, first_approver_id):
            raise HTTPException(status_code=400, detail="Leave owner has invalid approval setup: first approver must be supervisor")
        if not _is_admin_user(db, second_approver_id):
            raise HTTPException(status_code=400, detail="Leave owner has invalid approval setup: second approver must be admin")

        if approver.id not in {first_approver_id, second_approver_id}:
            raise HTTPException(status_code=403, detail="You are not assigned to approve this leave")
        if approver.id == first_approver_id and approver.role != "supervisor":
            raise HTTPException(status_code=403, detail="First approval must be done by the assigned supervisor")
        if approver.id == second_approver_id and approver.role != "admin":
            raise HTTPException(status_code=403, detail="Second approval must be done by the assigned admin")

        # Approval order: first approver must approve before second approver.
        if approver.id == second_approver_id and e.first_approved_by_id is None:
            raise HTTPException(status_code=400, detail="First approver must approve before second approver")

        if approver.id == first_approver_id:
            if e.first_approved_by_id is not None:
                raise HTTPException(status_code=400, detail="First approval already recorded")
            e.first_approved_by_id = approver.id

        if approver.id == second_approver_id:
            if e.second_approved_by_id is not None:
                raise HTTPException(status_code=400, detail="Second approval already recorded")
            e.second_approved_by_id = approver.id

    try:
        validate_leave_request(db, owner, e.start_ts, e.end_ts, exclude_event_id=e.id)
    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))

    if requires_two_step:
        if e.first_approved_by_id is not None and e.second_approved_by_id is not None:
            e.status = "approved"
            e.approved_by_id = approver.id
            e.approved_at = datetime.utcnow()
            e.rejection_reason = None
        else:
            # Keep pending until both approvals are completed.
            e.status = "pending"
    else:
        if approver.role != "admin":
            raise HTTPException(status_code=403, detail="Only admin can approve single-step leave")
        e.status = "approved"
        e.approved_by_id = approver.id
        e.approved_at = datetime.utcnow()
        e.rejection_reason = None
        if e.first_approved_by_id is None:
            e.first_approved_by_id = approver.id
        if e.second_approved_by_id is None:
            e.second_approved_by_id = approver.id

    e.updated_at = datetime.utcnow()

    db.commit()
    db.refresh(e)
    _ = e.user

    await broadcast_events_changed("updated", e.id)
    return e


@app.post("/leave/requests/{event_id}/reject", response_model=EventOut)
async def reject_leave_request(
    event_id: int,
    payload: LeaveRejectRequest,
    db: Session = Depends(get_db),
    approver: User = Depends(require_leave_approver),
):
    e = db.query(Event).filter(Event.id == event_id, Event.type == "Leave").first()
    if not e:
        raise HTTPException(status_code=404, detail="Leave request not found")

    if e.status != "pending":
        raise HTTPException(status_code=400, detail="Only pending leave can be rejected")

    owner = db.query(User).filter(User.id == e.user_id).first()
    if not owner:
        raise HTTPException(status_code=400, detail="Event owner not found")

    if owner.require_two_step_leave_approval:
        allowed = {owner.first_approver_id, owner.second_approver_id}
        if approver.id not in allowed:
            raise HTTPException(status_code=403, detail="You are not assigned to reject this leave")
        if approver.id == owner.first_approver_id and approver.role != "supervisor":
            raise HTTPException(status_code=403, detail="First approver must be supervisor")
        if approver.id == owner.second_approver_id and approver.role != "admin":
            raise HTTPException(status_code=403, detail="Second approver must be admin")
    elif approver.role != "admin":
        raise HTTPException(status_code=403, detail="Only admin can reject single-step leave")

    e.status = "rejected"
    e.approved_by_id = approver.id
    e.approved_at = datetime.utcnow()
    e.rejection_reason = (payload.reason or "").strip() or "Rejected by approver"
    e.updated_at = datetime.utcnow()

    db.commit()
    db.refresh(e)
    _ = e.user

    await broadcast_events_changed("updated", e.id)
    return e


@app.get("/leave/requests", response_model=List[EventOut])
def list_leave_requests(
    status: Optional[str] = None,
    user_id: Optional[int] = None,
    start: Optional[datetime] = None,
    end: Optional[datetime] = None,
    db: Session = Depends(get_db),
    current: User = Depends(get_current_user),
):
    q = db.query(Event).filter(Event.type == "Leave")

    if status:
        q = q.filter(Event.status == status)

    if start is not None:
        q = q.filter(Event.end_ts > start)
    if end is not None:
        q = q.filter(Event.start_ts < end)

    if current.role != "admin":
        if current.role == "supervisor":
            q = q.filter(
                Event.user.has(User.first_approver_id == current.id)
                | Event.user.has(User.second_approver_id == current.id)
            )
            if user_id is not None:
                raise HTTPException(status_code=403, detail="user_id filter is admin only")
        else:
            q = q.filter(Event.user_id == current.id)
            if user_id is not None and user_id != current.id:
                raise HTTPException(status_code=403, detail="Not allowed")
    elif user_id is not None:
        q = q.filter(Event.user_id == user_id)

    items = q.order_by(Event.start_ts.desc()).all()
    for e in items:
        _ = e.user
    return items


@app.get("/events", response_model=List[EventOut])
def list_events(
    start: datetime,
    end: datetime,
    type: Optional[str] = None,
    user_id: Optional[int] = None,
    department: Optional[str] = None,
    db: Session = Depends(get_db),
    current: User = Depends(get_current_user),
):
    q = (
        db.query(Event)
        .filter(Event.start_ts < end, Event.end_ts > start)
    )

    # type filter (anyone can use)
    if type:
        q = q.filter(Event.type == type)

    # user filter (admin only)
    if user_id is not None:
        if current.role != "admin":
            raise HTTPException(status_code=403, detail="Admin only filter")
        q = q.filter(Event.user_id == user_id)

    # department filter (admin only)
    if department:
        if current.role != "admin":
            raise HTTPException(status_code=403, detail="Admin only filter")
        q = q.join(User, User.id == Event.user_id).filter(User.department == department)

    events = q.order_by(Event.start_ts.asc()).all()
    for e in events:
        _ = e.user
    return events


@app.post("/events", response_model=EventOut)
async def create_event(
    payload: EventCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    # Leave enforcement (only for Leave)
    if (payload.type or "").strip() == "Leave":
        try:
            validate_leave_request(db, user, payload.start_ts, payload.end_ts, exclude_event_id=None)
        except ValueError as ve:
            raise HTTPException(status_code=400, detail=str(ve))

    is_leave = (payload.type or "").strip().lower() == "leave"
    e = Event(
        user_id=user.id,
        start_ts=payload.start_ts,
        end_ts=payload.end_ts,
        all_day=payload.all_day,
        type=payload.type,
        note=payload.note,
        status="pending" if is_leave else "approved",
        requested_by_id=user.id if is_leave else None,
    )
    db.add(e)
    db.commit()
    db.refresh(e)
    _ = e.user

    await broadcast_events_changed("created", e.id)
    return e


@app.patch("/events/{event_id}", response_model=EventOut)
async def update_event(
    event_id: int,
    payload: EventUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    e = db.query(Event).filter(Event.id == event_id).first()
    if not e:
        raise HTTPException(status_code=404, detail="Event not found")

    if user.role != "admin" and e.user_id != user.id:
        raise HTTPException(status_code=403, detail="Not allowed")

    # Prepare prospective values for leave validation
    new_start = payload.start_ts if payload.start_ts is not None else e.start_ts
    new_end = payload.end_ts if payload.end_ts is not None else e.end_ts
    new_type = payload.type if payload.type is not None else e.type

    if (new_type or "").strip() == "Leave":
        # enforce leave for the owner of the event (not necessarily the current admin)
        owner = db.query(User).filter(User.id == e.user_id).first()
        if not owner:
            raise HTTPException(status_code=400, detail="Event owner not found")

        try:
            validate_leave_request(db, owner, new_start, new_end, exclude_event_id=e.id)
        except ValueError as ve:
            raise HTTPException(status_code=400, detail=str(ve))

    if payload.start_ts is not None:
        e.start_ts = payload.start_ts
    if payload.end_ts is not None:
        e.end_ts = payload.end_ts
    if payload.all_day is not None:
        e.all_day = payload.all_day
    if payload.type is not None:
        e.type = payload.type
    if payload.note is not None:
        e.note = payload.note or None

    e.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(e)
    _ = e.user

    await broadcast_events_changed("updated", e.id)
    return e


@app.delete("/events/{event_id}")
async def delete_event(
    event_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    e = db.query(Event).filter(Event.id == event_id).first()
    if not e:
        raise HTTPException(status_code=404, detail="Event not found")

    if user.role != "admin" and e.user_id != user.id:
        raise HTTPException(status_code=403, detail="Not allowed")

    db.delete(e)
    db.commit()

    await broadcast_events_changed("deleted", event_id)
    return {"ok": True}

