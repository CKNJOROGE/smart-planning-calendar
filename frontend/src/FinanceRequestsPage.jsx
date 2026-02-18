import React from "react";

const requestTypes = [
  {
    title: "Cash Reimbursement",
    description: "Submit expenses already paid and request refund with supporting documents.",
  },
  {
    title: "Cash Requisition",
    description: "Request funds in advance for approved operational or project activities.",
  },
  {
    title: "Authority to Incur Expenditure",
    description: "Seek approval before committing company funds for planned expenditure.",
  },
  {
    title: "Salary Advance Request",
    description: "Request salary advance with justification and proposed recovery terms.",
  },
];

export default function FinanceRequestsPage() {
  return (
    <div className="page-wrap">
      <div className="card" style={{ marginBottom: 12 }}>
        <div style={{ fontWeight: 900, fontSize: 18 }}>Finance Requests</div>
        <div className="muted">
          Manage staff money-related request workflows from one place.
        </div>
      </div>

      <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))" }}>
        {requestTypes.map((item) => (
          <div key={item.title} className="card">
            <div style={{ fontWeight: 800, marginBottom: 6 }}>{item.title}</div>
            <div className="muted" style={{ marginBottom: 10 }}>{item.description}</div>
            <div className="pill">Form setup in progress</div>
          </div>
        ))}
      </div>
    </div>
  );
}
