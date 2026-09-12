<div align="center">

# 🎯 VCTanalyzer

**Valorant Esports VOD Analysis & Tactical Intelligence Platform**

Turn raw VOD footage into structured tactical data — player movement, round timelines,
heatmaps, patterns, and evidence-linked scouting intelligence.

`Next.js 16` · `React 19` · `TypeScript` · `Tailwind CSS v4` · `FastAPI` · `PostgreSQL` · `Celery/Redis` · `FFmpeg` · `yt-dlp`

</div>

---

## ✨ What it does

Paste a Twitch or YouTube VOD — or upload a file — and VCTanalyzer:

1. **Creates the match** — teams, map, date auto-filled from [vlr.gg](https://www.vlr.gg) (or enter manually)
2. **Imports the roster** — team profiles pulled from vlr.gg with every player's alias, real name, role, and country
3. **Processes the video** — a background worker walks the analysis pipeline: preprocessing → round detection → player tracking → event detection → analytics
4. **Builds the evidence base** — rounds, events, and positions land in the common data model with VOD sync offsets
5. **Visualizes everything** — tactical map viewer synced to the VOD, heatmaps, movement stats, and rule-based pattern mining

> **Data-first, not UI-first** (the guiding rule): every analytical claim traces back through
> patterns → rounds → events → positions → VOD timestamp.

## 🧭 Feature map

| Area | Highlights |
| --- | --- |
| 🎬 **VOD ingestion** | Manual upload (up to 20 GB, XHR progress) · Twitch VOD/clip import · YouTube import · **smart URL paste** with platform auto-detect · vlr.gg auto-fill |
| 🗺️ **Tactical viewer** | Layered map (players, trails, kills, spike, heatmap, areas) · VOD-synchronized playback · event jump-to · user-correctable round offsets |
| 📊 **Analytics** | Presence / kill / death / first-blood heatmaps · area time & entry routes · per-player movement profiles · team win rates |
| 🧠 **Patterns** | Rule-based mining (Master Plan §29 Stage 1) with frequency, confidence, timing, and evidence counts |
| 🌍 **vlr.gg integration** | Match auto-fill · regional rankings browser · **one-click team + roster import** with provenance |
| 👥 **Teams & players** | Org-scoped teams/rosters · player tendency pages · live dashboard |
| 🔐 **Multi-tenant** | Organizations, org-scoped API, JWT auth (§49/§51) |
| ⚙️ **Jobs** | Full §48 stage machine, cancel/retry, inline dev fallback when Redis is down |

## 🚀 Quickstart

```bash
git clone https://github.com/sidpi/VCTanalyzer.git
cd VCTanalyzer
docker compose up --build
```

| Service | URL |
| --- | --- |
| Web app | http://localhost:3000 |
| API docs (Swagger) | http://localhost:8000/docs |
| PostgreSQL | localhost:5432 (`vct`/`vct`) |
| Redis | localhost:6379 |

Seed login: `coach@fnatic.gg` / `coachpassword` — or register your own organization.

**First analysis in 60 seconds:** register → **Add Team** (or import one from
**Teams → Browse vlr.gg teams**) → **Upload VOD** → paste a Twitch/YouTube URL or
drop a file → watch the processing pipeline → open a round in the tactical viewer.

### Local development (no Docker)

Start PostgreSQL and Redis first, then run the API and web app in separate
terminals. The web app can render without the API, but login and registration
require the API to be listening on `http://localhost:8000`.

```bash
# Backend
cd backend
python -m venv .venv && source .venv/Scripts/activate   # Windows Git Bash
pip install -r requirements.txt
cp .env.example .env
alembic upgrade head && python -m app.seed
uvicorn app.main:app --reload

# Frontend
cd ../web
npm install && npm run dev
```

If Next reports a missing file under `web/.next/server`, stop any existing
Next process, remove `web/.next`, and run `npm run dev` again. `.next` is
generated build output and is safe to recreate.

For the quickest setup, use Docker Desktop and run `docker compose up --build`
from the repository root. This starts PostgreSQL, Redis, the seeded API, and
the worker; wait for the API container to finish migrations and print that
Uvicorn is listening before opening the web app. If Docker Desktop is stopped,
the API cannot be reached and the login/register pages will show
`Cannot reach the VCTanalyzer API. Is it running?`.

See [`backend/README.md`](backend/README.md) for the full API reference.

## 🏗️ Architecture

```
 web (Next.js)          ──HTTP──▶   FastAPI (/vods/upload · /ingest/*)
     │                                    │ creates AnalysisJob (QUEUED)
     │                                    ▼
     │                              Redis queue ──▶ Celery worker
     │                                                │  §48 stage machine
     │                                                │  ffmpeg scene-cut round detection
     │                                                │  yt-dlp VOD download (Twitch/YouTube)
     │                                                │  map classification + tracking
     │                                                ▼
     └── tactical viewer ◀── rounds/events/positions ── PostgreSQL
         (VOD ⇄ map sync)
```

**External integrations** (all optional, clean 503 + setup hints when unset):

| Integration | Env vars | What it provides |
| --- | --- | --- |
| Twitch Helix | `TWITCH_CLIENT_ID` / `TWITCH_CLIENT_SECRET` | VOD/clip metadata; playback works without it |
| YouTube | `YOUTUBE_API_KEY` *(optional)* | oEmbed resolution is credential-free; key adds exact duration |
| vlrgg-scraper | `VLR_BASE_URL` | Match auto-fill, rankings, team/roster imports |
| yt-dlp + ffmpeg | *(installed in the worker image)* | Real frame analysis of imported VODs |

## 📁 Repository layout

```
├── web/          Next.js 16 app (App Router) — viewer, analytics, team management
├── backend/      FastAPI + SQLAlchemy + Celery — API, worker, migrations
│   ├── app/routers/    auth · catalog · vods · ingest · analytics
│   ├── app/tasks.py    analysis pipeline (§48 stage machine)
│   ├── app/media.py    ffmpeg/yt-dlp integrations
│   └── alembic/        schema migrations
├── docker-compose.yml
└── plan.md       build status & roadmap (single source of truth)
```

## 🗺️ Documentation

- **[`plan.md`](plan.md)** — what's built, what's next, and the phased roadmap
- **[`backend/README.md`](backend/README.md)** — API endpoints, env vars, architecture notes

## 📜 License

MIT — see [LICENSE](LICENSE).
