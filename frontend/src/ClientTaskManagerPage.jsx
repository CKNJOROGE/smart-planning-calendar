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
} from "./api";
import { useToast } from "./ToastProvider";
import LoadingState from "./LoadingState";

const QUARTERS = [1, 2, 3, 4];

function emptySubtask() {
  return { subtask: "", completion_date: "" };
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

  const [newClientName, setNewClientName] = useState("");
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [subtaskRows, setSubtaskRows] = useState([emptySubtask()]);
  const [editingRows, setEditingRows] = useState({});

  const selectedClient = useMemo(
    () => clients.find((c) => c.id === Number(selectedClientId)) || null,
    [clients, selectedClientId]
  );
  const canManageClients = ["admin", "ceo"].includes(String(current?.role || "").toLowerCase());

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

  async function handleCreateClient(e) {
    e.preventDefault();
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

  async function handleDeleteClient() {
    if (!selectedClient) return;
    if (!confirm(`Delete client "${selectedClient.name}"?`)) return;
    try {
      await deleteTaskClient(selectedClient.id);
      const list = await listTaskClients(selectedYear);
      setClients(list);
      setSelectedClientId(list.length ? list[0].id : null);
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
      const list = await listClientTasks({
        year: selectedYear,
        clientId: Number(selectedClientId),
        quarter: selectedQuarter,
      });
      setTasks(list);
      showToast("Task workplan added", "success");
    } catch (e2) {
      const msg = String(e2.message || e2);
      setErr(msg);
      showToast(msg, "error");
    }
  }

  async function handleToggleCompleted(row) {
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
      const list = await listClientTasks({
        year: selectedYear,
        clientId: Number(selectedClientId),
        quarter: selectedQuarter,
      });
      setTasks(list);
      cancelEditRow(row.id);
      showToast("Task updated", "success");
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
          Year → Client → Quarter. Create one task with multiple subtasks and track each completion.
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

        <div className="row">
          {clients.map((c) => (
            <button
              key={c.id}
              className={`btn task-choice-btn ${Number(selectedClientId) === c.id ? "task-choice-active" : ""}`}
              onClick={() => setSelectedClientId(c.id)}
            >
              {c.name}
            </button>
          ))}
          {!clients.length && <div className="muted">No clients yet. Add one above.</div>}
        </div>
        <div style={{ marginTop: 10 }}>
          <button
            type="button"
            className="btn btn-danger"
            onClick={handleDeleteClient}
            disabled={!selectedClient || !canManageClients}
            title={canManageClients ? "Delete selected client" : "Only admin/ceo can delete clients"}
          >
            Delete Selected Client
          </button>
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
        <div style={{ fontWeight: 800, marginBottom: 8 }}>
          4) Workplan {selectedClient ? `- ${selectedClient.name}` : ""}
        </div>

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

        <div style={{ width: "100%", overflowX: "auto" }}>
          <table className="table" style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "#f8fafc" }}>
                <th style={{ textAlign: "left", padding: 10 }}>Employee</th>
                <th style={{ textAlign: "left", padding: 10 }}>Task</th>
                <th style={{ textAlign: "left", padding: 10 }}>Subtask</th>
                <th style={{ textAlign: "left", padding: 10 }}>Completion Date</th>
                <th style={{ textAlign: "left", padding: 10 }}>Completed</th>
                <th style={{ textAlign: "left", padding: 10 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {groupedTasks.map((group) =>
                group.rows.map((row) => {
                  const draft = editingRows[row.id];
                  const isEditing = !!draft;
                  return (
                  <tr key={row.id} style={{ borderTop: "1px solid #eef2f7" }}>
                    <td style={{ padding: 10 }}>{group.owner}</td>
                    <td style={{ padding: 10 }}>
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
                        />
                        {row.completed ? "Done" : "Pending"}
                      </label>
                    </td>
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
                          <button
                            className="btn"
                            type="button"
                            onClick={() => startEditRow(row)}
                            disabled={
                              !current
                              || !(
                                current.role === "admin"
                                || current.role === "ceo"
                                || current.role === "supervisor"
                                || Number(current.id) === Number(row.user_id)
                              )
                            }
                          >
                            Edit
                          </button>
                          <button
                            className="btn btn-danger"
                            onClick={() => handleDeleteSubtask(row)}
                            disabled={
                              !current
                              || !(
                                current.role === "admin"
                                || current.role === "ceo"
                                || current.role === "supervisor"
                                || Number(current.id) === Number(row.user_id)
                              )
                            }
                            title="Owner/admin/supervisor can delete"
                          >
                            Delete
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
                })
              )}
              {!groupedTasks.length && (
                <tr>
                  <td colSpan={6} style={{ padding: 14 }} className="muted">
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
