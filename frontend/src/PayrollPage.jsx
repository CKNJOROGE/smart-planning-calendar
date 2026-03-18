import React, { useEffect, useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import {
  me,
  getPayrollStatutoryInfo,
  listPayrollEmployees,
  getPayrollProfile,
  updatePayrollProfile,
  previewPayrollRun,
  savePayrollRun,
  listPayrollRuns,
} from "./api";
import { useToast } from "./ToastProvider";
import LoadingState from "./LoadingState";

function fmtCurrency(value) {
  return new Intl.NumberFormat("en-KE", {
    style: "currency",
    currency: "KES",
    maximumFractionDigits: 2,
  }).format(Number(value || 0));
}

function monthStartToday() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
}

function toFieldValue(value) {
  return value == null ? "" : String(value);
}

function toNullableNumber(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

function profileStateFromApi(profile) {
  return {
    payroll_number: profile?.payroll_number || "",
    kra_pin: profile?.kra_pin || "",
    payment_method: profile?.payment_method || "bank_transfer",
    bank_name: profile?.bank_name || "",
    bank_account_name: profile?.bank_account_name || "",
    bank_account_number: profile?.bank_account_number || "",
    active: !!profile?.active,
    basic_salary: toFieldValue(profile?.basic_salary),
    house_allowance: toFieldValue(profile?.house_allowance),
    transport_allowance: toFieldValue(profile?.transport_allowance),
    other_taxable_allowance: toFieldValue(profile?.other_taxable_allowance),
    non_cash_benefit: toFieldValue(profile?.non_cash_benefit),
    tax_exempt_allowance: toFieldValue(profile?.tax_exempt_allowance),
    pension_employee: toFieldValue(profile?.pension_employee),
    pension_employer: toFieldValue(profile?.pension_employer),
    insurance_relief_base: toFieldValue(profile?.insurance_relief_base),
    owner_occupier_interest: toFieldValue(profile?.owner_occupier_interest),
    other_deductions: toFieldValue(profile?.other_deductions),
    nssf_pensionable_pay: toFieldValue(profile?.nssf_pensionable_pay),
    disability_exemption_amount: toFieldValue(profile?.disability_exemption_amount),
    notes: profile?.notes || "",
  };
}

function emptyRunState() {
  return {
    payroll_month: monthStartToday(),
    pay_date: "",
    basic_salary: "",
    house_allowance: "",
    transport_allowance: "",
    other_taxable_allowance: "",
    non_cash_benefit: "",
    tax_exempt_allowance: "",
    bonus: "",
    overtime: "",
    commission: "",
    pension_employee: "",
    pension_employer: "",
    insurance_relief_base: "",
    owner_occupier_interest: "",
    other_deductions: "",
    nssf_pensionable_pay: "",
    disability_exemption_amount: "",
    notes: "",
    status: "draft",
  };
}

function runPayloadFromState(state, employeeId) {
  return {
    employee_id: Number(employeeId),
    payroll_month: state.payroll_month,
    pay_date: state.pay_date || null,
    basic_salary: toNullableNumber(state.basic_salary),
    house_allowance: toNullableNumber(state.house_allowance),
    transport_allowance: toNullableNumber(state.transport_allowance),
    other_taxable_allowance: toNullableNumber(state.other_taxable_allowance),
    non_cash_benefit: toNullableNumber(state.non_cash_benefit),
    tax_exempt_allowance: toNullableNumber(state.tax_exempt_allowance),
    bonus: toNullableNumber(state.bonus),
    overtime: toNullableNumber(state.overtime),
    commission: toNullableNumber(state.commission),
    pension_employee: toNullableNumber(state.pension_employee),
    pension_employer: toNullableNumber(state.pension_employer),
    insurance_relief_base: toNullableNumber(state.insurance_relief_base),
    owner_occupier_interest: toNullableNumber(state.owner_occupier_interest),
    other_deductions: toNullableNumber(state.other_deductions),
    nssf_pensionable_pay: toNullableNumber(state.nssf_pensionable_pay),
    disability_exemption_amount: toNullableNumber(state.disability_exemption_amount),
    notes: state.notes || null,
    status: state.status || "draft",
  };
}

function statChip(label, value) {
  return (
    <div className="pill" style={{ display: "flex", gap: 6, alignItems: "center" }}>
      <span>{label}:</span>
      <b>{value}</b>
    </div>
  );
}

function Field({ label, value, onChange, type = "text", disabled = false }) {
  return (
    <div className="field">
      <label>{label}</label>
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled} />
    </div>
  );
}

