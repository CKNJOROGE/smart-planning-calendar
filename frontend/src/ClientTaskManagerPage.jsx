import React, { useEffect, useMemo, useState } from "react";
import jsPDF from "jspdf";
import "jspdf-autotable";
import {
  me,
  listTaskYears,
  listTaskClients,
  getClientWorkplanReport,
  listClientWorkplanReportHistory,
  getSavedClientWorkplanReport,
  deleteSavedClientWorkplanReport,
  createClientWorkplanReportFromPayload,
  createTaskClient,
  deleteTaskClient,
  listClientTasks,
  createClientTask,
  updateClientTask,
  appendClientTaskSubtask,
  deleteClientTask,
  listProbationRecords,
  createProbationRecord,
  updateProbationRecord,
  deleteProbationRecord,
} from "./api";
import { useToast } from "./ToastProvider";
import LoadingState from "./LoadingState";

const QUARTERS = [1, 2, 3, 4];

function emptySubtask() {
  return { operational_subtask: "", completion_date: "" };
}

function emptyInlineWorkplanRow(overrides = {}) {
  return {
    workstream: "",
    deliverable: "",
    operational_subtask: "",
    kpi: "",
    completion_date: "",
    ...overrides,
  };
}

function pad2(value) {
  return String(value).padStart(2, "0");
}

function addMonthsToDateInput(dateInput, months) {
  if (!dateInput || !months) return "";
  const [yearText, monthText, dayText] = String(dateInput).split("-");
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return "";
  const monthIndex = month - 1 + Number(months);
  const targetYear = year + Math.floor(monthIndex / 12);
  const targetMonth = ((monthIndex % 12) + 12) % 12;
  const lastDay = new Date(targetYear, targetMonth + 1, 0).getDate();
  const targetDay = Math.min(day, lastDay);
  return `${targetYear}-${pad2(targetMonth + 1)}-${pad2(targetDay)}`;
}

