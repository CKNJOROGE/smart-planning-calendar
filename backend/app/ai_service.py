from __future__ import annotations

import json
import logging
from typing import Optional

from pydantic import BaseModel, ValidationError

from .config import settings

logger = logging.getLogger(__name__)


class ClientWorkplanAISection(BaseModel):
    heading: str
    paragraphs: list[str] = []
    bullets: list[str] = []


class ClientWorkplanAIReport(BaseModel):
    title: str
    opening_summary: str
    sections: list[ClientWorkplanAISection] = []
    closing_note: str


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
        "If the report is for the end of a quarter, focus on completed work, notable outcomes, and what remains pending."
    )

    model_input = json.dumps(payload, default=str)

    try:
        response = client.models.generate_content(
            model=settings.GEMINI_REPORT_MODEL,
            contents=[f"{prompt}\n\nReport input:\n{model_input}"],
            config={
                "response_mime_type": "application/json",
                "response_schema": ClientWorkplanAIReport,
                "temperature": 0.4,
                "max_output_tokens": settings.GEMINI_REPORT_MAX_OUTPUT_TOKENS,
            },
        )
    except Exception as exc:
        logger.exception("Gemini workplan report request failed: %s", exc)
        return None

    parsed = getattr(response, "parsed", None)
    if parsed is not None:
        try:
            parsed_payload = parsed.model_dump() if hasattr(parsed, "model_dump") else parsed
            return ClientWorkplanAIReport.model_validate(parsed_payload)
        except ValidationError:
            logger.exception("Gemini parsed report failed validation")
            return None

    raw_text = getattr(response, "text", "") or ""
    if not raw_text:
        logger.error("Gemini workplan report returned no text output")
        return None

    try:
        data = json.loads(raw_text)
        return ClientWorkplanAIReport.model_validate(data)
    except (json.JSONDecodeError, ValidationError):
        logger.exception("Failed to parse Gemini workplan report response")
        return None
