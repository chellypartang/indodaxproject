"""Settings routes — admin-configurable hybrid weights + sync status meta."""

from fastapi import APIRouter, Depends

from lib.auth import require_admin
from lib.db import db
from models.schemas import WeightsAllOut, WeightsOut, WeightsUpdateIn

router = APIRouter(prefix="/settings", tags=["settings"])


@router.get("/weights", response_model=WeightsAllOut)
async def get_weights():
    out = {}
    for kind in ("daily", "weekly"):
        doc = await db.settings.find_one({"key": f"weights_{kind}"})
        if doc:
            out[kind] = WeightsOut(
                key=doc["key"], technical=doc["technical"], fundamental=doc["fundamental"],
                updated_at=doc.get("updated_at"),
            )
        else:
            defaults = {"daily": (70, 30), "weekly": (50, 50)}[kind]
            out[kind] = WeightsOut(key=f"weights_{kind}", technical=defaults[0], fundamental=defaults[1])
    return WeightsAllOut(daily=out["daily"], weekly=out["weekly"])


@router.put("/weights/{kind}", response_model=WeightsOut)
async def update_weights(kind: str, body: WeightsUpdateIn, _admin: dict = Depends(require_admin)):
    if kind not in ("daily", "weekly"):
        from fastapi import HTTPException

        raise HTTPException(status_code=422, detail="kind harus 'daily' atau 'weekly'")
    from datetime import datetime, timezone

    now = datetime.now(timezone.utc)
    await db.settings.update_one(
        {"key": f"weights_{kind}"},
        {"$set": {"technical": body.technical, "fundamental": body.fundamental, "updated_at": now}},
        upsert=True,
    )
    return WeightsOut(key=f"weights_{kind}", technical=body.technical, fundamental=body.fundamental, updated_at=now)
