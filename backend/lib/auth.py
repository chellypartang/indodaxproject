"""Auth primitives: PBKDF2 password hashing, JWT session cookies, FastAPI dependencies.

Sessions are httpOnly cookies (never tokens in JSON). All auth routes live under /api/auth/*.
"""

import hashlib
import hmac
import os
import secrets
from datetime import datetime, timedelta, timezone

import jwt
from fastapi import Depends, HTTPException, Request, Response

from lib.db import db

COOKIE_NAME = "icl_session"
_ALGO = "HS256"
_TOKEN_TTL_DAYS = 7


def _secret() -> str:
    return os.environ.get("SESSION_SECRET", "dev-secret-change-me")


# --- passwords (PBKDF2-SHA256, stdlib only) ---


def hash_password(password: str) -> str:
    salt = secrets.token_hex(16)
    iterations = 200_000
    dk = hashlib.pbkdf2_hmac("sha256", password.encode(), salt.encode(), iterations)
    return f"pbkdf2_sha256${iterations}${salt}${dk.hex()}"


def verify_password(password: str, stored: str | None) -> bool:
    if not stored:
        return False
    try:
        scheme, iterations, salt, hexhash = stored.split("$")
        if scheme != "pbkdf2_sha256":
            return False
        dk = hashlib.pbkdf2_hmac("sha256", password.encode(), salt.encode(), int(iterations))
        return hmac.compare_digest(dk.hex(), hexhash)
    except Exception:
        return False


# --- JWT session tokens ---


def create_token(user_id: str) -> str:
    payload = {"sub": user_id, "exp": datetime.now(timezone.utc) + timedelta(days=_TOKEN_TTL_DAYS)}
    return jwt.encode(payload, _secret(), algorithm=_ALGO)


def set_session_cookie(response: Response, token: str) -> None:
    response.set_cookie(
        COOKIE_NAME,
        token,
        httponly=True,
        samesite="lax",
        max_age=_TOKEN_TTL_DAYS * 24 * 3600,
        path="/",
    )


def clear_session_cookie(response: Response) -> None:
    response.delete_cookie(COOKIE_NAME, path="/")


# --- dependencies ---


async def get_current_user(request: Request) -> dict:
    token = request.cookies.get(COOKIE_NAME)
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        payload = jwt.decode(token, _secret(), algorithms=[_ALGO])
    except jwt.PyJWTError:
        raise HTTPException(status_code=401, detail="Sesi tidak valid atau sudah kedaluwarsa")
    user = await db.users.find_one({"id": payload.get("sub")})
    if not user:
        raise HTTPException(status_code=401, detail="Akun tidak ditemukan")
    return user


def require_admin(user: dict = Depends(get_current_user)) -> dict:
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Akses khusus admin")
    return user


def generate_initial_password() -> str:
    """Readable-but-random initial password for invited users (admin shares it once)."""
    return secrets.token_urlsafe(9)
