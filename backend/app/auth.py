import base64
import hashlib
import logging
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from supabase import Client
from cryptography.fernet import Fernet

from backend.app.config import get_settings
from backend.app.db import get_supabase

settings = get_settings()
security = HTTPBearer()
logger = logging.getLogger(__name__)

def get_fernet() -> Fernet:
    """Derive a 32-byte base64 key securely from SUPABASE_SERVICE_ROLE_KEY."""
    key_material = settings.supabase_service_role_key.encode("utf-8")
    hashed = hashlib.sha256(key_material).digest()
    fernet_key = base64.urlsafe_b64encode(hashed)
    return Fernet(fernet_key)

def encrypt_password(password: str) -> str:
    """Symmetrically encrypt an email/IMAP password."""
    f = get_fernet()
    return f.encrypt(password.encode("utf-8")).decode("utf-8")

def decrypt_password(encrypted_password: str) -> str:
    """Symmetrically decrypt an email/IMAP password."""
    f = get_fernet()
    return f.decrypt(encrypted_password.encode("utf-8")).decode("utf-8")

def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)) -> dict:
    """FastAPI dependency to extract and validate the Supabase bearer JWT."""
    token = credentials.credentials
    supabase: Client = get_supabase()
    try:
        response = supabase.auth.get_user(token)
        if not response or not response.user:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid or expired session token",
            )
        return {
            "id": response.user.id,
            "email": response.user.email,
            "role": response.user.role,
        }
    except Exception as e:
        logger.error(f"Token verification failed: {e}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication failed. Invalid token.",
        )
