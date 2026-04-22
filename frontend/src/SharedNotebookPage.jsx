import { useEffect, useState } from "react";
import { getSharedNotebook, me, updateSharedNotebook } from "./api";
import { useToast } from "./ToastProvider";
import LoadingState from "./LoadingState";

function formatDateTime(value) {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleString();
}

export default function SharedNotebookPage() {
  const { showToast } = useToast();

  const [busy, setBusy] = useState(true);
  const [saving, setSaving] = useState(false);
  const [mode, setMode] = useState("view");
  const [notebook, setNotebook] = useState(null);
  const [draftContent, setDraftContent] = useState("");
  const [err, setErr] = useState("");

  const isEditMode = mode === "edit";

  useEffect(() => {
    (async () => {
      setBusy(true);
      setErr("");
      try {
        const [, note] = await Promise.all([me(), getSharedNotebook()]);
        setNotebook(note);
        setDraftContent(note?.content || "");
      } catch (e) {
        const msg = String(e.message || e);
        setErr(msg);
        showToast(msg, "error");
      } finally {
        setBusy(false);
      }
    })();
  }, [showToast]);

  const isDirty = (draftContent || "") !== (notebook?.content || "");

  async function handleSave() {
    setErr("");
    setSaving(true);
    try {
      const updated = await updateSharedNotebook(draftContent);
      setNotebook(updated);
      setDraftContent(updated?.content || "");
      setMode("view");
      showToast("Shared notebook updated", "success");
    } catch (e) {
      const msg = String(e.message || e);
      setErr(msg);
      showToast(msg, "error");
    } finally {
      setSaving(false);
    }
  }

  if (busy && !notebook) {
    return (
      <div className="page-wrap">
        <div className="card">
          <LoadingState label="Loading shared notebook..." />
        </div>
      </div>
    );
  }

  return (
    <div className="page-wrap">
      <div className="card" style={{ marginBottom: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <div>
            <div style={{ fontWeight: 900, fontSize: 20 }}>Shared Notebook</div>
            <div className="muted">A shared space for notes, pasted text, reminders, and working drafts.</div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span className={`task-mode-label ${!isEditMode ? "active" : ""}`}>View</span>
            <button
              type="button"
              className={`task-mode-toggle ${isEditMode ? "is-edit" : ""}`}
              onClick={() => setMode((prev) => (prev === "edit" ? "view" : "edit"))}
              role="switch"
              aria-checked={isEditMode}
              aria-label={`Switch to ${isEditMode ? "view" : "edit"} mode`}
            >
              <span className="task-mode-toggle-knob" />
            </button>
            <span className={`task-mode-label ${isEditMode ? "active" : ""}`}>Edit</span>
          </div>
        </div>
      </div>

      {err && <div className="error">{err}</div>}

      <div className="card" style={{ marginBottom: 12 }}>
        <div className="muted" style={{ marginBottom: 10 }}>
          Last updated: {formatDateTime(notebook?.updated_at)}{notebook?.updated_by?.name ? ` by ${notebook.updated_by.name}` : ""}
        </div>

        {!isEditMode ? (
          <div
            style={{
              minHeight: 320,
              padding: 18,
              borderRadius: 14,
              border: "1px solid rgba(255, 255, 255, 0.32)",
              background: "rgba(255, 255, 255, 0.18)",
              backdropFilter: "blur(18px)",
              whiteSpace: "pre-wrap",
              lineHeight: 1.7,
              fontSize: 15,
            }}
          >
            {(notebook?.content || "").trim()
              ? notebook.content
              : <span className="muted">No shared notes yet. Switch to edit mode to start writing.</span>}
          </div>
        ) : (
          <>
            <textarea
              value={draftContent}
              onChange={(e) => setDraftContent(e.target.value)}
              placeholder="Type or paste notes here. Everyone with access will see the same content."
              rows={18}
              style={{
                width: "100%",
                minHeight: 320,
                resize: "vertical",
                padding: 16,
                borderRadius: 14,
                border: "1px solid #cbd5e1",
                fontFamily: "inherit",
                fontSize: 15,
                lineHeight: 1.6,
              }}
            />
            <div className="muted" style={{ marginTop: 8 }}>
              Tip: pasted content is kept as plain text, including line breaks.
            </div>
          </>
        )}

        {isEditMode && (
          <div style={{ marginTop: 12, display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button className="btn btn-primary" type="button" onClick={handleSave} disabled={saving || !isDirty}>
              {saving ? "Saving..." : "Save Notebook"}
            </button>
            <button
              className="btn"
              type="button"
              onClick={() => setDraftContent(notebook?.content || "")}
              disabled={saving || !isDirty}
            >
              Discard Changes
            </button>
          </div>
        )}
      </div>

      <div className="card">
        <div style={{ fontWeight: 800, marginBottom: 6 }}>How it works</div>
        <div className="muted">
          This notebook is shared across all users. Anyone can switch to edit mode, add or paste text, and save it for everyone else to see.
        </div>
      </div>
    </div>
  );
}
