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
import LoadingState from "./LoadingState";

function normalizeCategoryTree(rows) {
  return (rows || []).map((row) => ({
    name: String(row?.name || "").trim(),
    children: (row?.children || []).map((child) => ({
      id: child?.id ?? null,
      name: String(child?.name || "").trim(),
      parent_category: String(child?.parent_category || row?.name || "").trim(),
    })).filter((child) => child.name),
  })).filter((row) => row.name);
}

function subcategoryKey(categoryName, subcategoryName) {
  return `${categoryName}::${subcategoryName}`;
}

export default function LibraryPage() {
  const [user, setUser] = useState(null);
  const [docs, setDocs] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [addingCategory, setAddingCategory] = useState(false);
  const [expandedCategories, setExpandedCategories] = useState({});
  const [expandedSubcategories, setExpandedSubcategories] = useState({});
  const [newCategoryName, setNewCategoryName] = useState("");
  const [newCategoryParent, setNewCategoryParent] = useState("");
  const [form, setForm] = useState({
    title: "",
    category: "",
    subcategory: "",
    file: null,
  });
  const { showToast } = useToast();
  const isLibraryManager = user?.role === "admin" || user?.role === "ceo";

  async function loadLibraryData() {
    const [items, categoryRows] = await Promise.all([
      listLibraryDocuments(),
      listLibraryCategories(),
    ]);
    const tree = normalizeCategoryTree(categoryRows);
    setDocs(items || []);
    setCategories(tree);
    setExpandedCategories((prev) => {
      const next = { ...prev };
      tree.forEach((category) => {
        if (!(category.name in next)) {
          next[category.name] = true;
        }
      });
      return next;
    });
    setExpandedSubcategories((prev) => {
      const next = { ...prev };
      tree.forEach((category) => {
        category.children.forEach((child) => {
          const key = subcategoryKey(category.name, child.name);
          if (!(key in next)) {
            next[key] = true;
          }
        });
      });
      return next;
    });
    setForm((prev) => {
      const topLevelCategories = tree.map((category) => category.name);
      const nextCategory = topLevelCategories.includes(prev.category) ? prev.category : (topLevelCategories[0] || "");
      const selectedCategory = tree.find((category) => category.name === nextCategory);
      const validSubcategories = (selectedCategory?.children || []).map((child) => child.name);
      const nextSubcategory = validSubcategories.includes(prev.subcategory) ? prev.subcategory : "";
      return {
        ...prev,
        category: nextCategory,
        subcategory: nextSubcategory,
      };
    });
  }

  useEffect(() => {
    (async () => {
      const u = await me();
      setUser(u);
      await loadLibraryData();
      setLoading(false);
    })().catch((e) => {
      showToast(String(e.message || e), "error");
      setLoading(false);
    });
  }, [showToast]);

  const topLevelCategoryNames = useMemo(
    () => categories.map((category) => category.name),
    [categories],
  );

  const categoryMap = useMemo(() => {
    const map = new Map();
    categories.forEach((category) => {
      map.set(category.name, category);
    });
    return map;
  }, [categories]);

  const grouped = useMemo(() => {
    const map = new Map();
    categories.forEach((category) => {
      map.set(category.name, {
        uncategorized: [],
        subcategories: new Map(category.children.map((child) => [child.name, []])),
      });
    });

    for (const d of docs) {
      if (!map.has(d.category)) {
        map.set(d.category, { uncategorized: [], subcategories: new Map() });
      }
      const bucket = map.get(d.category);
      if (d.subcategory) {
        if (!bucket.subcategories.has(d.subcategory)) {
          bucket.subcategories.set(d.subcategory, []);
        }
        bucket.subcategories.get(d.subcategory).push(d);
      } else {
        bucket.uncategorized.push(d);
      }
    }

    return map;
  }, [categories, docs]);

  const selectedCategory = categoryMap.get(form.category) || null;
  const selectedCategorySubcategories = selectedCategory?.children || [];

  async function refresh() {
    await loadLibraryData();
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
        subcategory: form.subcategory || "",
        file: form.file,
      });
      setForm((prev) => ({ title: "", category: prev.category, subcategory: prev.subcategory, file: null }));
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
      await createLibraryCategory(name, newCategoryParent);
      setNewCategoryName("");
      await refresh();
      if (newCategoryParent) {
        setExpandedCategories((prev) => ({ ...prev, [newCategoryParent]: true }));
        setExpandedSubcategories((prev) => ({ ...prev, [subcategoryKey(newCategoryParent, name)]: true }));
        setForm((prev) => ({ ...prev, category: newCategoryParent, subcategory: name }));
        showToast("Subcategory added", "success");
      } else {
        setForm((prev) => ({ ...prev, category: name, subcategory: "" }));
        showToast("Category added", "success");
      }
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

  function toggleCategory(categoryName) {
    setExpandedCategories((prev) => ({ ...prev, [categoryName]: prev[categoryName] === false }));
  }

  function toggleSubcategory(categoryName, subcategoryName) {
    const key = subcategoryKey(categoryName, subcategoryName);
    setExpandedSubcategories((prev) => ({ ...prev, [key]: prev[key] === false }));
  }

  if (loading) {
    return (
      <div className="page-wrap library-page">
        <div className="card">
          <LoadingState label="Loading library..." />
        </div>
      </div>
    );
  }

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
          <div style={{ fontWeight: 900, marginBottom: 8 }}>Manage Categories</div>
          <form className="row" onSubmit={submitCategory} style={{ marginBottom: 12 }}>
            <div className="field" style={{ flex: "1 1 220px" }}>
              <label>Parent Category</label>
              <select
                value={newCategoryParent}
                onChange={(e) => setNewCategoryParent(e.target.value)}
              >
                <option value="">Top-level category</option>
                {topLevelCategoryNames.map((categoryName) => (
                  <option key={categoryName} value={categoryName}>{categoryName}</option>
                ))}
              </select>
            </div>
            <div className="field" style={{ flex: "1 1 260px" }}>
              <label>{newCategoryParent ? "Subcategory Name" : "Category Name"}</label>
              <input
                value={newCategoryName}
                onChange={(e) => setNewCategoryName(e.target.value)}
                placeholder={newCategoryParent ? "e.g. HR Policies" : "e.g. Compliance"}
              />
            </div>
            <div style={{ alignSelf: "end" }}>
              <button className="btn" type="submit" disabled={addingCategory}>
                {addingCategory ? "Saving..." : (newCategoryParent ? "Add Subcategory" : "Add Category")}
              </button>
            </div>
          </form>

          <div style={{ fontWeight: 900, marginBottom: 8 }}>Upload Document</div>
          <form className="row" onSubmit={submitUpload}>
            <div className="field" style={{ flex: "1 1 240px" }}>
              <label>Title</label>
              <input
                value={form.title}
                onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))}
                placeholder="e.g. Standard Employment Contract v2"
              />
            </div>
            <div className="field" style={{ flex: "1 1 220px" }}>
              <label>Category</label>
              <select
                value={form.category}
                onChange={(e) => {
                  const nextCategory = e.target.value;
                  const nextNode = categoryMap.get(nextCategory);
                  const validSubcategories = (nextNode?.children || []).map((child) => child.name);
                  setForm((prev) => ({
                    ...prev,
                    category: nextCategory,
                    subcategory: validSubcategories.includes(prev.subcategory) ? prev.subcategory : "",
                  }));
                }}
              >
                {topLevelCategoryNames.map((categoryName) => (
                  <option key={categoryName} value={categoryName}>{categoryName}</option>
                ))}
              </select>
            </div>
            <div className="field" style={{ flex: "1 1 220px" }}>
              <label>Subcategory</label>
              <select
                value={form.subcategory}
                onChange={(e) => setForm((prev) => ({ ...prev, subcategory: e.target.value }))}
                disabled={!selectedCategorySubcategories.length}
              >
                <option value="">No subcategory</option>
                {selectedCategorySubcategories.map((child) => (
                  <option key={child.name} value={child.name}>{child.name}</option>
                ))}
              </select>
            </div>
            <div className="field" style={{ flex: "1 1 240px" }}>
              <label>File</label>
              <input
                type="file"
                onChange={(e) => setForm((prev) => ({ ...prev, file: e.target.files?.[0] || null }))}
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
        {categories.map((category) => {
          const bucket = grouped.get(category.name) || { uncategorized: [], subcategories: new Map() };
          const subcategoryNames = Array.from(new Set([
            ...category.children.map((child) => child.name),
            ...Array.from(bucket.subcategories.keys()),
          ])).sort((a, b) => a.localeCompare(b));
          const totalItems = bucket.uncategorized.length + subcategoryNames.reduce(
            (sum, subcategoryName) => sum + (bucket.subcategories.get(subcategoryName)?.length || 0),
            0,
          );
          const categoryExpanded = expandedCategories[category.name] !== false;

          return (
            <div key={category.name} className="card library-category-card">
              <button
                type="button"
                className="library-category-toggle"
                onClick={() => toggleCategory(category.name)}
                aria-expanded={categoryExpanded}
              >
                <span className="library-category-toggle-text">
                  <span className="library-category-chevron" aria-hidden="true">{categoryExpanded ? "v" : ">"}</span>
                  <span>{category.name}</span>
                </span>
                <span className="library-category-meta">{totalItems} item{totalItems === 1 ? "" : "s"}</span>
              </button>

              {categoryExpanded && (
                <div className="library-category-body">
                  {totalItems === 0 ? (
                    <div className="muted">No documents yet.</div>
                  ) : (
                    <>
                      {bucket.uncategorized.length > 0 && (
                        <div className="library-list">
                          {bucket.uncategorized.map((d) => (
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

                      {subcategoryNames.map((subcategoryName) => {
                        const subItems = bucket.subcategories.get(subcategoryName) || [];
                        const isExpanded = expandedSubcategories[subcategoryKey(category.name, subcategoryName)] !== false;
                        return (
                          <div key={subcategoryName} className="library-subcategory">
                            <button
                              type="button"
                              className="library-subcategory-toggle"
                              onClick={() => toggleSubcategory(category.name, subcategoryName)}
                              aria-expanded={isExpanded}
                            >
                              <span className="library-category-toggle-text">
                                <span className="library-category-chevron" aria-hidden="true">{isExpanded ? "v" : ">"}</span>
                                <span>{subcategoryName}</span>
                              </span>
                              <span className="library-category-meta">{subItems.length} item{subItems.length === 1 ? "" : "s"}</span>
                            </button>

                            {isExpanded && (
                              subItems.length === 0 ? (
                                <div className="muted library-subcategory-empty">No documents yet.</div>
                              ) : (
                                <div className="library-list">
                                  {subItems.map((d) => (
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
                              )
                            )}
                          </div>
                        );
                      })}
                    </>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
