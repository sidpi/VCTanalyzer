# VCTanalyzer Backend — Phase 1 Foundation

FastAPI + PostgreSQL + Celery/Redis backend implementing the data-first
foundation from the Master Plan (§37–41, §48, §54 Phase 1).

The CV pipeline (Phase 2+) will replace the worker's synthetic detections;
everything else — jobs, stage machine, common data model, API — is already
the real structure.

## Architecture

```
web (Next.js)  ──HTTP──▶  FastAPI (/vods/upload)
                              │ creates AnalysisJob (QUEUED)
                              ▼
                          Redis queue ──▶ Celery worker
                                             │ advances §48 stages
                                             │ writes Rounds/Events/Positions
                                             ▼
                                        PostgreSQL
```

- Uploads are stored on disk (`STORAGE_DIR`) now; S3/R2 later (§40).
- The worker simulates preprocessing → round detection → player tracking →
  event detection → analytics, writing **real rows** into the common data
  model (`matches → rounds → events/positions`) with VOD start offsets for
  sync (§23).
- If Redis/worker is unreachable, jobs run inline so dev never blocks.
- **Organization scoping (§51)**: every team/match/job row belongs to an
  organization; list endpoints filter by org, detail endpoints 403 on
  cross-org access, admins bypass. Matches require both teams in the
  caller's org.
- **Migrations (Alembic)**: the schema is owned by `backend/alembic` —
  never `create_all`. Generate revisions with autogenerate and review them.

## Migrations

```bash
cd backend
# DATABASE_URL comes from env / .env (alembic/env.py reads app settings)
alembic upgrade head                       # apply
alembic revision --autogenerate -m "..."   # new revision after model changes
alembic downgrade -1                       # roll back one step
```

## Run (Docker, recommended)

```bash
docker compose up --build
# API      → http://localhost:8000  (docs at /docs)
# Postgres → localhost:5432 (vct/vct)
# Redis    → localhost:6379
```

Seed data is created on boot: `coach@fnatic.gg / coachpassword`,
teams FNATIC + G2 with rosters, and a match ready for upload.

## Run (local Python)

```bash
cd backend
python -m venv .venv && source .venv/bin/activate   # Windows: .venv/Scripts/activate
pip install -r requirements.txt
cp .env.example .env   # adjust DATABASE_URL/REDIS_URL if needed
alembic upgrade head
python -m app.seed
uvicorn app.main:app --reload
# optional queue worker:
celery -A app.tasks.celery_app worker --loglevel=info --pool=solo
```

Python 3.14 note: if a pinned dependency fails to build locally, use the
Docker flow (Python 3.12) or bump pins in `requirements.txt`.

## API overview

| Method | Path | Purpose |
| --- | --- | --- |
| POST | `/auth/register` `/auth/login` | JWT auth |
| GET | `/users/me` | Current user |
| POST/GET | `/teams`, `/teams/{id}/players` | Team + roster management |
| POST | `/teams/import-vlr` | Import a team + full roster from vlr.gg (idempotent on `vlr_team_id`) |
| POST | `/teams/{id}/players/import-vlr` | Import a single VLR player onto a roster |
| GET | `/ingest/vlr/rankings` `/ingest/vlr/team/{id}` `/ingest/vlr/player/{id}` | VLR rankings + team/player profiles (proxied) |
| POST/GET | `/matches`, `/matches/{id}` | Match creation/read |
| POST | `/vods/upload?match_id=…` | Upload VOD → creates job |
| GET | `/vods/{id}/file?token=…` | Stream stored VOD (Range-capable `<video>` playback; JWT as query param) |
| POST | `/vods/{id}/source` | Attach an external playback source (Twitch) to a VOD |
| GET | `/analysis/jobs/{id}` `/matches/{id}/jobs` | Job status (§48 states) |
| POST | `/analysis/jobs/{id}/cancel` `/retry` | Job control |
| GET | `/matches/{id}/rounds`, `/rounds/{id}/events`, `/rounds/{id}/positions` | Structured results for the tactical viewer |
| POST | `/ingest/twitch/resolve` | Resolve a Twitch VOD/clip URL → embed URL + metadata |
| POST | `/ingest/twitch/import` | Attach a Twitch VOD to a match → analysis job |
| POST | `/ingest/youtube/resolve` | Resolve a YouTube video URL → embed URL + metadata |
| POST | `/ingest/youtube/import` | Attach a YouTube VOD to a match → analysis job |
| GET | `/ingest/vlr/search` `/ingest/vlr/matches[/{id}]` | vlrgg-scraper proxy (teams, matches, details) |
| POST | `/ingest/vlr/autofill` | Create/update a match + teams from a VLR match (idempotent) |

