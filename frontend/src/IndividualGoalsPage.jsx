import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { me } from "./api";

const RATING_OPTIONS = ["", "1", "2", "3", "4", "5"];

function normalize(v) {
  return String(v || "").toLowerCase().replace(/\s+/g, " ").trim();
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

export default function IndividualGoalsPage() {
  const navigate = useNavigate();
  const [current, setCurrent] = useState(null);

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
            <div style={{ fontWeight: 900, marginBottom: 4 }}>SUSTENIR HR CONSULTANCY</div>
            <div style={{ fontWeight: 800, marginBottom: 8 }}>PERFORMANCE APPRAISAL FORM - JUNIOR HR CONSULTANT</div>

            <div className="row">
              <div className="field" style={{ flex: "1 1 200px" }}>
                <label>Review Period</label>
                <input />
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

            <div className="field">
              <label>Goals set in the last review period</label>
              <textarea placeholder="Objective, key results, comments, ratings..." />
            </div>
            <div className="field">
              <label>New goals for the next review period</label>
              <textarea defaultValue={`1) Improve HR documentation accuracy and compliance across assigned clients
2) Strengthen recruitment execution efficiency
3) Enhance client responsiveness and service quality
4) Build capability in employee relations and labour law
5) Improve personal productivity and task management`} />
            </div>

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
                <textarea placeholder="Key achievements, challenges, skills to develop, support required..." />
              </div>
              <div className="field" style={{ flex: "1 1 360px" }}>
                <label>Supervisor Summary</label>
                <textarea placeholder="Overall narrative, strengths, performance gaps, development actions..." />
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
