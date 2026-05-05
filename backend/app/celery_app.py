from celery import Celery

from backend.app.config import get_settings

settings = get_settings()

celery_app = Celery(
    "supplier_intelligence",
    broker=settings.redis_url,
    backend=settings.redis_url,
)

celery_app.conf.update(
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    timezone="UTC",
    beat_schedule={
        "poll-inbox-every-3-minutes": {
            "task": "backend.app.tasks.poll_inbox",
            "schedule": 180.0,
        }
    },
)
