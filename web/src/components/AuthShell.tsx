import Link from "next/link";
import type { ReactNode } from "react";

export function AuthShell({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
  footer: ReactNode;
}) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-bg px-6">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <Link href="/" className="inline-flex items-center gap-2">
            <span className="text-[18px] font-bold tracking-wide text-accent">VCT</span>
            <span className="text-[18px] font-bold tracking-wide">analyzer</span>
          </Link>
        </div>
        <div className="rounded-lg border border-line bg-surface p-6">
          <h1 className="text-[19px] font-bold">{title}</h1>
          <p className="mt-1 text-[13px] text-text-dim">{subtitle}</p>
          <div className="mt-6">{children}</div>
        </div>
        <div className="mt-4 text-center text-[13px] text-text-dim">{footer}</div>
      </div>
    </div>
  );
}
