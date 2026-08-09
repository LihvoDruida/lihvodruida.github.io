from __future__ import annotations

import os
import re
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple
from urllib.parse import quote

import requests
import yaml

# ------------------------------------------------------------
# CONFIGURATION
# ------------------------------------------------------------
BLIZZARD_TOKEN_URL = "https://oauth.battle.net/token"
BLIZZARD_API_BASE = "https://{region}.api.blizzard.com"
RAIDER_IO_GUILD_API_URL = "https://raider.io/api/v1/guilds/profile"
RAIDER_IO_CHARACTER_API_URL = "https://raider.io/api/v1/characters/profile"
RAIDER_IO_STATIC_DATA_URL = "https://raider.io/api/v1/raiding/static-data"

# Public project configuration. These values are not secrets.
WOW_REGION = "eu"
WOW_REALM = "terokkar"
WOW_GUILD_NAME = "Mistblossom Vanguard"
BLIZZARD_LOCALE = "en_US"
OUTPUT_GUILD_FILE = Path("_data/guild.yml")
OUTPUT_PROFESSIONS_FILE = Path("_data/professions.yml")
OUTPUT_RAIDS_FILE = Path("_data/raids.yml")

# Raider.IO нумерує доповнення порядковим номером: Legion 6, BfA 7,
# Shadowlands 8, Dragonflight 9, The War Within 10, Midnight 11.
# Перший id у списку вважається поточним доповненням.
RAID_EXPANSION_IDS = [
    int(value)
    for value in os.getenv("RAID_EXPANSION_IDS", "11,10").split(",")
    if value.strip()
]

EXPANSION_NAMES = {
    6: "Legion",
    7: "Battle for Azeroth",
    8: "Shadowlands",
    9: "Dragonflight",
    10: "The War Within",
    11: "Midnight",
}

# Короткі коди для id сезонів: midnight-1, tww-3 тощо.
EXPANSION_CODES = {
    6: "legion",
    7: "bfa",
    8: "sl",
    9: "df",
    10: "tww",
    11: "midnight",
}

# Raider.IO агрегує стартові рейди тиру в один слаг виду "tier-mn-1",
# де середня частина — скорочення доповнення, а цифра — номер сезону.
TIER_SLUG_RE = re.compile(r"^tier-(.+)-(\d+)$")

TIER_ABBREVIATIONS = {
    "mn": 11,
    "midnight": 11,
    "tww": 10,
    "war-within": 10,
    "df": 9,
    "sl": 8,
    "bfa": 7,
    "legion": 6,
}

# Secrets / tunables.
BLIZZARD_CLIENT_ID = os.getenv("BLIZZARD_CLIENT_ID", "").strip()
BLIZZARD_CLIENT_SECRET = os.getenv("BLIZZARD_CLIENT_SECRET", "").strip()
RAIDERIO_ACCESS_KEY = os.getenv("RAIDERIO_ACCESS_KEY", "").strip()

REQUEST_TIMEOUT = int(os.getenv("REQUEST_TIMEOUT", "20"))
REQUEST_DELAY_SECONDS = float(os.getenv("REQUEST_DELAY_SECONDS", "0.12"))

HEADERS = {"Accept": "application/json"}


@dataclass
class ApiContext:
    session: requests.Session
    blizzard_token: Optional[str] = None


# ------------------------------------------------------------
# HELPERS
# ------------------------------------------------------------
def build_session() -> requests.Session:
    session = requests.Session()
    session.headers.update(HEADERS)
    return session


def ensure_parent_dir(path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)


def slugify(value: str) -> str:
    slug = value.strip().lower()
    replacements = {
        "'": "",
        " ": "-",
        "_": "-",
        ".": "-",
    }
    for old, new in replacements.items():
        slug = slug.replace(old, new)
    while "--" in slug:
        slug = slug.replace("--", "-")
    return slug.strip("-")


def encode_name(value: str) -> str:
    return quote(value.lower(), safe="")


def safe_get(session: requests.Session, url: str, **kwargs: Any) -> Optional[requests.Response]:
    try:
        return session.get(url, timeout=REQUEST_TIMEOUT, **kwargs)
    except requests.RequestException as exc:
        print(f"❌ GET failed for {url}: {exc}")
        return None


