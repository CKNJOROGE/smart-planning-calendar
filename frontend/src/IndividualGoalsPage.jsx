import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { me } from "./api";

const RATING_OPTIONS = ["", "1", "2", "3", "4", "5"];
const KPI_SECTIONS = [
  {
    key: "financial",
    title: "Section 1: Financial",
    rows: [
      "Timely completion of billable client tasks",
      "Contribution to successful recruitment placements",
      "Efficient use of time and resources",
      "Support retention of assigned clients",
    ],
  },
  {
    key: "client",
    title: "Section 2: Client",
    rows: [
      "Responsiveness to client requests",
      "Professional client communication",
      "SLA adherence",
      "Candidate experience standards",
      "Accuracy of client deliverables",
    ],
  },
  {
    key: "internal_process",
    title: "Section 3: Internal Process",
    rows: [
      "HR documentation completeness",
      "SOP compliance",
      "Monthly reporting accuracy",
      "Recruitment workflow execution",
      "Record keeping and organisation",
    ],
  },
  {
    key: "learning_growth",
    title: "Section 4: Learning & Growth",
    rows: [
      "HR skills improvement",
      "Initiative taken",
      "Application of feedback",
      "Collaboration and knowledge sharing",
    ],
  },
];
const LAST_REVIEW_GOALS_COUNT = 5;
const NEXT_REVIEW_GOALS_DEFAULT_ROWS = [
  {
    objective: "Improve HR documentation accuracy and compliance across assigned clients",
    keyResults: "100% files updated monthly; zero missing statutory documents; reports submitted on time",
    bscLink: "Internal Process",
    comments: "",
    selfRating: "",
    supervisorRating: "",
  },
  {
    objective: "Strengthen recruitment execution efficiency",
    keyResults: "Shortlist within SLA; candidate communication within 48 hrs; maintain pipeline for priority roles",
    bscLink: "Client / Internal Process",
    comments: "",
    selfRating: "",
    supervisorRating: "",
  },
  {
    objective: "Enhance client responsiveness and service quality",
    keyResults: "Respond within 2 hrs; positive feedback from clients; reduce follow-ups",
    bscLink: "Client",
    comments: "",
    selfRating: "",
    supervisorRating: "",
  },
  {
    objective: "Build capability in employee relations and labour law",
    keyResults: "Complete 1 HR training/webinar",
    bscLink: "Learning & Growth",
    comments: "",
    selfRating: "",
    supervisorRating: "",
  },
  {
    objective: "Improve personal productivity and task management",
    keyResults: "Daily task tracker; meet deadlines; reduce rework/errors",
    bscLink: "Financial / Internal Process",
    comments: "",
    selfRating: "",
    supervisorRating: "",
  },
];

function normalize(v) {
  return String(v || "").toLowerCase().replace(/\s+/g, " ").trim();
}

function currentQuarter() {
  const month = new Date().getMonth() + 1;
  if (month <= 3) return "Q1";
  if (month <= 6) return "Q2";
  if (month <= 9) return "Q3";
  return "Q4";
}

