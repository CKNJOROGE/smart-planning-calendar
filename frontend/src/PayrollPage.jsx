import React, { useEffect, useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import {
  me,
  getPayrollStatutoryInfo,
  listPayrollStatutoryConfigs,
  createPayrollStatutoryConfig,
  updatePayrollStatutoryConfig,
  listPayrollEmployees,
  getPayrollProfile,
  updatePayrollProfile,
  previewPayrollRun,
  savePayrollRun,
  listPayrollRuns,
  markPayrollRunPaid,
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

function makePayeBandRow(band = {}) {
  return {
    label: band?.label || "next",
    amount: band?.amount == null ? "" : String(band.amount),
    rate: band?.rate == null ? "" : String(band.rate),
  };
}

function statutoryFormFromApi(row) {
  return {
    effective_from: row?.effective_from || monthStartToday(),
    effective_to: row?.effective_to || "",
    active: row?.active ?? true,
    personal_relief_monthly: toFieldValue(row?.personal_relief_monthly),
    insurance_relief_rate: toFieldValue(row?.insurance_relief_rate),
    insurance_relief_cap_monthly: toFieldValue(row?.insurance_relief_cap_monthly),
    owner_occupier_interest_cap_monthly: toFieldValue(row?.owner_occupier_interest_cap_monthly),
    shif_rate: toFieldValue(row?.shif_rate),
    shif_minimum_monthly: toFieldValue(row?.shif_minimum_monthly),
    ahl_rate_employee: toFieldValue(row?.ahl_rate_employee),
    ahl_rate_employer: toFieldValue(row?.ahl_rate_employer),
    nssf_lower_earnings_limit: toFieldValue(row?.nssf_lower_earnings_limit),
    nssf_upper_earnings_limit: toFieldValue(row?.nssf_upper_earnings_limit),
    nssf_employee_rate: toFieldValue(row?.nssf_employee_rate),
    nssf_employer_rate: toFieldValue(row?.nssf_employer_rate),
    nita_levy_monthly: toFieldValue(row?.nita_levy_monthly),
    non_cash_benefit_taxable_threshold: toFieldValue(row?.non_cash_benefit_taxable_threshold),
    disability_exemption_cap_monthly: toFieldValue(row?.disability_exemption_cap_monthly),
    paye_bands: (row?.paye_bands_monthly || []).map((band) => makePayeBandRow(band)),
    source_notes_text: (row?.source_notes || []).join("\n"),
  };
}

function statutoryPayloadFromState(state) {
  return {
    effective_from: state.effective_from,
    effective_to: state.effective_to || null,
    active: !!state.active,
    personal_relief_monthly: toNullableNumber(state.personal_relief_monthly) ?? 0,
    insurance_relief_rate: toNullableNumber(state.insurance_relief_rate) ?? 0,
    insurance_relief_cap_monthly: toNullableNumber(state.insurance_relief_cap_monthly) ?? 0,
    owner_occupier_interest_cap_monthly: toNullableNumber(state.owner_occupier_interest_cap_monthly) ?? 0,
    shif_rate: toNullableNumber(state.shif_rate) ?? 0,
    shif_minimum_monthly: toNullableNumber(state.shif_minimum_monthly) ?? 0,
    ahl_rate_employee: toNullableNumber(state.ahl_rate_employee) ?? 0,
    ahl_rate_employer: toNullableNumber(state.ahl_rate_employer) ?? 0,
    nssf_lower_earnings_limit: toNullableNumber(state.nssf_lower_earnings_limit) ?? 0,
    nssf_upper_earnings_limit: toNullableNumber(state.nssf_upper_earnings_limit) ?? 0,
    nssf_employee_rate: toNullableNumber(state.nssf_employee_rate) ?? 0,
    nssf_employer_rate: toNullableNumber(state.nssf_employer_rate) ?? 0,
    nita_levy_monthly: toNullableNumber(state.nita_levy_monthly) ?? 0,
    non_cash_benefit_taxable_threshold: toNullableNumber(state.non_cash_benefit_taxable_threshold) ?? 0,
    disability_exemption_cap_monthly: toNullableNumber(state.disability_exemption_cap_monthly) ?? 0,
    paye_bands_monthly: (state.paye_bands || [])
      .map((band) => ({
        label: String(band.label || "").trim() || "next",
        amount: band.amount === "" ? null : toNullableNumber(band.amount),
        rate: toNullableNumber(band.rate),
      }))
      .filter((band) => band.rate != null)
      .map((band) => (
        band.amount == null
          ? { label: band.label, rate: band.rate }
          : { label: band.label, amount: band.amount, rate: band.rate }
      )),
    source_notes: String(state.source_notes_text || "")
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean),
  };
}

function runPayloadFromState(state, employeeId, statusOverride = null) {
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
    status: statusOverride || state.status || "draft",
  };
}

