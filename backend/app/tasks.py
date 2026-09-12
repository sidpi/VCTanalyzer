"""Celery worker — background analysis pipeline (Master Plan §39, §48).

User upload → job row (QUEUED) → this worker advances the job through the
stage machine and writes structured results. The HTTP API never processes
video.

The MVP simulates the CV stages with deterministic synthetic detections so
the full product loop (upload → process → explore rounds) is exercisable
end-to-end before real computer vision lands in Phase 2. Each stage writes
real rows (rounds, events, positions) in the common data model.
"""

import threading
import time
from pathlib import Path

try:
    from celery import Celery
except ImportError:  # dev without celery installed
    Celery = None  # type: ignore[assignment]

from sqlalchemy.orm import Session

from .config import get_settings
from .db import SessionLocal
from . import models

_settings = get_settings()

if Celery is not None:
    celery_app = Celery(
        "vctanalyzer",
        broker=_settings.redis_url,
        backend=_settings.redis_url,
    )

    celery_app.conf.update(
        task_serializer="json",
        result_serializer="json",
        accept_content=["json"],
        task_track_started=True,
    )
else:
    celery_app = None

# (stage, simulated duration seconds, progress at stage end)
PIPELINE: list[tuple[models.JobStatus, float, int]] = [
    (models.JobStatus.PREPROCESSING, 1.0, 15),
    (models.JobStatus.DETECTING_ROUNDS, 1.0, 35),
    (models.JobStatus.TRACKING_PLAYERS, 2.0, 65),
    (models.JobStatus.DETECTING_EVENTS, 1.5, 85),
    (models.JobStatus.GENERATING_ANALYTICS, 1.0, 100),
]


def enqueue_analysis(job_id: str) -> None:
    """Hand the job to the queue (Master Plan §39).

    Production path: Celery task on Redis. Dev fallback without celery:
    run in a background thread so the HTTP request returns immediately.
    """
    if celery_app is not None:
        celery_app.send_task("app.tasks.run_analysis", args=[job_id])
    else:
        threading.Thread(target=run_analysis, args=[job_id], daemon=True).start()


def run_analysis(job_id: str) -> dict:
    db: Session = SessionLocal()
    try:
        job = db.get(models.AnalysisJob, job_id)
        if job is None or job.status in (
            models.JobStatus.COMPLETED,
            models.JobStatus.CANCELLED,
        ):
            return {"job": job_id, "skipped": True}

        try:
            _run_pipeline(db, job)
        except Exception as exc:  # noqa: BLE001
            job.status = models.JobStatus.FAILED
            job.error = str(exc)[:1000]
            db.commit()
            return {"job": job_id, "status": "FAILED", "error": str(exc)}

        return {"job": job_id, "status": job.status.value}
    finally:
        db.close()


if celery_app is not None:
    run_analysis = celery_app.task(  # type: ignore[assignment]
        name="app.tasks.run_analysis", max_retries=0
    )(run_analysis)


def _advance(db: Session, job: models.AnalysisJob, status, progress: int) -> None:
    job.status = status
    job.progress = progress
    db.commit()
    # Simulated stage work — replace with real CV stages in Phase 2.
    for stage, seconds, end_progress in PIPELINE:
        if stage == status:
            time.sleep(min(seconds, 0.2))
            job.progress = max(progress, end_progress)
            db.commit()
            break


