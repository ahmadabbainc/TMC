import json
import os
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone


BASE = os.environ["SUPABASE_URL"].rstrip("/")
KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
BUCKET = os.environ.get("SUPABASE_BUCKET", "tmc-videos")


def request_json(method: str, path: str, payload: dict | None = None):
    body = json.dumps(payload).encode("utf-8") if payload is not None else None
    req = urllib.request.Request(
        f"{BASE}{path}",
        data=body,
        headers={
            "apikey": KEY,
            "Authorization": f"Bearer {KEY}",
            "Content-Type": "application/json",
        },
        method=method,
    )
    with urllib.request.urlopen(req, timeout=60) as response:
        raw = response.read()
        return json.loads(raw) if raw else None


def main() -> None:
    cutoff = datetime.now(timezone.utc) - timedelta(hours=72)
    files = request_json("POST", f"/storage/v1/object/list/{BUCKET}", {
        "prefix": "",
        "limit": 1000,
        "offset": 0,
        "sortBy": {"column": "created_at", "order": "asc"},
    }) or []
    expired = []
    for item in files:
        key = item.get("name", "")
        if not (key.startswith("uploads/") or key.startswith("outputs/")):
            continue
        created = item.get("created_at") or item.get("updated_at")
        if not created:
            continue
        timestamp = datetime.fromisoformat(created.replace("Z", "+00:00"))
        if timestamp < cutoff:
            expired.append(key)
    if expired:
        request_json("DELETE", f"/storage/v1/object/{BUCKET}", {"prefixes": expired})
    jobs_cutoff = urllib.parse.quote((datetime.now(timezone.utc) - timedelta(days=7)).isoformat(), safe=":")
    req = urllib.request.Request(
        f"{BASE}/rest/v1/tmc_jobs?created_at=lt.{jobs_cutoff}",
        headers={
            "apikey": KEY,
            "Authorization": f"Bearer {KEY}",
            "Prefer": "return=minimal",
        },
        method="DELETE",
    )
    with urllib.request.urlopen(req, timeout=60):
        pass
    print(f"Removed {len(expired)} expired video objects and job records older than 7 days.")


if __name__ == "__main__":
    main()
