"""Persist bounded uploads in MongoDB so they survive container replacement.

Every upload is limited to 5 MiB, below MongoDB's 16 MiB document limit.
Public media and private order documents use separate key prefixes. Callers
must authorize private downloads before reading this collection.
"""
from datetime import datetime, timezone

from bson.binary import Binary
from pymongo.errors import DuplicateKeyError

MAX_UPLOAD_BYTES = 5 * 1024 * 1024


async def save_upload(db, key: str, content: bytes, *, session=None):
    if not content or len(content) > MAX_UPLOAD_BYTES:
        raise ValueError("Upload must contain between 1 byte and 5 MiB")
    try:
        await db.uploads.insert_one({
            "_id": key, "content": Binary(content), "size": len(content),
            "createdAt": datetime.now(timezone.utc),
        }, session=session)
    except DuplicateKeyError:
        # Public image keys are SHA-256 hashes, so re-uploading is idempotent.
        if not key.startswith("media/"):
            raise


async def read_upload(db, key: str) -> bytes | None:
    record = await db.uploads.find_one({"_id": key})
    return bytes(record["content"]) if record else None
