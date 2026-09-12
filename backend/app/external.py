"""External ingest integrations (Master Plan §42 spirit: bring your own VOD).

- Twitch: resolve a VOD/clip URL via Helix (client id/secret) and build an
  embeddable player URL. Without credentials, plain /videos/{id} links still
  resolve (id + embed) — features degrade instead of failing.
- YouTube: resolve a video URL via the credential-free oEmbed endpoint
  (title/author/thumbnail). Optional YOUTUBE_API_KEY upgrades duration via
  the Data API v3. Playback uses the standard privacy-enhanced embed.
- VLR: thin proxy over a self-hosted `vlrgg-scraper` service
  (https://github.com/akhilnarang/vlrgg-scraper) for team/match auto-fill.

All are optional: settings are empty by default and routers return a clean
503 when an integration isn't configured or unreachable.
"""

import re
import time
from dataclasses import dataclass, field
from typing import Any

import httpx

from .config import get_settings

TIMEOUT = httpx.Timeout(10.0)


class ExternalUnavailable(Exception):
    """Raised when an external service is not configured or unreachable."""


# ----------------------------- Twitch --------------------------------------

_TWITCH_URL = re.compile(
    r"^(?:https?://)?(?:www\.)?twitch\.tv/videos/(?P<id>\d+)",
    re.IGNORECASE,
)
_TWITCH_CHANNEL_VOD = re.compile(
    r"^(?:https?://)?(?:www\.)?twitch\.tv/(?P<channel>[A-Za-z0-9_]{2,25})/v/(?P<id>\d+)",
    re.IGNORECASE,
)
_TWITCH_CLIP = re.compile(
    r"^(?:https?://)?(?:www\.)?twitch\.tv/(?P<channel>[A-Za-z0-9_]{2,25})/clip/(?P<slug>[A-Za-z0-9_-]+)"
    r"|^(?:https?://)?clips\.twitch\.tv/(?P<slug2>[A-Za-z0-9_-]+)",
    re.IGNORECASE,
)

_token_cache: dict[str, Any] = {"token": None, "expires": 0.0}


@dataclass
class TwitchVodInfo:
    vod_id: str
    url: str
    provider: str  # "video" | "clip"
    channel: str | None = None
    title: str | None = None
    duration_seconds: float | None = None
    thumbnail_url: str | None = None
    created_at: str | None = None
    warnings: list[str] = field(default_factory=list)


def _parse_helix_duration(raw: str) -> float | None:
    """Helix durations look like '1h2m3s' or ISO 'PT1H2M3S'."""
    if not raw:
        return None
    iso = re.match(
        r"^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?$", raw, re.IGNORECASE
    )
    if iso:
        h, m, s = (float(x) if x else 0.0 for x in iso.groups())
        return h * 3600 + m * 60 + s
    rel = re.match(r"^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+(?:\.\d+)?)s)?$", raw, re.IGNORECASE)
    if rel:
        h, m, s = (float(x) if x else 0.0 for x in rel.groups())
        return h * 3600 + m * 60 + s
    try:
        return float(raw)
    except ValueError:
        return None


async def _twitch_app_token(client: httpx.AsyncClient) -> str:
    settings = get_settings()
    if not settings.twitch_client_id or not settings.twitch_client_secret:
        raise ExternalUnavailable(
            "Twitch API is not configured (set TWITCH_CLIENT_ID / TWITCH_CLIENT_SECRET)"
        )
    if _token_cache["token"] and time.time() < _token_cache["expires"]:
        return str(_token_cache["token"])
    res = await client.post(
        "https://id.twitch.tv/oauth2/token",
        params={
            "client_id": settings.twitch_client_id,
            "client_secret": settings.twitch_client_secret,
            "grant_type": "client_credentials",
        },
    )
    if res.status_code != 200:
        raise ExternalUnavailable(f"Twitch auth failed ({res.status_code})")
    body = res.json()
    _token_cache["token"] = body["access_token"]
    _token_cache["expires"] = time.time() + int(body.get("expires_in", 3600)) - 60
    return str(_token_cache["token"])


