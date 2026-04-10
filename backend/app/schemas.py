from pydantic import BaseModel, EmailStr
from datetime import datetime, date
from typing import Any, List, Optional


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


class MessageOut(BaseModel):
    message: str


class ForgotPasswordIn(BaseModel):
    email: EmailStr


class ResetPasswordIn(BaseModel):
    token: str
    new_password: str


# -------------------------
# Users (basic list + event embedding)
# -------------------------
class UserOut(BaseModel):
    id: int
    name: str
    email: EmailStr
    role: str
    employment_type: str = "employee"
    supervisor_id: Optional[int] = None
    supervisor_name: Optional[str] = None
    avatar_url: Optional[str] = None
    employee_no: Optional[str] = None
    id_number: Optional[str] = None
    nssf_number: Optional[str] = None
    nhif_number: Optional[str] = None
    kra_pin: Optional[str] = None
    department: Optional[str] = None
    designation: Optional[str] = None

    class Config:
        from_attributes = True


class MeOut(UserOut):
    theme_preference: Optional[str] = None
    effective_theme: str = "light"


class ThemeUpdateIn(BaseModel):
    theme: str
    apply_to_all: bool = False


# -------------------------
# Profiles
# -------------------------
class UserProfileOut(BaseModel):
    id: int
    name: str
    email: EmailStr
    role: str
    employment_type: str = "employee"
    supervisor_id: Optional[int] = None
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
    employee_no: Optional[str] = None
    department: Optional[str] = None
    designation: Optional[str] = None
    gender: Optional[str] = None
    date_of_birth: Optional[date] = None
    address: Optional[str] = None
    id_number: Optional[str] = None
    nssf_number: Optional[str] = None
    nhif_number: Optional[str] = None
    employment_type: Optional[str] = None


class UserCreate(BaseModel):
    name: str
    email: EmailStr
    password: str
    role: str = "employee"
    employment_type: str = "employee"
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


class AdminResetUserPasswordIn(BaseModel):
    new_password: str


class AdminUserProfileOut(UserProfileOut):
    notes_private: Optional[str] = None
    require_two_step_leave_approval: bool = False
    supervisor_id: Optional[int] = None
    first_approver_id: Optional[int] = None
    second_approver_id: Optional[int] = None
    leave_opening_as_of: Optional[date] = None
    leave_opening_accrued: Optional[float] = None
    leave_opening_used: Optional[float] = None


class AdminUserProfileUpdate(UserProfileUpdate):
    email: Optional[EmailStr] = None
    role: Optional[str] = None
    notes_private: Optional[str] = None
    supervisor_id: Optional[int] = None

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
    require_two_step_leave_approval: bool = False
    first_approver_id: Optional[int] = None
    second_approver_id: Optional[int] = None
    first_approver_name: Optional[str] = None
    second_approver_name: Optional[str] = None
    can_current_user_approve: bool = False
    can_current_user_reject: bool = False
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


class LibraryCategoryCreate(BaseModel):
    name: str


class LibraryCategoryOut(BaseModel):
    id: int
    name: str
    created_by_id: Optional[int] = None
    created_at: datetime

    class Config:
        from_attributes = True


class SharedNotebookOut(BaseModel):
    id: int
    content: str = ""
    updated_by_id: Optional[int] = None
    updated_at: datetime
    created_at: datetime
    updated_by: Optional[UserOut] = None

    class Config:
        from_attributes = True


class SharedNotebookUpdateIn(BaseModel):
    content: str = ""


class DepartmentCreate(BaseModel):
    name: str


class DepartmentOut(BaseModel):
    id: int
    name: str
    created_by_id: Optional[int] = None
    created_at: datetime

    class Config:
        from_attributes = True


class DesignationCreate(BaseModel):
    department_id: int
    name: str


class DesignationOut(BaseModel):
    id: int
    department_id: int
    name: str
    created_by_id: Optional[int] = None
    created_at: datetime
    department: DepartmentOut

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


