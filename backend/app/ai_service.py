from __future__ import annotations

import json
import logging
from typing import Optional

from pydantic import BaseModel, ValidationError

from .config import settings

logger = logging.getLogger(__name__)
DEFAULT_GEMINI_REPORT_MODELS = (
    "gemini-2.5-flash-lite",
    "gemini-2.5-flash",
)


class ClientWorkplanAITableRow(BaseModel):
    cells: list[str] = []


class ClientWorkplanAITable(BaseModel):
    headers: list[str] = []
    rows: list[ClientWorkplanAITableRow] = []


class ClientWorkplanAISection(BaseModel):
    heading: str
    paragraphs: list[str] = []
    bullets: list[str] = []
    table: Optional[ClientWorkplanAITable] = None
    sub_sections: list["ClientWorkplanAISection"] = []


class ClientWorkplanAIReport(BaseModel):
    title: str
    opening_summary: str
    sections: list[ClientWorkplanAISection] = []
    closing_note: str


ClientWorkplanAISection.model_rebuild()


class GeminiReportTemporarilyUnavailableError(RuntimeError):
    pass


_client: Optional["genai.Client"] = None
_gemini_import_error: Optional[Exception] = None


def _get_client() -> Optional["genai.Client"]:
    global _client
    global _gemini_import_error

    if not settings.GEMINI_API_KEY:
        return None

    if _client is None:
        try:
            from google import genai
        except Exception as exc:  # pragma: no cover - optional dependency
            _gemini_import_error = exc
            logger.exception("Gemini client import failed: %s", exc)
            return None
        _client = genai.Client(api_key=settings.GEMINI_API_KEY)
    return _client


def is_gemini_report_enabled() -> bool:
    return bool(settings.GEMINI_API_KEY and settings.GEMINI_REPORT_MODEL)


def _is_temporary_gemini_unavailable(exc: Exception) -> bool:
    message = str(exc).lower()
    return any(
        token in message
        for token in (
            "503",
            "unavailable",
            "high demand",
            "temporarily",
            "try again later",
        )
    )


