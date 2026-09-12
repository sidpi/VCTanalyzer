"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Badge, Card, ProgressBar, SectionTitle } from "@/components/ui";
import { apiGetPatterns, type ApiPattern } from "@/lib/analytics";
import { ApiError, useRequireAuth } from "@/lib/api";
import { LinkButton } from "@/components/ui";

/* Pattern analysis from the live backend (Website Plan §22; Master Plan
   §28-29, §31): rule-based mined patterns with evidence counts. */

export default function PatternsPage() {
  const ready = useRequireAuth();
  const [patterns, setPatterns] = useState<ApiPattern[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!ready) return;
    apiGetPatterns()
      .then(setPatterns)
      .catch((e) =>
        setError(e instanceof ApiError ? e.message : "Failed to load patterns."),
      );
  }, [ready]);

  if (!ready) return null;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold">Patterns</h1>
        <p className="mt-0.5 text-[13px] text-text-dim">
          Tactical sequences mined from your analyzed rounds, with confidence
          and supporting evidence.
        </p>
      </div>

      {error ? (
        <Card className="border-loss/40">
          <p className="text-[13px] text-loss">{error}</p>
        </Card>
      ) : !patterns ? (
        <Card>
          <p className="text-[13px] text-text-dim">Loading patterns…</p>
        </Card>
      ) : patterns.length === 0 ? (
        <Card>
          <SectionTitle>No patterns detected yet</SectionTitle>
          <p className="mt-2 text-[13px] text-text-dim">
            Patterns are mined automatically once analyzed matches exist. Every
            pattern links to the rounds that support it (Master Plan §58).
          </p>
          <div className="mt-4">
            <LinkButton href="/matches/new" variant="primary">
              Upload VOD
            </LinkButton>
          </div>
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {patterns.map((p, idx) => (
            <Card key={p.id}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-text-faint">
                    Pattern {String(idx + 1).padStart(2, "0")}
                  </div>
                  <div className="mt-1 text-[15px] font-bold text-accent">
                    {p.name}
                  </div>
                </div>
                <Badge tone="info">
                  {p.map} · {p.side}
                </Badge>
              </div>

              {/* Steps */}
              <div className="mt-3 flex flex-wrap items-center gap-1.5 text-[12px]">
                {p.steps.map((s, i) => (
                  <span key={s} className="flex items-center gap-1.5">
                    {i > 0 ? <span className="text-text-faint">→</span> : null}
                    <span className="rounded border border-line-2 bg-surface-2 px-2 py-0.5">
                      {s}
                    </span>
                  </span>
                ))}
              </div>

              <div className="mt-4 grid grid-cols-3 gap-3 border-t border-line pt-3">
                <div>
                  <div className="text-[11px] uppercase tracking-wide text-text-faint">
                    Frequency
                  </div>
                  <div className="tabular mt-0.5 text-[15px] font-bold">
                    {p.frequency}/{p.totalRounds}
                  </div>
                </div>
                <div>
                  <div className="text-[11px] uppercase tracking-wide text-text-faint">
                    Avg timing
                  </div>
                  <div className="tabular mt-0.5 text-[15px] font-bold">
                    {p.avgTiming}
                  </div>
                </div>
                <div>
                  <div className="text-[11px] uppercase tracking-wide text-text-faint">
                    Matches
                  </div>
                  <div className="tabular mt-0.5 text-[15px] font-bold">
                    {p.matches}
                  </div>
                </div>
              </div>

              <div className="mt-4">
                <div className="mb-1 flex justify-between text-[12px]">
                  <span className="text-text-dim">Confidence</span>
                  <span className="tabular font-semibold">
                    {Math.round(p.confidence * 100)}%
                  </span>
                </div>
                <ProgressBar
                  value={p.confidence * 100}
                  tone={p.confidence > 0.75 ? "win" : "warning"}
                />
              </div>

              <div className="mt-4 flex items-center justify-between border-t border-line pt-3">
                <span className="text-[11.5px] text-text-faint">
                  Evidence: {p.frequency} occurrences · {p.totalRounds} rounds ·{" "}
                  {p.matches} {p.matches === 1 ? "match" : "matches"}
                </span>
                <Link
                  href="/matches"
                  className="text-[12px] font-medium text-info hover:underline"
                >
                  View supporting matches →
                </Link>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Card>
        <SectionTitle>How patterns are detected</SectionTitle>
        <p className="mt-2 text-[13px] leading-relaxed text-text-dim">
          Rule-based mining over structured events and rounds (Master Plan §29
          Stage 1): sequences like mid control preceding an A execute are
          counted across all analyzed rounds, scored for confidence, and shown
          with the evidence that supports them. Statistical and ML-based
          classification arrive in later phases.
        </p>
      </Card>
    </div>
  );
}
