"""Auth routes — /api/auth/login, /api/auth/logout, /api/auth/me."""

from fastapi import APIRouter, Depends, Response
from datetime import datetime, timezone

from lib.auth import (
    clear_session_cookie,
    create_token,
    get_current_user,
    set_session_cookie,
    verify_password,
)
from lib.db import db
from models.schemas import LoginIn, UserOut

router = APIRouter(prefix="/auth", tags=["auth"])


def user_out(doc: dict) -> UserOut:
    data = {k: v for k, v in doc.items() if k in UserOut.model_fields}
    # motor returns naive UTC datetimes — stamp the offset before serialising
    for key in ("created_at", "last_login_at"):
        if data.get(key) is not None:
            data[key] = data[key].replace(tzinfo=timezone.utc)
    return UserOut(**data)


@router.post("/login", response_model=UserOut)
async def login(body: LoginIn, response: Response):
    user = await db.users.find_one({"email": body.email.lower().strip()})
    if not user or not verify_password(body.password, user.get("password_hash")):
        from fastapi import HTTPException

        raise HTTPException(status_code=401, detail="Email atau password salah")
    set_session_cookie(response, create_token(user["id"]))
    await db.users.update_one(
        {"id": user["id"]}, {"$set": {"last_login_at": datetime.now(timezone.utc)}}
    )
    return user_out(user)


@router.post("/logout")
async def logout(response: Response):
    clear_session_cookie(response)
    return {"ok": True}


@router.get("/me", response_model=UserOut)
async def me(user: dict = Depends(get_current_user)):
    return user_out(user)
