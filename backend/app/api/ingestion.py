from fastapi import APIRouter

from backend.app.tasks import poll_inbox

router = APIRouter()


@router.post("/poll-now")
def poll_now() -> dict[str, str]:
    task = poll_inbox.delay()
    return {"status": "queued", "task_id": task.id}
