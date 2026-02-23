from datetime import datetime, date, timedelta
from decimal import Decimal
from typing import List, Optional
from pathlib import Path
from uuid import uuid4
import json

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
from .models import (
    User,
    Event,
    CompanyDocument,
    LibraryCategory,
    ClientAccount,
    ClientTask,
    DailyActivity,
    CashReimbursementRequest,
    CashReimbursementItem,
    CashReimbursementDraft,
    CashRequisitionRequest,
    AuthorityToIncurRequest,
    SalaryAdvanceRequest,
    PerformanceCompanyGoal,
    PerformanceDepartmentGoal,
    PerformanceEmployeeGoal,
)
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
    LibraryCategoryCreate,
    LibraryCategoryOut,
    ClientAccountCreate,
    ClientAccountUpdate,
    ClientAccountOut,
    ClientTaskCreate,
    ClientTaskUpdate,
    ClientTaskOut,
    DailyActivityCreate,
    DailyActivityUpdate,
    DailyActivityOut,
    TaskReminderOut,
    DashboardOverviewOut,
    CashReimbursementDraftOut,
    CashReimbursementDraftItemOut,
    CashReimbursementSubmitIn,
    CashReimbursementRequestOut,
    CashReimbursementDecisionIn,
    CashReimbursementDraftSaveIn,
    CashReimbursementDraftManualItemOut,
    CashRequisitionCreateIn,
    CashRequisitionDecisionIn,
    CashRequisitionDisburseIn,
    CashRequisitionRequestOut,
    AuthorityToIncurCreateIn,
    AuthorityToIncurDecisionIn,
    AuthorityToIncurIncurIn,
    AuthorityToIncurRequestOut,
    SalaryAdvanceCreateIn,
    SalaryAdvanceDecisionIn,
    SalaryAdvanceDisburseIn,
    SalaryAdvanceRequestOut,
    PerformanceCompanyGoalIn,
    PerformanceCompanyGoalOut,
    PerformanceDepartmentGoalIn,
    PerformanceDepartmentGoalOut,
    PerformanceEmployeeGoalIn,
    PerformanceEmployeeGoalUpdateIn,
    PerformanceEmployeeGoalOut,
    PerformanceAssignableUserOut,
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
SICK_NOTES_DIR = UPLOADS_DIR / "sick_notes"

PROFILE_DOCUMENT_FIELDS = {
    "id_copy": "id_copy_url",
    "kra_copy": "kra_copy_url",
    "offer_letter": "offer_letter_url",
    "employment_contract": "employment_contract_url",
    "disciplinary_records": "disciplinary_records_url",
    "bio_data_form": "bio_data_form_url",
    "bank_details_form": "bank_details_form_url",
}

