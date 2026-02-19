from pydantic import BaseModel, EmailStr
from datetime import datetime, date
from typing import List, Optional


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
    leave_opening_as_of: Optional[date] = None
    leave_opening_accrued: Optional[float] = None
    leave_opening_used: Optional[float] = None


class AdminUserProfileUpdate(UserProfileUpdate):
    email: Optional[EmailStr] = None
    role: Optional[str] = None
    notes_private: Optional[str] = None

    # NEW: admin can edit hire_date
    hire_date: Optional[date] = None
    require_two_step_leave_approval: Optional[bool] = None
    first_approver_id: Optional[int] = None
    second_approver_id: Optional[int] = None
    leave_opening_as_of: Optional[date] = None
    leave_opening_accrued: Optional[float] = None
    leave_opening_used: Optional[float] = None


# -------------------------
# Events
# -------------------------
class EventCreate(BaseModel):
    start_ts: datetime
    end_ts: datetime
    all_day: bool = True
    type: str
    client_id: Optional[int] = None
    one_time_client_name: Optional[str] = None
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
    client_id: Optional[int] = None
    one_time_client_name: Optional[str] = None
    note: Optional[str] = None


class EventOut(BaseModel):
    id: int
    user_id: int
    start_ts: datetime
    end_ts: datetime
    all_day: bool
    type: str
    client_id: Optional[int] = None
    one_time_client_name: Optional[str] = None
    sick_note_url: Optional[str] = None
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


# -------------------------
# Client Task Manager
# -------------------------
class ClientAccountCreate(BaseModel):
    name: str
    reimbursement_amount: Optional[float] = 0.0


class ClientAccountUpdate(BaseModel):
    reimbursement_amount: float


class ClientAccountOut(BaseModel):
    id: int
    name: str
    reimbursement_amount: float = 0.0
    created_by_id: Optional[int] = None
    created_at: datetime

    class Config:
        from_attributes = True


class ClientTaskCreate(BaseModel):
    client_id: int
    year: int
    quarter: int
    task: str
    subtask: Optional[str] = None
    completion_date: Optional[date] = None
    subtasks: Optional[list["ClientTaskSubtaskIn"]] = None


class ClientTaskSubtaskIn(BaseModel):
    subtask: str
    completion_date: Optional[date] = None


class ClientTaskUpdate(BaseModel):
    task: Optional[str] = None
    subtask: Optional[str] = None
    completion_date: Optional[date] = None
    completed: Optional[bool] = None


class ClientTaskOut(BaseModel):
    id: int
    client_id: int
    user_id: int
    task_group_id: str
    year: int
    quarter: int
    task: str
    subtask: str
    completion_date: Optional[date] = None
    completed: bool
    completed_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime
    user: UserOut

    class Config:
        from_attributes = True


# -------------------------
# Dashboard
# -------------------------
class DailyActivityCreate(BaseModel):
    activity: str


class DailyActivityUpdate(BaseModel):
    completed: bool


class DailyActivityOut(BaseModel):
    id: int
    user_id: int
    post_group_id: Optional[str] = None
    activity_date: date
    activity: str
    completed: bool
    completed_at: Optional[datetime] = None
    created_at: datetime
    user: UserOut

    class Config:
        from_attributes = True


class TaskReminderOut(BaseModel):
    id: int
    task_group_id: str
    client_id: int
    client_name: str
    user_id: int
    user_name: str
    year: int
    quarter: int
    task: str
    subtask: str
    completion_date: date
    days_until_due: int


class DashboardOverviewOut(BaseModel):
    today: date
    todays_activities: List[DailyActivityOut]
    todo_history: List[DailyActivityOut]
    carried_over_activities: List[DailyActivityOut]
    unfinished_count: int
    upcoming_subtasks: List[TaskReminderOut]
    due_subtasks: List[TaskReminderOut]
    reimbursement_can_submit: bool = False
    reimbursement_submit_due_today: bool = False
    reimbursement_submit_period_start: Optional[date] = None
    reimbursement_submit_period_end: Optional[date] = None
    reimbursement_submit_message: Optional[str] = None


class CashReimbursementItemIn(BaseModel):
    item_date: date
    description: str
    amount: float
    source_event_id: Optional[int] = None


class CashReimbursementDraftItemOut(BaseModel):
    item_date: date
    description: str
    amount: float
    client_id: Optional[int] = None
    source_event_id: Optional[int] = None
    auto_filled: bool


class CashReimbursementDraftOut(BaseModel):
    period_start: date
    period_end: date
    auto_items: List[CashReimbursementDraftItemOut]
    manual_items: List["CashReimbursementDraftManualItemOut"] = []
    can_edit_manual: bool = True
    can_submit: bool = False
    submit_due_today: bool = False
    submit_message: Optional[str] = None


class CashReimbursementSubmitIn(BaseModel):
    manual_items: List[CashReimbursementItemIn] = []


class CashReimbursementDraftManualItemIn(BaseModel):
    item_date: Optional[date] = None
    description: Optional[str] = None
    amount: Optional[float] = None
    source_event_id: Optional[int] = None


class CashReimbursementDraftManualItemOut(BaseModel):
    item_date: Optional[date] = None
    description: str = ""
    amount: Optional[float] = None
    source_event_id: Optional[int] = None


class CashReimbursementDraftSaveIn(BaseModel):
    manual_items: List[CashReimbursementDraftManualItemIn] = []


class CashReimbursementDecisionIn(BaseModel):
    approve: bool
    comment: Optional[str] = None


class CashReimbursementItemOut(BaseModel):
    id: int
    item_date: date
    description: str
    amount: float
    client_id: Optional[int] = None
    source_event_id: Optional[int] = None
    created_at: datetime

    class Config:
        from_attributes = True


class CashReimbursementRequestOut(BaseModel):
    id: int
    user_id: int
    period_start: date
    period_end: date
    total_amount: float
    status: str
    submitted_at: datetime
    ceo_decision: Optional[str] = None
    ceo_comment: Optional[str] = None
    ceo_decided_at: Optional[datetime] = None
    finance_decision: Optional[str] = None
    finance_comment: Optional[str] = None
    finance_decided_at: Optional[datetime] = None
    reimbursed_by_id: Optional[int] = None
    reimbursed_at: Optional[datetime] = None
    user: UserOut
    items: List[CashReimbursementItemOut]

    class Config:
        from_attributes = True
