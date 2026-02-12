import React, { useEffect, useState } from "react";
import { createTodayActivity, listDashboardOverview } from "./api";
import { useToast } from "./ToastProvider";

function formatDate(v) {
  if (!v) return "-";
  return new Date(v).toLocaleDateString();
}

function dueBadge(daysUntilDue) {
  if (daysUntilDue < 0) return `${Math.abs(daysUntilDue)} day(s) overdue`;
  if (daysUntilDue === 0) return "Due today";
  return `Due in ${daysUntilDue} day(s)`;
}

export default function DashboardPage() {
  const { showToast } = useToast();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [newActivity, setNewActivity] = useState("");
  const [overview, setOverview] = useState({
    today: "",
    todays_activities: [],
    upcoming_subtasks: [],
    due_subtasks: [],
  });

  async function loadOverview() {
    setBusy(true);
    setErr("");
    try {
      const data = await listDashboardOverview();
      setOverview(data);
    } catch (e) {
      setErr(String(e.message || e));
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    loadOverview();
  }, []);

  async function handlePostActivity(e) {
    e.preventDefault();
    const text = (newActivity || "").trim();
    if (!text) {
      setErr("Please enter your activity.");
      return;
    }
    try {
      await createTodayActivity(text);
      setNewActivity("");
      await loadOverview();
      showToast("Today's activity posted", "success");
    } catch (e2) {
      setErr(String(e2.message || e2));
    }
  }

  return (
    <div>
      <div className="card" style={{ marginBottom: 12 }}>
        <div style={{ fontWeight: 900, fontSize: 20 }}>Dashboard</div>
        <div className="muted">Team-wide today updates and client task reminders.</div>
      </div>

      {err && <div className="error">{err}</div>}

      <div className="card" style={{ marginBottom: 12 }}>
        <div style={{ fontWeight: 800, marginBottom: 8 }}>Post Today&apos;s Activity</div>
        <form onSubmit={handlePostActivity}>
          <div className="field">
            <label>What are you working on today?</label>
            <textarea
              value={newActivity}
              onChange={(e) => setNewActivity(e.target.value)}
              placeholder="Write today's activities..."
              maxLength={1000}
            />
          </div>
          <button className="btn btn-primary" type="submit">Post Activity</button>
        </form>
      </div>

      <div className="card" style={{ marginBottom: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <div style={{ fontWeight: 800 }}>Today&apos;s Activities ({formatDate(overview.today)})</div>
          <button className="btn" onClick={loadOverview} disabled={busy}>{busy ? "Refreshing..." : "Refresh"}</button>
        </div>
        {!overview.todays_activities.length ? (
          <div className="muted">No activities posted yet today.</div>
        ) : (
          <div style={{ display: "grid", gap: 8 }}>
            {overview.todays_activities.map((item) => (
              <div key={item.id} className="card" style={{ background: "var(--card-2)", padding: 10 }}>
                <div style={{ fontWeight: 700 }}>{item.user?.name || `User #${item.user_id}`}</div>
                <div>{item.activity}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="card" style={{ marginBottom: 12 }}>
        <div style={{ fontWeight: 800, marginBottom: 8 }}>Upcoming Activities (due in 3 days or less)</div>
        {!overview.upcoming_subtasks.length ? (
          <div className="muted">No upcoming subtasks in the next 3 days.</div>
        ) : (
          <table className="table" style={{ width: "100%" }}>
            <thead>
              <tr>
                <th>Owner</th>
                <th>Client</th>
                <th>Task</th>
                <th>Subtask</th>
                <th>Due Date</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {overview.upcoming_subtasks.map((t) => (
                <tr key={t.id}>
                  <td>{t.user_name}</td>
                  <td>{t.client_name}</td>
                  <td>{t.task}</td>
                  <td>{t.subtask}</td>
                  <td>{formatDate(t.completion_date)}</td>
                  <td>{dueBadge(t.days_until_due)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="card">
        <div style={{ fontWeight: 800, marginBottom: 8 }}>Due Activities (not marked complete)</div>
        {!overview.due_subtasks.length ? (
          <div className="muted">No due or overdue subtasks pending completion.</div>
        ) : (
          <table className="table" style={{ width: "100%" }}>
            <thead>
              <tr>
                <th>Owner</th>
                <th>Client</th>
                <th>Task</th>
                <th>Subtask</th>
                <th>Due Date</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {overview.due_subtasks.map((t) => (
                <tr key={t.id}>
                  <td>{t.user_name}</td>
                  <td>{t.client_name}</td>
                  <td>{t.task}</td>
                  <td>{t.subtask}</td>
                  <td>{formatDate(t.completion_date)}</td>
                  <td>{dueBadge(t.days_until_due)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
