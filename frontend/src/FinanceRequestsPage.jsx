import React, { useEffect, useMemo, useState } from "react";
import {
  me,
  getCashReimbursementDraft,
  saveCashReimbursementDraft,
  submitCashReimbursement,
  listMyCashReimbursements,
  listPendingCashReimbursements,
  decideCashReimbursement,
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
  if (s === "approved") return "dashboard-status-ok";
  if (s === "rejected") return "dashboard-status-danger";
  return "dashboard-status-warn";
}

function decisionLabel(decision) {
  const d = (decision || "").toLowerCase();
  if (d === "approved") return "Approved";
  if (d === "rejected") return "Rejected";
  return "Pending";
}

function emptyManual() {
  return { item_date: toDateInput(new Date()), description: "", amount: "" };
}

export default function FinanceRequestsPage() {
  const { showToast } = useToast();
  const [current, setCurrent] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const [draft, setDraft] = useState({ period_start: "", period_end: "", auto_items: [], can_edit_manual: true });
  const [manualItems, setManualItems] = useState([emptyManual()]);
  const [myRequests, setMyRequests] = useState([]);
  const [pendingRequests, setPendingRequests] = useState([]);
  const [clientPricing, setClientPricing] = useState([]);
  const [pricingSaving, setPricingSaving] = useState({});
  const [showClientPricing, setShowClientPricing] = useState(false);
  const [activeSection, setActiveSection] = useState("cash_reimbursement");

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
      setDraft(draftData || { period_start: "", period_end: "", auto_items: [], can_edit_manual: true });
      const savedManualRows = (draftData?.manual_items || []).map((x) => ({
        item_date: x.item_date ? toDateInput(x.item_date) : "",
        description: String(x.description || ""),
        amount: x.amount == null ? "" : String(x.amount),
      }));
      setManualItems(savedManualRows.length ? savedManualRows : [emptyManual()]);
      setMyRequests(mine || []);
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

  async function saveManualDraft() {
    setErr("");
    if (!draft.can_edit_manual) return;
    const payload = (manualItems || []).map((x) => {
      const amount = String(x.amount || "").trim();
      return {
        item_date: x.item_date || null,
        description: (x.description || "").trim(),
        amount: amount === "" ? null : Number(amount),
      };
    });
    if (payload.some((x) => x.amount != null && Number.isNaN(x.amount))) {
      setErr("Manual reimbursement amount must be a valid number.");
      return;
    }
    try {
      const saved = await saveCashReimbursementDraft(payload);
      const savedManualRows = (saved?.manual_items || []).map((x) => ({
        item_date: x.item_date ? toDateInput(x.item_date) : "",
        description: String(x.description || ""),
        amount: x.amount == null ? "" : String(x.amount),
      }));
      setDraft(saved || draft);
      setManualItems(savedManualRows.length ? savedManualRows : [emptyManual()]);
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

  function remainingApprovers(r) {
    const remaining = [];
    if (!r?.ceo_decision) remaining.push("CEO");
    if (!r?.finance_decision) remaining.push("Finance");
    return remaining;
  }

  async function saveClientPrice(row) {
    const amount = Number(row.reimbursement_amount || 0);
    if (Number.isNaN(amount) || amount < 0) {
      setErr("Client reimbursement amount must be a number >= 0.");
      return;
    }
    setPricingSaving((prev) => ({ ...prev, [row.id]: true }));
    try {
      await updateTaskClient(row.id, amount);
      await loadData();
      showToast("Client visit reimbursement amount saved", "success");
    } catch (e) {
      const msg = String(e.message || e);
      setErr(msg);
      showToast(msg, "error");
    } finally {
      setPricingSaving((prev) => ({ ...prev, [row.id]: false }));
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
              Cash Reimbursement
            </button>
            <button className={`btn ${activeSection === "cash_requisition" ? "btn-primary" : ""}`} type="button" onClick={() => setActiveSection("cash_requisition")}>
              Cash Requisition
            </button>
            <button className={`btn ${activeSection === "authority_to_incur" ? "btn-primary" : ""}`} type="button" onClick={() => setActiveSection("authority_to_incur")}>
              Authority To Incur Expenditure
            </button>
            <button className={`btn ${activeSection === "salary_advance" ? "btn-primary" : ""}`} type="button" onClick={() => setActiveSection("salary_advance")}>
              Salary Advance Request
            </button>
          </div>
        </div>

        <div style={{ flex: "999 1 520px", minWidth: 0 }}>

      {activeSection === "cash_reimbursement" && (
        <>
      <div className="card" style={{ marginBottom: 12 }}>
        <div style={{ fontWeight: 900, marginBottom: 8 }}>Cash Reimbursement (Current 2-Week Window)</div>
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
                        <th style={{ textAlign: "left", padding: 10 }}>Action</th>
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
                          <td style={{ padding: 10 }}>
                            <button
                              className="btn"
                              type="button"
                              onClick={() => saveClientPrice(row)}
                              disabled={!!pricingSaving[row.id]}
                            >
                              {pricingSaving[row.id] ? "Saving..." : "Save"}
                            </button>
                          </td>
                        </tr>
                      ))}
                      {!clientPricing.length && (
                        <tr><td colSpan={3} style={{ padding: 14 }} className="muted">No clients found.</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        )}
        {canApplyReimbursement && (
          <>
            <div className="muted" style={{ marginBottom: 10 }}>
              Period: {draft.period_start || "-"} to {draft.period_end || "-"}
            </div>
            <div className="muted" style={{ marginBottom: 10 }}>
              {draft.submit_message || "Cash reimbursement can be submitted on the 15th and 30th of each month, and Feb 28."}
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
                  Submit 2-Week Reimbursement
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
                    <td style={{ padding: 10 }}><span className={`dashboard-status-badge ${statusPillClass(r.status)}`}>{r.status}</span></td>
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
        </>
      )}

      {activeSection === "cash_requisition" && (
        <div className="card">
          <div style={{ fontWeight: 900, marginBottom: 8 }}>Cash Requisition</div>
          <div className="muted">This module is not implemented yet.</div>
        </div>
      )}
      {activeSection === "authority_to_incur" && (
        <div className="card">
          <div style={{ fontWeight: 900, marginBottom: 8 }}>Authority To Incur Expenditure</div>
          <div className="muted">This module is not implemented yet.</div>
        </div>
      )}
      {activeSection === "salary_advance" && (
        <div className="card">
          <div style={{ fontWeight: 900, marginBottom: 8 }}>Salary Advance Request</div>
          <div className="muted">This module is not implemented yet.</div>
        </div>
      )}
        </div>
      </div>
    </div>
  );
}
