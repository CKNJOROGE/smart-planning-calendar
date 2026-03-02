import React, { useEffect, useMemo, useState } from "react";
import {
  me,
  listCashReimbursementPeriods,
  getCashReimbursementDraft,
  saveCashReimbursementDraft,
  submitCashReimbursement,
  listMyCashReimbursements,
  listPendingCashReimbursements,
  listApprovedCashReimbursements,
  decideCashReimbursement,
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
  listTaskClients,
  updateTaskClient,
} from "./api";
import { useToast } from "./ToastProvider";

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

function statusPillClass(status) {
  const s = (status || "").toLowerCase();
  if (s === "amount_reimbursed") return "dashboard-status-ok";
  if (s === "disbursed" || s === "incurred") return "dashboard-status-ok";
  if (s === "pending_reimbursement") return "dashboard-status-warn";
  if (s === "pending_approval") return "dashboard-status-warn";
  if (s === "pending_finance_review" || s === "pending_ceo_approval" || s === "pending_disbursement" || s === "pending_incurrence") return "dashboard-status-warn";
  if (s === "rejected") return "dashboard-status-danger";
  return "dashboard-status-warn";
}

function statusLabel(status, isLateSubmission = false) {
  const s = (status || "").toLowerCase();
  let label = status || "-";
  if (s === "pending_approval") label = "pending approval (awaiting approvals)";
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
  if (s === "pending_finance_review") return "pending finance review";
  if (s === "pending_ceo_approval") return "pending CEO approval";
  if (s === "pending_disbursement") return "approved, awaiting disbursement";
  if (s === "disbursed") return "disbursed";
  if (s === "rejected") return "rejected";
  return status || "-";
}

