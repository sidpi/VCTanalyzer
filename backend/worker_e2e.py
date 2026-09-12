"""Live worker e2e with a REAL video file (safe to delete).

Generates a ~2min clip with 3 visible rounds (12s scenes separated by 45s
black gaps), uploads it, and verifies the job completes with real round
boundaries from ffmpeg scene detection.

Run against a live server:
  alembic upgrade head && uvicorn app.main:app --port 8017
  python worker_e2e.py
"""

import io
import subprocess
import sys
import time
from pathlib import Path

import httpx

sys.path.insert(0, str(Path(__file__).parent))
from app import media  # noqa: E402

BASE = "http://localhost:8017"
FFMPEG = media._ffmpeg_exe()
assert FFMPEG, "no ffmpeg available"

tmp = Path(__file__).parent / "_e2e_tmp"
tmp.mkdir(exist_ok=True)
clip = tmp / "rounds.mp4"

if not clip.exists():
    inputs = []
    for i in range(3):
        inputs += ["-f", "lavfi", "-i", f"color=c={i and 'gray' or 'green'}:size=320x180:rate=5:duration=12"]
        inputs += ["-f", "lavfi", "-i", "color=c=black:size=320x180:rate=5:duration=45"]
    subprocess.run(
        [FFMPEG, "-v", "error", "-y", *inputs,
         "-filter_complex", "concat=n=6:v=1:a=0[out]",
         "-map", "[out]", "-pix_fmt", "yuv420p", str(clip)],
        check=True, capture_output=True,
    )
print("clip:", clip.stat().st_size, "bytes")

c = httpx.Client(base_url=BASE, timeout=60)

r = c.post(
    "/auth/register",
    json={
        "email": "worker@demo.gg",
        "password": "password123",
        "display_name": "Demo",
        "organization_name": "WorkerOrg",
    },
)
assert r.status_code == 201, r.text
token = r.json()["access_token"]
H = {"Authorization": f"Bearer {token}"}

ta = c.post("/teams", json={"name": "W Team A"}, headers=H).json()
tb = c.post("/teams", json={"name": "W Team B"}, headers=H).json()
# Add rosters so positions/events get written
for team in (ta, tb):
    for i in range(5):
        r = c.post(
            f"/teams/{team['id']}/players",
            json={"name": f"{team['name']} P{i}", "agent": "Jett", "role": "duelist"},
            headers=H,
        )
        assert r.status_code == 201, r.text

m = c.post(
    "/matches",
    json={"team_a_id": ta["id"], "team_b_id": tb["id"], "map": "Ascent", "type": "scrim", "played_at": "", "notes": ""},
    headers=H,
).json()

with clip.open("rb") as fh:
    r = c.post(
        "/vods/upload",
        params={"match_id": m["id"]},
        files={"file": ("rounds.mp4", fh, "video/mp4")},
        headers=H,
    )
assert r.status_code == 201, r.text
job_id = r.json()["id"]
print("job:", job_id)

# Poll until done (inline thread fallback should finish quickly)
for _ in range(60):
    job = c.get(f"/analysis/jobs/{job_id}", headers=H).json()
    if job["status"] in ("COMPLETED", "FAILED"):
        break
    time.sleep(1)
assert job["status"] == "COMPLETED", job
print("job completed:", job["progress"], "%, frames:", job["total_frames"])

rounds = c.get(f"/matches/{m['id']}/rounds", headers=H).json()
assert len(rounds) == 3, f"expected 3 real rounds, got {len(rounds)}"
starts = [r0["vod_start_seconds"] for r0 in rounds]
print("round starts:", starts)
# Real boundaries should be ~57 and ~114 (12+45), first at 0-12
assert starts[0] < 20, starts
gaps = [b - a for a, b in zip(starts, starts[1:])]
assert all(g >= 40 for g in gaps), gaps
durations = [r0["duration_seconds"] for r0 in rounds]
print("durations:", durations)
assert all(10 <= d <= 160 for d in durations)

match = c.get(f"/matches/{m['id']}", headers=H).json()
print("map:", match["map"], "| vod:", match["vod"]["source"], match["vod"]["duration_seconds"])
assert match["vod"]["duration_seconds"] is not None

# Positions/events written for rosters
r1 = rounds[0]["id"]
pos = c.get(f"/rounds/{r1}/positions", headers=H).json()
ev = c.get(f"/rounds/{r1}/events", headers=H).json()
print("round 1 positions:", len(pos), "events:", len(ev))
assert len(pos) > 0 and len(ev) > 0

print("WORKER_E2E_OK")
