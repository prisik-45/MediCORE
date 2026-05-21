import logging
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from backend.app.api import catalogs, chat, health, ingestion, suppliers, webhooks
from backend.app.config import get_settings


settings = get_settings()

allowed_origins = {
    settings.frontend_origin,
    "https://medi-core-silk.vercel.app",
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://localhost:3001",
    "http://127.0.0.1:3001",
    "http://192.168.29.44:3000",
    "http://192.168.29.215:3000",
}

app = FastAPI(title=settings.app_name, version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=sorted(allowed_origins),
    allow_origin_regex=r"^https?://(localhost|127\.0\.0\.1|192\.168\.\d{1,3}\.\d{1,3}|medi-core-silk\.vercel\.app)(:\d+)?$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configure logging for capturing errors in production logs
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.error("Unhandled exception occurred during request handling", exc_info=exc)
    return JSONResponse(
        status_code=500,
        content={
            "detail": "Internal Server Error",
            "message": str(exc),
            "type": exc.__class__.__name__
        }
    )

app.include_router(health.router)
app.include_router(suppliers.router, prefix="/api/suppliers", tags=["suppliers"])
app.include_router(catalogs.router, prefix="/api/catalogs", tags=["catalogs"])
app.include_router(ingestion.router, prefix="/api/ingestion", tags=["ingestion"])
app.include_router(chat.router)
app.include_router(webhooks.router, prefix="/webhooks", tags=["webhooks"])

