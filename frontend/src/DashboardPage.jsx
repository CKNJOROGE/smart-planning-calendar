import React, { useEffect, useMemo, useState } from "react";
import { createTodayActivity, listDashboardOverview, listTodoHistory, me, updateTodayActivity } from "./api";
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

function groupActivitiesByPost(items) {
  const groups = new Map();
  for (const item of items || []) {
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

  return Array.from(groups.values()).map((group) => ({
    ...group,
    items: [...group.items].sort((a, b) => Number(a.id) - Number(b.id)),
  }));
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#39;");
}

export default function DashboardPage() {
  const { showToast } = useToast();
  const [currentUser, setCurrentUser] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [newActivity, setNewActivity] = useState("");
  const [togglingIds, setTogglingIds] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyRows, setHistoryRows] = useState([]);
  const [historyFilters, setHistoryFilters] = useState({ user_query: "", activity_date: "" });
  const [historyDraft, setHistoryDraft] = useState({ user_query: "", activity_date: "" });
  const [overview, setOverview] = useState({
    today: "",
    todays_activities: [],
    upcoming_subtasks: [],
    due_subtasks: [],
  });

  const isAdmin = currentUser?.role === "admin";

  const groupedTodayPosts = useMemo(
    () => groupActivitiesByPost(overview.todays_activities)
      .map((group) => ({
        ...group,
        all_completed: group.items.length > 0 && group.items.every((x) => !!x.completed),
      }))
      .sort((a, b) => {
        if (Number(!!a.all_completed) !== Number(!!b.all_completed)) {
          return Number(!!a.all_completed) - Number(!!b.all_completed);
        }
        return Number(new Date(b.created_at)) - Number(new Date(a.created_at));
      }),
    [overview.todays_activities]
  );

  const historyByDate = useMemo(() => {
    const groupsByDate = new Map();
    for (const item of historyRows || []) {
      const dayKey = item.activity_date || "unknown-date";
      if (!groupsByDate.has(dayKey)) {
        groupsByDate.set(dayKey, []);
      }
      groupsByDate.get(dayKey).push(item);
    }

    const dates = Array.from(groupsByDate.keys()).sort((a, b) => String(b).localeCompare(String(a)));
    return dates.map((dayKey) => {
      const rows = groupsByDate.get(dayKey) || [];
      return {
        dayKey,
        posts: groupActivitiesByPost(rows)
          .map((post) => ({
            ...post,
          }))
          .sort((a, b) => Number(new Date(b.created_at)) - Number(new Date(a.created_at))),
      };
    });
  }, [historyRows]);

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

  async function loadHistory() {
    if (!currentUser) return;
    setHistoryLoading(true);
    setErr("");
    try {
      const filters = { days: 90 };
      if (historyFilters.activity_date) filters.activity_date = historyFilters.activity_date;
      if (isAdmin && historyFilters.user_query.trim()) filters.user_query = historyFilters.user_query.trim();
      const rows = await listTodoHistory(filters);
      setHistoryRows(rows || []);
    } catch (e) {
      setErr(String(e.message || e));
    } finally {
      setHistoryLoading(false);
    }
  }

  function exportHistoryPdf() {
    if (!historyByDate.length) {
      showToast("No history to export", "error");
      return;
    }

    const filtersLine = isAdmin
      ? `Filters: user="${historyFilters.user_query || "all"}", date="${historyFilters.activity_date || "all"}"`
      : `Filters: date="${historyFilters.activity_date || "all"}"`;

    const bodyHtml = historyByDate.map((day) => `
      <section style="margin:0 0 16px 0;">
        <h3 style="margin:0 0 8px 0;font-size:14px;">${escapeHtml(formatDate(day.dayKey))}</h3>
        ${day.posts.map((post) => `
          <div style="border:1px solid #ddd;border-radius:8px;padding:10px;margin:0 0 8px 0;">
            <div style="display:flex;justify-content:space-between;font-size:12px;color:#444;margin-bottom:6px;">
              <strong>${escapeHtml(post.user?.name || `User #${post.user_id}`)}</strong>
              <span>${escapeHtml(formatDate(post.created_at))}</span>
            </div>
            <ul style="margin:0;padding-left:18px;">
              ${post.items.map((item) => `
                <li style="margin:0 0 4px 0;text-decoration:${item.completed ? "line-through" : "none"};">
                  [${item.completed ? "x" : " "}] ${escapeHtml(item.activity)}
                </li>
              `).join("")}
            </ul>
          </div>
        `).join("")}
      </section>
    `).join("");

    const popup = window.open("", "_blank");
    if (!popup) {
      showToast("Popup blocked. Allow popups to export PDF.", "error");
      return;
    }

    popup.document.open();
    popup.document.write(`
      <!doctype html>
      <html>
        <head>
          <meta charset="utf-8" />
          <title>To-Do List History</title>
        </head>
        <body style="font-family:Arial,sans-serif;padding:20px;color:#111;">
          <h1 style="margin:0 0 8px 0;font-size:20px;">To-Do List History</h1>
          <div style="margin:0 0 16px 0;font-size:12px;color:#555;">
            Exported on ${escapeHtml(new Date().toLocaleString())}<br/>
            ${escapeHtml(filtersLine)}
          </div>
          ${bodyHtml}
        </body>
      </html>
    `);
    popup.document.close();
    let printed = false;
    const triggerPrint = () => {
      if (printed || popup.closed) return;
      printed = true;
      popup.focus();
      // Give the browser a brief render frame before triggering print.
      setTimeout(() => {
        if (!popup.closed) popup.print();
      }, 150);
    };
    popup.onload = triggerPrint;
    setTimeout(triggerPrint, 400);
  }

  useEffect(() => {
    (async () => {
      try {
        const u = await me();
        setCurrentUser(u);
      } catch (e) {
        setErr(String(e.message || e));
      }
    })();
  }, []);

  useEffect(() => {
    loadOverview();
  }, []);

  useEffect(() => {
    loadHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser?.id, currentUser?.role, historyFilters.user_query, historyFilters.activity_date]);

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
        <div className="dashboard-left-stack">
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

          <div className="card dashboard-panel">
            <div className="dashboard-panel-head">
              <div className="dashboard-panel-title">To-Do List History</div>
              {isAdmin && (
                <button className="btn" type="button" onClick={exportHistoryPdf} disabled={!historyByDate.length}>
                  Export as PDF
                </button>
              )}
            </div>
            {isAdmin && (
              <div className="row" style={{ marginBottom: 10 }}>
                <div className="field" style={{ flex: "1 1 240px", marginBottom: 0 }}>
                  <label>Search User</label>
                  <input
                    type="text"
                    value={historyDraft.user_query}
                    onChange={(e) => setHistoryDraft((prev) => ({ ...prev, user_query: e.target.value }))}
                    placeholder="Name or email"
                  />
                </div>
                <div className="field" style={{ flex: "1 1 180px", marginBottom: 0 }}>
                  <label>Date</label>
                  <input
                    type="date"
                    value={historyDraft.activity_date}
                    onChange={(e) => setHistoryDraft((prev) => ({ ...prev, activity_date: e.target.value }))}
                  />
                </div>
                <div style={{ alignSelf: "end", display: "flex", gap: 8 }}>
                  <button
                    className="btn"
                    type="button"
                    onClick={() => setHistoryFilters({ ...historyDraft })}
                    disabled={historyLoading}
                  >
                    Search
                  </button>
                  <button
                    className="btn"
                    type="button"
                    onClick={() => {
                      const reset = { user_query: "", activity_date: "" };
                      setHistoryDraft(reset);
                      setHistoryFilters(reset);
                    }}
                    disabled={historyLoading}
                  >
                    Clear
                  </button>
                </div>
              </div>
            )}
            {historyLoading ? (
              <div className="muted">Loading history...</div>
            ) : !historyByDate.length ? (
              <div className="muted">No historical to-do lists yet.</div>
            ) : (
              <div className="dashboard-feed" role="list" aria-label="To-Do List History">
                {historyByDate.map((day) => (
                  <div key={day.dayKey}>
                    <div className="dashboard-feed-date" style={{ marginBottom: 8, fontWeight: 800 }}>
                      {formatDate(day.dayKey)}
                    </div>
                    <div style={{ display: "grid", gap: 10, marginBottom: 12 }}>
                      {day.posts.map((post) => (
                        <div key={post.key} className="dashboard-feed-item" role="listitem">
                          <div className="dashboard-feed-author-row">
                            <div className="dashboard-feed-author">{post.user?.name || `User #${post.user_id}`}</div>
                            <div className="dashboard-feed-date">{formatDate(post.created_at)}</div>
                          </div>
                          <div style={{ display: "grid", gap: 8, marginTop: 8 }}>
                            {post.items.map((item) => (
                              <label key={item.id} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                                <input type="checkbox" checked={!!item.completed} readOnly disabled style={{ marginTop: 4 }} />
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
                  </div>
                ))}
              </div>
            )}
          </div>
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