async def resolve_twitch_vod(url: str) -> TwitchVodInfo:
    """Resolve any Twitch VOD/clip URL into playback metadata.

    Works without API credentials for direct /videos/{id} and clip URLs
    (embed playback + id); credentials add title/channel/duration/thumbnail.
    """
    url = url.strip()
    settings = get_settings()

    m = _TWITCH_URL.match(url) or _TWITCH_CHANNEL_VOD.match(url)
    if m:
        info = TwitchVodInfo(
            vod_id=m.group("id"), url=url, provider="video"
        )
    else:
        c = _TWITCH_CLIP.match(url)
        if not c:
            raise ValueError(
                "Not a recognized Twitch VOD or clip URL "
                "(expected twitch.tv/videos/{id} or a clip link)"
            )
        channel = c.group("channel")
        slug = c.group("slug") or c.group("slug2")
        info = TwitchVodInfo(
            vod_id=slug, url=url, provider="clip", channel=channel
        )

    # Embeddable player URL. `parent` must match the hosting domain;
    # localhost works in dev, production needs its own domain registered.
    if info.provider == "clip":
        info.url = (
            f"https://clips.twitch.tv/embed?clip={info.vod_id}&parent=localhost"
        )
        info.warnings.append(
            "Twitch clips can only play when the site domain is registered "
            "as the embed parent; playback may be blocked outside localhost."
        )
    else:
        info.url = (
            f"https://player.twitch.tv/?video={info.vod_id}"
            f"&parent=localhost&autoplay=false"
        )

    try:
        async with httpx.AsyncClient(timeout=TIMEOUT) as client:
            try:
                token = await _twitch_app_token(client)
                headers = {
                    "Authorization": f"Bearer {token}",
                    "Client-Id": settings.twitch_client_id,
                }
                params = {"id": info.vod_id}
                if info.provider == "video":
                    res = await client.get(
                        "https://api.twitch.tv/helix/videos",
                        params=params,
                        headers=headers,
                    )
                    if res.status_code == 200:
                        data = res.json().get("data") or []
                        if data:
                            v = data[0]
                            info.title = v.get("title")
                            info.channel = v.get("user_name")
                            info.duration_seconds = _parse_helix_duration(
                                v.get("duration") or ""
                            )
                            info.thumbnail_url = v.get("thumbnail_url")
                            info.created_at = v.get("created_at")
                else:
                    res = await client.get(
                        "https://api.twitch.tv/helix/clips",
                        params=params,
                        headers=headers,
                    )
                    if res.status_code == 200:
                        data = res.json().get("data") or []
                        if data:
                            v = data[0]
                            info.title = v.get("title")
                            info.channel = v.get("broadcaster_name")
                            info.duration_seconds = float(v.get("duration") or 0) or None
                            info.thumbnail_url = v.get("thumbnail_url")
                            info.created_at = v.get("created_at")
            except ExternalUnavailable:
                info.warnings.append(
                    "TWITCH_CLIENT_ID not set — resolved the video id but "
                    "could not fetch title/channel/duration."
                )
    except httpx.HTTPError as exc:
        raise ExternalUnavailable(f"Twitch request failed: {exc}") from exc

    return info


# ----------------------------- YouTube -------------------------------------

_YT_LONG = re.compile(
    r"^(?:https?://)?(?:www\.|m\.)?youtube\.com/watch\?(?:.*&)?v=(?P<id>[A-Za-z0-9_-]{6,20})",
    re.IGNORECASE,
)
_YT_SHORT = re.compile(
    r"^(?:https?://)?(?:www\.)?youtu\.be/(?P<id>[A-Za-z0-9_-]{6,20})",
    re.IGNORECASE,
)
_YT_EMBED = re.compile(
    r"^(?:https?://)?(?:www\.)?youtube\.com/(?:embed|live|shorts)/(?P<id>[A-Za-z0-9_-]{6,20})",
    re.IGNORECASE,
)


@dataclass
class YouTubeVodInfo:
    vod_id: str
    url: str
    channel: str | None = None
    title: str | None = None
    duration_seconds: float | None = None
    thumbnail_url: str | None = None
    warnings: list[str] = field(default_factory=list)


def resolve_youtube_vod_sync(url: str) -> YouTubeVodInfo:
    """Resolve a YouTube video URL into playback metadata.

    Credential-free: the video id is parsed from the URL and metadata comes
    from the public oEmbed endpoint. Duration needs the optional
    YOUTUBE_API_KEY (Data API v3); without it we degrade gracefully.
    Sync variant — the ingest router runs it via httpx in a worker thread.
    """
    url = url.strip()
    m = _YT_LONG.match(url) or _YT_SHORT.match(url) or _YT_EMBED.match(url)
    if not m:
        raise ValueError(
            "Not a recognized YouTube video URL "
            "(expected youtube.com/watch?v=…, youtu.be/…, or a Shorts/live link)"
        )
    info = YouTubeVodInfo(vod_id=m.group("id"), url=url)
    info.thumbnail_url = f"https://i.ytimg.com/vi/{info.vod_id}/hqdefault.jpg"

    settings = get_settings()

    # oEmbed: title + author, no key required.
    try:
        res = httpx.get(
            "https://www.youtube.com/oembed",
            params={"url": f"https://www.youtube.com/watch?v={info.vod_id}", "format": "json"},
            timeout=TIMEOUT,
        )
        if res.status_code == 200:
            body = res.json()
            info.title = body.get("title")
            info.channel = body.get("author_name")
        elif res.status_code == 404:
            info.warnings.append(
                "Video not found or private — resolved the id but could not fetch metadata."
            )
    except httpx.HTTPError:
        info.warnings.append("oEmbed lookup failed — metadata unavailable.")

    # Optional Data API v3: exact duration.
    if settings.youtube_api_key:
        try:
            res = httpx.get(
                "https://www.googleapis.com/youtube/v3/videos",
                params={"part": "contentDetails", "id": info.vod_id,
                        "key": settings.youtube_api_key},
                timeout=TIMEOUT,
            )
            if res.status_code == 200:
                items = res.json().get("items") or []
                if items:
                    iso = items[0].get("contentDetails", {}).get("duration", "")
                    info.duration_seconds = _parse_helix_duration(iso)  # ISO-8601 both
            else:
                info.warnings.append(
                    f"YouTube Data API returned {res.status_code} — duration unavailable."
                )
        except httpx.HTTPError:
            info.warnings.append("YouTube Data API unreachable — duration unavailable.")
    else:
        info.warnings.append(
            "YOUTUBE_API_KEY not set — duration unavailable (oEmbed metadata only)."
        )

    return info


