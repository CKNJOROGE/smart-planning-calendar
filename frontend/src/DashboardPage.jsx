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

function groupActivitiesByUserDay(items) {
  const groups = new Map();
  for (const item of items || []) {
    const key = `${item.user_id}_${item.activity_date || "unknown-date"}`;
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
  const [historyFilters, setHistoryFilters] = useState({ user_query: "", start_date: "", end_date: "" });
  const [historyDraft, setHistoryDraft] = useState({ user_query: "", start_date: "", end_date: "" });
  const [overview, setOverview] = useState({
    today: "",
    todays_activities: [],
    carried_over_activities: [],
    unfinished_count: 0,
    upcoming_subtasks: [],
    due_subtasks: [],
    reimbursement_can_submit: false,
    reimbursement_submit_due_today: false,
    reimbursement_submit_period_start: "",
    reimbursement_submit_period_end: "",
    reimbursement_submit_message: "",
  });

  const isAdmin = currentUser?.role === "admin";

  const groupedTodayPosts = useMemo(
    () => groupActivitiesByUserDay(overview.todays_activities)
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

  const carriedOverByDate = useMemo(() => {
    const groupsByDate = new Map();
    for (const item of overview.carried_over_activities || []) {
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
        posts: groupActivitiesByPost(rows).sort(
          (a, b) => Number(new Date(b.created_at)) - Number(new Date(a.created_at))
        ),
      };
    });
  }, [overview.carried_over_activities]);

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
      if (historyFilters.start_date) filters.start_date = historyFilters.start_date;
      if (historyFilters.end_date) filters.end_date = historyFilters.end_date;
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
      ? `Filters: user="${historyFilters.user_query || "all"}", from="${historyFilters.start_date || "all"}", to="${historyFilters.end_date || "all"}"`
      : `Filters: from="${historyFilters.start_date || "all"}", to="${historyFilters.end_date || "all"}"`;

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
                <li style="margin:0 0 4px 0;">
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
  }, [currentUser?.id, currentUser?.role, historyFilters.user_query, historyFilters.start_date, historyFilters.end_date]);

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
        carried_over_activities: prev.carried_over_activities
          .map((row) => (Number(row.id) === id ? { ...row, ...updated } : row))
          .filter((row) => !row.completed),
        unfinished_count: Math.max(0, prev.unfinished_count + (updated.completed ? -1 : 1)),
      }));
      setHistoryRows((prev) => prev.map((row) => (Number(row.id) === id ? { ...row, ...updated } : row)));
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
          <div style={{ marginTop: 6 }}>
            <span
              className="pill"
              style={{
                borderColor: overview.unfinished_count > 0 ? "#ef4444" : undefined,
                color: overview.unfinished_count > 0 ? "#b91c1c" : undefined,
                fontWeight: 800,
              }}
            >
              Unfinished: {overview.unfinished_count || 0}
            </span>
          </div>
        </div>
        <button className="btn dashboard-refresh-btn" type="button" onClick={loadOverview} disabled={busy}>
          {busy ? "Refreshing..." : "Refresh"}
        </button>
      </div>

      {err && <div className="error">{err}</div>}
      {overview.reimbursement_can_submit && (
        <div
          className="card"
          style={{
            marginBottom: 12,
            border: "1px solid #f59e0b",
            background: "#fffbeb",
          }}
        >
          <div style={{ fontWeight: 900, marginBottom: 4 }}>Cash Reimbursement Due</div>
          <div style={{ fontSize: 14 }}>
            Submit your reimbursement for {formatDate(overview.reimbursement_submit_period_start)} to {formatDate(overview.reimbursement_submit_period_end)}.
          </div>
          <div className="muted" style={{ marginTop: 4 }}>
            {overview.reimbursement_submit_message || "Submission is open today."}
          </div>
        </div>
      )}

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
              <div className="dashboard-panel-title">Carried Over (Unfinished)</div>
            </div>
            {!carriedOverByDate.length ? (
              <div className="muted">No carried-over items.</div>
            ) : (
              <div className="dashboard-feed" role="list" aria-label="Carried Over Unfinished Items">
                {carriedOverByDate.map((day) => (
                  <div key={day.dayKey}>
                    <div className="dashboard-feed-date" style={{ marginBottom: 8, fontWeight: 800 }}>
                      {formatDate(day.dayKey)}
                    </div>
                    <div style={{ display: "grid", gap: 10, marginBottom: 12 }}>
                      {day.posts.map((post) => (
                        <div
                          key={post.key}
                          className="dashboard-feed-item"
                          role="listitem"
                          style={{ borderLeft: "4px solid #ef4444" }}
                        >
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
                                <div className="dashboard-feed-text" style={{ color: "#b91c1c", fontWeight: 600 }}>
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
                  <label>From</label>
                  <input
                    type="date"
                    value={historyDraft.start_date}
                    onChange={(e) => setHistoryDraft((prev) => ({ ...prev, start_date: e.target.value }))}
                  />
                </div>
                <div className="field" style={{ flex: "1 1 180px", marginBottom: 0 }}>
                  <label>To</label>
                  <input
                    type="date"
                    value={historyDraft.end_date}
                    onChange={(e) => setHistoryDraft((prev) => ({ ...prev, end_date: e.target.value }))}
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
                      const reset = { user_query: "", start_date: "", end_date: "" };
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
                                  style={{ opacity: item.completed ? 0.7 : 1 }}
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
