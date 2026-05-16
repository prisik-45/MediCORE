import traceback

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from backend.app.db import get_db
from backend.app.services.email_ingestion import EmailIngestionService
from backend.app.tasks import poll_inbox

router = APIRouter()


@router.get("/imap-preview")
def imap_preview(db: Session = Depends(get_db)) -> dict:
    return EmailIngestionService(db).preview_imap_inbox()


@router.post("/poll-now")
def poll_now() -> dict[str, str]:
    task = poll_inbox.delay()
    return {"status": "queued", "task_id": task.id}


@router.post("/poll-now-sync")
def poll_now_sync(db: Session = Depends(get_db)) -> dict[str, int]:
    processed = EmailIngestionService(db).poll_imap_inbox()
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