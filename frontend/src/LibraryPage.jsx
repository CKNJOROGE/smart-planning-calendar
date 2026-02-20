import React, { useEffect, useMemo, useState } from "react";
import {
  me,
  listLibraryDocuments,
  listLibraryCategories,
  createLibraryCategory,
  uploadLibraryDocument,
  deleteLibraryDocument,
  openProtectedFile,
} from "./api";
import { useToast } from "./ToastProvider";

export default function LibraryPage() {
  const [user, setUser] = useState(null);
  const [docs, setDocs] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [addingCategory, setAddingCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [form, setForm] = useState({
    title: "",
    category: "",
    file: null,
  });
  const { showToast } = useToast();
  const isLibraryManager = user?.role === "admin" || user?.role === "ceo";

  useEffect(() => {
    (async () => {
      const u = await me();
      setUser(u);
      const [items, categoryRows] = await Promise.all([
        listLibraryDocuments(),
        listLibraryCategories(),
      ]);
      setDocs(items || []);
      const catList = (categoryRows || []).slice().sort((a, b) => String(a).localeCompare(String(b)));
      setCategories(catList);
      setForm((prev) => ({ ...prev, category: prev.category || catList[0] || "" }));
      setLoading(false);
    })().catch((e) => {
      showToast(String(e.message || e), "error");
      setLoading(false);
    });
  }, [showToast]);

  const allCategories = useMemo(() => {
    const set = new Set(categories || []);
    for (const d of docs || []) {
      if (d?.category) set.add(d.category);
    }
    return Array.from(set).sort((a, b) => String(a).localeCompare(String(b)));
  }, [categories, docs]);

  const grouped = useMemo(() => {
    const map = new Map();
    for (const c of allCategories) map.set(c, []);
    for (const d of docs) {
      if (!map.has(d.category)) map.set(d.category, []);
      map.get(d.category).push(d);
    }
    return map;
  }, [allCategories, docs]);

  async function refresh() {
    const [items, categoryRows] = await Promise.all([
      listLibraryDocuments(),
      listLibraryCategories(),
    ]);
    setDocs(items || []);
    const catList = (categoryRows || []).slice().sort((a, b) => String(a).localeCompare(String(b)));
    setCategories(catList);
    setForm((prev) => ({
      ...prev,
      category: catList.includes(prev.category) ? prev.category : (catList[0] || ""),
    }));
  }

  async function submitUpload(e) {
    e.preventDefault();
    if (!form.title.trim() || !form.file || !form.category) {
      showToast("Please provide title, category, and file", "error");
      return;
    }
    setUploading(true);
    try {
      await uploadLibraryDocument({
        title: form.title.trim(),
        category: form.category,
        file: form.file,
      });
      setForm((prev) => ({ title: "", category: prev.category, file: null }));
      await refresh();
      showToast("Document uploaded", "success");
    } catch (err) {
      showToast(String(err.message || err), "error");
    } finally {
      setUploading(false);
    }
  }

  async function submitCategory(e) {
    e.preventDefault();
    const name = (newCategoryName || "").trim();
    if (!name) {
      showToast("Please enter a category name", "error");
      return;
    }
    setAddingCategory(true);
    try {
      await createLibraryCategory(name);
      setNewCategoryName("");
      await refresh();
      setForm((prev) => ({ ...prev, category: name }));
      showToast("Category added", "success");
    } catch (err) {
      showToast(String(err.message || err), "error");
    } finally {
      setAddingCategory(false);
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
    <div className="page-wrap library-page">
      <div className="card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <div>
            <h2 style={{ margin: 0 }}>Company Library</h2>
            <div className="muted">Policies, templates and process documents.</div>
          </div>
        </div>
      </div>

      {isLibraryManager && (
        <div className="card" style={{ marginTop: 12 }}>
          <div style={{ fontWeight: 900, marginBottom: 8 }}>Add Category</div>
          <form className="row" onSubmit={submitCategory} style={{ marginBottom: 12 }}>
            <div className="field" style={{ flex: "1 1 260px" }}>
              <label>Category Name</label>
              <input
                value={newCategoryName}
                onChange={(e) => setNewCategoryName(e.target.value)}
                placeholder="e.g. Compliance"
              />
            </div>
            <div style={{ alignSelf: "end" }}>
              <button className="btn" type="submit" disabled={addingCategory}>
                {addingCategory ? "Adding..." : "Add Category"}
              </button>
            </div>
          </form>

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
                {allCategories.map((c) => (
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
        {allCategories.map((category) => {
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
                        {isLibraryManager && (
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
