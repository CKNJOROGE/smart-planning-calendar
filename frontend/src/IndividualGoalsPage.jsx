import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { me } from "./api";

const RATING_OPTIONS = ["", "1", "2", "3", "4", "5"];

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

function KpiTable({ title, rows }) {
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
            {rows.map((kpi) => (
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
                  <select defaultValue="">
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

function GoalsTable({ title, defaultRows = [] }) {
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
                <td style={{ padding: 10 }}><input defaultValue={row.bscLink || ""} /></td>
                <td style={{ padding: 10 }}><textarea defaultValue={row.comments || ""} /></td>
                <td style={{ padding: 10 }}><input defaultValue={row.selfRating || ""} /></td>
                <td style={{ padding: 10 }}><input defaultValue={row.supervisorRating || ""} /></td>
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

  const isJuniorHrOutsourcing = useMemo(() => {
    const dept = normalize(current?.department);
    const desig = normalize(current?.designation);
    return dept === normalize("HR OUTSOURCING DEPARTMENT") && desig === normalize("Junior HR Consultant");
  }, [current?.department, current?.designation]);

  useEffect(() => {
    me().then(setCurrent).catch(() => setCurrent(null));
  }, []);

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

            <KpiTable
              title="Section 1: Financial (Weight: 15%)"
              rows={[
                "Timely completion of billable client tasks",
                "Contribution to successful recruitment placements",
                "Efficient use of time and resources",
                "Support retention of assigned clients",
              ]}
            />

            <KpiTable
              title="Section 2: Client (Weight: 35%)"
              rows={[
                "Responsiveness to client requests",
                "Professional client communication",
                "SLA adherence",
                "Candidate experience standards",
                "Accuracy of client deliverables",
              ]}
            />

            <KpiTable
              title="Section 3: Internal Process (Weight: 25%)"
              rows={[
                "HR documentation completeness",
                "SOP compliance",
                "Monthly reporting accuracy",
                "Recruitment workflow execution",
                "Record keeping and organisation",
              ]}
            />

            <KpiTable
              title="Section 4: Learning & Growth (Weight: 25%)"
              rows={[
                "HR skills improvement",
                "Initiative taken",
                "Application of feedback",
                "Collaboration and knowledge sharing",
              ]}
            />

            <div style={{ fontWeight: 900, marginTop: 14 }}>Section 5: Goal Setting - OKR Framework</div>
            <div className="field" style={{ marginTop: 6 }}>
              <label>BSC Alignment</label>
              <div className="row">
                <label><input type="checkbox" /> Financial</label>
                <label><input type="checkbox" /> Client</label>
                <label><input type="checkbox" /> Internal Process</label>
                <label><input type="checkbox" /> Learning & Growth</label>
              </div>
            </div>

            <GoalsTable title="Goals set in the last review period" />
            <GoalsTable
              title="New goals for the next review period"
              defaultRows={[
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
              ]}
            />

            <div style={{ fontWeight: 900, marginTop: 14 }}>Section 6: Overall Performance Summary</div>
            <div className="row">
              <div className="field" style={{ flex: "1 1 220px" }}>
                <label>Average Weighted Score</label>
                <input />
              </div>
              <div className="field" style={{ flex: "2 1 420px" }}>
                <label>Performance Category</label>
                <select>
                  <option>Exceptional</option>
                  <option>Strong</option>
                  <option>Meets Expectations</option>
                  <option>Needs Improvement</option>
                  <option>Unsatisfactory</option>
                </select>
              </div>
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