class ClientTaskReportSubtaskOut(BaseModel):
    subtask: str
    completion_date: Optional[date] = None
    completed: bool
    completed_at: Optional[datetime] = None


class ClientTaskReportGroupOut(BaseModel):
    task_group_id: str
    task: str
    total_subtasks: int
    completed_subtasks: int
    pending_subtasks: int
    status: str
    subtasks: List[ClientTaskReportSubtaskOut]


class ClientTaskReportTotalsOut(BaseModel):
    total_groups: int
    total_subtasks: int
    completed_subtasks: int
    pending_subtasks: int
    completion_percent: float


class ClientTaskReportAISectionOut(BaseModel):
    heading: str
    paragraphs: List[str] = []
    bullets: List[str] = []


class ClientTaskReportAIOut(BaseModel):
    model: Optional[str] = None
    title: Optional[str] = None
    opening_summary: Optional[str] = None
    sections: List[ClientTaskReportAISectionOut] = []
    closing_note: Optional[str] = None
    executive_summary: Optional[str] = None
    completed_highlights: List[str] = []
    pending_focus: List[str] = []
    recommended_next_steps: List[str] = []


class ClientTaskReportOut(BaseModel):
    client: ClientAccountOut
    year: int
    quarter: int
    report_kind: str
    generated_at: datetime
    title: str
    overview: str
    totals: ClientTaskReportTotalsOut
    groups: List[ClientTaskReportGroupOut]
    ai_report: Optional[ClientTaskReportAIOut] = None


class ClientTaskReportRestoreIn(BaseModel):
    report: ClientTaskReportOut


class ClientTaskReportHistoryOut(BaseModel):
    id: int
    client_id: int
    client_name: str
    generated_by_id: int
    generated_by_name: str
    year: int
    quarter: int
    report_kind: str
    title: str
    created_at: datetime


class ProbationRecordCreate(BaseModel):
    client_id: int
    employee_name: str
    hire_date: date
    probation_months: int


class ProbationRecordUpdate(BaseModel):
    employee_name: Optional[str] = None
    hire_date: Optional[date] = None
    probation_months: Optional[int] = None


class ProbationRecordOut(BaseModel):
    id: int
    client_id: int
    client_name: str
    created_by_id: int
    created_by_name: str
    employee_name: str
    hire_date: date
    probation_months: int
    probation_end_date: date
    days_until_end: int
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


# -------------------------
# Dashboard
# -------------------------
class DailyActivityCreate(BaseModel):
    activity: str
    client_id: Optional[int] = None


class DailyActivityUpdate(BaseModel):
    completed: bool


class DailyActivityOut(BaseModel):
    id: int
    user_id: int
    client_id: Optional[int] = None
    client_name: Optional[str] = None
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


class BirthdayReminderOut(BaseModel):
    user_id: int
    user_name: str
    date_of_birth: date
    birthday_date: date
    days_until: int
    is_today: bool = False


class DashboardOverviewOut(BaseModel):
    today: date
    todays_activities: List[DailyActivityOut]
    todo_history: List[DailyActivityOut]
    carried_over_activities: List[DailyActivityOut]
    unfinished_count: int
    upcoming_subtasks: List[TaskReminderOut]
    due_subtasks: List[TaskReminderOut]
    probation_reminders: List[ProbationRecordOut] = []
    upcoming_birthdays: List[BirthdayReminderOut] = []
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


class CashReimbursementPeriodOut(BaseModel):
    period_start: date
    period_end: date
    is_current: bool = False
    has_draft: bool = False
    has_submission: bool = False
    submission_status: Optional[str] = None
    submission_item_count: int = 0
    is_late_submission: bool = False
    can_submit: bool = False
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


class CashReimbursementItemDecisionIn(BaseModel):
    approve: bool
    comment: Optional[str] = None