### External ingest (Twitch + vlr.gg)

Both integrations are **optional** — endpoints return a clean `503` with a
setup hint when unconfigured, and manual upload remains fully functional.

- **Twitch** (`TWITCH_CLIENT_ID` / `TWITCH_CLIENT_SECRET`): Helix app-token
  auth (cached until expiry). Without credentials, plain
  `twitch.tv/videos/{id}` and clip URLs still resolve to embed URLs — only
  title/channel/duration metadata needs the client id. VODs are *not*
  downloaded; they play via the embedded player in the round viewer and the
  match keeps `vods.source = "twitch"`.
- **YouTube** (`YOUTUBE_API_KEY`, optional): resolves
  `youtube.com/watch?v=…`, `youtu.be/…`, and Shorts/live URLs
  credential-free via oEmbed; the key (Data API v3) adds exact duration.
  Playback uses the privacy-enhanced `youtube-nocookie` embed, synced to the
  tactical map through the IFrame API. When `download_twitch_vods` is on and
  yt-dlp can fetch the video, the worker downloads it and runs real
  scene-cut analysis — same as Twitch imports.
- **vlr.gg** (`VLR_BASE_URL`, e.g. `http://localhost:8100`): proxies a
  self-hosted [vlrgg-scraper](https://github.com/akhilnarang/vlrgg-scraper)
  (`uv run fastapi dev` → `/api/v1/...`). `POST /ingest/vlr/autofill` reads
  the scraper's match detail — team names, scores, event/stage/date, first
  played map, and official VOD links — then upserts the teams and match into
  your organization (keyed by `matches.vlr_match_id`, so re-running updates
  instead of duplicating). Both teams are enriched from their VLR team
  profiles: region plus the full roster with each player's alias, real
  name, and role. `POST /teams/import-vlr` imports any team + roster
  standalone (search via `/ingest/vlr/search`, browse via
  `/ingest/vlr/rankings`); imported players keep `vlr_player_id` and
  teams keep `vlr_team_id` provenance.

```bash
# enable the integrations
TWITCH_CLIENT_ID=... TWITCH_CLIENT_SECRET=...   # Helix metadata
YOUTUBE_API_KEY=...                             # optional: exact duration
VLR_BASE_URL=http://localhost:8100              # vlrgg-scraper service
```

Interactive docs: `http://localhost:8000/docs`.

## Frontend integration

The web upload + match flow is now **wired to this API** (`web/src/lib/api.ts`):

- `/login` and `/register` call `/auth/login` and `/auth/register` (JWT in
  localStorage; `httpOnly` cookies can replace this later).
- `/teams`, `/teams/new`, and `/teams/[teamId]` are wired to `/teams` +
  `/teams/{id}/players`: create teams, add/remove roster players (agent +
  role), and see per-team matches/rounds/win-rate and mined patterns.
- `/matches/new` fetches `/teams`, creates the match, and uploads the VOD via
  XHR with real per-file progress, then routes to the processing page.
- `/matches`, `/matches/[id]`, `/matches/[id]/rounds/[n]`, and the processing
  page read matches, rounds (with embedded events), positions, and jobs —
  all org-scoped server-side.
- The tactical viewer and VOD theater consume live `positions` and `events`
  payloads (mapped in `web/src/lib/api.ts`) with the deterministic mock
  dataset kept for demo pages.
- The round theater plays the match's real VOD: uploaded files stream from
  `/vods/{id}/file?token=…`; Twitch VODs/clips play through the embedded
  player (SDK-synced with a synthetic-clock fallback). `/matches/new` offers
  Twitch import and vlr.gg auto-fill alongside manual upload.

Set `NEXT_PUBLIC_API_BASE` (see `web/.env.example`) if the API isn't on
`http://localhost:8000`. Quickstart: `docker compose up` → open
`http://localhost:3000` → register → create two teams → upload a VOD.

The dashboard and analytics pages also consume the live API, including
`GET /analytics/patterns` — rule-based pattern mining over the org's
analyzed rounds (Master Plan §28–29 Stage 1), returning frequency,
confidence, timing, and evidence counts.
