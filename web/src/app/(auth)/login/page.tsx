"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { AuthShell } from "@/components/AuthShell";
import { Button, Field, TextInput } from "@/components/ui";
import { apiLogin, ApiError } from "@/lib/api";

export default function LoginPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  return (
    <AuthShell
      title="Sign in"
      subtitle="Access your team's tactical intelligence."
      footer={
        <>
          No account?{" "}
          <Link href="/register" className="text-info hover:underline">
            Create one
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
            await apiLogin(
              String(form.get("email") ?? ""),
              String(form.get("password") ?? ""),
            );
            router.push("/matches/new");
          } catch (err) {
            setError(
              err instanceof ApiError ? err.message : "Sign in failed. Try again.",
            );
          } finally {
            setBusy(false);
          }
        }}
      >
        <Field label="Email">
          <TextInput name="email" type="email" required placeholder="coach@team.gg" />
        </Field>
        <Field label="Password">
          <TextInput name="password" type="password" required placeholder="••••••••" />
        </Field>
        {error ? (
          <div className="rounded-md border border-loss/40 bg-loss/10 px-3 py-2 text-[13px] text-loss">
            {error}
          </div>
        ) : null}
        <div className="flex justify-end">
          <Link href="/forgot-password" className="text-[12px] text-info hover:underline">
            Forgot password?
          </Link>
        </div>
        <Button type="submit" variant="primary" className="w-full" disabled={busy}>
          {busy ? "Signing in…" : "Sign in"}
        </Button>
      </form>
    </AuthShell>
  );
}
