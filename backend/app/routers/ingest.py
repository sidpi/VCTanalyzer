"""External ingest endpoints (Master Plan §42 direction): Twitch VOD import
and vlrgg-scraper auto-fill. Both integrations are optional — the router
returns a clean 503 when the backing service isn't configured/unreachable,
so manual upload remains the primary path.

Flow (user request): analyze online VODs via Twitch *and* keep manual upload;
when uploading manually, auto-fill teams/time/map from vlr.gg so the match
metadata is created automatically from online data.
"""

from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from .. import models, schemas
from ..config import get_settings
from ..db import get_db
from ..external import (
    ExternalUnavailable,
    resolve_twitch_vod,
    resolve_youtube_vod_sync,
    vlr_match_detail,
    vlr_matches,
    vlr_player_detail,
    vlr_rankings,
    vlr_search,
    vlr_team_detail,
)
from ..security import ensure_org_access, get_current_user
from ..tasks import enqueue_analysis

router = APIRouter(tags=["ingest"])


def _unavailable(exc: ExternalUnavailable) -> HTTPException:
    return HTTPException(status_code=503, detail=str(exc))


# ----------------------------- Twitch ---------------------------------------

class TwitchResolveIn(BaseModel):
    url: str = Field(min_length=1, max_length=500)


class TwitchImportIn(TwitchResolveIn):
    match_id: str


@router.post("/ingest/twitch/resolve")
async def twitch_resolve(
    payload: TwitchResolveIn,
    user: models.User = Depends(get_current_user),
) -> dict[str, Any]:
    """Resolve a Twitch VOD/clip URL to playable metadata without importing."""
    try:
        info = await resolve_twitch_vod(payload.url)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except ExternalUnavailable as exc:
        raise _unavailable(exc) from exc
    return {
        "vod_id": info.vod_id,
        "provider": info.provider,
        "embed_url": info.url,
        "title": info.title,
        "channel": info.channel,
        "duration_seconds": info.duration_seconds,
        "thumbnail_url": info.thumbnail_url,
        "created_at": info.created_at,
        "warnings": info.warnings,
    }


