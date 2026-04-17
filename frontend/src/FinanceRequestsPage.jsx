import React, { useEffect, useMemo, useState } from "react";
import {
  me,
  listCashReimbursementPeriods,
  getCashReimbursementDraft,
  saveCashReimbursementDraft,
  submitCashReimbursement,
  listMyCashReimbursements,
  reopenPendingCashReimbursement,
  listPendingCashReimbursements,
  listApprovedCashReimbursements,
  decideCashReimbursement,
  decideCashReimbursementItem,
  markCashReimbursed,
  submitCashRequisition,
  listMyCashRequisitions,
  listPendingCashRequisitions,
  listApprovedCashRequisitions,
  decideCashRequisition,
  markCashRequisitionDisbursed,
  submitAuthorityToIncurRequest,
  listMyAuthorityToIncurRequests,
  listPendingAuthorityToIncurRequests,
  listApprovedAuthorityToIncurRequests,
  decideAuthorityToIncurRequest,
  markAuthorityToIncurIncurred,
  submitSalaryAdvanceRequest,
  listMySalaryAdvanceRequests,
  listPendingSalaryAdvanceRequests,
  listApprovedSalaryAdvanceRequests,
  decideSalaryAdvanceRequest,
  markSalaryAdvanceDisbursed,
  setSalaryAdvanceDeductionStart,
  withdrawSalaryAdvanceRequest,
  listTaskClients,
  updateTaskClient,
} from "./api";
import { useToast } from "./ToastProvider";
import LoadingState from "./LoadingState";

