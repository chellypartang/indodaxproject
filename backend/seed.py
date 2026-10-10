"""Idempotent seed: admin account, default hybrid weights, sync-status doc.

Run manually:  cd /app/backend && python seed.py
(The app also self-seeds these on startup; this script exists for reset workflows.)
"""

import asyncio
import os
import uuid

from lib.auth import hash_password
from lib.db import db, ensure_indexes


async def main() -> None:
    await ensure_indexes()

    email = os.environ.get("ADMIN_EMAIL", "chellypartang@gmail.com").lower().strip()
    if not await db.users.find_one({"email": email}):
        await db.users.insert_one({
            "id": str(uuid.uuid4()),
            "email": email,
            "name": "Administrator",
            "role": "admin",
            "password_hash": hash_password(os.environ.get("ADMIN_PASSWORD", "Chelpar031")),
            "created_at": None,
            "last_login_at": None,
        })
        print(f"admin created: {email}")
    else:
        print(f"admin already present: {email}")

    for kind, (t, f) in {"daily": (70, 30), "weekly": (50, 50)}.items():
        await db.settings.update_one(
            {"key": f"weights_{kind}"},
            {"$setOnInsert": {"key": f"weights_{kind}", "technical": t, "fundamental": f}},
            upsert=True,
        )

    await db.sync_status.update_one(
        {"_id": "sync"}, {"$setOnInsert": {"last_ticker_ok": True}}, upsert=True
    )
    print("seed done")


if __name__ == "__main__":
    asyncio.run(main())
