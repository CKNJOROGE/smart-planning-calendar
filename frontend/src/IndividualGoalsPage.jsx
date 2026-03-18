import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { me, getPerformanceAppraisal, savePerformanceEmployeeAppraisal, savePerformanceSupervisorAppraisal } from "./api";
import { useToast } from "./ToastProvider";
import LoadingState from "./LoadingState";

const RATING_OPTIONS = ["", "1", "2", "3", "4", "5"];

function normalize(v) {
  return String(v || "").toLowerCase().replace(/\s+/g, " ").trim();
}

const HR_OUTSOURCING_APPRAISAL_DESIGNATIONS = new Set([
  normalize("Junior HR Consultant"),
  normalize("HR Admin Assistant"),
  normalize("Senior HR Consultant"),
]);

const DEFAULT_KPI_SECTIONS = [
  { key: "financial", title: "Section 1: Financial", rows: ["Timely completion of billable client tasks", "Contribution to successful recruitment placements", "Efficient use of time and resources", "Support retention of assigned clients"] },
  { key: "client", title: "Section 2: Client", rows: ["Responsiveness to client requests", "Professional client communication", "SLA adherence", "Candidate experience standards", "Accuracy of client deliverables"] },
  { key: "internal_process", title: "Section 3: Internal Process", rows: ["HR documentation completeness", "SOP compliance", "Monthly reporting accuracy", "Recruitment workflow execution", "Record keeping and organisation"] },
  { key: "learning_growth", title: "Section 4: Learning & Growth", rows: ["HR skills improvement", "Initiative taken", "Application of feedback", "Collaboration and knowledge sharing"] },
];

const SENIOR_HR_CONSULTANT_KPI_SECTIONS = [
  { key: "financial", title: "Section 1: Financial", rows: ["Revenue contribution from client portfolio", "Retainer renewal and client retention", "Recruitment revenue within portfolio", "Identification of upsell opportunities", "Efficient resource utilisation"] },
  { key: "client", title: "Section 2: Client", rows: ["Client satisfaction and trust", "Quality of HR advisory", "Policy dissemination effectiveness", "Training delivery impact", "Escalation management"] },
  { key: "internal_process", title: "Section 3: Internal Process", rows: ["Quality assurance of team outputs", "HR project delivery (policies, audits, PMS etc.)", "Recruitment oversight and workflow efficiency", "Documentation standards across clients", "SOP enforcement and improvement"] },
  { key: "learning_growth", title: "Section 4: Learning & Growth / Leadership", rows: ["Team supervision and coaching", "Capability building of consultants", "Knowledge sharing", "Service innovation", "Thought leadership / brand support"] },
];

const EMPTY_GOAL_ROW = { objective: "", keyResults: "", bscLink: "", comments: "", selfRating: "" };
const NEXT_REVIEW_GOALS_DEFAULT_ROWS = [
  { objective: "Improve HR documentation accuracy and compliance across assigned clients", keyResults: "100% files updated monthly; zero missing statutory documents; reports submitted on time", bscLink: "Internal Process", comments: "", selfRating: "" },
  { objective: "Strengthen recruitment execution efficiency", keyResults: "Shortlist within SLA; candidate communication within 48 hrs; maintain pipeline for priority roles", bscLink: "Client / Internal Process", comments: "", selfRating: "" },
  { objective: "Enhance client responsiveness and service quality", keyResults: "Respond within 2 hrs; positive feedback from clients; reduce follow-ups", bscLink: "Client", comments: "", selfRating: "" },
  { objective: "Build capability in employee relations and labour law", keyResults: "Complete 1 HR training/webinar", bscLink: "Learning & Growth", comments: "", selfRating: "" },
  { objective: "Improve personal productivity and task management", keyResults: "Daily task tracker; meet deadlines; reduce rework/errors", bscLink: "Financial / Internal Process", comments: "", selfRating: "" },
];

