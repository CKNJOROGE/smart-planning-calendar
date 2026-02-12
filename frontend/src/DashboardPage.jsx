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

function dueBadgeClass(daysUntilDue) {
  if (daysUntilDue < 0) return "danger";
  if (daysUntilDue === 0) return "warn";
  return "ok";
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

  const activityCount = overview.todays_activities.length;
  const upcomingCount = overview.upcoming_subtasks.length;
  const dueCount = overview.due_subtasks.length;

  return (
    <div className="dashboard-page">
      <div className="dashboard-hero card">
        <div>
          <div className="dashboard-title">Operations Dashboard</div>
          <div className="dashboard-subtitle">Team-wide daily updates and client task reminders</div>
          <div className="dashboard-date">Today: {formatDate(overview.today)}</div>
        </div>
        <button className="btn dashboard-refresh-btn" type="button" onClick={loadOverview} disabled={busy}>
          {busy ? "Refreshing..." : "Refresh"}
        </button>
      </div>

      <div className="dashboard-metrics">
        <div className="card dashboard-metric">
          <div className="dashboard-metric-label">Today's Posts</div>
          <div className="dashboard-metric-value">{activityCount}</div>
        </div>
        <div className="card dashboard-metric">
          <div className="dashboard-metric-label">Upcoming (1-3 days)</div>
          <div className="dashboard-metric-value">{upcomingCount}</div>
        </div>
        <div className="card dashboard-metric dashboard-metric-danger">
          <div className="dashboard-metric-label">Due / Overdue</div>
          <div className="dashboard-metric-value">{dueCount}</div>
        </div>
      </div>

      {err && <div className="error">{err}</div>}

      <div className="dashboard-grid">
        <div className="card dashboard-panel">
          <div className="dashboard-panel-head">
            <div className="dashboard-panel-title">Post Today's Activity</div>
            <div className="muted">Visible to all team members</div>
          </div>
          <form onSubmit={handlePostActivity}>
            <div className="field">
              <label>What are you working on today?</label>
              <textarea
                value={newActivity}
                onChange={(e) => setNewActivity(e.target.value)}
                placeholder="Write today's activities..."
                maxLength={1000}
                className="dashboard-activity-input"
              />
              <div className="helper">{newActivity.length}/1000</div>
            </div>
            <button className="btn btn-primary" type="submit">Post Activity</button>
          </form>
        </div>

        <div className="card dashboard-panel">
          <div className="dashboard-panel-head">
            <div className="dashboard-panel-title">Today's Activities</div>
            <div className="muted">{formatDate(overview.today)}</div>
          </div>
          {!overview.todays_activities.length ? (
            <div className="muted">No activities posted yet today.</div>
          ) : (
            <div className="dashboard-feed">
              {overview.todays_activities.map((item) => (
                <div key={item.id} className="dashboard-feed-item">
                  <div className="dashboard-feed-author-row">
                    <div className="dashboard-feed-author">{item.user?.name || `User #${item.user_id}`}</div>
                    <div className="dashboard-feed-date">{formatDate(item.created_at)}</div>
                  </div>
                  <div className="dashboard-feed-text">{item.activity}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="dashboard-grid">
        <div className="card dashboard-panel">
          <div className="dashboard-panel-head">
            <div className="dashboard-panel-title">Upcoming Activities</div>
            <div className="muted">Due in 1-3 days</div>
          </div>
          {!overview.upcoming_subtasks.length ? (
            <div className="muted">No upcoming subtasks in the next 3 days.</div>
          ) : (
            <div className="dashboard-table-wrap">
              <table className="table dashboard-table">
                <thead>
                  <tr>
                    <th>Owner</th>
                    <th>Client</th>
                    <th>Task / Subtask</th>
                    <th>Due</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {overview.upcoming_subtasks.map((t) => (
                    <tr key={t.id}>
                      <td>{t.user_name}</td>
                      <td>{t.client_name}</td>
                      <td>
                        <div className="dashboard-task-title">{t.task}</div>
                        <div className="dashboard-task-subtitle">{t.subtask}</div>
                      </td>
                      <td>{formatDate(t.completion_date)}</td>
                      <td>
                        <span className={`dashboard-status-badge dashboard-status-${dueBadgeClass(t.days_until_due)}`}>
                          {dueBadge(t.days_until_due)}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="card dashboard-panel">
          <div className="dashboard-panel-head">
            <div className="dashboard-panel-title">Due Activities</div>
            <div className="muted">Due today or overdue, not completed</div>
          </div>
          {!overview.due_subtasks.length ? (
            <div className="muted">No due or overdue subtasks pending completion.</div>
          ) : (
            <div className="dashboard-table-wrap">
              <table className="table dashboard-table">
                <thead>
                  <tr>
                    <th>Owner</th>
                    <th>Client</th>
                    <th>Task / Subtask</th>
                    <th>Due</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {overview.due_subtasks.map((t) => (
                    <tr key={t.id}>
                      <td>{t.user_name}</td>
                      <td>{t.client_name}</td>
                      <td>
                        <div className="dashboard-task-title">{t.task}</div>
                        <div className="dashboard-task-subtitle">{t.subtask}</div>
                      </td>
                      <td>{formatDate(t.completion_date)}</td>
                      <td>
                        <span className={`dashboard-status-badge dashboard-status-${dueBadgeClass(t.days_until_due)}`}>
                          {dueBadge(t.days_until_due)}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