function formatDateInputValue(dateInput) {
  if (!dateInput) return "-";
  const parsed = new Date(`${dateInput}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return dateInput;
  return parsed.toLocaleDateString();
}

function probationReminderLabel(daysUntilEnd) {
  if (daysUntilEnd === 30) return "1 month left";
  if (daysUntilEnd === 14) return "2 weeks left";
  if (daysUntilEnd === 0) return "Ends today";
  if (daysUntilEnd < 0) return `${Math.abs(daysUntilEnd)} day(s) overdue`;
  if (daysUntilEnd < 14) return `${daysUntilEnd} day(s) left`;
  return `${daysUntilEnd} day(s) left`;
}

function probationReminderClass(daysUntilEnd) {
  if (daysUntilEnd < 0) return "dashboard-status-danger";
  if (daysUntilEnd <= 14) return "dashboard-status-warn";
  if (daysUntilEnd <= 30) return "dashboard-status-info";
  return "dashboard-status-ok";
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#39;");
}

function getReportStatusColor(status) {
  if (status === "completed") return "#166534";
  if (status === "in_progress") return "#b45309";
  return "#b91c1c";
}

function getReportKindLabel(kind) {
  if (kind === "workplan") return "Implementation Workplan";
  if (kind === "end") return "End of Quarter";
  if (kind === "monthly") return "Monthly Progress";
  return "Start of Quarter";
}

async function loadLogoAsBase64() {
  try {
    const response = await fetch("/logo.png");
    const blob = await response.blob();
    return await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

function fmtReportDate(dateValue) {
  if (!dateValue) return "";
  return new Date(dateValue).toLocaleDateString("en-KE", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function addPdfPageNumber(doc) {
  const pageCount = doc.internal.getNumberOfPages();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  doc.setFontSize(9);
  doc.setTextColor(107, 114, 128);
  for (let i = 1; i <= pageCount; i += 1) {
    doc.setPage(i);
    doc.text(`Page ${i} of ${pageCount}`, pageWidth - 18, pageHeight - 10, { align: "right" });
  }
}

function addPdfWrappedText(doc, text, x, y, maxWidth, lineHeight = 6) {
  const lines = doc.splitTextToSize(String(text || ""), maxWidth);
  doc.text(lines, x, y);
  return y + lines.length * lineHeight;
}

function buildWorkplanReportPdf(report, fallbackClientName = "") {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const marginX = 14;
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const contentWidth = pageWidth - marginX * 2;
  const ai = report?.ai_report || {};
  const title = ai.title || report?.title || "Client Workplan Report";
  const clientName = report?.client?.name || fallbackClientName || "";
  const periodLabel = `${report?.year || ""} Q${report?.quarter || ""}`.trim();
  const reportTypeLabel = getReportKindLabel(report?.report_kind);

  const ensureSpace = (y, needed = 16) => {
    if (y + needed > pageHeight - 16) {
      doc.addPage();
      return 16;
    }
    return y;
  };

  const addPdfTable = (y, table) => {
    if (!table || !table.headers || !table.headers.length) return y;
    const headers = table.headers;
    const rows = table.rows || [];
    const colCount = headers.length;
    const colWidth = contentWidth / colCount;
    const rowHeight = 7;
    const cellPadX = 2;

    y = ensureSpace(y, rowHeight * 3 + 4);
    doc.setFillColor(20, 28, 56);
    doc.rect(marginX, y, contentWidth, rowHeight, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    headers.forEach((header, i) => {
      doc.text(String(header || ""), marginX + i * colWidth + cellPadX, y + 5, { maxWidth: colWidth - cellPadX * 2 });
    });
    y += rowHeight;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    rows.forEach((row, rowIdx) => {
      y = ensureSpace(y, rowHeight + 2);
      if (rowIdx % 2 === 0) {
        doc.setFillColor(243, 244, 246);
        doc.rect(marginX, y, contentWidth, rowHeight, "F");
      }
      doc.setTextColor(17, 24, 39);
      (row.cells || []).forEach((cell, i) => {
        const cellText = doc.splitTextToSize(String(cell || ""), colWidth - cellPadX * 2);
        doc.text(cellText[0] || "", marginX + i * colWidth + cellPadX, y + 5);
      });
      y += rowHeight;
    });
    y += 4;
    return y;
  };

  const addPdfSection = (y, section, depth = 0) => {
    y = ensureSpace(y, 24);
    const fontSize = depth === 0 ? 13 : 11;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(fontSize);
    doc.setTextColor(31, 41, 55);
    doc.text(section.heading || "Section", marginX + depth * 4, y);
    y += 6;

    const paragraphs = Array.isArray(section.paragraphs) ? section.paragraphs : [];
    paragraphs.forEach((paragraph) => {
      y = ensureSpace(y, 14);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(11);
      doc.setTextColor(17, 24, 39);
      y = addPdfWrappedText(doc, paragraph, marginX + depth * 4, y, contentWidth - depth * 4, 5.5);
      y += 1.5;
    });

    if (section.table) {
      y = addPdfTable(y, section.table);
    }

    const bullets = Array.isArray(section.bullets) ? section.bullets : [];
    if (bullets.length) {
      y = ensureSpace(y, bullets.length * 8 + 8);
      doc.setFontSize(11);
      bullets.forEach((bullet) => {
        const bulletLines = doc.splitTextToSize(`• ${bullet}`, contentWidth - 4 - depth * 4);
        doc.text(bulletLines, marginX + 2 + depth * 4, y);
        y += bulletLines.length * 5.2;
      });
      y += 2;
    }

    const subSections = Array.isArray(section.sub_sections) ? section.sub_sections : [];
    subSections.forEach((sub) => {
      y = addPdfSection(y, sub, depth + 1);
    });

    y += 4;
    return y;
  };

  let y = 16;
  doc.setFillColor(20, 28, 56);
  doc.rect(0, 0, pageWidth, 28, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text("AI Generated Report", marginX, 13);
  doc.setFontSize(11);
  doc.setFont("helvetica", "normal");
  doc.text(clientName || "Client", pageWidth - marginX, 13, { align: "right" });
  doc.text(periodLabel ? `${periodLabel} · ${reportTypeLabel}` : reportTypeLabel, pageWidth - marginX, 20, { align: "right" });

  y = 38;
  doc.setTextColor(17, 24, 39);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  y = addPdfWrappedText(doc, title, marginX, y, contentWidth, 8);
  y += 2;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.setTextColor(75, 85, 99);
  y = addPdfWrappedText(doc, `Generated on ${new Date(report?.generated_at || Date.now()).toLocaleString()}`, marginX, y, contentWidth, 5);
  y += 4;

  const openingSummary = ai.opening_summary || ai.executive_summary || report?.overview || "";
  if (openingSummary) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.setTextColor(31, 41, 55);
    y = ensureSpace(y, 20);
    doc.text("Overview", marginX, y);
    y += 6;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);
    doc.setTextColor(17, 24, 39);
    y = addPdfWrappedText(doc, openingSummary, marginX, y, contentWidth, 5.5);
    y += 2;
  }

  const sections = Array.isArray(ai.sections) ? ai.sections : [];
  if (sections.length) {
    sections.forEach((section) => {
      y = addPdfSection(y, section, 0);
    });
  } else {
    const legacySections = [
      { title: "Completed Highlights", items: ai.completed_highlights || [] },
      { title: "Pending Focus", items: ai.pending_focus || [] },
      { title: "Next Steps", items: ai.recommended_next_steps || [] },
    ].filter((section) => section.items.length);

    legacySections.forEach((section) => {
      y = ensureSpace(y, 16);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(13);
      doc.setTextColor(31, 41, 55);
      doc.text(section.title, marginX, y);
      y += 6;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(11);
      doc.setTextColor(17, 24, 39);
      section.items.forEach((item) => {
        const lines = doc.splitTextToSize(`• ${item}`, contentWidth - 4);
        doc.text(lines, marginX + 2, y);
        y += lines.length * 5.2;
      });
      y += 4;
    });
  }

  if (ai.closing_note) {
    y = ensureSpace(y, 18);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.setTextColor(31, 41, 55);
    doc.text("Closing Note", marginX, y);
    y += 6;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);
    doc.setTextColor(17, 24, 39);
    y = addPdfWrappedText(doc, ai.closing_note, marginX, y, contentWidth, 5.5);
  }

  addPdfPageNumber(doc);
  return doc;
}

function buildWorkplanReportMarkup(report, fallbackClientName = "") {
  if (!report) return "";
  const ai = report.ai_report || {};
  const sections = Array.isArray(ai.sections) ? ai.sections : [];
  const title = ai.title || report.title || "Client Workplan Report";
  const openingSummary =
    ai.opening_summary ||
    ai.executive_summary ||
    report.overview ||
    "";
  const reportTypeLabel = getReportKindLabel(report.report_kind);
  const legacyHighlights = Array.isArray(ai.completed_highlights) ? ai.completed_highlights : [];
  const legacyPending = Array.isArray(ai.pending_focus) ? ai.pending_focus : [];
  const legacyNextSteps = Array.isArray(ai.recommended_next_steps) ? ai.recommended_next_steps : [];

  const renderParagraphs = (paragraphs, fallbackClass = "report-preview-paragraph") =>
    (paragraphs || [])
      .map((paragraph) => `<p class="${fallbackClass}">${escapeHtml(paragraph)}</p>`)
      .join("");

  const renderBullets = (bullets, className = "report-preview-bullets") =>
    (bullets || []).length
      ? `<ul class="${className}">
      ${(bullets || []).map((bullet) => `<li>${escapeHtml(bullet)}</li>`).join("")}
    </ul>`
      : "";

  const renderTable = (table) => {
    if (!table || !table.headers || !table.headers.length) return "";
    const headerCells = table.headers.map((h) => `<th>${escapeHtml(h)}</th>`).join("");
    const bodyRows = (table.rows || [])
      .map(
        (row) =>
          `<tr>${(row.cells || [])
            .map((cell) => `<td>${escapeHtml(cell)}</td>`)
            .join("")}</tr>`
      )
      .join("");
    return `<div class="report-preview-table-wrap"><table class="report-preview-table"><thead><tr>${headerCells}</tr></thead><tbody>${bodyRows}</tbody></table></div>`;
  };

  const renderSection = (section, depth = 0) => {
    const headingClass = depth === 0 ? "report-preview-section-title" : "report-preview-sub-section-title";
    const sectionClass = depth === 0 ? "report-preview-section" : "report-preview-sub-section";
    const html = `
    <section class="${sectionClass}">
      <h${depth + 2} class="${headingClass}">${escapeHtml(section.heading || "Section")}</h${depth + 2}>
      ${renderParagraphs(section.paragraphs)}
      ${renderTable(section.table)}
      ${renderBullets(section.bullets)}
      ${(section.sub_sections || []).map((sub) => renderSection(sub, depth + 1)).join("")}
    </section>`;
    return html;
  };

  return `
  <section class="report-preview-body report-preview-ai-document">
    <div class="report-preview-kicker">
      <span class="report-preview-ai-badge">AI Generated Report</span>
      <span>Client: ${escapeHtml(report.client?.name || fallbackClientName)}</span>
      <span>Period: ${escapeHtml(String(report.year))} Q${escapeHtml(String(report.quarter))}</span>
      <span>Type: ${escapeHtml(reportTypeLabel)}</span>
    </div>
    <h1 class="report-preview-report-title">${escapeHtml(title)}</h1>
    ${openingSummary ? `<p class="report-preview-summary">${escapeHtml(openingSummary)}</p>` : ""}
    ${
      sections.length
        ? sections.map((section) => renderSection(section, 0)).join("")
        : legacyHighlights.length || legacyPending.length || legacyNextSteps.length
        ? `
    <section class="report-preview-section">
      <h2 class="report-preview-section-title">Key points</h2>
      ${
        legacyHighlights.length
          ? `
      <h3 class="report-preview-mini-title">Completed highlights</h3>
      ${renderBullets(legacyHighlights, "report-preview-bullets report-preview-bullets--success")}
      `
          : ""
      }
      ${
        legacyPending.length
          ? `
      <h3 class="report-preview-mini-title">Pending focus</h3>
      ${renderBullets(legacyPending, "report-preview-bullets report-preview-bullets--warn")}
      `
          : ""
      }
      ${
        legacyNextSteps.length
          ? `
      <h3 class="report-preview-mini-title">Next steps</h3>
      ${renderBullets(legacyNextSteps, "report-preview-bullets report-preview-bullets--accent")}
      `
          : ""
      }
    </section>
    `
        : ""
    }
    ${ai.closing_note ? `<p class="report-preview-closing">${escapeHtml(ai.closing_note)}</p>` : ""}
  </section>
  `;
}

async function buildWorkplanReportPdfWithLogo(report, fallbackClientName = "") {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const marginX = 14;
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const contentWidth = pageWidth - marginX * 2;
  const ai = report?.ai_report || {};
  const title = ai.title || report?.title || "Client Workplan Report";
  const clientName = report?.client?.name || fallbackClientName || "";
  const periodLabel = `${report?.year || ""} Q${report?.quarter || ""}`.trim();
  const reportTypeLabel = getReportKindLabel(report?.report_kind);

  const ensureSpace = (y, needed = 16) => {
    if (y + needed > pageHeight - 16) {
      doc.addPage();
      return 16;
    }
    return y;
  };

  const addPdfTable = (y, table) => {
    if (!table || !table.headers || !table.headers.length) return y;
    const headers = table.headers;
    const rows = table.rows || [];
    const colCount = headers.length;
    const colWidth = contentWidth / colCount;
    const rowHeight = 7;
    const cellPadX = 2;

    y = ensureSpace(y, rowHeight * 3 + 4);
    doc.setFillColor(20, 28, 56);
    doc.rect(marginX, y, contentWidth, rowHeight, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    headers.forEach((header, i) => {
      doc.text(String(header || ""), marginX + i * colWidth + cellPadX, y + 5, { maxWidth: colWidth - cellPadX * 2 });
    });
    y += rowHeight;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    rows.forEach((row, rowIdx) => {
      y = ensureSpace(y, rowHeight + 2);
      if (rowIdx % 2 === 0) {
        doc.setFillColor(243, 244, 246);
        doc.rect(marginX, y, contentWidth, rowHeight, "F");
      }
      doc.setTextColor(17, 24, 39);
      (row.cells || []).forEach((cell, i) => {
        const cellText = doc.splitTextToSize(String(cell || ""), colWidth - cellPadX * 2);
        doc.text(cellText[0] || "", marginX + i * colWidth + cellPadX, y + 5);
      });
      y += rowHeight;
    });
    y += 4;
    return y;
  };

  const addPdfSection = (y, section, depth = 0) => {
    y = ensureSpace(y, 24);
    const fontSize = depth === 0 ? 13 : 11;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(fontSize);
    doc.setTextColor(31, 41, 55);
    doc.text(section.heading || "Section", marginX + depth * 4, y);
    y += 6;

    const paragraphs = Array.isArray(section.paragraphs) ? section.paragraphs : [];
    paragraphs.forEach((paragraph) => {
      y = ensureSpace(y, 14);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(11);
      doc.setTextColor(17, 24, 39);
      y = addPdfWrappedText(doc, paragraph, marginX + depth * 4, y, contentWidth - depth * 4, 5.5);
      y += 1.5;
    });

    if (section.table) {
      y = addPdfTable(y, section.table);
    }

    const bullets = Array.isArray(section.bullets) ? section.bullets : [];
    if (bullets.length) {
      y = ensureSpace(y, bullets.length * 8 + 8);
      doc.setFontSize(11);
      bullets.forEach((bullet) => {
        const bulletLines = doc.splitTextToSize(`• ${bullet}`, contentWidth - 4 - depth * 4);
        doc.text(bulletLines, marginX + 2 + depth * 4, y);
        y += bulletLines.length * 5.2;
      });
      y += 2;
    }

    const subSections = Array.isArray(section.sub_sections) ? section.sub_sections : [];
    subSections.forEach((sub) => {
      y = addPdfSection(y, sub, depth + 1);
    });

    y += 4;
    return y;
  };

  const logoBase64 = await loadLogoAsBase64();
  let y = 16;
  if (logoBase64) {
    const imgProps = doc.getImageProperties(logoBase64);
    const imgWidth = 36;
    const imgHeight = (imgProps.height * imgWidth) / imgProps.width;
    doc.setFillColor(20, 28, 56);
    doc.rect(0, 0, pageWidth, 28, "F");
    doc.addImage(logoBase64, "PNG", marginX, 10, imgWidth, imgHeight);
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text(clientName || "Client", pageWidth - marginX, 12, { align: "right" });
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.text(
      periodLabel ? `${periodLabel} · ${reportTypeLabel}` : reportTypeLabel,
      pageWidth - marginX,
      20,
      { align: "right" }
    );
    y = 38;
  } else {
    doc.setFillColor(20, 28, 56);
    doc.rect(0, 0, pageWidth, 28, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.setTextColor(255, 255, 255);
    doc.text(clientName || "Client", pageWidth - marginX, 12, { align: "right" });
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.text(
      periodLabel ? `${periodLabel} · ${reportTypeLabel}` : reportTypeLabel,
      pageWidth - marginX,
      20,
      { align: "right" }
    );
    y = 38;
  }

  doc.setTextColor(17, 24, 39);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  y = addPdfWrappedText(doc, title, marginX, y, contentWidth, 8);
  y += 2;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.setTextColor(75, 85, 99);
  y = addPdfWrappedText(doc, `Generated on ${new Date(report?.generated_at || Date.now()).toLocaleString()}`, marginX, y, contentWidth, 5);
  y += 4;

  const openingSummary = ai.opening_summary || ai.executive_summary || report?.overview || "";
  if (openingSummary) {
    y = ensureSpace(y, 20);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.setTextColor(31, 41, 55);
    doc.text("Overview", marginX, y);
    y += 6;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);
    doc.setTextColor(17, 24, 39);
    y = addPdfWrappedText(doc, openingSummary, marginX, y, contentWidth, 5.5);
    y += 2;
  }

  const sections = Array.isArray(ai.sections) ? ai.sections : [];
  if (sections.length) {
    sections.forEach((section) => {
      y = addPdfSection(y, section, 0);
    });
  }

  if (ai.closing_note) {
    y = ensureSpace(y, 18);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.setTextColor(31, 41, 55);
    doc.text("Closing Note", marginX, y);
    y += 6;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);
    doc.setTextColor(17, 24, 39);
    y = addPdfWrappedText(doc, ai.closing_note, marginX, y, contentWidth, 5.5);
  }

  addPdfPageNumber(doc);
  return doc;
}

function canModifyRow(current, row) {
  return !!current && !!row;
}

function canDeleteRow(current, row) {
  if (!current || !row) return false;
  return (
    current.role === "admin" ||
    current.role === "ceo" ||
    current.role === "supervisor" ||
    Number(current.id) === Number(row.user_id)
  );
}

function getWorkstreamLabel(row) {
  return row?.workstream || row?.task || "";
}

function getDeliverableLabel(row) {
  return row?.deliverable || row?.task || "";
}

function getOperationalSubtaskLabel(row) {
  return row?.operational_subtask || row?.subtask || "";
}

function getKpiLabel(row) {
  return row?.kpi || "";
}

const workplanTableStyle = {
  width: "100%",
  borderCollapse: "collapse",
  tableLayout: "fixed",
};

const workplanHeaderCellStyle = {
  textAlign: "left",
  padding: "8px 10px",
  border: "1px solid rgba(148, 163, 184, 0.32)",
  background: "rgba(241, 245, 249, 0.92)",
  color: "#0f172a",
  fontSize: 13,
  fontWeight: 800,
};

const workplanCellStyle = {
  padding: "6px 10px",
  border: "1px solid rgba(148, 163, 184, 0.24)",
  verticalAlign: "top",
  background: "rgba(255,255,255,0.86)",
};

const workplanInputStyle = {
  width: "100%",
  minWidth: 0,
  border: "1px solid rgba(203, 213, 225, 0.9)",
  outline: "none",
  background: "rgba(255,255,255,0.96)",
  padding: "4px 8px",
  margin: 0,
  font: "inherit",
  color: "inherit",
  boxSizing: "border-box",
  borderRadius: 4,
  lineHeight: 1.25,
  minHeight: 28,
};

const workplanTextareaStyle = {
  ...workplanInputStyle,
  resize: "none",
  lineHeight: 1.25,
  paddingTop: 6,
  paddingBottom: 6,
};

export default function ClientTaskManagerPage() {
  const { showToast } = useToast();

  const [current, setCurrent] = useState(null);
  const [years, setYears] = useState([]);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [clients, setClients] = useState([]);
  const [selectedClientId, setSelectedClientId] = useState(null);
  const [selectedQuarter, setSelectedQuarter] = useState(1);
  const [tasks, setTasks] = useState([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const [mode, setMode] = useState("view");
  const [newClientName, setNewClientName] = useState("");
  const [newWorkstream, setNewWorkstream] = useState("");
  const [newDeliverable, setNewDeliverable] = useState("");
  const [newKpi, setNewKpi] = useState("");
  const [subtaskRows, setSubtaskRows] = useState([emptySubtask()]);
  const [inlineWorkstreamEdits, setInlineWorkstreamEdits] = useState({});
  const [inlineDeliverableEdits, setInlineDeliverableEdits] = useState({});
  const [inlineRowEdits, setInlineRowEdits] = useState({});
  const [newDeliverableRows, setNewDeliverableRows] = useState({});
  const [newSubtaskRows, setNewSubtaskRows] = useState({});
  const [newWorkplanRow, setNewWorkplanRow] = useState(emptyInlineWorkplanRow());
  const [showNewWorkstreamRow, setShowNewWorkstreamRow] = useState(false);
  const [workplanSavingKey, setWorkplanSavingKey] = useState("");
  const [probationRecords, setProbationRecords] = useState([]);
  const [probationDraft, setProbationDraft] = useState({
    employee_name: "",
    hire_date: "",
    probation_months: "3",
  });
  const [probationEditingRows, setProbationEditingRows] = useState({});
  const [probationBusy, setProbationBusy] = useState(false);
  const [exportPeriodScope, setExportPeriodScope] = useState("quarter");
  const [reportKind, setReportKind] = useState("start");
  const [reportHistory, setReportHistory] = useState([]);
  const [reportGenerating, setReportGenerating] = useState(false);
  const [workplanGenerating, setWorkplanGenerating] = useState(false);
  const anyReportGenerating = reportGenerating || workplanGenerating;
  const [reportPreview, setReportPreview] = useState(null);

  const isEditMode = mode === "edit";
  const canManageClients = ["admin", "ceo"].includes(String(current?.role || "").toLowerCase());

  const selectedClient = useMemo(
    () => clients.find((c) => c.id === Number(selectedClientId)) || null,
    [clients, selectedClientId]
  );

  const probationDraftEndDate = useMemo(
    () => addMonthsToDateInput(probationDraft.hire_date, Number(probationDraft.probation_months || 0)),
    [probationDraft.hire_date, probationDraft.probation_months]
  );

  const groupedTasks = useMemo(() => {
    const groups = new Map();
    for (const row of tasks) {
      const key = row.task_group_id || `legacy_${row.id}`;
      if (!groups.has(key)) {
        groups.set(key, {
          key,
          workstream: getWorkstreamLabel(row),
          deliverable: getDeliverableLabel(row),
          kpi: getKpiLabel(row),
          rows: [],
        });
      }
      groups.get(key).rows.push(row);
    }
    return Array.from(groups.values());
  }, [tasks]);

  const workstreamGroups = useMemo(() => {
    const groups = new Map();
    for (const deliverableGroup of groupedTasks) {
      const workstream = deliverableGroup.workstream || "Untitled workstream";
      const key = workstream.trim().toLowerCase() || `workstream_${deliverableGroup.key}`;
      if (!groups.has(key)) {
        groups.set(key, {
          key,
          workstream,
          deliverables: [],
        });
      }
      groups.get(key).deliverables.push(deliverableGroup);
    }

    return Array.from(groups.values()).map((group) => ({
      ...group,
      rowSpan:
        group.deliverables.reduce(
          (total, deliverableGroup) => total + deliverableGroup.rows.length + (isEditMode ? 1 : 0),
          0
        ) + (isEditMode ? 1 : 0),
    }));
  }, [groupedTasks, isEditMode]);

  useEffect(() => {
    (async () => {
      setBusy(true);
      setErr("");
      try {
        const u = await me();
        setCurrent(u);
        const ys = await listTaskYears();
        const normalized = Array.isArray(ys) && ys.length ? ys : [new Date().getFullYear()];
        setYears(normalized);
        if (!normalized.includes(selectedYear)) setSelectedYear(normalized[0]);
      } catch (e) {
        setErr(String(e.message || e));
      } finally {
        setBusy(false);
      }
    })();
  }, []);

  useEffect(() => {
    if (!selectedYear) return;
    (async () => {
      setErr("");
      try {
        const list = await listTaskClients(selectedYear);
        setClients(list);
        setSelectedClientId((prev) => {
          if (prev && list.some((c) => c.id === Number(prev))) return prev;
          return list.length ? list[0].id : null;
        });
      } catch (e) {
        setErr(String(e.message || e));
      }
    })();
  }, [selectedYear]);

  useEffect(() => {
    if (!selectedYear || !selectedClientId || !selectedQuarter) {
      setTasks([]);
      return;
    }
    (async () => {
      setErr("");
      try {
        const list = await listClientTasks({
          year: selectedYear,
          clientId: Number(selectedClientId),
          quarter: selectedQuarter,
        });
        setTasks(list);
      } catch (e) {
        setErr(String(e.message || e));
      }
    })();
  }, [selectedYear, selectedClientId, selectedQuarter]);

  useEffect(() => {
    if (!selectedClientId) {
      setProbationRecords([]);
      setProbationEditingRows({});
      return;
    }
    (async () => {
      setProbationBusy(true);
      try {
        const list = await listProbationRecords(Number(selectedClientId));
        setProbationRecords(list || []);
      } catch (e) {
        setErr(String(e.message || e));
      } finally {
        setProbationBusy(false);
      }
    })();
  }, [selectedClientId]);

  useEffect(() => {
    function handleKeyDown(event) {
      if (event.key === "Escape") {
        setReportPreview(null);
      }
    }
    if (reportPreview) {
      window.addEventListener("keydown", handleKeyDown);
      return () => window.removeEventListener("keydown", handleKeyDown);
    }
    return undefined;
  }, [reportPreview]);

  useEffect(() => {
    if (!selectedClientId || !selectedYear || !selectedQuarter) {
      setReportHistory([]);
      return;
    }
    (async () => {
      try {
        const rows = await listClientWorkplanReportHistory({
          clientId: Number(selectedClientId),
          year: Number(selectedYear),
          quarter: Number(selectedQuarter),
          reportKind,
          limit: 10,
        });
        setReportHistory(rows || []);
      } catch {
        setReportHistory([]);
      }
    })();
  }, [selectedClientId, selectedYear, selectedQuarter, reportKind]);

  useEffect(() => {
    if (!isEditMode) {
      setInlineWorkstreamEdits({});
      setInlineDeliverableEdits({});
      setInlineRowEdits({});
      setNewDeliverableRows({});
      setNewSubtaskRows({});
      setNewWorkplanRow(emptyInlineWorkplanRow());
      setShowNewWorkstreamRow(false);
    }
  }, [isEditMode]);

  useEffect(() => {
    setInlineWorkstreamEdits({});
    setInlineDeliverableEdits({});
    setInlineRowEdits({});
    setNewDeliverableRows({});
    setNewSubtaskRows({});
    setNewWorkplanRow(emptyInlineWorkplanRow());
    setShowNewWorkstreamRow(false);
  }, [selectedYear, selectedClientId, selectedQuarter]);

  async function refreshTasks() {
    if (!selectedYear || !selectedClientId || !selectedQuarter) return;
    const list = await listClientTasks({
      year: selectedYear,
      clientId: Number(selectedClientId),
      quarter: selectedQuarter,
    });
    setTasks(list);
  }

  async function refreshProbationRecords() {
    if (!selectedClientId) return;
    const list = await listProbationRecords(Number(selectedClientId));
    setProbationRecords(list || []);
  }

  async function refreshReportHistory() {
    if (!selectedClientId || !selectedYear || !selectedQuarter) {
      setReportHistory([]);
      return;
    }
    try {
      const rows = await listClientWorkplanReportHistory({
        clientId: Number(selectedClientId),
        year: Number(selectedYear),
        quarter: Number(selectedQuarter),
        reportKind,
        limit: 10,
      });
      setReportHistory(rows || []);
    } catch {
      setReportHistory([]);
    }
  }

  function startEditProbation(record) {
    if (!isEditMode || !record) return;
    setProbationEditingRows((prev) => ({
      ...prev,
      [record.id]: {
        employee_name: record.employee_name || "",
        hire_date: record.hire_date || "",
        probation_months: String(record.probation_months || ""),
      },
    }));
  }

  function cancelEditProbation(recordId) {
    setProbationEditingRows((prev) => {
      const next = { ...prev };
      delete next[recordId];
      return next;
    });
  }

  function patchProbationEdit(recordId, patch) {
    setProbationEditingRows((prev) => ({
      ...prev,
      [recordId]: { ...(prev[recordId] || {}), ...patch },
    }));
  }

  async function handleCreateProbation(e) {
    e.preventDefault();
    if (!isEditMode || !selectedClientId) return;
    const employeeName = (probationDraft.employee_name || "").trim();
    const hireDate = probationDraft.hire_date || "";
    const probationMonths = Number(probationDraft.probation_months);
    if (!employeeName) {
      setErr("Employee name is required.");
      return;
    }
    if (!hireDate) {
      setErr("Date of hire is required.");
      return;
    }
    if (!Number.isFinite(probationMonths) || probationMonths < 1) {
      setErr("Probation period must be at least 1 month.");
      return;
    }
    try {
      await createProbationRecord({
        client_id: Number(selectedClientId),
        employee_name: employeeName,
        hire_date: hireDate,
        probation_months: probationMonths,
      });
      setProbationDraft({ employee_name: "", hire_date: "", probation_months: "3" });
      await refreshProbationRecords();
      showToast("Probation record added", "success");
    } catch (e) {
      const msg = String(e.message || e);
      setErr(msg);
      showToast(msg, "error");
    }
  }

  async function saveProbationRecord(record) {
    if (!isEditMode || !record) return;
    const draft = probationEditingRows[record.id];
    if (!draft) return;
    const employeeName = (draft.employee_name || "").trim();
    const hireDate = draft.hire_date || "";
    const probationMonths = Number(draft.probation_months);
    if (!employeeName) {
      setErr("Employee name cannot be empty.");
      return;
    }
    if (!hireDate) {
      setErr("Date of hire cannot be empty.");
      return;
    }
    if (!Number.isFinite(probationMonths) || probationMonths < 1) {
      setErr("Probation period must be at least 1 month.");
      return;
    }
    try {
      await updateProbationRecord(record.id, {
        employee_name: employeeName,
        hire_date: hireDate,
        probation_months: probationMonths,
      });
      await refreshProbationRecords();
      cancelEditProbation(record.id);
      showToast("Probation record updated", "success");
    } catch (e) {
      const msg = String(e.message || e);
      setErr(msg);
      showToast(msg, "error");
    }
  }

  async function handleDeleteProbation(record) {
    if (!isEditMode || !record) return;
    if (!confirm(`Delete probation record for "${record.employee_name}"?`)) return;
    try {
      await deleteProbationRecord(record.id);
      setProbationRecords((prev) => prev.filter((row) => row.id !== record.id));
      cancelEditProbation(record.id);
      showToast("Probation record deleted", "success");
    } catch (e) {
      const msg = String(e.message || e);
      setErr(msg);
      showToast(msg, "error");
    }
  }

  async function handleCreateClient(e) {
    e.preventDefault();
    if (!isEditMode) return;
    const name = (newClientName || "").trim();
    if (!name) return;
    try {
      const created = await createTaskClient(name);
      setNewClientName("");
      const list = await listTaskClients(selectedYear);
      setClients(list);
      setSelectedClientId(created.id);
      showToast("Client added", "success");
    } catch (e2) {
      const msg = String(e2.message || e2);
      setErr(msg);
      showToast(msg, "error");
    }
  }

  async function handleDeleteClientById(client) {
    if (!isEditMode || !client || !canManageClients) return;
    if (!confirm(`Delete client "${client.name}"?`)) return;
    try {
      await deleteTaskClient(client.id);
      const list = await listTaskClients(selectedYear);
      setClients(list);
      setSelectedClientId((prev) => {
        if (Number(prev) === Number(client.id)) return list.length ? list[0].id : null;
        return prev;
      });
      setTasks([]);
      showToast("Client deleted", "success");
    } catch (e) {
      const msg = String(e.message || e);
      setErr(msg);
      showToast(msg, "error");
    }
  }

  function addSubtaskRow() {
    setSubtaskRows((prev) => [...prev, emptySubtask()]);
  }

  function removeSubtaskRow(idx) {
    setSubtaskRows((prev) => (prev.length <= 1 ? prev : prev.filter((_, i) => i !== idx)));
  }

  function updateSubtaskRow(idx, patch) {
    setSubtaskRows((prev) => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  }

  async function handleCreateTask(e) {
    e.preventDefault();
    if (!isEditMode) return;
    const workstream = (newWorkstream || "").trim();
    const deliverable = (newDeliverable || "").trim();
    const kpi = (newKpi || "").trim();
    if (!workstream || !deliverable || !selectedClientId) {
      setErr("Workstream and deliverable are required.");
      return;
    }
    const cleanedSubtasks = subtaskRows
      .map((s) => ({
        operational_subtask: (s.operational_subtask || "").trim(),
        completion_date: s.completion_date || null,
      }))
      .filter((s) => s.operational_subtask);
    if (!cleanedSubtasks.length) {
      setErr("At least one operational subtask is required.");
      return;
    }

    try {
      await createClientTask({
        client_id: Number(selectedClientId),
        year: Number(selectedYear),
        quarter: Number(selectedQuarter),
        workstream,
        deliverable,
        kpi: kpi || null,
        operational_subtasks: cleanedSubtasks,
      });
      setNewWorkstream("");
      setNewDeliverable("");
      setNewKpi("");
      setSubtaskRows([emptySubtask()]);
      await refreshTasks();
      showToast("Workplan added", "success");
    } catch (e2) {
      const msg = String(e2.message || e2);
      setErr(msg);
      showToast(msg, "error");
    }
  }

  async function handleToggleCompleted(row) {
    if (!isEditMode || !canModifyRow(current, row)) return;
    try {
      const updated = await updateClientTask(row.id, { completed: !row.completed });
      setTasks((prev) => prev.map((r) => (r.id === row.id ? updated : r)));
    } catch (e) {
      const msg = String(e.message || e);
      setErr(msg);
      showToast(msg, "error");
    }
  }

  async function handleDeleteSubtask(row) {
    if (!isEditMode || !canDeleteRow(current, row)) return;
    if (!confirm(`Delete operational subtask "${getOperationalSubtaskLabel(row)}"?`)) return;
    try {
      await deleteClientTask(row.id);
      setTasks((prev) => prev.filter((r) => r.id !== row.id));
      showToast("Operational subtask deleted", "success");
    } catch (e) {
      const msg = String(e.message || e);
      setErr(msg);
      showToast(msg, "error");
    }
  }

  function patchInlineWorkstream(workstreamKey, value) {
    setInlineWorkstreamEdits((prev) => ({ ...prev, [workstreamKey]: value }));
  }

  function patchInlineDeliverable(groupKey, patch) {
    setInlineDeliverableEdits((prev) => ({
      ...prev,
      [groupKey]: { ...(prev[groupKey] || {}), ...patch },
    }));
  }

  function patchInlineRow(rowId, patch) {
    setInlineRowEdits((prev) => ({
      ...prev,
      [rowId]: { ...(prev[rowId] || {}), ...patch },
    }));
  }

  function patchNewDeliverableRow(workstreamKey, patch) {
    setNewDeliverableRows((prev) => ({
      ...prev,
      [workstreamKey]: { ...(prev[workstreamKey] || emptyInlineWorkplanRow()), ...patch },
    }));
  }

  function patchNewSubtaskRow(groupKey, patch) {
    setNewSubtaskRows((prev) => ({
      ...prev,
      [groupKey]: { ...(prev[groupKey] || emptySubtask()), ...patch },
    }));
  }

  async function runInlineSave(key, callback) {
    if (workplanSavingKey === key) return;
    setWorkplanSavingKey(key);
    try {
      await callback();
      setErr("");
    } catch (e) {
      const msg = String(e.message || e);
      setErr(msg);
      showToast(msg, "error");
    } finally {
      setWorkplanSavingKey("");
    }
  }

  async function saveWorkstreamGroup(group) {
    const draftValue = (inlineWorkstreamEdits[group.key] ?? group.workstream ?? "").trim();
    const currentValue = (group.workstream || "").trim();
    if (!draftValue) {
      setErr("Workstream cannot be empty.");
      return;
    }
    if (draftValue === currentValue) return;

    await runInlineSave(`workstream:${group.key}`, async () => {
      await Promise.all(
        group.deliverables
          .filter((deliverableGroup) => deliverableGroup.rows?.length)
          .map((deliverableGroup) => updateClientTask(deliverableGroup.rows[0].id, { workstream: draftValue }))
      );
      setInlineWorkstreamEdits((prev) => {
        const next = { ...prev };
        delete next[group.key];
        return next;
      });
      await refreshTasks();
    });
  }

  async function saveDeliverableGroup(group) {
    const draft = inlineDeliverableEdits[group.key] || {};
    const deliverable = (draft.deliverable ?? group.deliverable ?? "").trim();
    const kpi = draft.kpi ?? group.kpi ?? "";
    const currentDeliverable = (group.deliverable || "").trim();
    const currentKpi = group.kpi || "";

    if (!deliverable) {
      setErr("Deliverable cannot be empty.");
      return;
    }
    if (deliverable === currentDeliverable && kpi === currentKpi) return;

    await runInlineSave(`deliverable:${group.key}`, async () => {
      await updateClientTask(group.rows[0].id, {
        deliverable,
        kpi: kpi.trim() || null,
      });
      setInlineDeliverableEdits((prev) => {
        const next = { ...prev };
        delete next[group.key];
        return next;
      });
      await refreshTasks();
    });
  }

  async function saveInlineRow(row) {
    const draft = inlineRowEdits[row.id];
    if (!draft) return;

    const operationalSubtask = (draft.operational_subtask ?? getOperationalSubtaskLabel(row) ?? "").trim();
    const completionDate = draft.completion_date ?? row.completion_date ?? "";
    const payload = {};

    if (!operationalSubtask) {
      setErr("Operational subtask cannot be empty.");
      return;
    }
    if (operationalSubtask !== getOperationalSubtaskLabel(row)) {
      payload.operational_subtask = operationalSubtask;
    }
    if ((completionDate || "") !== (row.completion_date || "")) {
      payload.completion_date = completionDate || null;
    }
    if (!Object.keys(payload).length) return;

    await runInlineSave(`row:${row.id}`, async () => {
      await updateClientTask(row.id, payload);
      setInlineRowEdits((prev) => {
        const next = { ...prev };
        delete next[row.id];
        return next;
      });
      await refreshTasks();
    });
  }

  async function createInlineSubtask(group) {
    const draft = newSubtaskRows[group.key] || emptySubtask();
    const operationalSubtask = (draft.operational_subtask || "").trim();
    if (!operationalSubtask) {
      setErr("Operational subtask cannot be empty.");
      return;
    }

    await runInlineSave(`new-subtask:${group.key}`, async () => {
      await appendClientTaskSubtask(group.rows[0].id, {
        operational_subtask: operationalSubtask,
        completion_date: draft.completion_date || null,
      });
      setNewSubtaskRows((prev) => {
        const next = { ...prev };
        delete next[group.key];
        return next;
      });
      await refreshTasks();
      showToast("Subtask added", "success");
    });
  }

  async function createInlineDeliverable(workstreamGroup) {
    const draft = newDeliverableRows[workstreamGroup.key] || emptyInlineWorkplanRow({ workstream: workstreamGroup.workstream });
    const deliverable = (draft.deliverable || "").trim();
    const operationalSubtask = (draft.operational_subtask || "").trim();
    if (!deliverable) {
      setErr("Deliverable cannot be empty.");
      return;
    }
    if (!operationalSubtask) {
      setErr("Operational subtask cannot be empty.");
      return;
    }

    await runInlineSave(`new-deliverable:${workstreamGroup.key}`, async () => {
      await createClientTask({
        client_id: Number(selectedClientId),
        year: Number(selectedYear),
        quarter: Number(selectedQuarter),
        workstream: workstreamGroup.workstream,
        deliverable,
        kpi: (draft.kpi || "").trim() || null,
        operational_subtasks: [
          {
            operational_subtask: operationalSubtask,
            completion_date: draft.completion_date || null,
          },
        ],
      });
      setNewDeliverableRows((prev) => {
        const next = { ...prev };
        delete next[workstreamGroup.key];
        return next;
      });
      await refreshTasks();
      showToast("Deliverable added", "success");
    });
  }

  async function createInlineWorkstream() {
    const workstream = (newWorkplanRow.workstream || "").trim();
    const deliverable = (newWorkplanRow.deliverable || "").trim();
    const operationalSubtask = (newWorkplanRow.operational_subtask || "").trim();
    if (!workstream) {
      setErr("Workstream cannot be empty.");
      return;
    }
    if (!deliverable) {
      setErr("Deliverable cannot be empty.");
      return;
    }
    if (!operationalSubtask) {
      setErr("Operational subtask cannot be empty.");
      return;
    }

    await runInlineSave("new-workstream", async () => {
      await createClientTask({
        client_id: Number(selectedClientId),
        year: Number(selectedYear),
        quarter: Number(selectedQuarter),
        workstream,
        deliverable,
        kpi: (newWorkplanRow.kpi || "").trim() || null,
        operational_subtasks: [
          {
            operational_subtask: operationalSubtask,
            completion_date: newWorkplanRow.completion_date || null,
          },
        ],
      });
      setNewWorkplanRow(emptyInlineWorkplanRow());
      setShowNewWorkstreamRow(false);
      await refreshTasks();
      showToast("Workstream added", "success");
    });
  }

  async function handleInlineEnter(event, action, allowMultiline = false) {
    if (event.key !== "Enter") return;
    if (allowMultiline && event.shiftKey) return;
    event.preventDefault();
    await action();
  }

  async function handleExportPdf() {
    try {
      const chosenClient = clients.find((c) => c.id === Number(selectedClientId));
      if (!chosenClient) {
        showToast("No client selected for export", "error");
        return;
      }

      const quarters = exportPeriodScope === "year" ? QUARTERS : [Number(selectedQuarter)];
      const requests = [];
      for (const quarter of quarters) {
        requests.push(
          listClientTasks({
            year: Number(selectedYear),
            clientId: Number(chosenClient.id),
            quarter: Number(quarter),
          }).then((rows) => ({ client: chosenClient, quarter, rows: rows || [] }))
        );
      }
      const chunks = await Promise.all(requests);
      const populatedChunks = chunks.filter((x) => Array.isArray(x.rows) && x.rows.length > 0);

      if (!populatedChunks.length) {
        showToast("No tasks found for chosen filters", "error");
        return;
      }

      const sectionsHtml = populatedChunks
        .map(({ client, quarter, rows }) => {
          const groups = new Map();
          for (const row of rows) {
            const key = row.task_group_id || `legacy_${row.id}`;
            if (!groups.has(key)) {
              groups.set(key, {
                workstream: getWorkstreamLabel(row),
                deliverable: getDeliverableLabel(row),
                kpi: getKpiLabel(row),
                owner: row.user?.name || `User #${row.user_id}`,
                subtasks: [],
              });
            }
            groups.get(key).subtasks.push({
              subtask: getOperationalSubtaskLabel(row),
              completion_date: row.completion_date || "",
              completed: !!row.completed,
            });
          }
          const grouped = Array.from(groups.values());
          const rowsHtml = grouped
            .map(
              (g) => `
              <tr>
                <td style="padding:8px;border-top:1px solid #e5e7eb;vertical-align:top;">${escapeHtml(g.owner)}</td>
                <td style="padding:8px;border-top:1px solid #e5e7eb;vertical-align:top;">
                  <div style="font-weight:700;margin-bottom:4px;">${escapeHtml(g.workstream)}</div>
                  <div style="margin-bottom:4px;color:#334155;">Deliverable: ${escapeHtml(g.deliverable || "-")}</div>
                  ${g.kpi ? `<div style="margin-bottom:4px;color:#475569;">KPI: ${escapeHtml(g.kpi)}</div>` : ""}
                  <ul style="margin:0;padding-left:18px;">
                    ${g.subtasks
                      .map(
                        (s) => `<li style="margin:0 0 4px 0;">
                          ${escapeHtml(s.subtask)}${s.completion_date ? ` - <span style="color:#475569;">${escapeHtml(s.completion_date)}</span>` : ""}
                          <span style="margin-left:8px;color:${s.completed ? "#166534" : "#b45309"};font-weight:700;">
                            ${s.completed ? "Done" : "Pending"}
                          </span>
                        </li>`
                      )
                      .join("")}
                  </ul>
                </td>
              </tr>`
            )
            .join("");

          return `
            <section style="margin:0 0 16px 0;">
              <h3 style="margin:0 0 8px 0;font-size:14px;">
                ${escapeHtml(client.name)} - ${escapeHtml(String(selectedYear))} Q${escapeHtml(String(quarter))}
              </h3>
              <table style="width:100%;border-collapse:collapse;">
                <thead>
                  <tr style="background:#f8fafc;">
                    <th style="text-align:left;padding:8px;">Employee</th>
                    <th style="text-align:left;padding:8px;">Workplan Structure</th>
                  </tr>
                </thead>
                <tbody>${rowsHtml}</tbody>
              </table>
            </section>`;
        })
        .join("");

      const popup = window.open("", "_blank");
      if (!popup) {
        showToast("Popup blocked. Allow popups to export PDF.", "error");
        return;
      }

      popup.document.open();
      popup.document.write(`
        <!doctype html>
        <html>
          <head>
            <meta charset="utf-8" />
            <title>Client Task Manager Export</title>
          </head>
          <body style="font-family:Arial,sans-serif;padding:20px;color:#111;">
            <h1 style="margin:0 0 8px 0;font-size:20px;">Client Task Manager Export</h1>
            <div style="margin:0 0 16px 0;font-size:12px;color:#555;">
              Year: ${escapeHtml(String(selectedYear))}<br/>
              Client: ${escapeHtml(chosenClient.name)}<br/>
              Period filter: ${escapeHtml(exportPeriodScope === "year" ? "Full year (Q1-Q4)" : `Quarter Q${selectedQuarter}`)}<br/>
              Exported on: ${escapeHtml(new Date().toLocaleString())}
            </div>
            ${sectionsHtml}
          </body>
        </html>
      `);
      popup.document.close();

      let printed = false;
      const triggerPrint = () => {
        if (printed || popup.closed) return;
        printed = true;
        popup.focus();
        setTimeout(() => {
          if (!popup.closed) popup.print();
        }, 150);
      };
      popup.onload = triggerPrint;
      setTimeout(triggerPrint, 400);
      showToast("Preparing PDF export...", "success");
    } catch (e) {
      const msg = String(e.message || e);
      setErr(msg);
      showToast(msg, "error");
    }
  }

  function printWorkplanReport(report, fallbackClientName = "") {
    if (!report) return;
    const doc = buildWorkplanReportPdf(report, fallbackClientName);
    const fileName = `${(report.ai_report?.title || report.title || "Client Workplan Report").replace(/[\\/:*?"<>|]+/g, "-")}.pdf`;
    doc.save(fileName);
  }

  async function handleGenerateWorkplanReport() {
    setReportGenerating(true);
    try {
      const chosenClient = clients.find((c) => c.id === Number(selectedClientId));
      if (!chosenClient) {
        showToast("No client selected for report generation", "error");
        return;
      }

      const report = await getClientWorkplanReport({
        clientId: Number(chosenClient.id),
        year: Number(selectedYear),
        quarter: Number(selectedQuarter),
        reportKind,
      });
      setReportPreview(report);
      showToast("AI report ready", "success");
    } catch (e) {
      const msg = String(e.message || e);
      setErr(msg);
      showToast(msg, "error");
    } finally {
      setReportGenerating(false);
    }
  }

  async function handleGenerateAiWorkplanDocument() {
    setWorkplanGenerating(true);
    try {
      const chosenClient = clients.find((c) => c.id === Number(selectedClientId));
      if (!chosenClient) {
        showToast("No client selected for workplan generation", "error");
        return;
      }

      const report = await getClientWorkplanReport({
        clientId: Number(chosenClient.id),
        year: Number(selectedYear),
        quarter: Number(selectedQuarter),
        reportKind: "workplan",
      });
      setReportPreview(report);
      showToast("AI workplan ready", "success");
    } catch (e) {
      const msg = String(e.message || e);
      setErr(msg);
      showToast(msg, "error");
    } finally {
      setWorkplanGenerating(false);
    }
  }

  async function handleOpenSavedReport(reportId) {
    try {
      const report = await getSavedClientWorkplanReport(reportId);
      setReportPreview(report);
    } catch (e) {
      const msg = String(e.message || e);
      setErr(msg);
      showToast(msg, "error");
    }
  }

  async function handleDeleteSavedReport(row) {
    if (!window.confirm(`Delete report "${row.title}"? This cannot be undone.`)) {
      return;
    }
    try {
      const snapshot = await getSavedClientWorkplanReport(row.id);
      await deleteSavedClientWorkplanReport(row.id);
      setReportPreview((prev) =>
        prev?.client?.id === row.client_id && prev?.year === row.year && prev?.quarter === row.quarter ? null : prev
      );
      showToast("Saved report deleted", "success", {
        actionLabel: "Undo",
        onAction: async () => {
          try {
            const restored = await createClientWorkplanReportFromPayload({ report: snapshot });
            await refreshReportHistory();
            setReportPreview(restored);
            showToast("Report restored", "success");
          } catch (restoreErr) {
            const restoreMsg = String(restoreErr.message || restoreErr);
            setErr(restoreMsg);
            showToast(restoreMsg, "error");
          }
        },
      });
      await refreshReportHistory();
    } catch (e) {
      const msg = String(e.message || e);
      setErr(msg);
      showToast(msg, "error");
    }
  }

  function closeReportPreview() {
    setReportPreview(null);
  }

  function handlePrintCurrentPreview() {
    if (!reportPreview) return;
    buildWorkplanReportPdfWithLogo(reportPreview, selectedClient?.name || "")
      .then((doc) => {
        const fileName = `${(reportPreview.ai_report?.title || reportPreview.title || "Client Workplan Report").replace(/[\\/:*?"<>|]+/g, "-")}.pdf`;
        doc.save(fileName);
      })
      .catch((e) => {
        const msg = String(e.message || e);
        setErr(msg);
        showToast(msg, "error");
      });
  }

  if (busy && !current) {
    return (
      <div className="page-wrap client-task-page">
        <div className="card">
          <LoadingState label="Loading task manager..." />
        </div>
      </div>
    );
  }

  return (
    <div className="page-wrap client-task-page">
      <div className="card" style={{ marginBottom: 12 }}>
        <div style={{ fontWeight: 900, fontSize: 18 }}>Client Task Manager</div>
        <div className="muted">
          Year -&gt; Client -&gt; Quarter -&gt; Probation Tracker. View Mode is read-only. Edit Mode unlocks create/edit/delete actions. Workplans now follow Workstream, Deliverable, Operational Subtasks, and KPI.
        </div>
      </div>

      <div className="card" style={{ marginBottom: 12 }}>
        <div style={{ fontWeight: 800, marginBottom: 8 }}>Mode</div>
        <div className="task-mode-toggle-wrap">
          <span className={`task-mode-label ${!isEditMode ? "active" : ""}`}>View</span>
          <button
            type="button"
            className={`task-mode-toggle ${isEditMode ? "is-edit" : ""}`}
            onClick={() => setMode((prev) => (prev === "edit" ? "view" : "edit"))}
            role="switch"
            aria-checked={isEditMode}
            aria-label={`Switch to ${isEditMode ? "view" : "edit"} mode`}
          >
            <span className="task-mode-toggle-knob" />
          </button>
          <span className={`task-mode-label ${isEditMode ? "active" : ""}`}>Edit</span>
        </div>
      </div>

      {err && <div className="error">{err}</div>}

      <div className="card" style={{ marginBottom: 12 }}>
        <div style={{ fontWeight: 800, marginBottom: 8 }}>1) Year</div>
        <div className="row">
          {years.map((y) => (
            <button
              key={y}
              className={`btn task-choice-btn ${Number(selectedYear) === Number(y) ? "task-choice-active" : ""}`}
              onClick={() => setSelectedYear(Number(y))}
            >
              {y}
            </button>
          ))}
        </div>
      </div>

      <div className="card" style={{ marginBottom: 12 }}>
        <div style={{ fontWeight: 800, marginBottom: 8 }}>2) Client</div>

        {isEditMode && (
          <form className="row" onSubmit={handleCreateClient} style={{ marginBottom: 10 }}>
            <div className="field" style={{ flex: "1 1 260px", marginBottom: 0 }}>
              <label>Add client</label>
              <input
                value={newClientName}
                onChange={(e) => setNewClientName(e.target.value)}
                placeholder="e.g., Titan Group"
              />
            </div>
            <div style={{ alignSelf: "end" }}>
              <button className="btn btn-primary" type="submit">Add Client</button>
            </div>
          </form>
        )}

        <div className="row">
          {clients.map((c) => (
            <div key={c.id} style={{ position: "relative", display: "inline-flex" }}>
              <button
                className={`btn task-choice-btn ${Number(selectedClientId) === c.id ? "task-choice-active" : ""}`}
                onClick={() => setSelectedClientId(c.id)}
                style={isEditMode && canManageClients ? { paddingRight: 28 } : undefined}
              >
                {c.name}
              </button>
              {isEditMode && canManageClients && (
                <button
                  type="button"
                  className="btn"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    handleDeleteClientById(c);
                  }}
                  title={`Delete ${c.name}`}
                  style={{
                    position: "absolute",
                    right: 4,
                    top: "50%",
                    transform: "translateY(-50%)",
                    minWidth: 20,
                    width: 20,
                    height: 20,
                    borderRadius: 999,
                    padding: 0,
                    lineHeight: 1,
                    fontWeight: 800,
                  }}
                >
                  x
                </button>
              )}
            </div>
          ))}
          {!clients.length && <div className="muted">No clients yet.</div>}
        </div>
      </div>

      <div className="card" style={{ marginBottom: 12 }}>
        <div style={{ fontWeight: 800, marginBottom: 8 }}>3) Quarter</div>
        <div className="row">
          {QUARTERS.map((q) => (
            <button
              key={q}
              className={`btn task-choice-btn ${Number(selectedQuarter) === q ? "task-choice-active" : ""}`}
              onClick={() => setSelectedQuarter(q)}
              disabled={!selectedClientId}
            >
              Q{q}
            </button>
          ))}
        </div>
      </div>

      <div className="card" style={{ marginBottom: 12 }}>
        <div style={{ fontWeight: 800, marginBottom: 8 }}>4) Probation Tracker</div>
        <div className="muted" style={{ marginBottom: 12 }}>
          Track new employees for {selectedClient?.name || "the selected client"} and watch the probation end date update automatically.
        </div>

        {isEditMode && (
          <form onSubmit={handleCreateProbation} style={{ marginBottom: 14 }}>
            <div className="row">
              <div className="field" style={{ flex: "1 1 240px", marginBottom: 0 }}>
                <label>Employee name</label>
                <input
                  value={probationDraft.employee_name}
                  onChange={(e) => setProbationDraft((prev) => ({ ...prev, employee_name: e.target.value }))}
                  placeholder="e.g., Jane Doe"
                  disabled={!selectedClientId}
                />
              </div>
              <div className="field" style={{ flex: "1 1 180px", marginBottom: 0 }}>
                <label>Date of hire</label>
                <input
                  type="date"
                  value={probationDraft.hire_date}
                  onChange={(e) => setProbationDraft((prev) => ({ ...prev, hire_date: e.target.value }))}
                  disabled={!selectedClientId}
                />
              </div>
              <div className="field" style={{ flex: "1 1 180px", marginBottom: 0 }}>
                <label>Probation period (months)</label>
                <input
                  type="number"
                  min="1"
                  max="60"
                  value={probationDraft.probation_months}
                  onChange={(e) => setProbationDraft((prev) => ({ ...prev, probation_months: e.target.value }))}
                  placeholder="3"
                  disabled={!selectedClientId}
                />
              </div>
              <div className="field" style={{ flex: "1 1 200px", marginBottom: 0 }}>
                <label>End of probation</label>
                <input value={probationDraftEndDate} readOnly placeholder="Auto-calculated" />
              </div>
            </div>
            <div style={{ marginTop: 8 }}>
              <button className="btn btn-primary" type="submit" disabled={!selectedClientId}>
                Save Probation Record
              </button>
            </div>
          </form>
        )}

        {!selectedClientId ? (
          <div className="muted">Select a client to view and add probation records.</div>
        ) : probationBusy ? (
          <LoadingState label="Loading probation tracker..." compact />
        ) : !probationRecords.length ? (
          <div className="muted">No probation records yet for this client.</div>
        ) : (
          <div style={{ display: "grid", gap: 10 }}>
            {probationRecords.map((record) => {
              const draft = probationEditingRows[record.id];
              const isEditing = isEditMode && !!draft;
              const editableEndDate = isEditing
                ? addMonthsToDateInput(draft.hire_date, Number(draft.probation_months || 0))
                : record.probation_end_date;
              return (
                <div key={record.id} className="card client-task-record-card" style={{ padding: 12, borderRadius: 14 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start" }}>
                    <div style={{ minWidth: 0, flex: "1 1 auto" }}>
                      {isEditing ? (
                        <div className="field" style={{ marginBottom: 0 }}>
                          <label>Employee name</label>
                          <input
                            value={draft.employee_name}
                            onChange={(e) => patchProbationEdit(record.id, { employee_name: e.target.value })}
                          />
                        </div>
                      ) : (
                        <div style={{ fontWeight: 800, fontSize: 15 }}>{record.employee_name}</div>
                      )}
                      <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                        {record.client_name}
                      </div>
                    </div>
                    <span className={`dashboard-status-badge ${probationReminderClass(record.days_until_end)}`}>
                      {probationReminderLabel(record.days_until_end)}
                    </span>
                  </div>

                  <div className="row" style={{ marginTop: 10 }}>
                    <div className="field" style={{ flex: "1 1 170px", marginBottom: 0 }}>
                      <label>Date of hire</label>
                      {isEditing ? (
                        <input
                          type="date"
                          value={draft.hire_date}
                          onChange={(e) => patchProbationEdit(record.id, { hire_date: e.target.value })}
                        />
                      ) : (
                        <input value={formatDateInputValue(record.hire_date)} readOnly />
                      )}
                    </div>
                    <div className="field" style={{ flex: "1 1 170px", marginBottom: 0 }}>
                      <label>Probation period (months)</label>
                      {isEditing ? (
                        <input
                          type="number"
                          min="1"
                          max="60"
                          value={draft.probation_months}
                          onChange={(e) => patchProbationEdit(record.id, { probation_months: e.target.value })}
                        />
                      ) : (
                        <input value={String(record.probation_months)} readOnly />
                      )}
                    </div>
                    <div className="field" style={{ flex: "1 1 200px", marginBottom: 0 }}>
                      <label>End of probation</label>
                      <input value={formatDateInputValue(editableEndDate)} readOnly />
                    </div>
                  </div>

                  <div style={{ marginTop: 10, display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
                    <div className="helper">This date is calculated automatically from the hire date and probation period.</div>
                    {isEditMode && (
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        {isEditing ? (
                          <>
                            <button type="button" className="btn btn-primary" onClick={() => saveProbationRecord(record)}>
                              Save
                            </button>
                            <button type="button" className="btn" onClick={() => cancelEditProbation(record.id)}>
                              Cancel
                            </button>
                          </>
                        ) : (
                          <button type="button" className="btn" onClick={() => startEditProbation(record)}>
                            Edit
                          </button>
                        )}
                        <button type="button" className="btn btn-danger" onClick={() => handleDeleteProbation(record)}>
                          Delete
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="card" style={{ marginBottom: 12 }}>
        <div style={{ fontWeight: 800, marginBottom: 8 }}>5) Export PDF</div>
        <div className="row">
          <div className="field" style={{ flex: "1 1 220px", marginBottom: 0 }}>
            <label>Period filter</label>
            <select value={exportPeriodScope} onChange={(e) => setExportPeriodScope(e.target.value)}>
              <option value="quarter">{`Selected quarter (Q${selectedQuarter})`}</option>
              <option value="year">Full year (Q1-Q4)</option>
            </select>
          </div>
          <div style={{ alignSelf: "end" }}>
            <button type="button" className="btn btn-primary" onClick={handleExportPdf} disabled={!selectedClientId}>
              Export PDF
            </button>
          </div>
        </div>
      </div>

      <div className={`card report-card${reportGenerating ? " is-generating" : ""}`} style={{ marginBottom: 12 }}>
      <div style={{ fontWeight: 800, marginBottom: 8 }}>6) AI Client Workplan Report</div>
      <div className="row">
        <div className="field" style={{ flex: "1 1 220px", marginBottom: 0 }}>
          <label>Report type</label>
          <select value={reportKind} onChange={(e) => setReportKind(e.target.value)}>
          <option value="start">Quarter start report</option>
          <option value="monthly">Monthly progress report</option>
          <option value="end">Quarter end report</option>
          </select>
        </div>
        <div style={{ alignSelf: "end" }}>
          <button
            type="button"
            className="btn btn-primary"
            onClick={handleGenerateWorkplanReport}
            disabled={!selectedClientId || anyReportGenerating}
          >
            {reportGenerating ? "Generating..." : "Generate Report"}
          </button>
        </div>
      </div>
      {reportGenerating && (
        <div className="report-card-overlay" aria-live="polite" aria-busy="true">
          <div className="report-card-overlay-panel">
            <LoadingState label="Writing AI report..." compact />
            <div className="report-card-overlay-text">Turning the client workplan into a polished report and saving it.</div>
          </div>
        </div>
      )}
      </div>

      <div className="card" style={{ marginBottom: 12 }}>
      <div style={{ fontWeight: 800, marginBottom: 8 }}>7) Saved AI Report History</div>
        <div className="muted" style={{ marginBottom: 10 }}>
          Recent AI-generated reports for this client, quarter and report type.
        </div>
        {!reportHistory.length ? (
          <div className="muted">No saved reports yet.</div>
        ) : (
          <div style={{ display: "grid", gap: 8 }}>
            {reportHistory.map((row) => (
              <div
                key={row.id}
                className="card client-task-history-card"
                style={{ padding: 12, borderRadius: 12, display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}
              >
                <div>
                  <div style={{ fontWeight: 800 }}>{row.title}</div>
                  <div className="muted" style={{ fontSize: 12 }}>
                    {row.client_name} - {row.year} Q{row.quarter} - {getReportKindLabel(row.report_kind)} -{" "}
                    {new Date(row.created_at).toLocaleString()}
                  </div>
                  <div style={{ marginTop: 6 }}>
                    <span className="event-chip" style={{ background: "rgba(255,255,255,0.16)", color: "#0f6cbd" }}>
                      AI generated
                    </span>
                  </div>
                  <div className="muted" style={{ fontSize: 12 }}>
                    Generated by {row.generated_by_name}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
                  <button type="button" className="btn" onClick={() => handleOpenSavedReport(row.id)}>
                    Open
                  </button>
                  <button
                    type="button"
                    className="btn btn-danger icon-btn"
                    onClick={() => handleDeleteSavedReport(row)}
                    aria-label={`Delete report ${row.title}`}
                    title="Delete report"
                  >
                    <span aria-hidden="true">🗑</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="card" style={{ marginBottom: 12 }}>
        <div style={{ fontWeight: 800, marginBottom: 8 }}>
          8) Workplan {selectedClient ? `- ${selectedClient.name}` : ""}
        </div>

        {isEditMode && (
          <div className="muted" style={{ marginBottom: 12 }}>
            Edit inside the grid. Press Enter on a shaded row to add it.
          </div>
        )}

        <div style={{ width: "100%", overflowX: "auto" }}>
          <table className="table" style={workplanTableStyle}>
            <thead>
              <tr>
                <th style={{ ...workplanHeaderCellStyle, width: "19%" }}>Workstream</th>
                <th style={{ ...workplanHeaderCellStyle, width: "19%" }}>Deliverable</th>
                <th style={{ ...workplanHeaderCellStyle, width: "21%" }}>Operational Subtask</th>
                <th style={{ ...workplanHeaderCellStyle, width: "16%" }}>KPI</th>
                <th style={{ ...workplanHeaderCellStyle, width: "12%" }}>Completion Date</th>
                <th style={{ ...workplanHeaderCellStyle, width: "11%" }}>Status</th>
                <th style={{ ...workplanHeaderCellStyle, width: "12%" }}>Added By</th>
                {isEditMode && <th style={{ ...workplanHeaderCellStyle, width: "9%" }}>Actions</th>}
              </tr>
            </thead>
            <tbody>
              {workstreamGroups.map((workstreamGroup) => (
                <React.Fragment key={workstreamGroup.key}>
                  {workstreamGroup.deliverables.map((group, deliverableIdx) => {
                    const deliverableDraft = inlineDeliverableEdits[group.key] || {};
                    const newDeliverableDraft =
                      newDeliverableRows[workstreamGroup.key] || emptyInlineWorkplanRow({ workstream: workstreamGroup.workstream });
                    const deliverableRowSpan = group.rows.length + (isEditMode ? 1 : 0);

                    return (
                      <React.Fragment key={group.key}>
                        {group.rows.map((row, rowIdx) => {
                          const rowDraft = inlineRowEdits[row.id] || {};
                          const canModifyThisRow = canModifyRow(current, row);
                          const canDeleteThisRow = canDeleteRow(current, row);

                          return (
                            <tr key={row.id}>
                              {deliverableIdx === 0 && rowIdx === 0 ? (
                                <td style={{ ...workplanCellStyle, fontWeight: 700 }} rowSpan={workstreamGroup.rowSpan}>
                                  {isEditMode ? (
                                    <input
                                      value={inlineWorkstreamEdits[workstreamGroup.key] ?? workstreamGroup.workstream}
                                      onChange={(e) => patchInlineWorkstream(workstreamGroup.key, e.target.value)}
                                      onBlur={() => saveWorkstreamGroup(workstreamGroup)}
                                      onKeyDown={(e) => handleInlineEnter(e, () => saveWorkstreamGroup(workstreamGroup))}
                                      style={{ ...workplanInputStyle, fontWeight: 700 }}
                                      disabled={workplanSavingKey === `workstream:${workstreamGroup.key}`}
                                    />
                                  ) : (
                                    <span style={{ fontWeight: 700 }}>{workstreamGroup.workstream}</span>
                                  )}
                                </td>
                              ) : null}
                              {rowIdx === 0 ? (
                                <td style={workplanCellStyle} rowSpan={deliverableRowSpan}>
                                  {isEditMode ? (
                                    <input
                                      value={deliverableDraft.deliverable ?? group.deliverable}
                                      onChange={(e) => patchInlineDeliverable(group.key, { deliverable: e.target.value })}
                                      onBlur={() => saveDeliverableGroup(group)}
                                      onKeyDown={(e) => handleInlineEnter(e, () => saveDeliverableGroup(group))}
                                      style={workplanInputStyle}
                                      disabled={workplanSavingKey === `deliverable:${group.key}`}
                                    />
                                  ) : (
                                    <span>{group.deliverable}</span>
                                  )}
                                </td>
                              ) : null}
                              <td style={workplanCellStyle}>
                                {isEditMode ? (
                                  <input
                                    value={rowDraft.operational_subtask ?? getOperationalSubtaskLabel(row)}
                                    onChange={(e) => patchInlineRow(row.id, { operational_subtask: e.target.value })}
                                    onBlur={() => saveInlineRow(row)}
                                    onKeyDown={(e) => handleInlineEnter(e, () => saveInlineRow(row))}
                                    style={workplanInputStyle}
                                    disabled={workplanSavingKey === `row:${row.id}` || !canModifyThisRow}
                                  />
                                ) : (
                                  getOperationalSubtaskLabel(row)
                                )}
                              </td>
                              {rowIdx === 0 ? (
                                <td style={workplanCellStyle} rowSpan={deliverableRowSpan}>
                                  {isEditMode ? (
                                    <textarea
                                      value={deliverableDraft.kpi ?? group.kpi}
                                      onChange={(e) => patchInlineDeliverable(group.key, { kpi: e.target.value })}
                                      onBlur={() => saveDeliverableGroup(group)}
                                      onKeyDown={(e) => handleInlineEnter(e, () => saveDeliverableGroup(group), true)}
                                      rows={Math.max(2, String(deliverableDraft.kpi ?? group.kpi ?? "").split("\n").length)}
                                      style={workplanTextareaStyle}
                                      disabled={workplanSavingKey === `deliverable:${group.key}`}
                                    />
                                  ) : (
                                    <div style={{ whiteSpace: "pre-wrap" }}>{group.kpi || "-"}</div>
                                  )}
                                </td>
                              ) : null}
                              <td style={workplanCellStyle}>
                                {isEditMode ? (
                                  <input
                                    type="date"
                                    value={rowDraft.completion_date ?? row.completion_date ?? ""}
                                    onChange={(e) => patchInlineRow(row.id, { completion_date: e.target.value })}
                                    onBlur={() => saveInlineRow(row)}
                                    onKeyDown={(e) => handleInlineEnter(e, () => saveInlineRow(row))}
                                    style={workplanInputStyle}
                                    disabled={workplanSavingKey === `row:${row.id}` || !canModifyThisRow}
                                  />
                                ) : (
                                  row.completion_date || "-"
                                )}
                              </td>
                              <td style={workplanCellStyle}>
                                <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontWeight: 500, flexWrap: "wrap", fontSize: 12, lineHeight: 1.2 }}>
                                  <input
                                    type="checkbox"
                                    checked={!!row.completed}
                                    onChange={() => handleToggleCompleted(row)}
                                    disabled={!isEditMode || !canModifyThisRow}
                                  />
                                  {row.completed ? "Done" : "Pending"}
                                </label>
                              </td>
                              <td style={workplanCellStyle}>
                                {row.user?.name || `User #${row.user_id}`}
                              </td>
                              {isEditMode && (
                                <td style={workplanCellStyle}>
                                  <button className="btn btn-danger" type="button" onClick={() => handleDeleteSubtask(row)} disabled={!canDeleteThisRow} style={{ minWidth: 0 }}>
                                    Delete
                                  </button>
                                </td>
                              )}
                            </tr>
                          );
                        })}
                        {isEditMode && (
                          <tr key={`${group.key}-inline-add`} style={{ background: "rgba(241, 245, 249, 0.92)" }}>
                            <td style={workplanCellStyle}>
                              <input
                                value={(newSubtaskRows[group.key] || emptySubtask()).operational_subtask}
                                onChange={(e) => patchNewSubtaskRow(group.key, { operational_subtask: e.target.value })}
                                onKeyDown={(e) => handleInlineEnter(e, () => createInlineSubtask(group))}
                                placeholder=""
                                style={workplanInputStyle}
                                disabled={workplanSavingKey === `new-subtask:${group.key}`}
                              />
                            </td>
                            <td style={workplanCellStyle}>
                              <input
                                type="date"
                                value={(newSubtaskRows[group.key] || emptySubtask()).completion_date}
                                onChange={(e) => patchNewSubtaskRow(group.key, { completion_date: e.target.value })}
                                onKeyDown={(e) => handleInlineEnter(e, () => createInlineSubtask(group))}
                                style={workplanInputStyle}
                                disabled={workplanSavingKey === `new-subtask:${group.key}`}
                              />
                            </td>
                            <td style={workplanCellStyle}></td>
                            <td style={workplanCellStyle}>{current?.name || ""}</td>
                            <td style={workplanCellStyle}></td>
                          </tr>
                        )}
                        {isEditMode && deliverableIdx === workstreamGroup.deliverables.length - 1 && (
                          <tr key={`${workstreamGroup.key}-new-deliverable`} style={{ background: "rgba(248, 250, 252, 0.96)" }}>
                            <td style={workplanCellStyle}>
                              <input
                                value={newDeliverableDraft.deliverable}
                                onChange={(e) => patchNewDeliverableRow(workstreamGroup.key, { deliverable: e.target.value })}
                                onKeyDown={(e) => handleInlineEnter(e, () => createInlineDeliverable(workstreamGroup))}
                                placeholder=""
                                style={workplanInputStyle}
                                disabled={workplanSavingKey === `new-deliverable:${workstreamGroup.key}`}
                              />
                            </td>
                            <td style={workplanCellStyle}>
                              <input
                                value={newDeliverableDraft.operational_subtask}
                                onChange={(e) => patchNewDeliverableRow(workstreamGroup.key, { operational_subtask: e.target.value })}
                                onKeyDown={(e) => handleInlineEnter(e, () => createInlineDeliverable(workstreamGroup))}
                                placeholder=""
                                style={workplanInputStyle}
                                disabled={workplanSavingKey === `new-deliverable:${workstreamGroup.key}`}
                              />
                            </td>
                            <td style={workplanCellStyle}>
                              <textarea
                                value={newDeliverableDraft.kpi}
                                onChange={(e) => patchNewDeliverableRow(workstreamGroup.key, { kpi: e.target.value })}
                                onKeyDown={(e) => handleInlineEnter(e, () => createInlineDeliverable(workstreamGroup), true)}
                                rows={2}
                                placeholder=""
                                style={workplanTextareaStyle}
                                disabled={workplanSavingKey === `new-deliverable:${workstreamGroup.key}`}
                              />
                            </td>
                            <td style={workplanCellStyle}>
                              <input
                                type="date"
                                value={newDeliverableDraft.completion_date}
                                onChange={(e) => patchNewDeliverableRow(workstreamGroup.key, { completion_date: e.target.value })}
                                onKeyDown={(e) => handleInlineEnter(e, () => createInlineDeliverable(workstreamGroup))}
                                style={workplanInputStyle}
                                disabled={workplanSavingKey === `new-deliverable:${workstreamGroup.key}`}
                              />
                            </td>
                            <td style={workplanCellStyle}></td>
                            <td style={workplanCellStyle}>{current?.name || ""}</td>
                            <td style={workplanCellStyle}></td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </React.Fragment>
              ))}
              {isEditMode && selectedClientId && showNewWorkstreamRow && (
                <tr style={{ background: "rgba(226, 232, 240, 0.75)" }}>
                  <td style={workplanCellStyle}>
                    <input
                      value={newWorkplanRow.workstream}
                      onChange={(e) => setNewWorkplanRow((prev) => ({ ...prev, workstream: e.target.value }))}
                      onKeyDown={(e) => handleInlineEnter(e, createInlineWorkstream)}
                      placeholder=""
                      style={{ ...workplanInputStyle, fontWeight: 700 }}
                      disabled={workplanSavingKey === "new-workstream"}
                    />
                  </td>
                  <td style={workplanCellStyle}>
                    <input
                      value={newWorkplanRow.deliverable}
                      onChange={(e) => setNewWorkplanRow((prev) => ({ ...prev, deliverable: e.target.value }))}
                      onKeyDown={(e) => handleInlineEnter(e, createInlineWorkstream)}
                      placeholder=""
                      style={workplanInputStyle}
                      disabled={workplanSavingKey === "new-workstream"}
                    />
                  </td>
                  <td style={workplanCellStyle}>
                    <input
                      value={newWorkplanRow.operational_subtask}
                      onChange={(e) => setNewWorkplanRow((prev) => ({ ...prev, operational_subtask: e.target.value }))}
                      onKeyDown={(e) => handleInlineEnter(e, createInlineWorkstream)}
                      placeholder=""
                      style={workplanInputStyle}
                      disabled={workplanSavingKey === "new-workstream"}
                    />
                  </td>
                  <td style={workplanCellStyle}>
                    <textarea
                      value={newWorkplanRow.kpi}
                      onChange={(e) => setNewWorkplanRow((prev) => ({ ...prev, kpi: e.target.value }))}
                      onKeyDown={(e) => handleInlineEnter(e, createInlineWorkstream, true)}
                      rows={2}
                      placeholder=""
                      style={workplanTextareaStyle}
                      disabled={workplanSavingKey === "new-workstream"}
                    />
                  </td>
                  <td style={workplanCellStyle}>
                    <input
                      type="date"
                      value={newWorkplanRow.completion_date}
                      onChange={(e) => setNewWorkplanRow((prev) => ({ ...prev, completion_date: e.target.value }))}
                      onKeyDown={(e) => handleInlineEnter(e, createInlineWorkstream)}
                      style={workplanInputStyle}
                      disabled={workplanSavingKey === "new-workstream"}
                    />
                  </td>
                  <td style={workplanCellStyle}></td>
                  <td style={workplanCellStyle}>{current?.name || ""}</td>
                  <td style={workplanCellStyle}></td>
                </tr>
              )}
              {!workstreamGroups.length && (
                <tr>
                  <td colSpan={isEditMode ? 8 : 7} style={{ ...workplanCellStyle, color: "#64748b" }}>
                    {!selectedClientId
                      ? "Select a client to start building the workplan table."
                      : busy
                        ? "Loading..."
                        : "No tasks for this year/client/quarter yet."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {isEditMode && selectedClientId && (
          <div style={{ marginTop: 12, display: "flex", gap: 8 }}>
            <button
              type="button"
              className="btn"
              onClick={() => setShowNewWorkstreamRow((prev) => !prev)}
            >
              {showNewWorkstreamRow ? "Cancel new workstream" : "Add workstream"}
            </button>
          </div>
        )}
      </div>

<div className={`card report-card${workplanGenerating ? " is-generating" : ""}`} style={{ marginBottom: 12 }}>
      <div style={{ fontWeight: 800, marginBottom: 8 }}>9) AI Generated Workplan</div>
      <div className="muted" style={{ marginBottom: 10 }}>
        Generate a planning-style implementation document from the workplan currently in the table.
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <button
          type="button"
          className="btn btn-primary"
          onClick={handleGenerateAiWorkplanDocument}
          disabled={!selectedClientId || anyReportGenerating}
        >
          {workplanGenerating ? "Generating..." : "Generate AI Workplan"}
        </button>
        <span className="muted" style={{ fontSize: 12 }}>
          Uses the current client, year, quarter, workstreams, deliverables, KPIs, and subtasks.
        </span>
      </div>
      {workplanGenerating && (
          <div className="report-card-overlay" aria-live="polite" aria-busy="true">
            <div className="report-card-overlay-panel">
              <LoadingState label="Writing AI workplan..." compact />
              <div className="report-card-overlay-text">Turning the current workplan into a polished implementation document.</div>
            </div>
          </div>
        )}
      </div>

      {reportPreview && (
        <div
          className="modal-overlay report-preview-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="report-preview-title"
          onClick={closeReportPreview}
        >
          <div className="modal report-preview-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header report-preview-modal-header">
              <div>
                <div className="report-preview-modal-badge">AI Generated Report</div>
                <h2 className="modal-title" id="report-preview-title">{reportPreview.ai_report?.title || reportPreview.title}</h2>
                <div className="muted" style={{ marginTop: 4, fontSize: 12 }}>
                  Generated on {new Date(reportPreview.generated_at).toLocaleString()}
                </div>
              </div>
              <button type="button" className="btn" onClick={closeReportPreview} aria-label="Close report preview">
                Close
              </button>
            </div>

            <div className="report-preview-scroll">
              <div
                className="report-preview-document"
                dangerouslySetInnerHTML={{ __html: buildWorkplanReportMarkup(reportPreview, selectedClient?.name || "") }}
              />
            </div>

            <div className="modal-actions report-preview-actions">
              <button type="button" className="btn" onClick={closeReportPreview}>
                Back
              </button>
              <button type="button" className="btn btn-primary" onClick={handlePrintCurrentPreview}>
                Download PDF
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
