import { Badge, Button, Card, Field, SectionTitle, Select, TextInput } from "@/components/ui";

/* Settings — including privacy controls (Master Plan §49-50) */

export default function SettingsPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <div>
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="mt-0.5 text-[13px] text-text-dim">
          Profile, organization, and privacy controls.
        </p>
      </div>

      <Card>
        <SectionTitle>Profile</SectionTitle>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field label="Name">
            <TextInput defaultValue="Head Coach" />
          </Field>
          <Field label="Email">
            <TextInput type="email" defaultValue="coach@fnatic.gg" />
          </Field>
        </div>
      </Card>

      <Card>
        <SectionTitle>Organization</SectionTitle>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field label="Organization">
            <TextInput defaultValue="FNATIC" />
          </Field>
          <Field label="Your role" hint="Roles: Owner, Admin, Coach, Analyst, Player, Viewer.">
            <Select
              options={[
                { value: "coach", label: "Coach — full analysis" },
                { value: "admin", label: "Admin" },
                { value: "analyst", label: "Analyst — upload + analysis" },
                { value: "player", label: "Player — view reports" },
                { value: "viewer", label: "Viewer — read-only" },
              ]}
              defaultValue="coach"
            />
          </Field>
        </div>
      </Card>

      <Card>
        <div className="flex items-center justify-between">
          <SectionTitle>Privacy</SectionTitle>
          <Badge tone="warning">Scrims are sensitive</Badge>
        </div>
        <div className="mt-4 space-y-2.5 text-[13px]">
          {[
            ["VODs private by default", "Enabled", true],
            ["Analysis private by default", "Enabled", true],
            ["Use my data for global models", "Disabled", false],
          ].map(([label, value]) => (
            <div key={label as string} className="flex items-center justify-between border-b border-line pb-2 last:border-0">
              <span className="text-text-dim">{label}</span>
              <Badge tone={value ? "success" : "neutral"}>{value as string}</Badge>
            </div>
          ))}
        </div>
        <p className="mt-3 text-[11.5px] leading-relaxed text-text-faint">
          VCTanalyzer never exposes private strategies publicly. Teams control
          access; private data is excluded from global models without explicit
          permission (Master Plan §50).
        </p>
      </Card>

      <Card className="border-loss/30">
        <SectionTitle>Danger zone</SectionTitle>
        <p className="mt-2 text-[13px] text-text-dim">
          Delete all VODs, analyses, and reports for this organization. This
          cannot be undone.
        </p>
        <div className="mt-3">
          <Button variant="secondary" className="border-loss/40 text-loss hover:bg-loss/10">
            Delete organization data…
          </Button>
        </div>
      </Card>

      <div className="flex justify-end">
        <Button variant="primary">Save changes</Button>
      </div>
    </div>
  );
}