def safe_post(url: str, **kwargs: Any) -> Optional[requests.Response]:
    try:
        return requests.post(url, timeout=REQUEST_TIMEOUT, **kwargs)
    except requests.RequestException as exc:
        print(f"❌ POST failed for {url}: {exc}")
        return None


def round_item_level(value: Any) -> int:
    try:
        numeric = float(value)
    except (TypeError, ValueError):
        return 0
    if numeric <= 0:
        return 0
    return int(numeric + 0.5)


# ------------------------------------------------------------
# BLIZZARD API
# ------------------------------------------------------------
def fetch_blizzard_access_token(ctx: ApiContext) -> Optional[str]:
    if ctx.blizzard_token:
        return ctx.blizzard_token

    if not BLIZZARD_CLIENT_ID or not BLIZZARD_CLIENT_SECRET:
        print("❌ Missing BLIZZARD_CLIENT_ID / BLIZZARD_CLIENT_SECRET")
        return None

    response = safe_post(
        BLIZZARD_TOKEN_URL,
        auth=(BLIZZARD_CLIENT_ID, BLIZZARD_CLIENT_SECRET),
        data={"grant_type": "client_credentials"},
        headers={"Accept": "application/json"},
    )
    if not response:
        return None

    if response.status_code != 200:
        print(f"❌ Blizzard OAuth failed: {response.status_code} - {response.text}")
        return None

    payload = response.json()
    token = payload.get("access_token")
    if not token:
        print("❌ Blizzard OAuth response does not contain access_token")
        return None

    ctx.blizzard_token = token
    return token


def blizzard_get(
    ctx: ApiContext,
    path: str,
    namespace: str,
    *,
    region: Optional[str] = None,
    locale: Optional[str] = None,
) -> Optional[Dict[str, Any]]:
    token = fetch_blizzard_access_token(ctx)
    if not token:
        return None

    actual_region = (region or WOW_REGION).strip().lower()
    actual_locale = (locale or BLIZZARD_LOCALE).strip()

    url = BLIZZARD_API_BASE.format(region=actual_region) + path
    response = safe_get(
        ctx.session,
        url,
        params={
            "namespace": namespace,
            "locale": actual_locale,
        },
        headers={
            "Authorization": f"Bearer {token}",
            "Accept": "application/json",
        },
    )
    if not response:
        return None

    if response.status_code != 200:
        print(f"❌ Blizzard API error {response.status_code} for {path}: {response.text}")
        return None

    return response.json()


def fetch_guild_summary(ctx: ApiContext, realm_slug: str, guild_slug: str) -> Optional[Dict[str, Any]]:
    return blizzard_get(
        ctx,
        f"/data/wow/guild/{realm_slug}/{guild_slug}",
        namespace=f"profile-{WOW_REGION}",
    )


def fetch_guild_roster(ctx: ApiContext, realm_slug: str, guild_slug: str) -> Optional[Dict[str, Any]]:
    return blizzard_get(
        ctx,
        f"/data/wow/guild/{realm_slug}/{guild_slug}/roster",
        namespace=f"profile-{WOW_REGION}",
    )


def extract_profession_groups(payload: Dict[str, Any]) -> Dict[str, List[Dict[str, Any]]]:
    result: Dict[str, List[Dict[str, Any]]] = {
        "primaries": [],
        "secondaries": [],
    }

    for group_name in ("primaries", "secondaries"):
        for entry in payload.get(group_name, []) or []:
            profession = entry.get("profession", {}) or {}
            tiers: List[Dict[str, Any]] = []
            for tier_entry in entry.get("tiers", []) or []:
                tier = tier_entry.get("tier", {}) or {}
                tiers.append(
                    {
                        "name": tier.get("name"),
                        "learned_points": tier_entry.get("skill_points", 0),
                        "max_points": tier_entry.get("max_skill_points", 0),
                    }
                )

            result[group_name].append(
                {
                    "name": profession.get("name"),
                    "id": profession.get("id"),
                    "tiers": tiers,
                }
            )

    return result


def fetch_character_professions(
    ctx: ApiContext,
    region: str,
    realm_slug: str,
    character_name: str,
) -> Dict[str, List[Dict[str, Any]]]:
    encoded_name = encode_name(character_name)
    payload = blizzard_get(
        ctx,
        f"/profile/wow/character/{realm_slug}/{encoded_name}/professions",
        namespace=f"profile-{region}",
        region=region,
    )
    if not payload:
        return {"primaries": [], "secondaries": []}
    return extract_profession_groups(payload)


