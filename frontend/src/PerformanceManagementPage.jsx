import React, { useEffect, useMemo, useState } from "react";
import {
  me,
  listDepartments,
  listCompanyGoals,
  createCompanyGoal,
  updateCompanyGoal,
  listDepartmentGoals,
  createDepartmentGoal,
  updateDepartmentGoal,
} from "./api";
import { useToast } from "./ToastProvider";

const PERSPECTIVE_OPTIONS = [
  { value: "financial", label: "Financial Perspective" },
  { value: "client", label: "Client Perspective" },
  { value: "internal_process", label: "Internal Process Perspective" },
  { value: "learning_growth", label: "Learning & Growth Perspective" },
];

function trimOrNull(v) {
  const s = String(v || "").trim();
  return s ? s : null;
}

export default function PerformanceManagementPage() {
  const { showToast } = useToast();
  const [current, setCurrent] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const [companyGoals, setCompanyGoals] = useState([]);
  const [departmentGoals, setDepartmentGoals] = useState([]);
  const [departments, setDepartments] = useState([]);

  const [editingCompanyId, setEditingCompanyId] = useState(null);
  const [editingDepartmentId, setEditingDepartmentId] = useState(null);

  const [companyForm, setCompanyForm] = useState({
    perspective: "financial",
    title: "",
    description: "",
    period_start: "",
    period_end: "",
    status: "active",
  });
  const [departmentForm, setDepartmentForm] = useState({
    department: "",
    perspective: "financial",
    title: "",
    description: "",
    period_start: "",
    period_end: "",
    status: "active",
  });

  const canManageCompany = useMemo(() => ["admin", "ceo"].includes((current?.role || "").toLowerCase()), [current?.role]);
  const canManageDepartment = useMemo(() => ["supervisor", "admin", "ceo"].includes((current?.role || "").toLowerCase()), [current?.role]);

  const groupedCompanyGoals = useMemo(() => {
    const groups = Object.fromEntries(PERSPECTIVE_OPTIONS.map((p) => [p.value, []]));
    for (const row of companyGoals || []) {
      const key = row.perspective || "financial";
      if (!groups[key]) groups[key] = [];
      groups[key].push(row);
    }
    return groups;
  }, [companyGoals]);

  const departmentPerspectiveGroups = useMemo(() => {
    const byDepartment = {};
    for (const row of departmentGoals || []) {
      const dept = String(row.department || "").trim() || "Unassigned";
      if (!byDepartment[dept]) {
        byDepartment[dept] = Object.fromEntries(PERSPECTIVE_OPTIONS.map((p) => [p.value, []]));
      }
      const perspective = row.perspective || "financial";
      if (!byDepartment[dept][perspective]) byDepartment[dept][perspective] = [];
      byDepartment[dept][perspective].push(row);
    }
    const departments = Object.keys(byDepartment).sort((a, b) => a.localeCompare(b));
    return { byDepartment, departments };
  }, [departmentGoals]);

  async function loadData() {
    setBusy(true);
    setErr("");
    try {
      const meData = await me();
      setCurrent(meData);
      const [cGoals, dGoals, deptRows] = await Promise.all([listCompanyGoals(), listDepartmentGoals(), listDepartments()]);
      setCompanyGoals(cGoals || []);
      setDepartmentGoals(dGoals || []);
      setDepartments(deptRows || []);
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
      perspective: companyForm.perspective,
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
      setCompanyForm({
        perspective: "financial",
        title: "",
        description: "",
        period_start: "",
        period_end: "",
        status: "active",
      });
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
      perspective: goal.perspective || "financial",
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
    if (!departmentForm.department.trim()) {
      setErr("Department is required.");
      return;
    }
    if (!departmentForm.title.trim()) {
      setErr("Department goal title is required.");
      return;
    }
    const payload = {
      department: departmentForm.department.trim(),
      perspective: departmentForm.perspective,
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
      setDepartmentForm({
        department: (current?.role || "").toLowerCase() === "supervisor" ? (current?.department || "") : "",
        perspective: "financial",
        title: "",
        description: "",
        period_start: "",
        period_end: "",
        status: "active",
      });
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
      department: goal.department || "",
      perspective: goal.perspective || "financial",
      title: goal.title || "",
      description: goal.description || "",
      period_start: goal.period_start || "",
      period_end: goal.period_end || "",
      status: goal.status || "active",
    });
  }

  return (
    <div className="page-wrap">
      <div className="card" style={{ marginBottom: 12 }}>
        <div style={{ fontWeight: 900, fontSize: 18 }}>Performance Management</div>
        <div className="muted">
          Balanced Scorecard flow: Company goals by perspective, then Department goals by the same perspective.
        </div>
        <div className="muted" style={{ marginTop: 6 }}>
          Individual goals are intentionally deferred and are not part of this version.
        </div>
      </div>

      {err && <div className="error">{err}</div>}

      <div className="card" style={{ marginBottom: 12 }}>
        <div style={{ fontWeight: 900, marginBottom: 8 }}>1. Company Goals (Balanced Scorecard)</div>
        {canManageCompany ? (
          <>
            <div className="row">
              <div className="field" style={{ flex: "1 1 240px" }}>
                <label>Perspective</label>
                <select value={companyForm.perspective} onChange={(e) => setCompanyForm((f) => ({ ...f, perspective: e.target.value }))}>
                  {PERSPECTIVE_OPTIONS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
                </select>
              </div>
              <div className="field" style={{ flex: "2 1 360px" }}>
                <label>Goal Title</label>
                <input value={companyForm.title} onChange={(e) => setCompanyForm((f) => ({ ...f, title: e.target.value }))} />
              </div>
            </div>
            <div className="field">
              <label>Description</label>
              <textarea value={companyForm.description} onChange={(e) => setCompanyForm((f) => ({ ...f, description: e.target.value }))} />
            </div>
            <button className="btn btn-primary" type="button" onClick={submitCompanyGoal}>
              {editingCompanyId ? "Update Company Goal" : "Add Company Goal"}
            </button>
          </>
        ) : (
          <div className="muted" style={{ marginBottom: 8 }}>Only Admin/CEO can create or edit company goals.</div>
        )}

        {PERSPECTIVE_OPTIONS.map((p) => (
          <div key={`company_group_${p.value}`} style={{ marginTop: 12 }}>
            <div style={{ fontWeight: 800, marginBottom: 6 }}>{p.label}</div>
            <div style={{ width: "100%", overflowX: "auto" }}>
              <table className="table" style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ background: "#f8fafc" }}>
                    <th style={{ textAlign: "left", padding: 10 }}>Goal</th>
                    <th style={{ textAlign: "left", padding: 10 }}>Owner</th>
                    <th style={{ textAlign: "left", padding: 10 }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {(groupedCompanyGoals[p.value] || []).map((g) => (
                    <tr key={`cg_${g.id}`} style={{ borderTop: "1px solid #eef2f7" }}>
                      <td style={{ padding: 10 }}>
                        <div style={{ fontWeight: 700 }}>{g.title}</div>
                        {g.description && <div className="muted" style={{ fontSize: 12 }}>{g.description}</div>}
                      </td>
                      <td style={{ padding: 10 }}>{g.created_by?.name || "-"}</td>
                      <td style={{ padding: 10 }}>{canManageCompany ? <button className="btn" type="button" onClick={() => editCompany(g)}>Edit</button> : "-"}</td>
                    </tr>
                  ))}
                  {!(groupedCompanyGoals[p.value] || []).length && (
                    <tr><td colSpan={3} style={{ padding: 12 }} className="muted">No goals under this perspective yet.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        ))}
      </div>

      <div className="card">
        <div style={{ fontWeight: 900, marginBottom: 8 }}>2. Department Goals (Balanced Scorecard)</div>
        {canManageDepartment ? (
          <>
            <div className="row">
              <div className="field" style={{ flex: "1 1 220px" }}>
                <label>Department</label>
                <select
                  value={departmentForm.department}
                  onChange={(e) => setDepartmentForm((f) => ({ ...f, department: e.target.value }))}
                  disabled={(current?.role || "").toLowerCase() === "supervisor"}
                >
                  <option value="">Select department</option>
                  {departments.map((d) => (
                    <option key={`dept_goal_${d.id}`} value={d.name}>{d.name}</option>
                  ))}
                </select>
              </div>
              <div className="field" style={{ flex: "1 1 240px" }}>
                <label>Perspective</label>
                <select value={departmentForm.perspective} onChange={(e) => setDepartmentForm((f) => ({ ...f, perspective: e.target.value }))}>
                  {PERSPECTIVE_OPTIONS.map((p) => <option key={`dp_${p.value}`} value={p.value}>{p.label}</option>)}
                </select>
              </div>
            </div>
            <div className="field">
              <label>Goal Title</label>
              <input value={departmentForm.title} onChange={(e) => setDepartmentForm((f) => ({ ...f, title: e.target.value }))} />
            </div>
            <div className="field">
              <label>Description</label>
              <textarea value={departmentForm.description} onChange={(e) => setDepartmentForm((f) => ({ ...f, description: e.target.value }))} />
            </div>
            <button className="btn btn-primary" type="button" onClick={submitDepartmentGoal}>
              {editingDepartmentId ? "Update Department Goal" : "Add Department Goal"}
            </button>
          </>
        ) : (
          <div className="muted" style={{ marginBottom: 8 }}>You can view department goals, but only supervisors/admin/ceo can create or edit them.</div>
        )}

        {(departmentPerspectiveGroups.departments || []).map((dept) => (
          <div
            key={`department_block_${dept}`}
            style={{
              marginTop: 14,
              border: "1px solid #e5e7eb",
              borderRadius: 10,
              padding: 12,
              background: "#fbfcfe",
            }}
          >
            <div
              style={{
                fontWeight: 900,
                marginBottom: 8,
                paddingBottom: 6,
                borderBottom: "1px solid #e5e7eb",
              }}
            >
              {dept}
            </div>
            {PERSPECTIVE_OPTIONS.map((p) => (
              <div key={`department_${dept}_${p.value}`} style={{ marginTop: 8 }}>
                <div style={{ fontWeight: 800, marginBottom: 4 }}>{p.label}</div>
                <div style={{ width: "100%", overflowX: "auto" }}>
                  <table className="table" style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                      <tr style={{ background: "#f8fafc" }}>
                        <th style={{ textAlign: "left", padding: 10 }}>Department Goal</th>
                        <th style={{ textAlign: "left", padding: 10 }}>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(departmentPerspectiveGroups.byDepartment[dept]?.[p.value] || []).map((g) => (
                        <tr key={`dg_${g.id}`} style={{ borderTop: "1px solid #eef2f7" }}>
                          <td style={{ padding: 10 }}>
                            <div style={{ fontWeight: 700 }}>{g.title}</div>
                            {g.description && <div className="muted" style={{ fontSize: 12 }}>{g.description}</div>}
                          </td>
                          <td style={{ padding: 10 }}>{canManageDepartment ? <button className="btn" type="button" onClick={() => editDepartment(g)}>Edit</button> : "-"}</td>
                        </tr>
                      ))}
                      {!(departmentPerspectiveGroups.byDepartment[dept]?.[p.value] || []).length && (
                        <tr><td colSpan={2} style={{ padding: 12 }} className="muted">No goals under this perspective yet.</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        ))}
        {!departmentPerspectiveGroups.departments.length && (
          <div className="muted" style={{ marginTop: 10 }}>No department goals yet.</div>
        )}
      </div>

      {busy && <div className="muted" style={{ marginTop: 10 }}>Loading...</div>}
    </div>
  );
}
