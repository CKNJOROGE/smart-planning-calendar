import smtplib
import ssl
from email.message import EmailMessage
import json
from urllib import request as urlrequest
from urllib.error import HTTPError, URLError

from .config import settings


def _provider_name() -> str:
    return (settings.EMAIL_PROVIDER or "smtp").strip().lower()


def _brevo_configuration_errors() -> list[str]:
    errors: list[str] = []
    if not settings.BREVO_API_KEY:
        errors.append("BREVO_API_KEY is empty")
    if not settings.BREVO_FROM_EMAIL and not settings.SMTP_FROM_EMAIL:
        errors.append("BREVO_FROM_EMAIL is empty (or set SMTP_FROM_EMAIL)")
    return errors


def smtp_configuration_errors() -> list[str]:
    errors: list[str] = []
    if not settings.SMTP_HOST:
        errors.append("SMTP_HOST is empty")
    if not settings.SMTP_FROM_EMAIL:
        errors.append("SMTP_FROM_EMAIL is empty (or set BREVO_FROM_EMAIL when EMAIL_PROVIDER=brevo)")
    if settings.SMTP_USE_SSL and settings.SMTP_USE_TLS:
        errors.append("SMTP_USE_SSL and SMTP_USE_TLS cannot both be true")
    if settings.SMTP_USERNAME and not settings.SMTP_PASSWORD:
        errors.append("SMTP_PASSWORD is empty while SMTP_USERNAME is set")
    return errors


def smtp_ready() -> bool:
    return len(smtp_configuration_errors()) == 0


def email_delivery_configuration_errors() -> list[str]:
    provider = _provider_name()
    if provider == "smtp":
        return smtp_configuration_errors()
    if provider == "brevo":
        return _brevo_configuration_errors()
    return [f"EMAIL_PROVIDER '{provider}' is not supported"]


def email_delivery_ready() -> bool:
    return len(email_delivery_configuration_errors()) == 0


def password_reset_delivery_configuration_errors() -> list[str]:
    errors = email_delivery_configuration_errors()
    if not settings.FRONTEND_BASE_URL:
        errors.append("FRONTEND_BASE_URL is empty")
    return errors


def password_reset_delivery_ready() -> bool:
    return len(password_reset_delivery_configuration_errors()) == 0


def _send_email_smtp(to_email: str, subject: str, body_text: str) -> None:
    config_errors = smtp_configuration_errors()
    if config_errors:
        raise RuntimeError("SMTP is not configured: " + "; ".join(config_errors))

    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = settings.SMTP_FROM_EMAIL
    msg["To"] = to_email
    msg.set_content(body_text)

    if settings.SMTP_USE_SSL:
        context = ssl.create_default_context()
        with smtplib.SMTP_SSL(settings.SMTP_HOST, settings.SMTP_PORT, context=context, timeout=30) as server:
            if settings.SMTP_USERNAME:
                server.login(settings.SMTP_USERNAME, settings.SMTP_PASSWORD)
            server.send_message(msg)
        return

    with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT, timeout=30) as server:
        if settings.SMTP_USE_TLS:
            context = ssl.create_default_context()
            server.starttls(context=context)
        if settings.SMTP_USERNAME:
            server.login(settings.SMTP_USERNAME, settings.SMTP_PASSWORD)
        server.send_message(msg)


def _send_email_brevo(to_email: str, subject: str, body_text: str) -> None:
    config_errors = _brevo_configuration_errors()
    if config_errors:
        raise RuntimeError("Brevo API is not configured: " + "; ".join(config_errors))

    from_email = settings.BREVO_FROM_EMAIL or settings.SMTP_FROM_EMAIL
    from_name = settings.BREVO_FROM_NAME or "Smart Planning Calendar"
    payload = {
        "sender": {"email": from_email, "name": from_name},
        "to": [{"email": to_email}],
        "subject": subject,
        "textContent": body_text,
    }
    body = json.dumps(payload).encode("utf-8")
    req = urlrequest.Request(
        settings.BREVO_API_URL,
        data=body,
        method="POST",
        headers={
            "accept": "application/json",
            "content-type": "application/json",
            "api-key": settings.BREVO_API_KEY,
        },
    )
    try:
        with urlrequest.urlopen(req, timeout=30) as resp:
            status = getattr(resp, "status", 200)
            if status >= 400:
                raise RuntimeError(f"Brevo API returned HTTP {status}")
    except HTTPError as e:
        detail = e.read().decode("utf-8", errors="ignore")[:500]
        raise RuntimeError(f"Brevo API HTTPError {e.code}: {detail}") from e
    except URLError as e:
        raise RuntimeError(f"Brevo API network error: {e.reason}") from e


def send_email(to_email: str, subject: str, body_text: str) -> None:
    provider = _provider_name()
    if provider == "smtp":
        _send_email_smtp(to_email, subject, body_text)
        return
    if provider == "brevo":
        _send_email_brevo(to_email, subject, body_text)
        return
    raise RuntimeError(f"EMAIL_PROVIDER '{provider}' is not supported")
