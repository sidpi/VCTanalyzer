"""Teams / players / matches / rounds with organization scoping (§51).

Every read and write checks that the resource belongs to the caller's
organization. Admins bypass org checks (platform staff, §43). List
endpoints filter by org instead of raising, so users only ever see
their own data (§49: "Users should only see matches they have
permission to access").

Team/player import from vlr.gg (§42): `POST /teams/import-vlr` pulls the
team profile — name, tag, country, region, rank, and the full roster with
real names and roles — and upserts it into the caller's organization,
keyed by `vlr_team_id` so re-imports update instead of duplicating.
"""

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session, selectinload

from .. import models, schemas
from ..db import get_db
from ..external import ExternalUnavailable, vlr_player_detail, vlr_team_detail
from ..security import ensure_org_access, get_current_user, require_org_id

router = APIRouter(tags=["catalog"])


# --------------------------- scoping helpers ---------------------------

def _scoped_team(db: Session, user: models.User, team_id: str) -> models.Team:
    team = db.get(models.Team, team_id)
    if team is None:
        raise HTTPException(status_code=404, detail="Team not found")
    ensure_org_access(user, team.organization_id)
    return team


def _scoped_match(db: Session, user: models.User, match_id: str) -> models.Match:
    match = db.get(models.Match, match_id)
    if match is None:
        raise HTTPException(status_code=404, detail="Match not found")
    ensure_org_access(user, match.organization_id)
    return match


def _scoped_round(db: Session, user: models.User, round_id: str) -> models.Round:
    round_ = db.get(models.Round, round_id)
    if round_ is None:
        raise HTTPException(status_code=404, detail="Round not found")
    match = db.get(models.Match, round_.match_id)
    ensure_org_access(user, match.organization_id if match else None)
    return round_


# --------------------------- Teams ---------------------------