class CashReimbursementItemOut(BaseModel):
    id: int
    item_date: date
    description: str
    amount: float
    client_id: Optional[int] = None
    source_event_id: Optional[int] = None
    review_status: str = "pending"
    review_comment: Optional[str] = None
    reviewed_by_id: Optional[int] = None
    reviewed_at: Optional[datetime] = None
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
    is_late_submission: bool = False
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


class FinanceAttentionOut(BaseModel):
    cash_reimbursement: int = 0
    cash_requisition: int = 0
    authority_to_incur: int = 0
    salary_advance: int = 0
    total: int = 0


class PayrollAttentionOut(BaseModel):
    pending_confirmation: int = 0


class PayrollAdminAttentionOut(BaseModel):
    confirmed_pending_payment: int = 0


class PayrollEmployeeConfirmedOut(BaseModel):
    employee_id: int
    confirmed_pending_payment: bool




class CashRequisitionCreateIn(BaseModel):
    amount: float
    purpose: str
    details: Optional[str] = None
    needed_by: Optional[date] = None


class CashRequisitionDecisionIn(BaseModel):
    approve: bool
    comment: Optional[str] = None


class CashRequisitionDisburseIn(BaseModel):
    note: Optional[str] = None


class CashRequisitionRequestOut(BaseModel):
    id: int
    user_id: int
    amount: float
    purpose: str
    details: Optional[str] = None
    needed_by: Optional[date] = None
    status: str
    submitted_at: datetime
    finance_decision: Optional[str] = None
    finance_comment: Optional[str] = None
    finance_decided_at: Optional[datetime] = None
    finance_decided_by_id: Optional[int] = None
    ceo_decision: Optional[str] = None
    ceo_comment: Optional[str] = None
    ceo_decided_at: Optional[datetime] = None
    ceo_decided_by_id: Optional[int] = None
    disbursed_at: Optional[datetime] = None
    disbursed_note: Optional[str] = None
    disbursed_by_id: Optional[int] = None
    updated_at: datetime
    user: UserOut

    class Config:
        from_attributes = True


class AuthorityToIncurCreateIn(BaseModel):
    amount: float
    title: str
    payee: Optional[str] = None
    details: Optional[str] = None
    needed_by: Optional[date] = None


class AuthorityToIncurDecisionIn(BaseModel):
    approve: bool
    comment: Optional[str] = None


class AuthorityToIncurIncurIn(BaseModel):
    note: Optional[str] = None


class AuthorityToIncurRequestOut(BaseModel):
    id: int
    user_id: int
    amount: float
    title: str
    payee: Optional[str] = None
    details: Optional[str] = None
    needed_by: Optional[date] = None
    status: str
    submitted_at: datetime
    finance_decision: Optional[str] = None
    finance_comment: Optional[str] = None
    finance_decided_at: Optional[datetime] = None
    finance_decided_by_id: Optional[int] = None
    ceo_decision: Optional[str] = None
    ceo_comment: Optional[str] = None
    ceo_decided_at: Optional[datetime] = None
    ceo_decided_by_id: Optional[int] = None
    incurred_at: Optional[datetime] = None
    incurred_note: Optional[str] = None
    incurred_by_id: Optional[int] = None
    updated_at: datetime
    user: UserOut

    class Config:
        from_attributes = True


class SalaryAdvanceCreateIn(BaseModel):
    amount: float
    reason: str
    details: Optional[str] = None
    repayment_months: int = 1
    deduction_start_date: Optional[date] = None


class SalaryAdvanceDecisionIn(BaseModel):
    approve: bool
    comment: Optional[str] = None
    approved_amount: Optional[float] = None


class SalaryAdvanceDisburseIn(BaseModel):
    note: Optional[str] = None