function authorityStatusLabel(status) {
  const s = (status || "").toLowerCase();
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
  const selectedReimbursementMeta = useMemo(
    () => (reimbursementPeriods || []).find((p) => reimbursementPeriodKey(p.period_start, p.period_end) === selectedReimbursementPeriod) || null,
    [reimbursementPeriods, selectedReimbursementPeriod]
  );

  const totalAmount = useMemo(() => {
    const autoTotal = (draft.auto_items || []).reduce((acc, x) => acc + Number(x.amount || 0), 0);
    const manualTotal = (manualItems || []).reduce((acc, x) => acc + Number(x.amount || 0), 0);
    return autoTotal + manualTotal;
  }, [draft.auto_items, manualItems]);

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
      const fallbackKey = currentKey || (periodRows[0] ? reimbursementPeriodKey(periodRows[0].period_start, periodRows[0].period_end) : "");
      const effectivePeriodKey = periodKeys.has(selectedReimbursementPeriod) ? selectedReimbursementPeriod : fallbackKey;
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
      await submitCashReimbursement(cleaned, periodStart, periodEnd);
      setManualItems([emptyManual()]);
      await loadData();
      showToast("Cash reimbursement submitted for approval", "success");
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
    if (role === "finance") return (r.status || "").toLowerCase() === "pending_finance_review";
    if (role === "admin" || role === "ceo") return (r.status || "").toLowerCase() === "pending_ceo_approval";
    return false;
  }

  function canCurrentRoleDecideSalaryAdvance(r) {
    const role = (current?.role || "").toLowerCase();
    if (role === "finance") return (r.status || "").toLowerCase() === "pending_finance_review";
    if (role === "admin" || role === "ceo") return (r.status || "").toLowerCase() === "pending_ceo_approval";
    return false;
  }

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
  const totalAttentionCount = useMemo(
    () => Object.values(attentionCounts).reduce((sum, n) => sum + Number(n || 0), 0),
    [attentionCounts]
  );

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

  async function takeSalaryAdvanceDecision(requestId, approve) {
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
    <div className="page-wrap">
      <div className="card" style={{ marginBottom: 12 }}>
        <div style={{ fontWeight: 900, fontSize: 18 }}>Finance Requests</div>
        <div className="muted">Use the request menu to navigate between finance modules.</div>
      </div>

      {err && <div className="error">{err}</div>}

      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "flex-start" }}>
        <div className="card" style={{ flex: "1 1 220px", minWidth: 220 }}>
          <div style={{ fontWeight: 800, marginBottom: 8 }}>Request Types</div>
          <div style={{ display: "grid", gap: 8 }}>
            <button className={`btn ${activeSection === "cash_reimbursement" ? "btn-primary" : ""}`} type="button" onClick={() => setActiveSection("cash_reimbursement")}>
              Cash Reimbursement{attentionCounts.cash_reimbursement > 0 ? ` (${attentionCounts.cash_reimbursement})` : ""}
            </button>
            <button className={`btn ${activeSection === "cash_requisition" ? "btn-primary" : ""}`} type="button" onClick={() => setActiveSection("cash_requisition")}>
              Cash Requisition{attentionCounts.cash_requisition > 0 ? ` (${attentionCounts.cash_requisition})` : ""}
            </button>
            <button className={`btn ${activeSection === "authority_to_incur" ? "btn-primary" : ""}`} type="button" onClick={() => setActiveSection("authority_to_incur")}>
              Authority To Incur Expenditure{attentionCounts.authority_to_incur > 0 ? ` (${attentionCounts.authority_to_incur})` : ""}
            </button>
            <button className={`btn ${activeSection === "salary_advance" ? "btn-primary" : ""}`} type="button" onClick={() => setActiveSection("salary_advance")}>
              Salary Advance Request{attentionCounts.salary_advance > 0 ? ` (${attentionCounts.salary_advance})` : ""}
            </button>
          </div>
        </div>

        <div style={{ flex: "999 1 520px", minWidth: 0 }}>
      {canReview && (
        <div className="card" style={{ marginBottom: 12 }}>
          <div style={{ fontWeight: 900, marginBottom: 8 }}>Needs Attention</div>
          {totalAttentionCount > 0 ? (
            <>
              <div className="muted" style={{ marginBottom: 8 }}>
                You have {totalAttentionCount} finance request(s) awaiting your action.
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {attentionCounts.cash_reimbursement > 0 && (
                  <span className="pill">Cash Reimbursement: {attentionCounts.cash_reimbursement}</span>
                )}
                {attentionCounts.cash_requisition > 0 && (
                  <span className="pill">Cash Requisition: {attentionCounts.cash_requisition}</span>
                )}
                {attentionCounts.authority_to_incur > 0 && (
                  <span className="pill">Authority To Incur: {attentionCounts.authority_to_incur}</span>
                )}
                {attentionCounts.salary_advance > 0 && (
                  <span className="pill">Salary Advance: {attentionCounts.salary_advance}</span>
                )}
              </div>
            </>
          ) : (
            <div className="muted">No finance requests need your action right now.</div>
          )}
        </div>
      )}

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
                  if (p.has_submission) statusBits.push(`Submitted: ${statusLabel(p.submission_status, p.is_late_submission)}`);
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
                Submission status: {statusLabel(selectedReimbursementMeta.submission_status, selectedReimbursementMeta.is_late_submission)}
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
              {draft.can_submit && (
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
                </tr>
              </thead>
              <tbody>
                {(myRequests || []).map((r) => (
                  <tr key={r.id} style={{ borderTop: "1px solid #eef2f7" }}>
                    <td style={{ padding: 10 }}>{r.period_start} to {r.period_end}</td>
                    <td style={{ padding: 10 }}>{fmtCurrency(r.total_amount)}</td>
                            <td style={{ padding: 10 }}>
                              <span className={`dashboard-status-badge ${statusPillClass(r.status)}`}>{statusLabel(r.status, !!r.is_late_submission)}</span>
                            </td>
                    <td style={{ padding: 10 }}>
                      <div>CEO: {decisionLabel(r.ceo_decision)}</div>
                      <div>Finance: {decisionLabel(r.finance_decision)}</div>
                      {remainingApprovers(r).length > 0 ? (
                        <div className="muted">Remaining: {remainingApprovers(r).join(", ")}</div>
                      ) : (
                        <div className="muted">All approvals completed.</div>
                      )}
                      {(r.ceo_comment || r.finance_comment) && (
                        <div style={{ marginTop: 4 }}>
                          {r.ceo_comment ? `CEO comment: ${r.ceo_comment}` : ""}{r.ceo_comment && r.finance_comment ? " | " : ""}{r.finance_comment ? `Finance comment: ${r.finance_comment}` : ""}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
                {!myRequests.length && (
                  <tr><td colSpan={4} style={{ padding: 14 }} className="muted">No submissions yet.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

              {canReview && (
                <div className="card">
          <div style={{ fontWeight: 900, marginBottom: 8 }}>Pending Approvals (CEO / Finance)</div>
          <div style={{ width: "100%", overflowX: "auto" }}>
            <table className="table" style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: "#f8fafc" }}>
                  <th style={{ textAlign: "left", padding: 10 }}>Requester</th>
                  <th style={{ textAlign: "left", padding: 10 }}>Period</th>
                  <th style={{ textAlign: "left", padding: 10 }}>Total</th>
                  <th style={{ textAlign: "left", padding: 10 }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {(pendingRequests || []).map((r) => (
                  <React.Fragment key={r.id}>
                    <tr style={{ borderTop: "1px solid #eef2f7" }}>
                      <td style={{ padding: 10 }}>{r.user?.name || `User #${r.user_id}`}</td>
                      <td style={{ padding: 10 }}>{r.period_start} to {r.period_end}</td>
                      <td style={{ padding: 10 }}>{fmtCurrency(r.total_amount)}</td>
                      <td style={{ padding: 10 }}>
                        {((reviewerSlot === "ceo" && !r.ceo_decision) || (reviewerSlot === "finance" && !r.finance_decision)) ? (
                          <div style={{ display: "flex", gap: 8 }}>
                            <button className="btn btn-primary" onClick={() => takeDecision(r.id, true)}>Approve</button>
                            <button className="btn btn-danger" onClick={() => takeDecision(r.id, false)}>Reject</button>
                          </div>
                        ) : (
                          <span className="muted">
                            {reviewerSlot === "ceo" ? `CEO already ${decisionLabel(r.ceo_decision).toLowerCase()}.` : ""}
                            {reviewerSlot === "finance" ? `Finance already ${decisionLabel(r.finance_decision).toLowerCase()}.` : ""}
                          </span>
                        )}
                      </td>
                    </tr>
                    <tr>
                      <td colSpan={4} style={{ padding: "0 10px 10px 10px" }}>
                        <div style={{ border: "1px solid #eef2f7", borderRadius: 8, overflow: "hidden" }}>
                          <div style={{ padding: 10, background: "#f8fafc", fontWeight: 700 }}>
                            Submitted Items
                          </div>
                          <div style={{ padding: "6px 10px", borderTop: "1px solid #eef2f7", borderBottom: "1px solid #eef2f7", background: "#fcfcfd" }}>
                            <span style={{ marginRight: 12 }}>CEO: <strong>{decisionLabel(r.ceo_decision)}</strong></span>
                            <span style={{ marginRight: 12 }}>Finance: <strong>{decisionLabel(r.finance_decision)}</strong></span>
                            {remainingApprovers(r).length > 0 ? (
                              <span className="muted">Remaining: {remainingApprovers(r).join(", ")}</span>
                            ) : (
                              <span className="muted">All approvals completed.</span>
                            )}
                          </div>
                          <table className="table" style={{ width: "100%", borderCollapse: "collapse" }}>
                            <thead>
                              <tr style={{ background: "#ffffff" }}>
                                <th style={{ textAlign: "left", padding: 10 }}>Date</th>
                                <th style={{ textAlign: "left", padding: 10 }}>Description</th>
                                <th style={{ textAlign: "left", padding: 10 }}>Amount</th>
                              </tr>
                            </thead>
                            <tbody>
                              {(r.items || []).map((item) => (
                                <tr key={item.id} style={{ borderTop: "1px solid #eef2f7" }}>
                                  <td style={{ padding: 10 }}>{item.item_date}</td>
                                  <td style={{ padding: 10 }}>{item.description}</td>
                                  <td style={{ padding: 10 }}>{fmtCurrency(item.amount)}</td>
                                </tr>
                              ))}
                              {!r.items?.length && (
                                <tr>
                                  <td colSpan={3} style={{ padding: 10 }} className="muted">No submitted items.</td>
                                </tr>
                              )}
                            </tbody>
                          </table>
                        </div>
                      </td>
                    </tr>
                  </React.Fragment>
                ))}
                {!pendingRequests.length && (
                  <tr><td colSpan={4} style={{ padding: 14 }} className="muted">No pending reimbursement requests.</td></tr>
                )}
              </tbody>
            </table>
          </div>
                </div>
              )}

              {canReview && (
                <div className="card" style={{ marginTop: 12 }}>
                  <div style={{ fontWeight: 900, marginBottom: 8 }}>Approved Reimbursements Record</div>
                  <div style={{ width: "100%", overflowX: "auto" }}>
                    <table className="table" style={{ width: "100%", borderCollapse: "collapse" }}>
                      <thead>
                        <tr style={{ background: "#f8fafc" }}>
                          <th style={{ textAlign: "left", padding: 10 }}>Requested by</th>
                          <th style={{ textAlign: "left", padding: 10 }}>Period</th>
                          <th style={{ textAlign: "left", padding: 10 }}>Total</th>
                          <th style={{ textAlign: "left", padding: 10 }}>Status</th>
                          <th style={{ textAlign: "left", padding: 10 }}>Payout</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(approvedRequests || []).map((r) => (
                          <tr key={`approved_${r.id}`} style={{ borderTop: "1px solid #eef2f7" }}>
                            <td style={{ padding: 10 }}>{r.user?.name || `User #${r.user_id}`}</td>
                            <td style={{ padding: 10 }}>{r.period_start} to {r.period_end}</td>
                            <td style={{ padding: 10 }}>{fmtCurrency(r.total_amount)}</td>
                            <td style={{ padding: 10 }}>
                              <span className={`dashboard-status-badge ${statusPillClass(r.status)}`}>{statusLabel(r.status, !!r.is_late_submission)}</span>
                            </td>
                            <td style={{ padding: 10 }}>
                              {String(current?.role || "").toLowerCase() === "ceo" && r.status === "pending_reimbursement" ? (
                                <button className="btn btn-primary" type="button" onClick={() => markReimbursed(r.id)}>
                                  Mark Reimbursed
                                </button>
                              ) : r.status === "amount_reimbursed" ? (
                                <span className="muted">Paid on {r.reimbursed_at ? new Date(r.reimbursed_at).toLocaleString() : "-"}</span>
                              ) : (
                                <span className="muted">Pending CEO reimbursement</span>
                              )}
                            </td>
                          </tr>
                        ))}
                        {!approvedRequests.length && (
                          <tr><td colSpan={5} style={{ padding: 14 }} className="muted">No approved reimbursements yet.</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
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
                  {(myRequisitions || []).map((r) => (
                    <tr key={`my_req_${r.id}`} style={{ borderTop: "1px solid #eef2f7" }}>
                      <td style={{ padding: 10 }}>{r.submitted_at ? new Date(r.submitted_at).toLocaleString() : "-"}</td>
                      <td style={{ padding: 10 }}>
                        <div style={{ fontWeight: 700 }}>{r.purpose}</div>
                        {r.details && <div className="muted" style={{ fontSize: 12 }}>{r.details}</div>}
                      </td>
                      <td style={{ padding: 10 }}>{fmtCurrency(r.amount)}</td>
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
                  {!myRequisitions.length && (
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
                    {(pendingRequisitions || []).map((r) => (
                      <tr key={`pending_req_${r.id}`} style={{ borderTop: "1px solid #eef2f7" }}>
                        <td style={{ padding: 10 }}>{r.user?.name || `User #${r.user_id}`}</td>
                        <td style={{ padding: 10 }}>
                          <div style={{ fontWeight: 700 }}>{r.purpose}</div>
                          {r.details && <div className="muted" style={{ fontSize: 12 }}>{r.details}</div>}
                        </td>
                        <td style={{ padding: 10 }}>{fmtCurrency(r.amount)}</td>
                        <td style={{ padding: 10 }}>{r.needed_by || "-"}</td>
                        <td style={{ padding: 10 }}>
                          {canCurrentRoleDecideRequisition(r) ? (
                            <div style={{ display: "flex", gap: 8 }}>
                              <button className="btn btn-primary" onClick={() => takeRequisitionDecision(r.id, true)}>Approve</button>
                              <button className="btn btn-danger" onClick={() => takeRequisitionDecision(r.id, false)}>Reject</button>
                            </div>
                          ) : (
                            <span className="muted">Not actionable for your role.</span>
                          )}
                        </td>
                      </tr>
                    ))}
                    {!pendingRequisitions.length && (
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
                    {(approvedRequisitions || []).map((r) => (
                      <tr key={`approved_req_${r.id}`} style={{ borderTop: "1px solid #eef2f7" }}>
                        <td style={{ padding: 10 }}>{r.user?.name || `User #${r.user_id}`}</td>
                        <td style={{ padding: 10 }}>
                          <div style={{ fontWeight: 700 }}>{r.purpose}</div>
                          {r.details && <div className="muted" style={{ fontSize: 12 }}>{r.details}</div>}
                        </td>
                        <td style={{ padding: 10 }}>{fmtCurrency(r.amount)}</td>
                        <td style={{ padding: 10 }}>
                          <span className={`dashboard-status-badge ${statusPillClass(r.status)}`}>{requisitionStatusLabel(r.status)}</span>
                        </td>
                        <td style={{ padding: 10 }}>
                          {(r.status || "").toLowerCase() === "pending_disbursement" ? (
                            <button className="btn btn-primary" type="button" onClick={() => markRequisitionDisbursed(r.id)}>
                              Mark Disbursed
                            </button>
                          ) : (r.status || "").toLowerCase() === "disbursed" ? (
                            <span className="muted">Disbursed on {r.disbursed_at ? new Date(r.disbursed_at).toLocaleString() : "-"}</span>
                          ) : (
                            <span className="muted">No disbursement action</span>
                          )}
                        </td>
                      </tr>
                    ))}
                    {!approvedRequisitions.length && (
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
                  {(myAtiRequests || []).map((r) => (
                    <tr key={`my_ati_${r.id}`} style={{ borderTop: "1px solid #eef2f7" }}>
                      <td style={{ padding: 10 }}>{r.submitted_at ? new Date(r.submitted_at).toLocaleString() : "-"}</td>
                      <td style={{ padding: 10 }}>
                        <div style={{ fontWeight: 700 }}>{r.title}</div>
                        {r.payee && <div className="muted" style={{ fontSize: 12 }}>Payee: {r.payee}</div>}
                        {r.details && <div className="muted" style={{ fontSize: 12 }}>{r.details}</div>}
                      </td>
                      <td style={{ padding: 10 }}>{fmtCurrency(r.amount)}</td>
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
                  {!myAtiRequests.length && (
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
                    {(pendingAtiRequests || []).map((r) => (
                      <tr key={`pending_ati_${r.id}`} style={{ borderTop: "1px solid #eef2f7" }}>
                        <td style={{ padding: 10 }}>{r.user?.name || `User #${r.user_id}`}</td>
                        <td style={{ padding: 10 }}>
                          <div style={{ fontWeight: 700 }}>{r.title}</div>
                          {r.payee && <div className="muted" style={{ fontSize: 12 }}>Payee: {r.payee}</div>}
                          {r.details && <div className="muted" style={{ fontSize: 12 }}>{r.details}</div>}
                        </td>
                        <td style={{ padding: 10 }}>{fmtCurrency(r.amount)}</td>
                        <td style={{ padding: 10 }}>{r.needed_by || "-"}</td>
                        <td style={{ padding: 10 }}>
                          {canCurrentRoleDecideAuthority(r) ? (
                            <div style={{ display: "flex", gap: 8 }}>
                              <button className="btn btn-primary" onClick={() => takeAuthorityDecision(r.id, true)}>Approve</button>
                              <button className="btn btn-danger" onClick={() => takeAuthorityDecision(r.id, false)}>Reject</button>
                            </div>
                          ) : (
                            <span className="muted">Not actionable for your role.</span>
                          )}
                        </td>
                      </tr>
                    ))}
                    {!pendingAtiRequests.length && (
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
                    {(approvedAtiRequests || []).map((r) => (
                      <tr key={`approved_ati_${r.id}`} style={{ borderTop: "1px solid #eef2f7" }}>
                        <td style={{ padding: 10 }}>{r.user?.name || `User #${r.user_id}`}</td>
                        <td style={{ padding: 10 }}>
                          <div style={{ fontWeight: 700 }}>{r.title}</div>
                          {r.payee && <div className="muted" style={{ fontSize: 12 }}>Payee: {r.payee}</div>}
                        </td>
                        <td style={{ padding: 10 }}>{fmtCurrency(r.amount)}</td>
                        <td style={{ padding: 10 }}>
                          <span className={`dashboard-status-badge ${statusPillClass(r.status)}`}>{authorityStatusLabel(r.status)}</span>
                        </td>
                        <td style={{ padding: 10 }}>
                          {(r.status || "").toLowerCase() === "pending_incurrence" ? (
                            <button className="btn btn-primary" type="button" onClick={() => markAuthorityIncurred(r.id)}>
                              Mark Incurred
                            </button>
                          ) : (r.status || "").toLowerCase() === "incurred" ? (
                            <span className="muted">Incurred on {r.incurred_at ? new Date(r.incurred_at).toLocaleString() : "-"}</span>
                          ) : (
                            <span className="muted">No final action</span>
                          )}
                        </td>
                      </tr>
                    ))}
                    {!approvedAtiRequests.length && (
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
                  </tr>
                </thead>
                <tbody>
                  {(mySalaryAdvances || []).map((r) => (
                    <tr key={`my_sa_${r.id}`} style={{ borderTop: "1px solid #eef2f7" }}>
                      <td style={{ padding: 10 }}>{r.submitted_at ? new Date(r.submitted_at).toLocaleString() : "-"}</td>
                      <td style={{ padding: 10 }}>
                        <div style={{ fontWeight: 700 }}>{r.reason}</div>
                        {r.details && <div className="muted" style={{ fontSize: 12 }}>{r.details}</div>}
                      </td>
                      <td style={{ padding: 10 }}>{fmtCurrency(r.amount)}</td>
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
                    </tr>
                  ))}
                  {!mySalaryAdvances.length && (
                    <tr><td colSpan={6} style={{ padding: 14 }} className="muted">No salary advance requests submitted yet.</td></tr>
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
                    {(pendingSalaryAdvances || []).map((r) => (
                      <tr key={`pending_sa_${r.id}`} style={{ borderTop: "1px solid #eef2f7" }}>
                        <td style={{ padding: 10 }}>{r.user?.name || `User #${r.user_id}`}</td>
                        <td style={{ padding: 10 }}>
                          <div style={{ fontWeight: 700 }}>{r.reason}</div>
                          {r.details && <div className="muted" style={{ fontSize: 12 }}>{r.details}</div>}
                        </td>
                        <td style={{ padding: 10 }}>{fmtCurrency(r.amount)}</td>
                        <td style={{ padding: 10 }}>
                          {r.repayment_months} month(s)
                          {r.deduction_start_date ? `, start ${r.deduction_start_date}` : ""}
                        </td>
                        <td style={{ padding: 10 }}>
                          {canCurrentRoleDecideSalaryAdvance(r) ? (
                            <div style={{ display: "flex", gap: 8 }}>
                              <button className="btn btn-primary" onClick={() => takeSalaryAdvanceDecision(r.id, true)}>Approve</button>
                              <button className="btn btn-danger" onClick={() => takeSalaryAdvanceDecision(r.id, false)}>Reject</button>
                            </div>
                          ) : (
                            <span className="muted">Not actionable for your role.</span>
                          )}
                        </td>
                      </tr>
                    ))}
                    {!pendingSalaryAdvances.length && (
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
                    {(approvedSalaryAdvances || []).map((r) => (
                      <tr key={`approved_sa_${r.id}`} style={{ borderTop: "1px solid #eef2f7" }}>
                        <td style={{ padding: 10 }}>{r.user?.name || `User #${r.user_id}`}</td>
                        <td style={{ padding: 10 }}>
                          <div style={{ fontWeight: 700 }}>{r.reason}</div>
                          {r.details && <div className="muted" style={{ fontSize: 12 }}>{r.details}</div>}
                        </td>
                        <td style={{ padding: 10 }}>{fmtCurrency(r.amount)}</td>
                        <td style={{ padding: 10 }}>
                          <span className={`dashboard-status-badge ${statusPillClass(r.status)}`}>{salaryAdvanceStatusLabel(r.status)}</span>
                        </td>
                        <td style={{ padding: 10 }}>
                          {(r.status || "").toLowerCase() === "pending_disbursement" ? (
                            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                              <button className="btn" type="button" onClick={() => setDeductionStartDate(r.id)}>
                                {r.deduction_start_date ? "Update Deduction Start" : "Set Deduction Start"}
                              </button>
                              <button className="btn btn-primary" type="button" onClick={() => markSalaryAdvancePaid(r.id)}>
                                Mark Disbursed
                              </button>
                            </div>
                          ) : (r.status || "").toLowerCase() === "disbursed" ? (
                            <span className="muted">Disbursed on {r.disbursed_at ? new Date(r.disbursed_at).toLocaleString() : "-"}</span>
                          ) : (
                            <span className="muted">No disbursement action</span>
                          )}
                        </td>
                      </tr>
                    ))}
                    {!approvedSalaryAdvances.length && (
                      <tr><td colSpan={5} style={{ padding: 14 }} className="muted">No approved/disbursed salary advances.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
        </div>
      </div>
    </div>
  );
}
