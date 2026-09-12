# VCTanalyzer — Build Plan & Status

> **Single source of truth** for what's built, what's in progress, and what's next.
> This file consolidates the former *Master Software Development Plan* and
> *Website Design & Product Plan* documents.
> Last updated: 2026-09-12

---

## 1. Product in one paragraph

VCTanalyzer turns Valorant VODs into structured tactical intelligence. Users paste a
Twitch/YouTube URL or upload a file; the platform auto-fills match metadata and rosters
from vlr.gg, then a background worker processes the video (round detection, player
tracking, event detection) into a common data model. The tactical viewer synchronizes
that data with the VOD; the analytics layer derives heatmaps, movement stats, and
rule-based patterns — every claim carrying an evidence chain:

```text
Insight → Statistics → Pattern → Rounds → Events → Positions → VOD timestamp
```

**Guiding rule: data-first, not UI-first.** Reliable data → reliable analysis →
useful analytics → good visualization → AI.

---

## 2. Current status

### ✅ Phase 0 — Product foundation (COMPLETE)

- Next.js 15 + React 19 + TypeScript + Tailwind v4 app with a custom design system
- Full route map: landing, auth, dashboard, teams, matches, processing, round viewer,
  analytics (heatmaps/movement/patterns), players, reports, admin, settings
- Design system components (`ui.tsx`): cards, badges, tabs, stat cards, progress bars,
  form fields, empty states

### ✅ Phase 1 — VOD management (COMPLETE)

- **Backend**: FastAPI + SQLAlchemy + PostgreSQL + Celery/Redis, Alembic migrations
- **Common data model**: organizations → teams → players → matches → rounds →
  events/positions, plus vods and analysis_jobs (Master Plan §14–16)
- **Auth**: JWT register/login, password hashing (§49)
- **Org scoping (§51)**: every team/match/job row belongs to an organization; lists
  filter by org, details 403 cross-org, admins bypass
- **Upload**: drag & drop up to 20 GB with XHR progress; stored on disk (S3/R2 later)
- **Job machine (§48)**: full stage pipeline with cancel/retry and inline dev fallback
  when Redis is unreachable
- **Frontend live-API pages**: register/login, dashboard, matches, match overview,
  processing screen, teams, teams/new, team detail

### ✅ Phase 2 (step 1) — First real CV (COMPLETE)

- `app/media.py`: real **ffmpeg scene-cut detection** → round boundaries with
  burst-suppression and inter-round gap heuristics
- **Map classification**: mean-frame color vs. seeded signatures
  (`map_signatures.json` — placeholders awaiting real reference palettes)
- **VOD duration probing** via ffprobe (with `ffmpeg -i` fallback)
- **Worker e2e verified** (`worker_e2e.py`): synthetic 3-round clip → real boundaries
- Positions/events still **synthetic** (deterministic simulator) — tracking lands next

### ✅ Ingestion & integrations (COMPLETE)

- **Twitch import**: VOD/clip URL resolve (Helix when configured, embed always) and
  playback in the round theater (SDK-synced)
- **YouTube import**: credential-free oEmbed resolution, `youtube-nocookie` embed
  driven by the IFrame API, optional `YOUTUBE_API_KEY` for exact duration
- **Smart URL paste**: one field auto-detects Twitch vs YouTube and resolves
- **Worker downloads**: yt-dlp downloads imported VODs (Twitch + YouTube) so scene-cut
  analysis runs on real frames; graceful degradation otherwise
- **vlr.gg (self-hosted vlrgg-scraper proxy)**:
  - Match auto-fill — teams, map, date, score, VOD links (idempotent on `vlr_match_id`)
  - **Team + roster enrichment** — region plus every player's alias, real name, and role
  - `POST /teams/import-vlr` — import any team + full roster standalone
  - `/teams/vlr` — regional rankings browser with one-click import
  - Provenance columns: `teams.vlr_team_id`, `players.vlr_player_id`,
    `players.real_name`, `players.country`
- **vlr.gg data in the UI**: team pages show region + VLR badge; rosters show
  alias, real name, country, role; add-player form has identity fields

### ✅ Analytics & viewer (COMPLETE for MVP)

- **Tactical viewer**: layered map (players, trails, kills, spike, heatmap, areas),
  VOD ⇄ map synchronization (§23), event jump-to, overlay compare mode, keyboard
  transport, user-correctable round-start offsets (§44 spirit)
- **VOD theater**: uploaded file streaming (Range-capable, token in query) and
  embedded Twitch/YouTube playback, all driving the same clock
- **Heatmaps**: presence / kills / deaths / first blood from real positions + events
- **Movement stats**: area time, entry routes, first-contact timing — org-wide and
  **per-player** (`/players/[playerId]` is fully live)
- **Patterns**: rule-based mining (§29 Stage 1) — MID PRESSURE → A EXECUTE,
  FAST B EXECUTE, RETAKE → DEFUSE — with frequency, confidence, timing, matches
- **Dashboard + analytics pages**: all computed from live API data

### 🎭 Still on mock data (by design)

- Landing-page demo (deterministic showcase dataset)
- Reports pages (Phase 8 target)

---

## 3. Roadmap

### 🔜 Next up

| # | Item | Plan ref |
| --- | --- | --- |
| 1 | **Player tracking** — ByteTrack/Kalman on minimap detections; replaces synthetic positions | §9 |
| 2 | **Minimap detection** — locate + crop the minimap, detect player icons | §8 |
| 3 | Server-side position aggregation (client currently loads org dataset) | §47 |
| 4 | Coordinate normalization per map → callouts ("A Main") on live data | §10–11 |

### Phase 3–5 (mid-term)

- Event detection from real video: kills, plants, first blood (§13)
- Round winner/side detection from HUD/OCR (§12)
- Signed VOD URLs via S3/R2 (§40, §49)
- Real map-signature palettes to make map classification production-grade
- Confidence display everywhere (§31)

### Phase 6–7 (team intelligence)

- Team intelligence pages from accumulated history (§24–26)
- Statistical pattern detection → supervised classification (§29 Stage 2–3, §30)
- Strategy classification: default / rush / execute / split / fake (§29)

### Phase 8–9 (AI & learning)

- **AI Analyst**: natural-language questions over the structured data (§34)
- Evidence-linked answers with "view supporting rounds" (§35, §58)
- Scouting reports + team reviews (§36)
- Annotation tool: human corrections feed the training set (§45–46)
- Model versioning + periodic retraining (§33, §53)

---

## 4. MVP success criteria (§56)

The MVP is successful when a user can:

1. ✅ Upload a VOD
2. ✅ Create a match
3. ✅ Wait for processing
4. ✅ Open a round
5. ✅ See the correct map
6. ⬜ See players in approximately correct locations *(awaits real tracking)*
7. ✅ Play the round timeline
8. ✅ See movement trails *(synthetic data; real data pending)*
9. ✅ See basic kills/deaths *(synthetic data; real data pending)*
10. ✅ Generate heatmaps

**Accuracy is measured, not assumed** — the worker e2e (`worker_e2e.py`) checks real
round-boundary detection against a generated clip.

---

## 5. Development rule (§60)

> A beautiful dashboard with inaccurate player positions is useless.
> A simple tactical viewer with highly accurate underlying data is the
> foundation of a serious esports-analysis product.

Priorities in order: **Reliable Data → Reliable Analysis → Useful Analytics →
Good Visualization → AI.**