function NumberField({ label, value, onChange, disabled = false, helpText = "" }) {
  return (
    <div className="field">
      <label>{label}</label>
      <input type="number" min="0" step="0.01" value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled} />
      {helpText && <div className="helper">{helpText}</div>}
    </div>
  );
}

function SelectField({ label, value, onChange, options, disabled = false }) {
  return (
    <div className="field">
      <label>{label}</label>
      <select value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled}>
        {options.map(([optValue, optLabel]) => (
          <option key={optValue} value={optValue}>{optLabel}</option>
        ))}
      </select>
    </div>
  );
}

export default function PayrollPage() {
  const [current, setCurrent] = useState(null);
  const [busy, setBusy] = useState(true);
  const [employees, setEmployees] = useState([]);
  const [employeeSearch, setEmployeeSearch] = useState("");
  const [selectedEmployeeId, setSelectedEmployeeId] = useState("");
  const [statutory, setStatutory] = useState(null);
  const [profile, setProfile] = useState(null);
  const [profileForm, setProfileForm] = useState(profileStateFromApi(null));
  const [runForm, setRunForm] = useState(emptyRunState());
  const [preview, setPreview] = useState(null);
  const [runs, setRuns] = useState([]);
  const [runsFilter, setRunsFilter] = useState("");
  const [err, setErr] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingRun, setSavingRun] = useState(false);
  const { showToast } = useToast();

  const role = String(current?.role || "").toLowerCase();
  const canOpen = ["finance", "admin", "ceo"].includes(role);
  const canEditSetup = ["finance", "admin", "ceo"].includes(role);

  useEffect(() => {
    (async () => {
      try {
        const meData = await me();
        setCurrent(meData);
        if (!["finance", "admin", "ceo"].includes(String(meData?.role || "").toLowerCase())) {
          return;
        }
        const [statutoryData, employeeRows] = await Promise.all([
          getPayrollStatutoryInfo(),
          listPayrollEmployees(),
        ]);
        setStatutory(statutoryData);
        setEmployees(employeeRows || []);
        if (employeeRows?.length) setSelectedEmployeeId(String(employeeRows[0].id));
      } catch (e) {
        setErr(String(e.message || e));
      } finally {
        setBusy(false);
      }
    })();
  }, []);

  async function loadEmployeePayroll(userId, payrollMonth) {
    if (!userId) return;
    try {
      const [profileData, runRows] = await Promise.all([
        getPayrollProfile(userId),
        listPayrollRuns({ employeeId: userId, payrollMonth }),
      ]);
      setProfile(profileData);
      setProfileForm(profileStateFromApi(profileData));
      setRuns(runRows || []);
      setPreview(null);
    } catch (e) {
      const text = String(e.message || e);
      setErr(text);
      showToast(text, "error");
    }
  }

  useEffect(() => {
    if (!selectedEmployeeId || !canOpen) return;
    loadEmployeePayroll(Number(selectedEmployeeId), runForm.payroll_month);
  }, [selectedEmployeeId, canOpen]);

  useEffect(() => {
    if (!selectedEmployeeId || !canOpen) return;
    listPayrollRuns({ employeeId: Number(selectedEmployeeId), payrollMonth: runForm.payroll_month })
      .then((rows) => setRuns(rows || []))
      .catch(() => {});
  }, [runForm.payroll_month, selectedEmployeeId, canOpen]);

  const filteredEmployees = useMemo(() => {
    const query = employeeSearch.trim().toLowerCase();
    if (!query) return employees;
    return (employees || []).filter((row) =>
      [row.name, row.email, row.department, row.designation, row.role]
        .map((part) => String(part || "").toLowerCase())
        .join(" ")
        .includes(query)
    );
  }, [employees, employeeSearch]);

  const filteredRuns = useMemo(() => {
    const query = runsFilter.trim().toLowerCase();
    if (!query) return runs;
    return (runs || []).filter((row) =>
      [row.payroll_month, row.status, row.notes, row.employee?.name]
        .map((part) => String(part || "").toLowerCase())
        .join(" ")
        .includes(query)
    );
  }, [runs, runsFilter]);

  const selectedEmployee = useMemo(
    () => (employees || []).find((row) => Number(row.id) === Number(selectedEmployeeId)) || null,
    [employees, selectedEmployeeId]
  );

  const profileGross = useMemo(() => (
    Number(profileForm.basic_salary || 0)
    + Number(profileForm.house_allowance || 0)
    + Number(profileForm.transport_allowance || 0)
    + Number(profileForm.other_taxable_allowance || 0)
  ), [profileForm]);

  async function handleSaveProfile() {
    if (!selectedEmployeeId) return;
    setSavingProfile(true);
    setErr("");
    try {
      const payload = {
        payroll_number: profileForm.payroll_number || null,
        kra_pin: profileForm.kra_pin || null,
        payment_method: profileForm.payment_method,
        bank_name: profileForm.bank_name || null,
        bank_account_name: profileForm.bank_account_name || null,
        bank_account_number: profileForm.bank_account_number || null,
        active: !!profileForm.active,
        basic_salary: toNullableNumber(profileForm.basic_salary) ?? 0,
        house_allowance: toNullableNumber(profileForm.house_allowance) ?? 0,
        transport_allowance: toNullableNumber(profileForm.transport_allowance) ?? 0,
        other_taxable_allowance: toNullableNumber(profileForm.other_taxable_allowance) ?? 0,
        non_cash_benefit: toNullableNumber(profileForm.non_cash_benefit) ?? 0,
        tax_exempt_allowance: toNullableNumber(profileForm.tax_exempt_allowance) ?? 0,
        pension_employee: toNullableNumber(profileForm.pension_employee) ?? 0,
        pension_employer: toNullableNumber(profileForm.pension_employer) ?? 0,
        insurance_relief_base: toNullableNumber(profileForm.insurance_relief_base) ?? 0,
        owner_occupier_interest: toNullableNumber(profileForm.owner_occupier_interest) ?? 0,
        other_deductions: toNullableNumber(profileForm.other_deductions) ?? 0,
        nssf_pensionable_pay: toNullableNumber(profileForm.nssf_pensionable_pay),
        disability_exemption_amount: toNullableNumber(profileForm.disability_exemption_amount) ?? 0,
        notes: profileForm.notes || null,
      };
      const saved = await updatePayrollProfile(Number(selectedEmployeeId), payload);
      setProfile(saved);
      setProfileForm(profileStateFromApi(saved));
      showToast("Payroll setup saved", "success");
    } catch (e) {
      const text = String(e.message || e);
      setErr(text);
      showToast(text, "error");
    } finally {
      setSavingProfile(false);
    }
  }

  async function handlePreview() {
    if (!selectedEmployeeId) return;
    setSavingRun(true);
    setErr("");
    try {
      const result = await previewPayrollRun(runPayloadFromState(runForm, selectedEmployeeId));
      setPreview(result);
      showToast("Payroll preview updated", "success");
    } catch (e) {
      const text = String(e.message || e);
      setErr(text);
      showToast(text, "error");
    } finally {
      setSavingRun(false);
    }
  }

  async function handleSaveRun() {
    if (!selectedEmployeeId) return;
    setSavingRun(true);
    setErr("");
    try {
      const result = await savePayrollRun(runPayloadFromState(runForm, selectedEmployeeId));
      setPreview(result);
      const updatedRuns = await listPayrollRuns({ employeeId: Number(selectedEmployeeId), payrollMonth: runForm.payroll_month });
      setRuns(updatedRuns || []);
      showToast("Payroll run saved", "success");
    } catch (e) {
      const text = String(e.message || e);
      setErr(text);
      showToast(text, "error");
    } finally {
      setSavingRun(false);
    }
  }

  if (busy) {
    return (
      <div className="page-wrap">
        <div className="card">
          <LoadingState label="Loading payroll..." />
        </div>
      </div>
    );
  }

  if (current && !canOpen) return <Navigate to="/" replace />;

  return (
    <div className="page-wrap">
      <div className="card" style={{ marginBottom: 12 }}>
        <div style={{ fontWeight: 900, fontSize: 18 }}>Payroll</div>
        <div className="muted" style={{ marginTop: 6 }}>
          Kenya payroll workspace for monthly salary setup, statutory deductions, and payroll runs. Access is limited to finance, admin, and CEO.
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
          {statChip("PAYE", `Bands from ${statutory?.paye_effective_from || "-"}`)}
          {statChip("AHL", `${((statutory?.ahl_rate_employee || 0) * 100).toFixed(1)}% employee + employer`)}
          {statChip("SHIF", `${((statutory?.shif_rate || 0) * 100).toFixed(2)}% min ${fmtCurrency(statutory?.shif_minimum_monthly || 0)}`)}
          {statChip("NSSF", `LEL ${fmtCurrency(statutory?.nssf_lower_earnings_limit || 0)} / UEL ${fmtCurrency(statutory?.nssf_upper_earnings_limit || 0)}`)}
        </div>
        {err && <div className="error" style={{ marginTop: 10 }}>{err}</div>}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "320px minmax(0, 1fr)", gap: 12, alignItems: "start" }}>
        <div className="card">
          <div style={{ fontWeight: 800, marginBottom: 8 }}>Employees</div>
          <div className="field" style={{ marginBottom: 10 }}>
            <label>Search employees</label>
            <input value={employeeSearch} onChange={(e) => setEmployeeSearch(e.target.value)} placeholder="Name, department, role..." />
          </div>
          <div style={{ display: "grid", gap: 8, maxHeight: 720, overflowY: "auto" }}>
            {filteredEmployees.map((row) => {
              const active = Number(selectedEmployeeId) === Number(row.id);
              return (
                <button
                  key={row.id}
                  type="button"
                  className="btn"
                  onClick={() => setSelectedEmployeeId(String(row.id))}
                  style={{
                    textAlign: "left",
                    padding: 12,
                    border: active ? "2px solid #7c3aed" : "1px solid #e2e8f0",
                    background: active ? "rgba(124,58,237,0.08)" : "#fff",
                  }}
                >
                  <div style={{ fontWeight: 800 }}>{row.name}</div>
                  <div className="muted" style={{ fontSize: 12 }}>{row.department || "Unassigned"} | {row.designation || row.role}</div>
                  <div className="muted" style={{ fontSize: 12 }}>{row.email}</div>
                </button>
              );
            })}
            {!filteredEmployees.length && <div className="muted">No employees matched your search.</div>}
          </div>
        </div>

        <div style={{ display: "grid", gap: 12 }}>
          <div className="card">
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
              <div>
                <div style={{ fontWeight: 900, fontSize: 18 }}>{selectedEmployee?.name || "Select an employee"}</div>
                <div className="muted">
                  {selectedEmployee ? `${selectedEmployee.department || "Unassigned"} | ${selectedEmployee.designation || selectedEmployee.role}` : "Choose an employee to manage payroll setup and monthly runs."}
                </div>
              </div>
              {profile && (
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {statChip("Default Gross", fmtCurrency(profileGross))}
                  {statChip("Payment", profile.payment_method || "-")}
                  {statChip("Status", profile.active ? "Active" : "Inactive")}
                </div>
              )}
            </div>
          </div>

          {selectedEmployee && profile && (
            <>
              <div className="card">
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "center", marginBottom: 10 }}>
                  <div>
                    <div style={{ fontWeight: 900 }}>Payroll Setup</div>
                    <div className="muted">Default monthly pay items and recurring relief inputs used as the starting point for payroll runs.</div>
                  </div>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
                  <Field label="Payroll Number" value={profileForm.payroll_number} onChange={(v) => setProfileForm((p) => ({ ...p, payroll_number: v }))} disabled={!canEditSetup} />
                  <Field label="KRA PIN" value={profileForm.kra_pin} onChange={(v) => setProfileForm((p) => ({ ...p, kra_pin: v.toUpperCase() }))} disabled={!canEditSetup} />
                  <SelectField label="Payment Method" value={profileForm.payment_method} onChange={(v) => setProfileForm((p) => ({ ...p, payment_method: v }))} disabled={!canEditSetup} options={[["bank_transfer", "bank_transfer"], ["cash", "cash"], ["mobile_money", "mobile_money"]]} />
                  <Field label="Bank Name" value={profileForm.bank_name} onChange={(v) => setProfileForm((p) => ({ ...p, bank_name: v }))} disabled={!canEditSetup} />
                  <Field label="Bank Account Name" value={profileForm.bank_account_name} onChange={(v) => setProfileForm((p) => ({ ...p, bank_account_name: v }))} disabled={!canEditSetup} />
                  <Field label="Bank Account Number" value={profileForm.bank_account_number} onChange={(v) => setProfileForm((p) => ({ ...p, bank_account_number: v }))} disabled={!canEditSetup} />
                  <NumberField label="Basic Salary" value={profileForm.basic_salary} onChange={(v) => setProfileForm((p) => ({ ...p, basic_salary: v }))} disabled={!canEditSetup} />
                  <NumberField label="House Allowance" value={profileForm.house_allowance} onChange={(v) => setProfileForm((p) => ({ ...p, house_allowance: v }))} disabled={!canEditSetup} />
                  <NumberField label="Transport Allowance" value={profileForm.transport_allowance} onChange={(v) => setProfileForm((p) => ({ ...p, transport_allowance: v }))} disabled={!canEditSetup} />
                  <NumberField label="Other Taxable Allowance" value={profileForm.other_taxable_allowance} onChange={(v) => setProfileForm((p) => ({ ...p, other_taxable_allowance: v }))} disabled={!canEditSetup} />
                  <NumberField label="Non-cash Benefit" value={profileForm.non_cash_benefit} onChange={(v) => setProfileForm((p) => ({ ...p, non_cash_benefit: v }))} disabled={!canEditSetup} />
                  <NumberField label="Tax-exempt Allowance" value={profileForm.tax_exempt_allowance} onChange={(v) => setProfileForm((p) => ({ ...p, tax_exempt_allowance: v }))} disabled={!canEditSetup} />
                  <NumberField label="Employee Pension" value={profileForm.pension_employee} onChange={(v) => setProfileForm((p) => ({ ...p, pension_employee: v }))} disabled={!canEditSetup} />
                  <NumberField label="Employer Pension" value={profileForm.pension_employer} onChange={(v) => setProfileForm((p) => ({ ...p, pension_employer: v }))} disabled={!canEditSetup} />
                  <NumberField label="Insurance Relief Base" value={profileForm.insurance_relief_base} onChange={(v) => setProfileForm((p) => ({ ...p, insurance_relief_base: v }))} disabled={!canEditSetup} />
                  <NumberField label="Owner Occupier Interest" value={profileForm.owner_occupier_interest} onChange={(v) => setProfileForm((p) => ({ ...p, owner_occupier_interest: v }))} disabled={!canEditSetup} />
                  <NumberField label="Other Deductions" value={profileForm.other_deductions} onChange={(v) => setProfileForm((p) => ({ ...p, other_deductions: v }))} disabled={!canEditSetup} />
                  <NumberField label="NSSF Pensionable Pay" value={profileForm.nssf_pensionable_pay} onChange={(v) => setProfileForm((p) => ({ ...p, nssf_pensionable_pay: v }))} disabled={!canEditSetup} helpText="Defaults to basic salary if left blank." />
                  <NumberField label="Disability Exemption" value={profileForm.disability_exemption_amount} onChange={(v) => setProfileForm((p) => ({ ...p, disability_exemption_amount: v }))} disabled={!canEditSetup} helpText="Monthly exemption cap applied server-side." />
                </div>

                <div className="field" style={{ marginTop: 12 }}>
                  <label>Payroll Notes</label>
                  <textarea value={profileForm.notes} onChange={(e) => setProfileForm((p) => ({ ...p, notes: e.target.value }))} disabled={!canEditSetup} />
                </div>
                <label style={{ display: "inline-flex", gap: 8, alignItems: "center", marginTop: 10 }}>
                  <input type="checkbox" checked={!!profileForm.active} onChange={(e) => setProfileForm((p) => ({ ...p, active: e.target.checked }))} disabled={!canEditSetup} />
                  Payroll active for this employee
                </label>

                {canEditSetup && (
                  <div style={{ marginTop: 12 }}>
                    <button className="btn btn-primary" type="button" disabled={savingProfile} onClick={handleSaveProfile}>
                      {savingProfile ? "Saving..." : "Save Payroll Setup"}
                    </button>
                  </div>
                )}
              </div>

              <div className="card">
                <div style={{ fontWeight: 900, marginBottom: 8 }}>Monthly Payroll Run</div>
                <div className="muted" style={{ marginBottom: 10 }}>
                  Leave a run field blank to use the saved setup amount. Use this area for monthly overrides like bonus, overtime, or a one-off deduction.
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
                  <Field label="Payroll Month" type="date" value={runForm.payroll_month} onChange={(v) => setRunForm((p) => ({ ...p, payroll_month: v }))} />
                  <Field label="Pay Date" type="date" value={runForm.pay_date} onChange={(v) => setRunForm((p) => ({ ...p, pay_date: v }))} />
                  <SelectField label="Save Status" value={runForm.status} onChange={(v) => setRunForm((p) => ({ ...p, status: v }))} options={[["draft", "draft"], ["approved", "approved"], ["paid", "paid"]]} />
                  <NumberField label="Basic Salary Override" value={runForm.basic_salary} onChange={(v) => setRunForm((p) => ({ ...p, basic_salary: v }))} />
                  <NumberField label="House Allowance Override" value={runForm.house_allowance} onChange={(v) => setRunForm((p) => ({ ...p, house_allowance: v }))} />
                  <NumberField label="Transport Allowance Override" value={runForm.transport_allowance} onChange={(v) => setRunForm((p) => ({ ...p, transport_allowance: v }))} />
                  <NumberField label="Other Taxable Allowance Override" value={runForm.other_taxable_allowance} onChange={(v) => setRunForm((p) => ({ ...p, other_taxable_allowance: v }))} />
                  <NumberField label="Non-cash Benefit Override" value={runForm.non_cash_benefit} onChange={(v) => setRunForm((p) => ({ ...p, non_cash_benefit: v }))} />
                  <NumberField label="Tax-exempt Allowance Override" value={runForm.tax_exempt_allowance} onChange={(v) => setRunForm((p) => ({ ...p, tax_exempt_allowance: v }))} />
                  <NumberField label="Bonus" value={runForm.bonus} onChange={(v) => setRunForm((p) => ({ ...p, bonus: v }))} />
                  <NumberField label="Overtime" value={runForm.overtime} onChange={(v) => setRunForm((p) => ({ ...p, overtime: v }))} />
                  <NumberField label="Commission" value={runForm.commission} onChange={(v) => setRunForm((p) => ({ ...p, commission: v }))} />
                  <NumberField label="Employee Pension Override" value={runForm.pension_employee} onChange={(v) => setRunForm((p) => ({ ...p, pension_employee: v }))} />
                  <NumberField label="Employer Pension Override" value={runForm.pension_employer} onChange={(v) => setRunForm((p) => ({ ...p, pension_employer: v }))} />
                  <NumberField label="Insurance Relief Base Override" value={runForm.insurance_relief_base} onChange={(v) => setRunForm((p) => ({ ...p, insurance_relief_base: v }))} />
                  <NumberField label="Owner Occupier Interest Override" value={runForm.owner_occupier_interest} onChange={(v) => setRunForm((p) => ({ ...p, owner_occupier_interest: v }))} />
                  <NumberField label="Other Deductions Override" value={runForm.other_deductions} onChange={(v) => setRunForm((p) => ({ ...p, other_deductions: v }))} />
                  <NumberField label="NSSF Pensionable Pay Override" value={runForm.nssf_pensionable_pay} onChange={(v) => setRunForm((p) => ({ ...p, nssf_pensionable_pay: v }))} />
                  <NumberField label="Disability Exemption Override" value={runForm.disability_exemption_amount} onChange={(v) => setRunForm((p) => ({ ...p, disability_exemption_amount: v }))} />
                </div>

                <div className="field" style={{ marginTop: 12 }}>
                  <label>Run Notes</label>
                  <textarea value={runForm.notes} onChange={(e) => setRunForm((p) => ({ ...p, notes: e.target.value }))} placeholder="Optional month-specific notes" />
                </div>

                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
                  <button className="btn" type="button" onClick={() => setRunForm(emptyRunState())}>Reset Run Form</button>
                  <button className="btn" type="button" disabled={savingRun} onClick={handlePreview}>{savingRun ? "Working..." : "Preview Payroll"}</button>
                  <button className="btn btn-primary" type="button" disabled={savingRun} onClick={handleSaveRun}>{savingRun ? "Saving..." : "Save Payroll Run"}</button>
                </div>
              </div>

              {preview && (
                <div className="card">
                  <div style={{ fontWeight: 900, marginBottom: 10 }}>Payroll Preview</div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10 }}>
                    {statChip("Gross Cash", fmtCurrency(preview.gross_cash_pay))}
                    {statChip("Taxable Income", fmtCurrency(preview.taxable_income))}
                    {statChip("PAYE", fmtCurrency(preview.paye_after_reliefs))}
                    {statChip("SHIF", fmtCurrency(preview.shif_employee))}
                    {statChip("AHL", fmtCurrency(preview.ahl_employee))}
                    {statChip("NSSF", fmtCurrency(preview.nssf_employee))}
                    {statChip("Net Pay", fmtCurrency(preview.net_pay))}
                    {statChip("Employer Cost", fmtCurrency(preview.employer_total_cost))}
                  </div>

                  <div style={{ marginTop: 14, overflowX: "auto" }}>
                    <table className="table" style={{ width: "100%", borderCollapse: "collapse" }}>
                      <thead>
                        <tr style={{ background: "#f8fafc" }}>
                          <th style={{ textAlign: "left", padding: 10 }}>Component</th>
                          <th style={{ textAlign: "left", padding: 10 }}>Amount</th>
                        </tr>
                      </thead>
                      <tbody>
                        {[
                          ["Gross cash pay", preview.gross_cash_pay],
                          ["Taxable non-cash benefits", preview.taxable_non_cash_benefits],
                          ["Tax-exempt allowances", preview.tax_exempt_allowance],
                          ["Employee pension", preview.pension_employee],
                          ["NSSF employee", preview.nssf_employee],
                          ["SHIF employee", preview.shif_employee],
                          ["AHL employee", preview.ahl_employee],
                          ["PAYE before reliefs", preview.paye_before_reliefs],
                          ["Personal relief", preview.personal_relief],
                          ["Insurance relief", preview.insurance_relief],
                          ["PAYE after reliefs", preview.paye_after_reliefs],
                          ["Other deductions", preview.other_deductions],
                          ["Net pay", preview.net_pay],
                        ].map(([label, amount]) => (
                          <tr key={label} style={{ borderTop: "1px solid #eef2f7" }}>
                            <td style={{ padding: 10 }}>{label}</td>
                            <td style={{ padding: 10 }}>{fmtCurrency(amount)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {!!preview.breakdown?.notes?.length && (
                    <div style={{ marginTop: 12 }}>
                      <div style={{ fontWeight: 700, marginBottom: 6 }}>Calculation Notes</div>
                      {preview.breakdown.notes.map((note, idx) => (
                        <div key={`payroll_note_${idx}`} className="muted" style={{ marginTop: idx ? 4 : 0 }}>{note}</div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <div className="card">
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "center", marginBottom: 8 }}>
                  <div>
                    <div style={{ fontWeight: 900 }}>Saved Payroll Runs</div>
                    <div className="muted">Search and review previously computed runs for this employee.</div>
                  </div>
                  <div className="field" style={{ marginBottom: 0, minWidth: 220 }}>
                    <label>Filter runs</label>
                    <input value={runsFilter} onChange={(e) => setRunsFilter(e.target.value)} placeholder="Month, status, notes..." />
                  </div>
                </div>
                <div style={{ overflowX: "auto" }}>
                  <table className="table" style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                      <tr style={{ background: "#f8fafc" }}>
                        <th style={{ textAlign: "left", padding: 10 }}>Month</th>
                        <th style={{ textAlign: "left", padding: 10 }}>Status</th>
                        <th style={{ textAlign: "left", padding: 10 }}>Net Pay</th>
                        <th style={{ textAlign: "left", padding: 10 }}>Employer Cost</th>
                        <th style={{ textAlign: "left", padding: 10 }}>Updated</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredRuns.map((row) => (
                        <tr key={row.id} style={{ borderTop: "1px solid #eef2f7" }}>
                          <td style={{ padding: 10 }}>{row.payroll_month}</td>
                          <td style={{ padding: 10 }}>
                            <span className={`dashboard-status-badge ${row.status === "paid" ? "dashboard-status-ok" : row.status === "approved" ? "dashboard-status-info" : "dashboard-status-pending"}`}>
                              {row.status}
                            </span>
                          </td>
                          <td style={{ padding: 10 }}>{fmtCurrency(row.net_pay)}</td>
                          <td style={{ padding: 10 }}>{fmtCurrency(row.employer_total_cost)}</td>
                          <td style={{ padding: 10 }}>{row.updated_at ? new Date(row.updated_at).toLocaleString() : "-"}</td>
                        </tr>
                      ))}
                      {!filteredRuns.length && <tr><td colSpan={5} style={{ padding: 14 }} className="muted">No payroll runs found for this filter.</td></tr>}
                    </tbody>
                  </table>
                </div>
              </div>

              {!!statutory?.source_notes?.length && (
                <div className="card">
                  <div style={{ fontWeight: 900, marginBottom: 8 }}>Compliance Notes</div>
                  {statutory.source_notes.map((note, idx) => (
                    <div key={`source_note_${idx}`} className="muted" style={{ marginTop: idx ? 6 : 0 }}>{note}</div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
