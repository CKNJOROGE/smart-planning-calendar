import React, { useEffect, useMemo, useState } from "react";
import {
  me,
  getCashReimbursementDraft,
  submitCashReimbursement,
  listMyCashReimbursements,
  listPendingCashReimbursements,
  decideCashReimbursement,
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
  if (s === "approved") return "dashboard-status-ok";
  if (s === "rejected") return "dashboard-status-danger";
  return "dashboard-status-warn";
}

function emptyManual() {
  return { item_date: toDateInput(new Date()), description: "", amount: "" };
}

export default function FinanceRequestsPage() {
  const { showToast } = useToast();
  const [current, setCurrent] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const [draft, setDraft] = useState({ period_start: "", period_end: "", auto_items: [] });
  const [manualItems, setManualItems] = useState([emptyManual()]);
  const [myRequests, setMyRequests] = useState([]);
  const [pendingRequests, setPendingRequests] = useState([]);

  const canReview = useMemo(() => {
    const role = (current?.role || "").toLowerCase();
    return role === "finance" || role === "admin" || role === "ceo";
  }, [current?.role]);

  const totalAmount = useMemo(() => {
    const autoTotal = (draft.auto_items || []).reduce((acc, x) => acc + Number(x.amount || 0), 0);
    const manualTotal = (manualItems || []).reduce((acc, x) => acc + Number(x.amount || 0), 0);
    return autoTotal + manualTotal;
  }, [draft.auto_items, manualItems]);

  async function loadData() {
    setBusy(true);
    setErr("");
    try {
      const user = await me();
      setCurrent(user);
      const [draftData, mine] = await Promise.all([
        getCashReimbursementDraft(),
        listMyCashReimbursements(),
      ]);
      setDraft(draftData || { period_start: "", period_end: "", auto_items: [] });
      setMyRequests(mine || []);
      if (user.role === "finance" || user.role === "admin" || user.role === "ceo") {
        const pending = await listPendingCashReimbursements();
        setPendingRequests(pending || []);
      } else {
        setPendingRequests([]);
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
    setManualItems((prev) => [...prev, emptyManual()]);
  }

  function removeManualRow(idx) {
    setManualItems((prev) => (prev.length <= 1 ? prev : prev.filter((_, i) => i !== idx)));
  }

  function updateManualRow(idx, patch) {
    setManualItems((prev) => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  }

  async function submitReimbursement() {
    setErr("");
    const cleaned = (manualItems || [])
      .map((x) => ({
        item_date: x.item_date,
        description: (x.description || "").trim(),
        amount: Number(x.amount || 0),
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
      await submitCashReimbursement(cleaned);
      setManualItems([emptyManual()]);
      await loadData();
      showToast("Cash reimbursement submitted for approval", "success");
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

  return (
    <div className="page-wrap">
      <div className="card" style={{ marginBottom: 12 }}>
        <div style={{ fontWeight: 900, fontSize: 18 }}>Finance Requests</div>
        <div className="muted">Cash reimbursement is active. Other request types will follow in the next slices.</div>
      </div>

      {err && <div className="error">{err}</div>}

      <div className="card" style={{ marginBottom: 12 }}>
        <div style={{ fontWeight: 900, marginBottom: 8 }}>Cash Reimbursement (Current 2-Week Window)</div>
        <div className="muted" style={{ marginBottom: 10 }}>
          Period: {draft.period_start || "-"} to {draft.period_end || "-"}
        </div>

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
                    />
                  </td>
                  <td style={{ padding: 10 }}>
                    <input
                      value={row.description}
                      onChange={(e) => updateManualRow(idx, { description: e.target.value })}
                      placeholder="Manual reimbursement description"
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
                    />
                  </td>
                  <td style={{ padding: 10 }}>
                    <button className="btn btn-danger" onClick={() => removeManualRow(idx)}>Remove</button>
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
          <button className="btn" type="button" onClick={addManualRow}>+ Add Manual Item</button>
          <button className="btn btn-primary" type="button" onClick={submitReimbursement} disabled={busy}>
            Submit 2-Week Reimbursement
          </button>
          <span className="pill">Total: {fmtCurrency(totalAmount)}</span>
        </div>
      </div>

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
                  <td style={{ padding: 10 }}><span className={`dashboard-status-badge ${statusPillClass(r.status)}`}>{r.status}</span></td>
                  <td style={{ padding: 10 }}>
                    {r.ceo_comment ? `CEO: ${r.ceo_comment}` : "-"}{r.finance_comment ? ` | Finance: ${r.finance_comment}` : ""}
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
                  <tr key={r.id} style={{ borderTop: "1px solid #eef2f7" }}>
                    <td style={{ padding: 10 }}>{r.user?.name || `User #${r.user_id}`}</td>
                    <td style={{ padding: 10 }}>{r.period_start} to {r.period_end}</td>
                    <td style={{ padding: 10 }}>{fmtCurrency(r.total_amount)}</td>
                    <td style={{ padding: 10 }}>
                      <div style={{ display: "flex", gap: 8 }}>
                        <button className="btn btn-primary" onClick={() => takeDecision(r.id, true)}>Approve</button>
                        <button className="btn btn-danger" onClick={() => takeDecision(r.id, false)}>Reject</button>
                      </div>
                    </td>
                  </tr>
                ))}
                {!pendingRequests.length && (
                  <tr><td colSpan={4} style={{ padding: 14 }} className="muted">No pending reimbursement requests.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