function currentQuarter() {
  const month = new Date().getMonth() + 1;
  if (month <= 3) return "Q1";
  if (month <= 6) return "Q2";
  if (month <= 9) return "Q3";
  return "Q4";
}

function makeArray(length, source = []) {
  return Array.from({ length }).map((_, idx) => String(source?.[idx] || ""));
}

function sanitizeGoalRow(row = {}) {
  return {
    objective: String(row.objective || ""),
    keyResults: String(row.keyResults || ""),
    bscLink: String(row.bscLink || ""),
    comments: String(row.comments || ""),
    selfRating: String(row.selfRating || ""),
  };
}

function makeEmployeePayload(raw, sections) {
  const payload = raw && typeof raw === "object" ? raw : {};
  const lastReview = Array.isArray(payload.goal_rows_last_review) ? payload.goal_rows_last_review.map(sanitizeGoalRow) : Array.from({ length: 5 }).map(() => ({ ...EMPTY_GOAL_ROW }));
  const nextReview = Array.isArray(payload.goal_rows_next_review) && payload.goal_rows_next_review.length ? payload.goal_rows_next_review.map(sanitizeGoalRow) : NEXT_REVIEW_GOALS_DEFAULT_ROWS.map((row) => ({ ...row }));
  return {
    review_period: String(payload.review_period || currentQuarter()),
    review_date: payload.review_date || "",
    kpi_self_ratings: sections.reduce((acc, section) => {
      acc[section.key] = makeArray(section.rows.length, payload.kpi_self_ratings?.[section.key] || []);
      return acc;
    }, {}),
    goal_rows_last_review: lastReview,
    goal_rows_next_review: nextReview,
    reflection: {
      achievements: String(payload.reflection?.achievements || ""),
      challenges: String(payload.reflection?.challenges || ""),
      skills_to_develop: String(payload.reflection?.skills_to_develop || ""),
      support_required: String(payload.reflection?.support_required || ""),
    },
  };
}

function makeSupervisorPayload(raw, sections, employeePayload) {
  const payload = raw && typeof raw === "object" ? raw : {};
  return {
    kpi_supervisor_ratings: sections.reduce((acc, section) => {
      acc[section.key] = makeArray(section.rows.length, payload.kpi_supervisor_ratings?.[section.key] || []);
      return acc;
    }, {}),
    kpi_supervisor_comments: sections.reduce((acc, section) => {
      acc[section.key] = makeArray(section.rows.length, payload.kpi_supervisor_comments?.[section.key] || []);
      return acc;
    }, {}),
    goal_supervisor_ratings: {
      last_review: makeArray(employeePayload.goal_rows_last_review.length, payload.goal_supervisor_ratings?.last_review || []),
      next_review: makeArray(employeePayload.goal_rows_next_review.length, payload.goal_supervisor_ratings?.next_review || []),
    },
    supervisor_summary: {
      overall_narrative: String(payload.supervisor_summary?.overall_narrative || ""),
      strengths: String(payload.supervisor_summary?.strengths || ""),
      performance_gaps: String(payload.supervisor_summary?.performance_gaps || ""),
      development_actions: String(payload.supervisor_summary?.development_actions || ""),
    },
  };
}

