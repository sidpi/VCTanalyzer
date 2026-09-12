"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { AuthShell } from "@/components/AuthShell";
import { Button, Field, TextInput } from "@/components/ui";
import { apiRegister, ApiError } from "@/lib/api";

export default function RegisterPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  return (
    <AuthShell
      title="Create account"
      subtitle="Start turning your VODs into tactical intelligence."
      footer={
        <>
          Already have an account?{" "}
          <Link href="/login" className="text-info hover:underline">
            Sign in
          </Link>
        </>
      }
    >
      <form
        className="space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          const form = new FormData(e.currentTarget);
          setError(null);
          setBusy(true);
          try {
            await apiRegister(
              String(form.get("email") ?? ""),
              String(form.get("password") ?? ""),
              String(form.get("displayName") ?? "") || "Analyst",
              String(form.get("orgName") ?? "") || undefined,
            );
            router.push("/matches/new");
          } catch (err) {
            setError(
              err instanceof ApiError ? err.message : "Registration failed. Try again.",
            );
          } finally {
            setBusy(false);
          }
        }}
      >
        <Field label="Email">
          <TextInput name="email" type="email" required placeholder="coach@team.gg" />
        </Field>
        <Field label="Display name">
          <TextInput name="displayName" required placeholder="Head Coach" />
        </Field>
        <Field
          label="Organization"
          hint="Creates your org. Team management comes next."
        >
          <TextInput name="orgName" placeholder="e.g. FNATIC" />
        </Field>
        <Field label="Password" hint="At least 8 characters.">
          <TextInput name="password" type="password" required minLength={8} />
        </Field>
        {error ? (
          <div className="rounded-md border border-loss/40 bg-loss/10 px-3 py-2 text-[13px] text-loss">
            {error}
          </div>
        ) : null}
        <Button type="submit" variant="primary" className="w-full" disabled={busy}>
          {busy ? "Creating account…" : "Create account"}
        </Button>
      </form>
    </AuthShell>
  );
}
