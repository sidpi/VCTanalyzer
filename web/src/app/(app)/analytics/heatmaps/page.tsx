import { HeatmapViewer } from "@/components/HeatmapViewer";

export default function HeatmapsPage() {
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold">Heatmaps</h1>
        <p className="mt-0.5 text-[13px] text-text-dim">
          Presence, kills, deaths, and contact heatmaps across matches, sides,
          and players.
        </p>
      </div>
      <HeatmapViewer />
    </div>
  );
}