DEFAULT_LIBRARY_CATEGORIES = {
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
SICK_NOTES_DIR.mkdir(parents=True, exist_ok=True)


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
    if not _is_admin_like(current.role) and current.id != owner.id:
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


@app.get("/files/sick-notes/{file_name}")
def get_sick_note_file(
    file_name: str,
    db: Session = Depends(get_db),
    current: User = Depends(get_current_user),
):
    e = (
        db.query(Event)
        .filter(
            Event.sick_note_url.like(f"%/uploads/sick_notes/{file_name}")
            | Event.sick_note_url.like(f"%/files/sick-notes/{file_name}")
        )
        .first()
    )
    if not e:
        raise HTTPException(status_code=404, detail="File not found")
    if not _is_admin_like(current.role):
        raise HTTPException(status_code=403, detail="Only admin/ceo can view sick notes")

    path = SICK_NOTES_DIR / file_name
    return _serve_local_or_object(path, _sick_note_key(file_name))


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


def _sick_note_key(file_name: str) -> str:
    return f"sick_notes/{file_name}"


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
    return bool(u and u.role in {"admin", "ceo"})


def _is_supervisor_user(db: Session, user_id: Optional[int]) -> bool:
    if user_id is None:
        return False
    u = db.query(User).filter(User.id == user_id).first()
    return bool(u and u.role == "supervisor")


def _is_valid_role(role: Optional[str]) -> bool:
    return (role or "").strip().lower() in {"employee", "admin", "supervisor", "ceo", "finance"}


def _is_admin_like(role: Optional[str]) -> bool:
    return (role or "").strip().lower() in {"admin", "ceo"}


def _is_finance_reviewer(role: Optional[str]) -> bool:
    return (role or "").strip().lower() in {"finance", "admin", "ceo"}


def _is_leave_like_event(e: Event) -> bool:
    return (e.type or "").strip().lower() in {"leave", "hospital"}


def _is_past_current_day_event(e: Event) -> bool:
    # Events are stored with end_ts as exclusive boundary for all-day entries.
    return e.end_ts.date() <= date.today()


def _compute_leave_review_permissions(
    db: Session,
    current: User,
    e: Event,
    owner: User,
) -> tuple[bool, bool]:
    if not _is_leave_like_event(e) or (e.status or "").strip().lower() != "pending":
        return False, False

    requires_two_step = bool(owner.require_two_step_leave_approval)
    first_approver_id = owner.first_approver_id
    second_approver_id = owner.second_approver_id

    if requires_two_step:
        if first_approver_id is None or second_approver_id is None:
            return False, False
        if not _is_supervisor_user(db, first_approver_id):
            return False, False
        if not _is_admin_user(db, second_approver_id):
            return False, False

        if current.id == first_approver_id and current.role == "supervisor":
            can_approve = e.first_approved_by_id is None
            return can_approve, True

        if current.id == second_approver_id and _is_admin_like(current.role):
            can_approve = e.first_approved_by_id is not None and e.second_approved_by_id is None
            return can_approve, True

        return False, False

    designated_approvers: set[int] = set()
    if first_approver_id is not None and _is_supervisor_user(db, first_approver_id):
        designated_approvers.add(first_approver_id)
    if second_approver_id is not None and _is_admin_user(db, second_approver_id):
        designated_approvers.add(second_approver_id)

    if designated_approvers:
        if current.id not in designated_approvers:
            return False, False
        if current.id == first_approver_id and current.role != "supervisor":
            return False, False
        if current.id == second_approver_id and not _is_admin_like(current.role):
            return False, False
        return True, True

    can = _is_admin_like(current.role)
    return can, can


def _attach_leave_review_metadata(
    db: Session,
    e: Event,
    current: User,
    owner: Optional[User] = None,
) -> None:
    first_approver_name = None
    second_approver_name = None

    if not _is_leave_like_event(e):
        setattr(e, "require_two_step_leave_approval", False)
        setattr(e, "first_approver_id", None)
        setattr(e, "second_approver_id", None)
        setattr(e, "first_approver_name", None)
        setattr(e, "second_approver_name", None)
        setattr(e, "can_current_user_approve", False)
        setattr(e, "can_current_user_reject", False)
        return

    owner_obj = owner or e.user or db.query(User).filter(User.id == e.user_id).first()
    if owner_obj is None:
        setattr(e, "require_two_step_leave_approval", False)
        setattr(e, "first_approver_id", None)
        setattr(e, "second_approver_id", None)
        setattr(e, "first_approver_name", None)
        setattr(e, "second_approver_name", None)
        setattr(e, "can_current_user_approve", False)
        setattr(e, "can_current_user_reject", False)
        return

    setattr(e, "require_two_step_leave_approval", bool(owner_obj.require_two_step_leave_approval))
    setattr(e, "first_approver_id", owner_obj.first_approver_id)
    setattr(e, "second_approver_id", owner_obj.second_approver_id)
    if owner_obj.first_approver_id is not None:
        first = db.query(User).filter(User.id == owner_obj.first_approver_id).first()
        first_approver_name = first.name if first else None
    if owner_obj.second_approver_id is not None:
        second = db.query(User).filter(User.id == owner_obj.second_approver_id).first()
        second_approver_name = second.name if second else None
    setattr(e, "first_approver_name", first_approver_name)
    setattr(e, "second_approver_name", second_approver_name)

    can_approve, can_reject = _compute_leave_review_permissions(db, current, e, owner_obj)
    setattr(e, "can_current_user_approve", can_approve)
    setattr(e, "can_current_user_reject", can_reject)


def _biweekly_period_for(d: date) -> tuple[date, date]:
    # Anchor to a Monday to keep 14-day windows stable.
    anchor = date(2025, 1, 6)
    n = (d - anchor).days // 14
    start = anchor + timedelta(days=n * 14)
    end = start + timedelta(days=13)
    return start, end


def _is_reimbursement_due_day(d: date) -> bool:
    if d.month == 2:
        return d.day == 28
    return d.day in {15, 30}


def _reimbursement_due_message(today: date, can_submit: bool) -> str:
    if can_submit:
        return "Cash reimbursement submission is open today. Submit your 2-week reimbursement."
    if today.month == 2:
        return "Cash reimbursement can be submitted on February 28."
    return "Cash reimbursement can be submitted on the 15th and 30th of each month."


def _parse_todo_entries(raw_text: Optional[str]) -> list[str]:
    normalized = str(raw_text or "").replace("\r\n", "\n")
    entries = [(line or "").strip() for line in normalized.split("\n")]
    entries = [line for line in entries if line]
    if len(entries) > 50:
        raise HTTPException(status_code=400, detail="maximum 50 activities per post")
    for line in entries:
        if len(line) > 1000:
            raise HTTPException(status_code=400, detail="each activity must be <= 1000 characters")
    return entries


def _sync_client_visit_todos(db: Session, e: Event) -> None:
    group_id = f"event:{e.id}"
    db.query(DailyActivity).filter(
        DailyActivity.post_group_id == group_id,
        DailyActivity.user_id == e.user_id,
    ).delete(synchronize_session=False)

    if (e.type or "").strip().lower() != "client visit":
        return

    entries = _parse_todo_entries(e.note)
    if not entries:
        return

    visit_day = e.start_ts.date()
    now = datetime.utcnow()
    for line in entries:
        db.add(
            DailyActivity(
                user_id=e.user_id,
                post_group_id=group_id,
                activity_date=visit_day,
                activity=line,
                completed=False,
                completed_at=None,
                created_at=now,
            )
        )


def _parse_manual_reimbursement_items(raw_json: str) -> list[CashReimbursementDraftManualItemOut]:
    try:
        payload = json.loads(raw_json or "[]")
    except Exception:
        payload = []
    if not isinstance(payload, list):
        return []

    out: list[CashReimbursementDraftManualItemOut] = []
    for row in payload:
        if not isinstance(row, dict):
            continue
        item_date = None
        raw_date = row.get("item_date")
        if isinstance(raw_date, str) and raw_date.strip():
            try:
                item_date = date.fromisoformat(raw_date.strip())
            except Exception:
                item_date = None

        description = str(row.get("description") or "")
        raw_amount = row.get("amount")
        amount = None
        if raw_amount not in (None, ""):
            try:
                amount = float(raw_amount)
            except Exception:
                amount = None

        src_event = None
        if row.get("source_event_id") is not None:
            try:
                src_event = int(row.get("source_event_id"))
            except Exception:
                src_event = None

        out.append(CashReimbursementDraftManualItemOut(
            item_date=item_date,
            description=description,
            amount=amount,
            source_event_id=src_event,
        ))
    return out


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
        raise HTTPException(status_code=400, detail="role must be one of: employee, supervisor, finance, admin, ceo")

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
    if not _is_admin_like(current.role) and current.id != user_id:
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
    if not _is_admin_like(current.role) and current.id != user_id:
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
            raise HTTPException(status_code=400, detail="role must be one of: employee, supervisor, finance, admin, ceo")
        incoming["role"] = role

    for leave_num_field in ("leave_opening_accrued", "leave_opening_used"):
        if leave_num_field in incoming:
            value = incoming[leave_num_field]
            if value is None:
                continue
            if value < 0:
                raise HTTPException(status_code=400, detail=f"{leave_num_field} cannot be negative")
            incoming[leave_num_field] = round(float(value), 2)

    effective_opening_as_of = incoming.get("leave_opening_as_of", u.leave_opening_as_of)
    effective_opening_accrued = incoming.get("leave_opening_accrued", u.leave_opening_accrued) or 0
    effective_opening_used = incoming.get("leave_opening_used", u.leave_opening_used) or 0
    if effective_opening_as_of is None and (effective_opening_accrued > 0 or effective_opening_used > 0):
        raise HTTPException(status_code=400, detail="leave_opening_as_of is required when opening leave values are set")

    first_approver_id = incoming.get("first_approver_id", u.first_approver_id)
    second_approver_id = incoming.get("second_approver_id", u.second_approver_id)
    requires_two_step = incoming.get(
        "require_two_step_leave_approval",
        u.require_two_step_leave_approval,
    )

    if first_approver_id is not None and not _is_supervisor_user(db, first_approver_id):
        raise HTTPException(status_code=400, detail="first_approver_id must be a supervisor user")
    if second_approver_id is not None and not _is_admin_user(db, second_approver_id):
        raise HTTPException(status_code=400, detail="second_approver_id must be an admin/ceo user")

    if first_approver_id is not None and second_approver_id is not None and first_approver_id == second_approver_id:
        raise HTTPException(status_code=400, detail="first_approver_id and second_approver_id must be different")

    if requires_two_step and (first_approver_id is None or second_approver_id is None):
        raise HTTPException(
            status_code=400,
            detail="Two-step leave approval requires both first_approver_id (supervisor) and second_approver_id (admin/ceo)",
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
def _normalize_library_category_name(raw: str) -> str:
    return " ".join((raw or "").strip().split())


def _library_category_names(db: Session) -> set[str]:
    names = set(DEFAULT_LIBRARY_CATEGORIES)
    for row in db.query(LibraryCategory).all():
        n = _normalize_library_category_name(row.name)
        if n:
            names.add(n)
    for row in db.query(CompanyDocument.category).distinct().all():
        n = _normalize_library_category_name(row[0] if row else "")
        if n:
            names.add(n)
    return names


@app.get("/library/categories", response_model=List[str])
def list_library_categories(
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    return sorted(_library_category_names(db), key=lambda x: x.lower())


@app.post("/library/categories", response_model=LibraryCategoryOut)
def create_library_category(
    payload: LibraryCategoryCreate,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    name = _normalize_library_category_name(payload.name)
    if not name:
        raise HTTPException(status_code=400, detail="Category name is required")
    if len(name) > 80:
        raise HTTPException(status_code=400, detail="Category name must be <= 80 characters")
    if any(existing.lower() == name.lower() for existing in _library_category_names(db)):
        raise HTTPException(status_code=400, detail="Category already exists")

    row = LibraryCategory(name=name, created_by_id=admin.id)
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


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
    normalized_category = _normalize_library_category_name(category)
    if not normalized_title:
        raise HTTPException(status_code=400, detail="Title is required")
    if normalized_category not in _library_category_names(db):
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

    amt = Decimal(str(payload.reimbursement_amount or 0))
    if amt < 0:
        raise HTTPException(status_code=400, detail="reimbursement_amount must be >= 0")

    c = ClientAccount(name=name, reimbursement_amount=amt, created_by_id=current.id)
    db.add(c)
    db.commit()
    db.refresh(c)
    return c


@app.patch("/task-manager/clients/{client_id}", response_model=ClientAccountOut)
def update_task_client(
    client_id: int,
    payload: ClientAccountUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    c = db.query(ClientAccount).filter(ClientAccount.id == client_id).first()
    if not c:
        raise HTTPException(status_code=404, detail="Client not found")
    amt = Decimal(str(payload.reimbursement_amount or 0))
    if amt < 0:
        raise HTTPException(status_code=400, detail="reimbursement_amount must be >= 0")
    c.reimbursement_amount = amt
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
    if current.role not in {"admin", "ceo", "supervisor"} and t.user_id != current.id:
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
    if current.role not in {"admin", "ceo", "supervisor"} and t.user_id != current.id:
        raise HTTPException(status_code=403, detail="Not allowed")

    db.delete(t)
    db.commit()
    return {"ok": True}


@app.get("/finance/reimbursements/draft", response_model=CashReimbursementDraftOut)
def get_cash_reimbursement_draft(
    db: Session = Depends(get_db),
    current: User = Depends(get_current_user),
):
    today = date.today()
    period_start, period_end = _biweekly_period_for(today)
    due_today = _is_reimbursement_due_day(today)
    already_submitted_for_period = bool(
        db.query(CashReimbursementRequest.id)
        .filter(
            CashReimbursementRequest.user_id == current.id,
            CashReimbursementRequest.period_start == period_start,
            CashReimbursementRequest.period_end == period_end,
        )
        .first()
    )
    can_submit = due_today and not already_submitted_for_period
    saved_draft = (
        db.query(CashReimbursementDraft)
        .filter(
            CashReimbursementDraft.user_id == current.id,
            CashReimbursementDraft.period_start == period_start,
            CashReimbursementDraft.period_end == period_end,
        )
        .first()
    )

    used_event_ids = {
        int(x[0]) for x in db.query(CashReimbursementItem.source_event_id)
        .filter(CashReimbursementItem.source_event_id.isnot(None))
        .all()
    }
    rows = (
        db.query(Event)
        .filter(
            Event.user_id == current.id,
            Event.type == "Client Visit",
            Event.client_id.isnot(None),
            Event.start_ts >= datetime.combine(period_start, datetime.min.time()),
            Event.start_ts < datetime.combine(period_end + timedelta(days=1), datetime.min.time()),
        )
        .order_by(Event.start_ts.asc(), Event.id.asc())
        .all()
    )

    items: list[CashReimbursementDraftItemOut] = []
    for e in rows:
        if e.id in used_event_ids:
            continue
        client = db.query(ClientAccount).filter(ClientAccount.id == e.client_id).first()
        if not client:
            continue
        amount = float(client.reimbursement_amount or 0)
        items.append(
            CashReimbursementDraftItemOut(
                item_date=e.start_ts.date(),
                description=f"Client visit to and from {client.name}",
                amount=amount,
                client_id=e.client_id,
                source_event_id=e.id,
                auto_filled=True,
            )
        )

    manual_items = _parse_manual_reimbursement_items(saved_draft.manual_items_json) if saved_draft else []
    existing_manual_source_ids = {int(x.source_event_id) for x in manual_items if x.source_event_id is not None}
    one_time_rows = (
        db.query(Event)
        .filter(
            Event.user_id == current.id,
            Event.type == "Client Visit",
            Event.client_id.is_(None),
            Event.one_time_client_name.isnot(None),
            Event.start_ts >= datetime.combine(period_start, datetime.min.time()),
            Event.start_ts < datetime.combine(period_end + timedelta(days=1), datetime.min.time()),
        )
        .order_by(Event.start_ts.asc(), Event.id.asc())
        .all()
    )
    for e in one_time_rows:
        if e.id in used_event_ids or e.id in existing_manual_source_ids:
            continue
        manual_items.append(CashReimbursementDraftManualItemOut(
            item_date=e.start_ts.date(),
            description=f"Client visit to and from {e.one_time_client_name}",
            amount=None,
            source_event_id=e.id,
        ))

    return CashReimbursementDraftOut(
        period_start=period_start,
        period_end=period_end,
        auto_items=items,
        manual_items=manual_items,
        can_edit_manual=not already_submitted_for_period,
        can_submit=can_submit,
        submit_due_today=due_today,
        submit_message=(
            "You already submitted this period's reimbursement."
            if already_submitted_for_period
            else _reimbursement_due_message(today, can_submit)
        ),
    )


@app.post("/finance/reimbursements/draft", response_model=CashReimbursementDraftOut)
def save_cash_reimbursement_draft(
    payload: CashReimbursementDraftSaveIn,
    db: Session = Depends(get_db),
    current: User = Depends(get_current_user),
):
    today = date.today()
    period_start, period_end = _biweekly_period_for(today)

    existing_submission = (
        db.query(CashReimbursementRequest.id)
        .filter(
            CashReimbursementRequest.user_id == current.id,
            CashReimbursementRequest.period_start == period_start,
            CashReimbursementRequest.period_end == period_end,
        )
        .first()
    )
    if existing_submission:
        raise HTTPException(status_code=400, detail="This period is already submitted and can no longer be edited.")

    normalized_items = []
    for row in payload.manual_items or []:
        description = (row.description or "").strip()
        amount = row.amount
        source_event_id = row.source_event_id
        if description and len(description) > 1000:
            raise HTTPException(status_code=400, detail="Each manual reimbursement description must be <= 1000 characters")
        if amount is not None and amount < 0:
            raise HTTPException(status_code=400, detail="Manual reimbursement amount cannot be negative")
        if source_event_id is not None:
            src = db.query(Event).filter(Event.id == source_event_id).first()
            if not src:
                raise HTTPException(status_code=400, detail="Manual reimbursement source event not found")
            if src.user_id != current.id:
                raise HTTPException(status_code=403, detail="Manual reimbursement source event does not belong to you")
            if not (
                src.start_ts >= datetime.combine(period_start, datetime.min.time())
                and src.start_ts < datetime.combine(period_end + timedelta(days=1), datetime.min.time())
            ):
                raise HTTPException(status_code=400, detail="Manual reimbursement source event is outside this reimbursement period")
        if row.item_date is None and not description and amount in (None, 0):
            continue
        normalized_items.append({
            "item_date": row.item_date.isoformat() if row.item_date else None,
            "description": description,
            "amount": amount,
            "source_event_id": source_event_id,
        })

    if len(normalized_items) > 200:
        raise HTTPException(status_code=400, detail="Maximum 200 manual reimbursement draft rows")

    draft = (
        db.query(CashReimbursementDraft)
        .filter(
            CashReimbursementDraft.user_id == current.id,
            CashReimbursementDraft.period_start == period_start,
            CashReimbursementDraft.period_end == period_end,
        )
        .first()
    )
    if draft:
        draft.manual_items_json = json.dumps(normalized_items)
        draft.updated_at = datetime.utcnow()
    else:
        draft = CashReimbursementDraft(
            user_id=current.id,
            period_start=period_start,
            period_end=period_end,
            manual_items_json=json.dumps(normalized_items),
            created_at=datetime.utcnow(),
            updated_at=datetime.utcnow(),
        )
        db.add(draft)

    db.commit()
    return get_cash_reimbursement_draft(db=db, current=current)


def _load_reimbursement_request(db: Session, request_id: int) -> Optional[CashReimbursementRequest]:
    req = db.query(CashReimbursementRequest).filter(CashReimbursementRequest.id == request_id).first()
    if not req:
        return None
    _ = req.user
    _ = req.items
    return req


@app.get("/finance/reimbursements/my", response_model=List[CashReimbursementRequestOut])
def list_my_cash_reimbursements(
    db: Session = Depends(get_db),
    current: User = Depends(get_current_user),
):
    rows = (
        db.query(CashReimbursementRequest)
        .filter(CashReimbursementRequest.user_id == current.id)
        .order_by(CashReimbursementRequest.period_start.desc(), CashReimbursementRequest.id.desc())
        .all()
    )
    for r in rows:
        _ = r.user
        _ = r.items
    return rows


@app.get("/finance/reimbursements/pending", response_model=List[CashReimbursementRequestOut])
def list_pending_cash_reimbursements(
    db: Session = Depends(get_db),
    current: User = Depends(get_current_user),
):
    if not _is_finance_reviewer(current.role):
        raise HTTPException(status_code=403, detail="Not allowed")

    rows = (
        db.query(CashReimbursementRequest)
        .filter(CashReimbursementRequest.status == "pending_approval")
        .order_by(CashReimbursementRequest.submitted_at.asc(), CashReimbursementRequest.id.asc())
        .all()
    )
    for r in rows:
        _ = r.user
        _ = r.items
    return rows


@app.get("/finance/reimbursements/approved", response_model=List[CashReimbursementRequestOut])
def list_approved_cash_reimbursements(
    db: Session = Depends(get_db),
    current: User = Depends(get_current_user),
):
    if not _is_finance_reviewer(current.role):
        raise HTTPException(status_code=403, detail="Not allowed")

    rows = (
        db.query(CashReimbursementRequest)
        .filter(CashReimbursementRequest.status.in_(["pending_reimbursement", "amount_reimbursed"]))
        .order_by(CashReimbursementRequest.submitted_at.desc(), CashReimbursementRequest.id.desc())
        .all()
    )
    for r in rows:
        _ = r.user
        _ = r.items
    return rows


@app.post("/finance/reimbursements/submit", response_model=CashReimbursementRequestOut)
def submit_cash_reimbursement(
    payload: CashReimbursementSubmitIn,
    db: Session = Depends(get_db),
    current: User = Depends(get_current_user),
):
    today = date.today()
    if not _is_reimbursement_due_day(today):
        raise HTTPException(
            status_code=400,
            detail=_reimbursement_due_message(today, False),
        )

    period_start, period_end = _biweekly_period_for(today)
    existing = (
        db.query(CashReimbursementRequest)
        .filter(
            CashReimbursementRequest.user_id == current.id,
            CashReimbursementRequest.period_start == period_start,
            CashReimbursementRequest.period_end == period_end,
        )
        .first()
    )
    if existing:
        raise HTTPException(status_code=400, detail="Cash reimbursement already submitted for this biweekly period")

    used_event_ids = {
        int(x[0]) for x in db.query(CashReimbursementItem.source_event_id)
        .filter(CashReimbursementItem.source_event_id.isnot(None))
        .all()
    }
    auto_events = (
        db.query(Event)
        .filter(
            Event.user_id == current.id,
            Event.type == "Client Visit",
            Event.client_id.isnot(None),
            Event.start_ts >= datetime.combine(period_start, datetime.min.time()),
            Event.start_ts < datetime.combine(period_end + timedelta(days=1), datetime.min.time()),
        )
        .order_by(Event.start_ts.asc(), Event.id.asc())
        .all()
    )

    all_items: list[dict] = []
    total = Decimal("0")

    for e in auto_events:
        if e.id in used_event_ids:
            continue
        client = db.query(ClientAccount).filter(ClientAccount.id == e.client_id).first()
        if not client:
            continue
        amount = Decimal(str(client.reimbursement_amount or 0))
        all_items.append({
            "item_date": e.start_ts.date(),
            "description": f"Client visit to and from {client.name}",
            "amount": amount,
            "client_id": e.client_id,
            "source_event_id": e.id,
        })
        total += amount

    for m in payload.manual_items or []:
        desc = (m.description or "").strip()
        if not desc:
            raise HTTPException(status_code=400, detail="Manual reimbursement description is required")
        amount = Decimal(str(m.amount))
        if amount <= 0:
            raise HTTPException(status_code=400, detail="Manual reimbursement amount must be > 0")
        source_event_id = m.source_event_id
        if source_event_id is not None:
            src = db.query(Event).filter(Event.id == source_event_id).first()
            if not src:
                raise HTTPException(status_code=400, detail="Manual reimbursement source event not found")
            if src.user_id != current.id:
                raise HTTPException(status_code=403, detail="Manual reimbursement source event does not belong to you")
            if not (
                src.start_ts >= datetime.combine(period_start, datetime.min.time())
                and src.start_ts < datetime.combine(period_end + timedelta(days=1), datetime.min.time())
            ):
                raise HTTPException(status_code=400, detail="Manual reimbursement source event is outside this reimbursement period")
            if source_event_id in used_event_ids:
                raise HTTPException(status_code=400, detail="Manual reimbursement source event already claimed")
        all_items.append({
            "item_date": m.item_date,
            "description": desc,
            "amount": amount,
            "client_id": None,
            "source_event_id": source_event_id,
        })
        total += amount
        if source_event_id is not None:
            used_event_ids.add(source_event_id)

    if not all_items:
        raise HTTPException(status_code=400, detail="No reimbursement items to submit for this period")

    req = CashReimbursementRequest(
        user_id=current.id,
        period_start=period_start,
        period_end=period_end,
        total_amount=total,
        status="pending_approval",
    )
    db.add(req)
    db.flush()

    for row in all_items:
        db.add(CashReimbursementItem(
            request_id=req.id,
            item_date=row["item_date"],
            description=row["description"],
            amount=row["amount"],
            client_id=row["client_id"],
            source_event_id=row["source_event_id"],
        ))

    db.query(CashReimbursementDraft).filter(
        CashReimbursementDraft.user_id == current.id,
        CashReimbursementDraft.period_start == period_start,
        CashReimbursementDraft.period_end == period_end,
    ).delete(synchronize_session=False)

    db.commit()
    db.refresh(req)
    _ = req.user
    _ = req.items
    return req


@app.post("/finance/reimbursements/{request_id}/decision", response_model=CashReimbursementRequestOut)
def decide_cash_reimbursement(
    request_id: int,
    payload: CashReimbursementDecisionIn,
    db: Session = Depends(get_db),
    current: User = Depends(get_current_user),
):
    req = _load_reimbursement_request(db, request_id)
    if not req:
        raise HTTPException(status_code=404, detail="Reimbursement request not found")
    if req.status in {"amount_reimbursed", "rejected"}:
        raise HTTPException(status_code=400, detail="Request already finalized")
    if req.status == "pending_reimbursement":
        raise HTTPException(status_code=400, detail="Request is already approved and awaiting reimbursement")

    decision = "approved" if payload.approve else "rejected"
    comment = (payload.comment or "").strip()
    if not payload.approve and not comment:
        raise HTTPException(status_code=400, detail="Comment is required when denying")

    role = (current.role or "").strip().lower()
    now = datetime.utcnow()
    if role in {"admin", "ceo"}:
        req.ceo_decision = decision
        req.ceo_comment = comment or None
        req.ceo_decided_at = now
    elif role == "finance":
        req.finance_decision = decision
        req.finance_comment = comment or None
        req.finance_decided_at = now
    else:
        raise HTTPException(status_code=403, detail="Not allowed")

    if req.ceo_decision == "rejected" or req.finance_decision == "rejected":
        req.status = "rejected"
    elif req.ceo_decision == "approved" and req.finance_decision == "approved":
        req.status = "pending_reimbursement"
    else:
        req.status = "pending_approval"

    db.commit()
    db.refresh(req)
    _ = req.user
    _ = req.items
    return req


@app.post("/finance/reimbursements/{request_id}/reimburse", response_model=CashReimbursementRequestOut)
def mark_cash_reimbursement_paid(
    request_id: int,
    db: Session = Depends(get_db),
    current: User = Depends(get_current_user),
):
    role = (current.role or "").strip().lower()
    if role != "ceo":
        raise HTTPException(status_code=403, detail="Only CEO can mark reimbursement as paid")

    req = _load_reimbursement_request(db, request_id)
    if not req:
        raise HTTPException(status_code=404, detail="Reimbursement request not found")
    if req.status == "amount_reimbursed":
        raise HTTPException(status_code=400, detail="Request is already marked reimbursed")
    if req.status != "pending_reimbursement":
        raise HTTPException(status_code=400, detail="Only approved reimbursements can be marked reimbursed")

    req.status = "amount_reimbursed"
    req.reimbursed_by_id = current.id
    req.reimbursed_at = datetime.utcnow()
    db.commit()
    db.refresh(req)
    _ = req.user
    _ = req.items
    return req


def _load_cash_requisition_request(db: Session, request_id: int) -> Optional[CashRequisitionRequest]:
    req = db.query(CashRequisitionRequest).filter(CashRequisitionRequest.id == request_id).first()
    if not req:
        return None
    _ = req.user
    return req


@app.post("/finance/requisitions", response_model=CashRequisitionRequestOut)
def submit_cash_requisition(
    payload: CashRequisitionCreateIn,
    db: Session = Depends(get_db),
    current: User = Depends(get_current_user),
):
    amount = Decimal(str(payload.amount or 0))
    if amount <= 0:
        raise HTTPException(status_code=400, detail="amount must be > 0")
    purpose = (payload.purpose or "").strip()
    if not purpose:
        raise HTTPException(status_code=400, detail="purpose is required")
    if len(purpose) > 255:
        raise HTTPException(status_code=400, detail="purpose must be <= 255 characters")
    details = (payload.details or "").strip()
    if len(details) > 2000:
        raise HTTPException(status_code=400, detail="details must be <= 2000 characters")

    req = CashRequisitionRequest(
        user_id=current.id,
        amount=amount,
        purpose=purpose,
        details=details or None,
        needed_by=payload.needed_by,
        status="pending_finance_review",
        submitted_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
    )
    db.add(req)
    db.commit()
    db.refresh(req)
    _ = req.user
    return req


@app.get("/finance/requisitions/my", response_model=List[CashRequisitionRequestOut])
def list_my_cash_requisitions(
    db: Session = Depends(get_db),
    current: User = Depends(get_current_user),
):
    rows = (
        db.query(CashRequisitionRequest)
        .filter(CashRequisitionRequest.user_id == current.id)
        .order_by(CashRequisitionRequest.submitted_at.desc(), CashRequisitionRequest.id.desc())
        .all()
    )
    for r in rows:
        _ = r.user
    return rows


@app.get("/finance/requisitions/pending", response_model=List[CashRequisitionRequestOut])
def list_pending_cash_requisitions(
    db: Session = Depends(get_db),
    current: User = Depends(get_current_user),
):
    role = (current.role or "").strip().lower()
    if role not in {"finance", "admin", "ceo"}:
        raise HTTPException(status_code=403, detail="Not allowed")

    q = db.query(CashRequisitionRequest)
    if role == "finance":
        q = q.filter(CashRequisitionRequest.status == "pending_finance_review")
    else:
        q = q.filter(CashRequisitionRequest.status == "pending_ceo_approval")

    rows = q.order_by(CashRequisitionRequest.submitted_at.asc(), CashRequisitionRequest.id.asc()).all()
    for r in rows:
        _ = r.user
    return rows


@app.get("/finance/requisitions/approved", response_model=List[CashRequisitionRequestOut])
def list_approved_cash_requisitions(
    db: Session = Depends(get_db),
    current: User = Depends(get_current_user),
):
    role = (current.role or "").strip().lower()
    if role not in {"finance", "admin", "ceo"}:
        raise HTTPException(status_code=403, detail="Not allowed")

    rows = (
        db.query(CashRequisitionRequest)
        .filter(CashRequisitionRequest.status.in_(["pending_disbursement", "disbursed", "rejected"]))
        .order_by(CashRequisitionRequest.submitted_at.desc(), CashRequisitionRequest.id.desc())
        .all()
    )
    for r in rows:
        _ = r.user
    return rows


@app.post("/finance/requisitions/{request_id}/decision", response_model=CashRequisitionRequestOut)
def decide_cash_requisition(
    request_id: int,
    payload: CashRequisitionDecisionIn,
    db: Session = Depends(get_db),
    current: User = Depends(get_current_user),
):
    req = _load_cash_requisition_request(db, request_id)
    if not req:
        raise HTTPException(status_code=404, detail="Cash requisition request not found")
    if req.status in {"disbursed", "rejected"}:
        raise HTTPException(status_code=400, detail=f"Request already {req.status}")

    role = (current.role or "").strip().lower()
    now = datetime.utcnow()
    decision = "approved" if payload.approve else "rejected"
    comment = (payload.comment or "").strip()
    if decision == "rejected" and not comment:
        raise HTTPException(status_code=400, detail="comment is required when rejecting")

    if role == "finance":
        if req.status != "pending_finance_review":
            raise HTTPException(status_code=400, detail="Finance can only decide pending finance review requests")
        req.finance_decision = decision
        req.finance_comment = comment or None
        req.finance_decided_at = now
        req.finance_decided_by_id = current.id
        req.status = "pending_ceo_approval" if decision == "approved" else "rejected"
    elif role in {"admin", "ceo"}:
        if req.status != "pending_ceo_approval":
            raise HTTPException(status_code=400, detail="CEO/Admin can only decide pending CEO approval requests")
        req.ceo_decision = decision
        req.ceo_comment = comment or None
        req.ceo_decided_at = now
        req.ceo_decided_by_id = current.id
        req.status = "pending_disbursement" if decision == "approved" else "rejected"
    else:
        raise HTTPException(status_code=403, detail="Not allowed")

    req.updated_at = now
    db.commit()
    db.refresh(req)
    _ = req.user
    return req


@app.post("/finance/requisitions/{request_id}/disburse", response_model=CashRequisitionRequestOut)
def mark_cash_requisition_disbursed(
    request_id: int,
    payload: CashRequisitionDisburseIn,
    db: Session = Depends(get_db),
    current: User = Depends(get_current_user),
):
    role = (current.role or "").strip().lower()
    if role not in {"finance", "admin", "ceo"}:
        raise HTTPException(status_code=403, detail="Only finance/admin/ceo can mark disbursed")

    req = _load_cash_requisition_request(db, request_id)
    if not req:
        raise HTTPException(status_code=404, detail="Cash requisition request not found")
    if req.status == "disbursed":
        raise HTTPException(status_code=400, detail="Request already disbursed")
    if req.status != "pending_disbursement":
        raise HTTPException(status_code=400, detail="Only approved requisitions can be marked disbursed")

    note = (payload.note or "").strip()
    if len(note) > 1000:
        raise HTTPException(status_code=400, detail="disbursement note must be <= 1000 characters")

    req.status = "disbursed"
    req.disbursed_at = datetime.utcnow()
    req.disbursed_note = note or None
    req.disbursed_by_id = current.id
    req.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(req)
    _ = req.user
    return req


def _load_authority_to_incur_request(db: Session, request_id: int) -> Optional[AuthorityToIncurRequest]:
    req = db.query(AuthorityToIncurRequest).filter(AuthorityToIncurRequest.id == request_id).first()
    if not req:
        return None
    _ = req.user
    return req


@app.post("/finance/authority-to-incur", response_model=AuthorityToIncurRequestOut)
def submit_authority_to_incur_request(
    payload: AuthorityToIncurCreateIn,
    db: Session = Depends(get_db),
    current: User = Depends(get_current_user),
):
    amount = Decimal(str(payload.amount or 0))
    if amount <= 0:
        raise HTTPException(status_code=400, detail="amount must be > 0")
    title = (payload.title or "").strip()
    if not title:
        raise HTTPException(status_code=400, detail="title is required")
    if len(title) > 255:
        raise HTTPException(status_code=400, detail="title must be <= 255 characters")
    payee = (payload.payee or "").strip()
    if len(payee) > 255:
        raise HTTPException(status_code=400, detail="payee must be <= 255 characters")
    details = (payload.details or "").strip()
    if len(details) > 2000:
        raise HTTPException(status_code=400, detail="details must be <= 2000 characters")

    req = AuthorityToIncurRequest(
        user_id=current.id,
        amount=amount,
        title=title,
        payee=payee or None,
        details=details or None,
        needed_by=payload.needed_by,
        status="pending_finance_review",
        submitted_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
    )
    db.add(req)
    db.commit()
    db.refresh(req)
    _ = req.user
    return req


@app.get("/finance/authority-to-incur/my", response_model=List[AuthorityToIncurRequestOut])
def list_my_authority_to_incur_requests(
    db: Session = Depends(get_db),
    current: User = Depends(get_current_user),
):
    rows = (
        db.query(AuthorityToIncurRequest)
        .filter(AuthorityToIncurRequest.user_id == current.id)
        .order_by(AuthorityToIncurRequest.submitted_at.desc(), AuthorityToIncurRequest.id.desc())
        .all()
    )
    for r in rows:
        _ = r.user
    return rows


@app.get("/finance/authority-to-incur/pending", response_model=List[AuthorityToIncurRequestOut])
def list_pending_authority_to_incur_requests(
    db: Session = Depends(get_db),
    current: User = Depends(get_current_user),
):
    role = (current.role or "").strip().lower()
    if role not in {"finance", "admin", "ceo"}:
        raise HTTPException(status_code=403, detail="Not allowed")

    q = db.query(AuthorityToIncurRequest)
    if role == "finance":
        q = q.filter(AuthorityToIncurRequest.status == "pending_finance_review")
    else:
        q = q.filter(AuthorityToIncurRequest.status == "pending_ceo_approval")

    rows = q.order_by(AuthorityToIncurRequest.submitted_at.asc(), AuthorityToIncurRequest.id.asc()).all()
    for r in rows:
        _ = r.user
    return rows


@app.get("/finance/authority-to-incur/approved", response_model=List[AuthorityToIncurRequestOut])
def list_approved_authority_to_incur_requests(
    db: Session = Depends(get_db),
    current: User = Depends(get_current_user),
):
    role = (current.role or "").strip().lower()
    if role not in {"finance", "admin", "ceo"}:
        raise HTTPException(status_code=403, detail="Not allowed")

    rows = (
        db.query(AuthorityToIncurRequest)
        .filter(AuthorityToIncurRequest.status.in_(["pending_incurrence", "incurred", "rejected"]))
        .order_by(AuthorityToIncurRequest.submitted_at.desc(), AuthorityToIncurRequest.id.desc())
        .all()
    )
    for r in rows:
        _ = r.user
    return rows


@app.post("/finance/authority-to-incur/{request_id}/decision", response_model=AuthorityToIncurRequestOut)
def decide_authority_to_incur_request(
    request_id: int,
    payload: AuthorityToIncurDecisionIn,
    db: Session = Depends(get_db),
    current: User = Depends(get_current_user),
):
    req = _load_authority_to_incur_request(db, request_id)
    if not req:
        raise HTTPException(status_code=404, detail="Authority to incur request not found")
    if req.status in {"incurred", "rejected"}:
        raise HTTPException(status_code=400, detail=f"Request already {req.status}")

    role = (current.role or "").strip().lower()
    now = datetime.utcnow()
    decision = "approved" if payload.approve else "rejected"
    comment = (payload.comment or "").strip()
    if decision == "rejected" and not comment:
        raise HTTPException(status_code=400, detail="comment is required when rejecting")

    if role == "finance":
        if req.status != "pending_finance_review":
            raise HTTPException(status_code=400, detail="Finance can only decide pending finance review requests")
        req.finance_decision = decision
        req.finance_comment = comment or None
        req.finance_decided_at = now
        req.finance_decided_by_id = current.id
        req.status = "pending_ceo_approval" if decision == "approved" else "rejected"
    elif role in {"admin", "ceo"}:
        if req.status != "pending_ceo_approval":
            raise HTTPException(status_code=400, detail="CEO/Admin can only decide pending CEO approval requests")
        req.ceo_decision = decision
        req.ceo_comment = comment or None
        req.ceo_decided_at = now
        req.ceo_decided_by_id = current.id
        req.status = "pending_incurrence" if decision == "approved" else "rejected"
    else:
        raise HTTPException(status_code=403, detail="Not allowed")

    req.updated_at = now
    db.commit()
    db.refresh(req)
    _ = req.user
    return req


@app.post("/finance/authority-to-incur/{request_id}/incur", response_model=AuthorityToIncurRequestOut)
def mark_authority_to_incur_incurred(
    request_id: int,
    payload: AuthorityToIncurIncurIn,
    db: Session = Depends(get_db),
    current: User = Depends(get_current_user),
):
    role = (current.role or "").strip().lower()
    if role not in {"finance", "admin", "ceo"}:
        raise HTTPException(status_code=403, detail="Only finance/admin/ceo can mark incurred")

    req = _load_authority_to_incur_request(db, request_id)
    if not req:
        raise HTTPException(status_code=404, detail="Authority to incur request not found")
    if req.status == "incurred":
        raise HTTPException(status_code=400, detail="Request already incurred")
    if req.status != "pending_incurrence":
        raise HTTPException(status_code=400, detail="Only approved requests can be marked incurred")

    note = (payload.note or "").strip()
    if len(note) > 1000:
        raise HTTPException(status_code=400, detail="incurrence note must be <= 1000 characters")

    req.status = "incurred"
    req.incurred_at = datetime.utcnow()
    req.incurred_note = note or None
    req.incurred_by_id = current.id
    req.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(req)
    _ = req.user
    return req


def _load_salary_advance_request(db: Session, request_id: int) -> Optional[SalaryAdvanceRequest]:
    req = db.query(SalaryAdvanceRequest).filter(SalaryAdvanceRequest.id == request_id).first()
    if not req:
        return None
    _ = req.user
    return req


@app.post("/finance/salary-advances", response_model=SalaryAdvanceRequestOut)
def submit_salary_advance_request(
    payload: SalaryAdvanceCreateIn,
    db: Session = Depends(get_db),
    current: User = Depends(get_current_user),
):
    amount = Decimal(str(payload.amount or 0))
    if amount <= 0:
        raise HTTPException(status_code=400, detail="amount must be > 0")
    reason = (payload.reason or "").strip()
    if not reason:
        raise HTTPException(status_code=400, detail="reason is required")
    if len(reason) > 255:
        raise HTTPException(status_code=400, detail="reason must be <= 255 characters")
    details = (payload.details or "").strip()
    if len(details) > 2000:
        raise HTTPException(status_code=400, detail="details must be <= 2000 characters")
    repayment_months = int(payload.repayment_months or 0)
    if repayment_months < 1 or repayment_months > 24:
        raise HTTPException(status_code=400, detail="repayment_months must be between 1 and 24")

    req = SalaryAdvanceRequest(
        user_id=current.id,
        amount=amount,
        reason=reason,
        details=details or None,
        repayment_months=repayment_months,
        deduction_start_date=None,
        status="pending_finance_review",
        submitted_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
    )
    db.add(req)
    db.commit()
    db.refresh(req)
    _ = req.user
    return req


@app.get("/finance/salary-advances/my", response_model=List[SalaryAdvanceRequestOut])
def list_my_salary_advance_requests(
    db: Session = Depends(get_db),
    current: User = Depends(get_current_user),
):
    rows = (
        db.query(SalaryAdvanceRequest)
        .filter(SalaryAdvanceRequest.user_id == current.id)
        .order_by(SalaryAdvanceRequest.submitted_at.desc(), SalaryAdvanceRequest.id.desc())
        .all()
    )
    for r in rows:
        _ = r.user
    return rows


@app.get("/finance/salary-advances/pending", response_model=List[SalaryAdvanceRequestOut])
def list_pending_salary_advance_requests(
    db: Session = Depends(get_db),
    current: User = Depends(get_current_user),
):
    role = (current.role or "").strip().lower()
    if role not in {"finance", "admin", "ceo"}:
        raise HTTPException(status_code=403, detail="Not allowed")

    q = db.query(SalaryAdvanceRequest)
    if role == "finance":
        q = q.filter(SalaryAdvanceRequest.status == "pending_finance_review")
    else:
        q = q.filter(SalaryAdvanceRequest.status == "pending_ceo_approval")

    rows = q.order_by(SalaryAdvanceRequest.submitted_at.asc(), SalaryAdvanceRequest.id.asc()).all()
    for r in rows:
        _ = r.user
    return rows


@app.get("/finance/salary-advances/approved", response_model=List[SalaryAdvanceRequestOut])
def list_approved_salary_advance_requests(
    db: Session = Depends(get_db),
    current: User = Depends(get_current_user),
):
    role = (current.role or "").strip().lower()
    if role not in {"finance", "admin", "ceo"}:
        raise HTTPException(status_code=403, detail="Not allowed")

    rows = (
        db.query(SalaryAdvanceRequest)
        .filter(SalaryAdvanceRequest.status.in_(["pending_disbursement", "disbursed", "rejected"]))
        .order_by(SalaryAdvanceRequest.submitted_at.desc(), SalaryAdvanceRequest.id.desc())
        .all()
    )
    for r in rows:
        _ = r.user
    return rows


@app.post("/finance/salary-advances/{request_id}/decision", response_model=SalaryAdvanceRequestOut)
def decide_salary_advance_request(
    request_id: int,
    payload: SalaryAdvanceDecisionIn,
    db: Session = Depends(get_db),
    current: User = Depends(get_current_user),
):
    req = _load_salary_advance_request(db, request_id)
    if not req:
        raise HTTPException(status_code=404, detail="Salary advance request not found")
    if req.status in {"disbursed", "rejected"}:
        raise HTTPException(status_code=400, detail=f"Request already {req.status}")

    role = (current.role or "").strip().lower()
    now = datetime.utcnow()
    decision = "approved" if payload.approve else "rejected"
    comment = (payload.comment or "").strip()
    if decision == "rejected" and not comment:
        raise HTTPException(status_code=400, detail="comment is required when rejecting")

    if role == "finance":
        if req.status != "pending_finance_review":
            raise HTTPException(status_code=400, detail="Finance can only decide pending finance review requests")
        req.finance_decision = decision
        req.finance_comment = comment or None
        req.finance_decided_at = now
        req.finance_decided_by_id = current.id
        req.status = "pending_ceo_approval" if decision == "approved" else "rejected"
    elif role in {"admin", "ceo"}:
        if req.status != "pending_ceo_approval":
            raise HTTPException(status_code=400, detail="CEO/Admin can only decide pending CEO approval requests")
        req.ceo_decision = decision
        req.ceo_comment = comment or None
        req.ceo_decided_at = now
        req.ceo_decided_by_id = current.id
        req.status = "pending_disbursement" if decision == "approved" else "rejected"
    else:
        raise HTTPException(status_code=403, detail="Not allowed")

    req.updated_at = now
    db.commit()
    db.refresh(req)
    _ = req.user
    return req


@app.post("/finance/salary-advances/{request_id}/disburse", response_model=SalaryAdvanceRequestOut)
def mark_salary_advance_disbursed(
    request_id: int,
    payload: SalaryAdvanceDisburseIn,
    db: Session = Depends(get_db),
    current: User = Depends(get_current_user),
):
    role = (current.role or "").strip().lower()
    if role not in {"finance", "admin", "ceo"}:
        raise HTTPException(status_code=403, detail="Only finance/admin/ceo can mark disbursed")

    req = _load_salary_advance_request(db, request_id)
    if not req:
        raise HTTPException(status_code=404, detail="Salary advance request not found")
    if req.status == "disbursed":
        raise HTTPException(status_code=400, detail="Request already disbursed")
    if req.status != "pending_disbursement":
        raise HTTPException(status_code=400, detail="Only approved salary advances can be marked disbursed")

    note = (payload.note or "").strip()
    if len(note) > 1000:
        raise HTTPException(status_code=400, detail="disbursement note must be <= 1000 characters")
    if req.deduction_start_date is None:
        raise HTTPException(status_code=400, detail="Set deduction_start_date before marking disbursed")

    req.status = "disbursed"
    req.disbursed_at = datetime.utcnow()
    req.disbursed_note = note or None
    req.disbursed_by_id = current.id
    req.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(req)
    _ = req.user
    return req


@app.post("/finance/salary-advances/{request_id}/deduction-start", response_model=SalaryAdvanceRequestOut)
def set_salary_advance_deduction_start(
    request_id: int,
    deduction_start_date: date = Form(...),
    db: Session = Depends(get_db),
    current: User = Depends(get_current_user),
):
    role = (current.role or "").strip().lower()
    if role not in {"finance", "admin", "ceo"}:
        raise HTTPException(status_code=403, detail="Only finance/admin/ceo can set deduction start date")

    req = _load_salary_advance_request(db, request_id)
    if not req:
        raise HTTPException(status_code=404, detail="Salary advance request not found")
    if req.status not in {"pending_ceo_approval", "pending_disbursement"}:
        raise HTTPException(status_code=400, detail="Deduction start date can only be set after finance approval")

    req.deduction_start_date = deduction_start_date
    req.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(req)
    _ = req.user
    return req


PERFORMANCE_GOAL_STATUSES = {"active", "on_track", "at_risk", "completed", "paused", "cancelled"}


def _is_performance_manager(role: Optional[str]) -> bool:
    return (role or "").strip().lower() in {"supervisor", "admin", "ceo"}


def _normalize_performance_status(raw_status: Optional[str]) -> str:
    status = (raw_status or "active").strip().lower().replace(" ", "_")
    if status not in PERFORMANCE_GOAL_STATUSES:
        raise HTTPException(status_code=400, detail=f"status must be one of: {', '.join(sorted(PERFORMANCE_GOAL_STATUSES))}")
    return status


def _validate_goal_date_range(period_start: Optional[date], period_end: Optional[date]) -> None:
    if period_start and period_end and period_start > period_end:
        raise HTTPException(status_code=400, detail="period_start cannot be after period_end")


@app.get("/performance/users", response_model=List[PerformanceAssignableUserOut])
def list_performance_users(
    db: Session = Depends(get_db),
    current: User = Depends(get_current_user),
):
    role = (current.role or "").strip().lower()
    if role in {"admin", "ceo"}:
        rows = db.query(User).order_by(User.name.asc()).all()
    elif role == "supervisor":
        dept = (current.department or "").strip()
        if not dept:
            raise HTTPException(status_code=400, detail="Supervisor profile missing department")
        rows = (
            db.query(User)
            .filter(User.department == dept)
            .order_by(User.name.asc())
            .all()
        )
    else:
        rows = [current]

    return [
        PerformanceAssignableUserOut(
            id=u.id,
            name=u.name,
            role=u.role,
            department=u.department,
        )
        for u in rows
    ]


@app.get("/performance/company-goals", response_model=List[PerformanceCompanyGoalOut])
def list_company_goals(
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    rows = db.query(PerformanceCompanyGoal).order_by(PerformanceCompanyGoal.created_at.desc(), PerformanceCompanyGoal.id.desc()).all()
    for row in rows:
        _ = row.created_by
    return rows


@app.post("/performance/company-goals", response_model=PerformanceCompanyGoalOut)
def create_company_goal(
    payload: PerformanceCompanyGoalIn,
    db: Session = Depends(get_db),
    current: User = Depends(get_current_user),
):
    if not _is_admin_like(current.role):
        raise HTTPException(status_code=403, detail="Only admin/ceo can create company goals")
    title = (payload.title or "").strip()
    if not title:
        raise HTTPException(status_code=400, detail="title is required")
    if len(title) > 255:
        raise HTTPException(status_code=400, detail="title must be <= 255 characters")
    description = (payload.description or "").strip()
    if len(description) > 3000:
        raise HTTPException(status_code=400, detail="description must be <= 3000 characters")
    _validate_goal_date_range(payload.period_start, payload.period_end)

    row = PerformanceCompanyGoal(
        title=title,
        description=description or None,
        period_start=payload.period_start,
        period_end=payload.period_end,
        status=_normalize_performance_status(payload.status),
        created_by_id=current.id,
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    _ = row.created_by
    return row


@app.patch("/performance/company-goals/{goal_id}", response_model=PerformanceCompanyGoalOut)
def update_company_goal(
    goal_id: int,
    payload: PerformanceCompanyGoalIn,
    db: Session = Depends(get_db),
    current: User = Depends(get_current_user),
):
    if not _is_admin_like(current.role):
        raise HTTPException(status_code=403, detail="Only admin/ceo can update company goals")
    row = db.query(PerformanceCompanyGoal).filter(PerformanceCompanyGoal.id == goal_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Company goal not found")

    title = (payload.title or "").strip()
    if not title:
        raise HTTPException(status_code=400, detail="title is required")
    if len(title) > 255:
        raise HTTPException(status_code=400, detail="title must be <= 255 characters")
    description = (payload.description or "").strip()
    if len(description) > 3000:
        raise HTTPException(status_code=400, detail="description must be <= 3000 characters")
    _validate_goal_date_range(payload.period_start, payload.period_end)

    row.title = title
    row.description = description or None
    row.period_start = payload.period_start
    row.period_end = payload.period_end
    row.status = _normalize_performance_status(payload.status)
    row.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(row)
    _ = row.created_by
    return row


@app.get("/performance/department-goals", response_model=List[PerformanceDepartmentGoalOut])
def list_department_goals(
    db: Session = Depends(get_db),
    current: User = Depends(get_current_user),
):
    role = (current.role or "").strip().lower()
    q = db.query(PerformanceDepartmentGoal)
    if role == "employee":
        dept = (current.department or "").strip()
        if dept:
            q = q.filter(PerformanceDepartmentGoal.department == dept)
        else:
            q = q.filter(PerformanceDepartmentGoal.id == -1)
    elif role == "supervisor":
        dept = (current.department or "").strip()
        if dept:
            q = q.filter(PerformanceDepartmentGoal.department == dept)
        else:
            q = q.filter(PerformanceDepartmentGoal.id == -1)

    rows = q.order_by(PerformanceDepartmentGoal.created_at.desc(), PerformanceDepartmentGoal.id.desc()).all()
    for row in rows:
        _ = row.created_by
        _ = row.company_goal
        _ = row.company_goal.created_by
    return rows


@app.post("/performance/department-goals", response_model=PerformanceDepartmentGoalOut)
def create_department_goal(
    payload: PerformanceDepartmentGoalIn,
    db: Session = Depends(get_db),
    current: User = Depends(get_current_user),
):
    if not _is_performance_manager(current.role):
        raise HTTPException(status_code=403, detail="Only supervisors/admin/ceo can create department goals")

    company_goal = db.query(PerformanceCompanyGoal).filter(PerformanceCompanyGoal.id == payload.company_goal_id).first()
    if not company_goal:
        raise HTTPException(status_code=404, detail="Company goal not found")
    department = (payload.department or "").strip()
    if not department:
        raise HTTPException(status_code=400, detail="department is required")
    if len(department) > 120:
        raise HTTPException(status_code=400, detail="department must be <= 120 characters")
    if (current.role or "").strip().lower() == "supervisor":
        my_dept = (current.department or "").strip()
        if not my_dept:
            raise HTTPException(status_code=400, detail="Supervisor profile missing department")
        if department.lower() != my_dept.lower():
            raise HTTPException(status_code=403, detail="Supervisors can only create goals for their own department")

    title = (payload.title or "").strip()
    if not title:
        raise HTTPException(status_code=400, detail="title is required")
    if len(title) > 255:
        raise HTTPException(status_code=400, detail="title must be <= 255 characters")
    description = (payload.description or "").strip()
    if len(description) > 3000:
        raise HTTPException(status_code=400, detail="description must be <= 3000 characters")
    _validate_goal_date_range(payload.period_start, payload.period_end)

    row = PerformanceDepartmentGoal(
        company_goal_id=payload.company_goal_id,
        department=department,
        title=title,
        description=description or None,
        period_start=payload.period_start,
        period_end=payload.period_end,
        status=_normalize_performance_status(payload.status),
        created_by_id=current.id,
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    _ = row.created_by
    _ = row.company_goal
    _ = row.company_goal.created_by
    return row


@app.patch("/performance/department-goals/{goal_id}", response_model=PerformanceDepartmentGoalOut)
def update_department_goal(
    goal_id: int,
    payload: PerformanceDepartmentGoalIn,
    db: Session = Depends(get_db),
    current: User = Depends(get_current_user),
):
    if not _is_performance_manager(current.role):
        raise HTTPException(status_code=403, detail="Only supervisors/admin/ceo can update department goals")

    row = db.query(PerformanceDepartmentGoal).filter(PerformanceDepartmentGoal.id == goal_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Department goal not found")
    company_goal = db.query(PerformanceCompanyGoal).filter(PerformanceCompanyGoal.id == payload.company_goal_id).first()
    if not company_goal:
        raise HTTPException(status_code=404, detail="Company goal not found")

    department = (payload.department or "").strip()
    if not department:
        raise HTTPException(status_code=400, detail="department is required")
    if len(department) > 120:
        raise HTTPException(status_code=400, detail="department must be <= 120 characters")
    if (current.role or "").strip().lower() == "supervisor":
        my_dept = (current.department or "").strip()
        if not my_dept:
            raise HTTPException(status_code=400, detail="Supervisor profile missing department")
        if department.lower() != my_dept.lower():
            raise HTTPException(status_code=403, detail="Supervisors can only update goals for their own department")

    title = (payload.title or "").strip()
    if not title:
        raise HTTPException(status_code=400, detail="title is required")
    if len(title) > 255:
        raise HTTPException(status_code=400, detail="title must be <= 255 characters")
    description = (payload.description or "").strip()
    if len(description) > 3000:
        raise HTTPException(status_code=400, detail="description must be <= 3000 characters")
    _validate_goal_date_range(payload.period_start, payload.period_end)

    row.company_goal_id = payload.company_goal_id
    row.department = department
    row.title = title
    row.description = description or None
    row.period_start = payload.period_start
    row.period_end = payload.period_end
    row.status = _normalize_performance_status(payload.status)
    row.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(row)
    _ = row.created_by
    _ = row.company_goal
    _ = row.company_goal.created_by
    return row


@app.get("/performance/employee-goals", response_model=List[PerformanceEmployeeGoalOut])
def list_employee_goals(
    user_id: Optional[int] = Query(default=None),
    db: Session = Depends(get_db),
    current: User = Depends(get_current_user),
):
    role = (current.role or "").strip().lower()
    q = db.query(PerformanceEmployeeGoal)
    if role == "employee":
        q = q.filter(PerformanceEmployeeGoal.user_id == current.id)
    elif role == "supervisor":
        dept = (current.department or "").strip()
        if not dept:
            q = q.filter(PerformanceEmployeeGoal.id == -1)
        else:
            q = q.join(User, User.id == PerformanceEmployeeGoal.user_id).filter(User.department == dept)

    if user_id is not None:
        if role == "employee" and user_id != current.id:
            raise HTTPException(status_code=403, detail="Not allowed")
        q = q.filter(PerformanceEmployeeGoal.user_id == user_id)

    rows = q.order_by(PerformanceEmployeeGoal.created_at.desc(), PerformanceEmployeeGoal.id.desc()).all()
    for row in rows:
        _ = row.user
        _ = row.department_goal
        _ = row.department_goal.company_goal
        _ = row.department_goal.company_goal.created_by
        _ = row.department_goal.created_by
        _ = row.created_by
        _ = row.updated_by
    return rows


@app.post("/performance/employee-goals", response_model=PerformanceEmployeeGoalOut)
def create_employee_goal(
    payload: PerformanceEmployeeGoalIn,
    db: Session = Depends(get_db),
    current: User = Depends(get_current_user),
):
    if not _is_performance_manager(current.role):
        raise HTTPException(status_code=403, detail="Only supervisors/admin/ceo can create employee goals")
    target_user = db.query(User).filter(User.id == payload.user_id).first()
    if not target_user:
        raise HTTPException(status_code=404, detail="Employee not found")
    dept_goal = db.query(PerformanceDepartmentGoal).filter(PerformanceDepartmentGoal.id == payload.department_goal_id).first()
    if not dept_goal:
        raise HTTPException(status_code=404, detail="Department goal not found")

    target_department = (target_user.department or "").strip()
    goal_department = (dept_goal.department or "").strip()
    if not target_department:
        raise HTTPException(status_code=400, detail="Target user has no department configured")
    if target_department.lower() != goal_department.lower():
        raise HTTPException(status_code=400, detail="Employee goal must match target user's department goal")

    if (current.role or "").strip().lower() == "supervisor":
        my_dept = (current.department or "").strip()
        if not my_dept:
            raise HTTPException(status_code=400, detail="Supervisor profile missing department")
        if target_department.lower() != my_dept.lower():
            raise HTTPException(status_code=403, detail="Supervisors can only assign goals in their own department")

    title = (payload.title or "").strip()
    if not title:
        raise HTTPException(status_code=400, detail="title is required")
    if len(title) > 255:
        raise HTTPException(status_code=400, detail="title must be <= 255 characters")
    description = (payload.description or "").strip()
    if len(description) > 3000:
        raise HTTPException(status_code=400, detail="description must be <= 3000 characters")
    self_comment = (payload.self_comment or "").strip()
    manager_comment = (payload.manager_comment or "").strip()
    if len(self_comment) > 2000 or len(manager_comment) > 2000:
        raise HTTPException(status_code=400, detail="comments must be <= 2000 characters")
    progress = int(payload.progress_percent or 0)
    if progress < 0 or progress > 100:
        raise HTTPException(status_code=400, detail="progress_percent must be between 0 and 100")

    row = PerformanceEmployeeGoal(
        department_goal_id=payload.department_goal_id,
        user_id=payload.user_id,
        title=title,
        description=description or None,
        progress_percent=progress,
        status=_normalize_performance_status(payload.status),
        self_comment=self_comment or None,
        manager_comment=manager_comment or None,
        created_by_id=current.id,
        updated_by_id=current.id,
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    _ = row.user
    _ = row.department_goal
    _ = row.department_goal.company_goal
    _ = row.department_goal.company_goal.created_by
    _ = row.department_goal.created_by
    _ = row.created_by
    _ = row.updated_by
    return row


@app.patch("/performance/employee-goals/{goal_id}", response_model=PerformanceEmployeeGoalOut)
def update_employee_goal(
    goal_id: int,
    payload: PerformanceEmployeeGoalUpdateIn,
    db: Session = Depends(get_db),
    current: User = Depends(get_current_user),
):
    row = db.query(PerformanceEmployeeGoal).filter(PerformanceEmployeeGoal.id == goal_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Employee goal not found")

    role = (current.role or "").strip().lower()
    manager = _is_performance_manager(role)
    is_owner = current.id == row.user_id

    if not manager and not is_owner:
        raise HTTPException(status_code=403, detail="Not allowed")

    if role == "supervisor":
        my_dept = (current.department or "").strip()
        goal_user = db.query(User).filter(User.id == row.user_id).first()
        if not goal_user or not goal_user.department or goal_user.department.strip().lower() != my_dept.lower():
            raise HTTPException(status_code=403, detail="Supervisors can only update goals in their own department")

    if is_owner and not manager:
        # Employees can only update their own progress/status/self comments.
        if payload.title is not None or payload.description is not None or payload.manager_comment is not None:
            raise HTTPException(status_code=403, detail="Employees can only update progress, status, and self_comment")

    if payload.title is not None:
        title = payload.title.strip()
        if not title:
            raise HTTPException(status_code=400, detail="title cannot be empty")
        if len(title) > 255:
            raise HTTPException(status_code=400, detail="title must be <= 255 characters")
        row.title = title
    if payload.description is not None:
        desc = payload.description.strip()
        if len(desc) > 3000:
            raise HTTPException(status_code=400, detail="description must be <= 3000 characters")
        row.description = desc or None
    if payload.progress_percent is not None:
        progress = int(payload.progress_percent)
        if progress < 0 or progress > 100:
            raise HTTPException(status_code=400, detail="progress_percent must be between 0 and 100")
        row.progress_percent = progress
    if payload.status is not None:
        row.status = _normalize_performance_status(payload.status)
    if payload.self_comment is not None:
        comment = payload.self_comment.strip()
        if len(comment) > 2000:
            raise HTTPException(status_code=400, detail="self_comment must be <= 2000 characters")
        row.self_comment = comment or None
    if payload.manager_comment is not None:
        if not manager:
            raise HTTPException(status_code=403, detail="Only supervisors/admin/ceo can update manager_comment")
        comment = payload.manager_comment.strip()
        if len(comment) > 2000:
            raise HTTPException(status_code=400, detail="manager_comment must be <= 2000 characters")
        row.manager_comment = comment or None

    row.updated_by_id = current.id
    row.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(row)
    _ = row.user
    _ = row.department_goal
    _ = row.department_goal.company_goal
    _ = row.department_goal.company_goal.created_by
    _ = row.department_goal.created_by
    _ = row.created_by
    _ = row.updated_by
    return row


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
    current: User = Depends(get_current_user),
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

    reimbursement_due = _is_reimbursement_due_day(today)
    reimbursement_period_start, reimbursement_period_end = _biweekly_period_for(today)
    already_submitted_for_period = bool(
        db.query(CashReimbursementRequest.id)
        .filter(
            CashReimbursementRequest.user_id == current.id,
            CashReimbursementRequest.period_start == reimbursement_period_start,
            CashReimbursementRequest.period_end == reimbursement_period_end,
        )
        .first()
    )
    reimbursement_can_submit = reimbursement_due and not already_submitted_for_period
    if already_submitted_for_period:
        reimbursement_submit_message = "You already submitted this period's reimbursement."
    else:
        reimbursement_submit_message = _reimbursement_due_message(today, reimbursement_can_submit)

    return DashboardOverviewOut(
        today=today,
        todays_activities=todays_activities,
        todo_history=history_rows,
        carried_over_activities=carried_over_rows,
        unfinished_count=unfinished_count,
        upcoming_subtasks=[_to_task_reminder(t) for t in upcoming_rows],
        due_subtasks=[_to_task_reminder(t) for t in due_rows],
        reimbursement_can_submit=reimbursement_can_submit,
        reimbursement_submit_due_today=reimbursement_due,
        reimbursement_submit_period_start=reimbursement_period_start,
        reimbursement_submit_period_end=reimbursement_period_end,
        reimbursement_submit_message=reimbursement_submit_message,
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
    if not _is_admin_like(current.role) and row.user_id != current.id:
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

    if _is_admin_like(current.role):
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


@app.get("/admin/users/{user_id}/leave/balance", response_model=LeaveBalanceOut)
def admin_get_user_leave_balance(
    user_id: int,
    as_of: Optional[date] = None,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    target = db.query(User).filter(User.id == user_id).first()
    if not target:
        raise HTTPException(status_code=404, detail="User not found")

    d = as_of or date.today()
    bal = compute_leave_balance(db, target, as_of=d)
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
    _attach_leave_review_metadata(db, e, user, user)

    await broadcast_events_changed("created", e.id)
    return e


@app.post("/leave/requests/{event_id}/approve", response_model=EventOut)
async def approve_leave_request(
    event_id: int,
    db: Session = Depends(get_db),
    approver: User = Depends(require_leave_approver),
):
    e = db.query(Event).filter(Event.id == event_id, Event.type.in_(["Leave", "Hospital"])).first()
    if not e:
        raise HTTPException(status_code=404, detail="Request not found")

    if e.status != "pending":
        raise HTTPException(status_code=400, detail="Only pending requests can be approved")

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
            raise HTTPException(status_code=400, detail="Leave owner has invalid approval setup: second approver must be admin/ceo")

        if approver.id not in {first_approver_id, second_approver_id}:
            raise HTTPException(status_code=403, detail="You are not assigned to approve this request")
        if approver.id == first_approver_id and approver.role != "supervisor":
            raise HTTPException(status_code=403, detail="First approval must be done by the assigned supervisor")
        if approver.id == second_approver_id and not _is_admin_like(approver.role):
            raise HTTPException(status_code=403, detail="Second approval must be done by the assigned admin/ceo")

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
    else:
        designated_approvers: set[int] = set()
        if first_approver_id is not None and _is_supervisor_user(db, first_approver_id):
            designated_approvers.add(first_approver_id)
        if second_approver_id is not None and _is_admin_user(db, second_approver_id):
            designated_approvers.add(second_approver_id)

        if designated_approvers:
            if approver.id not in designated_approvers:
                raise HTTPException(status_code=403, detail="You are not assigned to approve this request")
            if approver.id == first_approver_id and approver.role != "supervisor":
                raise HTTPException(status_code=403, detail="Assigned first approver must be supervisor")
            if approver.id == second_approver_id and not _is_admin_like(approver.role):
                raise HTTPException(status_code=403, detail="Assigned second approver must be admin/ceo")

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
        designated_approvers: set[int] = set()
        if first_approver_id is not None and _is_supervisor_user(db, first_approver_id):
            designated_approvers.add(first_approver_id)
        if second_approver_id is not None and _is_admin_user(db, second_approver_id):
            designated_approvers.add(second_approver_id)
        if designated_approvers:
            if approver.id not in designated_approvers:
                raise HTTPException(status_code=403, detail="You are not assigned to approve this request")
        elif not _is_admin_like(approver.role):
            raise HTTPException(status_code=403, detail="Only admin/ceo can approve single-step leave")
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
    _attach_leave_review_metadata(db, e, approver, owner)

    await broadcast_events_changed("updated", e.id)
    return e


@app.post("/leave/requests/{event_id}/reject", response_model=EventOut)
async def reject_leave_request(
    event_id: int,
    payload: LeaveRejectRequest,
    db: Session = Depends(get_db),
    approver: User = Depends(require_leave_approver),
):
    e = db.query(Event).filter(Event.id == event_id, Event.type.in_(["Leave", "Hospital"])).first()
    if not e:
        raise HTTPException(status_code=404, detail="Request not found")

    if e.status != "pending":
        raise HTTPException(status_code=400, detail="Only pending requests can be rejected")

    owner = db.query(User).filter(User.id == e.user_id).first()
    if not owner:
        raise HTTPException(status_code=400, detail="Event owner not found")

    requires_two_step = bool(owner.require_two_step_leave_approval)
    first_approver_id = owner.first_approver_id
    second_approver_id = owner.second_approver_id

    if requires_two_step:
        allowed = {owner.first_approver_id, owner.second_approver_id}
        if approver.id not in allowed:
            raise HTTPException(status_code=403, detail="You are not assigned to reject this leave")
        if approver.id == owner.first_approver_id and approver.role != "supervisor":
            raise HTTPException(status_code=403, detail="First approver must be supervisor")
        if approver.id == owner.second_approver_id and not _is_admin_like(approver.role):
            raise HTTPException(status_code=403, detail="Second approver must be admin")
    else:
        designated_approvers: set[int] = set()
        if first_approver_id is not None and _is_supervisor_user(db, first_approver_id):
            designated_approvers.add(first_approver_id)
        if second_approver_id is not None and _is_admin_user(db, second_approver_id):
            designated_approvers.add(second_approver_id)
        if designated_approvers:
            if approver.id not in designated_approvers:
                raise HTTPException(status_code=403, detail="You are not assigned to reject this leave")
            if approver.id == first_approver_id and approver.role != "supervisor":
                raise HTTPException(status_code=403, detail="Assigned first approver must be supervisor")
            if approver.id == second_approver_id and not _is_admin_like(approver.role):
                raise HTTPException(status_code=403, detail="Assigned second approver must be admin/ceo")
        elif not _is_admin_like(approver.role):
            raise HTTPException(status_code=403, detail="Only admin/ceo can reject single-step leave")

    e.status = "rejected"
    e.approved_by_id = approver.id
    e.approved_at = datetime.utcnow()
    e.rejection_reason = (payload.reason or "").strip() or "Rejected by approver"
    e.updated_at = datetime.utcnow()

    db.commit()
    db.refresh(e)
    _ = e.user
    _attach_leave_review_metadata(db, e, approver, owner)

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
    q = db.query(Event).filter(Event.type.in_(["Leave", "Hospital"]))

    if status:
        q = q.filter(Event.status == status)

    if start is not None:
        q = q.filter(Event.end_ts > start)
    if end is not None:
        q = q.filter(Event.start_ts < end)

    if not _is_admin_like(current.role):
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
        _attach_leave_review_metadata(db, e, current, e.user)
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
        if not _is_admin_like(current.role):
            raise HTTPException(status_code=403, detail="Admin only filter")
        q = q.filter(Event.user_id == user_id)

    # department filter (admin only)
    if department:
        if not _is_admin_like(current.role):
            raise HTTPException(status_code=403, detail="Admin only filter")
        q = q.join(User, User.id == Event.user_id).filter(User.department == department)

    events = q.order_by(Event.start_ts.asc()).all()
    for e in events:
        _ = e.user
        _attach_leave_review_metadata(db, e, current, e.user)
    return events


@app.post("/events", response_model=EventOut)
async def create_event(
    payload: EventCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    normalized_type = (payload.type or "").strip()
    is_client_visit = normalized_type.lower() == "client visit"
    client_id: Optional[int] = payload.client_id if is_client_visit else None
    one_time_client_name: Optional[str] = (payload.one_time_client_name or "").strip() if is_client_visit else None
    if one_time_client_name == "":
        one_time_client_name = None

    if is_client_visit:
        if bool(client_id) == bool(one_time_client_name):
            raise HTTPException(status_code=400, detail="Provide either client_id or one_time_client_name for Client Visit")
        if client_id is not None:
            exists = db.query(ClientAccount).filter(ClientAccount.id == client_id).first()
            if not exists:
                raise HTTPException(status_code=404, detail="Client not found")
        if one_time_client_name and len(one_time_client_name) > 255:
            raise HTTPException(status_code=400, detail="one_time_client_name must be <= 255 characters")

    # Leave enforcement (only for Leave)
    if normalized_type == "Leave":
        try:
            validate_leave_request(db, user, payload.start_ts, payload.end_ts, exclude_event_id=None)
        except ValueError as ve:
            raise HTTPException(status_code=400, detail=str(ve))

    is_leave_like = normalized_type.lower() in {"leave", "hospital"}
    e = Event(
        user_id=user.id,
        start_ts=payload.start_ts,
        end_ts=payload.end_ts,
        all_day=payload.all_day,
        type=payload.type,
        client_id=client_id,
        one_time_client_name=one_time_client_name,
        note=payload.note,
        status="pending" if is_leave_like else "approved",
        requested_by_id=user.id if is_leave_like else None,
    )
    db.add(e)
    db.flush()
    _sync_client_visit_todos(db, e)
    db.commit()
    db.refresh(e)
    _ = e.user
    _attach_leave_review_metadata(db, e, user, e.user)

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

    if _is_past_current_day_event(e):
        raise HTTPException(status_code=403, detail="Past-day events cannot be edited")
    if e.user_id != user.id:
        raise HTTPException(status_code=403, detail="Only the requesting user can edit this event")

    # Prepare prospective values for leave validation
    new_start = payload.start_ts if payload.start_ts is not None else e.start_ts
    new_end = payload.end_ts if payload.end_ts is not None else e.end_ts
    new_type = payload.type if payload.type is not None else e.type
    new_client_id = payload.client_id if payload.client_id is not None else e.client_id
    new_one_time_client_name = (
        (payload.one_time_client_name or "").strip()
        if payload.one_time_client_name is not None
        else (e.one_time_client_name or "")
    )
    if new_one_time_client_name == "":
        new_one_time_client_name = None

    is_client_visit = (new_type or "").strip().lower() == "client visit"
    if is_client_visit:
        if bool(new_client_id) == bool(new_one_time_client_name):
            raise HTTPException(status_code=400, detail="Provide either client_id or one_time_client_name for Client Visit")
        if new_client_id is not None:
            exists = db.query(ClientAccount).filter(ClientAccount.id == new_client_id).first()
            if not exists:
                raise HTTPException(status_code=404, detail="Client not found")
        if new_one_time_client_name and len(new_one_time_client_name) > 255:
            raise HTTPException(status_code=400, detail="one_time_client_name must be <= 255 characters")
    else:
        new_client_id = None
        new_one_time_client_name = None

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
    e.client_id = new_client_id
    e.one_time_client_name = new_one_time_client_name
    if payload.note is not None:
        e.note = payload.note or None

    e.updated_at = datetime.utcnow()
    _sync_client_visit_todos(db, e)
    db.commit()
    db.refresh(e)
    _ = e.user
    _attach_leave_review_metadata(db, e, user, e.user)

    await broadcast_events_changed("updated", e.id)
    return e


@app.post("/events/{event_id}/sick-note", response_model=EventOut)
async def upload_event_sick_note(
    event_id: int,
    request: Request,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current: User = Depends(get_current_user),
):
    e = db.query(Event).filter(Event.id == event_id).first()
    if not e:
        raise HTTPException(status_code=404, detail="Event not found")
    if not _is_admin_like(current.role) and e.user_id != current.id:
        raise HTTPException(status_code=403, detail="Not allowed")
    if (e.type or "").strip().lower() != "hospital":
        raise HTTPException(status_code=400, detail="Sick note can only be uploaded for Sick Leave entries")

    ext = Path(file.filename or "").suffix.lower()
    allowed_ext = {".pdf", ".jpg", ".jpeg", ".png", ".webp"}
    if ext not in allowed_ext:
        ext = ".pdf"
    allowed_types = {
        "application/pdf",
        "image/jpeg",
        "image/png",
        "image/webp",
    }
    if file.content_type and file.content_type not in allowed_types:
        raise HTTPException(status_code=400, detail="Unsupported sick note content type")

    content = await file.read()
    if len(content) > settings.PROFILE_DOC_MAX_BYTES:
        raise HTTPException(status_code=400, detail=f"Sick note must be <= {settings.PROFILE_DOC_MAX_BYTES // (1024 * 1024)}MB")

    filename = f"sick_note_{e.id}_{uuid4().hex}{ext}"
    object_storage.upload_bytes(_sick_note_key(filename), content, file.content_type)
    if not object_storage.enabled:
        destination = SICK_NOTES_DIR / filename
        destination.write_bytes(content)

    base_url = str(request.base_url).rstrip("/")
    new_url = f"{base_url}/files/sick-notes/{filename}"
    old_url = e.sick_note_url or ""
    e.sick_note_url = new_url
    e.updated_at = datetime.utcnow()

    old_prefixes = [
        f"{base_url}/uploads/sick_notes/",
        f"{base_url}/files/sick-notes/",
        "/uploads/sick_notes/",
        "/files/sick-notes/",
    ]
    old_name = _extract_file_name_from_url(old_url, old_prefixes)
    if old_name:
        object_storage.delete_object(_sick_note_key(old_name))
        old_file = SICK_NOTES_DIR / old_name
        if old_file.exists() and old_file.is_file():
            old_file.unlink()

    db.commit()
    db.refresh(e)
    _ = e.user
    _attach_leave_review_metadata(db, e, current, e.user)
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

    if _is_past_current_day_event(e):
        raise HTTPException(status_code=403, detail="Past-day events cannot be deleted")
    if e.user_id != user.id:
        raise HTTPException(status_code=403, detail="Only the requesting user can delete this event")

    old_sick_note_url = e.sick_note_url or ""
    old_prefixes = [
        "/uploads/sick_notes/",
        "/files/sick-notes/",
    ]
    old_name = _extract_file_name_from_url(old_sick_note_url, old_prefixes)
    if old_name:
        object_storage.delete_object(_sick_note_key(old_name))
        old_file = SICK_NOTES_DIR / old_name
        if old_file.exists() and old_file.is_file():
            old_file.unlink()

    db.query(DailyActivity).filter(
        DailyActivity.post_group_id == f"event:{e.id}",
        DailyActivity.user_id == e.user_id,
    ).delete(synchronize_session=False)
    db.delete(e)
    db.commit()

    await broadcast_events_changed("deleted", event_id)
    return {"ok": True}




