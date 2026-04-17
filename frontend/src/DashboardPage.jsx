import React, { useEffect, useMemo, useState } from "react";
import { continueTodayActivity, createTodayActivity, listDashboardOverview, listClientTasks, listTaskClients, listTaskYears, listTodoHistory, me, updateTodayActivity } from "./api";
import { useToast } from "./ToastProvider";
import LoadingState from "./LoadingState";

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

function probationBadgeLabel(daysUntilEnd) {
  if (daysUntilEnd === 30) return "1 month left";
  if (daysUntilEnd === 14) return "2 weeks left";
  if (daysUntilEnd === 0) return "Ends today";
  if (daysUntilEnd < 0) return `${Math.abs(daysUntilEnd)} day(s) overdue`;
  return `${daysUntilEnd} day(s) left`;
}

function probationBadgeClass(daysUntilEnd) {
  if (daysUntilEnd < 0) return "dashboard-status-danger";
  if (daysUntilEnd <= 14) return "dashboard-status-warn";
  if (daysUntilEnd <= 30) return "dashboard-status-info";
  return "dashboard-status-ok";
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

function currentQuarterFromDate(value = new Date()) {
  return Math.floor(value.getMonth() / 3) + 1;
}

function groupClientTasks(items) {
  const groups = new Map();
  for (const item of items || []) {
    const key = item.task_group_id || `legacy_${item.id}`;
    if (!groups.has(key)) {
      groups.set(key, {
        key,
        task: item.task || "",
        rows: [],
      });
    }
    groups.get(key).task = item.task || groups.get(key).task;
    groups.get(key).rows.push(item);
  }

  return Array.from(groups.values()).map((group) => ({
    ...group,
    rows: [...group.rows].sort((a, b) => Number(a.id) - Number(b.id)),
  }));
}

export default function DashboardPage() {
  const { showToast } = useToast();
  const [currentUser, setCurrentUser] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [togglingIds, setTogglingIds] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyRows, setHistoryRows] = useState([]);
  const [taskYears, setTaskYears] = useState([]);
  const [clients, setClients] = useState([]);
  const [selectedWorkplanYear, setSelectedWorkplanYear] = useState(new Date().getFullYear());
  const [selectedWorkplanClientId, setSelectedWorkplanClientId] = useState("");
  const [selectedWorkplanQuarter, setSelectedWorkplanQuarter] = useState(currentQuarterFromDate());
  const [workplanRows, setWorkplanRows] = useState([]);
  const [selectedWorkplanRowIds, setSelectedWorkplanRowIds] = useState([]);
  const [workplanLoading, setWorkplanLoading] = useState(false);
  const [historyFilters, setHistoryFilters] = useState({ user_query: "", start_date: "", end_date: "", client_id: "" });
  const [historyDraft, setHistoryDraft] = useState({ user_query: "", start_date: "", end_date: "", client_id: "" });
  const [overview, setOverview] = useState({
    today: "",
    todays_activities: [],
    carried_over_activities: [],
    unfinished_count: 0,
    upcoming_subtasks: [],
    due_subtasks: [],
    probation_reminders: [],
    upcoming_birthdays: [],
    reimbursement_can_submit: false,
    reimbursement_submit_due_today: false,
    reimbursement_submit_period_start: "",
    reimbursement_submit_period_end: "",
    reimbursement_submit_message: "",
  });
  const isCeo = currentUser?.role === "ceo";
  const reimbursementPeriodEnd = overview.reimbursement_submit_period_end || "";
  const todayKey = overview.today || "";
  const reimbursementIsOpenCurrentPeriod =
    !!overview.reimbursement_can_submit && !!reimbursementPeriodEnd && reimbursementPeriodEnd >= todayKey;
  const reimbursementIsLate =
    !!overview.reimbursement_can_submit && !overview.reimbursement_submit_due_today && !reimbursementIsOpenCurrentPeriod;

  const selectedWorkplanClient = useMemo(
    () => clients.find((c) => c.id === Number(selectedWorkplanClientId)) || null,
    [clients, selectedWorkplanClientId]
  );

  const carriedOverTaskIds = useMemo(() => {
    const ids = new Set();
    for (const item of [...(overview.todays_activities || []), ...(overview.carried_over_activities || [])]) {
      if (item.source_client_task_id == null) continue;
      if (!item.completed && item.activity_date && String(item.activity_date) < String(overview.today || "")) {
        if (item.continued_to_activity_id != null) continue;
      }
      if (item.completed) continue;
      ids.add(Number(item.source_client_task_id));
    }
    return ids;
  }, [overview.carried_over_activities, overview.todays_activities, overview.today]);

  const groupedWorkplanTasks = useMemo(
    () => groupClientTasks(workplanRows).map((group) => {
      const selectedRowIds = new Set(selectedWorkplanRowIds.map((id) => Number(id)));
      const selectedRows = group.rows.filter((row) => selectedRowIds.has(Number(row.id)) && !carriedOverTaskIds.has(Number(row.id)));
      return {
        ...group,
        selectedRows,
        selectedCount: selectedRows.length,
      };
    }),
    [carriedOverTaskIds, workplanRows, selectedWorkplanRowIds]
  );

  const selectedWorkplanRows = useMemo(
    () => groupedWorkplanTasks.flatMap((group) => group.selectedRows.filter((row) => !carriedOverTaskIds.has(Number(row.id)))),
    [carriedOverTaskIds, groupedWorkplanTasks]
  );

  const selectedWorkplanItems = useMemo(
    () => groupedWorkplanTasks.flatMap((group) =>
      group.selectedRows
        .filter((row) => !carriedOverTaskIds.has(Number(row.id)))
        .map((row) => ({
          activity: `Task: ${group.task || "Untitled task"} - ${row.subtask}`,
          client_id: Number(selectedWorkplanClientId),
          source_client_task_id: Number(row.id),
        }))
    ),
    [carriedOverTaskIds, groupedWorkplanTasks, selectedWorkplanClientId]
  );

  const selectedWorkplanText = useMemo(() => {
    if (!selectedWorkplanClient || !selectedWorkplanRows.length) return "";
    const lines = [`${selectedWorkplanClient.name} - ${selectedWorkplanYear} Q${selectedWorkplanQuarter}`];
    groupedWorkplanTasks.forEach((group) => {
      const currentRows = group.selectedRows.filter((row) => !carriedOverTaskIds.has(Number(row.id)));
      if (!currentRows.length) return;
      lines.push(`Task: ${group.task}`);
      currentRows.forEach((row) => {
        const datePart = row.completion_date ? ` (${formatDate(row.completion_date)})` : "";
        lines.push(`- ${row.subtask}${datePart}`);
      });
    });
    return lines.join("\n");
  }, [carriedOverTaskIds, groupedWorkplanTasks, selectedWorkplanClient, selectedWorkplanQuarter, selectedWorkplanRows.length, selectedWorkplanYear]);

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
      if (historyFilters.client_id) filters.client_id = historyFilters.client_id;
      if (isCeo && historyFilters.user_query.trim()) filters.user_query = historyFilters.user_query.trim();
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

    const filtersLine = isCeo
      ? `Filters: user="${historyFilters.user_query || "all"}", client="${clients.find((c) => String(c.id) === String(historyFilters.client_id))?.name || "all"}", from="${historyFilters.start_date || "all"}", to="${historyFilters.end_date || "all"}"`
      : `Filters: client="${clients.find((c) => String(c.id) === String(historyFilters.client_id))?.name || "all"}", from="${historyFilters.start_date || "all"}", to="${historyFilters.end_date || "all"}"`;

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
                  [${item.completed ? "x" : " "}] ${escapeHtml(item.activity)}${item.client_name ? ` <span style="color:#555;">(Client: ${escapeHtml(item.client_name)})</span>` : ""}
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
        const [years, rows] = await Promise.all([
          listTaskYears(),
          listTaskClients(),
        ]);
        const normalizedYears = Array.isArray(years) && years.length ? years.map((y) => Number(y)).filter((y) => Number.isFinite(y)) : [new Date().getFullYear()];
        if (!normalizedYears.includes(new Date().getFullYear())) {
          normalizedYears.unshift(new Date().getFullYear());
        }
        setTaskYears(Array.from(new Set(normalizedYears)).sort((a, b) => b - a));
        setClients(rows || []);
        if ((rows || []).length) {
          setSelectedWorkplanClientId((prev) => {
            if (prev && (rows || []).some((c) => Number(c.id) === Number(prev))) return prev;
            return String(rows[0].id);
          });
        }
        setSelectedWorkplanYear((prev) => (normalizedYears.includes(Number(prev)) ? Number(prev) : normalizedYears[0]));
      } catch (e) {
        setErr(String(e.message || e));
      }
    })();
  }, []);

  useEffect(() => {
    loadOverview();
  }, []);

  useEffect(() => {
    if (!selectedWorkplanYear || !selectedWorkplanClientId || !selectedWorkplanQuarter) {
      setWorkplanRows([]);
      setSelectedWorkplanRowIds([]);
      return;
    }
    let cancelled = false;
    (async () => {
      setWorkplanLoading(true);
      try {
        const rows = await listClientTasks({
          year: Number(selectedWorkplanYear),
          clientId: Number(selectedWorkplanClientId),
          quarter: Number(selectedWorkplanQuarter),
        });
        if (!cancelled) {
          setWorkplanRows(rows || []);
          setSelectedWorkplanRowIds([]);
        }
      } catch (e) {
        if (!cancelled) {
          setWorkplanRows([]);
          setSelectedWorkplanRowIds([]);
          setErr(String(e.message || e));
        }
      } finally {
        if (!cancelled) setWorkplanLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedWorkplanYear, selectedWorkplanClientId, selectedWorkplanQuarter]);

  useEffect(() => {
    loadHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser?.id, currentUser?.role, historyFilters.user_query, historyFilters.start_date, historyFilters.end_date, historyFilters.client_id]);

  function toggleWorkplanRow(rowId, checked) {
    const id = Number(rowId);
    setSelectedWorkplanRowIds((prev) => {
      const existing = new Set(prev.map((value) => Number(value)));
      if (checked) existing.add(id);
      else existing.delete(id);
      return Array.from(existing);
    });
  }

  function toggleWorkplanGroup(group, checked) {
    const ids = (group?.rows || []).map((row) => Number(row.id));
    setSelectedWorkplanRowIds((prev) => {
      const existing = new Set(prev.map((value) => Number(value)));
      ids.forEach((id) => {
        if (checked) existing.add(id);
        else existing.delete(id);
      });
      return Array.from(existing);
    });
  }

  function clearWorkplanSelection() {
    setSelectedWorkplanRowIds([]);
  }

  async function handlePostWorkplanActivity(e) {
    e.preventDefault();
    if (!selectedWorkplanClientId) {
      setErr("Please choose a client.");
      return;
    }
    if (!selectedWorkplanRows.length) {
      setErr("Please select at least one task or subtask.");
      return;
    }
    const text = selectedWorkplanText.trim();
    if (!text) {
      setErr("Please select at least one task or subtask.");
      return;
    }
    try {
      await createTodayActivity(selectedWorkplanItems, Number(selectedWorkplanClientId));
      clearWorkplanSelection();
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

  async function handleContinueActivity(item) {
    const id = Number(item.id);
    if (!id || togglingIds.includes(id)) return;
    setErr("");
    setTogglingIds((prev) => [...prev, id]);
    try {
      await continueTodayActivity(id);
      await loadOverview();
      showToast("Carried-over item moved to today", "success");
    } catch (e) {
      setErr(String(e.message || e));
    } finally {
      setTogglingIds((prev) => prev.filter((x) => x !== id));
    }
  }

  function renderTaskList(items, emptyText, listClassName = "") {
    if (!items.length) return <div className="muted">{emptyText}</div>;
    return (
      <div className={`dashboard-mini-list ${listClassName}`.trim()}>
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

  function birthdaySubtitle(item) {
    if (item.is_today) return `Today is ${item.user_name}'s Birthday! 🎉 Let's wish her a happy birthday.`;
    if (item.days_until === 1) return `Tomorrow is ${item.user_name}'s birthday.`;
    return `${item.user_name}'s birthday is in ${item.days_until} days.`;
  }

  if (busy && !overview.today) {
    return (
      <div className="page-wrap dashboard-page">
        <div className="card">
          <LoadingState label="Loading dashboard..." />
        </div>
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
      {(overview.reimbursement_submit_due_today || reimbursementIsOpenCurrentPeriod || reimbursementIsLate) && (
        <div
          className="card"
          style={{
            marginBottom: 12,
            border: overview.reimbursement_submit_due_today ? "2px solid #dc2626" : "1px solid #f59e0b",
            background: overview.reimbursement_submit_due_today ? "#fef2f2" : "#fffbeb",
          }}
        >
          <div style={{ fontWeight: 900, marginBottom: 4, color: overview.reimbursement_submit_due_today ? "#dc2626" : "#000" }}>
            {overview.reimbursement_submit_due_today
              ? "Cash Reimbursement Due TODAY"
              : reimbursementIsOpenCurrentPeriod
                ? "Cash Reimbursement - Current Period Open"
                : "Cash Reimbursement - Late Submission"}
          </div>
          <div style={{ fontSize: 14 }}>
            Submit your reimbursement for {formatDate(overview.reimbursement_submit_period_start)} to {formatDate(overview.reimbursement_submit_period_end)}.
          </div>
          <div className="muted" style={{ marginTop: 4 }}>
            {overview.reimbursement_submit_message || (reimbursementIsOpenCurrentPeriod ? "Submission is open for this period." : "Submission is open today.")}
          </div>
        </div>
      )}

      <div className="card dashboard-panel dashboard-compose-panel">
        <div className="dashboard-panel-head">
          <div className="dashboard-panel-title">Post Today&apos;s To-Do List</div>
        </div>
        <form onSubmit={handlePostWorkplanActivity} className="dashboard-workplan-form">
          <div className="dashboard-workplan-toolbar">
            <div className="field dashboard-workplan-field">
              <label>Year</label>
              <select
                value={selectedWorkplanYear}
                onChange={(e) => {
                  setSelectedWorkplanYear(Number(e.target.value));
                  setSelectedWorkplanRowIds([]);
                }}
              >
                {taskYears.map((year) => (
                  <option key={year} value={year}>{year}</option>
                ))}
              </select>
            </div>
            <div className="field dashboard-workplan-field">
              <label>Client</label>
              <select
                value={selectedWorkplanClientId}
                onChange={(e) => {
                  setSelectedWorkplanClientId(e.target.value);
                  setSelectedWorkplanRowIds([]);
                }}
              >
                <option value="">Select client</option>
                {clients.map((c) => (
                  <option key={c.id} value={String(c.id)}>{c.name}</option>
                ))}
              </select>
            </div>
            <div className="field dashboard-workplan-field">
              <label>Quarter</label>
              <div className="dashboard-quarter-switch" role="group" aria-label="Quarter selector">
                {[
                  { value: 1, label: "Q1" },
                  { value: 2, label: "Q2" },
                  { value: 3, label: "Q3" },
                  { value: 4, label: "Q4" },
                ].map((quarter) => (
                  <button
                    key={quarter.value}
                    type="button"
                    className={`btn dashboard-quarter-btn${Number(selectedWorkplanQuarter) === quarter.value ? " is-active" : ""}`}
                    onClick={() => {
                      setSelectedWorkplanQuarter(quarter.value);
                      setSelectedWorkplanRowIds([]);
                    }}
                  >
                    {quarter.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="dashboard-workplan-body">
            {!selectedWorkplanClientId ? (
              <div className="muted">Choose a client to load their tasks and subtasks.</div>
            ) : workplanLoading ? (
              <LoadingState label="Loading client tasks..." compact />
            ) : !groupedWorkplanTasks.length ? (
              <div className="muted">No tasks found for this client, year and quarter yet.</div>
            ) : (
              <div className="dashboard-workplan-groups">
                {groupedWorkplanTasks.map((group) => {
                  const selectableRows = group.rows.filter((row) => !carriedOverTaskIds.has(Number(row.id)));
                  const allSelected = selectableRows.length > 0 && selectableRows.every((row) => selectedWorkplanRowIds.includes(Number(row.id)));
                  const someSelected = selectableRows.some((row) => selectedWorkplanRowIds.includes(Number(row.id))) && !allSelected;
                  return (
                    <section key={group.key} className="dashboard-workplan-group card">
                      <div className="dashboard-workplan-group-head">
                        <label className="dashboard-workplan-group-toggle">
                          <input
                            type="checkbox"
                            checked={allSelected}
                            disabled={!selectableRows.length}
                            ref={(input) => {
                              if (input) input.indeterminate = someSelected;
                            }}
                            onChange={(e) => toggleWorkplanGroup({ ...group, rows: selectableRows }, e.target.checked)}
                          />
                          <span className="dashboard-workplan-group-title">{group.task || "Untitled task"}</span>
                        </label>
                        <span className="pill">{group.rows.length} subtask{group.rows.length === 1 ? "" : "s"}</span>
                      </div>
                      <div className="dashboard-workplan-subtasks">
                        {group.rows.map((row) => {
                          const checked = selectedWorkplanRowIds.includes(Number(row.id));
                          const isCarriedOver = carriedOverTaskIds.has(Number(row.id));
                          return (
                            <label key={row.id} className={`dashboard-workplan-subtask${checked ? " is-selected" : ""}${isCarriedOver ? " is-disabled" : ""}`}>
                              <input
                                type="checkbox"
                                checked={checked}
                                disabled={isCarriedOver}
                                onChange={(e) => toggleWorkplanRow(row.id, e.target.checked)}
                              />
                              <div className="dashboard-workplan-subtask-copy">
                                <div className="dashboard-workplan-subtask-title">{row.subtask}</div>
                                <div className="dashboard-workplan-subtask-meta">
                                  {row.completion_date ? `Due ${formatDate(row.completion_date)}` : "No due date"}
                                </div>
                                {isCarriedOver ? (
                                  <div className="dashboard-workplan-subtask-meta dashboard-workplan-subtask-warning">
                                    Already carried over. Continue it from the carried over list below.
                                  </div>
                                ) : null}
                              </div>
                            </label>
                          );
                        })}
                      </div>
                    </section>
                  );
                })}
              </div>
            )}
          </div>

          <div className="dashboard-workplan-summary">
            <div>
              <div className="dashboard-workplan-summary-label">Selected for today</div>
              <div className="dashboard-workplan-summary-value">
                {selectedWorkplanClient ? `${selectedWorkplanClient.name} - ${selectedWorkplanYear} Q${selectedWorkplanQuarter}` : "Nothing selected"}
              </div>
              <div className="muted">
                {selectedWorkplanRows.length ? `${selectedWorkplanRows.length} subtask${selectedWorkplanRows.length === 1 ? "" : "s"} selected` : "Pick at least one task or subtask."}
              </div>
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
              <button type="button" className="btn" onClick={clearWorkplanSelection} disabled={!selectedWorkplanRows.length}>
                Clear
              </button>
              <button className="btn btn-primary" type="submit" disabled={!selectedWorkplanRows.length || workplanLoading}>
                Post Today's To-Do List
              </button>
            </div>
          </div>

          {selectedWorkplanRows.length ? (
            <div className="dashboard-workplan-preview">
              <div className="dashboard-workplan-summary-label" style={{ marginBottom: 8 }}>Preview</div>
              <pre className="dashboard-workplan-preview-text">{selectedWorkplanText}</pre>
            </div>
          ) : null}
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
                            {item.client_name ? (
                              <div className="muted" style={{ marginTop: 2, fontSize: 12 }}>Client: {item.client_name}</div>
                            ) : null}
                          </div>
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="card dashboard-panel dashboard-carryover-panel">
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
                              <div key={item.id} className="dashboard-carryover-item-row">
                                <input
                                  type="checkbox"
                                  checked={!!item.completed}
                                  onChange={() => handleToggleActivity(item)}
                                  disabled={togglingIds.includes(Number(item.id))}
                                  style={{ marginTop: 4 }}
                                />
                                <div className="dashboard-carryover-copy">
                                  <div className="dashboard-feed-text" style={{ color: "#b91c1c", fontWeight: 600 }}>
                                    {item.activity}
                                    {item.client_name ? (
                                      <div className="muted" style={{ marginTop: 2, fontSize: 12 }}>Client: {item.client_name}</div>
                                    ) : null}
                                  </div>
                                  {item.source_client_task_id != null && (item.user_id === currentUser?.id || ["admin", "ceo"].includes(currentUser?.role)) && !item.completed ? (
                                    <button
                                      type="button"
                                      className="btn dashboard-carryover-continue-btn"
                                      onClick={() => handleContinueActivity(item)}
                                      disabled={togglingIds.includes(Number(item.id))}
                                    >
                                      Continue today
                                    </button>
                                  ) : null}
                                </div>
                              </div>
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

          <div className="card dashboard-panel dashboard-history-panel">
            <div className="dashboard-panel-head">
              <div className="dashboard-panel-title">To-Do List History</div>
              <button className="btn" type="button" onClick={exportHistoryPdf} disabled={!historyByDate.length}>
                Export as PDF
              </button>
            </div>
            <div className="row" style={{ marginBottom: 10 }}>
              {isCeo && (
                <div className="field" style={{ flex: "1 1 240px", marginBottom: 0 }}>
                  <label>Search User</label>
                  <input
                    type="text"
                    value={historyDraft.user_query}
                    onChange={(e) => setHistoryDraft((prev) => ({ ...prev, user_query: e.target.value }))}
                    placeholder="Name or email"
                  />
                </div>
              )}
              <div className="field" style={{ flex: "1 1 180px", marginBottom: 0 }}>
                <label>Client</label>
                <select
                  value={historyDraft.client_id}
                  onChange={(e) => setHistoryDraft((prev) => ({ ...prev, client_id: e.target.value }))}
                >
                  <option value="">All clients</option>
                  {clients.map((c) => (
                    <option key={c.id} value={String(c.id)}>{c.name}</option>
                  ))}
                </select>
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
                    const reset = { user_query: "", start_date: "", end_date: "", client_id: "" };
                    setHistoryDraft(reset);
                    setHistoryFilters(reset);
                  }}
                  disabled={historyLoading}
                >
                  Clear
                </button>
              </div>
            </div>
            {historyLoading ? (
              <LoadingState label="Loading history..." compact />
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
                                  {item.client_name ? (
                                    <div className="muted" style={{ marginTop: 2, fontSize: 12 }}>Client: {item.client_name}</div>
                                  ) : null}
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
          {!!overview.probation_reminders?.length && (
            <div className="card dashboard-panel">
              <div className="dashboard-panel-head">
                <div className="dashboard-panel-title">Probation Tracker</div>
              </div>
              <div className="dashboard-mini-list dashboard-mini-list--tall">
                {overview.probation_reminders.map((record) => (
                  <div key={record.id} className="dashboard-mini-item" style={{ borderLeft: "4px solid #f59e0b" }}>
                    <div className="dashboard-mini-head">
                      <div>
                        <div className="dashboard-task-title">{record.employee_name}</div>
                        <div className="dashboard-task-subtitle">{record.client_name}</div>
                      </div>
                      <span className={`dashboard-status-badge ${probationBadgeClass(record.days_until_end)}`}>
                        {probationBadgeLabel(record.days_until_end)}
                      </span>
                    </div>
                    <div className="dashboard-mini-meta">
                      <span>Hire: {formatDate(record.hire_date)}</span>
                      <span>End: {formatDate(record.probation_end_date)}</span>
                      <span>{record.probation_months} month(s)</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {!!overview.upcoming_birthdays?.length && (
            <div className="card dashboard-panel">
              <div className="dashboard-panel-head">
                <div className="dashboard-panel-title">Upcoming Birthdays</div>
              </div>
              <div className="dashboard-mini-list">
                {overview.upcoming_birthdays.map((b) => (
                  <div key={`${b.user_id}_${b.birthday_date}`} className="dashboard-mini-item birthday-widget-item">
                    <div className="dashboard-mini-head">
                      <div className="dashboard-task-title">{b.user_name}</div>
                      <span className={`dashboard-status-badge ${b.is_today ? "dashboard-status-warn" : "dashboard-status-info"}`}>
                        {b.is_today ? "Today" : formatDate(b.birthday_date)}
                      </span>
                    </div>
                    <div className="dashboard-task-subtitle">{birthdaySubtitle(b)}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

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
            {renderTaskList(overview.due_subtasks, "No due or overdue subtasks pending completion.", "dashboard-mini-list--tall")}
          </div>
        </div>
      </div>

    </div>
  );
}
