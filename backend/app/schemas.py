from pydantic import BaseModel, EmailStr
from datetime import datetime, date
from typing import Optional


# -------------------------
# Auth
# -------------------------
class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class FirstAdminCreate(BaseModel):
    name: str
    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


# -------------------------
# Users (basic list + event embedding)
# -------------------------
class UserOut(BaseModel):
    id: int
    name: str
    email: EmailStr
    role: str
    avatar_url: Optional[str] = None

    class Config:
        from_attributes = True


# -------------------------
# Profiles
# -------------------------
class UserProfileOut(BaseModel):
    id: int
    name: str
    email: EmailStr
    role: str
    avatar_url: Optional[str] = None

    phone: Optional[str] = None
    department: Optional[str] = None
    designation: Optional[str] = None
    gender: Optional[str] = None
    date_of_birth: Optional[date] = None
    address: Optional[str] = None
    id_number: Optional[str] = None
    nssf_number: Optional[str] = None
    nhif_number: Optional[str] = None

    id_copy_url: Optional[str] = None
    kra_copy_url: Optional[str] = None
    offer_letter_url: Optional[str] = None
    employment_contract_url: Optional[str] = None
    disciplinary_records_url: Optional[str] = None
    bio_data_form_url: Optional[str] = None
    bank_details_form_url: Optional[str] = None

    # NEW: visible to user/admin
    hire_date: Optional[date] = None

    class Config:
        from_attributes = True


class UserProfileUpdate(BaseModel):
    name: Optional[str] = None
    avatar_url: Optional[str] = None
    phone: Optional[str] = None
    department: Optional[str] = None
    designation: Optional[str] = None
    gender: Optional[str] = None
    date_of_birth: Optional[date] = None
    address: Optional[str] = None
    id_number: Optional[str] = None
    nssf_number: Optional[str] = None
    nhif_number: Optional[str] = None


class UserCreate(BaseModel):
    name: str
    email: EmailStr
    password: str
    role: str = "employee"
    avatar_url: Optional[str] = None
    phone: Optional[str] = None
    department: Optional[str] = None
    designation: Optional[str] = None
    gender: Optional[str] = None
    address: Optional[str] = None

    # NEW: optional; if omitted we default to today on backend
    hire_date: Optional[date] = None


class UserUpdate(BaseModel):
    name: Optional[str] = None
    email: Optional[EmailStr] = None
    role: Optional[str] = None
    avatar_url: Optional[str] = None


class AdminUserProfileOut(UserProfileOut):
    notes_private: Optional[str] = None
    require_two_step_leave_approval: bool = False
    first_approver_id: Optional[int] = None
    second_approver_id: Optional[int] = None


class AdminUserProfileUpdate(UserProfileUpdate):
    email: Optional[EmailStr] = None
    role: Optional[str] = None
    notes_private: Optional[str] = None

    # NEW: admin can edit hire_date
    hire_date: Optional[date] = None
    require_two_step_leave_approval: Optional[bool] = None
    first_approver_id: Optional[int] = None
    second_approver_id: Optional[int] = None


# -------------------------
# Events
# -------------------------
class EventCreate(BaseModel):
    start_ts: datetime
    end_ts: datetime
    all_day: bool = True
    type: str
    note: Optional[str] = None


class LeaveRequestCreate(BaseModel):
    start_ts: datetime
    end_ts: datetime
    all_day: bool = True
    note: Optional[str] = None


class LeaveRejectRequest(BaseModel):
    reason: Optional[str] = None


class EventUpdate(BaseModel):
    start_ts: Optional[datetime] = None
    end_ts: Optional[datetime] = None
    all_day: Optional[bool] = None
    type: Optional[str] = None
    note: Optional[str] = None


class EventOut(BaseModel):
    id: int
    user_id: int
    start_ts: datetime
    end_ts: datetime
    all_day: bool
    type: str
    note: Optional[str]
    status: str
    requested_by_id: Optional[int] = None
    approved_by_id: Optional[int] = None
    first_approved_by_id: Optional[int] = None
    second_approved_by_id: Optional[int] = None
    approved_at: Optional[datetime] = None
    rejection_reason: Optional[str] = None
    user: UserOut

    class Config:
        from_attributes = True


# -------------------------
# Leave balance
# -------------------------
class LeaveBalanceOut(BaseModel):
    user_id: int
    as_of: date
    period_start: date
    period_end: date

    accrual_rate_per_month: float = 1.75
    annual_cap: float = 21.0

    months_accrued: int
    accrued: float
    used: float
    remaining: float


# -------------------------
# Library (company documents)
# -------------------------
class CompanyDocumentCreate(BaseModel):
    title: str
    category: str


class CompanyDocumentOut(BaseModel):
    id: int
    title: str
    category: str
    file_url: str
    uploaded_by_id: int
    created_at: datetime
    uploaded_by: UserOut

    class Config:
        from_attributes = True
