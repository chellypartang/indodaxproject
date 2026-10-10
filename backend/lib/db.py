"""Shared Mongo handle — import `client`/`db` from here (server.py, routers, seed.py)."""

import logging
import os
from pathlib import Path

from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient
from pymongo import ASCENDING, DESCENDING, IndexModel

load_dotenv(Path(__file__).parent.parent / ".env")

mongo_url = os.environ["MONGO_URL"]
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ["DB_NAME"]]

logger = logging.getLogger(__name__)

# One entry per collection: every field a route filters, sorts, or dedupes on. Applied by ensure_indexes() at startup.
INDEXES: dict[str, list[IndexModel]] = {
    "status_checks": [IndexModel([("timestamp", DESCENDING)], name="timestamp_desc")],
    "users": [
        IndexModel([("id", ASCENDING)], name="id_unique", unique=True),
        IndexModel([("email", ASCENDING)], name="email_unique", unique=True),
    ],
    "snapshots": [
        # one locked snapshot per analysis kind per period — the snapshot lock itself
        IndexModel(
            [("kind", ASCENDING), ("period_start", ASCENDING)],
            name="kind_period_unique",
            unique=True,
        ),
        IndexModel(
            [("kind", ASCENDING), ("period_end", DESCENDING)], name="kind_period_end_desc"
        ),
        IndexModel(
            [("actuals_recorded", ASCENDING), ("period_end", ASCENDING)],
            name="pending_actuals",
        ),
    ],
    "settings": [
        IndexModel([("key", ASCENDING)], name="key_unique", unique=True),
    ],
    "price_history": [
        IndexModel([("ts", DESCENDING)], name="ts_desc"),
        # rolling 45-day market history; older samples expire server-side
        IndexModel(
            [("ts", ASCENDING)], name="ts_ttl", expireAfterSeconds=45 * 24 * 3600
        ),
    ],
}


async def ensure_indexes() -> None:
    for collection, models in INDEXES.items():
        for model in models:  # one at a time so a bad spec skips only itself
            try:
                await db[collection].create_indexes([model])
            except Exception as exc:  # never block boot on an index; the log line names what to fix
                logger.error("ensure_indexes(%s.%s): %s", collection, model.document["name"], exc)