def build_client_workplan_ai_report(payload: dict) -> Optional[ClientWorkplanAIReport]:
    client = _get_client()
    if client is None:
        return None

    report_kind = (payload.get("report_kind") or "start").strip().lower()

    shared_rules = (
        "Write for a business client. Keep the language specific, concrete, and professional. "
        "Do not mention that you are an AI. "
        "Use only the supplied data. Do not invent work that is not in the payload. "
        "Do not include raw JSON. "
        "Treat the workplan hierarchy as workstream, deliverable, operational subtask, and KPI. "
        "Use the operational subtasks as the concrete actions that drive progress and reporting detail. "
        "Use workstreams as the primary organizing structure. Each workstream should appear once in the report instead of being repeated for every deliverable. "
        "Within each workstream, explain the deliverables and operational subtasks as part of one flowing narrative. "
        "Write like a story of how the work was or will be carried out, not like a copied task list. "
        "If there are no completed items, say that clearly. "
        "Never describe an item from in_progress or pending as completed, and never move an item from completed into a pending status. "
        "You may include a table in any section where tabular data adds value — for example, a summary of workstreams with their deliverables, KPIs, target dates, and statuses. "
        "When including a table, set the table field with headers and rows. Each row has a cells array with one string per column. "
        "You may include sub_sections inside any section to create a deeper hierarchy (e.g., sub-headed content under a main heading). "
    )

    if report_kind == "end":
        instruction = (
            "You are writing a complete end-of-quarter client workplan report. "
            "Turn the supplied workplan data into a polished client-facing report that reads like a finished consulting document."
        )
        kind_rules = (
            "Focus on completed work, notable outcomes, and what remains pending. "
            "Return a title, a substantive opening summary (3-5 sentences), 5 to 8 sections, and a closing note. "
            "Structure the report with these sections: "
            "1. Executive Summary — high-level overview of the quarter's performance and key outcomes. "
            "2. Workstream Performance Review — for each workstream, describe what was achieved, with sub-sections per workstream. Include a table summarizing each workstream's deliverable, KPI, target date, and completion status. "
            "3. Key Achievements — highlight the most significant completions with concrete detail. "
            "4. Pending and Carried-Over Items — list and explain anything still open, with reasons if available. "
            "5. Challenges and Risks — identify any blockers or risks encountered. "
            "6. Recommendations for Next Quarter — forward-looking actions based on what remains. "
            "7. Value Delivered to the Organization — explain the business impact of the completed work. "
            "8. Closing Remarks — a professional closing note. "
        )
    elif report_kind == "monthly":
        month_names = {1: "January", 2: "February", 3: "March", 4: "April", 5: "May", 6: "June", 7: "July", 8: "August", 9: "September", 10: "October", 11: "November", 12: "December"}
        month_val = payload.get("month")
        month_name = month_names.get(month_val) if month_val else None
        month_ref = f" for {month_name}" if month_name else ""
        instruction = (
            f"You are writing a monthly HR operations progress report{month_ref}. "
            "Turn the supplied workplan data into a polished client-facing progress update that reads like a professional consulting monthly report."
        )
        kind_rules = (
            f"Focus on what has been achieved{month_ref}, what is currently in progress, and what should happen next. "
            "Treat the status_buckets in the payload as authoritative — the completed list only contains items finalized in the reporting month, while in_progress and pending items represent the remaining workload. "
            "Return a title, a substantive opening summary (3-5 sentences), 5 to 7 sections, and a closing note. "
            "Structure the report with these sections: "
            "1. Executive Summary — brief overview of the month's progress, overall completion percentage, and key focus areas. "
            "2. Completed Activities — detail the work that has been finalized this period, organized by workstream. Include a table of completed items with deliverable, operational subtask, completion date, and KPI. "
            "3. In-Progress Activities — describe work currently underway, organized by workstream, with expected completion targets. "
            "4. Pending Activities — list items not yet started, with target dates and any noted blockers. "
            "5. Workstream Narratives — for each workstream, provide a short narrative paragraph on progress, challenges, and outlook. Use sub-sections for each workstream. "
            "6. Key Risks and Issues — highlight any risks, delays, or blockers. "
            "7. Priorities for Next Period — actionable next steps. "
        )
    elif report_kind == "workplan":
        instruction = (
            "You are writing an HR implementation workplan document for a client. "
            "Turn the supplied workplan data into a polished, comprehensive, consulting-quality workplan and delivery document."
        )
        kind_rules = (
            "This is a planning document, not a progress report. Focus on the planned scope, approach, timelines, and expected outputs. "
            "Return a title, a substantive opening summary (4-6 sentences), 6 to 9 sections, and a closing note. "
            "Structure the document with these sections: "
            "1. Executive Summary and Strategic Context — set out the purpose of the engagement and the strategic objectives the workplan addresses. "
            "2. Scope of Work — describe the overall scope, organized by workstream. Include a table listing each workstream, its deliverables, KPIs, and target completion dates. "
            "3. Key Activities and Timelines — detail the operational subtasks under each workstream with their target dates. Use sub-sections per workstream. Include a table of activities with columns for workstream, deliverable, operational subtask, target date, and KPI. "
            "4. Implementation Approach — describe the methodology, phasing, and how the work will be executed. "
            "5. Deliverables to Management — list the tangible outputs that management will receive, with a table of deliverable, description, and target date. "
            "6. Value to the Organization — explain the business value and expected impact of each workstream's deliverables. "
            "7. Monitoring, Reporting, and Risk Management — describe how progress will be tracked, reported, and how risks will be managed. "
            "8. Support Required from Management — list any decisions, resources, or actions needed from the client's management. "
            "9. Approval and Next Steps — outline the approval process and immediate next actions. "
        )
    else:
        instruction = (
            "You are writing a start-of-quarter client workplan report. "
            "Turn the supplied workplan data into a polished client-facing report that outlines the planned work for the quarter."
        )
        kind_rules = (
            "Focus on the planned work and priorities for the quarter ahead. "
            "Return a title, a substantive opening summary (3-5 sentences), 4 to 6 sections, and a closing note. "
            "Structure the report with these sections: "
            "1. Executive Summary — high-level overview of the quarter's planned scope and priorities. "
            "2. Planned Workstreams — describe each workstream and its deliverables. Include a table summarizing workstream, deliverable, KPI, and target date. "
            "3. Key Activities and Milestones — detail the operational subtasks with target dates, organized by workstream. Use sub-sections per workstream. "
            "4. Implementation Approach — describe how the work will be carried out. "
            "5. Risks and Mitigation — identify potential risks and how they will be addressed. "
            "6. Expected Outcomes — describe the value and impact the planned work will deliver. "
        )

    prompt = (
        f"{instruction}\n"
        f"{shared_rules}\n"
        f"{kind_rules}\n"
        "Each section should have a heading, 1 to 3 paragraphs of professional narrative prose, and bullet points where they add value. "
        "Write detailed, substantive paragraphs — each paragraph should be 3 to 6 sentences. Avoid thin or generic statements. "
        "Be specific: reference actual deliverable names, KPIs, target dates, and operational subtasks from the payload. "
    )

    model_input = json.dumps(payload, default=str)

    configured_model = (settings.GEMINI_REPORT_MODEL or "").strip()
    candidate_models = [configured_model, *DEFAULT_GEMINI_REPORT_MODELS]
    seen_models: set[str] = set()
    ordered_models: list[str] = []
    for model_name in candidate_models:
        if model_name and model_name not in seen_models:
            seen_models.add(model_name)
            ordered_models.append(model_name)

    last_error: Optional[Exception] = None
    for model_name in ordered_models:
        try:
            response = client.models.generate_content(
                model=model_name,
                contents=[f"{prompt}\n\nReport input:\n{model_input}"],
                config={
                    "response_mime_type": "application/json",
                    "response_schema": ClientWorkplanAIReport,
                    "temperature": 0.4,
                    "max_output_tokens": settings.GEMINI_REPORT_MAX_OUTPUT_TOKENS,
                },
            )
        except Exception as exc:
            last_error = exc
            logger.exception("Gemini workplan report request failed for %s: %s", model_name, exc)
            if _is_temporary_gemini_unavailable(exc):
                raise GeminiReportTemporarilyUnavailableError(
                    "Gemini is temporarily busy right now. Please try again in a moment."
                ) from exc
            continue

        parsed = getattr(response, "parsed", None)
        if parsed is not None:
            try:
                parsed_payload = parsed.model_dump() if hasattr(parsed, "model_dump") else parsed
                return ClientWorkplanAIReport.model_validate(parsed_payload)
            except ValidationError:
                last_error = ValidationError.from_exception_data(
                    "ClientWorkplanAIReport",
                    [{"type": "value_error", "loc": ("parsed",), "msg": "Gemini parsed report failed validation", "input": parsed}],
                )
                logger.exception("Gemini parsed report failed validation for %s", model_name)
                continue

        raw_text = getattr(response, "text", "") or ""
        if not raw_text:
            last_error = RuntimeError(f"Gemini model {model_name} returned no text output")
            logger.error("Gemini workplan report returned no text output for %s", model_name)
            continue

        try:
            data = json.loads(raw_text)
            return ClientWorkplanAIReport.model_validate(data)
        except (json.JSONDecodeError, ValidationError) as exc:
            last_error = exc
            logger.exception("Failed to parse Gemini workplan report response for %s", model_name)
            continue

    if last_error is not None:
        logger.error("Gemini workplan report failed after trying %s", ", ".join(ordered_models))
    return None
