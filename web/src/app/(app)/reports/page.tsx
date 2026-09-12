import { Badge, Card, LinkButton, SectionTitle } from "@/components/ui";
import { AIAnalyst } from "@/components/AIAnalyst";
import { getTeam } from "@/lib/mockData";

/* Reports (Website Plan §26, Master Plan §36) */

export default function ReportsPage() {
  const fnatic = getTeam("fnatic");
  const g2 = getTeam("g2");

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold">Reports</h1>
        <p className="mt-0.5 text-[13px] text-text-dim">
          Generated scouting and review reports, each claim backed by rounds
          and events.
        </p>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        {/* Opponent scouting report */}
        <Card>
          <div className="flex items-center justify-between">
            <SectionTitle>Opponent scouting report</SectionTitle>
            <Badge tone="accent">{g2?.name}</Badge>
          </div>
          <div className="mt-4 space-y-3 text-[13px]">
            {[
              ["Attack tendency", "Mid-heavy defaults into fast A executes"],
              ["Defense tendency", "Early B Main contests 40% of rounds"],
              ["Common execute", "00:48 avg — Mid pressure → A"],
              ["Weak area", "Retakes without utility (23% success)"],
              ["Recent change", "Increased B aggression in last 3 matches"],
              ["Preparation focus", "Anti-flank coverage on A executes"],
            ].map(([k, v]) => (
              <div key={k} className="flex justify-between gap-4 border-b border-line pb-2 last:border-0">
                <span className="text-text-dim">{k}</span>
                <span className="text-right font-medium">{v}</span>
              </div>
            ))}
          </div>
          <div className="mt-4 text-[11.5px] text-text-faint">
            Based on 19 matches · 61 attack rounds · confidence 74%
          </div>
        </Card>

        {/* Team review */}
        <Card>
          <div className="flex items-center justify-between">
            <SectionTitle>Team review</SectionTitle>
            <Badge tone="info">{fnatic?.name}</Badge>
          </div>
          <div className="mt-4 space-y-3 text-[13px]">
            {[
              ["Performance", "7W–3L across last 10 analyzed maps"],
              ["Repeated mistake", "Late rotations after losing mid control"],
              ["Successful pattern", "Mid pressure → A execute (81% conf.)"],
              ["Player trend", "Entry success up 6% in last 5 matches"],
              ["Map trend", "Haven C-side control improving"],
              ["Strategy evolution", "Default A → mid-centric setups"],
            ].map(([k, v]) => (
              <div key={k} className="flex justify-between gap-4 border-b border-line pb-2 last:border-0">
                <span className="text-text-dim">{k}</span>
                <span className="text-right font-medium">{v}</span>
              </div>
            ))}
          </div>
          <div className="mt-4 text-[11.5px] text-text-faint">
            Based on 42 matches · 1,024 rounds · updated daily
          </div>
        </Card>
      </div>

      {/* Match report */}
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <SectionTitle>Match report — FNATIC vs G2 · Ascent</SectionTitle>
          <LinkButton href="/matches/m1">Open match</LinkButton>
        </div>
        <p className="mt-3 text-[13px] leading-relaxed text-text-dim">
          FNATIC controlled the map through mid-centric defaults, converting
          61% of rounds where first mid contact was won. Round 12 was the
          pivotal loss: a 4v3 post-plant collapsed during the retake. G2&apos;s
          eco aggression cost them rounds 9 and 17.
        </p>
      </Card>

      <AIAnalyst />
    </div>
  );
}
