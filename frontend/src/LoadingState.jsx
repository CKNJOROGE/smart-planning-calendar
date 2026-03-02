import React from "react";

export default function LoadingState({ label = "Loading...", compact = false }) {
  return (
    <div className={`loading-state${compact ? " compact" : ""}`} role="status" aria-live="polite" aria-busy="true">
      <span className="loading-spinner" aria-hidden="true" />
      <span className="loading-label">{label}</span>
      <span className="loading-dots" aria-hidden="true">
        <span />
        <span />
        <span />
      </span>
    </div>
  );
}