# ------------------------------------------------------------
# RAIDER.IO API
# ------------------------------------------------------------
def fetch_raider_guild(
    region: str,
    realm_slug: str,
    guild_name: str,
    session: requests.Session,
) -> Optional[Dict[str, Any]]:
    params = {
        "region": region,
        "realm": realm_slug,
        "name": guild_name,
        "fields": ",".join([
            "raid_progression:current-expansion:previous-expansion",
            "raid_rankings:current-expansion:previous-expansion",
        ]),
    }
    if RAIDERIO_ACCESS_KEY:
        params["access_key"] = RAIDERIO_ACCESS_KEY

    response = safe_get(session, RAIDER_IO_GUILD_API_URL, params=params)
    if not response:
        return None

    if response.status_code != 200:
        print(f"⚠️ Raider.IO guild miss for {guild_name} ({realm_slug}): {response.status_code}")
        return None

    data = response.json()
    return {
        "profile_url": data.get("profile_url"),
        "last_crawled_at": data.get("last_crawled_at"),
        "raid_progression": data.get("raid_progression") or {},
        "raid_rankings": data.get("raid_rankings") or {},
    }


def fetch_raid_static_data(
    expansion_id: int,
    session: requests.Session,
) -> List[Dict[str, Any]]:
    """Довідник рейдів одного доповнення: слаг, назва, боси, дати відкриття."""
    params: Dict[str, Any] = {"expansion_id": expansion_id}
    if RAIDERIO_ACCESS_KEY:
        params["access_key"] = RAIDERIO_ACCESS_KEY

    response = safe_get(session, RAIDER_IO_STATIC_DATA_URL, params=params)
    if not response:
        return []

    if response.status_code != 200:
        print(f"⚠️ Raider.IO static-data miss for expansion {expansion_id}: {response.status_code}")
        return []

    raids = (response.json() or {}).get("raids") or []
    if not raids:
        print(f"⚠️ Raider.IO returned no raids for expansion_id={expansion_id} — перевір RAID_EXPANSION_IDS")
    return raids


def build_raid_catalog(session: requests.Session) -> Dict[str, Dict[str, Any]]:
    """Зводить рейди всіх налаштованих доповнень у плаский каталог за слагом."""
    catalog: Dict[str, Dict[str, Any]] = {}

    for order, expansion_id in enumerate(RAID_EXPANSION_IDS):
        expansion_name = EXPANSION_NAMES.get(expansion_id, f"Expansion {expansion_id}")
        raids = fetch_raid_static_data(expansion_id, session)
        print(f"📚 {expansion_name} (id={expansion_id}): {len(raids)} raids")

        for raid in raids:
            slug = raid.get("slug")
            if not slug:
                continue

            catalog[slug] = {
                "name": raid.get("name"),
                "short_name": raid.get("short_name"),
                "expansion": expansion_name,
                "expansion_id": expansion_id,
                "is_current_expansion": order == 0,
                "bosses": len(raid.get("encounters") or []),
                "starts_eu": (raid.get("starts") or {}).get("eu"),
                "ends_eu": (raid.get("ends") or {}).get("eu"),
            }

        time.sleep(REQUEST_DELAY_SECONDS)

    return catalog


def clean_raid_progression(progression: Dict[str, Any]) -> Dict[str, Any]:
    """Викидає записи без босів — Raider.IO іноді віддає порожні заглушки."""
    cleaned: Dict[str, Any] = {}
    for slug, stats in (progression or {}).items():
        if not isinstance(stats, dict):
            continue
        if int(stats.get("total_bosses") or 0) <= 0:
            print(f"   ↷ Пропущено рейд без босів: {slug}")
            continue
        cleaned[slug] = stats
    return cleaned