@router.post("/teams", response_model=schemas.TeamOut, status_code=201)
def create_team(
    payload: schemas.TeamIn,
    user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    team = models.Team(
        name=payload.name,
        region=payload.region,
        organization_id=require_org_id(user),
    )
    db.add(team)
    db.commit()
    return team


@router.get("/teams", response_model=list[schemas.TeamOut])
def list_teams(
    user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    q = db.query(models.Team).order_by(models.Team.name)
    if not user.is_admin:
        q = q.filter(models.Team.organization_id == user.organization_id)
    return q.all()


@router.get("/teams/{team_id}", response_model=schemas.TeamOut)
def get_team(
    team_id: str,
    user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return _scoped_team(db, user, team_id)


@router.patch("/teams/{team_id}", response_model=schemas.TeamOut)
def update_team(
    team_id: str,
    payload: schemas.TeamIn,
    user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    team = _scoped_team(db, user, team_id)
    team.name = payload.name
    team.region = payload.region
    db.commit()
    db.refresh(team)
    return team


@router.post(
    "/teams/{team_id}/players", response_model=schemas.PlayerOut, status_code=201
)
def add_player(
    team_id: str,
    payload: schemas.PlayerIn,
    user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _scoped_team(db, user, team_id)
    player = models.Player(
        name=payload.name,
        real_name=payload.real_name,
        country=payload.country,
        agent=payload.agent,
        role=payload.role,
        vlr_player_id=payload.vlr_player_id,
    )
    db.add(player)
    db.flush()
    db.add(models.TeamPlayer(team_id=team_id, player_id=player.id))
    db.commit()
    return player


@router.delete("/teams/{team_id}/players/{player_id}", status_code=204)
def remove_player(
    team_id: str,
    player_id: str,
    user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Remove a player from a team's roster (player row is kept)."""
    _scoped_team(db, user, team_id)
    row = (
        db.query(models.TeamPlayer)
        .filter(
            models.TeamPlayer.team_id == team_id,
            models.TeamPlayer.player_id == player_id,
        )
        .first()
    )
    if row is None:
        raise HTTPException(status_code=404, detail="Player is not on this roster")
    db.delete(row)
    db.commit()


@router.get("/teams/{team_id}/players", response_model=list[schemas.PlayerOut])
def list_team_players(
    team_id: str,
    user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _scoped_team(db, user, team_id)
    return (
        db.query(models.Player)
        .join(models.TeamPlayer, models.TeamPlayer.player_id == models.Player.id)
        .filter(models.TeamPlayer.team_id == team_id)
        .all()
    )


# --------------------- VLR team / player import ---------------------

class VlrTeamImportIn(BaseModel):
    vlr_team_id: str = Field(min_length=1, max_length=40)
    name: str | None = Field(default=None, max_length=120)


class VlrPlayerImportIn(BaseModel):
    vlr_player_id: str = Field(min_length=1, max_length=40)
    agent: str = ""


def _upsert_vlr_player(
    db: Session,
    team: models.Team,
    entry: dict,
    top_agent: str = "",
) -> models.Player:
    """Create/update a roster row from a VLR team-profile player entry
    ({id, name (real name), alias, role})."""
    vlr_pid = str(entry.get("id") or "").strip()
    alias = (entry.get("alias") or "").strip() or "Unknown"
    real_name = (entry.get("name") or "").strip()
    role = (entry.get("role") or "").strip().lower()

    player = None
    if vlr_pid:
        player = (
            db.query(models.Player)
            .filter(models.Player.vlr_player_id == vlr_pid)
            .first()
        )
    if player is None:
        player = models.Player(name=alias)
        db.add(player)
        db.flush()

    player.name = alias
    player.real_name = real_name or player.real_name
    player.country = (entry.get("country") or "").strip() or player.country
    player.role = role or player.role
    player.agent = player.agent or top_agent
    if vlr_pid:
        player.vlr_player_id = vlr_pid

    existing = (
        db.query(models.TeamPlayer)
        .filter(
            models.TeamPlayer.team_id == team.id,
            models.TeamPlayer.player_id == player.id,
        )
        .first()
    )
    if existing is None:
        db.add(models.TeamPlayer(team_id=team.id, player_id=player.id))
    return player


@router.post("/teams/import-vlr", response_model=schemas.TeamOut, status_code=201)
async def import_vlr_team(
    payload: VlrTeamImportIn,
    user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Import a team + full roster from vlr.gg into the caller's org.

    Pulls the team profile (name, tag, country, region, rank) and every
    roster player (alias, real name, role). Idempotent on `vlr_team_id` —
    re-importing refreshes the roster instead of duplicating. Players
    already in the org (matched by `vlr_player_id`) are kept and re-linked.
    """
    org_id = require_org_id(user)
    try:
        detail = await vlr_team_detail(payload.vlr_team_id)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except ExternalUnavailable as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    name = (payload.name or detail.get("name") or "Unknown").strip()

    team = (
        db.query(models.Team)
        .filter(
            models.Team.vlr_team_id == payload.vlr_team_id,
            models.Team.organization_id == org_id,
        )
        .first()
    )
    if team is None:
        team = models.Team(
            name=name,
            organization_id=org_id,
            vlr_team_id=payload.vlr_team_id,
        )
        db.add(team)
    team.name = name
    team.region = (detail.get("region") or "").strip() or team.region
    db.flush()

    roster = detail.get("roster") or []
    for entry in roster:
        _upsert_vlr_player(db, team, entry)
    db.commit()
    db.refresh(team)
    return team


@router.post(
    "/teams/{team_id}/players/import-vlr",
    response_model=schemas.PlayerOut,
    status_code=201,
)
async def import_vlr_player(
    team_id: str,
    payload: VlrPlayerImportIn,
    user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Import a single player (alias, real name, country, agents, current
    team) from vlr.gg onto a roster."""
    team = _scoped_team(db, user, team_id)
    try:
        detail = await vlr_player_detail(payload.vlr_player_id)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except ExternalUnavailable as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    alias = (detail.get("alias") or "Unknown").strip()
    agents = detail.get("agents") or []
    top_agent = (
        (agents[0].get("name") or "")
        if agents and isinstance(agents[0], dict)
        else payload.agent
    )

    player = None
    existing_pid = str(detail.get("id") or "")
    if existing_pid:
        player = (
            db.query(models.Player)
            .filter(models.Player.vlr_player_id == existing_pid)
            .first()
        )
    if player is None:
        player = models.Player(name=alias)
        db.add(player)
        db.flush()

    player.name = alias
    player.real_name = (detail.get("name") or "").strip() or player.real_name
    player.country = (detail.get("country") or "").strip() or player.country
    player.agent = player.agent or top_agent
    if existing_pid:
        player.vlr_player_id = existing_pid

    existing = (
        db.query(models.TeamPlayer)
        .filter(
            models.TeamPlayer.team_id == team.id,
            models.TeamPlayer.player_id == player.id,
        )
        .first()
    )
    if existing is None:
        db.add(models.TeamPlayer(team_id=team.id, player_id=player.id))
    db.commit()
    db.refresh(player)
    return player


# --------------------------- Matches ---------------------------

@router.post("/matches", response_model=schemas.MatchOut, status_code=201)
def create_match(
    payload: schemas.MatchIn,
    user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    team_a = _scoped_team(db, user, payload.team_a_id)
    team_b = _scoped_team(db, user, payload.team_b_id)
    if team_a.organization_id != team_b.organization_id:
        raise HTTPException(
            status_code=422, detail="Both teams must belong to your organization"
        )
    match = models.Match(
        organization_id=team_a.organization_id,
        team_a_id=payload.team_a_id,
        team_b_id=payload.team_b_id,
        map=payload.map,
        type=payload.type,
        played_at=payload.played_at,
        notes=payload.notes,
        vlr_match_id=payload.vlr_match_id,
        analysis_version="v0",
        model_version="v0",
    )
    db.add(match)
    db.commit()
    return match


@router.get("/matches", response_model=list[schemas.MatchOut])
def list_matches(
    user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    q = db.query(models.Match).options(selectinload(models.Match.vods))
    q = q.order_by(models.Match.created_at.desc())
    if not user.is_admin:
        q = q.filter(models.Match.organization_id == user.organization_id)
    return q.all()


@router.get("/matches/{match_id}", response_model=schemas.MatchOut)
def get_match(
    match_id: str,
    user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    match = _scoped_match(db, user, match_id)
    match.vods  # eager-load before serialization
    return match


# --------------------------- Rounds / events / positions ---------------------------

@router.get("/matches/{match_id}/rounds", response_model=list[schemas.RoundOut])
def list_rounds(
    match_id: str,
    user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _scoped_match(db, user, match_id)
    return (
        db.query(models.Round)
        .options(selectinload(models.Round.events))
        .filter(models.Round.match_id == match_id)
        .order_by(models.Round.number)
        .all()
    )


@router.get("/rounds/{round_id}", response_model=schemas.RoundOut)
def get_round(
    round_id: str,
    user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    round_ = _scoped_round(db, user, round_id)
    # Touch the relationship after scoping so events serialize.
    round_.events
    return round_


@router.get("/rounds/{round_id}/events", response_model=list[schemas.EventOut])
def list_events(
    round_id: str,
    user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    round_ = _scoped_round(db, user, round_id)
    return (
        db.query(models.Event)
        .filter(models.Event.round_id == round_.id)
        .order_by(models.Event.t_seconds)
        .all()
    )


@router.get("/rounds/{round_id}/positions", response_model=list[schemas.PositionOut])
def list_positions(
    round_id: str,
    user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    round_ = _scoped_round(db, user, round_id)
    return (
        db.query(models.Position)
        .filter(models.Position.round_id == round_.id)
        .order_by(models.Position.t_seconds)
        .all()
    )
