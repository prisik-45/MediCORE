from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from backend.app.db import get_db
from backend.app.services.email_ingestion import EmailIngestionService
from backend.app.tasks import poll_inbox
from backend.app.auth import get_current_user

router = APIRouter()


class ImapCredentials(BaseModel):
    email: str
    app_password: str = Field(min_length=1)
    mailbox: str = "INBOX"


@router.get("/imap-preview")
def imap_preview(db: Session = Depends(get_db)) -> dict:
    return EmailIngestionService(db).preview_imap_inbox()


@router.post("/imap-preview-with-credentials")
def imap_preview_with_credentials(payload: ImapCredentials, db: Session = Depends(get_db)) -> dict:
    return EmailIngestionService(db).preview_imap_inbox(
        imap_username=payload.email,
        imap_password=payload.app_password,
        imap_mailbox=payload.mailbox,
    )


@router.post("/poll-now")
def poll_now() -> dict[str, str]:
    task = poll_inbox.delay()
    return {"status": "queued", "task_id": task.id}


@router.post("/poll-now-sync")
def poll_now_sync(db: Session = Depends(get_db)) -> dict[str, int]:
    processed = EmailIngestionService(db).poll_imap_inbox()
    return {"processed": processed}


@router.post("/poll-now-sync-user")
def poll_now_sync_user(
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
) -> dict[str, int]:
    from uuid import UUID
    from backend.app.models import EmailAccount
    user_uuid = UUID(current_user["id"])
    accounts = db.query(EmailAccount).filter(EmailAccount.user_id == user_uuid).all()
    
    total_processed = 0
    service = EmailIngestionService(db)
    for account in accounts:
        try:
            total_processed += service.poll_account_inbox(account.id)
        except Exception:
            pass
            
    return {"processed": total_processed}


@router.post("/poll-now-sync-with-credentials")
def poll_now_sync_with_credentials(payload: ImapCredentials, db: Session = Depends(get_db)) -> dict[str, int]:
    processed = EmailIngestionService(db).poll_imap_inbox(
        imap_username=payload.email,
        imap_password=payload.app_password,
        imap_mailbox=payload.mailbox,
    )
    return {"processed": processed}


@router.post("/reprocess-empty")
def reprocess_empty(
    db: Session = Depends(get_db),
    force: bool = Query(False),
) -> dict:
    try:
        processed = EmailIngestionService(db).reprocess_empty_catalog_emails(force=force)
        return {"processed": processed, "error": None}
    except Exception as exc:
        db.rollback()
        return {"processed": 0, "error": str(exc)}
