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

  function renderTaskList(items, emptyText) {
    if (!items.length) return <div className="muted">{emptyText}</div>;
    return (
      <div className="dashboard-mini-list">
        {items.map((t) => (
          <div key={t.id} className="dashboard-mini-item">
            <div className="dashboard-mini-head">
              <div className="dashboard-task-title">{t.task}</div>
              <span className={`dashboard-status-badge dashboard-status-${dueBadgeClass(t.days_until_due)}`}>
                {dueBadge(t.days_until_due)}
              </span>
            </div>
            <div className="dashboard-task-subtitle">{t.subtask}</div>
            <div className="dashboard-mini-meta">
              <span>{t.client_name}</span>
              <span>{t.user_name}</span>
              <span>{formatDate(t.completion_date)}</span>
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="dashboard-page">
      <div className="dashboard-hero card">
        <div className="dashboard-title-wrap">
          <div className="dashboard-title">Dashboard</div>
          <div className="dashboard-date">Today: {formatDate(overview.today)}</div>
        </div>
        <button className="btn dashboard-refresh-btn" type="button" onClick={loadOverview} disabled={busy}>
          {busy ? "Refreshing..." : "Refresh"}
        </button>
      </div>

      {err && <div className="error">{err}</div>}

      <div className="card dashboard-panel dashboard-compose-panel">
        <div className="dashboard-panel-head">
          <div className="dashboard-panel-title">Post Today&apos;s Activities</div>
        </div>
        <form onSubmit={handlePostActivity}>
          <div className="field">
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

      <div className="dashboard-layout">
        <div className="card dashboard-panel dashboard-today-panel">
          <div className="dashboard-panel-head">
            <div className="dashboard-panel-title">Today&apos;s Activities</div>
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

        <div className="dashboard-right-stack">
          <div className="card dashboard-panel">
            <div className="dashboard-panel-head">
              <div className="dashboard-panel-title">Upcoming Activities</div>
            </div>
            {renderTaskList(overview.upcoming_subtasks, "No upcoming subtasks in the next 3 days.")}
          </div>

          <div className="card dashboard-panel">
            <div className="dashboard-panel-head">
              <div className="dashboard-panel-title">Due Activities</div>
            </div>
            {renderTaskList(overview.due_subtasks, "No due or overdue subtasks pending completion.")}
          </div>
        </div>
      </div>

    </div>
  );
}
