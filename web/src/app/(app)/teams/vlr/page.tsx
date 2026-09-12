"use client";

import { useEffect, useState } from "react";
import { Badge, Button, Card, LinkButton, SectionTitle } from "@/components/ui";
import {
  apiImportVlrTeam,
  apiVlrRankings,
  ApiError,
  useRequireAuth,
  type ApiVlrRankingRegion,
} from "@/lib/api";

/* VLR team rankings by region (Website Plan; Master Plan §42 ingest).
   One-click import: creates the team + full roster in the caller's org. */

export default function VlrTeamsPage() {
  const ready = useRequireAuth();
  const [regions, setRegions] = useState<ApiVlrRankingRegion[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [importing, setImporting] = useState<string | null>(null);
  const [imported, setImported] = useState<Record<string, string>>({});
  const [activeRegion, setActiveRegion] = useState<string | null>(null);

  useEffect(() => {
    if (!ready) return;
    apiVlrRankings()
      .then((res) => {
        setRegions(res);
        if (res.length > 0) setActiveRegion(res[0].region);
      })
      .catch((e) =>
        setError(e instanceof ApiError ? e.message : "Failed to load rankings."),
      );
  }, [ready]);

  if (!ready) return null;

  const current = regions?.find((r) => r.region === activeRegion) ?? null;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Teams — vlr.gg</h1>
          <p className="mt-0.5 text-[13px] text-text-dim">
            Current regional rankings. Import a team to pull its full roster —
            aliases, real names, roles — into your organization.
          </p>
        </div>
        <LinkButton href="/teams">My teams</LinkButton>
      </div>

      {error ? (
        <Card className="border-loss/40">
          <p className="text-[13px] text-loss">{error}</p>
          <p className="mt-2 text-[12px] text-text-dim">
            Run the{" "}
            <a
              className="text-info hover:underline"
              href="https://github.com/akhilnarang/vlrgg-scraper"
              target="_blank"
              rel="noreferrer"
            >
              vlrgg-scraper
            </a>{" "}
            service and set <code className="rounded bg-surface-2 px-1">VLR_BASE_URL</code>{" "}
            on the API to enable vlr.gg data.
          </p>
        </Card>
      ) : !regions ? (
        <Card>
          <p className="text-[13px] text-text-dim">Loading rankings…</p>
        </Card>
      ) : regions.length === 0 ? (
        <Card>
          <SectionTitle>No rankings available</SectionTitle>
        </Card>
      ) : (
        <>
          <div className="flex flex-wrap gap-1.5">
            {regions.map((r) => (
              <button
                key={r.region}
                onClick={() => setActiveRegion(r.region)}
                className={`cursor-pointer rounded px-3 py-1.5 text-[12.5px] font-medium transition-colors ${
                  activeRegion === r.region
                    ? "bg-accent-soft text-accent"
                    : "text-text-dim hover:text-text"
                }`}
              >
                {r.region}
              </button>
            ))}
          </div>

          {current ? (
            <Card padded={false}>
              <div className="divide-y divide-line">
                {current.teams.map((t) => {
                  const key = String(t.id);
                  const done = imported[key];
                  return (
                    <div
                      key={key}
                      className="flex items-center justify-between gap-3 px-4 py-3"
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <span className="tabular w-8 text-[13px] font-bold text-text-faint">
                          #{t.rank}
                        </span>
                        <span className="truncate text-[13.5px] font-semibold">
                          {t.name}
                        </span>
                        <Badge>{t.country}</Badge>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="tabular text-[12px] text-text-dim">
                          {t.points} pts
                        </span>
                        {done ? (
                          <Badge tone="success">
                            <a href={`/teams/${done}`}>Imported ✓</a>
                          </Badge>
                        ) : (
                          <Button
                            disabled={importing !== null}
                            onClick={async () => {
                              setImporting(key);
                              setError(null);
                              try {
                                const team = await apiImportVlrTeam(key);
                                setImported((prev) => ({
                                  ...prev,
                                  [key]: team.id,
                                }));
                              } catch (e) {
                                setError(
                                  e instanceof ApiError
                                    ? e.message
                                    : "Import failed.",
                                );
                              } finally {
                                setImporting(null);
                              }
                            }}
                          >
                            {importing === key ? "Importing…" : "Import"}
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>
          ) : null}
        </>
      )}
    </div>
  );
}
