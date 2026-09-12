"use client";

import { useEffect, useMemo, useState } from "react";
import { Card, LinkButton, SectionTitle } from "@/components/ui";
import {
  buildHeatPoints,
  loadOrgDataset,
  type HeatKind,
  type OrgDataset,
} from "@/lib/analytics";
import { ApiError } from "@/lib/api";
import { MAPS } from "@/lib/types";

/* Heatmap interface over the live dataset (Website Plan §20, Master Plan §20).
   Presence = tracked positions; kills/deaths/first contact = real events. */

const MODES: { key: HeatKind; label: string }[] = [
  { key: "presence", label: "Presence" },
  { key: "kills", label: "Kills" },
  { key: "deaths", label: "Deaths" },
  { key: "first_contact", label: "First Blood" },
];

const SIDES = ["All", "Attack", "Defense"] as const;
const TEAM_SIDES = [
  { value: "all", label: "Both teams" },
  { value: "team_a", label: "Team A" },
  { value: "team_b", label: "Team B" },
] as const;

export function HeatmapViewer() {
  const [kind, setKind] = useState<HeatKind>("presence");
  const [side, setSide] = useState<(typeof SIDES)[number]>("All");
  const [teamSide, setTeamSide] = useState<"all" | "team_a" | "team_b">("all");
  const [mapId, setMapId] = useState("ascent");
  const [dataset, setDataset] = useState<OrgDataset | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadOrgDataset()
      .then((d) => !cancelled && setDataset(d))
      .catch((e) =>
        !cancelled &&
        setError(e instanceof ApiError ? e.message : "Failed to load dataset."),
      );
    return () => {
      cancelled = true;
    };
  }, []);

  const availableMaps = useMemo(() => {
    if (!dataset) return MAPS;
    const used = new Set(dataset.matches.map((m) => m.map));
    return MAPS.filter((m) => used.has(m.id));
  }, [dataset]);

  const points = useMemo(() => {
    if (!dataset) return [];
    return buildHeatPoints(dataset, {
      mapId,
      side: side === "All" ? "all" : side === "Attack" ? "attack" : "defense",
      teamSide,
      kind,
    });
  }, [dataset, mapId, side, teamSide, kind]);

  const map = MAPS.find((m) => m.id === mapId);

  if (error) {
    return (
      <Card className="border-loss/40">
        <p className="text-[13px] text-loss">{error}</p>
      </Card>
    );
  }

  return (
    <Card padded={false} className="overflow-hidden">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-line px-4 py-3">
        <SectionTitle>Heatmap</SectionTitle>
        <div className="flex flex-wrap gap-1">
          {MODES.map((m) => (
            <button
              key={m.key}
              onClick={() => setKind(m.key)}
              className={`cursor-pointer rounded px-2 py-1 text-[12px] font-medium transition-colors ${
                kind === m.key
                  ? "bg-accent-soft text-accent"
                  : "text-text-dim hover:text-text"
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-b border-line bg-surface-2/50 px-4 py-2.5 text-[12px]">
        <FilterGroup
          label="Map"
          options={availableMaps.map((m) => ({ value: m.id, label: m.name }))}
          value={mapId}
          onChange={setMapId}
        />
        <FilterGroup
          label="Side"
          options={SIDES.map((s) => ({ value: s, label: s }))}
          value={side}
          onChange={(v) => setSide(v as (typeof SIDES)[number])}
        />
        <FilterGroup
          label="Team"
          options={TEAM_SIDES.map((t) => ({ value: t.value, label: t.label }))}
          value={teamSide}
          onChange={(v) => setTeamSide(v as "all" | "team_a" | "team_b")}
        />
        <span className="ml-auto text-text-faint">
          {map?.name} · {side} · {points.length.toLocaleString()} samples
        </span>
      </div>

      {/* Heat render */}
      {!dataset ? (
        <div className="tactical-grid flex h-[440px] items-center justify-center bg-surface">
          <p className="text-[13px] text-text-dim">Loading dataset…</p>
        </div>
      ) : availableMaps.length === 0 ? (
        <div className="flex h-[440px] flex-col items-center justify-center gap-3 bg-surface">
          <p className="text-[13px] text-text-dim">
            No analyzed maps yet — upload a VOD to generate heatmaps.
          </p>
          <LinkButton href="/matches/new" variant="primary">
            Upload VOD
          </LinkButton>
        </div>
      ) : (
        <div className="tactical-grid relative h-[440px] bg-surface">
          <svg
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            className="absolute inset-0 h-full w-full"
          >
            {map?.areas.map((a) => (
              <g key={a.name}>
                <rect
                  x={a.x0 * 100}
                  y={a.y0 * 100}
                  width={(a.x1 - a.x0) * 100}
                  height={(a.y1 - a.y0) * 100}
                  fill="rgba(120,140,160,0.03)"
                  stroke="rgba(120,140,160,0.2)"
                  strokeWidth="0.15"
                />
                <text
                  x={(a.x0 + 0.01) * 100}
                  y={(a.y0 + 0.045) * 100}
                  fontSize="1.9"
                  fill="rgba(154,165,177,0.5)"
                >
                  {a.name}
                </text>
              </g>
            ))}
            {points.map((p, i) => (
              <circle
                key={i}
                cx={p.x * 100}
                cy={p.y * 100}
                r={1.5 + Math.min(2.2, p.weight) * 0.7}
                fill={`rgba(255,70,85,${Math.min(0.14, 0.04 + p.weight * 0.012)})`}
              />
            ))}
          </svg>
          {points.length === 0 ? (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <span className="rounded bg-black/60 px-3 py-1.5 text-[12px] text-text-dim">
                No samples for this filter combination
              </span>
            </div>
          ) : null}
          <div className="pointer-events-none absolute bottom-2 right-2 rounded bg-black/60 px-2 py-1 text-[11px] text-text-dim">
            Warmer = more frequent
          </div>
        </div>
      )}
    </Card>
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
