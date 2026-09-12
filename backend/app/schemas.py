"""Pydantic schemas for request/response payloads."""

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field

Side = Literal["attack", "defense"]
TeamSide = Literal["team_a", "team_b"]


# --------------------------- Auth ---------------------------

class RegisterIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8)
    display_name: str = Field(min_length=1, max_length=120)
    organization_name: str | None = None


class LoginIn(BaseModel):
    email: EmailStr
    password: str


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user_id: str
    organization_id: str | None


class UserOut(BaseModel):
    id: str
    email: str
    display_name: str
    is_admin: bool
    organization_id: str | None


# --------------------------- Teams / players ---------------------------

class TeamIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    region: str = ""


class TeamOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    region: str
    vlr_team_id: str | None = None
    organization_id: str | None


class PlayerIn(BaseModel):
    name: str
    real_name: str = ""
    country: str = ""
    agent: str = ""
    role: str = ""
    vlr_player_id: str | None = None


class PlayerOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    real_name: str
    country: str
    agent: str
    role: str
    vlr_player_id: str | None = None


# --------------------------- Matches / rounds ---------------------------

class MatchIn(BaseModel):
    team_a_id: str
    team_b_id: str
    map: str
    type: str = "scrim"
    played_at: str = ""
    notes: str = ""
    vlr_match_id: str | None = None


class VodOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    match_id: str
    source: str
    source_url: str | None
    source_channel: str | None
    filename: str
    size_bytes: int
    content_type: str
    duration_seconds: float | None


class VodSourceIn(BaseModel):
    """Patch a VOD's source URL (e.g. attach a Twitch/YouTube link to an upload)."""

    source: Literal["upload", "twitch", "youtube"]
    source_url: str = Field(min_length=1, max_length=500)
    source_channel: str | None = None


class MatchOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    team_a_id: str
    team_b_id: str
    map: str
    type: str
    played_at: str
    score_a: int
    score_b: int
    notes: str
    vlr_match_id: str | None
    analysis_version: str
    model_version: str
    vod: VodOut | None = None


class EventOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    round_id: str
    type: str
    t_seconds: float
    label: str
    player_id: str | None
    x: float | None
    y: float | None
    confidence: float


class RoundOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    match_id: str
    number: int
    side: Side
    winner_side: TeamSide
    duration_seconds: int
    vod_start_seconds: float | None
    events: list[EventOut] = []


class PositionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    player_id: str
    team_side: str
    t_seconds: float
    x: float
    y: float
    confidence: float


# --------------------------- VOD / jobs ---------------------------

class JobOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    match_id: str
    organization_id: str | None
    vod_id: str | None
    status: str
    progress: int
    frames_processed: int
    total_frames: int
    error: str | None
    model_version: str


class JobStatusOut(BaseModel):
    id: str
    status: str
    progress: int
    stage: str