def _season_windows(catalog: Dict[str, Dict[str, Any]], expansion_id: int) -> Dict[str, int]:
    """
    Розбиває рейди доповнення на сезони за датами відкриття.

    Raider.IO дає для кожного рейду starts.eu і ends.eu. ends — це момент,
    коли відкрився наступний тир, тому [starts, ends) і є вікном сезону.
    Рейд, що стартував усередині чужого вікна (ювілейний Blackrock Depths,
    односбосовий Sporefall), приєднується до того сезону, а не створює свій.
    Повертає slug -> номер сезону, рахуючи з 1.
    """
    dated = [
        (slug, meta)
        for slug, meta in catalog.items()
        if meta.get("expansion_id") == expansion_id and meta.get("starts_eu")
    ]
    dated.sort(key=lambda item: item[1]["starts_eu"])

    windows: List[Dict[str, Any]] = []
    for slug, meta in dated:
        start = meta["starts_eu"]
        placed = False
        for window in windows:
            inside_start = start >= window["start"]
            inside_end = window["end"] is None or start < window["end"]
            if inside_start and inside_end:
                window["raids"].append(slug)
                placed = True
                break
        if not placed:
            windows.append({"start": start, "end": meta.get("ends_eu"), "raids": [slug]})

    mapping: Dict[str, int] = {}
    for number, window in enumerate(windows, start=1):
        for slug in window["raids"]:
            mapping[slug] = number
    return mapping


def derive_seasons(
    catalog: Dict[str, Dict[str, Any]],
    progression: Dict[str, Any],
) -> Tuple[List[Dict[str, Any]], Optional[str], List[str]]:
    """
    Сам розкладає рейди з прогресу по доповненнях і сезонах.

    Джерела:
      • агрегати виду tier-mn-1 — доповнення й номер сезону читаються зі слага;
      • звичайні рейди — доповнення з каталогу static-data, сезон із дат.

    Повертає (сезони, id поточного сезону, нерозпізнані слаги).
    """
    windows_cache: Dict[int, Dict[str, int]] = {}
    groups: Dict[Tuple[int, int], Dict[str, Any]] = {}
    unknown: List[str] = []

    for slug in progression:
        expansion_id: Optional[int] = None
        season_number: Optional[int] = None

        match = TIER_SLUG_RE.match(slug)
        if match:
            abbreviation, number = match.group(1), int(match.group(2))
            expansion_id = TIER_ABBREVIATIONS.get(abbreviation)
            season_number = number
            if expansion_id is None:
                print(f"   ？ Невідоме скорочення доповнення у слазі {slug!r} — додай його в TIER_ABBREVIATIONS")

        meta = catalog.get(slug)
        if expansion_id is None and meta:
            expansion_id = meta.get("expansion_id")
            if expansion_id not in windows_cache:
                windows_cache[expansion_id] = _season_windows(catalog, expansion_id)
            season_number = windows_cache[expansion_id].get(slug)

        if expansion_id is None or season_number is None:
            unknown.append(slug)
            continue

        key = (expansion_id, season_number)
        if key not in groups:
            code = EXPANSION_CODES.get(expansion_id, f"exp{expansion_id}")
            name = EXPANSION_NAMES.get(expansion_id, f"Expansion {expansion_id}")
            groups[key] = {
                "id": f"{code}-{season_number}",
                "expansion": name,
                "label": f"{name} · Сезон {season_number}",
                "short": f"{code.upper()} S{season_number}",
                "raids": [],
            }
        groups[key]["raids"].append(slug)

    def raid_sort_key(slug: str) -> Tuple[int, str]:
        # Агрегат тиру завжди перший, далі за датою відкриття.
        if TIER_SLUG_RE.match(slug):
            return (0, "")
        return (1, (catalog.get(slug) or {}).get("starts_eu") or slug)

    for group in groups.values():
        group["raids"].sort(key=raid_sort_key)

    ordered_keys = sorted(groups, key=lambda key: (key[0], key[1]), reverse=True)
    seasons = [groups[key] for key in ordered_keys]

    current_id: Optional[str] = None
    if ordered_keys:
        current_expansion = RAID_EXPANSION_IDS[0] if RAID_EXPANSION_IDS else ordered_keys[0][0]
        for key in ordered_keys:
            if key[0] == current_expansion:
                current_id = groups[key]["id"]
                break
        if current_id is None:
            current_id = groups[ordered_keys[0]]["id"]

    return seasons, current_id, sorted(unknown)


