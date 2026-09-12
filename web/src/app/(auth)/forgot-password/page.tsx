"use client";

import Link from "next/link";
import { AuthShell } from "@/components/AuthShell";
import { Button, Field, TextInput } from "@/components/ui";

export default function ForgotPasswordPage() {
  return (
    <AuthShell
      title="Reset password"
      subtitle="We'll email you a reset link."
      footer={
        <Link href="/login" className="text-info hover:underline">
          Back to sign in
        </Link>
      }
    >
      <form className="space-y-4" onSubmit={(e) => e.preventDefault()}>
        <Field label="Email">
          <TextInput type="email" required placeholder="coach@team.gg" />
        </Field>
        <Button type="submit" variant="primary" className="w-full">
          Send reset link
        </Button>
      </form>
    </AuthShell>
  );
}