function statChip(label, value) {
  return (
    <div className="pill payroll-chip" style={{ display: "flex", gap: 6, alignItems: "center" }}>
      <span>{label}:</span>
      <b>{value}</b>
    </div>
  );
}

function SectionHelp({ text }) {
  return (
    <button
      type="button"
      className="btn payroll-help-btn"
      title={text}
      aria-label={text}
      style={{
        minWidth: 26,
        width: 26,
        height: 26,
        padding: 0,
        borderRadius: "50%",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        fontWeight: 900,
        lineHeight: 1,
      }}
    >
      ?
    </button>
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

function updatePayeBandRow(rows, idx, key, value) {
  return rows.map((row, rowIdx) => (rowIdx === idx ? { ...row, [key]: value } : row));
}

function removePayeBandRow(rows, idx) {
  return rows.filter((_, rowIdx) => rowIdx !== idx);
}

export default function PayrollPage() {
  const [current, setCurrent] = useState(null);
  const [busy, setBusy] = useState(true);
  const [employees, setEmployees] = useState([]);
  const [employeeSearch, setEmployeeSearch] = useState("");
  const [selectedEmployeeId, setSelectedEmployeeId] = useState("");
  const [statutory, setStatutory] = useState(null);
  const [statutoryConfigs, setStatutoryConfigs] = useState([]);
  const [selectedStatutoryConfigId, setSelectedStatutoryConfigId] = useState("");
  const [statutoryForm, setStatutoryForm] = useState(statutoryFormFromApi(null));
  const [profile, setProfile] = useState(null);
  const [profileForm, setProfileForm] = useState(profileStateFromApi(null));
  const [runForm, setRunForm] = useState(emptyRunState());
  const [preview, setPreview] = useState(null);
  const [runs, setRuns] = useState([]);
  const [runsFilter, setRunsFilter] = useState("");
  const [err, setErr] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingRun, setSavingRun] = useState(false);
  const [savingStatutory, setSavingStatutory] = useState(false);
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
        const [statutoryData, statutoryConfigRows, employeeRows] = await Promise.all([
          getPayrollStatutoryInfo(),
          listPayrollStatutoryConfigs(),
          listPayrollEmployees(),
        ]);
        setStatutory(statutoryData);
        setStatutoryConfigs(statutoryConfigRows || []);
        if (statutoryConfigRows?.length) {
          setSelectedStatutoryConfigId(String(statutoryConfigRows[0].id));
          setStatutoryForm(statutoryFormFromApi(statutoryConfigRows[0]));
        } else {
          setStatutoryForm(statutoryFormFromApi(statutoryData));
        }
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
      const profileData = await getPayrollProfile(userId);
      setProfile(profileData);
      setProfileForm(profileStateFromApi(profileData));
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
    listPayrollRuns({ employeeId: Number(selectedEmployeeId) })
      .then((rows) => setRuns(rows || []))
      .catch(() => {});
  }, [selectedEmployeeId, canOpen]);

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
  const selectedEmploymentType = String(selectedEmployee?.employment_type || "employee").toLowerCase();
  const isConsultantSelected = selectedEmploymentType === "consultant";

  const selectedStatutoryConfig = useMemo(
    () => (statutoryConfigs || []).find((row) => Number(row.id) === Number(selectedStatutoryConfigId)) || null,
    [statutoryConfigs, selectedStatutoryConfigId]
  );

  const profileGross = useMemo(() => (
    Number(profileForm.basic_salary || 0)
    + Number(profileForm.house_allowance || 0)
    + Number(profileForm.transport_allowance || 0)
    + Number(profileForm.other_taxable_allowance || 0)
  ), [profileForm]);

  useEffect(() => {
    if (!selectedStatutoryConfig) return;
    setStatutoryForm(statutoryFormFromApi(selectedStatutoryConfig));
  }, [selectedStatutoryConfigId, selectedStatutoryConfig]);

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

  async function handleSaveDraft() {
    if (!selectedEmployeeId) return;
    setSavingRun(true);
    setErr("");
    try {
      const result = await savePayrollRun(runPayloadFromState(runForm, selectedEmployeeId, "draft"));
      setPreview(result);
      const updatedRuns = await listPayrollRuns({ employeeId: Number(selectedEmployeeId) });
      setRuns(updatedRuns || []);
      showToast("Payroll saved as draft", "success");
    } catch (e) {
      const text = String(e.message || e);
      setErr(text);
      showToast(text, "error");
    } finally {
      setSavingRun(false);
    }
  }

  async function handleSubmit() {
    if (!selectedEmployeeId) return;
    setSavingRun(true);
    setErr("");
    try {
      const result = await savePayrollRun(runPayloadFromState(runForm, selectedEmployeeId, "approved"));
      setPreview(result);
      const updatedRuns = await listPayrollRuns({ employeeId: Number(selectedEmployeeId) });
      setRuns(updatedRuns || []);
      showToast("Payroll submitted - employee can now confirm", "success");
    } catch (e) {
      const text = String(e.message || e);
      setErr(text);
      showToast(text, "error");
    } finally {
      setSavingRun(false);
    }
  }

  async function handleMarkPaid(runId) {
    setSavingRun(true);
    setErr("");
    try {
      await markPayrollRunPaid(Number(runId));
      const updatedRuns = await listPayrollRuns({ employeeId: Number(selectedEmployeeId) });
      setRuns(updatedRuns || []);
      showToast("Payroll marked as paid", "success");
    } catch (e) {
      const text = String(e.message || e);
      setErr(text);
      showToast(text, "error");
    } finally {
      setSavingRun(false);
    }
  }

  async function refreshStatutoryConfigs() {
    const [statutoryData, rows] = await Promise.all([
      getPayrollStatutoryInfo(),
      listPayrollStatutoryConfigs(),
    ]);
    setStatutory(statutoryData);
    setStatutoryConfigs(rows || []);
    return rows || [];
  }

  async function handleSaveStatutoryConfig(asNewVersion) {
    setSavingStatutory(true);
    setErr("");
    try {
      const payload = statutoryPayloadFromState(statutoryForm);
      if (asNewVersion || !selectedStatutoryConfigId) {
        await createPayrollStatutoryConfig(payload);
      } else {
        await updatePayrollStatutoryConfig(Number(selectedStatutoryConfigId), payload);
      }
      const rows = await refreshStatutoryConfigs();
      if (rows.length) {
        const target = asNewVersion ? rows[0] : rows.find((row) => Number(row.id) === Number(selectedStatutoryConfigId)) || rows[0];
        setSelectedStatutoryConfigId(String(target.id));
        setStatutoryForm(statutoryFormFromApi(target));
      }
      showToast(asNewVersion ? "New statutory config saved" : "Statutory config updated", "success");
    } catch (e) {
      const text = String(e.message || e);
      setErr(text);
      showToast(text, "error");
    } finally {
      setSavingStatutory(false);
    }
  }

  if (busy) {
    return (
      <div className="page-wrap payroll-page">
        <div className="card payroll-card">
          <LoadingState label="Loading payroll..." />
        </div>
      </div>
    );
  }

  if (current && !canOpen) return <Navigate to="/" replace />;

  return (
    <div className="page-wrap payroll-page">
      <div className="card payroll-card payroll-hero-card" style={{ marginBottom: 12 }}>
        <div style={{ fontWeight: 900, fontSize: 18 }}>Payroll</div>
        <div className="muted" style={{ marginTop: 6 }}>
          Kenya payroll workspace for monthly salary setup, statutory deductions, and payroll runs. Access is limited to finance, admin, and CEO.
        </div>
        <div className="payroll-pill-row" style={{ marginTop: 10 }}>
          {statChip("PAYE", `Bands from ${statutory?.paye_effective_from || "-"}`)}
          {statChip("AHL", `${((statutory?.ahl_rate_employee || 0) * 100).toFixed(1)}% employee + employer`)}
          {statChip("SHIF", `${((statutory?.shif_rate || 0) * 100).toFixed(2)}% min ${fmtCurrency(statutory?.shif_minimum_monthly || 0)}`)}
          {statChip("NSSF", `LEL ${fmtCurrency(statutory?.nssf_lower_earnings_limit || 0)} / UEL ${fmtCurrency(statutory?.nssf_upper_earnings_limit || 0)}`)}
        </div>
        {err && <div className="error" style={{ marginTop: 10 }}>{err}</div>}
      </div>

      <div className="card payroll-card payroll-section-card" style={{ marginBottom: 12 }}>
        <div className="payroll-section-head" style={{ marginBottom: 8 }}>
          <div>
            <div style={{ fontWeight: 900, display: "flex", alignItems: "center", gap: 8 }}>
              <span>Statutory Settings</span>
              <SectionHelp text="Use this section to manage Kenya statutory payroll rules such as PAYE bands, SHIF, AHL, NSSF, relief caps, and thresholds. Create a new effective-dated version when the law changes so past payroll runs keep their original legal basis." />
            </div>
            <div className="muted">Create a new effective-dated rule version when Kenya payroll law changes. Old payroll runs keep their stored snapshot.</div>
          </div>
          <div className="pill payroll-chip">Current config ID: {statutory?.id || "-"}</div>
        </div>

        <div className="payroll-statutory-grid">
          <div className="payroll-version-panel">
            <div className="field" style={{ marginBottom: 10 }}>
              <label>Available versions</label>
              <select value={selectedStatutoryConfigId} onChange={(e) => setSelectedStatutoryConfigId(e.target.value)}>
                {(statutoryConfigs || []).map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.effective_from}{row.effective_to ? ` to ${row.effective_to}` : " onwards"}{row.active ? " | active" : " | inactive"}
                  </option>
                ))}
              </select>
            </div>
            <button className="btn" type="button" onClick={() => { setSelectedStatutoryConfigId(""); setStatutoryForm(statutoryFormFromApi(statutory)); }}>
              New Version Draft
            </button>
          </div>

          <div>
            <div className="payroll-form-grid">
              <Field label="Effective From" type="date" value={statutoryForm.effective_from} onChange={(v) => setStatutoryForm((p) => ({ ...p, effective_from: v }))} />
              <Field label="Effective To" type="date" value={statutoryForm.effective_to} onChange={(v) => setStatutoryForm((p) => ({ ...p, effective_to: v }))} />
              <NumberField label="Personal Relief Monthly" value={statutoryForm.personal_relief_monthly} onChange={(v) => setStatutoryForm((p) => ({ ...p, personal_relief_monthly: v }))} />
              <NumberField label="Insurance Relief Rate" value={statutoryForm.insurance_relief_rate} onChange={(v) => setStatutoryForm((p) => ({ ...p, insurance_relief_rate: v }))} helpText="Example: 0.15 for 15%." />
              <NumberField label="Insurance Relief Cap" value={statutoryForm.insurance_relief_cap_monthly} onChange={(v) => setStatutoryForm((p) => ({ ...p, insurance_relief_cap_monthly: v }))} />
              <NumberField label="Owner Occupier Interest Cap" value={statutoryForm.owner_occupier_interest_cap_monthly} onChange={(v) => setStatutoryForm((p) => ({ ...p, owner_occupier_interest_cap_monthly: v }))} />
              <NumberField label="SHIF Rate" value={statutoryForm.shif_rate} onChange={(v) => setStatutoryForm((p) => ({ ...p, shif_rate: v }))} />
              <NumberField label="SHIF Minimum Monthly" value={statutoryForm.shif_minimum_monthly} onChange={(v) => setStatutoryForm((p) => ({ ...p, shif_minimum_monthly: v }))} />
              <NumberField label="AHL Employee Rate" value={statutoryForm.ahl_rate_employee} onChange={(v) => setStatutoryForm((p) => ({ ...p, ahl_rate_employee: v }))} />
              <NumberField label="AHL Employer Rate" value={statutoryForm.ahl_rate_employer} onChange={(v) => setStatutoryForm((p) => ({ ...p, ahl_rate_employer: v }))} />
              <NumberField label="NSSF Lower Earnings Limit" value={statutoryForm.nssf_lower_earnings_limit} onChange={(v) => setStatutoryForm((p) => ({ ...p, nssf_lower_earnings_limit: v }))} />
              <NumberField label="NSSF Upper Earnings Limit" value={statutoryForm.nssf_upper_earnings_limit} onChange={(v) => setStatutoryForm((p) => ({ ...p, nssf_upper_earnings_limit: v }))} />
              <NumberField label="NSSF Employee Rate" value={statutoryForm.nssf_employee_rate} onChange={(v) => setStatutoryForm((p) => ({ ...p, nssf_employee_rate: v }))} />
              <NumberField label="NSSF Employer Rate" value={statutoryForm.nssf_employer_rate} onChange={(v) => setStatutoryForm((p) => ({ ...p, nssf_employer_rate: v }))} />
              <NumberField label="NITA Levy Monthly" value={statutoryForm.nita_levy_monthly} onChange={(v) => setStatutoryForm((p) => ({ ...p, nita_levy_monthly: v }))} />
              <NumberField label="Non-cash Benefit Threshold" value={statutoryForm.non_cash_benefit_taxable_threshold} onChange={(v) => setStatutoryForm((p) => ({ ...p, non_cash_benefit_taxable_threshold: v }))} />
              <NumberField label="Disability Exemption Cap" value={statutoryForm.disability_exemption_cap_monthly} onChange={(v) => setStatutoryForm((p) => ({ ...p, disability_exemption_cap_monthly: v }))} />
            </div>

            <label className="payroll-inline-check" style={{ marginTop: 10 }}>
              <input type="checkbox" checked={!!statutoryForm.active} onChange={(e) => setStatutoryForm((p) => ({ ...p, active: e.target.checked }))} />
              Active configuration
            </label>

            <div className="field" style={{ marginTop: 12 }}>
              <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span>PAYE Bands</span>
                <SectionHelp text="PAYE bands are progressive. Each row taxes only that slice of monthly taxable income at the stated rate. Example: the second row taxes only the next KES 8,333 at 25%, moving the cumulative threshold from KES 24,000 to KES 32,333." />
              </label>
              <div className="helper" style={{ marginBottom: 8 }}>
                Each row means "tax this slice of monthly taxable pay at this rate." The second row of `KES 8,333 at 25%` is correct because it takes the monthly threshold from `KES 24,000` up to `KES 32,333`.
              </div>
              <div className="payroll-table-wrap">
                <table className="table payroll-table">
                  <thead>
                    <tr>
                      <th style={{ textAlign: "left", padding: 10 }}>Band Label</th>
                      <th style={{ textAlign: "left", padding: 10 }}>Band Amount</th>
                      <th style={{ textAlign: "left", padding: 10 }}>Rate</th>
                      <th style={{ textAlign: "left", padding: 10 }}>Meaning</th>
                      <th style={{ textAlign: "left", padding: 10 }}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(statutoryForm.paye_bands || []).map((band, idx) => {
                      const label = String(band.label || "").trim().toLowerCase();
                      const amountLabel = band.amount ? fmtCurrency(band.amount) : "No cap";
                      const rateLabel = band.rate ? `${Number(band.rate) * 100}%` : "-";
                      const meaning = label === "first"
                        ? `First ${amountLabel} at ${rateLabel}`
                        : label === "excess"
                          ? `Anything above prior bands at ${rateLabel}`
                          : `Next ${amountLabel} at ${rateLabel}`;
                      return (
                        <tr key={`paye_band_${idx}`}>
                          <td style={{ padding: 10 }}>
                            <select
                              value={band.label}
                              onChange={(e) => setStatutoryForm((p) => ({ ...p, paye_bands: updatePayeBandRow(p.paye_bands, idx, "label", e.target.value) }))}
                            >
                              <option value="first">first</option>
                              <option value="next">next</option>
                              <option value="excess">excess</option>
                            </select>
                          </td>
                          <td style={{ padding: 10 }}>
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              value={band.amount}
                              disabled={label === "excess"}
                              onChange={(e) => setStatutoryForm((p) => ({ ...p, paye_bands: updatePayeBandRow(p.paye_bands, idx, "amount", e.target.value) }))}
                              placeholder={label === "excess" ? "Leave blank" : "0.00"}
                            />
                          </td>
                          <td style={{ padding: 10 }}>
                            <input
                              type="number"
                              min="0"
                              step="0.0001"
                              value={band.rate}
                              onChange={(e) => setStatutoryForm((p) => ({ ...p, paye_bands: updatePayeBandRow(p.paye_bands, idx, "rate", e.target.value) }))}
                              placeholder="0.00"
                            />
                          </td>
                          <td style={{ padding: 10 }}>
                            <div className="muted">{meaning}</div>
                          </td>
                          <td style={{ padding: 10 }}>
                            <button
                              className="btn"
                              type="button"
                              disabled={statutoryForm.paye_bands.length <= 1}
                              onClick={() => setStatutoryForm((p) => ({ ...p, paye_bands: removePayeBandRow(p.paye_bands, idx) }))}
                            >
                              Remove
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="payroll-actions" style={{ marginTop: 8 }}>
                <button
                  className="btn"
                  type="button"
                  onClick={() => setStatutoryForm((p) => ({ ...p, paye_bands: [...(p.paye_bands || []), makePayeBandRow({ label: "next", amount: "", rate: "" })] }))}
                >
                  Add Band
                </button>
              </div>
            </div>

            <div className="field" style={{ marginTop: 12 }}>
              <label>Source Notes</label>
              <textarea
                value={statutoryForm.source_notes_text}
                onChange={(e) => setStatutoryForm((p) => ({ ...p, source_notes_text: e.target.value }))}
                placeholder="One source note per line"
              />
            </div>

            <div className="payroll-actions" style={{ marginTop: 12 }}>
              <button className="btn" type="button" disabled={savingStatutory} onClick={() => handleSaveStatutoryConfig(false)}>
                {savingStatutory ? "Saving..." : "Update Selected Version"}
              </button>
              <button className="btn btn-primary" type="button" disabled={savingStatutory} onClick={() => handleSaveStatutoryConfig(true)}>
                {savingStatutory ? "Saving..." : "Save As New Version"}
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="payroll-shell">
        <div className="card payroll-card payroll-rail-card">
          <div style={{ fontWeight: 800, marginBottom: 8 }}>Employees</div>
          <div className="field" style={{ marginBottom: 10 }}>
            <label>Search employees</label>
            <input value={employeeSearch} onChange={(e) => setEmployeeSearch(e.target.value)} placeholder="Name, department, role..." />
          </div>
          <div className="payroll-employee-list">
            {filteredEmployees.map((row) => {
              const active = Number(selectedEmployeeId) === Number(row.id);
              return (
                <button
                  key={row.id}
                  type="button"
                  className={`btn payroll-employee-btn${active ? " active" : ""}`}
                  onClick={() => setSelectedEmployeeId(String(row.id))}
                >
                  <div style={{ fontWeight: 800 }}>{row.name}</div>
                  <div className="muted" style={{ fontSize: 12 }}>
                    {row.department || "Unassigned"} | {row.designation || row.role} | {row.employment_type || "employee"}
                  </div>
                  <div className="muted" style={{ fontSize: 12 }}>{row.email}</div>
                </button>
              );
            })}
            {!filteredEmployees.length && <div className="muted">No employees matched your search.</div>}
          </div>
        </div>

        <div className="payroll-panel-stack">
          <div className="card payroll-card payroll-summary-card">
            <div className="payroll-section-head">
              <div>
                <div style={{ fontWeight: 900, fontSize: 18 }}>{selectedEmployee?.name || "Select an employee"}</div>
                <div className="muted">
                  {selectedEmployee ? `${selectedEmployee.department || "Unassigned"} | ${selectedEmployee.designation || selectedEmployee.role} | ${selectedEmployee.employment_type || "employee"}` : "Choose an employee to manage payroll setup and monthly runs."}
                </div>
                {isConsultantSelected && (
                  <div className="muted" style={{ marginTop: 4 }}>
                    Consultant mode: withholding tax (5%) applied on salary above KES 24,000. No deduction for KES 24,000 or below.
                  </div>
                )}
              </div>
              {profile && (
                <div className="payroll-pill-row">
                  {statChip("Default Gross", fmtCurrency(profileGross))}
                  {statChip("Payment", profile.payment_method || "-")}
                  {statChip("Status", profile.active ? "Active" : "Inactive")}
                </div>
              )}
            </div>
          </div>

          {selectedEmployee && profile && (
            <>
              <div className="card payroll-card payroll-section-card">
                <div className="payroll-section-head" style={{ marginBottom: 10 }}>
                  <div>
                    <div style={{ fontWeight: 900, display: "flex", alignItems: "center", gap: 8 }}>
                      <span>Payroll Setup</span>
                      <SectionHelp text="Payroll Setup is the employee's default payroll profile. Save the recurring salary structure here, such as basic salary, normal allowances, pension defaults, payment method, and recurring deduction-related inputs. These values become the monthly starting point." />
                    </div>
                    <div className="muted">Default monthly pay items and recurring relief inputs used as the starting point for payroll runs.</div>
                  </div>
                </div>

                <div className="payroll-form-grid">
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
                <label className="payroll-inline-check" style={{ marginTop: 10 }}>
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

              <div className="card payroll-card payroll-section-card">
                <div style={{ fontWeight: 900, marginBottom: 8, display: "flex", alignItems: "center", gap: 8 }}>
                  <span>Monthly Payroll Run</span>
                  <SectionHelp text="Monthly Payroll Run calculates the actual pay for one employee for one specific month. It uses Payroll Setup as the default base, then lets you add or override month-specific values like bonus, overtime, commission, or one-off deductions before previewing and saving that month's payroll record." />
                </div>
                <div className="muted" style={{ marginBottom: 10 }}>
                  Leave a run field blank to use the saved setup amount. Use this area for monthly overrides like bonus, overtime, or a one-off deduction.
                </div>
                <div className="payroll-form-grid">
                  <Field label="Payroll Month" type="date" value={runForm.payroll_month} onChange={(v) => setRunForm((p) => ({ ...p, payroll_month: v }))} />
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

                <div className="payroll-actions" style={{ marginTop: 12, display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button className="btn" type="button" disabled={savingRun} onClick={handlePreview}>{savingRun ? "Working..." : "Preview Payroll"}</button>
                  <button className="btn" type="button" disabled={savingRun} onClick={() => setRunForm(emptyRunState())}>Reset</button>
                  <button className="btn" type="button" disabled={savingRun} onClick={handleSaveDraft}>{savingRun ? "Saving..." : "Save Draft"}</button>
                  <button className="btn btn-primary" type="button" disabled={savingRun} onClick={handleSubmit}>{savingRun ? "Saving..." : "Submit"}</button>
                </div>
              </div>

              {preview && (
                <div className="card payroll-card payroll-preview-card">
                  <div style={{ fontWeight: 900, marginBottom: 10 }}>Payroll Preview</div>
                  <div className="payroll-preview-grid">
                    {statChip("Gross Cash", fmtCurrency(preview.gross_cash_pay))}
                    {statChip("Taxable Income", fmtCurrency(preview.taxable_income))}
                    {statChip(
                      isConsultantSelected ? "Withholding Tax" : "PAYE",
                      fmtCurrency(isConsultantSelected ? preview.withholding_tax : preview.paye_after_reliefs)
                    )}
                    {!isConsultantSelected && statChip("SHIF", fmtCurrency(preview.shif_employee))}
                    {!isConsultantSelected && statChip("AHL", fmtCurrency(preview.ahl_employee))}
                    {!isConsultantSelected && statChip("NSSF", fmtCurrency(preview.nssf_employee))}
                    {statChip("Net Pay", fmtCurrency(preview.net_pay))}
                    {statChip("Employer Cost", fmtCurrency(preview.employer_total_cost))}
                  </div>

                  <div className="payroll-table-wrap" style={{ marginTop: 14 }}>
                    <table className="table payroll-table">
                      <thead>
                        <tr>
                          <th style={{ textAlign: "left", padding: 10 }}>Component</th>
                          <th style={{ textAlign: "left", padding: 10 }}>Amount</th>
                        </tr>
                      </thead>
                      <tbody>
                        {[
                          ["Gross cash pay", preview.gross_cash_pay],
                          ["Taxable non-cash benefits", preview.taxable_non_cash_benefits],
                          ["Tax-exempt allowances", preview.tax_exempt_allowance],
                          ...(isConsultantSelected
                            ? [["Withholding tax", preview.withholding_tax]]
                            : [
                                ["Employee pension", preview.pension_employee],
                                ["NSSF employee", preview.nssf_employee],
                                ["SHIF employee", preview.shif_employee],
                                ["AHL employee", preview.ahl_employee],
                                ["PAYE before reliefs", preview.paye_before_reliefs],
                                ["Personal relief", preview.personal_relief],
                                ["Insurance relief", preview.insurance_relief],
                                ["PAYE after reliefs", preview.paye_after_reliefs],
                              ]),
                          ["Other deductions", preview.other_deductions],
                          ["Net pay", preview.net_pay],
                        ].map(([label, amount]) => (
                          <tr key={label}>
                            <td style={{ padding: 10 }}>{label}</td>
                            <td style={{ padding: 10 }}>{fmtCurrency(amount)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {!!preview.breakdown?.notes?.length && (
                    <div className="payroll-notes-block" style={{ marginTop: 12 }}>
                      <div style={{ fontWeight: 700, marginBottom: 6 }}>Calculation Notes</div>
                      {preview.breakdown.notes.map((note, idx) => (
                        <div key={`payroll_note_${idx}`} className="muted" style={{ marginTop: idx ? 4 : 0 }}>{note}</div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <div className="card payroll-card payroll-section-card">
                <div className="payroll-section-head" style={{ marginBottom: 8 }}>
                  <div>
                    <div style={{ fontWeight: 900 }}>Saved Payroll Runs</div>
                    <div className="muted">Search and review previously computed runs for this employee.</div>
                  </div>
                  <div className="field" style={{ marginBottom: 0, minWidth: 220 }}>
                    <label>Filter runs</label>
                    <input value={runsFilter} onChange={(e) => setRunsFilter(e.target.value)} placeholder="Month, status, notes..." />
                  </div>
                </div>
                <div className="payroll-table-wrap">
                  <table className="table payroll-table">
                    <thead>
                      <tr>
                        <th style={{ textAlign: "left", padding: 10 }}>Month</th>
                        <th style={{ textAlign: "left", padding: 10 }}>Status</th>
                        <th style={{ textAlign: "left", padding: 10 }}>Employee Confirmed</th>
                        <th style={{ textAlign: "left", padding: 10 }}>Net Pay</th>
                        <th style={{ textAlign: "left", padding: 10 }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredRuns.map((row) => (
                        <tr key={row.id}>
                          <td style={{ padding: 10 }}>{row.payroll_month}</td>
                          <td style={{ padding: 10 }}>
                            <span className={`dashboard-status-badge ${row.status === "paid" ? "dashboard-status-ok" : row.status === "approved" ? "dashboard-status-info" : "dashboard-status-pending"}`}>
                              {row.status}
                            </span>
                          </td>
                          <td style={{ padding: 10 }}>
                            {row.employee_confirmed ? (
                              <span
                                style={{
                                  background: "linear-gradient(to bottom, #cfc09f 27%, #ffecb3 40%, #3a2c0f 78%)",
                                  WebkitBackgroundClip: "text",
                                  WebkitTextFillColor: "transparent",
                                  fontWeight: 700,
                                  filter: "drop-shadow(-1px 0 1px #c6bb9f) drop-shadow(0 1px 1px #c6bb9f) drop-shadow(3px 3px 6px rgba(0,0,0,0.5))",
                                }}
                              >
                                Confirmed
                              </span>
                            ) : (
                              <span className="dashboard-status-badge dashboard-status-pending">Pending</span>
                            )}
                          </td>
                          <td style={{ padding: 10 }}>{fmtCurrency(row.net_pay)}</td>
                          <td style={{ padding: 10 }}>
                            {row.status === "approved" && (
                              <button
                                className="btn btn-primary"
                                type="button"
                                disabled={!row.employee_confirmed}
                                onClick={() => handleMarkPaid(row.id)}
                                title={!row.employee_confirmed ? "Employee must confirm before marking paid" : ""}
                              >
                                Mark Paid
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                      {!filteredRuns.length && <tr><td colSpan={5} style={{ padding: 14 }} className="muted">No payroll runs found for this filter.</td></tr>}
                    </tbody>
                  </table>
                </div>
              </div>

              {!!statutory?.source_notes?.length && (
                <div className="card payroll-card payroll-section-card payroll-compliance-card">
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