def _run_pipeline(db: Session, job: models.AnalysisJob) -> None:
    """Real-when-possible pipeline (Phase 2 step 1):

    PREPROCESSING      — download the Twitch VOD (yt-dlp) / probe upload
    DETECTING_ROUNDS   — ffmpeg scene cuts → round boundaries + map guess
    TRACKING_PLAYERS   — synthetic (ByteTrack lands later in Phase 2)
    DETECTING_EVENTS   — synthetic (real detector lands in Phase 2)
    GENERATING_ANALYTICS — aggregates over written rows

    Tools missing (ffmpeg/yt-dlp) or a failed download degrade to the
    synthetic simulator so the product loop never blocks.
    """
    import random

    from . import media

    match = db.get(models.Match, job.match_id)
    if match is None:
        raise RuntimeError("match missing for job")

    settings = get_settings()
    rng = random.Random(job.id)

    vod = db.get(models.Vod, job.vod_id) if job.vod_id else None
    source_path: Path | None = None

    # --- PREPROCESSING: acquire a real local file when we can -------------
    _advance(db, job, models.JobStatus.PREPROCESSING, 10)
    if (
        vod is not None
        and vod.source in ("twitch", "youtube")
        and vod.source_url
    ):
        if settings.download_twitch_vods:
            job.progress = 12
            db.commit()
            if vod.source == "youtube":
                downloaded = media.download_youtube_vod(
                    vod.source_url,
                    Path(settings.storage_dir) / "downloads",
                    filename=f"{vod.id}_source",
                )
            else:
                downloaded = media.download_twitch_vod(
                    vod.source_url,
                    Path(settings.storage_dir) / "downloads",
                    filename=f"{vod.id}_source",
                )
            if downloaded is not None:
                source_path = downloaded
                vod.duration_seconds = (
                    media.ffprobe_duration(source_path) or vod.duration_seconds
                )
                db.commit()
            else:
                job.error = f"{vod.source.capitalize()} download failed; running on synthetic detection"
                db.commit()
        else:
            job.error = (
                f"{vod.source.capitalize()} download disabled; running on synthetic detection"
            )
            db.commit()
    elif vod is not None and vod.source == "upload":
        local = Path(settings.storage_dir) / (vod.storage_key or "")
        if local.is_file():
            source_path = local
            probed = media.ffprobe_duration(local)
            if probed:
                vod.duration_seconds = probed
                db.commit()

    # --- DETECTING_ROUNDS: real scene-cut detection when we have pixels ---
    _advance(db, job, models.JobStatus.DETECTING_ROUNDS, 35)
    round_starts: list[float] = []
    map_guess: tuple[str, float] | None = None
    if source_path is not None:
        cap = settings.max_vod_minutes * 60
        round_starts = media.scene_boundaries(
            source_path,
            max_seconds=cap,
        )
        map_guess = media.classify_map(source_path)

    real_rounds = len(round_starts) >= 3
    total_rounds = len(round_starts) if real_rounds else 24
    total_frames = (
        int((vod.duration_seconds or 0) * 30) if real_rounds else 172_800
    )
    job.total_frames = total_frames

    # Real map detection only overrides when confident (§53 versioning).
    if map_guess is not None and map_guess[1] >= 0.55:
        match.map = map_guess[0]
    db.commit()

    rounds: list[models.Round] = []
    if real_rounds:
        for number, start in enumerate(round_starts, start=1):
            next_start = (
                round_starts[number] if number < len(round_starts)
                else start + 100.0
            )
            duration = int(max(20.0, min(next_start - start, 160.0)))
            side = "attack" if number <= max(1, total_rounds // 2) else "defense"
            rounds.append(
                models.Round(
                    match_id=match.id,
                    number=number,
                    side=side,
                    winner_side="team_a" if rng.random() < 0.55 else "team_b",
                    duration_seconds=duration,
                    vod_start_seconds=round(start, 2),
                )
            )
    else:
        vod_clock = 42.0
        for number in range(1, total_rounds + 1):
            side = "attack" if number <= 12 else "defense"
            winner = "team_a" if rng.random() < 0.55 else "team_b"
            duration = rng.randint(62, 130)
            rounds.append(
                models.Round(
                    match_id=match.id,
                    number=number,
                    side=side,
                    winner_side=winner,
                    duration_seconds=duration,
                    vod_start_seconds=round(vod_clock, 2),
                )
            )
            vod_clock += duration + rng.uniform(35, 55)
    db.add_all(rounds)
    db.commit()

    # TRACKING_PLAYERS / DETECTING_EVENTS write the common data model.
    _advance(db, job, models.JobStatus.TRACKING_PLAYERS, 60)
    team_a_players = _roster(db, match.team_a_id)
    team_b_players = _roster(db, match.team_b_id)

    _advance(db, job, models.JobStatus.DETECTING_EVENTS, 80)
    for round_ in rounds:
        attackers = (
            team_a_players if round_.side == "attack" else team_b_players
        )
        defenders = (
            team_b_players if round_.side == "attack" else team_a_players
        )
        _write_positions(db, round_, attackers, "team_a", rng)
        _write_positions(db, round_, defenders, "team_b", rng)
        _write_events(db, round_, attackers, defenders, rng)

    _advance(db, job, models.JobStatus.GENERATING_ANALYTICS, 92)
    job.status = models.JobStatus.COMPLETED
    job.progress = 100
    job.frames_processed = total_frames
    match.analysis_version = "v1"
    match.model_version = _settings.model_version
    match.score_a = sum(1 for r in rounds if r.winner_side == "team_a")
    match.score_b = total_rounds - match.score_a
    db.commit()


def _roster(db: Session, team_id: str) -> list[models.Player]:
    return (
        db.query(models.Player)
        .join(models.TeamPlayer, models.TeamPlayer.player_id == models.Player.id)
        .filter(models.TeamPlayer.team_id == team_id)
        .limit(5)
        .all()
    )


from .models import TeamPlayer  # noqa: E402  (kept close to usage)


def _write_positions(db: Session, round_: models.Round,
                     players: list[models.Player], side: str,
                     rng: random.Random) -> None:
    """Synthetic stand-in for ByteTrack/Kalman output (Master Plan §9)."""
    if not players:
        return  # no roster data — skip silently (real CV output won't need this)
    base_x, base_y = rng.uniform(0.1, 0.5), rng.uniform(0.2, 0.8)
    step_x, step_y = rng.uniform(-0.05, 0.05), rng.uniform(-0.05, 0.05)
    samples = []
    for i in range(0, round_.duration_seconds + 1, 2):
        base_x = min(0.95, max(0.05, base_x + step_x + rng.uniform(-0.01, 0.01)))
        base_y = min(0.95, max(0.05, base_y + step_y + rng.uniform(-0.01, 0.01)))
        for p in players:
            samples.append(
                models.Position(
                    round_id=round_.id,
                    player_id=p.id,
                    t_seconds=float(i),
                    x=round(min(0.97, max(0.03, base_x + rng.uniform(-0.02, 0.02))), 4),
                    y=round(min(0.97, max(0.03, base_y + rng.uniform(-0.02, 0.02))), 4),
                    confidence=round(rng.uniform(0.85, 0.99), 3),
                    team_side=side,
                )
            )
    db.add_all(samples)
    db.commit()


def _write_events(db: Session, round_: models.Round,
                  attackers: list[models.Player],
                  defenders: list[models.Player],
                  rng: random.Random) -> None:
    """Synthetic event detection (Master Plan §13)."""

    def ev(type_, t, label, player=None, x=None, y=None, conf=0.9):
        return models.Event(
            round_id=round_.id,
            type=type_,
            t_seconds=float(t),
            label=label,
            player_id=player.id if player else None,
            x=x,
            y=y,
            confidence=conf,
        )

    def pick(roster):
        return rng.choice(roster) if roster else None

    events = [
        ev(
            models.EventType.MID_CONTROL,
            rng.randint(6, 16),
            "Mid control",
            pick(attackers),
            rng.uniform(0.4, 0.6),
            rng.uniform(0.4, 0.6),
        ),
        ev(
            models.EventType.FIRST_BLOOD,
            rng.randint(20, 38),
            "First blood",
            pick(attackers),
            rng.uniform(0.15, 0.45),
            rng.uniform(0.3, 0.6),
        ),
        ev(
            models.EventType.EXECUTE,
            rng.randint(40, 60),
            "A execute",
            pick(attackers),
        ),
    ]
    if round_.winner_side == "team_a" or rng.random() < 0.7:
        events.append(
            ev(
                models.EventType.PLANT,
                rng.randint(50, 75),
                "Spike planted — A Site",
                pick(attackers),
                rng.uniform(0.26, 0.48),
                rng.uniform(0.3, 0.52),
            )
        )
    if round_.winner_side == "team_b":
        events.append(
            ev(
                models.EventType.DEFUSE,
                rng.randint(85, 115),
                "Spike defused",
                pick(defenders),
            )
        )
    db.add_all(events)
    db.commit()
