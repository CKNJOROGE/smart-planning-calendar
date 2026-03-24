import React, { useEffect, useState, useMemo } from "react";
import { me, listMyPayrollRuns, confirmPayrollRun, unconfirmPayrollRun } from "./api";

function fmtCurrency(amount) {
  if (amount == null) return "-";
  return "KES " + Number(amount).toLocaleString("en-KE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function payrollStatusLabel(status, confirmed) {
  if (status === "paid") return "Paid";
  if (status === "approved") {
    if (confirmed) return "Approved - Ready for Payment";
    return "Pending Your Confirmation";
  }
  if (status === "draft") {
    if (confirmed) return "Confirmed - Awaiting Approval";
    return "Pending Your Confirmation";
  }
  return status || "-";
}

function statusPillClass(status, confirmed) {
  const s = (status || "").toLowerCase();
  if (s === "paid") return "dashboard-status-ok";
  if (confirmed) return "dashboard-status-info";
  if (s === "approved") return "dashboard-status-warn";
  return "dashboard-status-warn";
}

export default function EmployeePayrollPage() {
  const [current, setCurrent] = useState(null);
  const [runs, setRuns] = useState([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [filter, setFilter] = useState("");

  useEffect(() => {
    me().then(setCurrent).catch(() => setCurrent(null));
  }, []);

  useEffect(() => {
    if (!current) return;
    setBusy(true);
    setErr("");
    listMyPayrollRuns()
      .then(setRuns)
      .catch((e) => setErr(String(e.message || e)))
      .finally(() => setBusy(false));
  }, [current]);

  const filteredRuns = useMemo(() => {
    if (!filter) return runs;
    const f = filter.toLowerCase();
    return runs.filter((r) => {
      const month = r.payroll_month || "";
      const status = (r.status || "") + " " + payrollStatusLabel(r.status, r.employee_confirmed);
      return month.includes(f) || status.toLowerCase().includes(f);
    });
  }, [runs, filter]);

  async function handleConfirm(runId, confirmed) {
    try {
      if (confirmed) {
        await unconfirmPayrollRun(runId);
      } else {
        await confirmPayrollRun(runId);
      }
      const updated = await listMyPayrollRuns();
      setRuns(updated);
    } catch (e) {
      alert("Error: " + (e.message || e));
    }
  }

  if (busy) {
    return (
      <div className="page-wrap">
        <div className="card">
          <div style={{ padding: 40, textAlign: "center" }}>Loading your payroll...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="page-wrap">
      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ fontWeight: 900, fontSize: 18 }}>My Payroll</div>
        <div className="muted" style={{ marginTop: 6 }}>
          View your monthly payroll details and confirm accuracy. Your confirmation is required before payroll can be disbursed.
        </div>
        {err && <div className="error" style={{ marginTop: 10 }}>{err}</div>}
      </div>

      <div className="card">
        <div style={{ marginBottom: 12 }}>
          <input
            type="text"
            placeholder="Filter by month..."
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            style={{ width: "100%", maxWidth: 300 }}
          />
        </div>

        {!filteredRuns.length && (
          <div style={{ padding: 40, textAlign: "center" }} className="muted">
            No payroll records found.
          </div>
        )}

        {filteredRuns.map((run) => {
          const canConfirm = run.status !== "paid";
          return (
            <div
              key={run.id}
              style={{
                border: "1px solid #e2e8f0",
                borderRadius: 12,
                padding: 16,
                marginBottom: 12,
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12 }}>
                <div>
                  <div style={{ fontWeight: 900, fontSize: 16 }}>
                    {run.payroll_month ? new Date(run.payroll_month + "T00:00:00").toLocaleDateString("en-KE", { year: "numeric", month: "long" }) : "-"}
                  </div>
                  <div className="muted" style={{ marginTop: 4 }}>
                    Pay Date: {run.pay_date ? new Date(run.pay_date + "T00:00:00").toLocaleDateString("en-KE") : "Not set"}
                  </div>
                  <div style={{ marginTop: 8 }}>
                    <span className={`dashboard-status-badge ${statusPillClass(run.status, run.employee_confirmed)}`}>
                      {payrollStatusLabel(run.status, run.employee_confirmed)}
                    </span>
                  </div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontWeight: 900, fontSize: 20 }}>{fmtCurrency(run.net_pay)}</div>
                  <div className="muted">Net Pay</div>
                </div>
              </div>

              <div style={{ marginTop: 16, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
                <div>
                  <div className="muted" style={{ fontSize: 12 }}>Gross Cash Pay</div>
                  <div style={{ fontWeight: 700 }}>{fmtCurrency(run.gross_cash_pay)}</div>
                </div>
                <div>
                  <div className="muted" style={{ fontSize: 12 }}>NSSF (Employee)</div>
                  <div style={{ fontWeight: 700 }}>{fmtCurrency(run.nssf_employee)}</div>
                </div>
                <div>
                  <div className="muted" style={{ fontSize: 12 }}>SHIF</div>
                  <div style={{ fontWeight: 700 }}>{fmtCurrency(run.shif_employee)}</div>
                </div>
                <div>
                  <div className="muted" style={{ fontSize: 12 }}>PAYE</div>
                  <div style={{ fontWeight: 700 }}>{fmtCurrency(run.paye_after_reliefs)}</div>
                </div>
                <div>
                  <div className="muted" style={{ fontSize: 12 }}>AHL</div>
                  <div style={{ fontWeight: 700 }}>{fmtCurrency(run.ahl_employee)}</div>
                </div>
                <div>
                  <div className="muted" style={{ fontSize: 12 }}>Pension</div>
                  <div style={{ fontWeight: 700 }}>{fmtCurrency(run.pension_employee)}</div>
                </div>
              </div>

              {canConfirm && (
                <div style={{ marginTop: 16, paddingTop: 16, borderTop: "1px solid #e2e8f0" }}>
                  {run.employee_confirmed ? (
                    <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                      <span className="dashboard-status-badge dashboard-status-info">
                        Confirmed on {run.employee_confirmed_at ? new Date(run.employee_confirmed_at).toLocaleString() : "-"}
                      </span>
                      <button
                        className="btn"
                        type="button"
                        onClick={() => handleConfirm(run.id, true)}
                      >
                        Undo Confirmation
                      </button>
                    </div>
                  ) : (
                    <div>
                      <p className="muted" style={{ marginBottom: 10 }}>
                        Please confirm that the payroll details above are accurate before payment can be processed.
                      </p>
                      <button
                        className="btn btn-primary"
                        type="button"
                        onClick={() => handleConfirm(run.id, false)}
                      >
                        Confirm Payroll Accuracy
                      </button>
                    </div>
                  )}
                </div>
              )}

              {run.status === "paid" && (
                <div style={{ marginTop: 16, paddingTop: 16, borderTop: "1px solid #e2e8f0" }}>
                  <span className="dashboard-status-badge dashboard-status-ok">
                    Payment Disbursed
                  </span>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
