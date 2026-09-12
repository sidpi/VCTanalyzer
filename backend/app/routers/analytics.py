"""Analytics endpoints (Master Plan §18, §28-29, §41).

Pattern detection is deliberately rule-based for now (§29 Stage 1):
sequences of mid_control → execute → plant/defuse mined from real event
rows, with frequency, confidence, timing, and evidence counts — the same
evidence chain the frontend must display (§31, §58).
"""

from fastapi import APIRouter, Depends
from sqlalchemy import func
from sqlalchemy.orm import Session

from .. import models
from ..db import get_db
from ..security import get_current_user

router = APIRouter(prefix="/analytics", tags=["analytics"])


def _org_ids(db: Session, user: models.User) -> list[str] | None:
    """Organization ids the user can read. None means no filter (admin)."""
    if user.is_admin:
        return None
    if not user.organization_id:
        return []
    return [user.organization_id]


@router.get("/patterns")
def get_patterns(
    user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Mine attack/defense patterns from completed matches in the caller's
    organization (admin sees all orgs)."""
    org_ids = _org_ids(db, user)
    if org_ids == []:
        return []

    q = db.query(models.Match)
    if org_ids is not None:
        q = q.filter(models.Match.organization_id.in_(org_ids))
    # Only analyzed matches contribute (score written on completion).
    matches = q.filter(models.Match.score_a > 0).all()
    match_ids = [m.id for m in matches]
    if not match_ids:
        return []

    rounds = (
        db.query(models.Round)
        .filter(models.Round.match_id.in_(match_ids))
        .all()
    )
    round_ids = [r.id for r in rounds]
    events = (
        db.query(models.Event)
        .filter(models.Event.round_id.in_(round_ids))
        .all()
    )
    events_by_round: dict[str, list[models.Event]] = {}
    for e in events:
        events_by_round.setdefault(e.round_id, []).append(e)

    map_by_match = {m.id: m.map for m in matches}

    # --- Rule: MID PRESSURE → A EXECUTE -------------------------------
    mid_execute_rounds: list[models.Round] = []
    mid_execute_timings: list[float] = []
    for r in rounds:
        evs = sorted(events_by_round.get(r.id, []), key=lambda e: e.t_seconds)
        has_mid = any(e.type == models.EventType.MID_CONTROL for e in evs)
        has_exec = any(
            e.type == models.EventType.EXECUTE
            and e.label
            and "a" in e.label.lower()
            for e in evs
        )
        if has_mid and has_exec:
            mid_execute_rounds.append(r)
            exec_t = next(
                (e.t_seconds for e in evs if e.type == models.EventType.EXECUTE),
                None,
            )
            if exec_t is not None:
                mid_execute_timings.append(exec_t)

    patterns: list[dict] = []

    def fmt_time(seconds: float) -> str:
        m = int(seconds // 60)
        s = int(seconds % 60)
        return f"{m:02d}:{s:02d}"

    def map_name(map_id: str) -> str:
        return map_by_match.get(
            next((r.match_id for r in mid_execute_rounds), ""), map_id
        )

    if mid_execute_rounds:
        # Scope the map label to the most common map among evidence rounds.
        map_counts: dict[str, int] = {}
        for r in mid_execute_rounds:
            mid = map_by_match.get(r.match_id, "?")
            map_counts[mid] = map_counts.get(mid, 0) + 1
        top_map = max(map_counts, key=map_counts.get) if map_counts else "ascent"

        attack_share = sum(
            1 for r in mid_execute_rounds if r.side == "attack"
        )
        side = "attack" if attack_share >= len(mid_execute_rounds) / 2 else "defense"
        avg_exec = (
            sum(mid_execute_timings) / len(mid_execute_timings)
            if mid_execute_timings
            else 0.0
        )
        patterns.append(
            {
                "id": "mid-pressure-a-execute",
                "name": "MID PRESSURE → A EXECUTE",
                "steps": ["Mid control", "A execute"],
                "teamId": rounds[0].match_id,  # evidence anchor, not a team id
                "map": top_map,
                "side": side,
                "frequency": len(mid_execute_rounds),
                "totalRounds": len(rounds),
                "confidence": round(
                    min(0.95, 0.5 + 0.5 * len(mid_execute_rounds) / max(1, len(rounds))),
                    2,
                ),
                "avgTiming": fmt_time(avg_exec),
                "matches": len({r.match_id for r in mid_execute_rounds}),
            }
        )

    # --- Rule: FAST B EXECUTE (plant ≤ 45s) ----------------------------
    fast_b = [
        r
        for r in rounds
        if any(
            e.type == models.EventType.PLANT
            and e.t_seconds <= 45
            and e.label
            and "b" in e.label.lower()
            for e in events_by_round.get(r.id, [])
        )
    ]
    if fast_b:
        map_counts = {}
        for r in fast_b:
            mid = map_by_match.get(r.match_id, "?")
            map_counts[mid] = map_counts.get(mid, 0) + 1
        top_map = max(map_counts, key=map_counts.get) if map_counts else "ascent"
        patterns.append(
            {
                "id": "fast-b-execute",
                "name": "FAST B EXECUTE",
                "steps": ["B entry", "Fast plant"],
                "teamId": rounds[0].match_id,
                "map": top_map,
                "side": "attack",
                "frequency": len(fast_b),
                "totalRounds": len(rounds),
                "confidence": round(
                    min(0.95, 0.5 + 0.5 * len(fast_b) / max(1, len(rounds))), 2
                ),
                "avgTiming": fmt_time(
                    sum(
                        e.t_seconds
                        for r in fast_b
                        for e in events_by_round.get(r.id, [])
                        if e.type == models.EventType.PLANT
                    )
                    / max(1, sum(1 for r in fast_b for e in events_by_round.get(r.id, []) if e.type == models.EventType.PLANT))
                ),
                "matches": len({r.match_id for r in fast_b}),
            }
        )

    # --- Rule: RETAKE VIA DEFUSE (late defuse = retake success) --------
    retakes = [
        r
        for r in rounds
        if r.winner_side == "team_b"
        and any(e.type == models.EventType.DEFUSE for e in events_by_round.get(r.id, []))
    ]
    if retakes:
        patterns.append(
            {
                "id": "retake-success",
                "name": "RETAKE → DEFUSE SUCCESS",
                "steps": ["Site lost", "Retake", "Defuse"],
                "teamId": rounds[0].match_id,
                "map": map_name("ascent"),
                "side": "defense",
                "frequency": len(retakes),
                "totalRounds": len(rounds),
                "confidence": round(
                    min(0.95, 0.5 + 0.5 * len(retakes) / max(1, len(rounds))), 2
                ),
                "avgTiming": fmt_time(
                    sum(
                        e.t_seconds
                        for r in retakes
                        for e in events_by_round.get(r.id, [])
                        if e.type == models.EventType.DEFUSE
                    )
                    / max(1, sum(1 for r in retakes for e in events_by_round.get(r.id, []) if e.type == models.EventType.DEFUSE))
                ),
                "matches": len({r.match_id for r in retakes}),
            }
        )

    return patterns
