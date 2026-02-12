import React, { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { me, listLeaveRequests, approveLeaveRequest, rejectLeaveRequest } from "./api";
import { useToast } from "./ToastProvider";

function fmtDateRange(e) {
  const from = new Date(e.start_ts).toLocaleDateString();
  const to = new Date(e.end_ts).toLocaleDateString();
  return `${from} - ${to}`;
}

export default function ApprovalsPage() {
  const [current, setCurrent] = useState(null);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [status, setStatus] = useState("pending");
  const { showToast } = useToast();

  async function load() {
    setLoading(true);
    setErr("");
    try {
      const u = await me();
      setCurrent(u);
      const data = await listLeaveRequests({ status });
      setItems(data);
    } catch (e) {
      setErr(String(e?.message || e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  if (current && current.role !== "admin" && current.role !== "supervisor") return <Navigate to="/" replace />;

  async function approve(id) {
    try {
      await approveLeaveRequest(id);
      showToast("Leave approved", "success");
      await load();
    } catch (e) {
      const msg = String(e?.message || e);
      setErr(msg);
      showToast(msg, "error");
    }
  }

  async function reject(id) {
    const reason = prompt("Reason for rejection (optional):") || "";
    try {
      await rejectLeaveRequest(id, reason);
      showToast("Leave rejected", "success");
      await load();
    } catch (e) {
      const msg = String(e?.message || e);
      setErr(msg);
      showToast(msg, "error");
    }
  }

  return (
    <div className="page-wrap approvals-page">
      <div className="card" style={{ padding: 16, marginBottom: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <div>
            <div style={{ fontWeight: 900, fontSize: 18 }}>Approvals Inbox</div>
            <div className="muted">Review and process leave requests quickly.</div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <select value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="pending">pending</option>
              <option value="approved">approved</option>
              <option value="rejected">rejected</option>
            </select>
            <button className="btn" onClick={load} disabled={loading}>Refresh</button>
          </div>
        </div>
      </div>

      {err && <div className="error" style={{ marginBottom: 12 }}>{err}</div>}

      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        <div style={{ padding: 12, borderBottom: "1px solid #e2e8f0", fontWeight: 800 }}>
          {loading ? "Loading..." : `${items.length} request(s)`}
        </div>

        <div style={{ width: "100%", overflowX: "auto" }}>
          <table className="table" style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "#f8fafc" }}>
                <th style={{ textAlign: "left", padding: 12 }}>Employee</th>
                <th style={{ textAlign: "left", padding: 12 }}>Dates</th>
                <th style={{ textAlign: "left", padding: 12 }}>Status</th>
                <th style={{ textAlign: "left", padding: 12 }}>Progress</th>
                <th style={{ textAlign: "left", padding: 12 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.map((e) => (
                <tr key={e.id} style={{ borderTop: "1px solid #eef2f7" }}>
                  <td style={{ padding: 12 }}>
                    <div style={{ fontWeight: 700 }}>{e.user?.name}</div>
                    <div className="muted" style={{ fontSize: 12 }}>{e.user?.email}</div>
                  </td>
                  <td style={{ padding: 12 }}>{fmtDateRange(e)}</td>
                  <td style={{ padding: 12 }}><span className="pill">{e.status}</span></td>
                  <td style={{ padding: 12, fontSize: 12 }}>
                    1st: {e.first_approved_by_id ? `#${e.first_approved_by_id}` : "pending"}<br />
                    2nd: {e.second_approved_by_id ? `#${e.second_approved_by_id}` : "pending"}
                  </td>
                  <td style={{ padding: 12 }}>
                    {e.status === "pending" ? (
                      <div style={{ display: "flex", gap: 8 }}>
                        <button className="btn btn-primary" onClick={() => approve(e.id)}>Approve</button>
                        <button className="btn btn-danger" onClick={() => reject(e.id)}>Reject</button>
                      </div>
                    ) : (
                      <span className="muted">-</span>
                    )}
                  </td>
                </tr>
              ))}
              {!items.length && (
                <tr>
                  <td colSpan={5} style={{ padding: 16 }} className="muted">No requests found.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