class SalaryAdvanceRequestOut(BaseModel):
    id: int
    user_id: int
    amount: float
    approved_amount: Optional[float] = None
    reason: str
    details: Optional[str] = None
    repayment_months: int
    deduction_start_date: Optional[date] = None
    status: str
    submitted_at: datetime
    finance_decision: Optional[str] = None
    finance_comment: Optional[str] = None
    finance_decided_at: Optional[datetime] = None
    finance_decided_by_id: Optional[int] = None
    ceo_decision: Optional[str] = None
    ceo_comment: Optional[str] = None
    ceo_decided_at: Optional[datetime] = None
    ceo_decided_by_id: Optional[int] = None
    disbursed_at: Optional[datetime] = None
    disbursed_note: Optional[str] = None
    disbursed_by_id: Optional[int] = None
    updated_at: datetime
    user: UserOut

    class Config:
        from_attributes = True


class PayrollProfileOut(BaseModel):
    id: int
    user_id: int
    payroll_number: Optional[str] = None
    kra_pin: Optional[str] = None
    payment_method: str
    bank_name: Optional[str] = None
    bank_account_name: Optional[str] = None
    bank_account_number: Optional[str] = None
    active: bool = True
    basic_salary: float = 0
    house_allowance: float = 0
    transport_allowance: float = 0
    other_taxable_allowance: float = 0
    non_cash_benefit: float = 0
    tax_exempt_allowance: float = 0
    pension_employee: float = 0
    pension_employer: float = 0
    insurance_relief_base: float = 0
    owner_occupier_interest: float = 0
    other_deductions: float = 0
    nssf_pensionable_pay: Optional[float] = None
    disability_exemption_amount: float = 0
    notes: Optional[str] = None
    updated_at: datetime
    user: UserOut

    class Config:
        from_attributes = True


class PayrollProfileUpdateIn(BaseModel):
    payroll_number: Optional[str] = None
    kra_pin: Optional[str] = None
    payment_method: Optional[str] = None
    bank_name: Optional[str] = None
    bank_account_name: Optional[str] = None
    bank_account_number: Optional[str] = None
    active: Optional[bool] = None
    basic_salary: Optional[float] = None
    house_allowance: Optional[float] = None
    transport_allowance: Optional[float] = None
    other_taxable_allowance: Optional[float] = None
    non_cash_benefit: Optional[float] = None
    tax_exempt_allowance: Optional[float] = None
    pension_employee: Optional[float] = None
    pension_employer: Optional[float] = None
    insurance_relief_base: Optional[float] = None
    owner_occupier_interest: Optional[float] = None
    other_deductions: Optional[float] = None
    nssf_pensionable_pay: Optional[float] = None
    disability_exemption_amount: Optional[float] = None
    notes: Optional[str] = None


class PayrollRunInputIn(BaseModel):
    payroll_month: date
    pay_date: Optional[date] = None
    basic_salary: Optional[float] = None
    house_allowance: Optional[float] = None
    transport_allowance: Optional[float] = None
    other_taxable_allowance: Optional[float] = None
    non_cash_benefit: Optional[float] = None
    tax_exempt_allowance: Optional[float] = None
    bonus: Optional[float] = None
    overtime: Optional[float] = None
    commission: Optional[float] = None
    pension_employee: Optional[float] = None
    pension_employer: Optional[float] = None
    insurance_relief_base: Optional[float] = None
    owner_occupier_interest: Optional[float] = None
    other_deductions: Optional[float] = None
    nssf_pensionable_pay: Optional[float] = None
    disability_exemption_amount: Optional[float] = None
    notes: Optional[str] = None


class PayrollRunPreviewIn(PayrollRunInputIn):
    employee_id: int


class PayrollStatutoryConfigBase(BaseModel):
    effective_from: date
    effective_to: Optional[date] = None
    active: bool = True
    paye_bands_monthly: list[dict[str, Any]]
    personal_relief_monthly: float
    insurance_relief_rate: float
    insurance_relief_cap_monthly: float
    owner_occupier_interest_cap_monthly: float
    shif_rate: float
    shif_minimum_monthly: float
    ahl_rate_employee: float
    ahl_rate_employer: float
    nssf_lower_earnings_limit: float
    nssf_upper_earnings_limit: float
    nssf_employee_rate: float
    nssf_employer_rate: float
    nita_levy_monthly: float
    non_cash_benefit_taxable_threshold: float
    disability_exemption_cap_monthly: float
    source_notes: list[str] = []


