import React, { useEffect, useState, useMemo } from "react";
import { me, listMyPayrollRuns, confirmPayrollRun, unconfirmPayrollRun } from "./api";
import jsPDF from "jspdf";
import "jspdf-autotable";

function fmtCurrency(amount) {
  if (amount == null) return "-";
  return "KES " + Number(amount).toLocaleString("en-KE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function payrollStatusLabel(status, confirmed) {
  if (status === "paid") return "Paid";
  if (status === "approved") {
    if (confirmed) return "Approved - Ready for Payment";
    return "Pending Your Confirmation";
  }
  if (status === "draft") {
    if (confirmed) return "Confirmed - Awaiting Approval";
    return "Pending Your Confirmation";
  }
  return status || "-";
}

function statusPillClass(status, confirmed) {
  const s = (status || "").toLowerCase();
  if (s === "paid") return "dashboard-status-ok";
  if (confirmed) return "dashboard-status-info";
  if (s === "approved") return "dashboard-status-warn";
  return "dashboard-status-warn";
}

function generatePayslipPDF(run, user, doc) {
  const monthYear = run.payroll_month 
    ? new Date(run.payroll_month + "T00:00:00").toLocaleDateString("en-KE", { year: "numeric", month: "long" })
    : "-";
  const employeeName = user?.name || "Employee";
  
  doc.setFontSize(18);
  doc.text("PAYSLIP", 105, 20, { align: "center" });
  
  doc.setFontSize(12);
  doc.text(monthYear, 105, 28, { align: "center" });
  
  doc.setLineWidth(0.5);
  doc.line(20, 35, 190, 35);
  
  doc.setFontSize(11);
  doc.text("Employee Name:", 20, 45);
  doc.text(employeeName, 70, 45);
  
  doc.text("Employee ID:", 20, 53);
  doc.text(String(user?.id || "-"), 70, 53);
  
  doc.text("Pay Date:", 20, 61);
  doc.text(run.pay_date ? new Date(run.pay_date + "T00:00:00").toLocaleDateString("en-KE") : "Not set", 70, 61);
  
  doc.text("Payroll Status:", 20, 69);
  doc.text(payrollStatusLabel(run.status, run.employee_confirmed), 70, 69);
  
  doc.line(20, 75, 190, 75);
  
  doc.setFontSize(12);
  doc.text("EARNINGS", 20, 85);
  doc.line(20, 88, 190, 88);
  
  const earningsData = [
    ["Basic Salary", fmtCurrency(run.basic_salary)],
    ["Housing Allowance", fmtCurrency(run.housing_allowance)],
    ["Transport Allowance", fmtCurrency(run.transport_allowance)],
    ["Other Allowance", fmtCurrency(run.other_allowance)],
    ["Gross Cash Pay", fmtCurrency(run.gross_cash_pay)],
  ];
  
  doc.autoTable({
    startY: 92,
    head: [["Description", "Amount"]],
    body: earningsData,
    theme: "plain",
    styles: { fontSize: 10 },
    columnStyles: { 0: { cellWidth: 80 }, 1: { cellWidth: 40, halign: "right" } },
    margin: { left: 20, right: 20 },
  });
  
  const afterEarningsY = doc.lastAutoTable.finalY + 10;
  
  doc.setFontSize(12);
  doc.text("DEDUCTIONS", 20, afterEarningsY);
  doc.line(20, afterEarningsY + 3, 190, afterEarningsY + 3);
  
  const deductionsData = [
    ["NSSF (Employee)", fmtCurrency(run.nssf_employee)],
    ["SHIF", fmtCurrency(run.shif_employee)],
    ["PAYE", fmtCurrency(run.paye_after_reliefs)],
    ["AHL", fmtCurrency(run.ahl_employee)],
    ["Pension", fmtCurrency(run.pension_employee)],
    ["Salary Advance Deduction", fmtCurrency(run.salary_advance_deduction || 0)],
    ["Total Deductions", fmtCurrency(run.total_deductions)],
  ];
  
  doc.autoTable({
    startY: afterEarningsY + 7,
    head: [["Description", "Amount"]],
    body: deductionsData,
    theme: "plain",
    styles: { fontSize: 10 },
    columnStyles: { 0: { cellWidth: 80 }, 1: { cellWidth: 40, halign: "right" } },
    margin: { left: 20, right: 20 },
  });
  
  const afterDeductionsY = doc.lastAutoTable.finalY + 15;
  
  doc.setFillColor(240, 240, 240);
  doc.rect(20, afterDeductionsY, 170, 20, "F");
  
  doc.setFontSize(14);
  doc.text("NET PAY", 25, afterDeductionsY + 14);
  doc.setFontSize(14);
  doc.text(fmtCurrency(run.net_pay), 170, afterDeductionsY + 14, { align: "right" });
  
  doc.setFontSize(9);
  doc.setTextColor(100, 100, 100);
  doc.text("This is a computer-generated document. No signature required.", 105, afterDeductionsY + 35, { align: "center" });
}

export default function EmployeePayrollPage() {
  const [current, setCurrent] = useState(null);
  const [runs, setRuns] = useState([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [filter, setFilter] = useState("");

  useEffect(() => {
    me().then(setCurrent).catch(() => setCurrent(null));
  }, []);

  useEffect(() => {
    if (!current) return;
    setBusy(true);
    setErr("");
    listMyPayrollRuns()
      .then(setRuns)
      .catch((e) => setErr(String(e.message || e)))
      .finally(() => setBusy(false));
  }, [current]);

  const filteredRuns = useMemo(() => {
    if (!filter) return runs;
    const f = filter.toLowerCase();
    return runs.filter((r) => {
      const month = r.payroll_month || "";
      const status = (r.status || "") + " " + payrollStatusLabel(r.status, r.employee_confirmed);
      return month.includes(f) || status.toLowerCase().includes(f);
    });
  }, [runs, filter]);

  async function handleConfirm(runId, confirmed) {
    try {
      if (confirmed) {
        await unconfirmPayrollRun(runId);
      } else {
        await confirmPayrollRun(runId);
      }
      const updated = await listMyPayrollRuns();
      setRuns(updated);
    } catch (e) {
      alert("Error: " + (e.message || e));
    }
  }

  function handleDownloadPDF(run) {
    const doc = new jsPDF();
    const monthYear = run.payroll_month 
      ? new Date(run.payroll_month + "T00:00:00").toLocaleDateString("en-KE", { year: "numeric", month: "long" })
      : "Payslip";
    const fileName = `${current?.name || "Employee"} - ${monthYear}.pdf`;
    generatePayslipPDF(run, current, doc);
    doc.save(fileName);
  }

  if (busy) {
    return (
      <div className="page-wrap">
        <div className="card">
          <div style={{ padding: 40, textAlign: "center" }}>Loading your payroll...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="page-wrap">
      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ fontWeight: 900, fontSize: 18 }}>My Payroll</div>
        <div className="muted" style={{ marginTop: 6 }}>
          View your monthly payroll details and confirm accuracy. Your confirmation is required before payroll can be disbursed.
        </div>
        {err && <div className="error" style={{ marginTop: 10 }}>{err}</div>}
      </div>

      <div className="card">
        <div style={{ marginBottom: 12, display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
          <input
            type="text"
            placeholder="Filter by month..."
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            style={{ width: "100%", maxWidth: 300 }}
          />
          <div className="muted" style={{ fontSize: 14 }}>
            {filteredRuns.length} record{filteredRuns.length !== 1 ? "s" : ""}
          </div>
        </div>

        {!filteredRuns.length && (
          <div style={{ padding: 40, textAlign: "center" }} className="muted">
            No payroll records found.
          </div>
        )}

        {filteredRuns.length > 0 && (
          <table className="data-table" style={{ width: "100%" }}>
            <thead>
              <tr>
                <th>Month</th>
                <th>Pay Date</th>
                <th style={{ textAlign: "right" }}>Gross Pay</th>
                <th style={{ textAlign: "right" }}>Deductions</th>
                <th style={{ textAlign: "right" }}>Net Pay</th>
                <th>Status</th>
                <th style={{ width: 180 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredRuns.map((run) => (
                <tr key={run.id}>
                  <td>
                    {run.payroll_month 
                      ? new Date(run.payroll_month + "T00:00:00").toLocaleDateString("en-KE", { year: "numeric", month: "long" })
                      : "-"}
                  </td>
                  <td>
                    {run.pay_date 
                      ? new Date(run.pay_date + "T00:00:00").toLocaleDateString("en-KE")
                      : "Not set"}
                  </td>
                  <td style={{ textAlign: "right", fontWeight: 600 }}>{fmtCurrency(run.gross_cash_pay)}</td>
                  <td style={{ textAlign: "right" }}>{fmtCurrency(run.total_deductions)}</td>
                  <td style={{ textAlign: "right", fontWeight: 700, fontSize: 15 }}>{fmtCurrency(run.net_pay)}</td>
                  <td>
                    <span className={`dashboard-status-badge ${statusPillClass(run.status, run.employee_confirmed)}`}>
                      {payrollStatusLabel(run.status, run.employee_confirmed)}
                    </span>
                  </td>
                  <td>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <button
                        className="btn"
                        type="button"
                        onClick={() => handleDownloadPDF(run)}
                        title="Download Payslip PDF"
                      >
                        Download PDF
                      </button>
                      {run.status !== "paid" && (
                        run.employee_confirmed ? (
                          <button
                            className="btn"
                            type="button"
                            onClick={() => handleConfirm(run.id, true)}
                          >
                            Undo
                          </button>
                        ) : (
                          <button
                            className="btn btn-primary"
                            type="button"
                            onClick={() => handleConfirm(run.id, false)}
                          >
                            Confirm
                          </button>
                        )
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
