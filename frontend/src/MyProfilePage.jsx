import React, { useEffect, useState } from "react";
import {
  me,
  getUserProfile,
  updateUserProfile,
  listDepartments,
  getLeaveBalance,
  uploadMyAvatar,
  uploadMyDocument,
  openProtectedFile,
} from "./api";
import Avatar from "./Avatar";

const PROFILE_DOCUMENTS = [
  { key: "id_copy", label: "ID Copy", field: "id_copy_url" },
  { key: "kra_copy", label: "KRA Copy", field: "kra_copy_url" },
  { key: "offer_letter", label: "Offer Letter", field: "offer_letter_url" },
  { key: "employment_contract", label: "Employment Contract", field: "employment_contract_url" },
  { key: "disciplinary_records", label: "Disciplinary Records", field: "disciplinary_records_url" },
  { key: "bio_data_form", label: "Bio-data Form", field: "bio_data_form_url" },
  { key: "bank_details_form", label: "Bank Details Form", field: "bank_details_form_url" },
];

export default function MyProfilePage() {
  const [meUser, setMeUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [leaveBalance, setLeaveBalance] = useState(null);
  const [departments, setDepartments] = useState([]);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadingDocs, setUploadingDocs] = useState({});
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  useEffect(() => {
    (async () => {
      setErr("");
      const u = await me();
      setMeUser(u);
      const p = await getUserProfile(u.id);
      setProfile(p);
      const bal = await getLeaveBalance();
      setLeaveBalance(bal);
      const deptRows = await listDepartments();
      setDepartments(deptRows || []);
    })().catch((e) => setErr(String(e.message || e)));
  }, []);

  async function handleAvatarUpload(e) {
    const file = e.target.files?.[0];
    if (!file || !meUser) return;

    setUploading(true);
    setErr("");
    setMsg("");
    try {
      const updated = await uploadMyAvatar(file);
      setProfile(updated);
      setMsg("Profile image updated.");
    } catch (uploadErr) {
      setErr(String(uploadErr.message || uploadErr));
    } finally {
      setUploading(false);
    }
  }

  async function handleDocumentUpload(docKey, e) {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingDocs((s) => ({ ...s, [docKey]: true }));
    setErr("");
    setMsg("");
    try {
      const updated = await uploadMyDocument(docKey, file);
      setProfile(updated);
      setMsg("Document uploaded.");
    } catch (uploadErr) {
      setErr(String(uploadErr.message || uploadErr));
    } finally {
      setUploadingDocs((s) => ({ ...s, [docKey]: false }));
    }
  }

  async function save() {
    if (!meUser) return;
    setSaving(true);
    setErr("");
    setMsg("");
    try {
      const updated = await updateUserProfile(meUser.id, {
        name: profile.name,
        avatar_url: profile.avatar_url || null,
        phone: profile.phone || null,
        department: profile.department || null,
        designation: profile.designation || null,
        gender: profile.gender || null,
        date_of_birth: profile.date_of_birth || null,
        address: profile.address || null,
        id_number: profile.id_number || null,
        nssf_number: profile.nssf_number || null,
        nhif_number: profile.nhif_number || null,
      });
      setProfile(updated);
      setMsg("Saved.");
    } catch (e) {
      setErr(String(e.message || e));
    } finally {
      setSaving(false);
    }
  }

  if (err) return <div style={{ color: "crimson" }}>{err}</div>;
  if (!profile) return <div>Loading...</div>;

  return (
    <div className="page-wrap profile-page">
      <div className="card profile-card">
        <h2>My Profile</h2>
        <div className="muted" style={{ marginBottom: 12 }}>
          Your profile is visible to Admin. Other employees cannot view it.
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
            <Field label="Email" value={profile.email} disabled />
            <Field label="Role" value={profile.role} disabled />

            <div className="field" style={{ gridColumn: "1 / -1" }}>
              <label>Profile image</label>
              <div className="avatar-upload-row">
                <Avatar
                  name={profile.name}
                  url={profile.avatar_url}
                  size={72}
                  className="profile-avatar-preview"
                  alt="profile avatar"
                />
                <div>
                  <input type="file" accept="image/*" onChange={handleAvatarUpload} disabled={uploading} />
                  <div className="helper">PNG/JPG/WEBP/GIF, max 5MB.</div>
                </div>
              </div>
            </div>
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
            <div className="field">
              <label>Department</label>
              <select
                value={profile.department || ""}
                onChange={(e) => setProfile((p) => ({ ...p, department: e.target.value || null }))}
              >
                <option value="">Unassigned</option>
                {departments.map((d) => (
                  <option key={`dept_me_${d.id}`} value={d.name}>{d.name}</option>
                ))}
              </select>
            </div>
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
              disabled
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
                      onClick={() => openProtectedFile(profile[doc.field]).catch((e) => setErr(String(e.message || e)))}
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

        {leaveBalance && (
          <div className="profile-section" style={{ marginTop: 14 }}>
            <div className="section-title">Leave Policy</div>
            <div className="card" style={{ background: "#f8fafc" }}>
            <div style={{ fontWeight: 900, marginBottom: 8 }}>Leave balance</div>
            <div className="row">
              <div className="pill">Accrued: <b>{leaveBalance.accrued}</b></div>
              <div className="pill">Used: <b>{leaveBalance.used}</b></div>
              <div className="pill">Remaining: <b>{leaveBalance.remaining}</b></div>
            </div>
            <div className="muted" style={{ marginTop: 8, fontSize: 12 }}>
              Period: {leaveBalance.period_start} - {leaveBalance.period_end}
            </div>
            </div>
          </div>
        )}

        <div style={{ marginTop: 14, display: "flex", gap: 10 }}>
          <button className="btn btn-primary" onClick={save} disabled={saving}>
            {saving ? "Saving..." : "Save changes"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, value, onChange, disabled, type = "text" }) {
  return (
    <div className="field">
      <label>{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange && onChange(e.target.value)}
        disabled={disabled}
      />
    </div>
  );
}