class PayrollStatutoryConfigCreateIn(PayrollStatutoryConfigBase):
    pass


class PayrollStatutoryConfigUpdateIn(BaseModel):
    effective_to: Optional[date] = None
    active: Optional[bool] = None
    paye_bands_monthly: Optional[list[dict[str, Any]]] = None
    personal_relief_monthly: Optional[float] = None
    insurance_relief_rate: Optional[float] = None
    insurance_relief_cap_monthly: Optional[float] = None
    owner_occupier_interest_cap_monthly: Optional[float] = None
    shif_rate: Optional[float] = None
    shif_minimum_monthly: Optional[float] = None
    ahl_rate_employee: Optional[float] = None
    ahl_rate_employer: Optional[float] = None
    nssf_lower_earnings_limit: Optional[float] = None
    nssf_upper_earnings_limit: Optional[float] = None
    nssf_employee_rate: Optional[float] = None
    nssf_employer_rate: Optional[float] = None
    nita_levy_monthly: Optional[float] = None
    non_cash_benefit_taxable_threshold: Optional[float] = None
    disability_exemption_cap_monthly: Optional[float] = None
    source_notes: Optional[list[str]] = None


class PayrollStatutoryConfigOut(PayrollStatutoryConfigBase):
    id: int
    created_by_id: int
    updated_by_id: int
    created_at: datetime
    updated_at: datetime
    created_by: UserOut
    updated_by: UserOut

    class Config:
        from_attributes = True


class PayrollStatutoryOut(BaseModel):
    id: Optional[int] = None
    paye_effective_from: date
    effective_to: Optional[date] = None
    ahl_effective_from: date
    shif_effective_from: date
    nssf_effective_from: date
    paye_bands_monthly: list[dict[str, Any]]
    personal_relief_monthly: float
    insurance_relief_rate: float
    insurance_relief_cap_monthly: float
    owner_occupier_interest_cap_monthly: float
    shif_rate: float
    shif_minimum_monthly: float
    ahl_rate_employee: float
    ahl_rate_employer: float
    nssf_lower_earnings_limit: float
    nssf_upper_earnings_limit: float
    nssf_employee_rate: float
    nssf_employer_rate: float
    nita_levy_monthly: float
    non_cash_benefit_taxable_threshold: float
    disability_exemption_cap_monthly: float
    source_notes: list[str]


class PayrollRunOut(BaseModel):
    id: int
    employee_id: int
    payroll_month: date
    pay_date: Optional[date] = None
    status: str
    employee_confirmed: bool = False
    employee_confirmed_at: Optional[datetime] = None
    gross_cash_pay: float
    taxable_non_cash_benefits: float
    gross_taxable_pay: float
    tax_exempt_allowance: float
    taxable_income: float
    nssf_employee: float
    nssf_employer: float
    shif_employee: float
    ahl_employee: float
    ahl_employer: float
    pension_employee: float
    pension_employer: float
    other_deductions: float
    personal_relief: float
    insurance_relief: float
    owner_occupier_interest_relief: float
    paye_before_reliefs: float
    paye_after_reliefs: float
    withholding_tax: float = 0
    net_pay: float
    employer_total_cost: float
    breakdown: dict[str, Any] = {}
    notes: Optional[str] = None
    updated_at: datetime
    employee: UserOut
    basic_salary: float = 0
    housing_allowance: float = 0
    transport_allowance: float = 0
    other_allowance: float = 0
    total_deductions: float = 0
    salary_advance_deduction: float = 0


