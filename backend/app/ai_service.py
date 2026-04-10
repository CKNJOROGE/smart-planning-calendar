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


class ClientWorkplanAISection(BaseModel):
    heading: str
    paragraphs: list[str] = []
    bullets: list[str] = []


class ClientWorkplanAIReport(BaseModel):
    title: str
    opening_summary: str
    sections: list[ClientWorkplanAISection] = []
    closing_note: str


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
    if report_kind == "end":
        instruction = (
            "You are writing a complete end-of-quarter client workplan report. "
            "Turn the supplied workplan data into a polished client-facing report that reads like a finished document."
        )
    elif report_kind == "monthly":
        instruction = (
            "You are writing a monthly client progress report. "
            "Turn the supplied workplan data into a polished client-facing progress update that focuses on progress so far, completed work, items still in progress, and next priorities."
        )
    else:
        instruction = (
            "You are writing a complete start-of-quarter client workplan report. "
            "Turn the supplied workplan data into a polished client-facing report that reads like a finished document."
        )

    prompt = (
        f"{instruction}\n"
        "Write for a business client. Keep the language specific, concrete, and professional.\n"
        "Do not mention that you are an AI.\n"
        "Use only the supplied data. Do not invent work that is not in the payload.\n"
        "Do not include task tables or raw JSON.\n"
        "Return a title, a short opening summary, 3 to 5 sections, and a closing note.\n"
        "Each section should have a heading, 1 to 2 short paragraphs, and bullet points only where they add value.\n"
        "If there are no completed items, say that clearly.\n"
        "If the report is for the start of a quarter, focus on the planned work and priorities.\n"
        "If the report is a monthly progress update, focus on what has been achieved so far, what is currently in progress, and what should happen next.\n"
        "If the report is for the end of a quarter, focus on completed work, notable outcomes, and what remains pending."
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
