import React, { useEffect, useState } from "react";
import { useParams, Navigate } from "react-router-dom";
import { me, listUsers, adminGetUserProfile, adminUpdateUserProfile, adminUploadUserDocument, adminGetUserLeaveBalance, openProtectedFile } from "./api";
import { useToast } from "./ToastProvider";

const PROFILE_DOCUMENTS = [
  { key: "id_copy", label: "ID Copy", field: "id_copy_url" },
  { key: "kra_copy", label: "KRA Copy", field: "kra_copy_url" },
  { key: "offer_letter", label: "Offer Letter", field: "offer_letter_url" },
  { key: "employment_contract", label: "Employment Contract", field: "employment_contract_url" },
  { key: "disciplinary_records", label: "Disciplinary Records", field: "disciplinary_records_url" },
  { key: "bio_data_form", label: "Bio-data Form", field: "bio_data_form_url" },
  { key: "bank_details_form", label: "Bank Details Form", field: "bank_details_form_url" },
];

export default function UserProfilePage() {
  const { id } = useParams();
  const userId = Number(id);

  const [current, setCurrent] = useState(null);
  const [profile, setProfile] = useState(null);
  const [saving, setSaving] = useState(false);
  const [uploadingDocs, setUploadingDocs] = useState({});
  const [adminUsers, setAdminUsers] = useState([]);
  const [supervisorUsers, setSupervisorUsers] = useState([]);
  const [leaveBalance, setLeaveBalance] = useState(null);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const { showToast } = useToast();

  useEffect(() => {
    (async () => {
      setErr("");
      const u = await me();
      setCurrent(u);
      const p = await adminGetUserProfile(userId);
      setProfile(p);
      const lb = await adminGetUserLeaveBalance(userId);
      setLeaveBalance(lb);
      const allUsers = await listUsers();
      setAdminUsers(allUsers.filter((x) => x.role === "admin" || x.role === "ceo"));
      setSupervisorUsers(allUsers.filter((x) => x.role === "supervisor"));
    })().catch((e) => setErr(String(e.message || e)));
  }, [userId]);

  if (current && current.role !== "admin" && current.role !== "ceo") return <Navigate to="/" replace />;
  if (err) return <div style={{ color: "crimson" }}>{err}</div>;
  if (!profile) return <div>Loading...</div>;

  async function handleDocumentUpload(docKey, e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingDocs((s) => ({ ...s, [docKey]: true }));
    setErr("");
    setMsg("");
    try {
      const updated = await adminUploadUserDocument(userId, docKey, file);
      setProfile(updated);
      setMsg("Document uploaded.");
      showToast("Document uploaded", "success");
    } catch (uploadErr) {
      const text = String(uploadErr.message || uploadErr);
      setErr(text);
      showToast(text, "error");
    } finally {
      setUploadingDocs((s) => ({ ...s, [docKey]: false }));
    }
  }

  async function save() {
    setSaving(true);
    setErr("");
    setMsg("");
    try {
      const updated = await adminUpdateUserProfile(userId, {
        name: profile.name,
        email: profile.email,
        avatar_url: profile.avatar_url || null,
        phone: profile.phone || null,
        department: profile.department || null,
        designation: profile.designation || null,
        gender: profile.gender || null,
        date_of_birth: profile.date_of_birth || null,
        hire_date: profile.hire_date || null,
        address: profile.address || null,
        id_number: profile.id_number || null,
        nssf_number: profile.nssf_number || null,
        nhif_number: profile.nhif_number || null,
        role: profile.role,
        notes_private: profile.notes_private || null,
        require_two_step_leave_approval: !!profile.require_two_step_leave_approval,
        first_approver_id: profile.first_approver_id ? Number(profile.first_approver_id) : null,
        second_approver_id: profile.second_approver_id ? Number(profile.second_approver_id) : null,
        leave_opening_as_of: profile.leave_opening_as_of || null,
        leave_opening_accrued: toNullableNumber(profile.leave_opening_accrued),
        leave_opening_used: toNullableNumber(profile.leave_opening_used),
      });
      setProfile(updated);
      setMsg("Saved.");
      showToast("User profile saved", "success");
    } catch (e) {
      const text = String(e.message || e);
      setErr(text);
      showToast(text, "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="page-wrap profile-page">
      <div className="card profile-card">
        <h2>User Profile</h2>
        <div className="muted" style={{ marginBottom: 12 }}>
          Admin view. Employees cannot view each other's profiles.
        </div>

        {msg && <div className="success">{msg}</div>}
        {err && <div className="error">{err}</div>}

        <div className="profile-section">
          <div className="section-title">Identity</div>
          <div className="profile-grid">
            <Field
              label="Full name"
              value={profile.name || ""}
              onChange={(v) => setProfile((p) => ({ ...p, name: v }))}
            />
            <Field
              label="Email"
              type="email"
              value={profile.email || ""}
              onChange={(v) => setProfile((p) => ({ ...p, email: v }))}
            />

            <div className="field">
              <label>Role</label>
              <select
                value={profile.role}
                onChange={(e) => setProfile((p) => ({ ...p, role: e.target.value }))}
              >
                <option value="employee">employee</option>
                <option value="supervisor">supervisor</option>
                <option value="finance">finance</option>
                <option value="admin">admin</option>
                <option value="ceo">ceo</option>
              </select>
            </div>

            <Field
              label="Avatar URL"
              value={profile.avatar_url || ""}
              onChange={(v) => setProfile((p) => ({ ...p, avatar_url: v }))}
            />
          </div>
        </div>

        <div className="profile-section">
          <div className="section-title">Work Info</div>
          <div className="profile-grid">
            <Field
              label="Phone"
              value={profile.phone || ""}
              onChange={(v) => setProfile((p) => ({ ...p, phone: v }))}
            />
            <Field
              label="Department"
              value={profile.department || ""}
              onChange={(v) => setProfile((p) => ({ ...p, department: v }))}
            />
            <Field
              label="Designation"
              value={profile.designation || ""}
              onChange={(v) => setProfile((p) => ({ ...p, designation: v }))}
            />
            <Field
              label="Gender"
              value={profile.gender || ""}
              onChange={(v) => setProfile((p) => ({ ...p, gender: v }))}
            />
            <Field
              label="Date of birth"
              type="date"
              value={profile.date_of_birth || ""}
              onChange={(v) => setProfile((p) => ({ ...p, date_of_birth: v }))}
            />
            <Field
              label="Date of Hire"
              type="date"
              value={profile.hire_date || ""}
              onChange={(v) => setProfile((p) => ({ ...p, hire_date: v }))}
            />
            <Field
              label="Address"
              value={profile.address || ""}
              onChange={(v) => setProfile((p) => ({ ...p, address: v }))}
            />
            <Field
              label="ID Number"
              value={profile.id_number || ""}
              onChange={(v) => setProfile((p) => ({ ...p, id_number: v }))}
            />
            <Field
              label="NSSF Number"
              value={profile.nssf_number || ""}
              onChange={(v) => setProfile((p) => ({ ...p, nssf_number: v }))}
            />
            <Field
              label="SHA Number"
              value={profile.nhif_number || ""}
              onChange={(v) => setProfile((p) => ({ ...p, nhif_number: v }))}
            />
          </div>
        </div>

        <div className="profile-section">
          <div className="section-title">Documents</div>
          <div className="doc-upload-list">
            {PROFILE_DOCUMENTS.map((doc) => (
              <div key={doc.key} className="doc-upload-row">
                <div className="doc-upload-meta">
                  <div className="doc-upload-label">{doc.label}</div>
                  {profile[doc.field] ? (
                    <button
                      type="button"
                      className="btn"
                      onClick={() =>
                        openProtectedFile(profile[doc.field]).catch((e) => {
                          const text = String(e.message || e);
                          setErr(text);
                          showToast(text, "error");
                        })
                      }
                    >
                      View current file
                    </button>
                  ) : (
                    <div className="helper">No file uploaded</div>
                  )}
                </div>
                <input
                  type="file"
                  onChange={(e) => handleDocumentUpload(doc.key, e)}
                  disabled={!!uploadingDocs[doc.key]}
                />
              </div>
            ))}
          </div>
          <div className="helper">Accepted: PDF, JPG, PNG, WEBP, DOC, DOCX (max 10MB each).</div>
        </div>

        <div className="profile-section">
          <div className="section-title">Leave Policy</div>
          {leaveBalance && (
            <div className="profile-grid" style={{ marginBottom: 10 }}>
              <div className="pill">Accrued: <b>{leaveBalance.accrued}</b></div>
              <div className="pill">Used: <b>{leaveBalance.used}</b></div>
              <div className="pill">Remaining: <b>{leaveBalance.remaining}</b></div>
              <div className="helper" style={{ gridColumn: "1 / -1" }}>
                Period: {leaveBalance.period_start} - {leaveBalance.period_end} (as of {leaveBalance.as_of})
              </div>
            </div>
          )}
          <div className="profile-grid" style={{ marginBottom: 10 }}>
            <Field
              label="Start Date"
              helpText="From when should this app start calculating this person's leave?"
              type="date"
              value={profile.leave_opening_as_of || ""}
              onChange={(v) => setProfile((p) => ({ ...p, leave_opening_as_of: v }))}
            />
            <Field
              label="Starting Accrued"
              helpText="How many leave days had they earned by that date?"
              type="number"
              value={profile.leave_opening_accrued ?? ""}
              onChange={(v) => setProfile((p) => ({ ...p, leave_opening_accrued: v }))}
            />
            <Field
              label="Starting Used"
              helpText="How many had they already taken by that date?"
              type="number"
              value={profile.leave_opening_used ?? ""}
              onChange={(v) => setProfile((p) => ({ ...p, leave_opening_used: v }))}
            />
          </div>
          <div className="field" style={{ gridColumn: "1 / -1" }}>
            <label>Leave approval workflow</label>
            <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              <label style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 500 }}>
                <input
                  type="checkbox"
                  checked={!!profile.require_two_step_leave_approval}
                  onChange={(e) =>
                    setProfile((p) => ({ ...p, require_two_step_leave_approval: e.target.checked }))
                  }
                />
                Require two-step approval
              </label>
              <select
                value={profile.first_approver_id || ""}
                onChange={(e) =>
                  setProfile((p) => ({
                    ...p,
                    first_approver_id: e.target.value === "" ? null : Number(e.target.value),
                  }))
                }
                style={{ width: 230 }}
              >
                <option value="">First approver (supervisor)</option>
                {supervisorUsers.map((a) => (
                  <option key={a.id} value={a.id}>{a.name} (ID {a.id})</option>
                ))}
              </select>
              <select
                value={profile.second_approver_id || ""}
                onChange={(e) =>
                  setProfile((p) => ({
                    ...p,
                    second_approver_id: e.target.value === "" ? null : Number(e.target.value),
                  }))
                }
                style={{ width: 230 }}
              >
                <option value="">Second approver (admin/ceo)</option>
                {adminUsers.map((a) => (
                  <option key={a.id} value={a.id}>{a.name} (ID {a.id})</option>
                ))}
              </select>
            </div>
            <div className="helper">
              Two-step order is fixed: supervisor first, admin second.
            </div>
            <div className="helper">
              Opening values are for employees with existing leave history before this system.
            </div>
          </div>
        </div>

        <div className="profile-section">
          <div className="section-title">Admin Notes</div>
          <div className="field" style={{ gridColumn: "1 / -1" }}>
            <label>Private notes (Admin only)</label>
            <textarea
              value={profile.notes_private || ""}
              onChange={(e) => setProfile((p) => ({ ...p, notes_private: e.target.value }))}
              placeholder="Internal HR notes..."
            />
          </div>
        </div>

        <div style={{ marginTop: 14, display: "flex", gap: 10 }}>
          <button className="btn btn-primary" onClick={save} disabled={saving}>
            {saving ? "Saving..." : "Save changes"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, value, onChange, disabled, type = "text", helpText = "" }) {
  return (
    <div className="field">
      <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <span>{label}</span>
        {helpText ? (
          <span
            title={helpText}
            aria-label={helpText}
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              width: 16,
              height: 16,
              borderRadius: "50%",
              border: "1px solid #6c4a7b",
              fontSize: 11,
              fontWeight: 700,
              cursor: "help",
              userSelect: "none",
            }}
          >
            !
          </span>
        ) : null}
      </label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange && onChange(e.target.value)}
        disabled={disabled}
      />
    </div>
  );
}

function toNullableNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}
