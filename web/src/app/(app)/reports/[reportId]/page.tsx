import { Badge, Card, LinkButton, SectionTitle } from "@/components/ui";
import { getTeam } from "@/lib/mockData";

export default function ReportDetailPage() {
  const team = getTeam("g2");
  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div>
        <h1 className="text-2xl font-bold">Opponent scouting — {team?.name}</h1>
        <p className="mt-1 flex items-center gap-2 text-[13px] text-text-dim">
          <Badge tone="accent">Ascent</Badge>
          <Badge tone="info">Attack</Badge>
          <span>Generated 2026-09-12 · model_v3 · confidence 74%</span>
        </p>
      </div>

      <Card>
        <SectionTitle>Executive summary</SectionTitle>
        <p className="mt-2 text-[13.5px] leading-relaxed text-text-dim">
          {team?.name} defaults mid-heavy on Ascent attack, using early mid
          pressure to force rotations before executing A. Their execute timing
          is consistent (00:48 ± 6s). On defense they contest B Main early in
          40% of rounds. Their retake success without utility is weak (23%).
        </p>
      </Card>

      <Card>
        <SectionTitle>Evidence</SectionTitle>
        <div className="mt-3 space-y-2 text-[13px]">
          {[
            ["Mid pressure → A execute", "31 occurrences · 84 rounds · 27 matches · 81%"],
            ["Early B Main contests", "24 of 61 defense rounds · 72%"],
            ["Retakes without utility", "9 of 39 retakes succeeded · 23%"],
          ].map(([k, v]) => (
            <div key={k} className="flex flex-wrap justify-between gap-2 border-b border-line pb-2 last:border-0">
              <span className="font-medium">{k}</span>
              <span className="font-mono text-[12px] text-text-dim">{v}</span>
            </div>
          ))}
        </div>
      </Card>

      <div className="flex justify-end">
        <LinkButton href="/reports">Back to reports</LinkButton>
      </div>
    </div>
  );
}
