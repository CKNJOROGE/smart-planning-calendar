import React, { useEffect, useMemo, useState } from "react";
import {
  me,
  listPerformanceUsers,
  listCompanyGoals,
  createCompanyGoal,
  updateCompanyGoal,
  listDepartmentGoals,
  createDepartmentGoal,
  updateDepartmentGoal,
  listEmployeeGoals,
  createEmployeeGoal,
  updateEmployeeGoal,
} from "./api";
import { useToast } from "./ToastProvider";

const STATUS_OPTIONS = ["active", "on_track", "at_risk", "completed", "paused", "cancelled"];

function statusLabel(v) {
  return String(v || "").replaceAll("_", " ");
}

function trimOrNull(v) {
  const s = String(v || "").trim();
  return s ? s : null;
}

export default function PerformanceManagementPage() {
  const { showToast } = useToast();
  const [current, setCurrent] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const [users, setUsers] = useState([]);
  const [companyGoals, setCompanyGoals] = useState([]);
  const [departmentGoals, setDepartmentGoals] = useState([]);
  const [employeeGoals, setEmployeeGoals] = useState([]);

  const [editingCompanyId, setEditingCompanyId] = useState(null);
  const [editingDepartmentId, setEditingDepartmentId] = useState(null);
  const [editingEmployeeId, setEditingEmployeeId] = useState(null);

  const [companyForm, setCompanyForm] = useState({
    title: "",
    description: "",
    period_start: "",
    period_end: "",
    status: "active",
  });
  const [departmentForm, setDepartmentForm] = useState({
    company_goal_id: "",
    department: "",
    title: "",
    description: "",
    period_start: "",
    period_end: "",
    status: "active",
  });
  const [employeeForm, setEmployeeForm] = useState({
    department_goal_id: "",
    user_id: "",
    title: "",
    description: "",
    progress_percent: "0",
    status: "active",
    self_comment: "",
    manager_comment: "",
  });

  const canManageCompany = useMemo(() => ["admin", "ceo"].includes((current?.role || "").toLowerCase()), [current?.role]);
  const canManageDepartment = useMemo(() => ["supervisor", "admin", "ceo"].includes((current?.role || "").toLowerCase()), [current?.role]);
  const canManageEmployee = canManageDepartment;

  async function loadData() {
    setBusy(true);
    setErr("");
    try {
      const meData = await me();
      setCurrent(meData);
      const [perfUsers, cGoals, dGoals, eGoals] = await Promise.all([
        listPerformanceUsers(),
        listCompanyGoals(),
        listDepartmentGoals(),
        listEmployeeGoals(),
      ]);
      setUsers(perfUsers || []);
      setCompanyGoals(cGoals || []);
      setDepartmentGoals(dGoals || []);
      setEmployeeGoals(eGoals || []);
      if ((meData.role || "").toLowerCase() === "supervisor") {
        setDepartmentForm((f) => ({ ...f, department: meData.department || "" }));
      }
    } catch (e) {
      setErr(String(e.message || e));
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  async function submitCompanyGoal() {
    setErr("");
    if (!canManageCompany) return;
    if (!companyForm.title.trim()) {
      setErr("Company goal title is required.");
      return;
    }
    const payload = {
      title: companyForm.title.trim(),
      description: trimOrNull(companyForm.description),
      period_start: companyForm.period_start || null,
      period_end: companyForm.period_end || null,
      status: companyForm.status,
    };
    try {
      if (editingCompanyId) {
        await updateCompanyGoal(editingCompanyId, payload);
        showToast("Company goal updated", "success");
      } else {
        await createCompanyGoal(payload);
        showToast("Company goal created", "success");
      }
      setEditingCompanyId(null);
      setCompanyForm({ title: "", description: "", period_start: "", period_end: "", status: "active" });
      await loadData();
    } catch (e) {
      const msg = String(e.message || e);
      setErr(msg);
      showToast(msg, "error");
    }
  }

  function editCompany(goal) {
    setEditingCompanyId(goal.id);
    setCompanyForm({
      title: goal.title || "",
      description: goal.description || "",
      period_start: goal.period_start || "",
      period_end: goal.period_end || "",
      status: goal.status || "active",
    });
  }

  async function submitDepartmentGoal() {
    setErr("");
    if (!canManageDepartment) return;
    if (!departmentForm.company_goal_id) {
      setErr("Select a company goal first.");
      return;
    }
    if (!departmentForm.department.trim()) {
      setErr("Department is required.");
      return;
    }
    if (!departmentForm.title.trim()) {
      setErr("Department goal title is required.");
      return;
    }
    const payload = {
      company_goal_id: Number(departmentForm.company_goal_id),
      department: departmentForm.department.trim(),
      title: departmentForm.title.trim(),
      description: trimOrNull(departmentForm.description),
      period_start: departmentForm.period_start || null,
      period_end: departmentForm.period_end || null,
      status: departmentForm.status,
    };
    try {
      if (editingDepartmentId) {
        await updateDepartmentGoal(editingDepartmentId, payload);
        showToast("Department goal updated", "success");
      } else {
        await createDepartmentGoal(payload);
        showToast("Department goal created", "success");
      }
      setEditingDepartmentId(null);
      setDepartmentForm(() => ({
        company_goal_id: "",
        department: (current?.role || "").toLowerCase() === "supervisor" ? (current?.department || "") : "",
        title: "",
        description: "",
        period_start: "",
        period_end: "",
        status: "active",
      }));
      await loadData();
    } catch (e) {
      const msg = String(e.message || e);
      setErr(msg);
      showToast(msg, "error");
    }
  }

  function editDepartment(goal) {
    setEditingDepartmentId(goal.id);
    setDepartmentForm({
      company_goal_id: String(goal.company_goal_id || ""),
      department: goal.department || "",
      title: goal.title || "",
      description: goal.description || "",
      period_start: goal.period_start || "",
      period_end: goal.period_end || "",
      status: goal.status || "active",
    });
  }

  async function submitEmployeeGoal() {
    setErr("");
    if (!canManageEmployee) return;
    if (!employeeForm.department_goal_id || !employeeForm.user_id) {
      setErr("Select both department goal and employee.");
      return;
    }
    if (!employeeForm.title.trim()) {
      setErr("Employee goal title is required.");
      return;
    }
    const progress = Number(employeeForm.progress_percent || 0);
    if (!Number.isFinite(progress) || progress < 0 || progress > 100) {
      setErr("Progress must be between 0 and 100.");
      return;
    }
    const payload = {
      department_goal_id: Number(employeeForm.department_goal_id),
      user_id: Number(employeeForm.user_id),
      title: employeeForm.title.trim(),
      description: trimOrNull(employeeForm.description),
      progress_percent: progress,
      status: employeeForm.status,
      self_comment: trimOrNull(employeeForm.self_comment),
      manager_comment: trimOrNull(employeeForm.manager_comment),
    };
    try {
      if (editingEmployeeId) {
        await updateEmployeeGoal(editingEmployeeId, payload);
        showToast("Employee goal updated", "success");
      } else {
        await createEmployeeGoal(payload);
        showToast("Employee goal created", "success");
      }
      setEditingEmployeeId(null);
      setEmployeeForm({
        department_goal_id: "",
        user_id: "",
        title: "",
        description: "",
        progress_percent: "0",
        status: "active",
        self_comment: "",
        manager_comment: "",
      });
      await loadData();
    } catch (e) {
      const msg = String(e.message || e);
      setErr(msg);
      showToast(msg, "error");
    }
  }

  function editEmployee(goal) {
    setEditingEmployeeId(goal.id);
    setEmployeeForm({
      department_goal_id: String(goal.department_goal_id || ""),
      user_id: String(goal.user_id || ""),
      title: goal.title || "",
      description: goal.description || "",
      progress_percent: String(goal.progress_percent ?? 0),
      status: goal.status || "active",
      self_comment: goal.self_comment || "",
      manager_comment: goal.manager_comment || "",
    });
  }

  async function updateMyProgress(goal) {
    const progress = prompt("Progress % (0-100)", String(goal.progress_percent ?? 0));
    if (progress == null) return;
    const progressNum = Number(progress);
    if (!Number.isFinite(progressNum) || progressNum < 0 || progressNum > 100) {
      setErr("Progress must be between 0 and 100.");
      return;
    }
    const status = prompt(`Status (${STATUS_OPTIONS.join(", ")})`, String(goal.status || "active")) || goal.status;
    const selfComment = prompt("Self comment (optional)", String(goal.self_comment || "")) ?? goal.self_comment;
    try {
      await updateEmployeeGoal(goal.id, {
        progress_percent: progressNum,
        status,
        self_comment: selfComment,
      });
      showToast("Progress updated", "success");
      await loadData();
    } catch (e) {
      const msg = String(e.message || e);
      setErr(msg);
      showToast(msg, "error");
    }
  }

  return (
    <div className="page-wrap">
      <div className="card" style={{ marginBottom: 12 }}>
        <div style={{ fontWeight: 900, fontSize: 18 }}>Performance Management</div>
        <div className="muted">
          Company goals drive department goals, and department goals drive individual employee goals.
        </div>
      </div>

      {err && <div className="error">{err}</div>}

      <div className="card" style={{ marginBottom: 12 }}>
        <div style={{ fontWeight: 900, marginBottom: 8 }}>1. Company Goals</div>
        {canManageCompany ? (
          <>
            <div className="field">
              <label>Title</label>
              <input value={companyForm.title} onChange={(e) => setCompanyForm((f) => ({ ...f, title: e.target.value }))} />
            </div>
            <div className="field">
              <label>Description</label>
              <textarea value={companyForm.description} onChange={(e) => setCompanyForm((f) => ({ ...f, description: e.target.value }))} />
            </div>
            <div className="row">
              <div className="field" style={{ flex: "1 1 180px" }}>
                <label>Start Date</label>
                <input type="date" value={companyForm.period_start} onChange={(e) => setCompanyForm((f) => ({ ...f, period_start: e.target.value }))} />
              </div>
              <div className="field" style={{ flex: "1 1 180px" }}>
                <label>End Date</label>
                <input type="date" value={companyForm.period_end} onChange={(e) => setCompanyForm((f) => ({ ...f, period_end: e.target.value }))} />
              </div>
              <div className="field" style={{ flex: "1 1 180px" }}>
                <label>Status</label>
                <select value={companyForm.status} onChange={(e) => setCompanyForm((f) => ({ ...f, status: e.target.value }))}>
                  {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{statusLabel(s)}</option>)}
                </select>
              </div>
            </div>
            <button className="btn btn-primary" type="button" onClick={submitCompanyGoal}>
              {editingCompanyId ? "Update Company Goal" : "Create Company Goal"}
            </button>
          </>
        ) : (
          <div className="muted" style={{ marginBottom: 8 }}>Only Admin/CEO can create or edit company goals.</div>
        )}
        <div style={{ width: "100%", overflowX: "auto", marginTop: 10 }}>
          <table className="table" style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "#f8fafc" }}>
                <th style={{ textAlign: "left", padding: 10 }}>Title</th>
                <th style={{ textAlign: "left", padding: 10 }}>Period</th>
                <th style={{ textAlign: "left", padding: 10 }}>Status</th>
                <th style={{ textAlign: "left", padding: 10 }}>Owner</th>
                <th style={{ textAlign: "left", padding: 10 }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {companyGoals.map((g) => (
                <tr key={`cg_${g.id}`} style={{ borderTop: "1px solid #eef2f7" }}>
                  <td style={{ padding: 10 }}>
                    <div style={{ fontWeight: 700 }}>{g.title}</div>
                    {g.description && <div className="muted" style={{ fontSize: 12 }}>{g.description}</div>}
                  </td>
                  <td style={{ padding: 10 }}>{g.period_start || "-"} to {g.period_end || "-"}</td>
                  <td style={{ padding: 10 }}>{statusLabel(g.status)}</td>
                  <td style={{ padding: 10 }}>{g.created_by?.name || "-"}</td>
                  <td style={{ padding: 10 }}>{canManageCompany ? <button className="btn" type="button" onClick={() => editCompany(g)}>Edit</button> : "-"}</td>
                </tr>
              ))}
              {!companyGoals.length && <tr><td colSpan={5} style={{ padding: 14 }} className="muted">No company goals yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 12 }}>
        <div style={{ fontWeight: 900, marginBottom: 8 }}>2. Department Goals</div>
        {canManageDepartment ? (
          <>
            <div className="row">
              <div className="field" style={{ flex: "1 1 260px" }}>
                <label>Parent Company Goal</label>
                <select value={departmentForm.company_goal_id} onChange={(e) => setDepartmentForm((f) => ({ ...f, company_goal_id: e.target.value }))}>
                  <option value="">Select company goal</option>
                  {companyGoals.map((g) => <option key={`cg_sel_${g.id}`} value={g.id}>{g.title}</option>)}
                </select>
              </div>
              <div className="field" style={{ flex: "1 1 220px" }}>
                <label>Department</label>
                <input
                  value={departmentForm.department}
                  onChange={(e) => setDepartmentForm((f) => ({ ...f, department: e.target.value }))}
                  disabled={(current?.role || "").toLowerCase() === "supervisor"}
                />
              </div>
            </div>
            <div className="field">
              <label>Title</label>
              <input value={departmentForm.title} onChange={(e) => setDepartmentForm((f) => ({ ...f, title: e.target.value }))} />
            </div>
            <div className="field">
              <label>Description</label>
              <textarea value={departmentForm.description} onChange={(e) => setDepartmentForm((f) => ({ ...f, description: e.target.value }))} />
            </div>
            <div className="row">
              <div className="field" style={{ flex: "1 1 180px" }}>
                <label>Start Date</label>
                <input type="date" value={departmentForm.period_start} onChange={(e) => setDepartmentForm((f) => ({ ...f, period_start: e.target.value }))} />
              </div>
              <div className="field" style={{ flex: "1 1 180px" }}>
                <label>End Date</label>
                <input type="date" value={departmentForm.period_end} onChange={(e) => setDepartmentForm((f) => ({ ...f, period_end: e.target.value }))} />
              </div>
              <div className="field" style={{ flex: "1 1 180px" }}>
                <label>Status</label>
                <select value={departmentForm.status} onChange={(e) => setDepartmentForm((f) => ({ ...f, status: e.target.value }))}>
                  {STATUS_OPTIONS.map((s) => <option key={`d_${s}`} value={s}>{statusLabel(s)}</option>)}
                </select>
              </div>
            </div>
            <button className="btn btn-primary" type="button" onClick={submitDepartmentGoal}>
              {editingDepartmentId ? "Update Department Goal" : "Create Department Goal"}
            </button>
          </>
        ) : (
          <div className="muted" style={{ marginBottom: 8 }}>You can view department goals, but only managers can create/edit them.</div>
        )}
        <div style={{ width: "100%", overflowX: "auto", marginTop: 10 }}>
          <table className="table" style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "#f8fafc" }}>
                <th style={{ textAlign: "left", padding: 10 }}>Department Goal</th>
                <th style={{ textAlign: "left", padding: 10 }}>Company Goal</th>
                <th style={{ textAlign: "left", padding: 10 }}>Department</th>
                <th style={{ textAlign: "left", padding: 10 }}>Status</th>
                <th style={{ textAlign: "left", padding: 10 }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {departmentGoals.map((g) => (
                <tr key={`dg_${g.id}`} style={{ borderTop: "1px solid #eef2f7" }}>
                  <td style={{ padding: 10 }}>
                    <div style={{ fontWeight: 700 }}>{g.title}</div>
                    {g.description && <div className="muted" style={{ fontSize: 12 }}>{g.description}</div>}
                  </td>
                  <td style={{ padding: 10 }}>{g.company_goal?.title || `#${g.company_goal_id}`}</td>
                  <td style={{ padding: 10 }}>{g.department}</td>
                  <td style={{ padding: 10 }}>{statusLabel(g.status)}</td>
                  <td style={{ padding: 10 }}>{canManageDepartment ? <button className="btn" type="button" onClick={() => editDepartment(g)}>Edit</button> : "-"}</td>
                </tr>
              ))}
              {!departmentGoals.length && <tr><td colSpan={5} style={{ padding: 14 }} className="muted">No department goals yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <div style={{ fontWeight: 900, marginBottom: 8 }}>3. Employee Goals</div>
        {canManageEmployee ? (
          <>
            <div className="row">
              <div className="field" style={{ flex: "1 1 260px" }}>
                <label>Department Goal</label>
                <select value={employeeForm.department_goal_id} onChange={(e) => setEmployeeForm((f) => ({ ...f, department_goal_id: e.target.value }))}>
                  <option value="">Select department goal</option>
                  {departmentGoals.map((g) => <option key={`dg_sel_${g.id}`} value={g.id}>{g.department}: {g.title}</option>)}
                </select>
              </div>
              <div className="field" style={{ flex: "1 1 260px" }}>
                <label>Employee</label>
                <select value={employeeForm.user_id} onChange={(e) => setEmployeeForm((f) => ({ ...f, user_id: e.target.value }))}>
                  <option value="">Select employee</option>
                  {users.map((u) => <option key={`u_sel_${u.id}`} value={u.id}>{u.name} ({u.department || "No Dept"})</option>)}
                </select>
              </div>
            </div>
            <div className="field">
              <label>Title</label>
              <input value={employeeForm.title} onChange={(e) => setEmployeeForm((f) => ({ ...f, title: e.target.value }))} />
            </div>
            <div className="field">
              <label>Description</label>
              <textarea value={employeeForm.description} onChange={(e) => setEmployeeForm((f) => ({ ...f, description: e.target.value }))} />
            </div>
            <div className="row">
              <div className="field" style={{ flex: "1 1 160px" }}>
                <label>Progress %</label>
                <input type="number" min="0" max="100" step="1" value={employeeForm.progress_percent} onChange={(e) => setEmployeeForm((f) => ({ ...f, progress_percent: e.target.value }))} />
              </div>
              <div className="field" style={{ flex: "1 1 180px" }}>
                <label>Status</label>
                <select value={employeeForm.status} onChange={(e) => setEmployeeForm((f) => ({ ...f, status: e.target.value }))}>
                  {STATUS_OPTIONS.map((s) => <option key={`e_${s}`} value={s}>{statusLabel(s)}</option>)}
                </select>
              </div>
            </div>
            <div className="field">
              <label>Employee Comment</label>
              <textarea value={employeeForm.self_comment} onChange={(e) => setEmployeeForm((f) => ({ ...f, self_comment: e.target.value }))} />
            </div>
            <div className="field">
              <label>Manager Comment</label>
              <textarea value={employeeForm.manager_comment} onChange={(e) => setEmployeeForm((f) => ({ ...f, manager_comment: e.target.value }))} />
            </div>
            <button className="btn btn-primary" type="button" onClick={submitEmployeeGoal}>
              {editingEmployeeId ? "Update Employee Goal" : "Create Employee Goal"}
            </button>
          </>
        ) : (
          <div className="muted" style={{ marginBottom: 8 }}>You can update your own progress from the list below.</div>
        )}
        <div style={{ width: "100%", overflowX: "auto", marginTop: 10 }}>
          <table className="table" style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "#f8fafc" }}>
                <th style={{ textAlign: "left", padding: 10 }}>Employee Goal</th>
                <th style={{ textAlign: "left", padding: 10 }}>Owner</th>
                <th style={{ textAlign: "left", padding: 10 }}>Department Goal</th>
                <th style={{ textAlign: "left", padding: 10 }}>Progress</th>
                <th style={{ textAlign: "left", padding: 10 }}>Status</th>
                <th style={{ textAlign: "left", padding: 10 }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {employeeGoals.map((g) => {
                const myGoal = current?.id === g.user_id;
                return (
                  <tr key={`eg_${g.id}`} style={{ borderTop: "1px solid #eef2f7" }}>
                    <td style={{ padding: 10 }}>
                      <div style={{ fontWeight: 700 }}>{g.title}</div>
                      {g.description && <div className="muted" style={{ fontSize: 12 }}>{g.description}</div>}
                      {g.self_comment && <div className="muted" style={{ fontSize: 12 }}>Self: {g.self_comment}</div>}
                      {g.manager_comment && <div className="muted" style={{ fontSize: 12 }}>Manager: {g.manager_comment}</div>}
                    </td>
                    <td style={{ padding: 10 }}>{g.user?.name || `User #${g.user_id}`}</td>
                    <td style={{ padding: 10 }}>{g.department_goal?.department}: {g.department_goal?.title}</td>
                    <td style={{ padding: 10 }}>{g.progress_percent}%</td>
                    <td style={{ padding: 10 }}>{statusLabel(g.status)}</td>
                    <td style={{ padding: 10 }}>
                      {canManageEmployee ? (
                        <button className="btn" type="button" onClick={() => editEmployee(g)}>Edit</button>
                      ) : myGoal ? (
                        <button className="btn" type="button" onClick={() => updateMyProgress(g)}>Update Progress</button>
                      ) : (
                        "-"
                      )}
                    </td>
                  </tr>
                );
              })}
              {!employeeGoals.length && <tr><td colSpan={6} style={{ padding: 14 }} className="muted">No employee goals yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {busy && <div className="muted" style={{ marginTop: 10 }}>Loading...</div>}
    </div>
  );
}
