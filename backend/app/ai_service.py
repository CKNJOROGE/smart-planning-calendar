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


_client: Optional[OpenAI] = None
_openai_import_error: Optional[Exception] = None


def _get_client() -> Optional[OpenAI]:
    global _client
    global _openai_import_error
    if not settings.OPENAI_API_KEY:
        return None
    if _client is None:
        try:
            from openai import OpenAI as _OpenAI
        except Exception as exc:  # pragma: no cover - optional dependency
            _openai_import_error = exc
            return None
        _client = _OpenAI(api_key=settings.OPENAI_API_KEY)
    return _client


def is_openai_report_enabled() -> bool:
    return bool(settings.OPENAI_API_KEY and settings.OPENAI_REPORT_MODEL)


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

    schema = {
        "name": "client_workplan_ai_report",
        "schema": {
            "type": "object",
            "additionalProperties": False,
            "properties": {
                "title": {"type": "string"},
                "opening_summary": {"type": "string"},
                "sections": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "additionalProperties": False,
                        "properties": {
                            "heading": {"type": "string"},
                            "paragraphs": {
                                "type": "array",
                                "items": {"type": "string"},
                            },
                            "bullets": {
                                "type": "array",
                                "items": {"type": "string"},
                            },
                        },
                        "required": ["heading", "paragraphs", "bullets"],
                    },
                },
                "closing_note": {"type": "string"},
            },
            "required": ["title", "opening_summary", "sections", "closing_note"],
        },
        "strict": True,
    }

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

    try:
        response = client.responses.create(
            model=settings.OPENAI_REPORT_MODEL,
            input=[
                {
                    "role": "system",
                    "content": prompt,
                },
                {
                    "role": "user",
                    "content": json.dumps(payload, default=str),
                },
            ],
            text={
                "format": {
                    "type": "json_schema",
                    "name": schema["name"],
                    "schema": schema["schema"],
                    "strict": True,
                }
            },
            max_output_tokens=settings.OPENAI_REPORT_MAX_OUTPUT_TOKENS,
        )
    except Exception as exc:
        logger.exception("OpenAI workplan report request failed: %s", exc)
        return None

    response_error = getattr(response, "error", None)
    if response_error:
        logger.error("OpenAI workplan report returned an error object: %s", response_error)
        return None

    raw_text = getattr(response, "output_text", "") or ""
    if not raw_text:
        output_items = getattr(response, "output", None) or []
        chunks: list[str] = []
        for item in output_items:
            content = getattr(item, "content", None) or []
            for content_item in content:
                text = getattr(content_item, "text", None)
                if text:
                    chunks.append(str(text))
        raw_text = "".join(chunks).strip()
    if not raw_text:
        logger.error("OpenAI workplan report returned no text output")
        return None

    try:
        data = json.loads(raw_text)
        return ClientWorkplanAIReport.model_validate(data)
    except (json.JSONDecodeError, ValidationError):
        logger.exception("Failed to parse OpenAI workplan report response")
        return None
