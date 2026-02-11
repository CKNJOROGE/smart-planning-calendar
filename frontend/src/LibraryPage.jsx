import React, { useEffect, useMemo, useState } from "react";
import { me, listLibraryDocuments, uploadLibraryDocument, deleteLibraryDocument, openProtectedFile } from "./api";
import { useToast } from "./ToastProvider";

const CATEGORIES = [
  "Contract",
  "Recruitment",
  "Onboarding",
  "Performance Management",
  "Disciplinary Management",
  "Training Template",
];

export default function LibraryPage() {
  const [user, setUser] = useState(null);
  const [docs, setDocs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [form, setForm] = useState({
    title: "",
    category: CATEGORIES[0],
    file: null,
  });
  const { showToast } = useToast();

  useEffect(() => {
    (async () => {
      const u = await me();
      setUser(u);
      const items = await listLibraryDocuments();
      setDocs(items);
      setLoading(false);
    })().catch((e) => {
      showToast(String(e.message || e), "error");
      setLoading(false);
    });
  }, [showToast]);

  const grouped = useMemo(() => {
    const map = new Map();
    for (const c of CATEGORIES) map.set(c, []);
    for (const d of docs) {
      if (!map.has(d.category)) map.set(d.category, []);
      map.get(d.category).push(d);
    }
    return map;
  }, [docs]);

  async function refresh() {
    const items = await listLibraryDocuments();
    setDocs(items);
  }

  async function submitUpload(e) {
    e.preventDefault();
    if (!form.title.trim() || !form.file) {
      showToast("Please provide title and file", "error");
      return;
    }
    setUploading(true);
    try {
      await uploadLibraryDocument({
        title: form.title.trim(),
        category: form.category,
        file: form.file,
      });
      setForm({ title: "", category: CATEGORIES[0], file: null });
      await refresh();
      showToast("Document uploaded", "success");
    } catch (err) {
      showToast(String(err.message || err), "error");
    } finally {
      setUploading(false);
    }
  }

  async function removeDoc(docId) {
    if (!confirm("Delete this document from the library?")) return;
    try {
      await deleteLibraryDocument(docId);
      await refresh();
      showToast("Document deleted", "success");
    } catch (err) {
      showToast(String(err.message || err), "error");
    }
  }

  if (loading) return <div>Loading library...</div>;

  return (
    <div className="page-wrap">
      <div className="card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <div>
            <h2 style={{ margin: 0 }}>Company Library</h2>
            <div className="muted">Policies, templates and process documents.</div>
          </div>
        </div>
      </div>

      {user?.role === "admin" && (
        <div className="card" style={{ marginTop: 12 }}>
          <div style={{ fontWeight: 900, marginBottom: 8 }}>Upload Document</div>
          <form className="row" onSubmit={submitUpload}>
            <div className="field" style={{ flex: "1 1 260px" }}>
              <label>Title</label>
              <input
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                placeholder="e.g. Standard Employment Contract v2"
              />
            </div>
            <div className="field" style={{ flex: "1 1 220px" }}>
              <label>Category</label>
              <select
                value={form.category}
                onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
            <div className="field" style={{ flex: "1 1 260px" }}>
              <label>File</label>
              <input
                type="file"
                onChange={(e) => setForm((f) => ({ ...f, file: e.target.files?.[0] || null }))}
              />
            </div>
            <div style={{ alignSelf: "end" }}>
              <button className="btn btn-primary" type="submit" disabled={uploading}>
                {uploading ? "Uploading..." : "Upload"}
              </button>
            </div>
          </form>
        </div>
      )}

      <div style={{ marginTop: 12, display: "grid", gap: 12 }}>
        {CATEGORIES.map((category) => {
          const items = grouped.get(category) || [];
          return (
            <div key={category} className="card">
              <div style={{ fontWeight: 900, marginBottom: 8 }}>{category}</div>
              {items.length === 0 ? (
                <div className="muted">No documents yet.</div>
              ) : (
                <div className="library-list">
                  {items.map((d) => (
                    <div key={d.id} className="library-item">
                      <div className="library-item-main">
                        <div className="library-item-title">{d.title}</div>
                        <div className="muted" style={{ fontSize: 12 }}>
                          Uploaded by {d.uploaded_by?.name || "Unknown"} on{" "}
                          {new Date(d.created_at).toLocaleDateString()}
                        </div>
                      </div>
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        <button
                          type="button"
                          className="btn"
                          onClick={() =>
                            openProtectedFile(d.file_url).catch((err) => {
                              showToast(String(err.message || err), "error");
                            })
                          }
                        >
                          Open
                        </button>
                        {user?.role === "admin" && (
                          <button className="btn btn-danger" onClick={() => removeDoc(d.id)}>Delete</button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
