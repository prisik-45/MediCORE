import logging

from backend.app.celery_app import celery_app
from backend.app.db import SessionLocal
from backend.app.services.email_ingestion import EmailIngestionService

logger = logging.getLogger(__name__)


@celery_app.task(name="backend.app.tasks.poll_inbox")
def poll_inbox() -> dict:
    from datetime import datetime, UTC
    from backend.app.models import EmailAccount, EmailSyncSetting
    logger.info("Starting batch scheduled IMAP inbox poll task")
    processed_total = 0
    with SessionLocal() as db:
        service = EmailIngestionService(db)
        accounts = db.query(EmailAccount).all()
        for account in accounts:
            sync_setting = db.query(EmailSyncSetting).filter(EmailSyncSetting.user_id == account.user_id).first()
            interval = sync_setting.poll_interval_minutes if sync_setting else 15
            
            should_sync = False
            if account.last_synced_at is None:
                should_sync = True
            else:
                diff_seconds = (datetime.now(UTC) - account.last_synced_at).total_seconds()
                if diff_seconds >= (interval * 60):
                    should_sync = True
            
            if should_sync:
                logger.info("Account %s is due for sync (interval=%s min)", account.email_address, interval)
                processed_total += service.poll_account_inbox(account.id)
                
    logger.info("Finished batch IMAP inbox poll task; processed total=%s", processed_total)
    return {"processed": processed_total}


@celery_app.task(name="backend.app.tasks.poll_email_account")
def poll_email_account(account_id: str) -> dict:
    from uuid import UUID
    logger.info("Starting IMAP poll task for account_id=%s", account_id)
    with SessionLocal() as db:
        service = EmailIngestionService(db)
        processed = service.poll_account_inbox(UUID(account_id))
    logger.info("Finished IMAP poll task for account_id=%s; processed=%s", account_id, processed)
    return {"processed": processed}


@celery_app.task(name="backend.app.tasks.process_gmail_notification")
def process_gmail_notification(payload: dict) -> dict:
    with SessionLocal() as db:
        service = EmailIngestionService(db)
        processed = service.process_gmail_push_payload(payload)
    return {"processed": processed}