def merge_raids_file(
    catalog: Dict[str, Dict[str, Any]],
    progression: Dict[str, Any],
    timestamp: str,
) -> Optional[Dict[str, Any]]:
    """
    Оновлює _data/raids.yml, не чіпаючи ручну частину.

    Автоматично: catalog, unassigned, metadata і назви для нових слагів.
    Вручну (ніколи не перезаписується): current_season, seasons і вже
    наявні записи в names — там лежать українські підписи.
    """
    existing: Dict[str, Any] = {}
    if OUTPUT_RAIDS_FILE.exists():
        try:
            with OUTPUT_RAIDS_FILE.open("r", encoding="utf-8") as fh:
                existing = yaml.safe_load(fh) or {}
        except (OSError, yaml.YAMLError) as exc:
            print(f"⚠️ Не вдалося прочитати {OUTPUT_RAIDS_FILE}: {exc}")
            return None

    manual_seasons = existing.get("seasons") or []
    names: Dict[str, Any] = dict(existing.get("names") or {})

    derived_seasons, derived_current, unknown = derive_seasons(catalog, progression)
    if derived_seasons:
        labels = ", ".join(season["label"] for season in derived_seasons)
        print(f"🗓️ Визначено сезонів автоматично: {len(derived_seasons)} — {labels}")
        print(f"🗓️ Поточний сезон: {derived_current}")

    # Ручний список має пріоритет; якщо його немає — працює автовизначення.
    seasons = manual_seasons or derived_seasons
    assigned = {slug for season in seasons for slug in (season.get("raids") or [])}

    # Назви для рейдів, яких ще немає в довіднику. Наявні підписи не чіпаємо.
    for slug, meta in catalog.items():
        if slug in names:
            continue
        subtitle_parts = [meta["expansion"]]
        if meta["bosses"]:
            subtitle_parts.append(f"{meta['bosses']} босів")
        names[slug] = {
            "title": meta["name"] or slug.replace("-", " ").title(),
            "subtitle": " · ".join(subtitle_parts),
        }
        print(f"   ＋ Додано назву для нового рейду: {slug}")

    # Слаги з прогресу, які не потрапили в жоден сезон.
    unassigned = sorted(slug for slug in progression if slug not in assigned)
    if unassigned:
        source = "ручному списку seasons" if manual_seasons else "автовизначенні"
        print(f"⚠️ Ці рейди не прив'язані до сезону в {source}:")
        for slug in unassigned:
            hint = catalog.get(slug, {}).get("expansion", "невідоме доповнення")
            print(f"     • {slug} ({hint})")
    if unknown:
        print(f"⚠️ Не вдалося визначити доповнення/сезон для: {', '.join(unknown)}")

    payload: Dict[str, Any] = {
        "metadata": {
            "updated_at": timestamp,
            "source": "Raider.IO Raiding Static Data API",
            "expansion_ids": RAID_EXPANSION_IDS,
        },
        "current_season": existing.get("current_season"),
        "seasons": manual_seasons,
        "derived_current_season": derived_current,
        "derived_seasons": derived_seasons,
        "names": names,
        "catalog": catalog,
        "unassigned": unassigned,
        "undetected": unknown,
    }
    return payload


def fetch_raider_character(
    region: str,
    realm_slug: str,
    name: str,
    session: requests.Session,
) -> Optional[Dict[str, Any]]:
    params = {
        "region": region,
        "realm": realm_slug,
        "name": name,
        "fields": "gear,mythic_plus_scores_by_season:current",
    }
    if RAIDERIO_ACCESS_KEY:
        params["access_key"] = RAIDERIO_ACCESS_KEY

    response = safe_get(session, RAIDER_IO_CHARACTER_API_URL, params=params)
    if not response:
        return None

    if response.status_code != 200:
        print(f"   ⚠️ Raider.IO miss for {name} ({realm_slug}): {response.status_code}")
        return None

    data = response.json()
    segments: Dict[str, Any] = {}
    seasons = data.get("mythic_plus_scores_by_season", []) or []
    if seasons:
        segments = seasons[0].get("segments", {}) or {}

    mythic_plus_scores: Dict[str, Dict[str, Any]] = {}
    for segment_name, segment_data in segments.items():
        mythic_plus_scores[segment_name] = {
            "score": segment_data.get("score", 0),
            "color": segment_data.get("color", "#ffffff"),
        }

    return {
        "profile_url": data.get("profile_url"),
        "thumbnail_url": data.get("thumbnail_url"),
        "class_name": data.get("class"),
        "race_name": data.get("race"),
        "gender": data.get("gender"),
        "faction": data.get("faction"),
        "active_spec_name": data.get("active_spec_name"),
        "active_spec_role": data.get("active_spec_role"),
        "item_level_equipped": round_item_level(data.get("gear", {}).get("item_level_equipped")),
        "mythic_plus_scores": mythic_plus_scores,
    }


