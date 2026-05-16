import logging

from backend.app.celery_app import celery_app
from backend.app.db import SessionLocal
from backend.app.services.email_ingestion import EmailIngestionService

logger = logging.getLogger(__name__)


@celery_app.task(name="backend.app.tasks.poll_inbox")
def poll_inbox() -> dict:
    logger.info("Starting IMAP inbox poll task")
    with SessionLocal() as db:
        service = EmailIngestionService(db)
        processed = service.poll_imap_inbox()
    logger.info("Finished IMAP inbox poll task; processed=%s", processed)
    return {"processed": processed}


@celery_app.task(name="backend.app.tasks.process_gmail_notification")
def process_gmail_notification(payload: dict) -> dict:
    with SessionLocal() as db:
        service = EmailIngestionService(db)
        processed = service.process_gmail_push_payload(payload)
    return {"processed": processed}
