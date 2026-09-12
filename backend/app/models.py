"""Relational schema — mirrors Master Plan §15 core tables.

organizations → teams → team_players → players
matches → rounds → events / positions
vods → analysis_jobs
All sensitive rows hang off an organization for multi-tenancy (§51).
"""

from datetime import datetime, timezone
import enum
import uuid

from sqlalchemy import (
    Boolean,
    DateTime,
    Enum,
    Float,
    ForeignKey,
    Integer,
    String,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .db import Base


def _uuid() -> str:
    return uuid.uuid4().hex


def _now() -> datetime:
    return datetime.now(timezone.utc)


class JobStatus(str, enum.Enum):
    UPLOADING = "UPLOADING"
    QUEUED = "QUEUED"
    PREPROCESSING = "PREPROCESSING"
    DETECTING_ROUNDS = "DETECTING_ROUNDS"
    TRACKING_PLAYERS = "TRACKING_PLAYERS"
    DETECTING_EVENTS = "DETECTING_EVENTS"
    GENERATING_ANALYTICS = "GENERATING_ANALYTICS"
    COMPLETED = "COMPLETED"
    FAILED = "FAILED"
    CANCELLED = "CANCELLED"


class EventType(str, enum.Enum):
    KILL = "kill"
    FIRST_BLOOD = "first_blood"
    DEATH = "death"
    PLANT = "plant"
    DEFUSE = "defuse"
    MID_CONTROL = "mid_control"
    EXECUTE = "execute"
    RETAKE = "retake"
    ROTATION = "rotation"


class Organization(Base):
    __tablename__ = "organizations"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_uuid)
    name: Mapped[str] = mapped_column(String(120), unique=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)

    users: Mapped[list["User"]] = relationship(back_populates="organization")
    teams: Mapped[list["Team"]] = relationship(back_populates="organization")


class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_uuid)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    display_name: Mapped[str] = mapped_column(String(120))
    is_admin: Mapped[bool] = mapped_column(Boolean, default=False)
    organization_id: Mapped[str | None] = mapped_column(
        ForeignKey("organizations.id"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)

    organization: Mapped[Organization | None] = relationship(back_populates="users")


class Team(Base):
    __tablename__ = "teams"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_uuid)
    name: Mapped[str] = mapped_column(String(120))
    region: Mapped[str] = mapped_column(String(60), default="")
    organization_id: Mapped[str | None] = mapped_column(
        ForeignKey("organizations.id"), nullable=True, index=True
    )
    # External provenance: vlr.gg team id when imported/auto-filled (§42).
    vlr_team_id: Mapped[str | None] = mapped_column(
        String(40), nullable=True, index=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)

    organization: Mapped[Organization | None] = relationship(back_populates="teams")
    players: Mapped[list["Player"]] = relationship(
        secondary="team_players", back_populates="teams"
    )


class Player(Base):
    __tablename__ = "players"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_uuid)
    name: Mapped[str] = mapped_column(String(120))  # in-game alias
    real_name: Mapped[str] = mapped_column(String(120), default="")
    country: Mapped[str] = mapped_column(String(60), default="")
    agent: Mapped[str] = mapped_column(String(60), default="")
    role: Mapped[str] = mapped_column(String(60), default="")
    # External provenance: vlr.gg player id when imported (§42).
    vlr_player_id: Mapped[str | None] = mapped_column(
        String(40), nullable=True, index=True
    )

    teams: Mapped[list[Team]] = relationship(
        secondary="team_players", back_populates="players"
    )


class TeamPlayer(Base):
    """Roster membership — players move between teams over time."""

    __tablename__ = "team_players"
    __table_args__ = (UniqueConstraint("team_id", "player_id"),)

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_uuid)
    team_id: Mapped[str] = mapped_column(ForeignKey("teams.id"))
    player_id: Mapped[str] = mapped_column(ForeignKey("players.id"))
    jersey: Mapped[str] = mapped_column(String(16), default="")


class Vod(Base):
    __tablename__ = "vods"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_uuid)
    match_id: Mapped[str] = mapped_column(ForeignKey("matches.id"), index=True)
    # Where the VOD came from: "upload" (file stored locally) or "twitch"
    # (streamed/embedded from the source URL, Master Plan §42 ingest).
    source: Mapped[str] = mapped_column(String(20), default="upload")
    source_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    source_channel: Mapped[str | None] = mapped_column(String(120), nullable=True)
    storage_key: Mapped[str] = mapped_column(String(500))
    filename: Mapped[str] = mapped_column(String(255))
    size_bytes: Mapped[int] = mapped_column(Integer, default=0)
    content_type: Mapped[str] = mapped_column(String(120), default="")
    duration_seconds: Mapped[float | None] = mapped_column(Float, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)


