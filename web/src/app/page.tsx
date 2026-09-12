import Link from "next/link";
import { Badge, Card, LinkButton } from "@/components/ui";
import { TacticalMapViewer } from "@/components/TacticalMapViewer";

/* Landing page (Website Plan §6-7) */

const FEATURES = [
  { title: "Movement Analysis", body: "Player and team movement tracked frame-by-frame from the minimap." },
  { title: "Heatmaps", body: "Presence, kills, deaths, and first-contact heatmaps across any filter." },
  { title: "Round Analysis", body: "Every round reconstructed with events, timing, and positions." },
  { title: "Player Tendencies", body: "Entry behavior, preferred areas, aggression, and survival." },
  { title: "Team Patterns", body: "Repeated executes, rotations, and defaults with confidence scores." },
  { title: "Opponent Scouting", body: "Historical analysis that sharpens with every analyzed match." },
  { title: "AI Reports", body: "Evidence-linked scouting and review reports, not vague summaries." },
  { title: "Historical Analysis", body: "Strategy evolution across matches, maps, and months." },
];

const SITE_STATS = [
  { label: "A Site", value: 51 },
  { label: "B Site", value: 29 },
  { label: "Mid Split", value: 14 },
  { label: "Other", value: 6 },
];

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-bg">
      {/* Nav */}
      <header className="sticky top-0 z-40 border-b border-line bg-bg/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-6">
          <div className="flex items-center gap-2">
            <span className="text-[15px] font-bold tracking-wide text-accent">VCT</span>
            <span className="text-[15px] font-bold tracking-wide">analyzer</span>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/login"
              className="rounded-md px-3.5 py-2 text-[13px] font-semibold text-text-dim transition-colors hover:text-text"
            >
              Sign in
            </Link>
            <LinkButton href="/register" variant="primary">
              Start Analyzing
            </LinkButton>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="mx-auto grid max-w-6xl items-center gap-10 px-6 py-20 lg:grid-cols-2">
        <div>
          <Badge tone="accent" className="mb-5">
            Valorant Tactical Intelligence
          </Badge>
          <h1 className="text-4xl font-bold leading-tight tracking-tight lg:text-5xl">
            Turn Valorant VODs Into{" "}
            <span className="text-accent">Tactical Intelligence.</span>
          </h1>
          <p className="mt-5 max-w-lg text-[15px] leading-relaxed text-text-dim">
            Analyze movement, positioning, tendencies, executes, and patterns
            from your team&apos;s matches and scrims. Upload a VOD — get
            structured, evidence-linked tactical data.
          </p>
          <div className="mt-8 flex gap-3">
            <LinkButton href="/register" variant="primary">
              Start Analyzing
            </LinkButton>
            <LinkButton href="/dashboard">Explore Demo</LinkButton>
          </div>
        </div>

        <Card padded={false} className="overflow-hidden">
          <div className="border-b border-line px-4 py-2.5 text-[12px] font-semibold uppercase tracking-[0.14em] text-text-dim">
            Ascent — Round 12 · Live tactical view
          </div>
          <TacticalMapViewer
            matchId="m1"
            roundNumber={12}
            height={420}
            interactive={false}
          />
        </Card>
      </section>

      {/* Pipeline */}
      <section className="border-y border-line bg-surface/40">
        <div className="mx-auto flex max-w-6xl flex-col items-center gap-4 px-6 py-14 text-center">
          <div className="flex flex-wrap items-center justify-center gap-3 text-[14px] font-semibold">
            <span className="rounded-md border border-line-2 bg-surface-2 px-4 py-2">VOD</span>
            <span className="text-text-faint">↓</span>
            <span className="rounded-md border border-line-2 bg-surface-2 px-4 py-2">Computer Vision</span>
            <span className="text-text-faint">↓</span>
            <span className="rounded-md border border-line-2 bg-surface-2 px-4 py-2">Structured Data</span>
            <span className="text-text-faint">↓</span>
            <span className="rounded-md border border-accent/50 bg-accent-soft px-4 py-2 text-accent">
              Tactical Intelligence
            </span>
          </div>
          <p className="mt-2 max-w-xl text-[13px] text-text-dim">
            Every insight is built on verifiable structured data — positions,
            events, and rounds — never on a black-box guess.
          </p>
        </div>
      </section>

      {/* Features */}
      <section className="mx-auto max-w-6xl px-6 py-16">
        <h2 className="text-2xl font-bold">Everything a coaching staff needs</h2>
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map((f) => (
            <Card key={f.title}>
              <div className="text-[14px] font-semibold">{f.title}</div>
              <div className="mt-1.5 text-[13px] leading-relaxed text-text-dim">
                {f.body}
              </div>
            </Card>
          ))}
        </div>
      </section>

      {/* Team intelligence sample */}
      <section className="border-y border-line bg-surface/40">
        <div className="mx-auto grid max-w-6xl gap-10 px-6 py-16 lg:grid-cols-2">
          <div>
            <h2 className="text-2xl font-bold">Team intelligence that compounds</h2>
            <p className="mt-4 max-w-md text-[14px] leading-relaxed text-text-dim">
              Every analyzed match deepens your historical dataset. Site
              preferences, execute timings, and rotation habits become clearer
              with each VOD.
            </p>
          </div>
          <Card>
            <div className="text-[12px] font-semibold uppercase tracking-[0.14em] text-text-dim">
              Team Analysis — Ascent, Attack
            </div>
            <div className="mt-4 space-y-3">
              {SITE_STATS.map((s) => (
                <div key={s.label}>
                  <div className="mb-1 flex justify-between text-[13px]">
                    <span>{s.label}</span>
                    <span className="tabular font-semibold">{s.value}%</span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-surface-3">
                    <div
                      className="h-full rounded-full bg-accent"
                      style={{ width: `${s.value}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-4 border-t border-line pt-3 text-[12px] text-text-faint">
              27 matches · 84 attack rounds analyzed
            </div>
          </Card>
        </div>
      </section>

      {/* AI scouting */}
      <section className="mx-auto max-w-6xl px-6 py-16">
        <div className="grid gap-10 lg:grid-cols-2">
          <Card>
            <div className="text-[12px] font-semibold uppercase tracking-[0.14em] text-text-dim">
              AI Analyst
            </div>
            <p className="mt-3 text-[14px] leading-relaxed">
              &ldquo;Team X frequently pressures Mid before transitioning into
              A executions.&rdquo;
            </p>
            <div className="mt-4 space-y-1 text-[12px] text-text-faint">
              <div>Evidence: 31 occurrences across 84 rounds · 27 matches</div>
              <div>Confidence: 81%</div>
              <Link href="/analytics/patterns" className="text-info hover:underline">
                View supporting rounds →
              </Link>
            </div>
          </Card>
          <div className="flex flex-col justify-center">
            <h2 className="text-2xl font-bold">Answers with evidence, not vibes</h2>
            <p className="mt-4 max-w-md text-[14px] leading-relaxed text-text-dim">
              The AI analyst only interprets structured data VCTanalyzer
              extracted from your VODs. Every claim links back to the exact
              rounds and timestamps that prove it.
            </p>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="border-t border-line bg-surface/40">
        <div className="mx-auto max-w-6xl px-6 py-20 text-center">
          <h2 className="text-3xl font-bold">
            Start understanding the game beyond the scoreboard.
          </h2>
          <div className="mt-8 flex justify-center gap-3">
            <LinkButton href="/register" variant="primary">
              Start Analyzing
            </LinkButton>
            <LinkButton href="/dashboard">Explore Demo</LinkButton>
          </div>
        </div>
      </section>

      <footer className="border-t border-line py-8 text-center text-[12px] text-text-faint">
        VCTanalyzer — Valorant Esports VOD Analysis &amp; Tactical Intelligence
      </footer>
    </div>
  );
}
