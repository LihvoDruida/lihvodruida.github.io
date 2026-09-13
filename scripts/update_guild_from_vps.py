from __future__ import annotations

import os
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import requests
import yaml

API_URL = os.getenv("GUILD_LIVE_API_URL", "https://guild.lihvodruida.pp.ua/api/site/guild").strip()
OUTPUT = Path("_data/guild.yml")
TIMEOUT = int(os.getenv("REQUEST_TIMEOUT", "25"))


def clean_payload(payload: Any) -> dict[str, Any]:
    if not isinstance(payload, dict):
        raise ValueError("VPS guild endpoint returned a non-object payload")
    if payload.get("schema") != "mistblossom.public-guild.v1":
        raise ValueError(f"Unexpected guild schema: {payload.get('schema')!r}")

    members = payload.get("members")
    guild = payload.get("guild")
    metadata = payload.get("metadata")
    if not isinstance(members, list) or not isinstance(guild, dict) or not isinstance(metadata, dict):
        raise ValueError("VPS guild payload is missing metadata/guild/members")

    # Keep the Jekyll data contract intentionally small and public. The VPS
    # endpoint is already sanitized; do not introduce private dashboard fields.
    result = {
        "metadata": {
            **metadata,
            "updated_at": metadata.get("updated_at") or payload.get("generated_at") or datetime.now(timezone.utc).isoformat(),
            "source": "mistblossom-vps",
            "region": metadata.get("region") or "eu",
        },
        "guild": guild,
        "raid_progression": payload.get("raid_progression") or {},
        "raid_rankings": payload.get("raid_rankings") or {},
        "members": members,
        # Stored as fallback data. guild-live.js replaces this with the current
        # server response whenever the API is reachable.
        "scheduled_raids": payload.get("scheduled_raids") or [],
    }
    return result


def main() -> int:
    if not API_URL.startswith("https://"):
        print("ERROR: GUILD_LIVE_API_URL must use HTTPS", file=sys.stderr)
        return 2

    try:
        response = requests.get(
            API_URL,
            timeout=TIMEOUT,
            headers={"Accept": "application/json", "User-Agent": "lihvodruida-index2-guild-sync/1.0"},
        )
        response.raise_for_status()
        payload = clean_payload(response.json())
    except Exception as exc:
        print(f"ERROR: failed to fetch guild snapshot from VPS: {exc}", file=sys.stderr)
        return 1

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    tmp = OUTPUT.with_suffix(".yml.tmp")
    tmp.write_text(
        yaml.safe_dump(payload, allow_unicode=True, sort_keys=False, width=120),
        encoding="utf-8",
    )
    tmp.replace(OUTPUT)
    print(f"OK: wrote {len(payload['members'])} guild members from {API_URL} to {OUTPUT}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