class PayrollSaveIn(PayrollRunPreviewIn):
    status: Optional[str] = "draft"


class PerformanceCompanyGoalIn(BaseModel):
    perspective: str = "financial"
    title: str
    description: Optional[str] = None
    period_start: Optional[date] = None
    period_end: Optional[date] = None
    status: Optional[str] = "active"


class PerformanceCompanyGoalOut(BaseModel):
    id: int
    perspective: str
    title: str
    description: Optional[str] = None
    period_start: Optional[date] = None
    period_end: Optional[date] = None
    status: str
    created_by_id: int
    created_at: datetime
    updated_at: datetime
    created_by: UserOut

    class Config:
        from_attributes = True


class PerformanceDepartmentGoalIn(BaseModel):
    company_goal_id: Optional[int] = None
    department: str
    perspective: str = "financial"
    title: str
    description: Optional[str] = None
    period_start: Optional[date] = None
    period_end: Optional[date] = None
    status: Optional[str] = "active"


class PerformanceDepartmentGoalOut(BaseModel):
    id: int
    company_goal_id: Optional[int] = None
    department: str
    perspective: str
    title: str
    description: Optional[str] = None
    period_start: Optional[date] = None
    period_end: Optional[date] = None
    status: str
    created_by_id: int
    created_at: datetime
    updated_at: datetime
    created_by: UserOut
    company_goal: Optional[PerformanceCompanyGoalOut] = None

    class Config:
        from_attributes = True


class PerformanceEmployeeGoalIn(BaseModel):
    department_goal_id: int
    user_id: int
    title: str
    description: Optional[str] = None
    progress_percent: Optional[int] = 0
    status: Optional[str] = "active"
    self_comment: Optional[str] = None
    manager_comment: Optional[str] = None


class PerformanceEmployeeGoalUpdateIn(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    progress_percent: Optional[int] = None
    status: Optional[str] = None
    self_comment: Optional[str] = None
    manager_comment: Optional[str] = None


class PerformanceEmployeeGoalOut(BaseModel):
    id: int
    department_goal_id: int
    user_id: int
    title: str
    description: Optional[str] = None
    progress_percent: int
    status: str
    self_comment: Optional[str] = None
    manager_comment: Optional[str] = None
    created_by_id: int
    updated_by_id: Optional[int] = None
    created_at: datetime
    updated_at: datetime
    user: UserOut
    department_goal: PerformanceDepartmentGoalOut
    created_by: UserOut
    updated_by: Optional[UserOut] = None

    class Config:
        from_attributes = True


class PerformanceAssignableUserOut(BaseModel):
    id: int
    name: str
    role: str
    department: Optional[str] = None
    supervisor_id: Optional[int] = None


class PerformanceAppraisalEmployeeIn(BaseModel):
    review_period: Optional[str] = None
    review_date: Optional[date] = None
    kpi_self_ratings: dict[str, list[str]] = {}
    goal_rows_last_review: list[dict[str, Any]] = []
    goal_rows_next_review: list[dict[str, Any]] = []
    reflection: dict[str, str] = {}


class PerformanceAppraisalSupervisorIn(BaseModel):
    kpi_supervisor_ratings: dict[str, list[str]] = {}
    kpi_supervisor_comments: dict[str, list[str]] = {}
    goal_supervisor_ratings: dict[str, list[str]] = {}
    supervisor_summary: dict[str, str] = {}


class PerformanceAppraisalOut(BaseModel):
    id: Optional[int] = None
    employee_id: int
    review_year: int
    review_quarter: str
    employee_payload: dict[str, Any] = {}
    supervisor_payload: dict[str, Any] = {}
    can_edit_employee: bool = False
    can_edit_supervisor: bool = False
    employee: UserOut
    assigned_supervisor: Optional[UserOut] = None
    supervisor_reviewed_by: Optional[UserOut] = None
    employee_updated_at: Optional[datetime] = None
    supervisor_updated_at: Optional[datetime] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