@router.post("/ingest/twitch/import", response_model=schemas.JobOut, status_code=201)
async def twitch_import(
    payload: TwitchImportIn,
    user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Attach a Twitch VOD to a match and enqueue analysis.

    No video is downloaded — the VOD stays on Twitch and is embedded in the
    round viewer; the analysis pipeline works off the match metadata now and
    off stream segments once the CV stage consumes remote sources (Phase 2).
    """
    settings = get_settings()
    match = db.get(models.Match, payload.match_id)
    if match is None:
        raise HTTPException(status_code=404, detail="Match not found")
    ensure_org_access(user, match.organization_id)

    try:
        info = await resolve_twitch_vod(payload.url)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except ExternalUnavailable as exc:
        raise _unavailable(exc) from exc

    vod = models.Vod(
        match_id=match.id,
        source="twitch",
        source_url=payload.url.strip(),
        source_channel=info.channel,
        storage_key=f"twitch/{info.provider}/{info.vod_id}",
        filename=info.title or f"twitch-{info.vod_id}",
        size_bytes=0,
        content_type="video/twitch",
        duration_seconds=info.duration_seconds,
    )
    db.add(vod)
    db.flush()

    job = models.AnalysisJob(
        match_id=match.id,
        organization_id=match.organization_id,
        vod_id=vod.id,
        status=models.JobStatus.QUEUED,
        model_version=settings.model_version,
    )
    db.add(job)
    db.commit()
    db.refresh(job)

    enqueue_analysis(job.id)
    return job


# ----------------------------- YouTube ---------------------------------------

class YouTubeResolveIn(BaseModel):
    url: str = Field(min_length=1, max_length=500)


class YouTubeImportIn(YouTubeResolveIn):
    match_id: str


def _youtube_embed_url(vod_id: str) -> str:
    """Privacy-enhanced nocookie embed; origin passthrough keeps JS sync working."""
    return f"https://www.youtube-nocookie.com/embed/{vod_id}?enablejsapi=1"


@router.post("/ingest/youtube/resolve")
async def youtube_resolve(
    payload: YouTubeResolveIn,
    user: models.User = Depends(get_current_user),
) -> dict[str, Any]:
    """Resolve a YouTube video URL to playable metadata without importing.

    Metadata comes from the credential-free oEmbed endpoint; the optional
    YOUTUBE_API_KEY adds duration (degrades with a warning when unset).
    """
    import anyio

    try:
        info = await anyio.to_thread.run_sync(
            lambda: resolve_youtube_vod_sync(payload.url)
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return {
        "vod_id": info.vod_id,
        "provider": "youtube",
        "embed_url": _youtube_embed_url(info.vod_id),
        "title": info.title,
        "channel": info.channel,
        "duration_seconds": info.duration_seconds,
        "thumbnail_url": info.thumbnail_url,
        "warnings": info.warnings,
    }


@router.post("/ingest/youtube/import", response_model=schemas.JobOut, status_code=201)
async def youtube_import(
    payload: YouTubeImportIn,
    user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Attach a YouTube VOD to a match and enqueue analysis.

    Playback embeds the video; when yt-dlp can download it (no age gate,
    etc.), the worker analyzes the real frames — same as Twitch imports.
    """
    import anyio

    settings = get_settings()
    match = db.get(models.Match, payload.match_id)
    if match is None:
        raise HTTPException(status_code=404, detail="Match not found")
    ensure_org_access(user, match.organization_id)

    try:
        info = await anyio.to_thread.run_sync(
            lambda: resolve_youtube_vod_sync(payload.url)
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    vod = models.Vod(
        match_id=match.id,
        source="youtube",
        source_url=payload.url.strip(),
        source_channel=info.channel,
        storage_key=f"youtube/{info.vod_id}",
        filename=info.title or f"youtube-{info.vod_id}",
        size_bytes=0,
        content_type="video/youtube",
        duration_seconds=info.duration_seconds,
    )
    db.add(vod)
    db.flush()

    job = models.AnalysisJob(
        match_id=match.id,
        organization_id=match.organization_id,
        vod_id=vod.id,
        status=models.JobStatus.QUEUED,
        model_version=settings.model_version,
    )
    db.add(job)
    db.commit()
    db.refresh(job)

    enqueue_analysis(job.id)
    return job


# --------------------------- VOD source attach ---------------------------

@router.post("/vods/{vod_id}/source", response_model=schemas.VodOut)
def attach_vod_source(
    vod_id: str,
    payload: schemas.VodSourceIn,
    user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Attach/replace an external playback source on an existing VOD row
    (e.g. link the Twitch VOD for a manually uploaded match)."""
    vod = db.get(models.Vod, vod_id)
    if vod is None:
        raise HTTPException(status_code=404, detail="VOD not found")
    match = db.get(models.Match, vod.match_id)
    ensure_org_access(user, match.organization_id if match else None)
    vod.source = payload.source
    vod.source_url = payload.source_url
    vod.source_channel = payload.source_channel
    db.commit()
    db.refresh(vod)
    return vod


# ------------------------------- VLR ----------------------------------------

@router.get("/ingest/vlr/search")
async def vlr_search_proxy(
    q: str,
    user: models.User = Depends(get_current_user),
) -> dict[str, Any]:
    """Search teams/players/events on vlrgg-scraper (proxied, auth-guarded)."""
    try:
        results = await vlr_search(q)
    except ExternalUnavailable as exc:
        raise _unavailable(exc) from exc
    return {"data": results}


@router.get("/ingest/vlr/matches")
async def vlr_matches_proxy(
    status: str | None = None,
    user: models.User = Depends(get_current_user),
) -> dict[str, Any]:
    """Recent/upcoming VLR matches (proxied, auth-guarded)."""
    try:
        results = await vlr_matches(status)
    except ExternalUnavailable as exc:
        raise _unavailable(exc) from exc
    return {"data": results}


@router.get("/ingest/vlr/matches/{match_id}")
async def vlr_match_proxy(
    match_id: str,
    user: models.User = Depends(get_current_user),
) -> dict[str, Any]:
    """Detailed VLR match: teams, scores, per-map data, VOD links."""
    try:
        detail = await vlr_match_detail(match_id)
    except ExternalUnavailable as exc:
        raise _unavailable(exc) from exc
    return detail


@router.get("/ingest/vlr/rankings")
async def vlr_rankings_proxy(
    user: models.User = Depends(get_current_user),
) -> dict[str, Any]:
    """Team rankings grouped by region (from vlr.gg/rankings)."""
    try:
        data = await vlr_rankings()
    except ExternalUnavailable as exc:
        raise _unavailable(exc) from exc
    return {"data": data}


@router.get("/ingest/vlr/team/{team_id}")
async def vlr_team_proxy(
    team_id: str,
    user: models.User = Depends(get_current_user),
) -> dict[str, Any]:
    """VLR team profile: name, tag, country, region, rank, full roster."""
    try:
        detail = await vlr_team_detail(team_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ExternalUnavailable as exc:
        raise _unavailable(exc) from exc
    return detail


@router.get("/ingest/vlr/player/{player_id}")
async def vlr_player_proxy(
    player_id: str,
    user: models.User = Depends(get_current_user),
) -> dict[str, Any]:
    """VLR player profile: alias, real name, country, agents, current team."""
    try:
        detail = await vlr_player_detail(player_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ExternalUnavailable as exc:
        raise _unavailable(exc) from exc
    return detail


def _upsert_roster_player(db: Session, team: models.Team, entry: dict[str, Any]) -> None:
    """Upsert one roster entry ({id, name, alias, role}) from a VLR team
    profile onto the team (keeps the router lean; shared by autofill)."""
    from .catalog import _upsert_vlr_player

    _upsert_vlr_player(db, team, entry)


def _pick_map(detail: dict[str, Any]) -> str:
    """First played map name from the scraper's per-map data list."""
    data = detail.get("data") or []
    for entry in data:
        map_name = (entry.get("map") or "").strip()
        if map_name and map_name.lower() != "tbd":
            return map_name
    return "Ascent"


class VlrAutofillIn(BaseModel):
    vlr_match_id: str = Field(min_length=1, max_length=40)
    map: str | None = Field(default=None, max_length=60)
    type: str = "official"
    create_missing_teams: bool = True


@router.post("/ingest/vlr/autofill", response_model=schemas.MatchOut, status_code=201)
async def vlr_autofill(
    payload: VlrAutofillIn,
    user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Create (or update) a match from a VLR match, auto-creating/updating
    teams from online data. Optionally attach the official VOD link if the
    scraper exposes one."""
    org_id = user.organization_id
    if not org_id and not user.is_admin:
        raise HTTPException(status_code=403, detail="No organization to fill into")

    try:
        detail = await vlr_match_detail(payload.vlr_match_id)
    except ExternalUnavailable as exc:
        raise _unavailable(exc) from exc

    teams = detail.get("teams") or []
    if len(teams) < 2:
        raise HTTPException(status_code=422, detail="VLR match has no team pair yet")

    def team_name(entry: dict[str, Any]) -> str:
        return (entry.get("name") or "").strip() or "Unknown"

    def find_team(name: str) -> models.Team | None:
        return (
            db.query(models.Team)
            .filter(models.Team.name == name, models.Team.organization_id == org_id)
            .first()
        )

    name_a, name_b = team_name(teams[0]), team_name(teams[1])
    team_a = find_team(name_a)
    team_b = find_team(name_b)

    if payload.create_missing_teams:
        if team_a is None:
            team_a = models.Team(name=name_a, region="", organization_id=org_id)
            db.add(team_a)
        if team_b is None:
            team_b = models.Team(name=name_b, region="", organization_id=org_id)
            db.add(team_b)
        db.flush()
    if team_a is None or team_b is None:
        raise HTTPException(
            status_code=422,
            detail=f"Teams not in your organization and create_missing_teams=False: {name_a} / {name_b}",
        )

    # Enrich both teams with region + full rosters from the VLR team
    # profiles (real names, roles). Failure to enrich one team must not
    # fail the autofill — match data comes first.
    for team, team_payload in ((team_a, teams[0]), (team_b, teams[1])):
        team_vlr_id = str(team_payload.get("id") or "").strip()
        try:
            profile = await vlr_team_detail(team_vlr_id or team.name)
        except (ExternalUnavailable, ValueError):
            continue
        team.region = (profile.get("region") or "").strip() or team.region
        if team_vlr_id:
            team.vlr_team_id = team_vlr_id
        for entry in profile.get("roster") or []:
            _upsert_roster_player(db, team, entry)

    event = detail.get("event") or {}
    played_at = str(event.get("date") or "")[:10]
    map_name = payload.map or _pick_map(detail)

    match = (
        db.query(models.Match)
        .filter(
            models.Match.vlr_match_id == payload.vlr_match_id,
            models.Match.organization_id == org_id,
        )
        .first()
    )
    if match is None:
        match = models.Match(
            organization_id=org_id,
            team_a_id=team_a.id,
            team_b_id=team_b.id,
        )
        db.add(match)

    match.map = map_name
    match.type = payload.type
    match.played_at = played_at
    match.vlr_match_id = payload.vlr_match_id

    scores = [entry.get("score") for entry in teams[:2]]
    if isinstance(scores[0], int) and isinstance(scores[1], int):
        match.score_a = scores[0]
        match.score_b = scores[1]

    notes_parts = [f"Event: {event.get('series', '')}".rstrip(": ")]
    if event.get("stage"):
        notes_parts.append(f"Stage: {event['stage']}")
    match.notes = " · ".join(p for p in notes_parts if p)[:2000]

    # Attach the official VOD link (if the scraper exposes one) so the theater
    # can play it right away.
    videos = detail.get("videos") or {}
    vod_entries = videos.get("vods") or videos.get("streams") or []
    if vod_entries:
        url = vod_entries[0].get("url")
        if url and not match.vods:
            db.flush()
            db.add(
                models.Vod(
                    match_id=match.id,
                    source="twitch",
                    source_url=url,
                    storage_key=f"external/vlr/{payload.vlr_match_id}",
                    filename=(vod_entries[0].get("name") or "VLR VOD")[:255],
                    size_bytes=0,
                    content_type="video/external",
                )
            )

    db.commit()
    db.refresh(match)
    return match
