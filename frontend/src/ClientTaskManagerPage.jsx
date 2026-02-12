import React, { useEffect, useMemo, useState } from "react";
import {
  me,
  listTaskYears,
  listTaskClients,
  createTaskClient,
  listClientTasks,
  createClientTask,
  updateClientTask,
  deleteClientTask,
} from "./api";
import { useToast } from "./ToastProvider";

const QUARTERS = [1, 2, 3, 4];

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
  const [newTask, setNewTask] = useState({ task: "", subtask: "", completion_date: "" });

  const selectedClient = useMemo(
    () => clients.find((c) => c.id === Number(selectedClientId)) || null,
    [clients, selectedClientId]
  );

  useEffect(() => {
    (async () => {
      setBusy(true);
      setErr("");
      try {
        const u = await me();
        setCurrent(u);
        const ys = await listTaskYears();
        const normalizedYears = Array.isArray(ys) && ys.length ? ys : [new Date().getFullYear()];
        setYears(normalizedYears);
        if (!normalizedYears.includes(selectedYear)) {
          setSelectedYear(normalizedYears[0]);
        }
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

  async function handleCreateTask(e) {
    e.preventDefault();
    const taskText = (newTask.task || "").trim();
    const subtaskText = (newTask.subtask || "").trim();
    if (!taskText || !subtaskText || !selectedClientId) {
      setErr("Task and subtask are required.");
      return;
    }
    try {
      await createClientTask({
        client_id: Number(selectedClientId),
        year: Number(selectedYear),
        quarter: Number(selectedQuarter),
        task: taskText,
        subtask: subtaskText,
        completion_date: newTask.completion_date || null,
      });
      setNewTask({ task: "", subtask: "", completion_date: "" });
      const list = await listClientTasks({
        year: selectedYear,
        clientId: Number(selectedClientId),
        quarter: selectedQuarter,
      });
      setTasks(list);
      showToast("Task added", "success");
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

  async function handleDeleteTask(row) {
    if (!confirm(`Delete task "${row.task}"?`)) return;
    try {
      await deleteClientTask(row.id);
      setTasks((prev) => prev.filter((r) => r.id !== row.id));
      showToast("Task deleted", "success");
    } catch (e) {
      const msg = String(e.message || e);
      setErr(msg);
      showToast(msg, "error");
    }
  }

  return (
    <div className="page-wrap">
      <div className="card" style={{ marginBottom: 12 }}>
        <div style={{ fontWeight: 900, fontSize: 18 }}>Client Task Manager</div>
        <div className="muted">
          Track quarterly client tasks. Everyone can view tasks across employees.
        </div>
        {current && (
          <div className="muted" style={{ marginTop: 6, fontSize: 12 }}>
            Signed in as {current.name} ({current.role})
          </div>
        )}
      </div>

      {err && <div className="error">{err}</div>}

      <div className="card" style={{ marginBottom: 12 }}>
        <div style={{ fontWeight: 800, marginBottom: 8 }}>1) Year</div>
        <div className="row">
          {years.map((y) => (
            <button
              key={y}
              className={`btn ${Number(selectedYear) === Number(y) ? "btn-primary" : ""}`}
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
              className={`btn ${Number(selectedClientId) === c.id ? "btn-primary" : ""}`}
              onClick={() => setSelectedClientId(c.id)}
            >
              {c.name}
            </button>
          ))}
          {!clients.length && <div className="muted">No clients yet. Add one above.</div>}
        </div>
      </div>

      <div className="card" style={{ marginBottom: 12 }}>
        <div style={{ fontWeight: 800, marginBottom: 8 }}>3) Quarter</div>
        <div className="row">
          {QUARTERS.map((q) => (
            <button
              key={q}
              className={`btn ${Number(selectedQuarter) === q ? "btn-primary" : ""}`}
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

        <form onSubmit={handleCreateTask} style={{ marginBottom: 12 }}>
          <div className="row">
            <div className="field" style={{ flex: "1 1 220px" }}>
              <label>Task</label>
              <input
                value={newTask.task}
                onChange={(e) => setNewTask((s) => ({ ...s, task: e.target.value }))}
                placeholder="Task title"
                disabled={!selectedClientId}
              />
            </div>
            <div className="field" style={{ flex: "1 1 260px" }}>
              <label>Subtask</label>
              <input
                value={newTask.subtask}
                onChange={(e) => setNewTask((s) => ({ ...s, subtask: e.target.value }))}
                placeholder="Subtask details"
                disabled={!selectedClientId}
              />
            </div>
            <div className="field" style={{ flex: "1 1 180px" }}>
              <label>Completion date</label>
              <input
                type="date"
                value={newTask.completion_date}
                onChange={(e) => setNewTask((s) => ({ ...s, completion_date: e.target.value }))}
                disabled={!selectedClientId}
              />
            </div>
            <div style={{ alignSelf: "end" }}>
              <button className="btn btn-primary" type="submit" disabled={!selectedClientId}>
                Add Row
              </button>
            </div>
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
              {tasks.map((row) => (
                <tr key={row.id} style={{ borderTop: "1px solid #eef2f7" }}>
                  <td style={{ padding: 10 }}>{row.user?.name || `User #${row.user_id}`}</td>
                  <td style={{ padding: 10 }}>{row.task}</td>
                  <td style={{ padding: 10 }}>{row.subtask}</td>
                  <td style={{ padding: 10 }}>{row.completion_date || "-"}</td>
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
                    <button
                      className="btn btn-danger"
                      onClick={() => handleDeleteTask(row)}
                      disabled={
                        !current
                        || !(
                          current.role === "admin"
                          || current.role === "supervisor"
                          || Number(current.id) === Number(row.user_id)
                        )
                      }
                      title="Owner/admin/supervisor can delete"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
              {!tasks.length && (
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
