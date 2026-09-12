"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { Badge, Card, LinkButton, SectionTitle } from "@/components/ui";
import {
  RoundTheater,
  type RoundTheaterHandle,
} from "@/components/RoundTheater";
import { TacticalMapViewer } from "@/components/TacticalMapViewer";
import {
  apiGetMatch,
  apiListRounds,
  apiListRoundPositions,
  apiListTeams,
  ApiError,
  mapApiRound,
  mapPositionsToTracks,
  useRequireAuth,
  type ApiMatch,
  type ApiRound,
  type ApiTeam,
} from "@/lib/api";
import { areaForPosition, type Round } from "@/lib/types";
import { formatTime } from "@/lib/format";

/* Round analysis from the live backend (Website Plan §18-19,
   Master Plan §21-23): VOD-synced theater + tactical map driven by
   API rounds, events, and tracked positions. */

export default function RoundPage() {
  const ready = useRequireAuth();
  const params = useParams<{ matchId: string; roundNumber: string }>();
  const matchId = params.matchId;
  const roundNumber = Number(params.roundNumber);

  const [match, setMatch] = useState<ApiMatch | null>(null);
  const [teams, setTeams] = useState<Map<string, ApiTeam> | null>(null);
  const [rounds, setRounds] = useState<ApiRound[] | null>(null);
  const [positions, setPositions] = useState<Map<number, Awaited<ReturnType<typeof apiListRoundPositions>>> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [showVideo, setShowVideo] = useState(true);
  const theaterRef = useRef<RoundTheaterHandle | null>(null);

  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    (async () => {
      try {
        const [m, t, r] = await Promise.all([
          apiGetMatch(matchId),
          apiListTeams(),
          apiListRounds(matchId),
        ]);
        if (cancelled) return;
        setMatch(m);
        setTeams(new Map(t.map((x) => [x.id, x])));
        setRounds(r);
        // Positions per round — the payload is small (2s cadence).
        const entries = await Promise.all(
          r.map(async (round) => [round.number, await apiListRoundPositions(round.id)] as const),
        );
        if (!cancelled) setPositions(new Map(entries));
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof ApiError ? e.message : "Failed to load round.");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [ready, matchId]);

  const round: Round | null = useMemo(() => {
    if (!rounds) return null;
    const r = rounds.find((x) => x.number === roundNumber);
    return r ? mapApiRound(r) : null;
  }, [rounds, roundNumber]);

  const tracks = useMemo(() => {
    if (!positions) return null;
    return mapPositionsToTracks(positions.get(roundNumber) ?? []);
  }, [positions, roundNumber]);

  if (!ready) return null;

  if (error) {
    return (
      <Card className="border-loss/40">
        <p className="text-[13px] text-loss">{error}</p>
        <div className="mt-3">
          <LinkButton href={`/matches/${matchId}`}>Back to match</LinkButton>
        </div>
      </Card>
    );
  }
  if (!match || !rounds || !round || !tracks) {
    return <p className="text-[13px] text-text-dim">Loading round…</p>;
  }

  const teamA = teams?.get(match.team_a_id);
  const teamB = teams?.get(match.team_b_id);
  const apiRound = rounds.find((x) => x.number === roundNumber);
  const vodStart = apiRound?.vod_start_seconds ?? null;
  const avgConfidence =
    round.events.reduce((a, e) => a + e.confidence, 0) / (round.events.length || 1);
  const totalRounds = rounds.length;

  const jumpToEvent = (eventId: string) => {
    setSelectedEventId(eventId);
    const event = round.events.find((e) => e.id === eventId);
    if (event) theaterRef.current?.jumpToEvent(event);
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">
            Round {round.number}
            <span className="ml-3 text-[15px] font-medium text-text-dim">
              {teamA?.name ?? "Team A"} vs {teamB?.name ?? "Team B"} · {match.map}
            </span>
          </h1>
          <p className="mt-1 flex flex-wrap items-center gap-2 text-[13px] text-text-dim">
            <Badge tone={round.winnerSide === "team_a" ? "success" : "danger"}>
              {round.winnerSide === "team_a"
                ? `Won by ${teamA?.name ?? "Team A"}`
                : `Won by ${teamB?.name ?? "Team B"}`}
            </Badge>
            <Badge tone="info">{round.side}</Badge>
            <span className="tabular">Duration {formatTime(round.duration)}</span>
            {round.planted ? <Badge tone="warning">Plant</Badge> : null}
            {vodStart != null ? (
              <span className="font-mono text-[11px] text-text-faint">
                VOD starts {formatTime(vodStart)}
              </span>
            ) : null}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {round.number > 1 ? (
            <Link
              href={`/matches/${matchId}/rounds/${round.number - 1}`}
              className="rounded-md border border-line px-3 py-2 text-[13px] text-text-dim hover:text-text"
            >
              ← R{round.number - 1}
            </Link>
          ) : null}
          {round.number < totalRounds ? (
            <Link
              href={`/matches/${matchId}/rounds/${round.number + 1}`}
              className="rounded-md border border-line px-3 py-2 text-[13px] text-text-dim hover:text-text"
            >
              R{round.number + 1} →
            </Link>
          ) : null}
        </div>
      </div>

      {/* VOD-synced theater */}
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <SectionTitle>VOD replay</SectionTitle>
          <button
            onClick={() => setShowVideo((v) => !v)}
            className="cursor-pointer text-[12px] font-medium text-info hover:underline"
          >
            {showVideo ? "Hide video (map only)" : "Show video sync"}
          </button>
        </div>
        {showVideo ? (
          <div className="mt-3">
            <RoundTheater
              matchId={matchId}
              roundNumber={round.number}
              ref={theaterRef}
              height={420}
              liveTracks={tracks}
              liveEvents={round.events}
              liveDuration={round.duration}
              liveMapId={match.map}
              liveVodStart={vodStart}
              vodSource={match.vod?.source ?? null}
              vodFileId={match.vod?.source === "upload" ? match.vod.id : null}
              vodEmbedUrl={match.vod?.source_url ?? null}
            />
          </div>
        ) : (
          <div className="mt-3">
            <TacticalMapViewer
              matchId={matchId}
              roundNumber={round.number}
              height={460}
              focusEventId={selectedEventId}
              liveTracks={tracks}
              liveEvents={round.events}
              liveDuration={round.duration}
              liveWinnerSide={round.winnerSide}
              liveSide={round.side}
              mapId={match.map}
            />
          </div>
        )}
      </Card>

      <div className="grid gap-5 lg:grid-cols-3">
        {/* Event log */}
        <Card className="lg:col-span-2">
          <SectionTitle>Round events</SectionTitle>
          {round.events.length === 0 ? (
            <p className="mt-3 text-[13px] text-text-dim">
              No events detected in this round.
            </p>
          ) : (
            <div className="mt-3 space-y-1.5">
              {round.events.map((e) => (
                <button
                  key={e.id}
                  onClick={() => jumpToEvent(e.id)}
                  className={`flex w-full cursor-pointer flex-wrap items-center gap-3 rounded-md border px-3 py-2 text-left transition-colors ${
                    selectedEventId === e.id
                      ? "border-accent/50 bg-accent-soft"
                      : "border-line hover:bg-surface-2"
                  }`}
                >
                  <span className="tabular w-12 font-mono text-[12.5px] text-text-dim">
                    {formatTime(e.time)}
                  </span>
                  <span className="text-[13.5px] font-medium">{e.label}</span>
                  <span className="ml-auto flex items-center gap-2">
                    {e.x !== undefined && e.y !== undefined ? (
                      <span className="text-[11.5px] text-text-faint">
                        {areaForPosition(match.map, e.x, e.y)}
                      </span>
                    ) : null}
                    <span
                      className="tabular text-[11px]"
                      style={{
                        color:
                          e.confidence > 0.9
                            ? "var(--color-win)"
                            : e.confidence > 0.8
                              ? "var(--color-warning)"
                              : "var(--color-loss)",
                      }}
                    >
                      {Math.round(e.confidence * 100)}%
                    </span>
                  </span>
                </button>
              ))}
            </div>
          )}
        </Card>

        {/* Round summary + confidence */}
        <div className="space-y-5">
          <Card>
            <SectionTitle>Round summary</SectionTitle>
            <div className="mt-3 space-y-2 text-[13px]">
              {[
                [
                  "First blood",
                  round.firstBloodFor === "team_a"
                    ? `${teamA?.name ?? "Team A"}`
                    : round.firstBloodFor === "team_b"
                      ? `${teamB?.name ?? "Team B"}`
                      : "—",
                ],
                ["Spike plant", round.planted ? "Yes" : "No"],
                ["Decisive moment", round.events[1]?.label ?? "—"],
                [
                  "Tracked positions",
                  String(positions?.get(round.number)?.length ?? 0),
                ],
              ].map(([label, value]) => (
                <div key={label} className="flex justify-between gap-3">
                  <span className="text-text-dim">{label}</span>
                  <span className="text-right font-medium">{value}</span>
                </div>
              ))}
            </div>
          </Card>

          <Card>
            <SectionTitle>Detection confidence</SectionTitle>
            <div className="mt-1 text-[13px] text-text-dim">
              Average event confidence:{" "}
              <span className="tabular font-semibold">
                {Math.round(avgConfidence * 100)}%
              </span>
            </div>
            <p className="mt-3 text-[11.5px] leading-relaxed text-text-faint">
              Every automated result carries a confidence score (Master Plan
              §31). Low-confidence detections should be reviewed and corrected
              to improve future models.
            </p>
          </Card>
        </div>
      </div>
    </div>
  );
}
