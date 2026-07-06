import logging
from fastapi import APIRouter, Depends, WebSocket, WebSocketDisconnect
from redis import Redis
from sqlalchemy.orm import Session

from backend.app.config import get_settings
from backend.app.db import get_db
from backend.app.services.nl_query import NaturalLanguageQueryEngine

router = APIRouter()
logger = logging.getLogger(__name__)


@router.websocket("/ws/chat")
async def chat_socket(websocket: WebSocket, db: Session = Depends(get_db)) -> None:
    await websocket.accept()
    
    # Extract and verify token query parameter for secure tenant-isolation
    token = websocket.query_params.get("token")
    if token:
        token = token.strip('"\'')
    
    tenant_id = None
    if token and len(token.split('.')) == 3:
        try:
            from uuid import UUID
            from backend.app.db import get_supabase
            from backend.app.models import Profile
            supabase_client = get_supabase()
            response = supabase_client.auth.get_user(token)
            if response and response.user:
                user_uuid = UUID(response.user.id)
                # Load profile to fetch shared tenant_id
                profile = db.query(Profile).filter(Profile.id == user_uuid).first()
                if profile and profile.tenant_id:
                    tenant_id = profile.tenant_id
                else:
                    tenant_id = user_uuid
        except Exception as e:
            logger.exception("WebSocket authentication failed with exception")
            await websocket.send_json({"type": "error", "message": f"Authentication failed. Connection closed. Details: {str(e)}"})
            await websocket.close()
            return

    settings = get_settings()
    cache = Redis.from_url(settings.redis_url, decode_responses=True)
    engine = NaturalLanguageQueryEngine(db=db, cache=cache)

    try:
        while True:
            message = await websocket.receive_text()
            try:
                result = engine.answer(message, tenant_id=tenant_id)
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
