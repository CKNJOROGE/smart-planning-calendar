import smtplib
import ssl
from email.message import EmailMessage

from .config import settings

def smtp_configuration_errors() -> list[str]:
    errors: list[str] = []
    if not settings.SMTP_HOST:
        errors.append("SMTP_HOST is empty")
    if not settings.SMTP_FROM_EMAIL:
        errors.append("SMTP_FROM_EMAIL is empty")
    if not settings.FRONTEND_BASE_URL:
        errors.append("FRONTEND_BASE_URL is empty")
    if settings.SMTP_USE_SSL and settings.SMTP_USE_TLS:
        errors.append("SMTP_USE_SSL and SMTP_USE_TLS cannot both be true")
    if settings.SMTP_USERNAME and not settings.SMTP_PASSWORD:
        errors.append("SMTP_PASSWORD is empty while SMTP_USERNAME is set")
    return errors


def smtp_ready() -> bool:
    return len(smtp_configuration_errors()) == 0


def send_email(to_email: str, subject: str, body_text: str) -> None:
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
