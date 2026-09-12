"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  Badge,
  Card,
  LinkButton,
  SectionTitle,
  StatCard,
} from "@/components/ui";
import {
  buildMovementStats,
  buildPlayerSummary,
  loadOrgDataset,
  type OrgDataset,
} from "@/lib/analytics";
import { ApiError, useRequireAuth } from "@/lib/api";
import { MAPS, type TeamSide } from "@/lib/types";

/* Player analysis from the live dataset (Website Plan §21, Master Plan §27).
   Players are roster rows (`/teams/{id}/players`); the dataset loader keys
   positions/events by player_id, so identity survives roster moves. */

export default function PlayerPage() {
  const ready = useRequireAuth();
  const params = useParams<{ playerId: string }>();
  const playerId = params.playerId;

  const [dataset, setDataset] = useState<OrgDataset | null>(null);
  const [name, setName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mapId, setMapId] = useState<string | null>(null);

  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    (async () => {
      try {
        const data = await loadOrgDataset();
        if (cancelled) return;
        setDataset(data);

        // Resolve the player's name from any roster in the org.
        const { apiListTeamPlayers } = await import("@/lib/api");
        for (const teamId of data.teams.keys()) {
          try {
            const roster = await apiListTeamPlayers(teamId);
            const hit = roster.find((p) => p.id === playerId);
            if (hit) {
              if (!cancelled) setName(hit.name);
              break;
            }
          } catch {
            /* team may be unreadable — keep scanning */
          }
        }
      } catch (e) {
        if (!cancelled) {
          setError(
            e instanceof ApiError ? e.message : "Failed to load player data.",
          );
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [ready, playerId]);

  const summary = useMemo(
    () => (dataset ? buildPlayerSummary(dataset, playerId) : null),
    [dataset, playerId],
  );

  // Default the map tab to the player's most-played map once data lands.
  useEffect(() => {
    if (dataset && mapId === null) {
      const counts = new Map<string, number>();
      for (const p of dataset.positions) {
        if (p.playerId === playerId) {
          counts.set(p.map, (counts.get(p.map) ?? 0) + 1);
        }
      }
      const top = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
      if (top) setMapId(top[0]);
    }
  }, [dataset, playerId, mapId]);

  const sides: ("attack" | "defense")[] = ["attack", "defense"];
  const movement = useMemo(() => {
    if (!dataset || !summary?.teamSide || !mapId) return null;
    return sides.map((side) => ({
      side,
      stats: buildMovementStats(dataset, {
        mapId,
        side,
        teamSide: summary.teamSide as TeamSide,
        playerId,
      }),
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataset, summary?.teamSide, mapId, playerId]);

  if (!ready) return null;

  if (error) {
    return (
      <Card className="border-loss/40">
        <p className="text-[13px] text-loss">{error}</p>
        <p className="mt-2 text-[12px] text-text-dim">
          Start the backend with{" "}
          <code className="rounded bg-surface-2 px-1">docker compose up</code>.
        </p>
      </Card>
    );
  }

  if (!dataset || !summary) {
    return (
      <Card>
        <p className="text-[13px] text-text-dim">Loading player…</p>
      </Card>
    );
  }

  if (summary.roundsTracked === 0 && name === null && dataset) {
    return (
      <Card>
        <SectionTitle>Player not found</SectionTitle>
        <p className="mt-2 text-[13px] text-text-dim">
          No roster entry or tracked data exists for this player in your
          organization.
        </p>
        <div className="mt-4">
          <LinkButton href="/teams" variant="primary">
            Browse teams
          </LinkButton>
        </div>
      </Card>
    );
  }

  const displayName = name ?? summary.agent ?? "Player";
  const mapsWithSides =
    summary.teamSide != null
      ? ([
          { side: "attack" as const },
          { side: "defense" as const },
        ])
      : [];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">
            {displayName}
            {summary.agent ? (
              <span className="text-[15px] font-medium text-text-dim">
                {" "}
                · {summary.agent}
                {summary.teamName ? ` · ${summary.teamName}` : ""}
              </span>
            ) : null}
          </h1>
          <p className="mt-0.5 text-[12.5px] text-text-dim">
            {summary.presenceSamples.toLocaleString()} tracked position samples
            across {summary.roundsTracked} rounds
            {summary.mapsPlayed.length
              ? ` · ${summary.mapsPlayed.join(", ")}`
              : ""}
          </p>
        </div>
        {summary.teamName ? (
          <Link
            href="/teams"
            className="text-[13px] text-info hover:underline"
          >
            ← Teams
          </Link>
        ) : null}
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Rounds tracked" value={summary.roundsTracked || "—"} />
        <StatCard
          label="First bloods"
          value={summary.firstBloods || "—"}
          sub={
            summary.roundsTracked
              ? `${Math.round(summary.firstBloodRate * 100)}% of tracked rounds`
              : undefined
          }
          tone={summary.firstBloodRate >= 0.2 ? "win" : undefined}
        />
        <StatCard
          label="Avg first blood time"
          value={summary.avgFirstBloodTime ?? "—"}
        />
        <StatCard
          label="Maps played"
          value={summary.mapsPlayed.length || "—"}
          sub={summary.teamSide ? `plays ${summary.teamSide.replace("_", " ")}` : undefined}
        />
      </div>

      {summary.roundsTracked === 0 ? (
        <Card>
          <SectionTitle>No tracked data yet</SectionTitle>
          <p className="mt-2 text-[13px] text-text-dim">
            This player is on a roster but has no tracked positions yet — they
            appear here after a match involving their team is analyzed.
          </p>
        </Card>
      ) : (
        <>
          {mapsWithSides.length > 0 && summary.mapsPlayed.length > 0 ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[12px] font-semibold uppercase tracking-wide text-text-faint">
                Map
              </span>
              {summary.mapsPlayed.map((m) => {
                const label = MAPS.find((x) => x.id === m)?.name ?? m;
                return (
                  <button
                    key={m}
                    onClick={() => setMapId(m)}
                    className={`cursor-pointer rounded px-2.5 py-1 text-[12px] font-medium transition-colors ${
                      mapId === m
                        ? "bg-accent-soft text-accent"
                        : "text-text-dim hover:text-text"
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          ) : null}

          <div className="grid gap-5 lg:grid-cols-2">
            {(movement ?? []).map(({ side, stats }) => (
              <Card key={side}>
                <SectionTitle>
                  Movement — {MAPS.find((m) => m.id === mapId)?.name ?? mapId}{" "}
                  {side}
                </SectionTitle>
                {stats.roundsConsidered === 0 ? (
                  <p className="mt-3 text-[13px] text-text-dim">
                    No {side} rounds tracked on this map.
                  </p>
                ) : (
                  <div className="mt-4 space-y-3">
                    <div>
                      <div className="mb-1.5 text-[12px] font-semibold uppercase tracking-wide text-text-faint">
                        Area time (top areas)
                      </div>
                      {stats.areaTime.length === 0 ? (
                        <p className="text-[13px] text-text-dim">—</p>
                      ) : (
                        stats.areaTime.map((a) => (
                          <div key={a.area} className="mb-1.5">
                            <div className="flex justify-between text-[12.5px]">
                              <span>{a.area}</span>
                              <span className="tabular font-semibold">
                                {Math.round(a.pct)}%
                              </span>
                            </div>
                            <div className="mt-0.5 h-1 overflow-hidden rounded-full bg-surface-3">
                              <div
                                className="h-full rounded-full bg-accent"
                                style={{ width: `${Math.min(100, a.pct)}%` }}
                              />
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                    <div>
                      <div className="mb-1.5 text-[12px] font-semibold uppercase tracking-wide text-text-faint">
                        Entry routes (start → first contact)
                      </div>
                      {stats.entryRoutes.length === 0 ? (
                        <p className="text-[13px] text-text-dim">—</p>
                      ) : (
                        <div className="space-y-1 text-[12.5px]">
                          {stats.entryRoutes.map((r) => (
                            <div key={r.route} className="flex justify-between">
                              <span>{r.route}</span>
                              <span className="tabular text-text-dim">
                                {Math.round(r.share)}%
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="flex justify-between border-t border-line pt-2 text-[12.5px]">
                      <span className="text-text-dim">Avg first contact</span>
                      <span className="tabular font-semibold">
                        {stats.avgFirstContact ?? "—"}
                      </span>
                    </div>
                    <div className="text-[11.5px] text-text-faint">
                      {stats.roundsConsidered} {side} rounds considered
                    </div>
                  </div>
                )}
              </Card>
            ))}
          </div>

          <Card>
            <SectionTitle>Evidence (Master Plan §58)</SectionTitle>
            <p className="mt-2 text-[12.5px] leading-relaxed text-text-dim">
              Every number on this page is computed from tracked positions and
              events attributed to {displayName} in your organization&apos;s
              analyzed matches — {summary.presenceSamples.toLocaleString()}{" "}
              position samples and {summary.firstBloods} first-blood events.
              Per-round evidence lives in each match&apos;s round viewer.
            </p>
          </Card>
        </>
      )}
    </div>
  );
}