function toDateInput(v) {
  if (!v) return "";
  const d = new Date(v);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function fmtCurrency(v) {
  return Number(v || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtAmountSummary(requested, approved) {
  const requestedValue = Number(requested || 0);
  const approvedValue = approved == null ? null : Number(approved);
  if (approvedValue == null || Number.isNaN(approvedValue) || approvedValue === requestedValue) {
    return fmtCurrency(requestedValue);
  }
  return `${fmtCurrency(requestedValue)} requested / ${fmtCurrency(approvedValue)} approved`;
}

function statusPillClass(status) {
  const s = (status || "").toLowerCase();
  if (s === "amount_reimbursed") return "dashboard-status-ok";
  if (s === "disbursed" || s === "incurred") return "dashboard-status-ok";
  if (s === "pending_reimbursement") return "dashboard-status-warn";
  if (s === "pending_approval") return "dashboard-status-warn";
  if (s === "pending_finance_review" || s === "pending_ceo_approval" || s === "pending_disbursement" || s === "pending_incurrence" || s === "pending_parallel_approval") return "dashboard-status-warn";
  if (s === "rejected") return "dashboard-status-danger";
  return "dashboard-status-warn";
}

function statusLabel(status, isLateSubmission = false, itemCount = null) {
  const s = (status || "").toLowerCase();
  let label = status || "-";
  const isEmptySubmission = Number(itemCount || 0) === 0;
  if (isEmptySubmission) {
    if (s === "pending_approval") label = "nothing to submit (awaiting approvals)";
    else if (s === "pending_reimbursement") label = "nothing to submit (approved, waiting payout)";
    else if (s === "amount_reimbursed") label = "nothing to submit (paid)";
    else if (s === "rejected") label = "nothing to submit (rejected)";
  } else if (s === "pending_approval") label = "pending approval (awaiting approvals)";
  else if (s === "pending_reimbursement") label = "pending reimbursement (approved, waiting payout)";
  else if (s === "amount_reimbursed") label = "amount reimbursed (paid)";
  else if (s === "rejected") label = "rejected";
  return isLateSubmission ? `${label} - late submission` : label;
}

function decisionLabel(decision) {
  const d = (decision || "").toLowerCase();
  if (d === "approved") return "Approved";
  if (d === "rejected") return "Rejected";
  return "Pending";
}

function reimbursementItemStatusLabel(status) {
  const s = (status || "").toLowerCase();
  if (s === "approved") return "Approved";
  if (s === "rejected") return "Rejected";
  return "Pending";
}

function toSearchText(...parts) {
  return parts
    .flat()
    .map((part) => String(part ?? "").toLowerCase())
    .join(" ");
}

function matchesSearch(search, ...parts) {
  const query = String(search || "").trim().toLowerCase();
  if (!query) return true;
  return toSearchText(...parts).includes(query);
}

function downloadTextFile(filename, content) {
  const blob = new Blob([content], { type: "text/plain;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function fmtDateTime(v) {
  if (!v) return "-";
  try {
    return new Date(v).toLocaleString();
  } catch {
    return String(v);
  }
}

function financeSectionLabel(section) {
  switch (section) {
    case "cash_reimbursement":
      return "Cash Reimbursement";
    case "cash_requisition":
      return "Cash Requisition";
    case "authority_to_incur":
      return "Authority To Incur";
    case "salary_advance":
      return "Salary Advance";
    default:
      return "Finance Request";
  }
}

function buildReimbursementRecordText(r) {
  const itemLines = (r.items || []).map((item, idx) => (
    `${idx + 1}. ${item.item_date} | ${item.description} | ${fmtCurrency(item.amount)} | ${reimbursementItemStatusLabel(item.review_status)}${item.review_comment ? ` | Comment: ${item.review_comment}` : ""}`
  ));
  const approvedTotal = (r.items || [])
    .filter((item) => String(item.review_status || "").toLowerCase() === "approved")
    .reduce((sum, item) => sum + Number(item.amount || 0), 0);
  return [
    "Finance Record",
    `Module: Cash Reimbursement`,
    `Requester: ${r.user?.name || `User #${r.user_id}`}`,
    `Period: ${r.period_start} to ${r.period_end}`,
    `Total: ${fmtCurrency(r.total_amount)}`,
    `Approved Total: ${fmtCurrency(approvedTotal)}`,
    `Status: ${statusLabel(r.status, !!r.is_late_submission, (r.items || []).length)}`,
    `Submitted: ${fmtDateTime(r.submitted_at)}`,
    `CEO Decision: ${decisionLabel(r.ceo_decision)}`,
    `CEO Comment: ${r.ceo_comment || "-"}`,
    `Finance Decision: ${decisionLabel(r.finance_decision)}`,
    `Finance Comment: ${r.finance_comment || "-"}`,
    `Reimbursed At: ${fmtDateTime(r.reimbursed_at)}`,
    "",
    "Items:",
    ...(itemLines.length ? itemLines : ["No submitted items."]),
  ].join("\n");
}

function buildCashRequisitionRecordText(r) {
  return [
    "Finance Record",
    `Module: Cash Requisition`,
    `Requester: ${r.user?.name || `User #${r.user_id}`}`,
    `Purpose: ${r.purpose}`,
    `Requested Amount: ${fmtCurrency(r.amount)}`,
    `Approved Amount: ${r.approved_amount != null ? fmtCurrency(r.approved_amount) : "-"}`,
    `Needed By: ${r.needed_by || "-"}`,
    `Status: ${requisitionStatusLabel(r.status)}`,
    `Submitted: ${fmtDateTime(r.submitted_at)}`,
    `Details: ${r.details || "-"}`,
    `Finance Decision: ${decisionLabel(r.finance_decision)}`,
    `Finance Comment: ${r.finance_comment || "-"}`,
    `CEO Decision: ${decisionLabel(r.ceo_decision)}`,
    `CEO Comment: ${r.ceo_comment || "-"}`,
    `Disbursed At: ${fmtDateTime(r.disbursed_at)}`,
    `Disbursement Note: ${r.disbursed_note || "-"}`,
  ].join("\n");
}

function buildAuthorityRecordText(r) {
  return [
    "Finance Record",
    `Module: Authority To Incur`,
    `Requester: ${r.user?.name || `User #${r.user_id}`}`,
    `Title: ${r.title}`,
    `Requested Amount: ${fmtCurrency(r.amount)}`,
    `Approved Amount: ${r.approved_amount != null ? fmtCurrency(r.approved_amount) : "-"}`,
    `Payee: ${r.payee || "-"}`,
    `Needed By: ${r.needed_by || "-"}`,
    `Status: ${authorityStatusLabel(r.status)}`,
    `Submitted: ${fmtDateTime(r.submitted_at)}`,
    `Details: ${r.details || "-"}`,
    `Finance Decision: ${decisionLabel(r.finance_decision)}`,
    `Finance Comment: ${r.finance_comment || "-"}`,
    `CEO Decision: ${decisionLabel(r.ceo_decision)}`,
    `CEO Comment: ${r.ceo_comment || "-"}`,
    `Incurred At: ${fmtDateTime(r.incurred_at)}`,
    `Incurrence Note: ${r.incurred_note || "-"}`,
  ].join("\n");
}

function buildSalaryAdvanceRecordText(r) {
  return [
    "Finance Record",
    `Module: Salary Advance`,
    `Requester: ${r.user?.name || `User #${r.user_id}`}`,
    `Reason: ${r.reason}`,
    `Requested Amount: ${fmtCurrency(r.amount)}`,
    `Approved Amount: ${r.approved_amount != null ? fmtCurrency(r.approved_amount) : "-"}`,
    `Repayment Months: ${r.repayment_months}`,
    `Deduction Start: ${r.deduction_start_date || "-"}`,
    `Status: ${salaryAdvanceStatusLabel(r.status)}`,
    `Submitted: ${fmtDateTime(r.submitted_at)}`,
    `Details: ${r.details || "-"}`,
    `Finance Decision: ${decisionLabel(r.finance_decision)}`,
    `Finance Comment: ${r.finance_comment || "-"}`,
    `CEO Decision: ${decisionLabel(r.ceo_decision)}`,
    `CEO Comment: ${r.ceo_comment || "-"}`,
    `Disbursed At: ${fmtDateTime(r.disbursed_at)}`,
    `Disbursement Note: ${r.disbursed_note || "-"}`,
  ].join("\n");
}

function requisitionStatusLabel(status) {
  const s = (status || "").toLowerCase();
  if (s === "pending_finance_review") return "pending finance review";
  if (s === "pending_ceo_approval") return "pending CEO approval";
  if (s === "pending_disbursement") return "approved, awaiting disbursement";
  if (s === "disbursed") return "disbursed";
  if (s === "rejected") return "rejected";
  return status || "-";
}

function salaryAdvanceStatusLabel(status) {
  const s = (status || "").toLowerCase();
  if (s === "pending_parallel_approval") return "pending parallel approval";
  if (s === "pending_finance_review") return "pending finance review";
  if (s === "pending_ceo_approval") return "pending CEO approval";
  if (s === "pending_disbursement") return "approved, awaiting disbursement";
  if (s === "disbursed") return "disbursed";
  if (s === "rejected") return "rejected";
  return status || "-";
}

function authorityStatusLabel(status) {
  const s = (status || "").toLowerCase();
  if (s === "pending_parallel_approval") return "pending parallel approval";
  if (s === "pending_finance_review") return "pending finance review";
  if (s === "pending_ceo_approval") return "pending CEO approval";
  if (s === "pending_incurrence") return "approved, awaiting incurrence";
  if (s === "incurred") return "incurred";
  if (s === "rejected") return "rejected";
  return status || "-";
}

function emptyManual() {
  return { item_date: toDateInput(new Date()), description: "", amount: "", source_event_id: null };
}

function reimbursementPeriodKey(periodStart, periodEnd) {
  if (!periodStart || !periodEnd) return "";
  return `${periodStart}|${periodEnd}`;
}

function parseReimbursementPeriodKey(key) {
  const [periodStart, periodEnd] = String(key || "").split("|");
  if (!periodStart || !periodEnd) return { periodStart: null, periodEnd: null };
  return { periodStart, periodEnd };
}

export default function FinanceRequestsPage() {
  const { showToast } = useToast();
  const [current, setCurrent] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const [draft, setDraft] = useState({ period_start: "", period_end: "", auto_items: [], can_edit_manual: true });
  const [reimbursementPeriods, setReimbursementPeriods] = useState([]);
  const [selectedReimbursementPeriod, setSelectedReimbursementPeriod] = useState("");
  const [manualItems, setManualItems] = useState([emptyManual()]);
  const [myRequests, setMyRequests] = useState([]);
  const [pendingRequests, setPendingRequests] = useState([]);
  const [approvedRequests, setApprovedRequests] = useState([]);
  const [clientPricing, setClientPricing] = useState([]);
  const [pricingSaving, setPricingSaving] = useState(false);
  const [showClientPricing, setShowClientPricing] = useState(false);
  const [activeSection, setActiveSection] = useState("cash_reimbursement");
  const [reqForm, setReqForm] = useState({
    amount: "",
    purpose: "",
    details: "",
    needed_by: "",
  });
  const [myRequisitions, setMyRequisitions] = useState([]);
  const [pendingRequisitions, setPendingRequisitions] = useState([]);
  const [approvedRequisitions, setApprovedRequisitions] = useState([]);
  const [approvalDialog, setApprovalDialog] = useState(null);
  const [atiForm, setAtiForm] = useState({
    amount: "",
    title: "",
    payee: "",
    details: "",
    needed_by: "",
  });
  const [myAtiRequests, setMyAtiRequests] = useState([]);
  const [pendingAtiRequests, setPendingAtiRequests] = useState([]);
  const [approvedAtiRequests, setApprovedAtiRequests] = useState([]);
  const [saForm, setSaForm] = useState({
    amount: "",
    reason: "",
    details: "",
    repayment_months: "1",
  });
  const [mySalaryAdvances, setMySalaryAdvances] = useState([]);
  const [pendingSalaryAdvances, setPendingSalaryAdvances] = useState([]);
  const [approvedSalaryAdvances, setApprovedSalaryAdvances] = useState([]);
  const [searchBySection, setSearchBySection] = useState({
    cash_reimbursement: "",
    cash_requisition: "",
    authority_to_incur: "",
    salary_advance: "",
  });

  const canReview = useMemo(() => {
    const role = (current?.role || "").toLowerCase();
    return role === "finance" || role === "admin" || role === "ceo";
  }, [current?.role]);
  const reviewerSlot = useMemo(() => {
    const role = (current?.role || "").toLowerCase();
    if (role === "finance") return "finance";
    if (role === "admin" || role === "ceo") return "ceo";
    return "";
  }, [current?.role]);
  const canApplyReimbursement = useMemo(() => {
    const role = (current?.role || "").toLowerCase();
    return role !== "admin" && role !== "ceo";
  }, [current?.role]);
  const canDownloadRecords = useMemo(() => {
    const role = (current?.role || "").toLowerCase();
    return role === "admin" || role === "ceo" || role === "finance";
  }, [current?.role]);
  const selectedReimbursementMeta = useMemo(
    () => (reimbursementPeriods || []).find((p) => reimbursementPeriodKey(p.period_start, p.period_end) === selectedReimbursementPeriod) || null,
    [reimbursementPeriods, selectedReimbursementPeriod]
  );

  const totalAmount = useMemo(() => {
    const autoTotal = (draft.auto_items || []).reduce((acc, x) => acc + Number(x.amount || 0), 0);
    const manualTotal = (manualItems || []).reduce((acc, x) => acc + Number(x.amount || 0), 0);
    return autoTotal + manualTotal;
  }, [draft.auto_items, manualItems]);
  const activeSearch = searchBySection[activeSection] || "";

  function applyDraftState(draftData) {
    setDraft(draftData || { period_start: "", period_end: "", auto_items: [], can_edit_manual: true });
    const savedManualRows = (draftData?.manual_items || []).map((x) => ({
      item_date: x.item_date ? toDateInput(x.item_date) : "",
      description: String(x.description || ""),
      amount: x.amount == null ? "" : String(x.amount),
      source_event_id: x.source_event_id ?? null,
    }));
    setManualItems(savedManualRows.length ? savedManualRows : [emptyManual()]);
  }

  async function loadReimbursementDraftForSelected(periodKey) {
    const { periodStart, periodEnd } = parseReimbursementPeriodKey(periodKey);
    const draftData = await getCashReimbursementDraft(periodStart, periodEnd);
    applyDraftState(draftData);
  }

  async function loadData() {
    setBusy(true);
    setErr("");
    try {
      const user = await me();
      setCurrent(user);
      const [periods, mine] = await Promise.all([
        listCashReimbursementPeriods(),
        listMyCashReimbursements(),
      ]);
      const periodRows = periods || [];
      setReimbursementPeriods(periodRows);
      const periodKeys = new Set(periodRows.map((p) => reimbursementPeriodKey(p.period_start, p.period_end)));
      const currentKey = reimbursementPeriodKey(
        periodRows.find((p) => p.is_current)?.period_start,
        periodRows.find((p) => p.is_current)?.period_end
      );
      const selectedPeriod = (periodRows || []).find((p) => reimbursementPeriodKey(p.period_start, p.period_end) === selectedReimbursementPeriod) || null;
      const shouldPreferCurrent = !!currentKey && (!selectedPeriod || selectedPeriod.is_current || selectedPeriod.has_submission);
      const fallbackKey = currentKey || (periodRows[0] ? reimbursementPeriodKey(periodRows[0].period_start, periodRows[0].period_end) : "");
      const effectivePeriodKey = shouldPreferCurrent
        ? currentKey
        : (periodKeys.has(selectedReimbursementPeriod) ? selectedReimbursementPeriod : fallbackKey);
      if (effectivePeriodKey) {
        setSelectedReimbursementPeriod(effectivePeriodKey);
        await loadReimbursementDraftForSelected(effectivePeriodKey);
      } else {
        applyDraftState(null);
      }
      setMyRequests(mine || []);
      const myReqs = await listMyCashRequisitions();
      setMyRequisitions(myReqs || []);
      const myAti = await listMyAuthorityToIncurRequests();
      setMyAtiRequests(myAti || []);
      const mySas = await listMySalaryAdvanceRequests();
      setMySalaryAdvances(mySas || []);
      if (user.role === "admin" || user.role === "ceo") {
        const clients = await listTaskClients(new Date().getFullYear());
        setClientPricing((clients || []).map((c) => ({
          id: c.id,
          name: c.name,
          reimbursement_amount: String(Number(c.reimbursement_amount || 0)),
        })));
      } else {
        setClientPricing([]);
      }
      if (user.role === "finance" || user.role === "admin" || user.role === "ceo") {
        const [pending, approved, pendingReqs, approvedReqs, pendingAti, approvedAti, pendingSas, approvedSas] = await Promise.all([
          listPendingCashReimbursements(),
          listApprovedCashReimbursements(),
          listPendingCashRequisitions(),
          listApprovedCashRequisitions(),
          listPendingAuthorityToIncurRequests(),
          listApprovedAuthorityToIncurRequests(),
          listPendingSalaryAdvanceRequests(),
          listApprovedSalaryAdvanceRequests(),
        ]);
        setPendingRequests(pending || []);
        setApprovedRequests(approved || []);
        setPendingRequisitions(pendingReqs || []);
        setApprovedRequisitions(approvedReqs || []);
        setPendingAtiRequests(pendingAti || []);
        setApprovedAtiRequests(approvedAti || []);
        setPendingSalaryAdvances(pendingSas || []);
        setApprovedSalaryAdvances(approvedSas || []);
      } else {
        setPendingRequests([]);
        setApprovedRequests([]);
        setPendingRequisitions([]);
        setApprovedRequisitions([]);
        setPendingAtiRequests([]);
        setApprovedAtiRequests([]);
        setPendingSalaryAdvances([]);
        setApprovedSalaryAdvances([]);
      }
    } catch (e) {
      setErr(String(e.message || e));
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function addManualRow() {
    if (!draft.can_edit_manual) return;
    setManualItems((prev) => [...prev, emptyManual()]);
  }

  function removeManualRow(idx) {
    if (!draft.can_edit_manual) return;
    setManualItems((prev) => (prev.length <= 1 ? prev : prev.filter((_, i) => i !== idx)));
  }

  function updateManualRow(idx, patch) {
    if (!draft.can_edit_manual) return;
    setManualItems((prev) => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  }

  async function changeReimbursementPeriod(nextKey) {
    setErr("");
    setSelectedReimbursementPeriod(nextKey);
    setBusy(true);
    try {
      await loadReimbursementDraftForSelected(nextKey);
    } catch (e) {
      setErr(String(e.message || e));
    } finally {
      setBusy(false);
    }
  }

  async function submitReimbursement() {
    setErr("");
    const cleaned = (manualItems || [])
      .map((x) => ({
        item_date: x.item_date,
        description: (x.description || "").trim(),
        amount: Number(x.amount || 0),
        source_event_id: x.source_event_id ?? null,
      }))
      .filter((x) => x.description || x.amount > 0);

    for (const row of cleaned) {
      if (!row.item_date) {
        setErr("Manual reimbursement date is required.");
        return;
      }
      if (!row.description) {
        setErr("Manual reimbursement description is required.");
        return;
      }
      if (!(row.amount > 0)) {
        setErr("Manual reimbursement amount must be greater than 0.");
        return;
      }
    }

    try {
      const { periodStart, periodEnd } = parseReimbursementPeriodKey(
        selectedReimbursementPeriod || reimbursementPeriodKey(draft.period_start, draft.period_end)
      );
      const hasAnyItems = ((draft?.auto_items || []).length + cleaned.length) > 0;
      await submitCashReimbursement(cleaned, periodStart, periodEnd);
      setManualItems([emptyManual()]);
      await loadData();
      showToast(hasAnyItems ? "Cash reimbursement submitted for approval" : "Nothing to submit submitted for approval", "success");
    } catch (e) {
      const msg = String(e.message || e);
      setErr(msg);
      showToast(msg, "error");
    }
  }

  async function reopenMyReimbursementRequest(request) {
    setErr("");
    if (!request?.id) return;
    try {
      await reopenPendingCashReimbursement(request.id);
      await loadData();
      showToast("Submission reopened for editing", "success");
    } catch (e) {
      const msg = String(e.message || e);
      setErr(msg);
      showToast(msg, "error");
    }
  }

  async function saveManualDraft() {
    setErr("");
    if (!draft.can_edit_manual) return;
    const payload = (manualItems || []).map((x) => {
      const amount = String(x.amount || "").trim();
      return {
        item_date: x.item_date || null,
        description: (x.description || "").trim(),
        amount: amount === "" ? null : Number(amount),
        source_event_id: x.source_event_id ?? null,
      };
    });
    if (payload.some((x) => x.amount != null && Number.isNaN(x.amount))) {
      setErr("Manual reimbursement amount must be a valid number.");
      return;
    }
    try {
      const { periodStart, periodEnd } = parseReimbursementPeriodKey(
        selectedReimbursementPeriod || reimbursementPeriodKey(draft.period_start, draft.period_end)
      );
      const saved = await saveCashReimbursementDraft(payload, periodStart, periodEnd);
      applyDraftState(saved || draft);
      showToast("Manual reimbursement draft saved", "success");
    } catch (e) {
      const msg = String(e.message || e);
      setErr(msg);
      showToast(msg, "error");
    }
  }

  async function takeDecision(requestId, approve) {
    const comment = approve ? "" : (prompt("Reason for denial (required):") || "").trim();
    if (!approve && !comment) {
      setErr("Denial comment is required.");
      return;
    }
    try {
      await decideCashReimbursement(requestId, approve, comment);
      await loadData();
      showToast(approve ? "Request approved" : "Request rejected", "success");
    } catch (e) {
      const msg = String(e.message || e);
      setErr(msg);
      showToast(msg, "error");
    }
  }

  async function takeItemDecision(requestId, itemId, approve) {
    const comment = approve ? "" : (prompt("Reason for rejecting this reimbursement row (required):") || "").trim();
    if (!approve && !comment) {
      setErr("Row rejection comment is required.");
      return;
    }
    try {
      await decideCashReimbursementItem(requestId, itemId, approve, comment);
      await loadData();
      showToast(approve ? "Reimbursement row approved" : "Reimbursement row rejected", "success");
    } catch (e) {
      const msg = String(e.message || e);
      setErr(msg);
      showToast(msg, "error");
    }
  }

  async function markReimbursed(requestId) {
    try {
      await markCashReimbursed(requestId);
      await loadData();
      showToast("Reimbursement marked as paid", "success");
    } catch (e) {
      const msg = String(e.message || e);
      setErr(msg);
      showToast(msg, "error");
    }
  }

  function downloadRecord(section, record) {
    let content = "";
    let filename = "";
    if (section === "cash_reimbursement") {
      content = buildReimbursementRecordText(record);
      filename = `cash-reimbursement-${record.id}.txt`;
    } else if (section === "cash_requisition") {
      content = buildCashRequisitionRecordText(record);
      filename = `cash-requisition-${record.id}.txt`;
    } else if (section === "authority_to_incur") {
      content = buildAuthorityRecordText(record);
      filename = `authority-to-incur-${record.id}.txt`;
    } else if (section === "salary_advance") {
      content = buildSalaryAdvanceRecordText(record);
      filename = `salary-advance-${record.id}.txt`;
    }
    if (!content || !filename) return;
    downloadTextFile(filename, content);
    showToast(`${financeSectionLabel(section)} record downloaded`, "success");
  }

  async function submitRequisition() {
    setErr("");
    const amount = Number(reqForm.amount || 0);
    const purpose = (reqForm.purpose || "").trim();
    const details = (reqForm.details || "").trim();
    if (!(amount > 0)) {
      setErr("Requisition amount must be greater than 0.");
      return;
    }
    if (!purpose) {
      setErr("Purpose is required.");
      return;
    }
    try {
      await submitCashRequisition({
        amount,
        purpose,
        details: details || null,
        needed_by: reqForm.needed_by || null,
      });
      setReqForm({ amount: "", purpose: "", details: "", needed_by: "" });
      await loadData();
      showToast("Cash requisition submitted", "success");
    } catch (e) {
      const msg = String(e.message || e);
      setErr(msg);
      showToast(msg, "error");
    }
  }

  async function takeRequisitionDecision(requestId, approve) {
    if (approve) {
      const req = pendingRequisitions.find((row) => row.id === requestId);
      if (!req) {
        setErr("Cash requisition request not found.");
        return;
      }
      openAmountApprovalDialog("cash_requisition", requestId, req.amount, "Cash Requisition Approval");
      return;
    }
    const comment = approve ? "" : (prompt("Reason for rejection (required):") || "").trim();
    if (!approve && !comment) {
      setErr("Rejection comment is required.");
      return;
    }
    try {
      await decideCashRequisition(requestId, approve, comment);
      await loadData();
      showToast(approve ? "Requisition approved" : "Requisition rejected", "success");
    } catch (e) {
      const msg = String(e.message || e);
      setErr(msg);
      showToast(msg, "error");
    }
  }

  async function markRequisitionDisbursed(requestId) {
    const note = (prompt("Disbursement note (optional):") || "").trim();
    try {
      await markCashRequisitionDisbursed(requestId, note);
      await loadData();
      showToast("Requisition marked disbursed", "success");
    } catch (e) {
      const msg = String(e.message || e);
      setErr(msg);
      showToast(msg, "error");
    }
  }

  function canCurrentRoleDecideReimbursement(r) {
    const role = (current?.role || "").toLowerCase();
    const status = (r?.status || "").toLowerCase();
    if (status !== "pending_approval") return false;
    if (role === "finance") return !r?.finance_decision;
    if (role === "admin" || role === "ceo") return !r?.ceo_decision;
    return false;
  }

  function canCurrentRoleDecideRequisition(r) {
    const role = (current?.role || "").toLowerCase();
    if (role === "finance") return (r.status || "").toLowerCase() === "pending_finance_review";
    if (role === "admin" || role === "ceo") {
      const s = (r.status || "").toLowerCase();
      return s === "pending_finance_review" || s === "pending_ceo_approval";
    }
    return false;
  }

  function canCurrentRoleDecideAuthority(r) {
    const role = (current?.role || "").toLowerCase();
    const status = (r.status || "").toLowerCase();
    if (status === "rejected" || status === "pending_incurrence" || status === "incurred") return false;
    if (role === "finance") {
      if (status === "pending_parallel_approval" && !r.finance_decision) return true;
      if (status === "pending_ceo_approval" && !r.finance_decision) return true;
      if (status === "pending_finance_review") return true;
      return false;
    }
    if (role === "admin" || role === "ceo") {
      if (status === "pending_parallel_approval" && !r.ceo_decision) return true;
      if (status === "pending_ceo_approval" && !r.ceo_decision) return true;
      if (status === "pending_finance_review") return true;
      return false;
    }
    return false;
  }

  function canCurrentRoleDecideSalaryAdvance(r) {
    const role = (current?.role || "").toLowerCase();
    const status = (r.status || "").toLowerCase();
    if (status === "rejected" || status === "pending_disbursement" || status === "disbursed") return false;
    if (role === "finance") {
      if (status === "pending_parallel_approval" && !r.finance_decision) return true;
      if (status === "pending_ceo_approval" && !r.finance_decision) return true;
      if (status === "pending_finance_review") return true;
      return false;
    }
    if (role === "admin" || role === "ceo") {
      if (status === "pending_parallel_approval" && !r.ceo_decision) return true;
      if (status === "pending_ceo_approval" && !r.ceo_decision) return true;
      if (status === "pending_finance_review") return true;
      return false;
    }
    return false;
  }

  const filteredMyRequests = useMemo(
    () => (myRequests || []).filter((r) => matchesSearch(activeSearch, r.user?.name, r.period_start, r.period_end, r.status, r.ceo_comment, r.finance_comment)),
    [myRequests, activeSearch]
  );
  const filteredPendingRequests = useMemo(
    () => (pendingRequests || []).filter((r) => matchesSearch(activeSearch, r.user?.name, r.period_start, r.period_end, r.status, ...(r.items || []).map((item) => `${item.description} ${item.review_comment || ""}`))),
    [pendingRequests, activeSearch]
  );
  const filteredApprovedRequests = useMemo(
    () => (approvedRequests || []).filter((r) => matchesSearch(activeSearch, r.user?.name, r.period_start, r.period_end, r.status, r.ceo_comment, r.finance_comment)),
    [approvedRequests, activeSearch]
  );
  const filteredMyRequisitions = useMemo(
    () => (myRequisitions || []).filter((r) => matchesSearch(activeSearch, r.purpose, r.details, r.status, r.finance_comment, r.ceo_comment)),
    [myRequisitions, activeSearch]
  );
  const filteredPendingRequisitions = useMemo(
    () => (pendingRequisitions || []).filter((r) => matchesSearch(activeSearch, r.user?.name, r.purpose, r.details, r.status)),
    [pendingRequisitions, activeSearch]
  );
  const filteredApprovedRequisitions = useMemo(
    () => (approvedRequisitions || []).filter((r) => matchesSearch(activeSearch, r.user?.name, r.purpose, r.details, r.status, r.disbursed_note, r.finance_comment, r.ceo_comment)),
    [approvedRequisitions, activeSearch]
  );
  const filteredMyAtiRequests = useMemo(
    () => (myAtiRequests || []).filter((r) => matchesSearch(activeSearch, r.title, r.payee, r.details, r.status, r.finance_comment, r.ceo_comment, r.incurred_note)),
    [myAtiRequests, activeSearch]
  );
  const filteredPendingAtiRequests = useMemo(
    () => (pendingAtiRequests || []).filter((r) => matchesSearch(activeSearch, r.user?.name, r.title, r.payee, r.details, r.status)),
    [pendingAtiRequests, activeSearch]
  );
  const filteredApprovedAtiRequests = useMemo(
    () => (approvedAtiRequests || []).filter((r) => matchesSearch(activeSearch, r.user?.name, r.title, r.payee, r.details, r.status, r.incurred_note, r.finance_comment, r.ceo_comment)),
    [approvedAtiRequests, activeSearch]
  );
  const filteredMySalaryAdvances = useMemo(
    () => (mySalaryAdvances || []).filter((r) => matchesSearch(activeSearch, r.reason, r.details, r.status, r.finance_comment, r.ceo_comment, r.disbursed_note)),
    [mySalaryAdvances, activeSearch]
  );
  const filteredPendingSalaryAdvances = useMemo(
    () => (pendingSalaryAdvances || []).filter((r) => matchesSearch(activeSearch, r.user?.name, r.reason, r.details, r.status)),
    [pendingSalaryAdvances, activeSearch]
  );
  const filteredApprovedSalaryAdvances = useMemo(
    () => (approvedSalaryAdvances || []).filter((r) => matchesSearch(activeSearch, r.user?.name, r.reason, r.details, r.status, r.disbursed_note, r.finance_comment, r.ceo_comment)),
    [approvedSalaryAdvances, activeSearch]
  );

  const attentionCounts = useMemo(() => {
    if (!canReview) {
      return {
        cash_reimbursement: 0,
        cash_requisition: 0,
        authority_to_incur: 0,
        salary_advance: 0,
      };
    }
    return {
      cash_reimbursement: (pendingRequests || []).filter(canCurrentRoleDecideReimbursement).length,
      cash_requisition: (pendingRequisitions || []).filter(canCurrentRoleDecideRequisition).length,
      authority_to_incur: (pendingAtiRequests || []).filter(canCurrentRoleDecideAuthority).length,
      salary_advance: (pendingSalaryAdvances || []).filter(canCurrentRoleDecideSalaryAdvance).length,
    };
  }, [
    canReview,
    pendingRequests,
    pendingRequisitions,
    pendingAtiRequests,
    pendingSalaryAdvances,
    current?.role,
  ]);
  function notifBadge(count) {
    if (!(count > 0)) return null;
    return (
      <span
        style={{
          position: "absolute",
          top: -8,
          right: -8,
          minWidth: 18,
          height: 18,
          borderRadius: 999,
          background: "#dc2626",
          color: "#fff",
          fontSize: 11,
          fontWeight: 800,
          lineHeight: "18px",
          textAlign: "center",
          padding: "0 4px",
          boxShadow: "0 2px 8px rgba(0,0,0,0.18)",
        }}
      >
        {count > 99 ? "99+" : String(count)}
      </span>
    );
  }

  if (busy && !current) {
    return (
      <div className="page-wrap finance-page">
        <div className="card">
          <LoadingState label="Loading finance requests..." />
        </div>
      </div>
    );
  }

  function openAmountApprovalDialog(kind, requestId, requestedAmount, title) {
    setErr("");
    setApprovalDialog({
      kind,
      requestId,
      requestedAmount: Number(requestedAmount || 0),
      title,
      mode: "full",
      partialAmount: String(requestedAmount || ""),
    });
  }

  async function confirmAmountApprovalDialog() {
    if (!approvalDialog) return;
    const requestedAmount = Number(approvalDialog.requestedAmount || 0);
    const approvedAmount = approvalDialog.mode === "full"
      ? requestedAmount
      : Number(approvalDialog.partialAmount || 0);

    if (!(approvedAmount > 0)) {
      setErr("Approved amount must be greater than 0.");
      return;
    }
    if (approvedAmount > requestedAmount) {
      setErr("Approved amount cannot exceed requested amount.");
      return;
    }

    try {
      if (approvalDialog.kind === "cash_requisition") {
        await decideCashRequisition(approvalDialog.requestId, true, "", approvedAmount);
        showToast(approvedAmount === requestedAmount ? "Requisition approved for the full amount" : "Requisition approved for a partial amount", "success");
      } else if (approvalDialog.kind === "authority_to_incur") {
        await decideAuthorityToIncurRequest(approvalDialog.requestId, true, "", approvedAmount);
        showToast(approvedAmount === requestedAmount ? "Authority request approved for the full amount" : "Authority request approved for a partial amount", "success");
      } else if (approvalDialog.kind === "salary_advance") {
        await decideSalaryAdvanceRequest(approvalDialog.requestId, true, "", approvedAmount);
        showToast(approvedAmount === requestedAmount ? "Salary advance approved for the full amount" : "Salary advance approved for a partial amount", "success");
      } else {
        throw new Error("Unknown approval request type");
      }
      setApprovalDialog(null);
      await loadData();
    } catch (e) {
      const msg = String(e.message || e);
      setErr(msg);
      showToast(msg, "error");
    }
  }

  async function submitAuthorityToIncur() {
    setErr("");
    const amount = Number(atiForm.amount || 0);
    const title = (atiForm.title || "").trim();
    const payee = (atiForm.payee || "").trim();
    const details = (atiForm.details || "").trim();
    if (!(amount > 0)) {
      setErr("Authority amount must be greater than 0.");
      return;
    }
    if (!title) {
      setErr("Title is required.");
      return;
    }
    try {
      await submitAuthorityToIncurRequest({
        amount,
        title,
        payee: payee || null,
        details: details || null,
        needed_by: atiForm.needed_by || null,
      });
      setAtiForm({
        amount: "",
        title: "",
        payee: "",
        details: "",
        needed_by: "",
      });
      await loadData();
      showToast("Authority to incur request submitted", "success");
    } catch (e) {
      const msg = String(e.message || e);
      setErr(msg);
      showToast(msg, "error");
    }
  }

  async function takeAuthorityDecision(requestId, approve) {
    if (approve) {
      const req = pendingAtiRequests.find((row) => row.id === requestId);
      if (!req) {
        setErr("Authority to incur request not found.");
        return;
      }
      openAmountApprovalDialog("authority_to_incur", requestId, req.amount, "Authority To Incur Approval");
      return;
    }
    const comment = approve ? "" : (prompt("Reason for rejection (required):") || "").trim();
    if (!approve && !comment) {
      setErr("Rejection comment is required.");
      return;
    }
    try {
      await decideAuthorityToIncurRequest(requestId, approve, comment);
      await loadData();
      showToast(approve ? "Authority request approved" : "Authority request rejected", "success");
    } catch (e) {
      const msg = String(e.message || e);
      setErr(msg);
      showToast(msg, "error");
    }
  }

  async function markAuthorityIncurred(requestId) {
    const note = (prompt("Incurrence note (optional):") || "").trim();
    try {
      await markAuthorityToIncurIncurred(requestId, note);
      await loadData();
      showToast("Request marked incurred", "success");
    } catch (e) {
      const msg = String(e.message || e);
      setErr(msg);
      showToast(msg, "error");
    }
  }

  async function submitSalaryAdvance() {
    setErr("");
    const amount = Number(saForm.amount || 0);
    const reason = (saForm.reason || "").trim();
    const details = (saForm.details || "").trim();
    const repaymentMonths = Number(saForm.repayment_months || 0);
    if (!(amount > 0)) {
      setErr("Salary advance amount must be greater than 0.");
      return;
    }
    if (!reason) {
      setErr("Reason is required.");
      return;
    }
    if (!Number.isInteger(repaymentMonths) || repaymentMonths < 1 || repaymentMonths > 24) {
      setErr("Repayment months must be between 1 and 24.");
      return;
    }
    try {
      await submitSalaryAdvanceRequest({
        amount,
        reason,
        details: details || null,
        repayment_months: repaymentMonths,
      });
      setSaForm({
        amount: "",
        reason: "",
        details: "",
        repayment_months: "1",
      });
      await loadData();
      showToast("Salary advance request submitted", "success");
    } catch (e) {
      const msg = String(e.message || e);
      setErr(msg);
      showToast(msg, "error");
    }
  }

  async function takeSalaryAdvanceDecision(requestId, approve, requestedAmount) {
    if (approve) {
      const req = pendingSalaryAdvances.find((row) => row.id === requestId);
      if (!req) {
        setErr("Salary advance request not found.");
        return;
      }
      openAmountApprovalDialog("salary_advance", requestId, req.amount, "Salary Advance Approval");
      return;
    }
    const comment = approve ? "" : (prompt("Reason for rejection (required):") || "").trim();
    if (!approve && !comment) {
      setErr("Rejection comment is required.");
      return;
    }
    try {
      await decideSalaryAdvanceRequest(requestId, approve, comment);
      await loadData();
      showToast(approve ? "Salary advance approved" : "Salary advance rejected", "success");
    } catch (e) {
      const msg = String(e.message || e);
      setErr(msg);
      showToast(msg, "error");
    }
  }

  async function markSalaryAdvancePaid(requestId) {
    const note = (prompt("Disbursement note (optional):") || "").trim();
    try {
      await markSalaryAdvanceDisbursed(requestId, note);
      await loadData();
      showToast("Salary advance marked disbursed", "success");
    } catch (e) {
      const msg = String(e.message || e);
      setErr(msg);
      showToast(msg, "error");
    }
  }

  async function setDeductionStartDate(requestId) {
    const value = (prompt("Set deduction start date (YYYY-MM-DD):") || "").trim();
    if (!value) return;
    try {
      await setSalaryAdvanceDeductionStart(requestId, value);
      await loadData();
      showToast("Deduction start date updated", "success");
    } catch (e) {
      const msg = String(e.message || e);
      setErr(msg);
      showToast(msg, "error");
    }
  }

  function remainingApprovers(r) {
    const remaining = [];
    if (!r?.ceo_decision) remaining.push("CEO");
    if (!r?.finance_decision) remaining.push("Finance");
    return remaining;
  }

  function reimbursementReviewSummary(r) {
    const items = r?.items || [];
    const summary = {
      approved: 0,
      rejected: 0,
      pending: 0,
      total: items.length,
    };
    items.forEach((item) => {
      const status = String(item.review_status || "").toLowerCase();
      if (status === "approved") summary.approved += 1;
      else if (status === "rejected") summary.rejected += 1;
      else summary.pending += 1;
    });
    return summary;
  }

  async function saveAllClientPrices() {
    setErr("");
    const invalid = (clientPricing || []).find((row) => {
      const amount = Number(row.reimbursement_amount || 0);
      return Number.isNaN(amount) || amount < 0;
    });
    if (invalid) {
      setErr("Client reimbursement amount must be a number >= 0.");
      return;
    }
    setPricingSaving(true);
    try {
      await Promise.all((clientPricing || []).map((row) => {
        const amount = Number(row.reimbursement_amount || 0);
        return updateTaskClient(row.id, amount);
      }));
      await loadData();
      showToast("Client visit reimbursement amounts saved", "success");
    } catch (e) {
      const msg = String(e.message || e);
      setErr(msg);
      showToast(msg, "error");
    } finally {
      setPricingSaving(false);
    }
  }

  return (
    <div className="page-wrap finance-page">
      <div className="card" style={{ marginBottom: 12 }}>
        <div style={{ fontWeight: 900, fontSize: 18 }}>Finance Requests</div>
        <div className="muted">Use the request menu to navigate between finance modules.</div>
      </div>

      {err && <div className="error">{err}</div>}

      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "flex-start" }}>
        <div className="card" style={{ flex: "1 1 220px", minWidth: 220 }}>
          <div style={{ fontWeight: 800, marginBottom: 8 }}>Request Types</div>
          <div style={{ display: "grid", gap: 8 }}>
            <button className={`btn ${activeSection === "cash_reimbursement" ? "btn-primary" : ""}`} type="button" onClick={() => setActiveSection("cash_reimbursement")} style={{ position: "relative" }}>
              Cash Reimbursement
              {notifBadge(attentionCounts.cash_reimbursement)}
            </button>
            <button className={`btn ${activeSection === "cash_requisition" ? "btn-primary" : ""}`} type="button" onClick={() => setActiveSection("cash_requisition")} style={{ position: "relative" }}>
              Cash Requisition
              {notifBadge(attentionCounts.cash_requisition)}
            </button>
            <button className={`btn ${activeSection === "authority_to_incur" ? "btn-primary" : ""}`} type="button" onClick={() => setActiveSection("authority_to_incur")} style={{ position: "relative" }}>
              Authority To Incur Expenditure
              {notifBadge(attentionCounts.authority_to_incur)}
            </button>
            <button className={`btn ${activeSection === "salary_advance" ? "btn-primary" : ""}`} type="button" onClick={() => setActiveSection("salary_advance")} style={{ position: "relative" }}>
              Salary Advance Request
              {notifBadge(attentionCounts.salary_advance)}
            </button>
          </div>
        </div>

        <div style={{ flex: "999 1 520px", minWidth: 0 }}>
      <div className="card" style={{ marginBottom: 12 }}>
        <div style={{ fontWeight: 800, marginBottom: 8 }}>{financeSectionLabel(activeSection)} Search</div>
        <div className="field" style={{ marginBottom: 0 }}>
          <label>Filter records</label>
          <input
            value={activeSearch}
            onChange={(e) => setSearchBySection((prev) => ({ ...prev, [activeSection]: e.target.value }))}
            placeholder={`Search ${financeSectionLabel(activeSection).toLowerCase()} records by requester, status, title, comments, or details`}
          />
        </div>
      </div>
      {activeSection === "cash_reimbursement" && (
        <>
      <div className="card" style={{ marginBottom: 12 }}>
        <div style={{ fontWeight: 900, marginBottom: 8 }}>Cash Reimbursement</div>
        {(current?.role === "admin" || current?.role === "ceo") && (
          <div style={{ marginBottom: 12 }}>
            <button
              className="btn"
              type="button"
              onClick={() => setShowClientPricing((v) => !v)}
              style={{ marginBottom: 8 }}
            >
              {showClientPricing ? "Hide" : "Show"} Client Visit Amount Setup (Admin/CEO only)
            </button>
            {showClientPricing && (
              <>
                <div className="muted" style={{ marginBottom: 8 }}>
                  Set default reimbursement amount per client. Auto-filled Client Visit reimbursements use these values.
                </div>
                <div style={{ width: "100%", overflowX: "auto" }}>
                  <table className="table" style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                      <tr style={{ background: "#f8fafc" }}>
                        <th style={{ textAlign: "left", padding: 10 }}>Client</th>
                        <th style={{ textAlign: "left", padding: 10 }}>Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {clientPricing.map((row) => (
                        <tr key={row.id} style={{ borderTop: "1px solid #eef2f7" }}>
                          <td style={{ padding: 10 }}>{row.name}</td>
                          <td style={{ padding: 10 }}>
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              value={row.reimbursement_amount}
                              onChange={(e) => setClientPricing((prev) => prev.map((x) => (
                                x.id === row.id ? { ...x, reimbursement_amount: e.target.value } : x
                              )))}
                            />
                          </td>
                        </tr>
                      ))}
                      {!clientPricing.length && (
                        <tr><td colSpan={2} style={{ padding: 14 }} className="muted">No clients found.</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
                {clientPricing.length > 0 && (
                  <div style={{ marginTop: 8 }}>
                    <button className="btn btn-primary" type="button" onClick={saveAllClientPrices} disabled={pricingSaving}>
                      {pricingSaving ? "Saving..." : "Save All"}
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        )}
        {canApplyReimbursement && (
          <>
            <div className="field" style={{ maxWidth: 420, marginBottom: 10 }}>
              <label>Reimbursement Period</label>
              <select
                value={selectedReimbursementPeriod}
                onChange={(e) => changeReimbursementPeriod(e.target.value)}
              >
                {(reimbursementPeriods || []).map((p) => {
                  const k = reimbursementPeriodKey(p.period_start, p.period_end);
                  const statusBits = [];
                  if (p.is_current) statusBits.push("Current");
                  if (p.has_submission) statusBits.push(`Submitted: ${statusLabel(p.submission_status, p.is_late_submission, p.submission_item_count)}`);
                  else if (p.can_submit && !p.is_current) statusBits.push("Late submission open");
                  return (
                    <option key={k} value={k}>
                      {p.period_start} to {p.period_end}{statusBits.length ? ` (${statusBits.join(", ")})` : ""}
                    </option>
                  );
                })}
              </select>
            </div>
            <div className="muted" style={{ marginBottom: 10 }}>
              Period: {draft.period_start || "-"} to {draft.period_end || "-"}
            </div>
            <div className="muted" style={{ marginBottom: 10 }}>
              {draft.submit_message || "Cash reimbursement can be submitted on the 15th and 30th of each month, and Feb 28."}
            </div>
            {selectedReimbursementMeta?.has_submission && (
              <div className="muted" style={{ marginBottom: 10 }}>
                Submission status: {statusLabel(selectedReimbursementMeta.submission_status, selectedReimbursementMeta.is_late_submission, selectedReimbursementMeta.submission_item_count)}
              </div>
            )}

            <div style={{ width: "100%", overflowX: "auto" }}>
              <table className="table" style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ background: "#f8fafc" }}>
                    <th style={{ textAlign: "left", padding: 10 }}>Date</th>
                    <th style={{ textAlign: "left", padding: 10 }}>Description</th>
                    <th style={{ textAlign: "left", padding: 10 }}>Amount</th>
                    <th style={{ textAlign: "left", padding: 10 }}>Source</th>
                  </tr>
                </thead>
                <tbody>
                  {(draft.auto_items || []).map((item, idx) => (
                    <tr key={`auto_${idx}`} style={{ borderTop: "1px solid #eef2f7" }}>
                      <td style={{ padding: 10 }}>{item.item_date}</td>
                      <td style={{ padding: 10 }}>{item.description}</td>
                      <td style={{ padding: 10 }}>{fmtCurrency(item.amount)}</td>
                      <td style={{ padding: 10 }}><span className="pill">Auto: Client Visit</span></td>
                    </tr>
                  ))}

                  {(manualItems || []).map((row, idx) => (
                    <tr key={`manual_${idx}`} style={{ borderTop: "1px solid #eef2f7" }}>
                      <td style={{ padding: 10 }}>
                        <input
                          type="date"
                          value={row.item_date}
                          onChange={(e) => updateManualRow(idx, { item_date: e.target.value })}
                          disabled={!draft.can_edit_manual}
                        />
                      </td>
                      <td style={{ padding: 10 }}>
                        <input
                          value={row.description}
                          onChange={(e) => updateManualRow(idx, { description: e.target.value })}
                          placeholder="Manual reimbursement description"
                          disabled={!draft.can_edit_manual}
                        />
                      </td>
                      <td style={{ padding: 10 }}>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={row.amount}
                          onChange={(e) => updateManualRow(idx, { amount: e.target.value })}
                          placeholder="0.00"
                          disabled={!draft.can_edit_manual}
                        />
                      </td>
                      <td style={{ padding: 10 }}>
                        <button className="btn btn-danger" onClick={() => removeManualRow(idx)} disabled={!draft.can_edit_manual}>Remove</button>
                      </td>
                    </tr>
                  ))}

                  {!draft.auto_items?.length && manualItems.length === 0 && (
                    <tr>
                      <td colSpan={4} style={{ padding: 14 }} className="muted">No reimbursement rows yet.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              <button className="btn" type="button" onClick={addManualRow} disabled={!draft.can_edit_manual}>+ Add Manual Item</button>
              <button className="btn" type="button" onClick={saveManualDraft} disabled={!draft.can_edit_manual}>Save Draft</button>
              {draft.can_submit && (draft.submit_due_today || (selectedReimbursementMeta && !selectedReimbursementMeta.is_current)) && (
                <button className="btn btn-primary" type="button" onClick={submitReimbursement} disabled={busy}>
                  {selectedReimbursementMeta && !selectedReimbursementMeta.is_current ? "Submit Late Reimbursement" : "Submit 2-Week Reimbursement"}
                </button>
              )}
              <span className="pill">Total: {fmtCurrency(totalAmount)}</span>
            </div>
          </>
        )}
      </div>

      {canApplyReimbursement && (
      <div className="card" style={{ marginBottom: 12 }}>
          <div style={{ fontWeight: 900, marginBottom: 8 }}>My Reimbursement Requests</div>
          <div style={{ width: "100%", overflowX: "auto" }}>
            <table className="table" style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: "#f8fafc" }}>
                  <th style={{ textAlign: "left", padding: 10 }}>Period</th>
                  <th style={{ textAlign: "left", padding: 10 }}>Total</th>
                  <th style={{ textAlign: "left", padding: 10 }}>Status</th>
                  <th style={{ textAlign: "left", padding: 10 }}>Comments</th>
                  <th style={{ textAlign: "left", padding: 10 }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredMyRequests.map((r) => (
                  <tr key={r.id} style={{ borderTop: "1px solid #eef2f7" }}>
                    <td style={{ padding: 10 }}>{r.period_start} to {r.period_end}</td>
                    <td style={{ padding: 10 }}>Approved subtotal: {fmtCurrency(r.total_amount)}</td>
                            <td style={{ padding: 10 }}>
                              <span className={`dashboard-status-badge ${statusPillClass(r.status)}`}>{statusLabel(r.status, !!r.is_late_submission, r.items?.length || 0)}</span>
                            </td>
                    <td style={{ padding: 10 }}>
                      {(() => {
                        const summary = reimbursementReviewSummary(r);
                        return (
                          <>
                            <div>Approved rows: {summary.approved}</div>
                            <div>Rejected rows: {summary.rejected}</div>
                            <div className="muted">Pending rows: {summary.pending}</div>
                          </>
                        );
                      })()}
                      {(r.ceo_comment || r.finance_comment) && (
                        <div style={{ marginTop: 4 }}>
                          {r.ceo_comment ? `CEO comment: ${r.ceo_comment}` : ""}{r.ceo_comment && r.finance_comment ? " | " : ""}{r.finance_comment ? `Finance comment: ${r.finance_comment}` : ""}
                        </div>
                      )}
                    </td>
                    <td style={{ padding: 10 }}>
                      {r.status === "pending_approval" && !r.ceo_decision && !r.finance_decision && (r.items || []).every((item) => String(item.review_status || "").toLowerCase() === "pending") ? (
                        <button className="btn" type="button" onClick={() => reopenMyReimbursementRequest(r)}>
                          Edit Submission
                        </button>
                      ) : (
                        <span className="muted">-</span>
                      )}
                    </td>
                  </tr>
                ))}
                {!filteredMyRequests.length && (
                  <tr><td colSpan={5} style={{ padding: 14 }} className="muted">No submissions yet.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

              {canReview && (
                <div className="card">
          <div style={{ fontWeight: 900, marginBottom: 8 }}>Pending Approvals (CEO / Finance)</div>
          <div className="muted" style={{ marginBottom: 10 }}>
            Approve or reject each reimbursement row individually. The request will move on automatically once all rows are resolved.
          </div>
          {!filteredPendingRequests.length ? (
            <div className="muted" style={{ padding: "10px 0 2px" }}>No pending reimbursement requests.</div>
          ) : (
            <div className="reimbursement-request-stack">
              {filteredPendingRequests.map((r) => {
                const summary = reimbursementReviewSummary(r);
                return (
                <section key={r.id} className="reimbursement-request-card reimbursement-request-card--pending">
                  <div className="reimbursement-request-card__accent" />
                  <div className="reimbursement-request-card__header">
                    <div>
                      <div className="reimbursement-request-card__title">{r.user?.name || `User #${r.user_id}`}</div>
                      <div className="muted">Reimbursement request #{r.id}</div>
                    </div>
                    <div className="reimbursement-request-card__meta">
                      <span className={`dashboard-status-badge ${statusPillClass(r.status)}`}>{statusLabel(r.status, !!r.is_late_submission, r.items?.length || 0)}</span>
                      <div className="reimbursement-request-card__meta-line">{r.period_start} to {r.period_end}</div>
                      <div className="reimbursement-request-card__meta-line">Approved subtotal: {fmtCurrency(r.total_amount)}</div>
                    </div>
                  </div>

                  <div className="reimbursement-request-card__body">
                    <div className="reimbursement-request-request-grid">
                      <div>
                        <div className="reimbursement-request-card__label">Item Review</div>
                        <div className="reimbursement-request-card__subtext">
                          Approved: <strong>{summary.approved}</strong> | Rejected: <strong>{summary.rejected}</strong> | Pending: <strong>{summary.pending}</strong>
                        </div>
                        <div className="muted" style={{ marginTop: 6 }}>
                          Final reimbursement amount is the sum of approved rows.
                        </div>
                      </div>
                      <div className="reimbursement-request-card__actions">
                        {canDownloadRecords && (
                          <button className="btn" type="button" onClick={() => downloadRecord("cash_reimbursement", r)}>Download Record</button>
                        )}
                      </div>
                    </div>

                    <div className="reimbursement-request-items">
                      <div className="reimbursement-request-items__header">Submitted Items</div>
                      <div className="reimbursement-request-items__state">
                        <span>Approved subtotal: <strong>{fmtCurrency(r.total_amount)}</strong></span>
                        <span className="muted">{summary.pending > 0 ? `${summary.pending} row(s) still pending review` : "All rows reviewed."}</span>
                      </div>
                      <div className="reimbursement-request-items__table-wrap">
                        <table className="table reimbursement-items-table" style={{ width: "100%", borderCollapse: "collapse" }}>
                          <thead>
                            <tr>
                              <th style={{ textAlign: "left", padding: 10 }}>Date</th>
                              <th style={{ textAlign: "left", padding: 10 }}>Description</th>
                              <th style={{ textAlign: "left", padding: 10 }}>Amount</th>
                              <th style={{ textAlign: "left", padding: 10 }}>Row Status</th>
                              <th style={{ textAlign: "left", padding: 10 }}>Row Review</th>
                            </tr>
                          </thead>
                          <tbody>
                            {(r.items || []).map((item) => {
                              const status = String(item.review_status || "").toLowerCase();
                              return (
                              <tr key={item.id}>
                                <td style={{ padding: 10 }}>{item.item_date}</td>
                                <td style={{ padding: 10 }}>{item.description}</td>
                                <td style={{ padding: 10 }}>{fmtCurrency(item.amount)}</td>
                                <td style={{ padding: 10 }}>
                                  <span className={`dashboard-status-badge ${status === "rejected" ? "dashboard-status-danger" : status === "approved" ? "dashboard-status-ok" : "dashboard-status-warn"}`}>
                                    {reimbursementItemStatusLabel(item.review_status)}
                                  </span>
                                </td>
                                <td style={{ padding: 10 }}>
                                  {item.review_comment ? (
                                    <div style={{ marginBottom: 6 }}>{item.review_comment}</div>
                                  ) : (
                                    <div className="muted" style={{ marginBottom: 6 }}>No row-specific comment.</div>
                                  )}
                                  {summary.pending > 0 ? (
                                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                                      {status === "approved" ? (
                                        <button className="btn btn-danger" type="button" onClick={() => takeItemDecision(r.id, item.id, false)}>
                                          Reject Row
                                        </button>
                                      ) : status === "rejected" ? (
                                        <button className="btn" type="button" onClick={() => takeItemDecision(r.id, item.id, true)}>
                                          Approve Row
                                        </button>
                                      ) : (
                                        <>
                                          <button className="btn btn-primary" type="button" onClick={() => takeItemDecision(r.id, item.id, true)}>
                                            Approve Row
                                          </button>
                                          <button className="btn btn-danger" type="button" onClick={() => takeItemDecision(r.id, item.id, false)}>
                                            Reject Row
                                          </button>
                                        </>
                                      )}
                                    </div>
                                  ) : (
                                    <div className="muted">Row review is locked after finalization.</div>
                                  )}
                                </td>
                              </tr>
                              );
                            })}
                            {!r.items?.length && (
                              <tr>
                                <td colSpan={5} style={{ padding: 10 }} className="muted">No submitted items.</td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                </section>
                );
              })}
            </div>
          )}
                </div>
              )}

              {canReview && (
                <div className="card" style={{ marginTop: 12 }}>
                  <div style={{ fontWeight: 900, marginBottom: 8 }}>Approved Reimbursements Record</div>
                  {!filteredApprovedRequests.length ? (
                    <div className="muted" style={{ padding: "10px 0 2px" }}>No approved reimbursements yet.</div>
                  ) : (
                    <div className="reimbursement-request-stack">
                      {filteredApprovedRequests.map((r) => (
                        <section key={`approved_${r.id}`} className="reimbursement-request-card reimbursement-request-card--approved">
                          <div className="reimbursement-request-card__accent" />
                          <div className="reimbursement-request-card__header">
                            <div>
                              <div className="reimbursement-request-card__title">{r.user?.name || `User #${r.user_id}`}</div>
                              <div className="muted">Reimbursement request #{r.id}</div>
                            </div>
                            <div className="reimbursement-request-card__meta">
                              <span className={`dashboard-status-badge ${statusPillClass(r.status)}`}>{statusLabel(r.status, !!r.is_late_submission, r.items?.length || 0)}</span>
                              <div className="reimbursement-request-card__meta-line">{r.period_start} to {r.period_end}</div>
                              <div className="reimbursement-request-card__meta-line">{fmtCurrency(r.total_amount)}</div>
                            </div>
                          </div>
                          <div className="reimbursement-request-card__body">
                            <div className="reimbursement-request-request-grid">
                              <div>
                                <div className="reimbursement-request-card__label">Payout</div>
                              <div className="reimbursement-request-card__subtext">
                                  {String(current?.role || "").toLowerCase() === "ceo" && r.status === "pending_reimbursement" ? (
                                    "Ready for final payout marking."
                                  ) : r.status === "amount_reimbursed" ? (
                                    `Paid on ${r.reimbursed_at ? new Date(r.reimbursed_at).toLocaleString() : "-"}`
                                  ) : (
                                    "Awaiting final payout."
                                  )}
                                </div>
                              </div>
                              <div className="reimbursement-request-card__actions">
                                {String(current?.role || "").toLowerCase() === "ceo" && r.status === "pending_reimbursement" ? (
                                  <button className="btn btn-primary" type="button" onClick={() => markReimbursed(r.id)}>
                                    Mark Reimbursed
                                  </button>
                                ) : null}
                                {canDownloadRecords && (
                                  <button className="btn" type="button" onClick={() => downloadRecord("cash_reimbursement", r)}>
                                    Download Record
                                  </button>
                                )}
                              </div>
                            </div>
                            <div className="reimbursement-request-items">
                              <div className="reimbursement-request-items__header">Submitted Items</div>
                              <div className="reimbursement-request-items__state">
                                <span>Approved subtotal: <strong>{fmtCurrency(r.total_amount)}</strong></span>
                                <span className="muted">{reimbursementReviewSummary(r).pending > 0 ? `${reimbursementReviewSummary(r).pending} row(s) still pending review` : "All rows reviewed."}</span>
                              </div>
                              <div className="reimbursement-request-items__table-wrap">
                                <table className="table reimbursement-items-table" style={{ width: "100%", borderCollapse: "collapse" }}>
                                  <thead>
                                    <tr>
                                      <th style={{ textAlign: "left", padding: 10 }}>Date</th>
                                      <th style={{ textAlign: "left", padding: 10 }}>Description</th>
                                      <th style={{ textAlign: "left", padding: 10 }}>Amount</th>
                                      <th style={{ textAlign: "left", padding: 10 }}>Row Status</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {(r.items || []).map((item) => (
                                      <tr key={item.id}>
                                        <td style={{ padding: 10 }}>{item.item_date}</td>
                                        <td style={{ padding: 10 }}>{item.description}</td>
                                        <td style={{ padding: 10 }}>{fmtCurrency(item.amount)}</td>
                                        <td style={{ padding: 10 }}>
                                          <span className={`dashboard-status-badge ${(item.review_status || "").toLowerCase() === "rejected" ? "dashboard-status-danger" : (item.review_status || "").toLowerCase() === "approved" ? "dashboard-status-ok" : "dashboard-status-warn"}`}>
                                            {reimbursementItemStatusLabel(item.review_status)}
                                          </span>
                                        </td>
                                      </tr>
                                    ))}
                                    {!r.items?.length && (
                                      <tr>
                                        <td colSpan={4} style={{ padding: 10 }} className="muted">No submitted items.</td>
                                      </tr>
                                    )}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          </div>
                        </section>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </>
          )}

      {activeSection === "cash_requisition" && (
        <>
          <div className="card" style={{ marginBottom: 12 }}>
            <div style={{ fontWeight: 900, marginBottom: 8 }}>Cash Requisition</div>
            <div className="muted" style={{ marginBottom: 10 }}>
              Workflow: Finance review {"->"} CEO/Admin approval {"->"} Disbursement.
            </div>
            <div className="row">
              <div className="field" style={{ flex: "1 1 180px" }}>
                <label>Amount</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={reqForm.amount}
                  onChange={(e) => setReqForm((f) => ({ ...f, amount: e.target.value }))}
                  placeholder="0.00"
                />
              </div>
              <div className="field" style={{ flex: "1 1 220px" }}>
                <label>Needed By (optional)</label>
                <input
                  type="date"
                  value={reqForm.needed_by}
                  onChange={(e) => setReqForm((f) => ({ ...f, needed_by: e.target.value }))}
                />
              </div>
            </div>
            <div className="field">
              <label>Purpose</label>
              <input
                value={reqForm.purpose}
                onChange={(e) => setReqForm((f) => ({ ...f, purpose: e.target.value }))}
                placeholder="What is this cash needed for?"
              />
            </div>
            <div className="field">
              <label>Details (optional)</label>
              <textarea
                value={reqForm.details}
                onChange={(e) => setReqForm((f) => ({ ...f, details: e.target.value }))}
                placeholder="Add context, expected usage, beneficiaries, etc."
              />
            </div>
            <button className="btn btn-primary" type="button" onClick={submitRequisition}>
              Submit Cash Requisition
            </button>
          </div>

          <div className="card" style={{ marginBottom: 12 }}>
            <div style={{ fontWeight: 900, marginBottom: 8 }}>My Cash Requisitions</div>
            <div style={{ width: "100%", overflowX: "auto" }}>
              <table className="table" style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ background: "#f8fafc" }}>
                    <th style={{ textAlign: "left", padding: 10 }}>Submitted</th>
                    <th style={{ textAlign: "left", padding: 10 }}>Purpose</th>
                    <th style={{ textAlign: "left", padding: 10 }}>Amount</th>
                    <th style={{ textAlign: "left", padding: 10 }}>Needed By</th>
                    <th style={{ textAlign: "left", padding: 10 }}>Status</th>
                    <th style={{ textAlign: "left", padding: 10 }}>Comments</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredMyRequisitions.map((r) => (
                    <tr key={`my_req_${r.id}`} style={{ borderTop: "1px solid #eef2f7" }}>
                      <td style={{ padding: 10 }}>{r.submitted_at ? new Date(r.submitted_at).toLocaleString() : "-"}</td>
                      <td style={{ padding: 10 }}>
                        <div style={{ fontWeight: 700 }}>{r.purpose}</div>
                        {r.details && <div className="muted" style={{ fontSize: 12 }}>{r.details}</div>}
                      </td>
                      <td style={{ padding: 10 }}>{fmtAmountSummary(r.amount, r.approved_amount)}</td>
                      <td style={{ padding: 10 }}>{r.needed_by || "-"}</td>
                      <td style={{ padding: 10 }}>
                        <span className={`dashboard-status-badge ${statusPillClass(r.status)}`}>{requisitionStatusLabel(r.status)}</span>
                      </td>
                      <td style={{ padding: 10 }}>
                        <div>Finance: {decisionLabel(r.finance_decision)}</div>
                        <div>CEO: {decisionLabel(r.ceo_decision)}</div>
                        {r.finance_comment && <div className="muted">Finance comment: {r.finance_comment}</div>}
                        {r.ceo_comment && <div className="muted">CEO comment: {r.ceo_comment}</div>}
                        {r.disbursed_note && <div className="muted">Disbursement note: {r.disbursed_note}</div>}
                      </td>
                    </tr>
                  ))}
                  {!filteredMyRequisitions.length && (
                    <tr><td colSpan={6} style={{ padding: 14 }} className="muted">No cash requisitions submitted yet.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {canReview && (
            <div className="card" style={{ marginBottom: 12 }}>
              <div style={{ fontWeight: 900, marginBottom: 8 }}>Pending Requisition Approvals</div>
              <div style={{ width: "100%", overflowX: "auto" }}>
                <table className="table" style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ background: "#f8fafc" }}>
                      <th style={{ textAlign: "left", padding: 10 }}>Requester</th>
                      <th style={{ textAlign: "left", padding: 10 }}>Purpose</th>
                      <th style={{ textAlign: "left", padding: 10 }}>Amount</th>
                      <th style={{ textAlign: "left", padding: 10 }}>Needed By</th>
                      <th style={{ textAlign: "left", padding: 10 }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredPendingRequisitions.map((r) => (
                      <tr key={`pending_req_${r.id}`} style={{ borderTop: "1px solid #eef2f7" }}>
                        <td style={{ padding: 10 }}>{r.user?.name || `User #${r.user_id}`}</td>
                        <td style={{ padding: 10 }}>
                          <div style={{ fontWeight: 700 }}>{r.purpose}</div>
                          {r.details && <div className="muted" style={{ fontSize: 12 }}>{r.details}</div>}
                        </td>
                        <td style={{ padding: 10 }}>{fmtAmountSummary(r.amount, r.approved_amount)}</td>
                        <td style={{ padding: 10 }}>{r.needed_by || "-"}</td>
                        <td style={{ padding: 10 }}>
                          {canCurrentRoleDecideRequisition(r) ? (
                            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                              <button className="btn btn-primary" onClick={() => takeRequisitionDecision(r.id, true)}>Approve</button>
                              <button className="btn btn-danger" onClick={() => takeRequisitionDecision(r.id, false)}>Reject</button>
                              {canDownloadRecords && (
                                <button className="btn" type="button" onClick={() => downloadRecord("cash_requisition", r)}>Download Record</button>
                              )}
                            </div>
                          ) : (
                            <span className="muted">Not actionable for your role.</span>
                          )}
                        </td>
                      </tr>
                    ))}
                    {!filteredPendingRequisitions.length && (
                      <tr><td colSpan={5} style={{ padding: 14 }} className="muted">No pending requisition approvals.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {canReview && (
            <div className="card">
              <div style={{ fontWeight: 900, marginBottom: 8 }}>Approved / Disbursed Requisitions</div>
              <div style={{ width: "100%", overflowX: "auto" }}>
                <table className="table" style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ background: "#f8fafc" }}>
                      <th style={{ textAlign: "left", padding: 10 }}>Requester</th>
                      <th style={{ textAlign: "left", padding: 10 }}>Purpose</th>
                      <th style={{ textAlign: "left", padding: 10 }}>Amount</th>
                      <th style={{ textAlign: "left", padding: 10 }}>Status</th>
                      <th style={{ textAlign: "left", padding: 10 }}>Disbursement</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredApprovedRequisitions.map((r) => (
                      <tr key={`approved_req_${r.id}`} style={{ borderTop: "1px solid #eef2f7" }}>
                        <td style={{ padding: 10 }}>{r.user?.name || `User #${r.user_id}`}</td>
                        <td style={{ padding: 10 }}>
                          <div style={{ fontWeight: 700 }}>{r.purpose}</div>
                          {r.details && <div className="muted" style={{ fontSize: 12 }}>{r.details}</div>}
                        </td>
                        <td style={{ padding: 10 }}>{fmtAmountSummary(r.amount, r.approved_amount)}</td>
                        <td style={{ padding: 10 }}>
                          <span className={`dashboard-status-badge ${statusPillClass(r.status)}`}>{requisitionStatusLabel(r.status)}</span>
                        </td>
                        <td style={{ padding: 10 }}>
                          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                            {(r.status || "").toLowerCase() === "pending_disbursement" ? (
                              <button className="btn btn-primary" type="button" onClick={() => markRequisitionDisbursed(r.id)}>
                                Mark Disbursed
                              </button>
                            ) : (r.status || "").toLowerCase() === "disbursed" ? (
                              <span className="muted">Disbursed on {r.disbursed_at ? new Date(r.disbursed_at).toLocaleString() : "-"}</span>
                            ) : (
                              <span className="muted">No disbursement action</span>
                            )}
                            {canDownloadRecords && (
                              <button className="btn" type="button" onClick={() => downloadRecord("cash_requisition", r)}>Download Record</button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                    {!filteredApprovedRequisitions.length && (
                      <tr><td colSpan={5} style={{ padding: 14 }} className="muted">No approved/disbursed requisitions.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
      {activeSection === "authority_to_incur" && (
        <>
          <div className="card" style={{ marginBottom: 12 }}>
            <div style={{ fontWeight: 900, marginBottom: 8 }}>Authority To Incur Expenditure</div>
            <div className="muted" style={{ marginBottom: 10 }}>
              Workflow: Finance review {"->"} CEO/Admin approval {"->"} Mark expenditure incurred.
            </div>
            <div className="row">
              <div className="field" style={{ flex: "1 1 180px" }}>
                <label>Amount</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={atiForm.amount}
                  onChange={(e) => setAtiForm((f) => ({ ...f, amount: e.target.value }))}
                  placeholder="0.00"
                />
              </div>
              <div className="field" style={{ flex: "1 1 220px" }}>
                <label>Needed By (optional)</label>
                <input
                  type="date"
                  value={atiForm.needed_by}
                  onChange={(e) => setAtiForm((f) => ({ ...f, needed_by: e.target.value }))}
                />
              </div>
            </div>
            <div className="field">
              <label>Title</label>
              <input
                value={atiForm.title}
                onChange={(e) => setAtiForm((f) => ({ ...f, title: e.target.value }))}
                placeholder="Expenditure title/purpose"
              />
            </div>
            <div className="field">
              <label>Vendor/Payee (optional)</label>
              <input
                value={atiForm.payee}
                onChange={(e) => setAtiForm((f) => ({ ...f, payee: e.target.value }))}
                placeholder="Supplier/vendor/payee name"
              />
            </div>
            <div className="field">
              <label>Details (optional)</label>
              <textarea
                value={atiForm.details}
                onChange={(e) => setAtiForm((f) => ({ ...f, details: e.target.value }))}
                placeholder="Scope, expected output, budget notes, etc."
              />
            </div>
            <button className="btn btn-primary" type="button" onClick={submitAuthorityToIncur}>
              Submit Authority Request
            </button>
          </div>

          <div className="card" style={{ marginBottom: 12 }}>
            <div style={{ fontWeight: 900, marginBottom: 8 }}>My Authority Requests</div>
            <div style={{ width: "100%", overflowX: "auto" }}>
              <table className="table" style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ background: "#f8fafc" }}>
                    <th style={{ textAlign: "left", padding: 10 }}>Submitted</th>
                    <th style={{ textAlign: "left", padding: 10 }}>Title</th>
                    <th style={{ textAlign: "left", padding: 10 }}>Amount</th>
                    <th style={{ textAlign: "left", padding: 10 }}>Needed By</th>
                    <th style={{ textAlign: "left", padding: 10 }}>Status</th>
                    <th style={{ textAlign: "left", padding: 10 }}>Comments</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredMyAtiRequests.map((r) => (
                    <tr key={`my_ati_${r.id}`} style={{ borderTop: "1px solid #eef2f7" }}>
                      <td style={{ padding: 10 }}>{r.submitted_at ? new Date(r.submitted_at).toLocaleString() : "-"}</td>
                      <td style={{ padding: 10 }}>
                        <div style={{ fontWeight: 700 }}>{r.title}</div>
                        {r.payee && <div className="muted" style={{ fontSize: 12 }}>Payee: {r.payee}</div>}
                        {r.details && <div className="muted" style={{ fontSize: 12 }}>{r.details}</div>}
                      </td>
                      <td style={{ padding: 10 }}>{fmtAmountSummary(r.amount, r.approved_amount)}</td>
                      <td style={{ padding: 10 }}>{r.needed_by || "-"}</td>
                      <td style={{ padding: 10 }}>
                        <span className={`dashboard-status-badge ${statusPillClass(r.status)}`}>{authorityStatusLabel(r.status)}</span>
                      </td>
                      <td style={{ padding: 10 }}>
                        <div>Finance: {decisionLabel(r.finance_decision)}</div>
                        <div>CEO: {decisionLabel(r.ceo_decision)}</div>
                        {r.finance_comment && <div className="muted">Finance comment: {r.finance_comment}</div>}
                        {r.ceo_comment && <div className="muted">CEO comment: {r.ceo_comment}</div>}
                        {r.incurred_note && <div className="muted">Incurrence note: {r.incurred_note}</div>}
                      </td>
                    </tr>
                  ))}
                  {!filteredMyAtiRequests.length && (
                    <tr><td colSpan={6} style={{ padding: 14 }} className="muted">No authority requests submitted yet.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {canReview && (
            <div className="card" style={{ marginBottom: 12 }}>
              <div style={{ fontWeight: 900, marginBottom: 8 }}>Pending Authority Approvals</div>
              <div style={{ width: "100%", overflowX: "auto" }}>
                <table className="table" style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ background: "#f8fafc" }}>
                      <th style={{ textAlign: "left", padding: 10 }}>Requester</th>
                      <th style={{ textAlign: "left", padding: 10 }}>Title</th>
                      <th style={{ textAlign: "left", padding: 10 }}>Amount</th>
                      <th style={{ textAlign: "left", padding: 10 }}>Needed By</th>
                      <th style={{ textAlign: "left", padding: 10 }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredPendingAtiRequests.map((r) => (
                      <tr key={`pending_ati_${r.id}`} style={{ borderTop: "1px solid #eef2f7" }}>
                        <td style={{ padding: 10 }}>{r.user?.name || `User #${r.user_id}`}</td>
                        <td style={{ padding: 10 }}>
                          <div style={{ fontWeight: 700 }}>{r.title}</div>
                          {r.payee && <div className="muted" style={{ fontSize: 12 }}>Payee: {r.payee}</div>}
                          {r.details && <div className="muted" style={{ fontSize: 12 }}>{r.details}</div>}
                        </td>
                        <td style={{ padding: 10 }}>{fmtAmountSummary(r.amount, r.approved_amount)}</td>
                        <td style={{ padding: 10 }}>{r.needed_by || "-"}</td>
                        <td style={{ padding: 10 }}>
                          {canCurrentRoleDecideAuthority(r) ? (
                            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                              <button className="btn btn-primary" onClick={() => takeAuthorityDecision(r.id, true)}>Approve</button>
                              <button className="btn btn-danger" onClick={() => takeAuthorityDecision(r.id, false)}>Reject</button>
                              {canDownloadRecords && (
                                <button className="btn" type="button" onClick={() => downloadRecord("authority_to_incur", r)}>Download Record</button>
                              )}
                            </div>
                          ) : (
                            <span className="muted">Not actionable for your role.</span>
                          )}
                        </td>
                      </tr>
                    ))}
                    {!filteredPendingAtiRequests.length && (
                      <tr><td colSpan={5} style={{ padding: 14 }} className="muted">No pending authority approvals.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {canReview && (
            <div className="card">
              <div style={{ fontWeight: 900, marginBottom: 8 }}>Approved / Incurred Authority Requests</div>
              <div style={{ width: "100%", overflowX: "auto" }}>
                <table className="table" style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ background: "#f8fafc" }}>
                      <th style={{ textAlign: "left", padding: 10 }}>Requester</th>
                      <th style={{ textAlign: "left", padding: 10 }}>Title</th>
                      <th style={{ textAlign: "left", padding: 10 }}>Amount</th>
                      <th style={{ textAlign: "left", padding: 10 }}>Status</th>
                      <th style={{ textAlign: "left", padding: 10 }}>Final Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredApprovedAtiRequests.map((r) => (
                      <tr key={`approved_ati_${r.id}`} style={{ borderTop: "1px solid #eef2f7" }}>
                        <td style={{ padding: 10 }}>{r.user?.name || `User #${r.user_id}`}</td>
                        <td style={{ padding: 10 }}>
                          <div style={{ fontWeight: 700 }}>{r.title}</div>
                          {r.payee && <div className="muted" style={{ fontSize: 12 }}>Payee: {r.payee}</div>}
                        </td>
                        <td style={{ padding: 10 }}>{fmtAmountSummary(r.amount, r.approved_amount)}</td>
                        <td style={{ padding: 10 }}>
                          <span className={`dashboard-status-badge ${statusPillClass(r.status)}`}>{authorityStatusLabel(r.status)}</span>
                        </td>
                        <td style={{ padding: 10 }}>
                          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                            {(r.status || "").toLowerCase() === "pending_incurrence" ? (
                              <button className="btn btn-primary" type="button" onClick={() => markAuthorityIncurred(r.id)}>
                                Mark Incurred
                              </button>
                            ) : (r.status || "").toLowerCase() === "incurred" ? (
                              <span className="muted">Incurred on {r.incurred_at ? new Date(r.incurred_at).toLocaleString() : "-"}</span>
                            ) : (
                              <span className="muted">No final action</span>
                            )}
                            {canDownloadRecords && (
                              <button className="btn" type="button" onClick={() => downloadRecord("authority_to_incur", r)}>Download Record</button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                    {!filteredApprovedAtiRequests.length && (
                      <tr><td colSpan={5} style={{ padding: 14 }} className="muted">No approved/incurred authority requests.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
      {activeSection === "salary_advance" && (
        <>
          <div className="card" style={{ marginBottom: 12 }}>
            <div style={{ fontWeight: 900, marginBottom: 8 }}>Salary Advance Request</div>
            <div className="muted" style={{ marginBottom: 10 }}>
              Workflow: Finance review {"->"} CEO/Admin approval {"->"} Payroll disbursement.
            </div>
            <div className="row">
              <div className="field" style={{ flex: "1 1 180px" }}>
                <label>Amount</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={saForm.amount}
                  onChange={(e) => setSaForm((f) => ({ ...f, amount: e.target.value }))}
                  placeholder="0.00"
                />
              </div>
              <div className="field" style={{ flex: "1 1 180px" }}>
                <label>Repayment Months</label>
                <input
                  type="number"
                  min="1"
                  max="24"
                  step="1"
                  value={saForm.repayment_months}
                  onChange={(e) => setSaForm((f) => ({ ...f, repayment_months: e.target.value }))}
                />
              </div>
            </div>
            <div className="field">
              <label>Reason</label>
              <input
                value={saForm.reason}
                onChange={(e) => setSaForm((f) => ({ ...f, reason: e.target.value }))}
                placeholder="Why do you need the salary advance?"
              />
            </div>
            <div className="field">
              <label>Details (optional)</label>
              <textarea
                value={saForm.details}
                onChange={(e) => setSaForm((f) => ({ ...f, details: e.target.value }))}
                placeholder="Additional details..."
              />
            </div>
            <button className="btn btn-primary" type="button" onClick={submitSalaryAdvance}>
              Submit Salary Advance
            </button>
          </div>

          <div className="card" style={{ marginBottom: 12 }}>
            <div style={{ fontWeight: 900, marginBottom: 8 }}>My Salary Advance Requests</div>
            <div style={{ width: "100%", overflowX: "auto" }}>
              <table className="table" style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ background: "#f8fafc" }}>
                    <th style={{ textAlign: "left", padding: 10 }}>Submitted</th>
                    <th style={{ textAlign: "left", padding: 10 }}>Reason</th>
                    <th style={{ textAlign: "left", padding: 10 }}>Amount</th>
                    <th style={{ textAlign: "left", padding: 10 }}>Repayment</th>
                    <th style={{ textAlign: "left", padding: 10 }}>Status</th>
                    <th style={{ textAlign: "left", padding: 10 }}>Comments</th>
                    <th style={{ textAlign: "left", padding: 10 }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredMySalaryAdvances.map((r) => {
                    const canWithdraw = ["pending_parallel_approval", "pending_ceo_approval", "pending_finance_review"].includes((r.status || "").toLowerCase());
                    return (
                      <tr key={`my_sa_${r.id}`} style={{ borderTop: "1px solid #eef2f7" }}>
                        <td style={{ padding: 10 }}>{r.submitted_at ? new Date(r.submitted_at).toLocaleString() : "-"}</td>
                        <td style={{ padding: 10 }}>
                          <div style={{ fontWeight: 700 }}>{r.reason}</div>
                          {r.details && <div className="muted" style={{ fontSize: 12 }}>{r.details}</div>}
                        </td>
                        <td style={{ padding: 10 }}>{fmtAmountSummary(r.amount, r.approved_amount)}</td>
                        <td style={{ padding: 10 }}>
                          {r.repayment_months} month(s)
                          {r.deduction_start_date ? `, start ${r.deduction_start_date}` : ""}
                        </td>
                        <td style={{ padding: 10 }}>
                          <span className={`dashboard-status-badge ${statusPillClass(r.status)}`}>{salaryAdvanceStatusLabel(r.status)}</span>
                        </td>
                        <td style={{ padding: 10 }}>
                          <div>Finance: {decisionLabel(r.finance_decision)}</div>
                          <div>CEO: {decisionLabel(r.ceo_decision)}</div>
                          {r.finance_comment && <div className="muted">Finance comment: {r.finance_comment}</div>}
                          {r.ceo_comment && <div className="muted">CEO comment: {r.ceo_comment}</div>}
                          {r.disbursed_note && <div className="muted">Disbursement note: {r.disbursed_note}</div>}
                        </td>
                        <td style={{ padding: 10 }}>
                          {canWithdraw && (
                            <button
                              className="btn btn-danger"
                              type="button"
                              onClick={async () => {
                                if (!window.confirm("Are you sure you want to withdraw this salary advance request? This action cannot be undone.")) return;
                                try {
                                  await withdrawSalaryAdvanceRequest(r.id);
                                  await loadData();
                                } catch (e) {
                                  alert("Failed to withdraw: " + (e.message || e));
                                }
                              }}
                            >
                              Withdraw
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                  {!filteredMySalaryAdvances.length && (
                    <tr><td colSpan={7} style={{ padding: 14 }} className="muted">No salary advance requests submitted yet.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {canReview && (
            <div className="card" style={{ marginBottom: 12 }}>
              <div style={{ fontWeight: 900, marginBottom: 8 }}>Pending Salary Advance Approvals</div>
              <div style={{ width: "100%", overflowX: "auto" }}>
                <table className="table" style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ background: "#f8fafc" }}>
                      <th style={{ textAlign: "left", padding: 10 }}>Requester</th>
                      <th style={{ textAlign: "left", padding: 10 }}>Reason</th>
                      <th style={{ textAlign: "left", padding: 10 }}>Amount</th>
                      <th style={{ textAlign: "left", padding: 10 }}>Repayment</th>
                      <th style={{ textAlign: "left", padding: 10 }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredPendingSalaryAdvances.map((r) => (
                      <tr key={`pending_sa_${r.id}`} style={{ borderTop: "1px solid #eef2f7" }}>
                        <td style={{ padding: 10 }}>{r.user?.name || `User #${r.user_id}`}</td>
                        <td style={{ padding: 10 }}>
                          <div style={{ fontWeight: 700 }}>{r.reason}</div>
                          {r.details && <div className="muted" style={{ fontSize: 12 }}>{r.details}</div>}
                        </td>
                        <td style={{ padding: 10 }}>{fmtAmountSummary(r.amount, r.approved_amount)}</td>
                        <td style={{ padding: 10 }}>
                          {r.repayment_months} month(s)
                          {r.deduction_start_date ? `, start ${r.deduction_start_date}` : ""}
                        </td>
                        <td style={{ padding: 10 }}>
                          {canCurrentRoleDecideSalaryAdvance(r) ? (
                            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                              <button className="btn btn-primary" onClick={() => takeSalaryAdvanceDecision(r.id, true, r.amount)}>Approve</button>
                              <button className="btn btn-danger" onClick={() => takeSalaryAdvanceDecision(r.id, false, r.amount)}>Reject</button>
                              {canDownloadRecords && (
                                <button className="btn" type="button" onClick={() => downloadRecord("salary_advance", r)}>Download Record</button>
                              )}
                            </div>
                          ) : (
                            <span className="muted">Not actionable for your role.</span>
                          )}
                        </td>
                      </tr>
                    ))}
                    {!filteredPendingSalaryAdvances.length && (
                      <tr><td colSpan={5} style={{ padding: 14 }} className="muted">No pending salary advance approvals.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {canReview && (
            <div className="card">
              <div style={{ fontWeight: 900, marginBottom: 8 }}>Approved / Disbursed Salary Advances</div>
              <div style={{ width: "100%", overflowX: "auto" }}>
                <table className="table" style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ background: "#f8fafc" }}>
                      <th style={{ textAlign: "left", padding: 10 }}>Requester</th>
                      <th style={{ textAlign: "left", padding: 10 }}>Reason</th>
                      <th style={{ textAlign: "left", padding: 10 }}>Amount</th>
                      <th style={{ textAlign: "left", padding: 10 }}>Status</th>
                      <th style={{ textAlign: "left", padding: 10 }}>Disbursement</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredApprovedSalaryAdvances.map((r) => (
                      <tr key={`approved_sa_${r.id}`} style={{ borderTop: "1px solid #eef2f7" }}>
                        <td style={{ padding: 10 }}>{r.user?.name || `User #${r.user_id}`}</td>
                        <td style={{ padding: 10 }}>
                          <div style={{ fontWeight: 700 }}>{r.reason}</div>
                          {r.details && <div className="muted" style={{ fontSize: 12 }}>{r.details}</div>}
                        </td>
                        <td style={{ padding: 10 }}>{fmtAmountSummary(r.amount, r.approved_amount)}</td>
                        <td style={{ padding: 10 }}>
                          <span className={`dashboard-status-badge ${statusPillClass(r.status)}`}>{salaryAdvanceStatusLabel(r.status)}</span>
                        </td>
                        <td style={{ padding: 10 }}>
                          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                            {(r.status || "").toLowerCase() === "pending_disbursement" ? (
                              <>
                                <button className="btn" type="button" onClick={() => setDeductionStartDate(r.id)}>
                                  {r.deduction_start_date ? "Update Deduction Start" : "Set Deduction Start"}
                                </button>
                                <button className="btn btn-primary" type="button" onClick={() => markSalaryAdvancePaid(r.id)}>
                                  Mark Disbursed
                                </button>
                              </>
                            ) : (r.status || "").toLowerCase() === "disbursed" ? (
                              <>
                                <button className="btn" type="button" onClick={() => setDeductionStartDate(r.id)}>
                                  {r.deduction_start_date ? "Update Deduction Start" : "Set Deduction Start"}
                                </button>
                                <span className="muted">Disbursed on {r.disbursed_at ? new Date(r.disbursed_at).toLocaleString() : "-"}</span>
                              </>
                            ) : (
                              <span className="muted">No disbursement action</span>
                            )}
                            {canDownloadRecords && (
                              <button className="btn" type="button" onClick={() => downloadRecord("salary_advance", r)}>Download Record</button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                    {!filteredApprovedSalaryAdvances.length && (
                      <tr><td colSpan={5} style={{ padding: 14 }} className="muted">No approved/disbursed salary advances.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
      {approvalDialog && (
        <div className="modal-overlay" role="presentation" onClick={() => setApprovalDialog(null)}>
          <div className="modal" role="dialog" aria-modal="true" aria-labelledby="finance-approval-dialog-title" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title" id="finance-approval-dialog-title">{approvalDialog.title}</h3>
              <button className="btn" type="button" onClick={() => setApprovalDialog(null)}>Close</button>
            </div>
            <div style={{ paddingTop: 12 }}>
              <div style={{ fontWeight: 700, marginBottom: 8 }}>
                Requested amount: {fmtCurrency(approvalDialog.requestedAmount)}
              </div>
              <div className="muted" style={{ marginBottom: 12 }}>
                Choose whether to approve the full amount or a reduced amount.
              </div>
              <div style={{ display: "grid", gap: 10 }}>
                <label style={{ display: "flex", gap: 10, alignItems: "flex-start", padding: 12, border: "1px solid #e5e7eb", borderRadius: 12, cursor: "pointer" }}>
                  <input
                    type="radio"
                    name="approval-mode"
                    checked={approvalDialog.mode === "full"}
                    onChange={() => setApprovalDialog((prev) => (prev ? { ...prev, mode: "full" } : prev))}
                    style={{ marginTop: 3 }}
                  />
                  <span>
                    <span style={{ fontWeight: 800 }}>Approve full amount</span>
                    <span className="muted" style={{ display: "block", marginTop: 4 }}>
                      Approve the full requested amount of {fmtCurrency(approvalDialog.requestedAmount)}.
                    </span>
                  </span>
                </label>
                <label style={{ display: "flex", gap: 10, alignItems: "flex-start", padding: 12, border: "1px solid #e5e7eb", borderRadius: 12, cursor: "pointer" }}>
                  <input
                    type="radio"
                    name="approval-mode"
                    checked={approvalDialog.mode === "partial"}
                    onChange={() => setApprovalDialog((prev) => (prev ? { ...prev, mode: "partial" } : prev))}
                    style={{ marginTop: 3 }}
                  />
                  <span>
                    <span style={{ fontWeight: 800 }}>Approve partial amount</span>
                    <span className="muted" style={{ display: "block", marginTop: 4 }}>
                      Enter the reduced amount you want to approve.
                    </span>
                  </span>
                </label>
                {approvalDialog.mode === "partial" && (
                  <div className="field" style={{ marginTop: 2 }}>
                    <label>Approved amount</label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={approvalDialog.partialAmount}
                      onChange={(e) => setApprovalDialog((prev) => (prev ? { ...prev, partialAmount: e.target.value } : prev))}
                      placeholder={String(approvalDialog.requestedAmount || "")}
                    />
                  </div>
                )}
              </div>
              <div className="modal-actions">
                <button className="btn" type="button" onClick={() => setApprovalDialog(null)}>Cancel</button>
                <button className="btn btn-primary" type="button" onClick={confirmAmountApprovalDialog}>
                  Approve
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
        </div>
      </div>
    </div>
  );
}