# ------------------------------------------------------------
# BUILD OUTPUT
# ------------------------------------------------------------
def build_outputs() -> Tuple[Optional[Dict[str, Any]], Optional[Dict[str, Any]], Optional[Dict[str, Any]]]:
    ctx = ApiContext(session=build_session())
    realm_slug = slugify(WOW_REALM)
    guild_slug = slugify(WOW_GUILD_NAME)

    print(f"🏰 Fetching Blizzard guild summary for {WOW_GUILD_NAME}...")
    guild_summary = fetch_guild_summary(ctx, realm_slug, guild_slug)

    print(f"👥 Fetching Blizzard guild roster for {WOW_GUILD_NAME}...")
    roster = fetch_guild_roster(ctx, realm_slug, guild_slug)
    if not roster:
        return None, None, None

    print(f"🔗 Fetching Raider.IO guild profile URL for {WOW_GUILD_NAME}...")
    raider_guild = fetch_raider_guild(WOW_REGION, realm_slug, WOW_GUILD_NAME, ctx.session)

    print("🐉 Fetching Raider.IO raid static data...")
    raid_catalog = build_raid_catalog(ctx.session)

    raid_progression = clean_raid_progression((raider_guild or {}).get("raid_progression") or {})
    raid_rankings = {
        slug: ranks
        for slug, ranks in ((raider_guild or {}).get("raid_rankings") or {}).items()
        if slug in raid_progression
    }
    print(f"🐉 Raid progression entries kept: {len(raid_progression)}")

    guild_block = roster.get("guild", {}) or {}
    guild_realm = guild_block.get("realm", {}) or {}
    guild_faction = guild_block.get("faction", {}) or {}

    processed_members: List[Dict[str, Any]] = []
    professions_characters: List[Dict[str, Any]] = []
    members = roster.get("members", []) or []

    print(f"👤 Found {len(members)} guild members. Enriching fields from Raider.IO and Blizzard professions...")

    for index, member in enumerate(members, start=1):
        character = member.get("character", {}) or {}
        realm = character.get("realm", {}) or {}
        faction = character.get("faction", {}) or {}

        character_name = character.get("name")
        if not character_name:
            continue

        character_realm_slug = realm.get("slug") or realm_slug
        character_region = WOW_REGION

        print(f"   [{index}/{len(members)}] {character_name}")
        raider = fetch_raider_character(character_region, character_realm_slug, character_name, ctx.session)
        professions = fetch_character_professions(ctx, character_region, character_realm_slug, character_name)

        profile_url = (raider or {}).get("profile_url")

        processed_members.append(
            {
                "rank": member.get("rank"),
                "character": {
                    "name": character_name,
                    "id": character.get("id"),
                    "level": character.get("level"),
                    "realm": {
                        "id": realm.get("id"),
                        "slug": realm.get("slug"),
                    },
                    "playable_class": {
                        "id": (character.get("playable_class") or {}).get("id"),
                        "name": (raider or {}).get("class_name"),
                    },
                    "playable_race": {
                        "id": (character.get("playable_race") or {}).get("id"),
                        "name": (raider or {}).get("race_name"),
                    },
                    "faction": {
                        "type": faction.get("type") or (raider or {}).get("faction"),
                    },
                    "gender": (raider or {}).get("gender"),
                    "active_spec": {
                        "name": (raider or {}).get("active_spec_name"),
                        "role": (raider or {}).get("active_spec_role"),
                    },
                    "avatar": (raider or {}).get("thumbnail_url"),
                    "profile_url": profile_url,
                    "item_level_equipped": (raider or {}).get("item_level_equipped", 0),
                    "mythic_plus_scores": (raider or {}).get("mythic_plus_scores", {}),
                    "sources": {
                        "roster": "blizzard",
                        "enrichment": "raider.io" if raider else None,
                        "professions": "blizzard",
                    },
                },
            }
        )

        professions_characters.append(
            {
                "name": character_name,
                "region": character_region,
                "realm": realm.get("slug") or WOW_REALM,
                "realm_slug": character_realm_slug,
                "profile_url": profile_url,
                "professions": professions,
            }
        )

        time.sleep(REQUEST_DELAY_SECONDS)

    timestamp = time.strftime("%Y-%m-%d %H:%M:%S")

    guild_output = {
        "metadata": {
            "updated_at": timestamp,
            "source": "Blizzard Guild Roster API + Raider.IO Guild/Character API + Blizzard Professions API",
            "region": WOW_REGION,
            "locale": BLIZZARD_LOCALE,
            "raider_io_last_crawled_at": (raider_guild or {}).get("last_crawled_at"),
        },
        "guild": {
            "name": guild_block.get("name") or WOW_GUILD_NAME,
            "id": guild_block.get("id") or (guild_summary or {}).get("id"),
            "realm": {
                "name": guild_realm.get("name") or ((guild_summary or {}).get("realm") or {}).get("name") or WOW_REALM,
                "id": guild_realm.get("id") or ((guild_summary or {}).get("realm") or {}).get("id"),
                "slug": guild_realm.get("slug") or ((guild_summary or {}).get("realm") or {}).get("slug") or realm_slug,
            },
            "faction": {
                "type": guild_faction.get("type") or ((guild_summary or {}).get("faction") or {}).get("type"),
                "name": guild_faction.get("name") or ((guild_summary or {}).get("faction") or {}).get("name"),
            },
            "profile_url": (raider_guild or {}).get("profile_url"),
            "member_count": len(processed_members),
            "achievement_points": (guild_summary or {}).get("achievement_points"),
            "created_timestamp": (guild_summary or {}).get("created_timestamp"),
        },
        "raid_progression": raid_progression,
        "raid_rankings": raid_rankings,
        "members": processed_members,
    }

    professions_output = {
        "metadata": {
            "updated_at": timestamp,
            "source": "Blizzard Character Professions API",
            "region": WOW_REGION,
            "locale": BLIZZARD_LOCALE,
            "raider_io_last_crawled_at": (raider_guild or {}).get("last_crawled_at"),
        },
        "guild": {
            "name": guild_block.get("name") or WOW_GUILD_NAME,
            "id": guild_block.get("id") or (guild_summary or {}).get("id"),
            "realm": {
                "name": guild_realm.get("name") or ((guild_summary or {}).get("realm") or {}).get("name") or WOW_REALM,
                "id": guild_realm.get("id") or ((guild_summary or {}).get("realm") or {}).get("id"),
                "slug": guild_realm.get("slug") or ((guild_summary or {}).get("realm") or {}).get("slug") or realm_slug,
            },
            "faction": {
                "type": guild_faction.get("type") or ((guild_summary or {}).get("faction") or {}).get("type"),
                "name": guild_faction.get("name") or ((guild_summary or {}).get("faction") or {}).get("name"),
            },
            "profile_url": (raider_guild or {}).get("profile_url"),
            "member_count": len(professions_characters),
        },
        "characters": professions_characters,
    }

    raids_output = merge_raids_file(raid_catalog, raid_progression, timestamp)

    return guild_output, professions_output, raids_output


def write_yaml(path: Path, payload: Dict[str, Any]) -> None:
    ensure_parent_dir(path)
    with path.open("w", encoding="utf-8") as fh:
        yaml.dump(payload, fh, allow_unicode=True, sort_keys=False, width=120)
    print(f"✅ Saved: {path}")


def main() -> int:
    guild_output, professions_output, raids_output = build_outputs()
    if not guild_output or not professions_output:
        print("❌ Failed to build guild/professions payloads")
        return 1

    try:
        write_yaml(OUTPUT_GUILD_FILE, guild_output)
        write_yaml(OUTPUT_PROFESSIONS_FILE, professions_output)
        if raids_output:
            write_yaml(OUTPUT_RAIDS_FILE, raids_output)
        else:
            print("⚠️ Довідник рейдів не оновлено — залишено попередню версію")
    except OSError as exc:
        print(f"❌ Failed to write YAML: {exc}")
        return 1

    print("🎉 Guild roster + professions + raids export completed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
