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

const COMPANY_NAME = "SUSTENIR HUMAN RESOURCE CONSULTANCY LTD";

async function generatePayslipPDF(run, user, doc) {
  const monthYear = run.payroll_month 
    ? new Date(run.payroll_month + "T00:00:00").toLocaleDateString("en-KE", { year: "numeric", month: "long" })
    : "-";
  const employeeName = user?.name || "Employee";
  
  try {
    const logoImg = new Image();
    logoImg.src = "/logo.png";
    await new Promise((resolve, reject) => {
      logoImg.onload = resolve;
      logoImg.onerror = reject;
      setTimeout(reject, 1000);
    });
    const imgProps = doc.getImageProperties("/logo.png");
    const imgWidth = 30;
    const imgHeight = (imgProps.height * imgWidth) / imgProps.width;
    doc.addImage("/logo.png", "PNG", 20, 10, imgWidth, imgHeight);
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.text(COMPANY_NAME, 55, 18);
  } catch (e) {
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.text(COMPANY_NAME, 105, 18, { align: "center" });
  }
  
  doc.setFontSize(18);
  doc.setFont("helvetica", "bold");
  doc.text("PAYSLIP", 105, 35, { align: "center" });
  
  doc.setFontSize(12);
  doc.setFont("helvetica", "normal");
  doc.text(monthYear, 105, 43, { align: "center" });
  
  doc.setLineWidth(0.5);
  doc.line(20, 50, 190, 50);
  
  doc.setFontSize(11);
  doc.text("Employee Name:", 20, 60);
  doc.text(employeeName, 70, 60);
  
  doc.text("Pay Date:", 20, 68);
  doc.text(run.pay_date ? new Date(run.pay_date + "T00:00:00").toLocaleDateString("en-KE") : "Not set", 70, 68);
  
  doc.text("Payroll Status:", 20, 76);
  doc.text(payrollStatusLabel(run.status, run.employee_confirmed), 70, 76);
  
  doc.line(20, 90, 190, 90);
  
  doc.setFontSize(12);
  doc.text("EARNINGS", 20, 100);
  doc.line(20, 103, 190, 103);
  
  const earningsData = [
    ["Basic Salary", fmtCurrency(run.basic_salary)],
    ["Housing Allowance", fmtCurrency(run.housing_allowance)],
    ["Transport Allowance", fmtCurrency(run.transport_allowance)],
    ["Other Allowance", fmtCurrency(run.other_allowance)],
    ["Gross Cash Pay", fmtCurrency(run.gross_cash_pay)],
  ];
  
  doc.autoTable({
    startY: 107,
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
  const [expandedRows, setExpandedRows] = useState({});

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

  async function handleDownloadPDF(run) {
    const doc = new jsPDF();
    const monthYear = run.payroll_month 
      ? new Date(run.payroll_month + "T00:00:00").toLocaleDateString("en-KE", { year: "numeric", month: "long" })
      : "Payslip";
    const fileName = `${current?.name || "Employee"} - ${monthYear}.pdf`;
    await generatePayslipPDF(run, current, doc);
    doc.save(fileName);
  }

  function toggleRow(runId) {
    setExpandedRows(prev => ({ ...prev, [runId]: !prev[runId] }));
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
                <th style={{ width: 40 }}></th>
                <th>Month</th>
                <th style={{ textAlign: "right" }}>Basic Salary</th>
                <th style={{ textAlign: "right" }}>Housing</th>
                <th style={{ textAlign: "right" }}>Transport</th>
                <th style={{ textAlign: "right" }}>Other Allow.</th>
                <th style={{ textAlign: "right" }}>Gross Cash</th>
                <th style={{ textAlign: "right" }}>NSSF</th>
                <th style={{ textAlign: "right" }}>SHIF</th>
                <th style={{ textAlign: "right" }}>PAYE</th>
                <th style={{ textAlign: "right" }}>AHL</th>
                <th style={{ textAlign: "right" }}>Pension</th>
                <th style={{ textAlign: "right" }}>Adv. Ded.</th>
                <th style={{ textAlign: "right" }}>Total Ded.</th>
                <th style={{ textAlign: "right" }}>Net Pay</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {filteredRuns.map((run) => (
                <React.Fragment key={run.id}>
                  <tr>
                    <td>
                      <button
                        type="button"
                        onClick={() => toggleRow(run.id)}
                        style={{ background: "none", border: "none", cursor: "pointer", fontSize: 18 }}
                      >
                        {expandedRows[run.id] ? "▼" : "▶"}
                      </button>
                    </td>
                    <td>
                      {run.payroll_month 
                        ? new Date(run.payroll_month + "T00:00:00").toLocaleDateString("en-KE", { year: "numeric", month: "short" })
                        : "-"}
                    </td>
                    <td style={{ textAlign: "right" }}>{fmtCurrency(run.basic_salary)}</td>
                    <td style={{ textAlign: "right" }}>{fmtCurrency(run.housing_allowance)}</td>
                    <td style={{ textAlign: "right" }}>{fmtCurrency(run.transport_allowance)}</td>
                    <td style={{ textAlign: "right" }}>{fmtCurrency(run.other_allowance)}</td>
                    <td style={{ textAlign: "right", fontWeight: 600 }}>{fmtCurrency(run.gross_cash_pay)}</td>
                    <td style={{ textAlign: "right" }}>{fmtCurrency(run.nssf_employee)}</td>
                    <td style={{ textAlign: "right" }}>{fmtCurrency(run.shif_employee)}</td>
                    <td style={{ textAlign: "right" }}>{fmtCurrency(run.paye_after_reliefs)}</td>
                    <td style={{ textAlign: "right" }}>{fmtCurrency(run.ahl_employee)}</td>
                    <td style={{ textAlign: "right" }}>{fmtCurrency(run.pension_employee)}</td>
                    <td style={{ textAlign: "right" }}>{fmtCurrency(run.salary_advance_deduction || 0)}</td>
                    <td style={{ textAlign: "right", fontWeight: 600 }}>{fmtCurrency(run.total_deductions)}</td>
                    <td style={{ textAlign: "right", fontWeight: 700, fontSize: 16, color: "#16a34a" }}>{fmtCurrency(run.net_pay)}</td>
                    <td>
                      <span className={`dashboard-status-badge ${statusPillClass(run.status, run.employee_confirmed)}`}>
                        {payrollStatusLabel(run.status, run.employee_confirmed)}
                      </span>
                    </td>
                  </tr>
                  {expandedRows[run.id] && (
                    <tr>
                      <td colSpan={16} style={{ background: "#f9fafb", padding: 16 }}>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
                          <div>
                            <div style={{ fontWeight: 900, marginBottom: 8 }}>EARNINGS</div>
                            <table style={{ width: "100%", fontSize: 13 }}>
                              <tbody>
                                <tr><td>Basic Salary</td><td style={{ textAlign: "right" }}>{fmtCurrency(run.basic_salary)}</td></tr>
                                <tr><td>Housing Allowance</td><td style={{ textAlign: "right" }}>{fmtCurrency(run.housing_allowance)}</td></tr>
                                <tr><td>Transport Allowance</td><td style={{ textAlign: "right" }}>{fmtCurrency(run.transport_allowance)}</td></tr>
                                <tr><td>Other Allowance</td><td style={{ textAlign: "right" }}>{fmtCurrency(run.other_allowance)}</td></tr>
                                <tr style={{ fontWeight: 700, borderTop: "1px solid #ccc" }}><td>Gross Cash Pay</td><td style={{ textAlign: "right" }}>{fmtCurrency(run.gross_cash_pay)}</td></tr>
                              </tbody>
                            </table>
                          </div>
                          <div>
                            <div style={{ fontWeight: 900, marginBottom: 8 }}>DEDUCTIONS</div>
                            <table style={{ width: "100%", fontSize: 13 }}>
                              <tbody>
                                <tr><td>NSSF (Employee)</td><td style={{ textAlign: "right" }}>{fmtCurrency(run.nssf_employee)}</td></tr>
                                <tr><td>SHIF</td><td style={{ textAlign: "right" }}>{fmtCurrency(run.shif_employee)}</td></tr>
                                <tr><td>PAYE</td><td style={{ textAlign: "right" }}>{fmtCurrency(run.paye_after_reliefs)}</td></tr>
                                <tr><td>AHL</td><td style={{ textAlign: "right" }}>{fmtCurrency(run.ahl_employee)}</td></tr>
                                <tr><td>Pension</td><td style={{ textAlign: "right" }}>{fmtCurrency(run.pension_employee)}</td></tr>
                                <tr><td>Salary Advance Deduction</td><td style={{ textAlign: "right" }}>{fmtCurrency(run.salary_advance_deduction || 0)}</td></tr>
                                <tr style={{ fontWeight: 700, borderTop: "1px solid #ccc" }}><td>Total Deductions</td><td style={{ textAlign: "right" }}>{fmtCurrency(run.total_deductions)}</td></tr>
                              </tbody>
                            </table>
                            <div style={{ marginTop: 12, padding: 12, background: "#dcfce7", borderRadius: 8, fontWeight: 700, fontSize: 16 }}>
                              NET PAY: {fmtCurrency(run.net_pay)}
                            </div>
                            <div style={{ marginTop: 12, display: "flex", gap: 8 }}>
                              <button className="btn" type="button" onClick={() => handleDownloadPDF(run)}>Download PDF</button>
                              {run.status !== "paid" && (
                                run.employee_confirmed ? (
                                  <button className="btn" type="button" onClick={() => handleConfirm(run.id, true)}>Undo Confirmation</button>
                                ) : (
                                  <button className="btn btn-primary" type="button" onClick={() => handleConfirm(run.id, false)}>Confirm Payroll</button>
                                )
                              )}
                            </div>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