function KpiTable({ title, rows, selfValues, supervisorValues, supervisorComments, canEditSelf, canEditSupervisor, onSelfChange, onSupervisorChange, onSupervisorCommentChange }) {
  return (
    <div style={{ marginTop: 12 }}>
      <div style={{ fontWeight: 900, marginBottom: 6 }}>{title}</div>
      <div style={{ width: "100%", overflowX: "auto" }}>
        <table className="table" style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: "#f8fafc" }}>
              <th style={{ textAlign: "left", padding: 10 }}>KPI</th>
              <th style={{ textAlign: "left", padding: 10, width: 100 }}>Self</th>
              <th style={{ textAlign: "left", padding: 10, width: 120 }}>Supervisor</th>
              <th style={{ textAlign: "left", padding: 10 }}>Supervisor Comments</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((kpi, idx) => (
              <tr key={`${title}-${idx}`} style={{ borderTop: "1px solid #eef2f7" }}>
                <td style={{ padding: 10, fontWeight: 600 }}>{kpi}</td>
                <td style={{ padding: 10 }}>
                  <select value={selfValues[idx] || ""} onChange={(e) => onSelfChange(idx, e.target.value)} disabled={!canEditSelf}>
                    {RATING_OPTIONS.map((v) => <option key={`self-${title}-${idx}-${v}`} value={v}>{v || "-"}</option>)}
                  </select>
                </td>
                <td style={{ padding: 10 }}>
                  <select value={supervisorValues[idx] || ""} onChange={(e) => onSupervisorChange(idx, e.target.value)} disabled={!canEditSupervisor}>
                    {RATING_OPTIONS.map((v) => <option key={`supervisor-${title}-${idx}-${v}`} value={v}>{v || "-"}</option>)}
                  </select>
                </td>
                <td style={{ padding: 10 }}>
                  <input value={supervisorComments[idx] || ""} onChange={(e) => onSupervisorCommentChange(idx, e.target.value)} disabled={!canEditSupervisor} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function GoalsTable({ title, rows, supervisorValues, canEditRows, canEditSupervisor, onRowChange, onSupervisorChange, onAddRow, onRemoveRow }) {
  return (
    <div style={{ marginTop: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, marginBottom: 6 }}>
        <div style={{ fontWeight: 800 }}>{title}</div>
        {canEditRows && <button className="btn" type="button" onClick={onAddRow}>+ Row</button>}
      </div>
      <div style={{ width: "100%", overflowX: "auto" }}>
        <table className="table" style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: "#f8fafc" }}>
              <th style={{ textAlign: "left", padding: 10, minWidth: 180 }}>Objective</th>
              <th style={{ textAlign: "left", padding: 10, minWidth: 220 }}>Key Results</th>
              <th style={{ textAlign: "left", padding: 10, minWidth: 140 }}>BSC Link</th>
              <th style={{ textAlign: "left", padding: 10, minWidth: 140 }}>Comments</th>
              <th style={{ textAlign: "left", padding: 10, minWidth: 140 }}>Self-Rating</th>
              <th style={{ textAlign: "left", padding: 10, minWidth: 170 }}>Supervisor Rating</th>
              {canEditRows && <th style={{ textAlign: "left", padding: 10, width: 80 }}>Action</th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, idx) => (
              <tr key={`${title}-row-${idx}`} style={{ borderTop: "1px solid #eef2f7" }}>
                <td style={{ padding: 10 }}><textarea value={row.objective} onChange={(e) => onRowChange(idx, "objective", e.target.value)} disabled={!canEditRows} /></td>
                <td style={{ padding: 10 }}><textarea value={row.keyResults} onChange={(e) => onRowChange(idx, "keyResults", e.target.value)} disabled={!canEditRows} /></td>
                <td style={{ padding: 10 }}>
                  <select value={row.bscLink} onChange={(e) => onRowChange(idx, "bscLink", e.target.value)} disabled={!canEditRows}>
                    <option value="">-</option>
                    <option value="Financial">Financial</option>
                    <option value="Client">Client</option>
                    <option value="Internal Process">Internal Process</option>
                    <option value="Learning & Growth">Learning & Growth</option>
                  </select>
                </td>
                <td style={{ padding: 10 }}><textarea value={row.comments} onChange={(e) => onRowChange(idx, "comments", e.target.value)} disabled={!canEditRows} /></td>
                <td style={{ padding: 10 }}>
                  <select value={row.selfRating} onChange={(e) => onRowChange(idx, "selfRating", e.target.value)} disabled={!canEditRows}>
                    {RATING_OPTIONS.map((v) => <option key={`${title}-self-${idx}-${v}`} value={v}>{v || "-"}</option>)}
                  </select>
                </td>
                <td style={{ padding: 10 }}>
                  <select value={supervisorValues[idx] || ""} onChange={(e) => onSupervisorChange(idx, e.target.value)} disabled={!canEditSupervisor}>
                    {RATING_OPTIONS.map((v) => <option key={`${title}-supervisor-${idx}-${v}`} value={v}>{v || "-"}</option>)}
                  </select>
                </td>
                {canEditRows && <td style={{ padding: 10 }}><button className="btn btn-danger" type="button" onClick={() => onRemoveRow(idx)} disabled={rows.length <= 1}>X</button></td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function IndividualGoalsPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { showToast } = useToast();
  const targetUserId = Number(searchParams.get("user_id") || 0) || null;
  const reviewYear = new Date().getFullYear();
  const [current, setCurrent] = useState(null);
  const [busy, setBusy] = useState(false);
  const [savingEmployee, setSavingEmployee] = useState(false);
  const [savingSupervisor, setSavingSupervisor] = useState(false);
  const [error, setError] = useState("");
  const [selectedQuarter, setSelectedQuarter] = useState(currentQuarter());
  const [appraisal, setAppraisal] = useState(null);
  const [employeePayload, setEmployeePayload] = useState(null);
  const [supervisorPayload, setSupervisorPayload] = useState(null);

  const targetUser = appraisal?.employee || current;
  const activeKpiSections = useMemo(() => (
    normalize(targetUser?.designation) === normalize("Senior HR Consultant")
      ? SENIOR_HR_CONSULTANT_KPI_SECTIONS
      : DEFAULT_KPI_SECTIONS
  ), [targetUser?.designation]);

  const hasHrOutsourcingAppraisalForm = useMemo(() => {
    const dept = normalize(targetUser?.department);
    const desig = normalize(targetUser?.designation);
    return dept === normalize("HR OUTSOURCING DEPARTMENT") && HR_OUTSOURCING_APPRAISAL_DESIGNATIONS.has(desig);
  }, [targetUser?.department, targetUser?.designation]);

  useEffect(() => {
    me().then(setCurrent).catch(() => setCurrent(null));
  }, []);

  useEffect(() => {
    if (!current) return;
    let cancelled = false;
    async function load() {
      setBusy(true);
      setError("");
      try {
        const appraisalData = await getPerformanceAppraisal({ userId: targetUserId, year: reviewYear, quarter: selectedQuarter });
        if (!cancelled) setAppraisal(appraisalData);
      } catch (e) {
        if (!cancelled) setError(String(e.message || e));
      } finally {
        if (!cancelled) setBusy(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [current, reviewYear, selectedQuarter, targetUserId]);

  useEffect(() => {
    if (!appraisal) return;
    const nextEmployee = makeEmployeePayload(appraisal.employee_payload, activeKpiSections);
    const nextSupervisor = makeSupervisorPayload(appraisal.supervisor_payload, activeKpiSections, nextEmployee);
    setEmployeePayload(nextEmployee);
    setSupervisorPayload(nextSupervisor);
  }, [appraisal, activeKpiSections]);

  const canEditEmployee = !!appraisal?.can_edit_employee;
  const canEditSupervisor = !!appraisal?.can_edit_supervisor;

  const averageWeightedScore = useMemo(() => {
    if (!supervisorPayload) return null;
    const scores = [
      ...activeKpiSections.flatMap((section) => supervisorPayload.kpi_supervisor_ratings?.[section.key] || []),
      ...(supervisorPayload.goal_supervisor_ratings?.last_review || []),
      ...(supervisorPayload.goal_supervisor_ratings?.next_review || []),
    ]
      .map((v) => Number(v))
      .filter((v) => Number.isFinite(v) && v >= 1 && v <= 5);
    if (!scores.length) return null;
    return Math.round(((scores.reduce((sum, value) => sum + value, 0) / (scores.length * 5)) * 100) * 10) / 10;
  }, [activeKpiSections, supervisorPayload]);

  const performanceCategory = useMemo(() => {
    if (averageWeightedScore == null) return "";
    if (averageWeightedScore <= 40) return "Unsatisfactory";
    if (averageWeightedScore <= 60) return "Needs Improvement";
    if (averageWeightedScore <= 70) return "Meets Expectations";
    if (averageWeightedScore <= 90) return "Strong";
    return "Exceptional";
  }, [averageWeightedScore]);

  function updateEmployeeKpi(sectionKey, rowIndex, value) {
    setEmployeePayload((prev) => ({
      ...prev,
      kpi_self_ratings: {
        ...prev.kpi_self_ratings,
        [sectionKey]: prev.kpi_self_ratings[sectionKey].map((item, idx) => (idx === rowIndex ? value : item)),
      },
    }));
  }

  function updateSupervisorKpi(sectionKey, rowIndex, value) {
    setSupervisorPayload((prev) => ({
      ...prev,
      kpi_supervisor_ratings: {
        ...prev.kpi_supervisor_ratings,
        [sectionKey]: prev.kpi_supervisor_ratings[sectionKey].map((item, idx) => (idx === rowIndex ? value : item)),
      },
    }));
  }

  function updateSupervisorComment(sectionKey, rowIndex, value) {
    setSupervisorPayload((prev) => ({
      ...prev,
      kpi_supervisor_comments: {
        ...prev.kpi_supervisor_comments,
        [sectionKey]: prev.kpi_supervisor_comments[sectionKey].map((item, idx) => (idx === rowIndex ? value : item)),
      },
    }));
  }

  function updateGoalRows(sectionKey, rowIndex, field, value) {
    const targetKey = sectionKey === "last_review" ? "goal_rows_last_review" : "goal_rows_next_review";
    setEmployeePayload((prev) => ({
      ...prev,
      [targetKey]: prev[targetKey].map((row, idx) => (idx === rowIndex ? { ...row, [field]: value } : row)),
    }));
  }

  function addGoalRow(sectionKey) {
    const targetKey = sectionKey === "last_review" ? "goal_rows_last_review" : "goal_rows_next_review";
    setEmployeePayload((prev) => ({ ...prev, [targetKey]: [...prev[targetKey], { ...EMPTY_GOAL_ROW }] }));
    setSupervisorPayload((prev) => ({
      ...prev,
      goal_supervisor_ratings: { ...prev.goal_supervisor_ratings, [sectionKey]: [...(prev.goal_supervisor_ratings?.[sectionKey] || []), ""] },
    }));
  }

  function removeGoalRow(sectionKey, rowIndex) {
    const targetKey = sectionKey === "last_review" ? "goal_rows_last_review" : "goal_rows_next_review";
    setEmployeePayload((prev) => ({ ...prev, [targetKey]: prev[targetKey].filter((_, idx) => idx !== rowIndex) }));
    setSupervisorPayload((prev) => ({
      ...prev,
      goal_supervisor_ratings: { ...prev.goal_supervisor_ratings, [sectionKey]: (prev.goal_supervisor_ratings?.[sectionKey] || []).filter((_, idx) => idx !== rowIndex) },
    }));
  }

  function updateGoalSupervisor(sectionKey, rowIndex, value) {
    setSupervisorPayload((prev) => ({
      ...prev,
      goal_supervisor_ratings: {
        ...prev.goal_supervisor_ratings,
        [sectionKey]: prev.goal_supervisor_ratings[sectionKey].map((item, idx) => (idx === rowIndex ? value : item)),
      },
    }));
  }

  async function saveEmployeeSection() {
    if (!canEditEmployee || !employeePayload) return;
    setSavingEmployee(true);
    setError("");
    try {
      const saved = await savePerformanceEmployeeAppraisal(employeePayload, { userId: appraisal?.employee_id, year: reviewYear, quarter: selectedQuarter });
      setAppraisal(saved);
      showToast("Appraisal self-review saved", "success");
    } catch (e) {
      const text = String(e.message || e);
      setError(text);
      showToast(text, "error");
    } finally {
      setSavingEmployee(false);
    }
  }

  async function saveSupervisorSection() {
    if (!canEditSupervisor || !supervisorPayload) return;
    setSavingSupervisor(true);
    setError("");
    try {
      const saved = await savePerformanceSupervisorAppraisal(supervisorPayload, { userId: appraisal?.employee_id, year: reviewYear, quarter: selectedQuarter });
      setAppraisal(saved);
      showToast("Supervisor review saved", "success");
    } catch (e) {
      const text = String(e.message || e);
      setError(text);
      showToast(text, "error");
    } finally {
      setSavingSupervisor(false);
    }
  }

  if (busy || !employeePayload || !supervisorPayload) {
    return (
      <div className="page-wrap">
        <div className="card">
          <LoadingState label="Loading appraisal form..." />
        </div>
      </div>
    );
  }

  return (
    <div className="page-wrap">
      <div className="card" style={{ marginBottom: 12 }}>
        <div style={{ fontWeight: 900, fontSize: 18 }}>Individual Goals</div>
        <div className="muted">Employee: {targetUser?.name || "-"} | Department: {targetUser?.department || "-"} | Designation: {targetUser?.designation || "-"}</div>
        <div className="muted">Assigned supervisor: {appraisal?.assigned_supervisor?.name || "Unassigned"}</div>
      </div>

      <div className="card">
        {error && <div className="error">{error}</div>}
        {!hasHrOutsourcingAppraisalForm ? (
          <>
            <div className="muted" style={{ marginBottom: 10 }}>
              This appraisal form is currently configured for: HR OUTSOURCING DEPARTMENT / Junior HR Consultant, Senior HR Consultant, HR Admin Assistant.
            </div>
            <button className="btn" type="button" onClick={() => navigate("/performance-management")}>Back to Performance Management</button>
          </>
        ) : (
          <>
            <div className="field" style={{ maxWidth: 320, marginBottom: 8 }}>
              <label>Appraisal Quarter</label>
              <select value={selectedQuarter} onChange={(e) => setSelectedQuarter(e.target.value)}>
                <option value="Q1">Q1</option>
                <option value="Q2">Q2</option>
                <option value="Q3">Q3</option>
                <option value="Q4">Q4</option>
              </select>
              <div className="helper">Quarter switches the saved appraisal period for {reviewYear}.</div>
            </div>

            <div style={{ fontWeight: 900, marginBottom: 4 }}>SUSTENIR HR CONSULTANCY</div>
            <div style={{ fontWeight: 800, marginBottom: 8 }}>
              PERFORMANCE APPRAISAL FORM - {(targetUser?.designation || "HR OUTSOURCING STAFF").toUpperCase()}
            </div>

            <div className="row">
              <div className="field" style={{ flex: "1 1 200px" }}>
                <label>Review Period</label>
                <input value={employeePayload.review_period || selectedQuarter} onChange={(e) => setEmployeePayload((prev) => ({ ...prev, review_period: e.target.value }))} disabled={!canEditEmployee} />
              </div>
              <div className="field" style={{ flex: "1 1 220px" }}>
                <label>Employee Name</label>
                <input value={targetUser?.name || ""} readOnly />
              </div>
              <div className="field" style={{ flex: "1 1 220px" }}>
                <label>Supervisor</label>
                <input value={appraisal?.assigned_supervisor?.name || ""} readOnly />
              </div>
              <div className="field" style={{ flex: "1 1 180px" }}>
                <label>Date</label>
                <input type="date" value={employeePayload.review_date || ""} onChange={(e) => setEmployeePayload((prev) => ({ ...prev, review_date: e.target.value }))} disabled={!canEditEmployee} />
              </div>
            </div>

            <div className="helper" style={{ marginBottom: 10 }}>
              Role purpose: Deliver HR outsourcing services, support recruitment assignments, maintain documentation standards, and ensure responsive client service.
            </div>
            <div className="helper" style={{ marginBottom: 6, fontWeight: 700 }}>
              Rating Scale: 5 Exceptional, 4 Strong, 3 Meets, 2 Needs Improvement, 1 Unsatisfactory
            </div>
            {!canEditSupervisor && <div className="helper" style={{ marginBottom: 8 }}>Supervisor ratings/comments can only be filled by the employee's assigned supervisor.</div>}

            {activeKpiSections.map((section) => (
              <KpiTable
                key={section.key}
                title={section.title}
                rows={section.rows}
                selfValues={employeePayload.kpi_self_ratings?.[section.key] || []}
                supervisorValues={supervisorPayload.kpi_supervisor_ratings?.[section.key] || []}
                supervisorComments={supervisorPayload.kpi_supervisor_comments?.[section.key] || []}
                canEditSelf={canEditEmployee}
                canEditSupervisor={canEditSupervisor}
                onSelfChange={(idx, value) => updateEmployeeKpi(section.key, idx, value)}
                onSupervisorChange={(idx, value) => updateSupervisorKpi(section.key, idx, value)}
                onSupervisorCommentChange={(idx, value) => updateSupervisorComment(section.key, idx, value)}
              />
            ))}

            <div style={{ fontWeight: 900, marginTop: 14 }}>Section 5: Goal Setting - OKR Framework</div>
            <GoalsTable
              title="Goals set in the last review period"
              rows={employeePayload.goal_rows_last_review}
              supervisorValues={supervisorPayload.goal_supervisor_ratings?.last_review || []}
              canEditRows={canEditEmployee}
              canEditSupervisor={canEditSupervisor}
              onRowChange={(idx, field, value) => updateGoalRows("last_review", idx, field, value)}
              onSupervisorChange={(idx, value) => updateGoalSupervisor("last_review", idx, value)}
              onAddRow={() => addGoalRow("last_review")}
              onRemoveRow={(idx) => removeGoalRow("last_review", idx)}
            />
            <GoalsTable
              title="New goals for the next review period"
              rows={employeePayload.goal_rows_next_review}
              supervisorValues={supervisorPayload.goal_supervisor_ratings?.next_review || []}
              canEditRows={canEditEmployee}
              canEditSupervisor={canEditSupervisor}
              onRowChange={(idx, field, value) => updateGoalRows("next_review", idx, field, value)}
              onSupervisorChange={(idx, value) => updateGoalSupervisor("next_review", idx, value)}
              onAddRow={() => addGoalRow("next_review")}
              onRemoveRow={(idx) => removeGoalRow("next_review", idx)}
            />

            <div style={{ fontWeight: 900, marginTop: 14 }}>Section 6: Overall Performance Summary</div>
            <div className="row">
              <div className="field" style={{ flex: "1 1 220px" }}>
                <label>Average Score</label>
                <input value={averageWeightedScore == null ? "" : `${averageWeightedScore}%`} readOnly />
              </div>
              <div className="field" style={{ flex: "2 1 420px" }}>
                <label>Performance Category</label>
                <select value={performanceCategory} disabled>
                  <option value="">-</option>
                  <option value="Exceptional">Exceptional</option>
                  <option value="Strong">Strong</option>
                  <option value="Meets Expectations">Meets Expectations</option>
                  <option value="Needs Improvement">Needs Improvement</option>
                  <option value="Unsatisfactory">Unsatisfactory</option>
                </select>
              </div>
            </div>
            <div className="helper" style={{ marginTop: 4 }}>Auto-calculated from all supervisor ratings in Sections 1-5.</div>

            <div style={{ fontWeight: 900, marginTop: 14 }}>Section 7: Reflection & Supervisor Review</div>
            <div className="row">
              <div className="field" style={{ flex: "1 1 360px" }}>
                <label>Employee Reflection</label>
                <div className="field">
                  <label>3 Key achievements</label>
                  <textarea value={employeePayload.reflection.achievements} onChange={(e) => setEmployeePayload((prev) => ({ ...prev, reflection: { ...prev.reflection, achievements: e.target.value } }))} disabled={!canEditEmployee} />
                </div>
                <div className="field">
                  <label>Challenges</label>
                  <textarea value={employeePayload.reflection.challenges} onChange={(e) => setEmployeePayload((prev) => ({ ...prev, reflection: { ...prev.reflection, challenges: e.target.value } }))} disabled={!canEditEmployee} />
                </div>
                <div className="field">
                  <label>Skills to develop</label>
                  <textarea value={employeePayload.reflection.skills_to_develop} onChange={(e) => setEmployeePayload((prev) => ({ ...prev, reflection: { ...prev.reflection, skills_to_develop: e.target.value } }))} disabled={!canEditEmployee} />
                </div>
                <div className="field">
                  <label>Support required</label>
                  <textarea value={employeePayload.reflection.support_required} onChange={(e) => setEmployeePayload((prev) => ({ ...prev, reflection: { ...prev.reflection, support_required: e.target.value } }))} disabled={!canEditEmployee} />
                </div>
              </div>
              <div className="field" style={{ flex: "1 1 360px" }}>
                <label>Supervisor Summary</label>
                <div className="field">
                  <label>Overall performance narrative</label>
                  <textarea value={supervisorPayload.supervisor_summary.overall_narrative} onChange={(e) => setSupervisorPayload((prev) => ({ ...prev, supervisor_summary: { ...prev.supervisor_summary, overall_narrative: e.target.value } }))} disabled={!canEditSupervisor} />
                </div>
                <div className="field">
                  <label>Strengths</label>
                  <textarea value={supervisorPayload.supervisor_summary.strengths} onChange={(e) => setSupervisorPayload((prev) => ({ ...prev, supervisor_summary: { ...prev.supervisor_summary, strengths: e.target.value } }))} disabled={!canEditSupervisor} />
                </div>
                <div className="field">
                  <label>Performance gaps</label>
                  <textarea value={supervisorPayload.supervisor_summary.performance_gaps} onChange={(e) => setSupervisorPayload((prev) => ({ ...prev, supervisor_summary: { ...prev.supervisor_summary, performance_gaps: e.target.value } }))} disabled={!canEditSupervisor} />
                </div>
                <div className="field">
                  <label>Development actions</label>
                  <textarea value={supervisorPayload.supervisor_summary.development_actions} onChange={(e) => setSupervisorPayload((prev) => ({ ...prev, supervisor_summary: { ...prev.supervisor_summary, development_actions: e.target.value } }))} disabled={!canEditSupervisor} />
                </div>
              </div>
            </div>

            <div style={{ fontWeight: 900, marginTop: 14 }}>Section 8: Final Comments</div>
            <div className="row">
              <div className="field" style={{ flex: "1 1 360px" }}>
                <label>HR Comment</label>
                <textarea disabled placeholder="Reserved for a later workflow." />
              </div>
              <div className="field" style={{ flex: "1 1 360px" }}>
                <label>CEO Comment</label>
                <textarea disabled placeholder="Reserved for a later workflow." />
              </div>
            </div>

            <div className="row" style={{ marginTop: 8 }}>
              <button className="btn" type="button" onClick={() => navigate("/performance-management")}>Back to Performance Management</button>
              {canEditEmployee && <button className="btn btn-primary" type="button" onClick={saveEmployeeSection} disabled={savingEmployee}>{savingEmployee ? "Saving..." : "Save My Section"}</button>}
              {canEditSupervisor && <button className="btn btn-primary" type="button" onClick={saveSupervisorSection} disabled={savingSupervisor}>{savingSupervisor ? "Saving..." : "Save Supervisor Review"}</button>}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
