import React, { useEffect, useMemo, useState } from "react";
import { createTodayActivity, listDashboardOverview, updateTodayActivity } from "./api";
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
  const [togglingIds, setTogglingIds] = useState([]);
  const [overview, setOverview] = useState({
    today: "",
    todays_activities: [],
    upcoming_subtasks: [],
    due_subtasks: [],
  });

  const groupedTodayPosts = useMemo(() => {
    const groups = new Map();
    for (const item of overview.todays_activities || []) {
      const key = item.post_group_id || `legacy_${item.id}`;
      if (!groups.has(key)) {
        groups.set(key, {
          key,
          user: item.user,
          user_id: item.user_id,
          created_at: item.created_at,
          items: [],
        });
      }
      const group = groups.get(key);
      if (new Date(item.created_at) > new Date(group.created_at)) {
        group.created_at = item.created_at;
      }
      group.items.push(item);
    }

    return Array.from(groups.values())
      .map((group) => ({
        ...group,
        items: [...group.items].sort((a, b) => Number(a.id) - Number(b.id)),
        all_completed: group.items.length > 0 && group.items.every((x) => !!x.completed),
      }))
      .sort((a, b) => {
        if (Number(!!a.all_completed) !== Number(!!b.all_completed)) {
          return Number(!!a.all_completed) - Number(!!b.all_completed);
        }
        return Number(new Date(b.created_at)) - Number(new Date(a.created_at));
      });
  }, [overview.todays_activities]);

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
      setErr("Please enter at least one to-do item.");
      return;
    }
    try {
      await createTodayActivity(text);
      setNewActivity("");
      await loadOverview();
      showToast("To-do list posted", "success");
    } catch (e2) {
      setErr(String(e2.message || e2));
    }
  }

  async function handleToggleActivity(item) {
    const id = Number(item.id);
    if (!id || togglingIds.includes(id)) return;
    setErr("");
    setTogglingIds((prev) => [...prev, id]);
    try {
      const updated = await updateTodayActivity(id, !item.completed);
      setOverview((prev) => ({
        ...prev,
        todays_activities: prev.todays_activities
          .map((row) => (Number(row.id) === id ? { ...row, ...updated } : row)),
      }));
    } catch (e) {
      setErr(String(e.message || e));
    } finally {
      setTogglingIds((prev) => prev.filter((x) => x !== id));
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
          <div className="dashboard-panel-title">Post Today&apos;s To-Do List</div>
        </div>
        <form onSubmit={handlePostActivity}>
          <div className="field">
            <textarea
              value={newActivity}
              onChange={(e) => setNewActivity(e.target.value)}
              placeholder="Write one to-do item per line..."
              maxLength={1000}
              className="dashboard-activity-input"
            />
            <div className="helper">{newActivity.length}/1000</div>
          </div>
          <button className="btn btn-primary" type="submit">Post To-Do List</button>
        </form>
      </div>

      <div className="dashboard-layout">
        <div className="card dashboard-panel dashboard-today-panel">
          <div className="dashboard-panel-head">
            <div className="dashboard-panel-title">Today&apos;s To-Do List</div>
          </div>
          {!groupedTodayPosts.length ? (
            <div className="muted">No to-do items posted yet today.</div>
          ) : (
            <div className="dashboard-feed" role="list" aria-label="Today's To-Do List">
              {groupedTodayPosts.map((post) => (
                <div key={post.key} className="dashboard-feed-item" role="listitem">
                  <div className="dashboard-feed-author-row">
                    <div className="dashboard-feed-author">{post.user?.name || `User #${post.user_id}`}</div>
                    <div className="dashboard-feed-date">{formatDate(post.created_at)}</div>
                  </div>
                  <div style={{ display: "grid", gap: 8, marginTop: 8 }}>
                    {post.items.map((item) => (
                      <label key={item.id} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                        <input
                          type="checkbox"
                          checked={!!item.completed}
                          onChange={() => handleToggleActivity(item)}
                          disabled={togglingIds.includes(Number(item.id))}
                          style={{ marginTop: 4 }}
                        />
                        <div
                          className="dashboard-feed-text"
                          style={{ textDecoration: item.completed ? "line-through" : "none", opacity: item.completed ? 0.7 : 1 }}
                        >
                          {item.activity}
                        </div>
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="dashboard-right-stack">
          <div className="card dashboard-panel">
            <div className="dashboard-panel-head">
              <div className="dashboard-panel-title">Upcoming Tasks</div>
            </div>
            {renderTaskList(overview.upcoming_subtasks, "No upcoming subtasks in the next 3 days.")}
          </div>

          <div className="card dashboard-panel">
            <div className="dashboard-panel-head">
              <div className="dashboard-panel-title">Due Tasks</div>
            </div>
            {renderTaskList(overview.due_subtasks, "No due or overdue subtasks pending completion.")}
          </div>
        </div>
      </div>

    </div>
  );
}
