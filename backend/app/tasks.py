from backend.app.celery_app import celery_app
from backend.app.db import SessionLocal
from backend.app.services.email_ingestion import EmailIngestionService


@celery_app.task(name="backend.app.tasks.poll_inbox")
def poll_inbox() -> dict:
    with SessionLocal() as db:
        service = EmailIngestionService(db)
        processed = service.poll_imap_inbox()
    return {"processed": processed}


@celery_app.task(name="backend.app.tasks.process_gmail_notification")
def process_gmail_notification(payload: dict) -> dict:
    with SessionLocal() as db:
        service = EmailIngestionService(db)
        processed = service.process_gmail_push_payload(payload)
    return {"processed": processed}
