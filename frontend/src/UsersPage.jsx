import React, { useEffect, useMemo, useState } from "react";
import { listUsers, createUser, deleteUser, me } from "./api";
import { Link } from "react-router-dom";
import Avatar from "./Avatar";

export default function UsersPage() {
  const [current, setCurrent] = useState(null);
  const [users, setUsers] = useState([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    role: "employee",
    avatar_url: "",
  });

  const canOpen = useMemo(() => current?.role === "admin", [current]);

  async function load() {
    setErr("");
    setBusy(true);
    try {
      const u = await me();
      setCurrent(u);
      const data = await listUsers();
      setUsers(data);
    } catch (e) {
      setErr(String(e?.message || e));
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function submitCreate(e) {
    e.preventDefault();
    setErr("");

    if (!form.name.trim()) return setErr("Name is required.");
    if (!form.email.trim()) return setErr("Email is required.");
    if (!form.password) return setErr("Password is required (user can change later in v2).");

    setBusy(true);
    try {
      await createUser({
        name: form.name.trim(),
        email: form.email.trim(),
        password: form.password,
        role: form.role,
        avatar_url: form.avatar_url.trim() || undefined,
      });

      setOpen(false);
      setForm({ name: "", email: "", password: "", role: "employee", avatar_url: "" });
      await load();
    } catch (e2) {
      setErr(String(e2?.message || e2));
    } finally {
      setBusy(false);
    }
  }

  if (!current) {
    return (
      <div className="page-wrap">
        <div className="card" style={{ padding: 16 }}>
          <div style={{ fontWeight: 800, marginBottom: 6 }}>Users</div>
          <div className="muted">Loading...</div>
          {err && <div style={{ marginTop: 10, color: "crimson", whiteSpace: "pre-wrap" }}>{err}</div>}
        </div>
      </div>
    );
  }

  async function handleDeleteUser(user) {
    setErr("");
    if (!confirm(`Delete user "${user.name}" (${user.email})?`)) return;

    setBusy(true);
    try {
      await deleteUser(user.id);
      await load();
    } catch (e) {
      setErr(String(e?.message || e));
    } finally {
      setBusy(false);
    }
  }

  if (current.role !== "admin") {
    return (
      <div className="page-wrap">
        <div className="card" style={{ padding: 16 }}>
          <div style={{ fontWeight: 800, marginBottom: 6 }}>Users</div>
          <div className="muted">Admins only.</div>
        </div>
      </div>
    );
  }

  return (
    <div className="page-wrap">
      <div className="card" style={{ padding: 16, marginBottom: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
          <div>
            <div style={{ fontWeight: 900, fontSize: 18 }}>Users</div>
            <div className="muted" style={{ marginTop: 2 }}>
              Create accounts for employees, supervisors, and admins.
            </div>
          </div>

          <div style={{ display: "flex", gap: 10 }}>
            <button className="btn" onClick={load} disabled={busy}>
              Refresh
            </button>
            <button className="btn btn-primary" onClick={() => setOpen(true)} disabled={!canOpen || busy}>
              + Add User
            </button>
          </div>
        </div>

        {err && <div style={{ marginTop: 10, color: "crimson", whiteSpace: "pre-wrap" }}>{err}</div>}
      </div>

      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        <div style={{ padding: 12, borderBottom: "1px solid #e2e8f0", fontWeight: 800 }}>
          {busy ? "Loading..." : `${users.length} user(s)`}
        </div>

        <div style={{ width: "100%", overflowX: "auto" }}>
          <table className="table" style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "#f8fafc" }}>
                <th style={{ textAlign: "left", padding: 12 }}>User</th>
                <th style={{ textAlign: "left", padding: 12 }}>Email</th>
                <th style={{ textAlign: "left", padding: 12 }}>Role</th>
                <th style={{ textAlign: "left", padding: 12 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} style={{ borderTop: "1px solid #eef2f7" }}>
                  <td style={{ padding: 12 }}>
                    <Link
                      to={`/users/${u.id}`}
                      style={{ display: "flex", alignItems: "center", gap: 10, textDecoration: "none", color: "inherit" }}
                    >
                      <Avatar
                        name={u.name}
                        url={u.avatar_url}
                        size={34}
                      />
                      <div>
                        <div style={{ fontWeight: 800 }}>{u.name}</div>
                        <div className="muted" style={{ fontSize: 12 }}>ID: {u.id}</div>
                      </div>
                    </Link>
                  </td>
                  <td style={{ padding: 12 }}>{u.email}</td>
                  <td style={{ padding: 12 }}>
                    <span className="pill">{u.role}</span>
                  </td>
                  <td style={{ padding: 12 }}>
                    <button
                      className="btn btn-danger"
                      onClick={() => handleDeleteUser(u)}
                      disabled={busy || current?.id === u.id}
                      title={current?.id === u.id ? "You cannot delete your own account" : "Delete user"}
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
              {!users.length && (
                <tr>
                  <td colSpan={4} style={{ padding: 16 }} className="muted">
                    No users yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create User Modal */}
      {open && (
        <div className="modal-overlay" onMouseDown={() => setOpen(false)}>
          <div className="modal" onMouseDown={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">Add User</h3>
              <button className="btn" onClick={() => setOpen(false)}>Close</button>
            </div>

            <form onSubmit={submitCreate} style={{ paddingTop: 10 }}>
              <div className="row">
                <div className="field" style={{ flex: "1 1 260px" }}>
                  <label>Full name</label>
                  <input
                    value={form.name}
                    onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                    placeholder="e.g., Chris Njoroge"
                  />
                </div>

                <div className="field" style={{ flex: "1 1 260px" }}>
                  <label>Email</label>
                  <input
                    value={form.email}
                    onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                    placeholder="e.g., chris@company.com"
                  />
                </div>
              </div>

              <div className="row">
                <div className="field" style={{ flex: "1 1 220px" }}>
                  <label>Password</label>
                  <input
                    type="password"
                    value={form.password}
                    onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                    placeholder="Set an initial password"
                  />
                  <div className="helper">User can change later (we’ll add that in v2).</div>
                </div>

                <div className="field" style={{ flex: "1 1 220px" }}>
                  <label>Role</label>
                  <select
                    value={form.role}
                    onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}
                  >
                    <option value="employee">employee</option>
                    <option value="supervisor">supervisor</option>
                    <option value="admin">admin</option>
                  </select>
                </div>
              </div>

              <div className="field">
                <label>Avatar URL (optional)</label>
                <input
                  value={form.avatar_url}
                  onChange={(e) => setForm((f) => ({ ...f, avatar_url: e.target.value }))}
                  placeholder="https://..."
                />
              </div>

              {err && <div style={{ marginTop: 10, color: "crimson", whiteSpace: "pre-wrap" }}>{err}</div>}

              <div className="modal-actions">
                <button type="button" className="btn" onClick={() => setOpen(false)} disabled={busy}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={busy}>
                  {busy ? "Saving..." : "Create User"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
