"use client";

import React, {
  useEffect,
  useMemo,
  useImperativeHandle,
  useRef,
  useState,
  type RefObject,
} from "react";
import {
  areaForPosition,
  getMap,
  type PlayerTrack,
  type Round,
  type RoundEvent,
  type TeamSide,
} from "@/lib/types";
import { getHeatPoints, getTracks, type HeatPoint } from "@/lib/mockData";
import { formatTime } from "@/lib/format";

/* ------------------------------------------------------------------ */
/* Tactical Map Viewer (Website Plan §18, §31; Master Plan §22)        */
/* Layered architecture — each layer independently toggleable.         */
/* ------------------------------------------------------------------ */

type LayerKey = "players" | "trails" | "kills" | "spike" | "heatmap" | "areas";

const LAYER_LABELS: Record<LayerKey, string> = {
  players: "Players",
  trails: "Movement",
  kills: "Kills",
  spike: "Spike",
  heatmap: "Heatmap",
  areas: "Areas",
};

const EVENT_COLORS: Record<string, string> = {
  kill: "#f45b69",
  first_blood: "#ff4655",
  plant: "#f5b657",
  defuse: "#4cc2ff",
  mid_control: "#9aa5b1",
  execute: "#ff4655",
  retake: "#4cc2ff",
  rotation: "#9aa5b1",
};

export { EVENT_COLORS };

/** Imperative handle for parents (e.g. RoundTheater) that must drive playback. */
export interface TacticalMapHandle {
  seek: (t: number) => void;
  pause: () => void;
  getDuration: () => number;
}

/**
 * Shared fallback ref. Prefer passing your own `ref` prop when embedding the
 * viewer in a parent that drives playback (e.g. RoundTheater).
 */
export const SharedTacticalMapRef: RefObject<TacticalMapHandle | null> =
  React.createRef<TacticalMapHandle>();

