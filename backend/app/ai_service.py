from __future__ import annotations

import json
from typing import Optional

from pydantic import BaseModel, ValidationError

from .config import settings


class ClientWorkplanAIReport(BaseModel):
    executive_summary: str
    completed_highlights: list[str] = []
    pending_focus: list[str] = []
    recommended_next_steps: list[str] = []


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
            "You are writing an end-of-quarter client workplan report. "
            "Focus on completed work, notable outcomes, pending items, and concise next steps."
        )
    else:
        instruction = (
            "You are writing a start-of-quarter client workplan report. "
            "Focus on planned work, priorities, scope, and concise next steps."
        )

    schema = {
        "name": "client_workplan_ai_report",
        "schema": {
            "type": "object",
            "additionalProperties": False,
            "properties": {
                "executive_summary": {"type": "string"},
                "completed_highlights": {
                    "type": "array",
                    "items": {"type": "string"},
                },
                "pending_focus": {
                    "type": "array",
                    "items": {"type": "string"},
                },
                "recommended_next_steps": {
                    "type": "array",
                    "items": {"type": "string"},
                },
            },
            "required": [
                "executive_summary",
                "completed_highlights",
                "pending_focus",
                "recommended_next_steps",
            ],
        },
        "strict": True,
    }

    prompt = (
        f"{instruction}\n"
        "Write for a business client. Keep the language specific, concrete, and professional.\n"
        "Do not mention that you are an AI.\n"
        "Use only the supplied data. Do not invent work that is not in the payload.\n"
        "If there are no completed items, say that clearly in the summary.\n"
        "Return concise bullet-friendly content."
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
    except Exception:
        return None

    raw_text = getattr(response, "output_text", "") or ""
    if not raw_text:
        return None

    try:
        data = json.loads(raw_text)
        return ClientWorkplanAIReport.model_validate(data)
    except (json.JSONDecodeError, ValidationError):
        return None
