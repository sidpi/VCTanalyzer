"use client";

import { useEffect, useMemo, useState } from "react";
import { Card, LinkButton, SectionTitle, StatCard } from "@/components/ui";
import {
  buildMovementStats,
  loadOrgDataset,
  type OrgDataset,
} from "@/lib/analytics";
import { ApiError } from "@/lib/api";
import { MAPS } from "@/lib/types";

/* Movement analysis from live tracked positions (Master Plan §19). */

const SIDE_OPTIONS = [
  { value: "attack", label: "Attack" },
  { value: "defense", label: "Defense" },
] as const;

const TEAM_OPTIONS = [
  { value: "team_a", label: "Team A" },
  { value: "team_b", label: "Team B" },
] as const;

export default function MovementPage() {
  const [dataset, setDataset] = useState<OrgDataset | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mapId, setMapId] = useState("ascent");
  const [side, setSide] = useState<"attack" | "defense">("attack");
  const [teamSide, setTeamSide] = useState<"team_a" | "team_b">("team_a");

  useEffect(() => {
    let cancelled = false;
    loadOrgDataset()
      .then((d) => {
        if (cancelled) return;
        setDataset(d);
        const used = new Set(d.matches.map((m) => m.map));
        if (used.size > 0 && !used.has(mapId)) {
          setMapId([...used][0]);
        }
      })
      .catch((e) =>
        !cancelled &&
        setError(e instanceof ApiError ? e.message : "Failed to load dataset."),
      );
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const stats = useMemo(() => {
    if (!dataset) return null;
    return buildMovementStats(dataset, { mapId, side, teamSide });
  }, [dataset, mapId, side, teamSide]);

  const availableMaps = useMemo(() => {
    if (!dataset) return MAPS;
    const used = new Set(dataset.matches.map((m) => m.map));
    return MAPS.filter((m) => used.has(m.id));
  }, [dataset]);

  if (error) {
    return (
      <Card className="border-loss/40">
        <p className="text-[13px] text-loss">{error}</p>
      </Card>
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold">Movement</h1>
        <p className="mt-0.5 text-[13px] text-text-dim">
          Movement statistics derived from tracked minimap positions.
        </p>
      </div>

      {!dataset ? (
        <Card>
          <p className="text-[13px] text-text-dim">Loading dataset…</p>
        </Card>
      ) : availableMaps.length === 0 ? (
        <Card>
          <SectionTitle>No analyzed matches yet</SectionTitle>
          <p className="mt-2 text-[13px] text-text-dim">
            Upload and analyze a VOD to compute movement statistics.
          </p>
          <div className="mt-4">
            <LinkButton href="/matches/new" variant="primary">
              Upload VOD
            </LinkButton>
          </div>
        </Card>
      ) : (
        <>
          {/* Filters */}
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-md border border-line bg-surface px-3 py-2.5 text-[12px]">
            <FilterGroup
              label="Map"
              options={availableMaps.map((m) => ({ value: m.id, label: m.name }))}
              value={mapId}
              onChange={setMapId}
            />
            <FilterGroup
              label="Phase"
              options={SIDE_OPTIONS.map((s) => ({ value: s.value, label: s.label }))}
              value={side}
              onChange={(v) => setSide(v as "attack" | "defense")}
            />
            <FilterGroup
              label="Team"
              options={TEAM_OPTIONS.map((t) => ({ value: t.value, label: t.label }))}
              value={teamSide}
              onChange={(v) => setTeamSide(v as "team_a" | "team_b")}
            />
            {stats ? (
              <span className="ml-auto text-text-faint">
                {stats.roundsConsidered} rounds considered
              </span>
            ) : null}
          </div>

          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <StatCard
              label="Top area"
              value={stats?.areaTime[0]?.area ?? "—"}
            />
            <StatCard
              label="Top area share"
              value={
                stats?.areaTime[0] ? `${stats.areaTime[0].pct.toFixed(1)}%` : "—"
              }
              tone="info"
            />
            <StatCard
              label="Avg first contact"
              value={stats?.avgFirstContact ?? "—"}
              tone="warning"
            />
            <StatCard
              label="Entry routes found"
              value={stats?.entryRoutes.length ?? 0}
            />
          </div>

          <div className="grid gap-5 lg:grid-cols-2">
            <Card>
              <SectionTitle>Time per area</SectionTitle>
              {!stats || stats.areaTime.length === 0 ? (
                <p className="mt-3 text-[13px] text-text-dim">
                  No tracked positions for this filter.
                </p>
              ) : (
                <div className="mt-4 space-y-3">
                  {stats.areaTime.map((a) => (
                    <div key={a.area}>
                      <div className="mb-1 flex justify-between text-[13px]">
                        <span>{a.area}</span>
                        <span className="tabular font-semibold">
                          {a.pct.toFixed(1)}%
                        </span>
                      </div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-surface-3">
                        <div
                          className="h-full rounded-full bg-info"
                          style={{ width: `${Math.min(100, (a.pct / 40) * 100)}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>

            <Card>
              <SectionTitle>Common entry routes</SectionTitle>
              {!stats || stats.entryRoutes.length === 0 ? (
                <p className="mt-3 text-[13px] text-text-dim">
                  Routes appear once first-blood events and positions line up.
                </p>
              ) : (
                <div className="mt-4 space-y-2.5 text-[13px]">
                  {stats.entryRoutes.map((r) => (
                    <div
                      key={r.route}
                      className="flex items-center justify-between border-b border-line pb-2.5 last:border-0"
                    >
                      <span className="font-mono text-[12.5px]">{r.route}</span>
                      <span className="tabular">{r.share.toFixed(0)}%</span>
                    </div>
                  ))}
                </div>
              )}
              <p className="mt-4 text-[11.5px] leading-relaxed text-text-faint">
                Routes = area in the first 8 seconds → area at first blood,
                per tracked player (Master Plan §19).
              </p>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}

function FilterGroup({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { value: string; label: string }[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="flex items-center gap-1.5">
      <span className="font-semibold uppercase tracking-wide text-text-faint">
        {label}
      </span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="cursor-pointer rounded border border-line-2 bg-surface px-2 py-1 text-[12px] text-text focus:border-accent focus:outline-none"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}
