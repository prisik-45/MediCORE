import smtplib
import logging
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
import httpx
from backend.app.config import get_settings

settings = get_settings()
logger = logging.getLogger(__name__)


def _send_resend_email(to_email: str, subject: str, html_content: str) -> bool:
    from_email = settings.resend_from or settings.smtp_sender
    if not settings.resend_api_key or not from_email:
        logger.warning(
            "Resend credentials not configured. Email to %s with subject '%s' skipped.",
            to_email,
            subject,
        )
        return False

    try:
        response = httpx.post(
            "https://api.resend.com/emails",
            headers={
                "Authorization": f"Bearer {settings.resend_api_key}",
                "Content-Type": "application/json",
            },
            json={
                "from": from_email,
                "to": [to_email],
                "subject": subject,
                "html": html_content,
            },
            timeout=15,
        )
        response.raise_for_status()
        logger.info("Successfully sent email to %s via Resend", to_email)
        return True
    except httpx.HTTPStatusError as e:
        logger.error(
            "Resend failed to send email to %s: status=%s body=%s",
            to_email,
            e.response.status_code,
            e.response.text[:500],
        )
        return False
    except Exception as e:
        logger.error("Resend failed to send email to %s: %s", to_email, e)
        return False


def send_smtp_email(to_email: str, subject: str, html_content: str):
    """Sends a transactional email via Resend HTTPS API or SMTP."""
    if settings.resend_api_key:
        return _send_resend_email(to_email, subject, html_content)

    if not settings.smtp_username or not settings.smtp_password:
        logger.warning(
            "SMTP credentials not configured. Email to %s with subject '%s' skipped.",
            to_email, subject
        )
        return False
        
    try:
        msg = MIMEMultipart("alternative")
        msg["Subject"] = subject
        msg["From"] = settings.smtp_sender
        msg["To"] = to_email
        
        msg.attach(MIMEText(html_content, "html"))
        
        logger.info("Connecting to SMTP server %s:%s", settings.smtp_host, settings.smtp_port)
        with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=10) as server:
            server.starttls()
            server.login(settings.smtp_username, settings.smtp_password)
            server.sendmail(settings.smtp_sender, to_email, msg.as_string())
            logger.info("Successfully sent email to %s", to_email)
            return True
    except Exception as e:
        logger.error("Failed to send SMTP email to %s: %s", to_email, e)
        return False