# ------------------------------ VLR ----------------------------------------


def _vlr_base() -> str:
    base = get_settings().vlr_base_url.rstrip("/")
    if not base:
        raise ExternalUnavailable(
            "vlrgg-scraper is not configured (set VLR_BASE_URL)"
        )
    return base


async def vlr_search(query: str) -> list[dict[str, Any]]:
    """Search teams/players/events on the scraper service."""
    if not query.strip():
        return []
    try:
        async with httpx.AsyncClient(timeout=TIMEOUT) as client:
            res = await client.get(
                f"{_vlr_base()}/api/v1/search", params={"q": query.strip()}
            )
    except httpx.HTTPError as exc:
        raise ExternalUnavailable(f"vlr search failed: {exc}") from exc
    if res.status_code != 200:
        raise ExternalUnavailable(f"vlr search returned {res.status_code}")
    return list(res.json().get("data") or [])


async def vlr_matches(status: str | None = None) -> list[dict[str, Any]]:
    """List matches (status: upcoming | completed | live per the scraper)."""
    params: dict[str, str] = {}
    if status:
        params["status"] = status
    try:
        async with httpx.AsyncClient(timeout=TIMEOUT) as client:
            res = await client.get(f"{_vlr_base()}/api/v1/matches", params=params)
    except httpx.HTTPError as exc:
        raise ExternalUnavailable(f"vlr matches failed: {exc}") from exc
    if res.status_code != 200:
        raise ExternalUnavailable(f"vlr matches returned {res.status_code}")
    return list(res.json().get("data") or [])


async def vlr_match_detail(match_id: str) -> dict[str, Any]:
    """Full match payload: teams, event, per-map data, videos."""
    try:
        async with httpx.AsyncClient(timeout=TIMEOUT) as client:
            res = await client.get(f"{_vlr_base()}/api/v1/matches/{match_id}")
    except httpx.HTTPError as exc:
        raise ExternalUnavailable(f"vlr match fetch failed: {exc}") from exc
    if res.status_code != 200:
        raise ExternalUnavailable(f"vlr match returned {res.status_code}")
    return dict(res.json().get("data") or {})


async def vlr_team_detail(team_id: str) -> dict[str, Any]:
    """Team profile: name, tag, country, region, rank, and full roster
    (player id, real name, alias, role) — scraped from vlr.gg/team/{id}."""
    try:
        async with httpx.AsyncClient(timeout=TIMEOUT) as client:
            res = await client.get(f"{_vlr_base()}/api/v1/team/{team_id}")
    except httpx.HTTPError as exc:
        raise ExternalUnavailable(f"vlr team fetch failed: {exc}") from exc
    if res.status_code == 404:
        raise ValueError(f"VLR team '{team_id}' not found")
    if res.status_code != 200:
        raise ExternalUnavailable(f"vlr team returned {res.status_code}")
    return dict(res.json().get("data") or {})


async def vlr_player_detail(player_id: str) -> dict[str, Any]:
    """Player profile: name, alias, country, agents, current team."""
    try:
        async with httpx.AsyncClient(timeout=TIMEOUT) as client:
            res = await client.get(f"{_vlr_base()}/api/v1/player/{player_id}")
    except httpx.HTTPError as exc:
        raise ExternalUnavailable(f"vlr player fetch failed: {exc}") from exc
    if res.status_code == 404:
        raise ValueError(f"VLR player '{player_id}' not found")
    if res.status_code != 200:
        raise ExternalUnavailable(f"vlr player returned {res.status_code}")
    return dict(res.json().get("data") or {})


async def vlr_rankings() -> list[dict[str, Any]]:
    """Team rankings grouped by region (name, id, logo, rank, points, country)."""
    try:
        async with httpx.AsyncClient(timeout=TIMEOUT) as client:
            res = await client.get(f"{_vlr_base()}/api/v1/rankings")
    except httpx.HTTPError as exc:
        raise ExternalUnavailable(f"vlr rankings fetch failed: {exc}") from exc
    if res.status_code != 200:
        raise ExternalUnavailable(f"vlr rankings returned {res.status_code}")
    return list(res.json().get("data") or [])
