import React from "react";
import { useNavigate } from "react-router-dom";

export default function IndividualGoalsPage() {
  const navigate = useNavigate();

  return (
    <div className="page-wrap">
      <div className="card" style={{ marginBottom: 12 }}>
        <div style={{ fontWeight: 900, fontSize: 18 }}>Individual Goals</div>
        <div className="muted">This section is reserved for individual goals for your department.</div>
      </div>

      <div className="card">
        <div className="muted" style={{ marginBottom: 10 }}>
          Individual goals implementation is next. You can return to Department Goals for now.
        </div>
        <button className="btn" type="button" onClick={() => navigate("/performance-management")}>
          Back to Performance Management
        </button>
      </div>
    </div>
  );
}
