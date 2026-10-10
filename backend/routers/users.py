"""Admin-only user management: list, invite (create with initial password), delete, reset password."""

import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException

from lib.auth import generate_initial_password, hash_password, require_admin
from lib.db import db
from models.schemas import PasswordResetOut, UserCreateIn, UserCreatedOut, UserOut
from routers.auth import user_out

router = APIRouter(prefix="/users", tags=["users"], dependencies=[Depends(require_admin)])


@router.get("", response_model=list[UserOut])
async def list_users():
    docs = await db.users.find({}, {"password_hash": 0}).sort("created_at", 1).to_list(500)
    return [user_out(d) for d in docs]


@router.post("", response_model=UserCreatedOut, status_code=201)
async def invite_user(body: UserCreateIn):
    email = body.email.lower().strip()
    if await db.users.find_one({"email": email}):
        raise HTTPException(status_code=409, detail="Email sudah terdaftar")
    initial = generate_initial_password()
    doc = {
        "id": str(uuid.uuid4()),
        "email": email,
        "name": body.name.strip(),
        "role": body.role,
        "password_hash": hash_password(initial),
        "created_at": datetime.now(timezone.utc),
        "last_login_at": None,
    }
    await db.users.insert_one(doc)
    return UserCreatedOut(user=user_out(doc), initial_password=initial)


@router.patch("/{user_id}/password", response_model=PasswordResetOut)
async def reset_password(user_id: str):
    doc = await db.users.find_one({"id": user_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Pengguna tidak ditemukan")
    new_password = generate_initial_password()
    await db.users.update_one(
        {"id": user_id},
        {"$set": {"password_hash": hash_password(new_password)}},
    )
    return PasswordResetOut(user=user_out(doc), new_password=new_password)


@router.delete("/{user_id}")
async def delete_user(user_id: str, admin: dict = Depends(require_admin)):
    doc = await db.users.find_one({"id": user_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Pengguna tidak ditemukan")
    if doc["id"] == admin.get("id"):
        raise HTTPException(status_code=400, detail="Tidak dapat menghapus akun sendiri")
    if doc.get("role") == "admin":
        admin_count = await db.users.count_documents({"role": "admin"})
        if admin_count <= 1:
            raise HTTPException(status_code=400, detail="Harus tersisa minimal satu admin")
    await db.users.delete_one({"id": user_id})
    return {"ok": True}
