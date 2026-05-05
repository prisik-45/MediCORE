from fastapi import APIRouter, Depends, WebSocket, WebSocketDisconnect
from redis import Redis
from sqlalchemy.orm import Session

from backend.app.config import get_settings
from backend.app.db import get_db
from backend.app.services.nl_query import NaturalLanguageQueryEngine

router = APIRouter()


@router.websocket("/ws/chat")
async def chat_socket(websocket: WebSocket, db: Session = Depends(get_db)) -> None:
    await websocket.accept()
    settings = get_settings()
    cache = Redis.from_url(settings.redis_url, decode_responses=True)
    engine = NaturalLanguageQueryEngine(db=db, cache=cache)

    try:
        while True:
            message = await websocket.receive_text()
            await websocket.send_json({"type": "status", "message": "Planning query"})
            try:
                result = engine.answer(message)
                await websocket.send_json({"type": "answer", "answer": result.answer, "rows": result.rows})
            except Exception as exc:
                await websocket.send_json(
                    {
                        "type": "error",
                        "message": (
                            "MediCORE could not complete that query. "
                            "Check the backend terminal for the full error. "
                            f"Short error: {exc}"
                        ),
                    }
                )
    except WebSocketDisconnect:
        return
