import React, { useEffect, useMemo, useState } from "react";
import {
  me,
  listTaskYears,
  listTaskClients,
  createTaskClient,
  deleteTaskClient,
  listClientTasks,
  createClientTask,
  updateClientTask,
  deleteClientTask,
  listProbationRecords,
  createProbationRecord,
  updateProbationRecord,
  deleteProbationRecord,
} from "./api";
import { useToast } from "./ToastProvider";
import LoadingState from "./LoadingState";

const QUARTERS = [1, 2, 3, 4];

function emptySubtask() {
  return { subtask: "", completion_date: "" };
}

function pad2(value) {
  return String(value).padStart(2, "0");
}

function addMonthsToDateInput(dateInput, months) {
  if (!dateInput || !months) return "";
  const [yearText, monthText, dayText] = String(dateInput).split("-");
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return "";
  const monthIndex = month - 1 + Number(months);
  const targetYear = year + Math.floor(monthIndex / 12);
  const targetMonth = ((monthIndex % 12) + 12) % 12;
  const lastDay = new Date(targetYear, targetMonth + 1, 0).getDate();
  const targetDay = Math.min(day, lastDay);
  return `${targetYear}-${pad2(targetMonth + 1)}-${pad2(targetDay)}`;
}

function formatDateInputValue(dateInput) {
  if (!dateInput) return "-";
  const parsed = new Date(`${dateInput}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return dateInput;
  return parsed.toLocaleDateString();
}

function probationReminderLabel(daysUntilEnd) {
  if (daysUntilEnd === 30) return "1 month left";
  if (daysUntilEnd === 14) return "2 weeks left";
  if (daysUntilEnd === 0) return "Ends today";
  if (daysUntilEnd < 0) return `${Math.abs(daysUntilEnd)} day(s) overdue`;
  if (daysUntilEnd < 14) return `${daysUntilEnd} day(s) left`;
  return `${daysUntilEnd} day(s) left`;
}

function probationReminderClass(daysUntilEnd) {
  if (daysUntilEnd < 0) return "dashboard-status-danger";
  if (daysUntilEnd <= 14) return "dashboard-status-warn";
  if (daysUntilEnd <= 30) return "dashboard-status-info";
  return "dashboard-status-ok";
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#39;");
}

function canEditRow(current, row) {
  if (!current || !row) return false;
  return (
    current.role === "admin" ||
    current.role === "ceo" ||
    current.role === "supervisor" ||
    Number(current.id) === Number(row.user_id)
  );
}

export default function ClientTaskManagerPage() {
  const { showToast } = useToast();

  const [current, setCurrent] = useState(null);
  const [years, setYears] = useState([]);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [clients, setClients] = useState([]);
  const [selectedClientId, setSelectedClientId] = useState(null);
  const [selectedQuarter, setSelectedQuarter] = useState(1);
  const [tasks, setTasks] = useState([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const [mode, setMode] = useState("view");
  const [newClientName, setNewClientName] = useState("");
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [subtaskRows, setSubtaskRows] = useState([emptySubtask()]);
  const [editingRows, setEditingRows] = useState({});
  const [probationRecords, setProbationRecords] = useState([]);
  const [probationDraft, setProbationDraft] = useState({
    employee_name: "",
    hire_date: "",
    probation_months: "3",
  });
  const [probationEditingRows, setProbationEditingRows] = useState({});
  const [probationBusy, setProbationBusy] = useState(false);
  const [exportPeriodScope, setExportPeriodScope] = useState("quarter");

  const isEditMode = mode === "edit";
  const canManageClients = ["admin", "ceo"].includes(String(current?.role || "").toLowerCase());

  const selectedClient = useMemo(
    () => clients.find((c) => c.id === Number(selectedClientId)) || null,
    [clients, selectedClientId]
  );

  const probationDraftEndDate = useMemo(
    () => addMonthsToDateInput(probationDraft.hire_date, Number(probationDraft.probation_months || 0)),
    [probationDraft.hire_date, probationDraft.probation_months]
  );

  const groupedTasks = useMemo(() => {
    const groups = new Map();
    for (const row of tasks) {
      const key = row.task_group_id || `legacy_${row.id}`;
      if (!groups.has(key)) {
        groups.set(key, {
          key,
          task: row.task,
          owner: row.user?.name || `User #${row.user_id}`,
          rows: [],
        });
      }
      groups.get(key).rows.push(row);
    }
    return Array.from(groups.values());
  }, [tasks]);

  useEffect(() => {
    (async () => {
      setBusy(true);
      setErr("");
      try {
        const u = await me();
        setCurrent(u);
        const ys = await listTaskYears();
        const normalized = Array.isArray(ys) && ys.length ? ys : [new Date().getFullYear()];
        setYears(normalized);
        if (!normalized.includes(selectedYear)) setSelectedYear(normalized[0]);
      } catch (e) {
        setErr(String(e.message || e));
      } finally {
        setBusy(false);
      }
    })();
  }, []);

  useEffect(() => {
    if (!selectedYear) return;
    (async () => {
      setErr("");
      try {
        const list = await listTaskClients(selectedYear);
        setClients(list);
        setSelectedClientId((prev) => {
          if (prev && list.some((c) => c.id === Number(prev))) return prev;
          return list.length ? list[0].id : null;
        });
      } catch (e) {
        setErr(String(e.message || e));
      }
    })();
  }, [selectedYear]);

  useEffect(() => {
    if (!selectedYear || !selectedClientId || !selectedQuarter) {
      setTasks([]);
      return;
    }
    (async () => {
      setErr("");
      try {
        const list = await listClientTasks({
          year: selectedYear,
          clientId: Number(selectedClientId),
          quarter: selectedQuarter,
        });
        setTasks(list);
      } catch (e) {
        setErr(String(e.message || e));
      }
    })();
  }, [selectedYear, selectedClientId, selectedQuarter]);

  useEffect(() => {
    if (!selectedClientId) {
      setProbationRecords([]);
      setProbationEditingRows({});
      return;
    }
    (async () => {
      setProbationBusy(true);
      try {
        const list = await listProbationRecords(Number(selectedClientId));
        setProbationRecords(list || []);
      } catch (e) {
        setErr(String(e.message || e));
      } finally {
        setProbationBusy(false);
      }
    })();
  }, [selectedClientId]);

  useEffect(() => {
    if (!isEditMode) setEditingRows({});
  }, [isEditMode]);

  async function refreshTasks() {
    if (!selectedYear || !selectedClientId || !selectedQuarter) return;
    const list = await listClientTasks({
      year: selectedYear,
      clientId: Number(selectedClientId),
      quarter: selectedQuarter,
    });
    setTasks(list);
  }

  async function refreshProbationRecords() {
    if (!selectedClientId) return;
    const list = await listProbationRecords(Number(selectedClientId));
    setProbationRecords(list || []);
  }

  function startEditProbation(record) {
    if (!isEditMode || !record) return;
    setProbationEditingRows((prev) => ({
      ...prev,
      [record.id]: {
        employee_name: record.employee_name || "",
        hire_date: record.hire_date || "",
        probation_months: String(record.probation_months || ""),
      },
    }));
  }

  function cancelEditProbation(recordId) {
    setProbationEditingRows((prev) => {
      const next = { ...prev };
      delete next[recordId];
      return next;
    });
  }

  function patchProbationEdit(recordId, patch) {
    setProbationEditingRows((prev) => ({
      ...prev,
      [recordId]: { ...(prev[recordId] || {}), ...patch },
    }));
  }

  async function handleCreateProbation(e) {
    e.preventDefault();
    if (!isEditMode || !selectedClientId) return;
    const employeeName = (probationDraft.employee_name || "").trim();
    const hireDate = probationDraft.hire_date || "";
    const probationMonths = Number(probationDraft.probation_months);
    if (!employeeName) {
      setErr("Employee name is required.");
      return;
    }
    if (!hireDate) {
      setErr("Date of hire is required.");
      return;
    }
    if (!Number.isFinite(probationMonths) || probationMonths < 1) {
      setErr("Probation period must be at least 1 month.");
      return;
    }
    try {
      await createProbationRecord({
        client_id: Number(selectedClientId),
        employee_name: employeeName,
        hire_date: hireDate,
        probation_months: probationMonths,
      });
      setProbationDraft({ employee_name: "", hire_date: "", probation_months: "3" });
      await refreshProbationRecords();
      showToast("Probation record added", "success");
    } catch (e) {
      const msg = String(e.message || e);
      setErr(msg);
      showToast(msg, "error");
    }
  }

  async function saveProbationRecord(record) {
    if (!isEditMode || !record) return;
    const draft = probationEditingRows[record.id];
    if (!draft) return;
    const employeeName = (draft.employee_name || "").trim();
    const hireDate = draft.hire_date || "";
    const probationMonths = Number(draft.probation_months);
    if (!employeeName) {
      setErr("Employee name cannot be empty.");
      return;
    }
    if (!hireDate) {
      setErr("Date of hire cannot be empty.");
      return;
    }
    if (!Number.isFinite(probationMonths) || probationMonths < 1) {
      setErr("Probation period must be at least 1 month.");
      return;
    }
    try {
      await updateProbationRecord(record.id, {
        employee_name: employeeName,
        hire_date: hireDate,
        probation_months: probationMonths,
      });
      await refreshProbationRecords();
      cancelEditProbation(record.id);
      showToast("Probation record updated", "success");
    } catch (e) {
      const msg = String(e.message || e);
      setErr(msg);
      showToast(msg, "error");
    }
  }

  async function handleDeleteProbation(record) {
    if (!isEditMode || !record) return;
    if (!confirm(`Delete probation record for "${record.employee_name}"?`)) return;
    try {
      await deleteProbationRecord(record.id);
      setProbationRecords((prev) => prev.filter((row) => row.id !== record.id));
      cancelEditProbation(record.id);
      showToast("Probation record deleted", "success");
    } catch (e) {
      const msg = String(e.message || e);
      setErr(msg);
      showToast(msg, "error");
    }
  }

  async function handleCreateClient(e) {
    e.preventDefault();
    if (!isEditMode) return;
    const name = (newClientName || "").trim();
    if (!name) return;
    try {
      const created = await createTaskClient(name);
      setNewClientName("");
      const list = await listTaskClients(selectedYear);
      setClients(list);
      setSelectedClientId(created.id);
      showToast("Client added", "success");
    } catch (e2) {
      const msg = String(e2.message || e2);
      setErr(msg);
      showToast(msg, "error");
    }
  }

  async function handleDeleteClientById(client) {
    if (!isEditMode || !client || !canManageClients) return;
    if (!confirm(`Delete client "${client.name}"?`)) return;
    try {
      await deleteTaskClient(client.id);
      const list = await listTaskClients(selectedYear);
      setClients(list);
      setSelectedClientId((prev) => {
        if (Number(prev) === Number(client.id)) return list.length ? list[0].id : null;
        return prev;
      });
      setTasks([]);
      showToast("Client deleted", "success");
    } catch (e) {
      const msg = String(e.message || e);
      setErr(msg);
      showToast(msg, "error");
    }
  }

  function addSubtaskRow() {
    setSubtaskRows((prev) => [...prev, emptySubtask()]);
  }

  function removeSubtaskRow(idx) {
    setSubtaskRows((prev) => (prev.length <= 1 ? prev : prev.filter((_, i) => i !== idx)));
  }

  function updateSubtaskRow(idx, patch) {
    setSubtaskRows((prev) => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  }

  async function handleCreateTask(e) {
    e.preventDefault();
    if (!isEditMode) return;
    const taskTitle = (newTaskTitle || "").trim();
    if (!taskTitle || !selectedClientId) {
      setErr("Task title is required.");
      return;
    }
    const cleanedSubtasks = subtaskRows
      .map((s) => ({
        subtask: (s.subtask || "").trim(),
        completion_date: s.completion_date || null,
      }))
      .filter((s) => s.subtask);
    if (!cleanedSubtasks.length) {
      setErr("At least one subtask is required.");
      return;
    }

    try {
      await createClientTask({
        client_id: Number(selectedClientId),
        year: Number(selectedYear),
        quarter: Number(selectedQuarter),
        task: taskTitle,
        subtasks: cleanedSubtasks,
      });
      setNewTaskTitle("");
      setSubtaskRows([emptySubtask()]);
      await refreshTasks();
      showToast("Task workplan added", "success");
    } catch (e2) {
      const msg = String(e2.message || e2);
      setErr(msg);
      showToast(msg, "error");
    }
  }

  async function handleToggleCompleted(row) {
    if (!isEditMode || !canEditRow(current, row)) return;
    try {
      const updated = await updateClientTask(row.id, { completed: !row.completed });
      setTasks((prev) => prev.map((r) => (r.id === row.id ? updated : r)));
    } catch (e) {
      const msg = String(e.message || e);
      setErr(msg);
      showToast(msg, "error");
    }
  }

  async function handleDeleteSubtask(row) {
    if (!isEditMode || !canEditRow(current, row)) return;
    if (!confirm(`Delete subtask "${row.subtask}"?`)) return;
    try {
      await deleteClientTask(row.id);
      setTasks((prev) => prev.filter((r) => r.id !== row.id));
      showToast("Subtask deleted", "success");
    } catch (e) {
      const msg = String(e.message || e);
      setErr(msg);
      showToast(msg, "error");
    }
  }

  function startEditRow(row) {
    if (!isEditMode || !canEditRow(current, row)) return;
    setEditingRows((prev) => ({
      ...prev,
      [row.id]: {
        task: row.task || "",
        subtask: row.subtask || "",
        completion_date: row.completion_date || "",
      },
    }));
  }

  function cancelEditRow(rowId) {
    setEditingRows((prev) => {
      const next = { ...prev };
      delete next[rowId];
      return next;
    });
  }

  function patchEditRow(rowId, patch) {
    setEditingRows((prev) => ({
      ...prev,
      [rowId]: { ...(prev[rowId] || {}), ...patch },
    }));
  }

  async function saveEditRow(row) {
    if (!isEditMode || !canEditRow(current, row)) return;
    const draft = editingRows[row.id];
    if (!draft) return;
    const payload = {
      task: (draft.task || "").trim(),
      subtask: (draft.subtask || "").trim(),
      completion_date: draft.completion_date || null,
    };
    if (!payload.task) {
      setErr("Task cannot be empty.");
      return;
    }
    if (!payload.subtask) {
      setErr("Subtask cannot be empty.");
      return;
    }
    try {
      await updateClientTask(row.id, payload);
      await refreshTasks();
      cancelEditRow(row.id);
      showToast("Task updated", "success");
    } catch (e) {
      const msg = String(e.message || e);
      setErr(msg);
      showToast(msg, "error");
    }
  }

  async function handleExportPdf() {
    try {
      const chosenClient = clients.find((c) => c.id === Number(selectedClientId));
      if (!chosenClient) {
        showToast("No client selected for export", "error");
        return;
      }

      const quarters = exportPeriodScope === "year" ? QUARTERS : [Number(selectedQuarter)];
      const requests = [];
      for (const quarter of quarters) {
        requests.push(
          listClientTasks({
            year: Number(selectedYear),
            clientId: Number(chosenClient.id),
            quarter: Number(quarter),
          }).then((rows) => ({ client: chosenClient, quarter, rows: rows || [] }))
        );
      }
      const chunks = await Promise.all(requests);
      const populatedChunks = chunks.filter((x) => Array.isArray(x.rows) && x.rows.length > 0);

      if (!populatedChunks.length) {
        showToast("No tasks found for chosen filters", "error");
        return;
      }

      const sectionsHtml = populatedChunks
        .map(({ client, quarter, rows }) => {
          const groups = new Map();
          for (const row of rows) {
            const key = row.task_group_id || `legacy_${row.id}`;
            if (!groups.has(key)) {
              groups.set(key, {
                task: row.task,
                owner: row.user?.name || `User #${row.user_id}`,
                subtasks: [],
              });
            }
            groups.get(key).subtasks.push({
              subtask: row.subtask || "",
              completion_date: row.completion_date || "",
              completed: !!row.completed,
            });
          }
          const grouped = Array.from(groups.values());
          const rowsHtml = grouped
            .map(
              (g) => `
              <tr>
                <td style="padding:8px;border-top:1px solid #e5e7eb;vertical-align:top;">${escapeHtml(g.owner)}</td>
                <td style="padding:8px;border-top:1px solid #e5e7eb;vertical-align:top;">
                  <div style="font-weight:700;margin-bottom:4px;">${escapeHtml(g.task)}</div>
                  <ul style="margin:0;padding-left:18px;">
                    ${g.subtasks
                      .map(
                        (s) => `<li style="margin:0 0 4px 0;">
                          ${escapeHtml(s.subtask)}${s.completion_date ? ` - <span style="color:#475569;">${escapeHtml(s.completion_date)}</span>` : ""}
                          <span style="margin-left:8px;color:${s.completed ? "#166534" : "#b45309"};font-weight:700;">
                            ${s.completed ? "Done" : "Pending"}
                          </span>
                        </li>`
                      )
                      .join("")}
                  </ul>
                </td>
              </tr>`
            )
            .join("");

          return `
            <section style="margin:0 0 16px 0;">
              <h3 style="margin:0 0 8px 0;font-size:14px;">
                ${escapeHtml(client.name)} - ${escapeHtml(String(selectedYear))} Q${escapeHtml(String(quarter))}
              </h3>
              <table style="width:100%;border-collapse:collapse;">
                <thead>
                  <tr style="background:#f8fafc;">
                    <th style="text-align:left;padding:8px;">Employee</th>
                    <th style="text-align:left;padding:8px;">Task & Subtasks</th>
                  </tr>
                </thead>
                <tbody>${rowsHtml}</tbody>
              </table>
            </section>`;
        })
        .join("");

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
            <title>Client Task Manager Export</title>
          </head>
          <body style="font-family:Arial,sans-serif;padding:20px;color:#111;">
            <h1 style="margin:0 0 8px 0;font-size:20px;">Client Task Manager Export</h1>
            <div style="margin:0 0 16px 0;font-size:12px;color:#555;">
              Year: ${escapeHtml(String(selectedYear))}<br/>
              Client: ${escapeHtml(chosenClient.name)}<br/>
              Period filter: ${escapeHtml(exportPeriodScope === "year" ? "Full year (Q1-Q4)" : `Quarter Q${selectedQuarter}`)}<br/>
              Exported on: ${escapeHtml(new Date().toLocaleString())}
            </div>
            ${sectionsHtml}
          </body>
        </html>
      `);
      popup.document.close();

      let printed = false;
      const triggerPrint = () => {
        if (printed || popup.closed) return;
        printed = true;
        popup.focus();
        setTimeout(() => {
          if (!popup.closed) popup.print();
        }, 150);
      };
      popup.onload = triggerPrint;
      setTimeout(triggerPrint, 400);
      showToast("Preparing PDF export...", "success");
    } catch (e) {
      const msg = String(e.message || e);
      setErr(msg);
      showToast(msg, "error");
    }
  }

  if (busy && !current) {
    return (
      <div className="page-wrap client-task-page">
        <div className="card">
          <LoadingState label="Loading task manager..." />
        </div>
      </div>
    );
  }

  return (
    <div className="page-wrap client-task-page">
      <div className="card" style={{ marginBottom: 12 }}>
        <div style={{ fontWeight: 900, fontSize: 18 }}>Client Task Manager</div>
        <div className="muted">
          Year -&gt; Client -&gt; Quarter -&gt; Probation Tracker. View Mode is read-only. Edit Mode unlocks create/edit/delete actions.
        </div>
      </div>

      <div className="card" style={{ marginBottom: 12 }}>
        <div style={{ fontWeight: 800, marginBottom: 8 }}>Mode</div>
        <div className="task-mode-toggle-wrap">
          <span className={`task-mode-label ${!isEditMode ? "active" : ""}`}>View</span>
          <button
            type="button"
            className={`task-mode-toggle ${isEditMode ? "is-edit" : ""}`}
            onClick={() => setMode((prev) => (prev === "edit" ? "view" : "edit"))}
            role="switch"
            aria-checked={isEditMode}
            aria-label={`Switch to ${isEditMode ? "view" : "edit"} mode`}
          >
            <span className="task-mode-toggle-knob" />
          </button>
          <span className={`task-mode-label ${isEditMode ? "active" : ""}`}>Edit</span>
        </div>
      </div>

      {err && <div className="error">{err}</div>}

      <div className="card" style={{ marginBottom: 12 }}>
        <div style={{ fontWeight: 800, marginBottom: 8 }}>1) Year</div>
        <div className="row">
          {years.map((y) => (
            <button
              key={y}
              className={`btn task-choice-btn ${Number(selectedYear) === Number(y) ? "task-choice-active" : ""}`}
              onClick={() => setSelectedYear(Number(y))}
            >
              {y}
            </button>
          ))}
        </div>
      </div>

      <div className="card" style={{ marginBottom: 12 }}>
        <div style={{ fontWeight: 800, marginBottom: 8 }}>2) Client</div>

        {isEditMode && (
          <form className="row" onSubmit={handleCreateClient} style={{ marginBottom: 10 }}>
            <div className="field" style={{ flex: "1 1 260px", marginBottom: 0 }}>
              <label>Add client</label>
              <input
                value={newClientName}
                onChange={(e) => setNewClientName(e.target.value)}
                placeholder="e.g., Titan Group"
              />
            </div>
            <div style={{ alignSelf: "end" }}>
              <button className="btn btn-primary" type="submit">Add Client</button>
            </div>
          </form>
        )}

        <div className="row">
          {clients.map((c) => (
            <div key={c.id} style={{ position: "relative", display: "inline-flex" }}>
              <button
                className={`btn task-choice-btn ${Number(selectedClientId) === c.id ? "task-choice-active" : ""}`}
                onClick={() => setSelectedClientId(c.id)}
                style={isEditMode && canManageClients ? { paddingRight: 28 } : undefined}
              >
                {c.name}
              </button>
              {isEditMode && canManageClients && (
                <button
                  type="button"
                  className="btn"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    handleDeleteClientById(c);
                  }}
                  title={`Delete ${c.name}`}
                  style={{
                    position: "absolute",
                    right: 4,
                    top: "50%",
                    transform: "translateY(-50%)",
                    minWidth: 20,
                    width: 20,
                    height: 20,
                    borderRadius: 999,
                    padding: 0,
                    lineHeight: 1,
                    fontWeight: 800,
                  }}
                >
                  x
                </button>
              )}
            </div>
          ))}
          {!clients.length && <div className="muted">No clients yet.</div>}
        </div>
      </div>

      <div className="card" style={{ marginBottom: 12 }}>
        <div style={{ fontWeight: 800, marginBottom: 8 }}>3) Quarter</div>
        <div className="row">
          {QUARTERS.map((q) => (
            <button
              key={q}
              className={`btn task-choice-btn ${Number(selectedQuarter) === q ? "task-choice-active" : ""}`}
              onClick={() => setSelectedQuarter(q)}
              disabled={!selectedClientId}
            >
              Q{q}
            </button>
          ))}
        </div>
      </div>

      <div className="card" style={{ marginBottom: 12 }}>
        <div style={{ fontWeight: 800, marginBottom: 8 }}>4) Probation Tracker</div>
        <div className="muted" style={{ marginBottom: 12 }}>
          Track new employees for {selectedClient?.name || "the selected client"} and watch the probation end date update automatically.
        </div>

        {isEditMode && (
          <form onSubmit={handleCreateProbation} style={{ marginBottom: 14 }}>
            <div className="row">
              <div className="field" style={{ flex: "1 1 240px", marginBottom: 0 }}>
                <label>Employee name</label>
                <input
                  value={probationDraft.employee_name}
                  onChange={(e) => setProbationDraft((prev) => ({ ...prev, employee_name: e.target.value }))}
                  placeholder="e.g., Jane Doe"
                  disabled={!selectedClientId}
                />
              </div>
              <div className="field" style={{ flex: "1 1 180px", marginBottom: 0 }}>
                <label>Date of hire</label>
                <input
                  type="date"
                  value={probationDraft.hire_date}
                  onChange={(e) => setProbationDraft((prev) => ({ ...prev, hire_date: e.target.value }))}
                  disabled={!selectedClientId}
                />
              </div>
              <div className="field" style={{ flex: "1 1 180px", marginBottom: 0 }}>
                <label>Probation period (months)</label>
                <input
                  type="number"
                  min="1"
                  max="60"
                  value={probationDraft.probation_months}
                  onChange={(e) => setProbationDraft((prev) => ({ ...prev, probation_months: e.target.value }))}
                  placeholder="3"
                  disabled={!selectedClientId}
                />
              </div>
              <div className="field" style={{ flex: "1 1 200px", marginBottom: 0 }}>
                <label>End of probation</label>
                <input value={probationDraftEndDate} readOnly placeholder="Auto-calculated" />
              </div>
            </div>
            <div style={{ marginTop: 8 }}>
              <button className="btn btn-primary" type="submit" disabled={!selectedClientId}>
                Save Probation Record
              </button>
            </div>
          </form>
        )}

        {!selectedClientId ? (
          <div className="muted">Select a client to view and add probation records.</div>
        ) : probationBusy ? (
          <LoadingState label="Loading probation tracker..." compact />
        ) : !probationRecords.length ? (
          <div className="muted">No probation records yet for this client.</div>
        ) : (
          <div style={{ display: "grid", gap: 10 }}>
            {probationRecords.map((record) => {
              const draft = probationEditingRows[record.id];
              const isEditing = isEditMode && !!draft;
              const editableEndDate = isEditing
                ? addMonthsToDateInput(draft.hire_date, Number(draft.probation_months || 0))
                : record.probation_end_date;
              return (
                <div key={record.id} className="card" style={{ padding: 12, borderRadius: 14 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start" }}>
                    <div style={{ minWidth: 0, flex: "1 1 auto" }}>
                      {isEditing ? (
                        <div className="field" style={{ marginBottom: 0 }}>
                          <label>Employee name</label>
                          <input
                            value={draft.employee_name}
                            onChange={(e) => patchProbationEdit(record.id, { employee_name: e.target.value })}
                          />
                        </div>
                      ) : (
                        <div style={{ fontWeight: 800, fontSize: 15 }}>{record.employee_name}</div>
                      )}
                      <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                        {record.client_name}
                      </div>
                    </div>
                    <span className={`dashboard-status-badge ${probationReminderClass(record.days_until_end)}`}>
                      {probationReminderLabel(record.days_until_end)}
                    </span>
                  </div>

                  <div className="row" style={{ marginTop: 10 }}>
                    <div className="field" style={{ flex: "1 1 170px", marginBottom: 0 }}>
                      <label>Date of hire</label>
                      {isEditing ? (
                        <input
                          type="date"
                          value={draft.hire_date}
                          onChange={(e) => patchProbationEdit(record.id, { hire_date: e.target.value })}
                        />
                      ) : (
                        <input value={formatDateInputValue(record.hire_date)} readOnly />
                      )}
                    </div>
                    <div className="field" style={{ flex: "1 1 170px", marginBottom: 0 }}>
                      <label>Probation period (months)</label>
                      {isEditing ? (
                        <input
                          type="number"
                          min="1"
                          max="60"
                          value={draft.probation_months}
                          onChange={(e) => patchProbationEdit(record.id, { probation_months: e.target.value })}
                        />
                      ) : (
                        <input value={String(record.probation_months)} readOnly />
                      )}
                    </div>
                    <div className="field" style={{ flex: "1 1 200px", marginBottom: 0 }}>
                      <label>End of probation</label>
                      <input value={formatDateInputValue(editableEndDate)} readOnly />
                    </div>
                  </div>

                  <div style={{ marginTop: 10, display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
                    <div className="helper">This date is calculated automatically from the hire date and probation period.</div>
                    {isEditMode && (
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        {isEditing ? (
                          <>
                            <button type="button" className="btn btn-primary" onClick={() => saveProbationRecord(record)}>
                              Save
                            </button>
                            <button type="button" className="btn" onClick={() => cancelEditProbation(record.id)}>
                              Cancel
                            </button>
                          </>
                        ) : (
                          <button type="button" className="btn" onClick={() => startEditProbation(record)}>
                            Edit
                          </button>
                        )}
                        <button type="button" className="btn btn-danger" onClick={() => handleDeleteProbation(record)}>
                          Delete
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="card" style={{ marginBottom: 12 }}>
        <div style={{ fontWeight: 800, marginBottom: 8 }}>5) Export PDF</div>
        <div className="row">
          <div className="field" style={{ flex: "1 1 220px", marginBottom: 0 }}>
            <label>Period filter</label>
            <select value={exportPeriodScope} onChange={(e) => setExportPeriodScope(e.target.value)}>
              <option value="quarter">{`Selected quarter (Q${selectedQuarter})`}</option>
              <option value="year">Full year (Q1-Q4)</option>
            </select>
          </div>
          <div style={{ alignSelf: "end" }}>
            <button type="button" className="btn btn-primary" onClick={handleExportPdf} disabled={!selectedClientId}>
              Export PDF
            </button>
          </div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 12 }}>
        <div style={{ fontWeight: 800, marginBottom: 8 }}>
          6) Workplan {selectedClient ? `- ${selectedClient.name}` : ""}
        </div>

        {isEditMode && (
          <form onSubmit={handleCreateTask} style={{ marginBottom: 14 }}>
            <div className="field">
              <label>Main task</label>
              <input
                value={newTaskTitle}
                onChange={(e) => setNewTaskTitle(e.target.value)}
                placeholder="e.g., Quarterly compliance review"
                disabled={!selectedClientId}
              />
            </div>

            <div style={{ fontWeight: 700, marginBottom: 6 }}>Subtasks</div>
            {subtaskRows.map((row, idx) => (
              <div key={idx} className="row" style={{ marginBottom: 6 }}>
                <div className="field" style={{ flex: "1 1 320px", marginBottom: 0 }}>
                  <label>{`Subtask ${idx + 1}`}</label>
                  <input
                    value={row.subtask}
                    onChange={(e) => updateSubtaskRow(idx, { subtask: e.target.value })}
                    placeholder="Subtask description"
                    disabled={!selectedClientId}
                  />
                </div>
                <div className="field" style={{ flex: "1 1 180px", marginBottom: 0 }}>
                  <label>Completion date</label>
                  <input
                    type="date"
                    value={row.completion_date}
                    onChange={(e) => updateSubtaskRow(idx, { completion_date: e.target.value })}
                    disabled={!selectedClientId}
                  />
                </div>
                <div style={{ alignSelf: "end", display: "flex", gap: 8 }}>
                  <button type="button" className="btn" onClick={addSubtaskRow} disabled={!selectedClientId}>
                    + Subtask
                  </button>
                  <button type="button" className="btn btn-danger" onClick={() => removeSubtaskRow(idx)} disabled={!selectedClientId || subtaskRows.length <= 1}>
                    Remove
                  </button>
                </div>
              </div>
            ))}

            <div style={{ marginTop: 8 }}>
              <button className="btn btn-primary" type="submit" disabled={!selectedClientId}>
                Save Task Workplan
              </button>
            </div>
          </form>
        )}

        <div style={{ width: "100%", overflowX: "auto" }}>
          <table className="table" style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "#f8fafc" }}>
                <th style={{ textAlign: "left", padding: 10 }}>Employee</th>
                <th style={{ textAlign: "left", padding: 10 }}>Task</th>
                <th style={{ textAlign: "left", padding: 10 }}>Subtask</th>
                <th style={{ textAlign: "left", padding: 10 }}>Completion Date</th>
                <th style={{ textAlign: "left", padding: 10 }}>Completed</th>
                {isEditMode && <th style={{ textAlign: "left", padding: 10 }}>Actions</th>}
              </tr>
            </thead>
            <tbody>
              {groupedTasks.map((group) =>
                group.rows.map((row, rowIdx) => {
                  const draft = editingRows[row.id];
                  const isEditing = isEditMode && !!draft;
                  const canEditThisRow = canEditRow(current, row);
                  return (
                    <tr key={row.id} style={{ borderTop: "1px solid #eef2f7" }}>
                      {rowIdx === 0 && (
                        <td style={{ padding: 10, verticalAlign: "top" }} rowSpan={group.rows.length}>
                          {group.owner}
                        </td>
                      )}
                      {rowIdx === 0 && (
                        <td style={{ padding: 10, verticalAlign: "top" }} rowSpan={group.rows.length}>
                          {isEditing ? (
                            <input
                              value={draft.task}
                              onChange={(e) => patchEditRow(row.id, { task: e.target.value })}
                              style={{ width: "100%" }}
                            />
                          ) : (
                            <span style={{ fontWeight: 700 }}>{row.task}</span>
                          )}
                        </td>
                      )}
                      <td style={{ padding: 10 }}>
                        {isEditing ? (
                          <input
                            value={draft.subtask}
                            onChange={(e) => patchEditRow(row.id, { subtask: e.target.value })}
                            style={{ width: "100%" }}
                          />
                        ) : (
                          row.subtask
                        )}
                      </td>
                      <td style={{ padding: 10 }}>
                        {isEditing ? (
                          <input
                            type="date"
                            value={draft.completion_date}
                            onChange={(e) => patchEditRow(row.id, { completion_date: e.target.value })}
                          />
                        ) : (
                          row.completion_date || "-"
                        )}
                      </td>
                      <td style={{ padding: 10 }}>
                        <label style={{ display: "inline-flex", alignItems: "center", gap: 8, fontWeight: 600 }}>
                          <input
                            type="checkbox"
                            checked={!!row.completed}
                            onChange={() => handleToggleCompleted(row)}
                            disabled={!isEditMode || !canEditThisRow}
                          />
                          {row.completed ? "Done" : "Pending"}
                        </label>
                      </td>
                      {isEditMode && (
                        <td style={{ padding: 10 }}>
                          {isEditing ? (
                            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                              <button className="btn btn-primary" type="button" onClick={() => saveEditRow(row)}>
                                Save
                              </button>
                              <button className="btn" type="button" onClick={() => cancelEditRow(row.id)}>
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                              <button className="btn" type="button" onClick={() => startEditRow(row)} disabled={!canEditThisRow}>
                                Edit
                              </button>
                              <button className="btn btn-danger" type="button" onClick={() => handleDeleteSubtask(row)} disabled={!canEditThisRow}>
                                Delete
                              </button>
                            </div>
                          )}
                        </td>
                      )}
                    </tr>
                  );
                })
              )}
              {!groupedTasks.length && (
                <tr>
                  <td colSpan={isEditMode ? 6 : 5} style={{ padding: 14 }} className="muted">
                    {busy ? "Loading..." : "No tasks for this year/client/quarter yet."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