class Match(Base):
    __tablename__ = "matches"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_uuid)
    # Denormalized ownership for row-level scoping (Master Plan §51): every
    # sensitive resource must belong to an organization.
    organization_id: Mapped[str | None] = mapped_column(
        ForeignKey("organizations.id"), nullable=True, index=True
    )
    team_a_id: Mapped[str] = mapped_column(ForeignKey("teams.id"), index=True)
    team_b_id: Mapped[str] = mapped_column(ForeignKey("teams.id"), index=True)
    map: Mapped[str] = mapped_column(String(60), index=True)
    type: Mapped[str] = mapped_column(String(20), default="scrim")
    played_at: Mapped[str] = mapped_column(String(20), default="")
    score_a: Mapped[int] = mapped_column(Integer, default=0)
    score_b: Mapped[int] = mapped_column(Integer, default=0)
    notes: Mapped[str] = mapped_column(String(2000), default="")
    # External provenance: vlr.gg match id when auto-filled from the scraper.
    vlr_match_id: Mapped[str | None] = mapped_column(
        String(40), nullable=True, index=True
    )
    # Versioning (Master Plan §53)
    analysis_version: Mapped[str] = mapped_column(String(40), default="v0")
    model_version: Mapped[str] = mapped_column(String(40), default="v0")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)

    rounds: Mapped[list["Round"]] = relationship(
        back_populates="match", cascade="all, delete-orphan"
    )
    vods: Mapped[list[Vod]] = relationship(back_populates="match")

    @property
    def vod(self) -> "Vod | None":
        """Primary VOD (first attached) — what the round viewer plays."""
        return self.vods[0] if self.vods else None


Vod.match = relationship("Match", back_populates="vods")  # type: ignore[attr-defined]


class Round(Base):
    __tablename__ = "rounds"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_uuid)
    match_id: Mapped[str] = mapped_column(ForeignKey("matches.id"), index=True)
    number: Mapped[int] = mapped_column(Integer)
    side: Mapped[str] = mapped_column(String(10))
    winner_side: Mapped[str] = mapped_column(String(10))
    duration_seconds: Mapped[int] = mapped_column(Integer, default=0)
    # VOD sync anchor (Master Plan §23) — filled by round detection
    vod_start_seconds: Mapped[float | None] = mapped_column(Float, nullable=True)

    match: Mapped[Match] = relationship(back_populates="rounds")
    events: Mapped[list["Event"]] = relationship(
        back_populates="round", cascade="all, delete-orphan"
    )
    positions: Mapped[list["Position"]] = relationship(
        back_populates="round", cascade="all, delete-orphan"
    )


class Event(Base):
    __tablename__ = "events"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_uuid)
    round_id: Mapped[str] = mapped_column(ForeignKey("rounds.id"), index=True)
    type: Mapped[EventType] = mapped_column(Enum(EventType, name="event_type"))
    t_seconds: Mapped[float] = mapped_column(Float)
    label: Mapped[str] = mapped_column(String(200), default="")
    player_id: Mapped[str | None] = mapped_column(
        ForeignKey("players.id"), nullable=True
    )
    x: Mapped[float | None] = mapped_column(Float, nullable=True)
    y: Mapped[float | None] = mapped_column(Float, nullable=True)
    confidence: Mapped[float] = mapped_column(Float, default=0.0)

    round: Mapped[Round] = relationship(back_populates="events")


class Position(Base):
    """High-frequency tracking data (Master Plan §16). Bulk-written by the
    worker; the API exposes it per-round for the tactical map."""

    __tablename__ = "positions"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_uuid)
    round_id: Mapped[str] = mapped_column(ForeignKey("rounds.id"), index=True)
    player_id: Mapped[str] = mapped_column(ForeignKey("players.id"), index=True)
    t_seconds: Mapped[float] = mapped_column(Float)
    x: Mapped[float] = mapped_column(Float)
    y: Mapped[float] = mapped_column(Float)
    direction: Mapped[float | None] = mapped_column(Float, nullable=True)
    confidence: Mapped[float] = mapped_column(Float, default=0.0)
    team_side: Mapped[str] = mapped_column(String(10), default="")

    round: Mapped[Round] = relationship(back_populates="positions")


class AnalysisJob(Base):
    __tablename__ = "analysis_jobs"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_uuid)
    match_id: Mapped[str] = mapped_column(ForeignKey("matches.id"), index=True)
    organization_id: Mapped[str | None] = mapped_column(
        ForeignKey("organizations.id"), nullable=True, index=True
    )
    vod_id: Mapped[str | None] = mapped_column(
        ForeignKey("vods.id"), nullable=True
    )
    status: Mapped[JobStatus] = mapped_column(
        Enum(JobStatus, name="job_status"), default=JobStatus.QUEUED
    )
    progress: Mapped[int] = mapped_column(Integer, default=0)
    frames_processed: Mapped[int] = mapped_column(Integer, default=0)
    total_frames: Mapped[int] = mapped_column(Integer, default=0)
    error: Mapped[str | None] = mapped_column(String(1000), nullable=True)
    model_version: Mapped[str] = mapped_column(String(40), default="v0")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_now, onupdate=_now
    )