export function TacticalMapViewer({
  matchId,
  roundNumber,
  height = 520,
  interactive = true,
  focusEventId,
  heatmapKind = "presence",
  heatmapSide = "all",
  ref,
  externalTime = null,
  onSeekRequest,
  onScrubStartRequest,
  liveTracks = null,
  liveEvents = null,
  liveDuration = null,
  liveWinnerSide = null,
  liveSide = null,
  mapId = "ascent",
}: {
  matchId: string;
  roundNumber: number;
  height?: number;
  interactive?: boolean;
  focusEventId?: string | null;
  heatmapKind?: "presence" | "kills" | "deaths";
  heatmapSide?: "attack" | "defense" | "all";
  /** Ref-based imperative API. Falls back to the module-level shared ref. */
  ref?: RefObject<TacticalMapHandle | null>;
  /** Controlled mode: parent (e.g. RoundTheater) supplies the clock. */
  externalTime?: number | null;
  /** Controlled mode: timeline seeks are forwarded to the parent. */
  onSeekRequest?: (t: number) => void;
  /** Controlled mode: parent should pause its source when scrubbing starts. */
  onScrubStartRequest?: () => void;
  /** Live data mode: real tracks/events/duration from the API. When null,
   * the deterministic mock dataset is used (demo pages). */
  liveTracks?: PlayerTrack[] | null;
  liveEvents?: RoundEvent[] | null;
  liveDuration?: number | null;
  liveWinnerSide?: TeamSide | null;
  liveSide?: "attack" | "defense" | null;
  mapId?: string;
}) {
  const controlled = externalTime !== null;
  const [internalTime, setInternalTime] = useState(0);
  const time = controlled ? externalTime : internalTime;
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [scrubbing, setScrubbing] = useState(false);
  const [layers, setLayers] = useState<Record<LayerKey, boolean>>({
    players: true,
    trails: true,
    kills: true,
    spike: true,
    heatmap: false,
    areas: true,
  });
  const [showTeamA, setShowTeamA] = useState(true);
  const [showTeamB, setShowTeamB] = useState(true);

  // Mock round info (demo mode). Always called; ignored in live mode.
  const mockRound = useRoundInfo(matchId, roundNumber);

  const tracks = useMemo(
    () => liveTracks ?? getTracks(matchId, roundNumber),
    [liveTracks, matchId, roundNumber],
  );
  const events = liveEvents ?? mockRound?.events ?? [];
  const maxT = liveDuration ?? mockRound?.duration ?? 100;
  const overlayRound =
    liveWinnerSide && liveSide
      ? { winnerSide: liveWinnerSide, side: liveSide }
      : mockRound;

  const heat = useMemo(
    () => getHeatPoints(mapId, heatmapSide, heatmapKind),
    [mapId, heatmapSide, heatmapKind],
  );

  // Playback loop — stops at the end of the round instead of looping, so a
  // replay feels like video playback. Space toggles, arrows step frames.
  useEffect(() => {
    if (!playing || controlled) return;
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = ((now - last) / 1000) * speed;
      last = now;
      setInternalTime((t) => {
        const next = t + dt;
        if (next >= maxT) {
          setPlaying(false);
          return maxT;
        }
        return next;
      });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, speed, maxT, controlled]);

  // Reset playback when the round changes.
  useEffect(() => {
    setInternalTime(0);
    setPlaying(false);
  }, [matchId, roundNumber]);

  // Keyboard shortcuts: space play/pause, ←/→ ±1s, shift+←/→ ±5s, 0 restart.
  // Bound at window level because the map is SVG/HTML, not a focus target.
  useEffect(() => {
    if (!interactive || controlled) return; // theater owns shortcuts in sync mode
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable)
      ) {
        return;
      }
      if (e.code === "Space") {
        e.preventDefault();
        setPlaying((p) => !p);
      } else if (e.code === "ArrowRight" || e.code === "ArrowLeft") {
        e.preventDefault();
        const step = (e.shiftKey ? 5 : 1) * (e.code === "ArrowRight" ? 1 : -1);
        setPlaying(false);
        setInternalTime((t) => Math.max(0, Math.min(maxT, t + step)));
      } else if (e.code === "Digit0") {
        setPlaying(false);
        setInternalTime(0);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [interactive, maxT]);

  // Imperative API for parents (VOD sync).
  useImperativeHandle(
    ref ?? SharedTacticalMapRef,
    () => ({
      seek: (t: number) => {
        setPlaying(false);
        setInternalTime(Math.max(0, Math.min(maxT, t)));
      },
      pause: () => setPlaying(false),
      getDuration: () => maxT,
    }),
    [maxT],
  );

  const visibleTracks = tracks.filter((t) =>
    t.teamSide === "team_a" ? showTeamA : showTeamB,
  );

  return (
    <div className="select-none">
      <div
        className="tactical-grid relative w-full overflow-hidden rounded-md border border-line bg-surface"
        style={{ height }}
      >
        <svg
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          className="absolute inset-0 h-full w-full"
        >
          {/* Area outlines */}
          {layers.areas ? <AreaLayer mapId={mapId} /> : null}

          {/* Heatmap */}
          {layers.heatmap ? <HeatLayer points={heat} /> : null}

          {/* Movement trails up to current time */}
          {layers.trails ? (
            <TrailLayer tracks={visibleTracks} time={time} />
          ) : null}

          {/* Event markers */}
          {layers.kills ? <EventLayer events={events} time={time} focusEventId={focusEventId} /> : null}
        </svg>

        {/* Spike + player markers as HTML for crisp labels */}
        {layers.spike ? <SpikeMarker events={events} time={time} /> : null}
        {layers.players ? (
          <PlayerLayer tracks={visibleTracks} time={time} />
        ) : null}

        {/* Timestamp overlay */}
        <div className="pointer-events-none absolute left-2 top-2 rounded bg-black/60 px-2 py-0.5 font-mono text-[11px] text-text-dim">
          {formatTime(time)} / {formatTime(maxT)}
        </div>

        {/* Round result overlay */}
        {overlayRound ? (
          <div className="pointer-events-none absolute right-2 top-2 rounded bg-black/60 px-2 py-0.5 font-mono text-[11px] text-text-dim">
            {overlayRound.winnerSide === "team_a" ? "TEAM A WIN" : "TEAM B WIN"} ·{" "}
            {overlayRound.side}
          </div>
        ) : null}
      </div>

      {interactive ? (
        <>
          {/* Timeline — click to seek, drag to scrub */}
          <Timeline
            events={events}
            maxT={maxT}
            time={time}
            scrubbing={scrubbing}
            onScrubStart={() => {
              setScrubbing(true);
              setPlaying(false);
              onScrubStartRequest?.();
            }}
            onSeek={(t) =>
              controlled && onSeekRequest ? onSeekRequest(t) : setInternalTime(t)
            }
            onScrubEnd={() => setScrubbing(false)}
            focusEventId={focusEventId}
          />

          {/* Controls — transport hidden in controlled (VOD-driven) mode;
              the parent theater owns playback then. Layer/team toggles stay. */}
          <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 rounded-md border border-line bg-surface px-3 py-2.5">
            {controlled ? null : (
              <>
                <button
                  className="cursor-pointer rounded bg-surface-3 px-3 py-1 text-[13px] font-semibold hover:bg-line-2"
                  onClick={() => setPlaying(!playing)}
                >
                  {playing ? "⏸ Pause" : "▶ Play"}
                </button>

                <div className="flex items-center gap-1">
                  {[0.5, 1, 2, 4].map((s) => (
                    <button
                      key={s}
                      className={`cursor-pointer rounded px-2 py-0.5 text-[12px] font-mono ${
                        speed === s
                          ? "bg-accent-soft text-accent"
                          : "text-text-dim hover:text-text"
                      }`}
                      onClick={() => setSpeed(s)}
                    >
                      {s}x
                    </button>
                  ))}
                </div>

                <button
                  className="cursor-pointer rounded px-1.5 py-0.5 font-mono text-[12px] text-text-dim hover:text-text"
                  title="Restart (0)"
                  onClick={() => {
                    setInternalTime(0);
                    setPlaying(false);
                  }}
                >
                  ⏮
                </button>

                <span className="hidden font-mono text-[11px] text-text-faint xl:inline">
                  space play · ←/→ 1s · shift 5s
                </span>
              </>
            )}

            <div className="h-4 w-px bg-line" />

            <TeamToggle label="Team A" checked={showTeamA} onChange={setShowTeamA} />
            <TeamToggle label="Team B" checked={showTeamB} onChange={setShowTeamB} />

            <div className="h-4 w-px bg-line" />

            {(Object.keys(LAYER_LABELS) as LayerKey[]).map((k) => (
              <label
                key={k}
                className="flex cursor-pointer items-center gap-1.5 text-[12px] text-text-dim"
              >
                <input
                  type="checkbox"
                  checked={layers[k]}
                  onChange={(e) =>
                    setLayers((l) => ({ ...l, [k]: e.target.checked }))
                  }
                  className="accent-[var(--color-accent)]"
                />
                {LAYER_LABELS[k]}
              </label>
            ))}
          </div>
        </>
        ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Round info hook — reads deterministic mock rounds                   */
/* ------------------------------------------------------------------ */

import { getRounds } from "@/lib/mockData";

function useRoundInfo(matchId: string, roundNumber: number) {
  return useMemo(() => {
    const rounds = getRounds(matchId);
    return rounds.find((r) => r.number === roundNumber) ?? null;
  }, [matchId, roundNumber]);
}

/* ------------------------------------------------------------------ */
/* Layers                                                              */
/* ------------------------------------------------------------------ */

function AreaLayer({ mapId }: { mapId: string }) {
  // Normalized coordinates + registry areas render any map background.
  const map = getMap(mapId) ?? getMap("ascent");
  if (!map) return null;
  return (
    <g>
      {map.areas.map((a) => (
        <g key={a.name}>
          <rect
            x={a.x0 * 100}
            y={a.y0 * 100}
            width={(a.x1 - a.x0) * 100}
            height={(a.y1 - a.y0) * 100}
            fill="rgba(120,140,160,0.04)"
            stroke="rgba(120,140,160,0.22)"
            strokeWidth="0.15"
          />
          <text
            x={(a.x0 + 0.01) * 100}
            y={(a.y0 + 0.045) * 100}
            fontSize="1.9"
            fill="rgba(154,165,177,0.55)"
            style={{ textTransform: "uppercase", letterSpacing: "0.08em" }}
          >
            {a.name}
          </text>
        </g>
      ))}
    </g>
  );
}

function HeatLayer({ points }: { points: HeatPoint[] }) {
  return (
    <g>
      {points.map((p, i) => (
        <circle
          key={i}
          cx={p.x * 100}
          cy={p.y * 100}
          r={1.4 + p.weight * 0.7}
          fill={`rgba(255,70,85,${Math.min(0.16, 0.03 + p.weight * 0.02)})`}
          stroke="none"
        />
      ))}
    </g>
  );
}

function TrailLayer({
  tracks,
  time,
}: {
  tracks: PlayerTrack[];
  time: number;
}) {
  return (
    <g>
      {tracks.map((track) => {
        const past = track.positions.filter((p) => p.t <= time);
        if (past.length < 2) return null;
        const d = past
          .map(
            (p, i) =>
              `${i === 0 ? "M" : "L"} ${p.x * 100} ${p.y * 100}`,
          )
          .join(" ");
        const color =
          track.teamSide === "team_a"
            ? "rgba(76,194,255,0.5)"
            : "rgba(245,91,105,0.5)";
        return (
          <path
            key={track.playerId}
            d={d}
            fill="none"
            stroke={color}
            strokeWidth="0.5"
            strokeLinecap="round"
            strokeDasharray="1.4 0.9"
          />
        );
      })}
    </g>
  );
}

function EventLayer({
  events,
  time,
  focusEventId,
}: {
  events: RoundEvent[];
  time: number;
  focusEventId?: string | null;
}) {
  return (
    <g>
      {events
        .filter(
          (e) =>
            e.time <= time &&
            (e.type === "kill" || e.type === "first_blood"),
        )
        .map((e) => (
          <g key={e.id}>
            <line
              x1={e.x! * 100 - 1.2}
              y1={e.y! * 100 - 1.2}
              x2={e.x! * 100 + 1.2}
              y2={e.y! * 100 + 1.2}
              stroke={EVENT_COLORS[e.type] ?? "#f45b69"}
              strokeWidth={focusEventId === e.id ? "0.7" : "0.45"}
            />
            <line
              x1={e.x! * 100 - 1.2}
              y1={e.y! * 100 + 1.2}
              x2={e.x! * 100 + 1.2}
              y2={e.y! * 100 - 1.2}
              stroke={EVENT_COLORS[e.type] ?? "#f45b69"}
              strokeWidth={focusEventId === e.id ? "0.7" : "0.45"}
            />
          </g>
        ))}
    </g>
  );
}

function SpikeMarker({
  events,
  time,
}: {
  events: RoundEvent[];
  time: number;
}) {
  const plant = events.find(
    (e) => e.type === "plant" && e.time <= time,
  );
  if (!plant) return null;
  return (
    <div
      className="pointer-events-none absolute"
      style={{
        left: `${plant.x! * 100}%`,
        top: `${plant.y! * 100}%`,
        transform: "translate(-50%, -50%)",
      }}
    >
      <div className="flex h-5 w-5 items-center justify-center rounded-full border border-warning bg-warning/20 text-[10px] font-bold text-warning">
        ✦
      </div>
    </div>
  );
}

function PlayerLayer({
  tracks,
  time,
}: {
  tracks: PlayerTrack[];
  time: number;
}) {
  return (
    <>
      {tracks.map((track) => {
        // Position at current time (last sample before time)
        let pos = track.positions[0];
        for (const p of track.positions) {
          if (p.t <= time) pos = p;
          else break;
        }
        const label = track.playerId === "p1" ? "Jett" : agentLabel(track.agent);
        const isA = track.teamSide === "team_a";
        return (
          <div
            key={track.playerId}
            className="pointer-events-none absolute"
            style={{
              left: `${pos.x * 100}%`,
              top: `${pos.y * 100}%`,
              transform: "translate(-50%, -50%)",
            }}
          >
            <div className="flex flex-col items-center gap-0.5">
              <div
                className="h-3 w-3 rounded-full border"
                style={{
                  background: isA ? "rgba(76,194,255,0.9)" : "rgba(245,91,105,0.9)",
                  borderColor: isA ? "#4cc2ff" : "#f45b69",
                  boxShadow: "0 0 6px rgba(0,0,0,0.6)",
                }}
              />
              <span
                className="rounded bg-black/65 px-1 font-mono text-[9.5px]"
                style={{ color: isA ? "#4cc2ff" : "#f45b69" }}
              >
                {label}
              </span>
            </div>
          </div>
        );
      })}
    </>
  );
}

function agentLabel(agent: string) {
  return agent.slice(0, 6);
}

function TeamToggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-1.5 text-[12px] text-text-dim">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="accent-[var(--color-accent)]"
      />
      {label}
    </label>
  );
}

/* ------------------------------------------------------------------ */
/* Timeline with clickable events (Website Plan §19, Master Plan §23)  */
/* ------------------------------------------------------------------ */

function Timeline({
  events,
  maxT,
  time,
  onSeek,
  focusEventId,
  scrubbing = false,
  onScrubStart,
  onScrubEnd,
}: {
  events: RoundEvent[];
  maxT: number;
  time: number;
  onSeek: (t: number) => void;
  focusEventId?: string | null;
  scrubbing?: boolean;
  onScrubStart?: () => void;
  onScrubEnd?: () => void;
}) {
  const barRef = useRef<HTMLDivElement>(null);

  const seekFromClientX = (clientX: number) => {
    const el = barRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const frac = (clientX - rect.left) / rect.width;
    onSeek(Math.max(0, Math.min(maxT, frac * maxT)));
  };

  useEffect(() => {
    if (!scrubbing) return;
    const move = (e: MouseEvent) => seekFromClientX(e.clientX);
    const up = () => onScrubEnd?.();
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
    return () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
    };
    // seekFromClientX closes over onSeek/maxT, which are stable per render.
  });

  return (
    <div className="mt-3 rounded-md border border-line bg-surface px-3 py-2.5">
      <div className="flex justify-between font-mono text-[11px] text-text-faint">
        <span>00:00</span>
        <span>{formatTime(maxT)}</span>
      </div>
      <div
        ref={barRef}
        role="slider"
        aria-label="Round timeline"
        aria-valuemin={0}
        aria-valuemax={Math.round(maxT)}
        aria-valuenow={Math.round(time)}
        tabIndex={0}
        className={`group/bar relative mt-1 h-6 ${scrubbing ? "cursor-grabbing" : "cursor-pointer"}`}
        onMouseDown={(e) => {
          e.preventDefault();
          onScrubStart?.();
          seekFromClientX(e.clientX);
        }}
      >
        {/* Track */}
        <div className="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 rounded bg-surface-3" />
        {/* Progress */}
        <div
          className="absolute top-1/2 h-1 -translate-y-1/2 rounded bg-accent"
          style={{ width: `${(time / maxT) * 100}%` }}
        />
        {/* Playhead — grows on hover/drag for affordance */}
        <div
          className={`absolute top-0 w-0.5 bg-text transition-all ${
            scrubbing ? "h-7 w-[3px]" : "h-6 group-hover/bar:h-7"
          }`}
          style={{ left: `${(time / maxT) * 100}%` }}
        />
        {/* Event markers */}
        {events.map((e) => (
          <button
            key={e.id}
            title={`${formatTime(e.time)} — ${e.label}`}
            className={`absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 cursor-pointer rounded-full border ${
              focusEventId === e.id ? "z-10 ring-2 ring-text" : ""
            }`}
            style={{
              left: `${(e.time / maxT) * 100}%`,
              background: EVENT_COLORS[e.type] ?? "#9aa5b1",
              borderColor: "rgba(0,0,0,0.5)",
            }}
            onClick={(ev) => {
              ev.stopPropagation();
              onSeek(Math.max(0, e.time - 1));
            }}
          />
        ))}
      </div>
      {/* Event list */}
      <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
        {events.map((e) => (
          <button
            key={e.id}
            onClick={() => onSeek(Math.max(0, e.time - 1))}
            className={`cursor-pointer font-mono text-[11px] transition-colors ${
              focusEventId === e.id
                ? "text-text"
                : "text-text-faint hover:text-text-dim"
            }`}
          >
            <span style={{ color: EVENT_COLORS[e.type] ?? "#9aa5b1" }}>●</span>{" "}
            {formatTime(e.time)} — {e.label}
          </button>
        ))}
      </div>
    </div>
  );
}
