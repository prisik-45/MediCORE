import smtplib
import logging
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from backend.app.config import get_settings

settings = get_settings()
logger = logging.getLogger(__name__)


def send_smtp_email(to_email: str, subject: str, html_content: str):
    """Sends a transactional email via SMTP (e.g. Gmail SMTP)."""
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
