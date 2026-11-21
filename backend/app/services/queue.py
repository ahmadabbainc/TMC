import json
from functools import lru_cache

from redis.asyncio import Redis

from app.core.config import get_settings


@lru_cache
def get_redis() -> Redis:
    settings = get_settings()
    if not settings.redis_url:
        raise RuntimeError("Redis is not configured.")
    return Redis.from_url(settings.redis_url, decode_responses=True)


async def enqueue_job(job: dict[str, object]) -> None:
    redis = get_redis()
    job_id = str(job["id"])
    await redis.hset(f"tmc:job:{job_id}", mapping={
        "status": "queued",
        "progress": "0",
        "message": "Waiting for a worker.",
        "payload": json.dumps(job),
    })
    await redis.lpush("tmc:queue:video-jobs", job_id)


async def get_job(job_id: str) -> dict[str, str] | None:
    redis = get_redis()
    result = await redis.hgetall(f"tmc:job:{job_id}")
    return result or None
