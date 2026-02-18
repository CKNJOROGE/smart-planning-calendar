from sqlalchemy import Column, Integer, String, DateTime, Boolean, ForeignKey, Text, Date, Numeric, UniqueConstraint
from sqlalchemy.orm import relationship
from datetime import datetime, date
from .db import Base


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True)

    # core identity/auth
    name = Column(String(120), nullable=False)
    email = Column(String(255), unique=True, nullable=False, index=True)
    password_hash = Column(String(255), nullable=False)
    role = Column(String(20), nullable=False, default="employee")
    avatar_url = Column(String(500), nullable=True)

    # profile fields
    phone = Column(String(50), nullable=True)
    department = Column(String(120), nullable=True)
    designation = Column(String(120), nullable=True)
    gender = Column(String(30), nullable=True)
    date_of_birth = Column(Date, nullable=True)
    address = Column(String(255), nullable=True)
    id_number = Column(String(120), nullable=True)
    nssf_number = Column(String(120), nullable=True)
    nhif_number = Column(String(120), nullable=True)

    id_copy_url = Column(String(500), nullable=True)
    kra_copy_url = Column(String(500), nullable=True)
    offer_letter_url = Column(String(500), nullable=True)
    employment_contract_url = Column(String(500), nullable=True)
    disciplinary_records_url = Column(String(500), nullable=True)
    bio_data_form_url = Column(String(500), nullable=True)
    bank_details_form_url = Column(String(500), nullable=True)

    # NEW: hire date for leave accrual
    hire_date = Column(Date, nullable=True)

    # admin-only notes
    notes_private = Column(Text, nullable=True)
    require_two_step_leave_approval = Column(Boolean, nullable=False, default=False)
    first_approver_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    second_approver_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)

    created_at = Column(DateTime, default=datetime.utcnow)

    events = relationship(
        "Event",
        back_populates="user",
        foreign_keys="Event.user_id",
    )
    client_tasks = relationship("ClientTask", back_populates="user", foreign_keys="ClientTask.user_id")
    daily_activities = relationship("DailyActivity", back_populates="user", cascade="all, delete-orphan")


class Event(Base):
    __tablename__ = "events"

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)

    start_ts = Column(DateTime, nullable=False)
    end_ts = Column(DateTime, nullable=False)
    all_day = Column(Boolean, default=True)

    type = Column(String(50), nullable=False)
    client_id = Column(Integer, ForeignKey("client_accounts.id"), nullable=True, index=True)
    note = Column(Text, nullable=True)
    status = Column(String(20), nullable=False, default="approved")
    requested_by_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    approved_by_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    first_approved_by_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    second_approved_by_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    approved_at = Column(DateTime, nullable=True)
    rejection_reason = Column(Text, nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow)

    user = relationship("User", back_populates="events", foreign_keys=[user_id])
    requested_by = relationship("User", foreign_keys=[requested_by_id])
    approved_by = relationship("User", foreign_keys=[approved_by_id])
    first_approved_by = relationship("User", foreign_keys=[first_approved_by_id])
    second_approved_by = relationship("User", foreign_keys=[second_approved_by_id])
    client = relationship("ClientAccount", foreign_keys=[client_id])


class CompanyDocument(Base):
    __tablename__ = "company_documents"

    id = Column(Integer, primary_key=True)
    title = Column(String(255), nullable=False)
    category = Column(String(80), nullable=False, index=True)
    file_url = Column(String(500), nullable=False)
    uploaded_by_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    uploaded_by = relationship("User", foreign_keys=[uploaded_by_id])


class ClientAccount(Base):
    __tablename__ = "client_accounts"

    id = Column(Integer, primary_key=True)
    name = Column(String(255), unique=True, nullable=False, index=True)
    reimbursement_amount = Column(Numeric(12, 2), nullable=False, default=0)
    created_by_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    created_by = relationship("User", foreign_keys=[created_by_id])
    tasks = relationship("ClientTask", back_populates="client", cascade="all, delete-orphan")


class ClientTask(Base):
    __tablename__ = "client_tasks"

    id = Column(Integer, primary_key=True)
    client_id = Column(Integer, ForeignKey("client_accounts.id"), nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    task_group_id = Column(String(40), nullable=False, index=True)
    year = Column(Integer, nullable=False, index=True)
    quarter = Column(Integer, nullable=False, index=True)
    task = Column(String(255), nullable=False)
    subtask = Column(Text, nullable=False)
    completion_date = Column(Date, nullable=True)
    completed = Column(Boolean, nullable=False, default=False)
    completed_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    client = relationship("ClientAccount", back_populates="tasks")
    user = relationship("User", back_populates="client_tasks", foreign_keys=[user_id])


class DailyActivity(Base):
    __tablename__ = "daily_activities"

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    post_group_id = Column(String(40), nullable=True, index=True)
    activity_date = Column(Date, nullable=False, index=True)
    activity = Column(Text, nullable=False)
    completed = Column(Boolean, nullable=False, default=False)
    completed_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    user = relationship("User", back_populates="daily_activities", foreign_keys=[user_id])


class CashReimbursementRequest(Base):
    __tablename__ = "cash_reimbursement_requests"
    __table_args__ = (
        UniqueConstraint("user_id", "period_start", "period_end", name="uq_cash_reimbursements_user_period"),
    )

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    period_start = Column(Date, nullable=False, index=True)
    period_end = Column(Date, nullable=False, index=True)
    total_amount = Column(Numeric(12, 2), nullable=False, default=0)
    status = Column(String(20), nullable=False, default="pending")
    submitted_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    ceo_decision = Column(String(20), nullable=True)
    ceo_comment = Column(Text, nullable=True)
    ceo_decided_at = Column(DateTime, nullable=True)

    finance_decision = Column(String(20), nullable=True)
    finance_comment = Column(Text, nullable=True)
    finance_decided_at = Column(DateTime, nullable=True)
    reimbursed_by_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    reimbursed_at = Column(DateTime, nullable=True)

    user = relationship("User", foreign_keys=[user_id])
    reimbursed_by = relationship("User", foreign_keys=[reimbursed_by_id])
    items = relationship("CashReimbursementItem", back_populates="request", cascade="all, delete-orphan")


class CashReimbursementItem(Base):
    __tablename__ = "cash_reimbursement_items"

    id = Column(Integer, primary_key=True)
    request_id = Column(Integer, ForeignKey("cash_reimbursement_requests.id"), nullable=False, index=True)
    item_date = Column(Date, nullable=False, index=True)
    description = Column(Text, nullable=False)
    amount = Column(Numeric(12, 2), nullable=False)
    client_id = Column(Integer, ForeignKey("client_accounts.id"), nullable=True, index=True)
    source_event_id = Column(Integer, ForeignKey("events.id"), nullable=True, unique=True, index=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    request = relationship("CashReimbursementRequest", back_populates="items")
    client = relationship("ClientAccount", foreign_keys=[client_id])
    source_event = relationship("Event", foreign_keys=[source_event_id])


class CashReimbursementDraft(Base):
    __tablename__ = "cash_reimbursement_drafts"
    __table_args__ = (
        UniqueConstraint("user_id", "period_start", "period_end", name="uq_cash_reimbursement_drafts_user_period"),
    )

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    period_start = Column(Date, nullable=False, index=True)
    period_end = Column(Date, nullable=False, index=True)
    manual_items_json = Column(Text, nullable=False, default="[]")
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    user = relationship("User", foreign_keys=[user_id])
