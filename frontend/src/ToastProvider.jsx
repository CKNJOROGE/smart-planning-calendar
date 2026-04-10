import React, { createContext, useCallback, useContext, useMemo, useState } from "react";

const ToastContext = createContext({ showToast: () => {} });

let nextId = 1;

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const showToast = useCallback((message, type = "info", options = {}) => {
    const id = nextId++;
    const toast = {
      id,
      message,
      type,
      actionLabel: options.actionLabel || "",
      onAction: typeof options.onAction === "function" ? options.onAction : null,
    };
    setToasts((prev) => [...prev, toast]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3200);
  }, []);

  const value = useMemo(() => ({ showToast }), [showToast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="toast-stack">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast-${t.type}`}>
            <div style={{ flex: "1 1 auto" }}>{t.message}</div>
            {t.onAction && t.actionLabel && (
              <button
                type="button"
                className="toast-action"
                onClick={() => {
                  t.onAction();
                  setToasts((prev) => prev.filter((toast) => toast.id !== t.id));
                }}
              >
                {t.actionLabel}
              </button>
            )}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}