function KpiTable({ title, rows, supervisorValues = [], onSupervisorChange }) {
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
              <th style={{ textAlign: "left", padding: 10 }}>Comments</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((kpi, idx) => (
              <tr key={kpi} style={{ borderTop: "1px solid #eef2f7" }}>
                <td style={{ padding: 10, fontWeight: 600 }}>{kpi}</td>
                <td style={{ padding: 10 }}>
                  <select defaultValue="">
                    {RATING_OPTIONS.map((v) => (
                      <option key={`self-${kpi}-${v}`} value={v}>{v || "-"}</option>
                    ))}
                  </select>
                </td>
                <td style={{ padding: 10 }}>
                  <select
                    value={supervisorValues[idx] || ""}
                    onChange={(e) => onSupervisorChange(idx, e.target.value)}
                  >
                    {RATING_OPTIONS.map((v) => (
                      <option key={`sup-${kpi}-${v}`} value={v}>{v || "-"}</option>
                    ))}
                  </select>
                </td>
                <td style={{ padding: 10 }}>
                  <input placeholder="Comments" />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function GoalsTable({ title, defaultRows = [], supervisorValues = [], onSupervisorChange = () => {} }) {
  const rows = defaultRows.length ? defaultRows : Array.from({ length: 5 }).map(() => ({
    objective: "",
    keyResults: "",
    bscLink: "",
    comments: "",
    selfRating: "",
    supervisorRating: "",
  }));
  return (
    <div style={{ marginTop: 10 }}>
      <div style={{ fontWeight: 800, marginBottom: 6 }}>{title}</div>
      <div style={{ width: "100%", overflowX: "auto" }}>
        <table className="table" style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: "#f8fafc" }}>
              <th style={{ textAlign: "left", padding: 10, minWidth: 180 }}>Objective (What)</th>
              <th style={{ textAlign: "left", padding: 10, minWidth: 220 }}>Key Results (How Measured)</th>
              <th style={{ textAlign: "left", padding: 10, minWidth: 140 }}>BSC Link</th>
              <th style={{ textAlign: "left", padding: 10, minWidth: 140 }}>Comments</th>
              <th style={{ textAlign: "left", padding: 10, minWidth: 140 }}>Self-Rating</th>
              <th style={{ textAlign: "left", padding: 10, minWidth: 170 }}>Supervisor Rating</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, idx) => (
              <tr key={`${title}-row-${idx}`} style={{ borderTop: "1px solid #eef2f7" }}>
                <td style={{ padding: 10 }}><textarea defaultValue={row.objective || ""} /></td>
                <td style={{ padding: 10 }}><textarea defaultValue={row.keyResults || ""} /></td>
                <td style={{ padding: 10 }}>
                  <select defaultValue={row.bscLink || ""}>
                    <option value="">-</option>
                    <option value="Financial">Financial</option>
                    <option value="Client">Client</option>
                    <option value="Internal Process">Internal Process</option>
                    <option value="Learning & Growth">Learning & Growth</option>
                  </select>
                </td>
                <td style={{ padding: 10 }}><textarea defaultValue={row.comments || ""} /></td>
                <td style={{ padding: 10 }}>
                  <select defaultValue={row.selfRating || ""}>
                    {RATING_OPTIONS.map((v) => (
                      <option key={`${title}-self-${idx}-${v}`} value={v}>{v || "-"}</option>
                    ))}
                  </select>
                </td>
                <td style={{ padding: 10 }}>
                  <select
                    value={supervisorValues[idx] || row.supervisorRating || ""}
                    onChange={(e) => onSupervisorChange(idx, e.target.value)}
                  >
                    {RATING_OPTIONS.map((v) => (
                      <option key={`${title}-supervisor-${idx}-${v}`} value={v}>{v || "-"}</option>
                    ))}
                  </select>
                </td>
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
  const [current, setCurrent] = useState(null);
  const [selectedQuarter, setSelectedQuarter] = useState(currentQuarter());
  const [supervisorRatings, setSupervisorRatings] = useState(() =>
    KPI_SECTIONS.reduce((acc, section) => {
      acc[section.key] = section.rows.map(() => "");
      return acc;
    }, {})
  );
  const [goalSupervisorRatings, setGoalSupervisorRatings] = useState({
    last_review: Array.from({ length: LAST_REVIEW_GOALS_COUNT }).map(() => ""),
    next_review: Array.from({ length: NEXT_REVIEW_GOALS_DEFAULT_ROWS.length }).map(() => ""),
  });

  const isJuniorHrOutsourcing = useMemo(() => {
    const dept = normalize(current?.department);
    const desig = normalize(current?.designation);
    return dept === normalize("HR OUTSOURCING DEPARTMENT") && desig === normalize("Junior HR Consultant");
  }, [current?.department, current?.designation]);
  const averageWeightedScore = useMemo(() => {
    const sectionRatings = KPI_SECTIONS.flatMap((section) => supervisorRatings[section.key] || []);
    const allRatings = [
      ...sectionRatings,
      ...(goalSupervisorRatings.last_review || []),
      ...(goalSupervisorRatings.next_review || []),
    ];
    const toNumber = (v) => {
      const n = Number(v);
      return Number.isFinite(n) && n >= 1 && n <= 5 ? n : 0;
    };
    const earned = allRatings.reduce((sum, v) => sum + toNumber(v), 0);
    const maxPossible = allRatings.length * 5;
    if (!maxPossible || earned <= 0) return null;
    return Math.round(((earned / maxPossible) * 100) * 10) / 10;
  }, [supervisorRatings, goalSupervisorRatings]);
  const performanceCategory = useMemo(() => {
    if (averageWeightedScore == null) return "";
    if (averageWeightedScore <= 40) return "Unsatisfactory";
    if (averageWeightedScore <= 60) return "Needs Improvement";
    if (averageWeightedScore <= 70) return "Meets Expectations";
    if (averageWeightedScore <= 90) return "Strong";
    return "Exceptional";
  }, [averageWeightedScore]);

  useEffect(() => {
    me().then(setCurrent).catch(() => setCurrent(null));
  }, []);
  function updateSupervisorRating(sectionKey, rowIndex, value) {
    setSupervisorRatings((prev) => {
      const next = { ...prev };
      const arr = [...(next[sectionKey] || [])];
      arr[rowIndex] = value;
      next[sectionKey] = arr;
      return next;
    });
  }
  function updateGoalSupervisorRating(sectionKey, rowIndex, value) {
    setGoalSupervisorRatings((prev) => {
      const next = { ...prev };
      const arr = [...(next[sectionKey] || [])];
      arr[rowIndex] = value;
      next[sectionKey] = arr;
      return next;
    });
  }

  return (
    <div className="page-wrap">
      <div className="card" style={{ marginBottom: 12 }}>
        <div style={{ fontWeight: 900, fontSize: 18 }}>Individual Goals</div>
        <div className="muted">Department: {current?.department || "-"} | Designation: {current?.designation || "-"}</div>
      </div>

      <div className="card">
        {!isJuniorHrOutsourcing ? (
          <>
            <div className="muted" style={{ marginBottom: 10 }}>
              This appraisal form is currently configured for: HR OUTSOURCING DEPARTMENT / Junior HR Consultant.
            </div>
            <button className="btn" type="button" onClick={() => navigate("/performance-management")}>
              Back to Performance Management
            </button>
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
              <div className="helper">Quarter is preselected based on current date.</div>
            </div>

            <div style={{ fontWeight: 900, marginBottom: 4 }}>SUSTENIR HR CONSULTANCY</div>
            <div style={{ fontWeight: 800, marginBottom: 8 }}>PERFORMANCE APPRAISAL FORM - JUNIOR HR CONSULTANT</div>

            <div className="row">
              <div className="field" style={{ flex: "1 1 200px" }}>
                <label>Review Period</label>
                <input defaultValue={selectedQuarter} />
              </div>
              <div className="field" style={{ flex: "1 1 220px" }}>
                <label>Employee Name</label>
                <input defaultValue={current?.name || ""} />
              </div>
              <div className="field" style={{ flex: "1 1 220px" }}>
                <label>Supervisor</label>
                <input />
              </div>
              <div className="field" style={{ flex: "1 1 180px" }}>
                <label>Date</label>
                <input type="date" />
              </div>
            </div>

            <div className="helper" style={{ marginBottom: 10 }}>
              Role purpose: Deliver HR outsourcing services, support recruitment assignments, maintain documentation standards, and ensure responsive client service.
            </div>

            <div className="helper" style={{ marginBottom: 6, fontWeight: 700 }}>
              Rating Scale: 5 Exceptional, 4 Strong, 3 Meets, 2 Needs Improvement, 1 Unsatisfactory
            </div>

            {KPI_SECTIONS.map((section) => (
              <KpiTable
                key={section.key}
                title={section.title}
                rows={section.rows}
                supervisorValues={supervisorRatings[section.key] || []}
                onSupervisorChange={(idx, value) => updateSupervisorRating(section.key, idx, value)}
              />
            ))}

            <div style={{ fontWeight: 900, marginTop: 14 }}>Section 5: Goal Setting - OKR Framework</div>

            <GoalsTable
              title="Goals set in the last review period"
              supervisorValues={goalSupervisorRatings.last_review || []}
              onSupervisorChange={(idx, value) => updateGoalSupervisorRating("last_review", idx, value)}
            />
            <GoalsTable
              title="New goals for the next review period"
              defaultRows={NEXT_REVIEW_GOALS_DEFAULT_ROWS}
              supervisorValues={goalSupervisorRatings.next_review || []}
              onSupervisorChange={(idx, value) => updateGoalSupervisorRating("next_review", idx, value)}
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
            <div className="helper" style={{ marginTop: 4 }}>
              Auto-calculated from all supervisor ratings in Sections 1-5.
            </div>

            <div style={{ fontWeight: 900, marginTop: 14 }}>Section 7: Reflection & Supervisor Review</div>
            <div className="row">
              <div className="field" style={{ flex: "1 1 360px" }}>
                <label>Employee Reflection</label>
                <div className="field">
                  <label>3 Key achievements</label>
                  <textarea />
                </div>
                <div className="field">
                  <label>Challenges</label>
                  <textarea />
                </div>
                <div className="field">
                  <label>Skills to develop</label>
                  <textarea />
                </div>
                <div className="field">
                  <label>Support required</label>
                  <textarea />
                </div>
              </div>
              <div className="field" style={{ flex: "1 1 360px" }}>
                <label>Supervisor Summary</label>
                <div className="field">
                  <label>Overall performance narrative</label>
                  <textarea />
                </div>
                <div className="field">
                  <label>Strengths</label>
                  <textarea />
                </div>
                <div className="field">
                  <label>Performance gaps</label>
                  <textarea />
                </div>
                <div className="field">
                  <label>Development actions</label>
                  <textarea />
                </div>
              </div>
            </div>

            <div className="row" style={{ marginTop: 8 }}>
              <button className="btn" type="button" onClick={() => navigate("/performance-management")}>
                Back to Department Goals
              </button>
              <button className="btn btn-primary" type="button">
                Save Appraisal Draft
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
