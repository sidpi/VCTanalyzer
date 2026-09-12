"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

/* Sidebar navigation (Website Plan §27) */

const NAV = [
  { href: "/dashboard", label: "Dashboard", icon: "⌂" },
  {
    label: "Teams",
    items: [
      { href: "/teams", label: "All Teams" },
      { href: "/teams/new", label: "Add Team" },
    ],
  },
  {
    label: "Matches",
    items: [
      { href: "/matches", label: "All Matches" },
      { href: "/matches/new", label: "Upload VOD" },
    ],
  },
  {
    label: "Analytics",
    items: [
      { href: "/analytics/heatmaps", label: "Heatmaps" },
      { href: "/analytics/movement", label: "Movement" },
      { href: "/analytics/patterns", label: "Patterns" },
    ],
  },
  { href: "/reports", label: "Reports", icon: "▤" },
  { href: "/admin", label: "Admin", icon: "⚙" },
  { href: "/settings", label: "Settings", icon: "⚙" },
] as const;

function isActive(pathname: string, href: string) {
  if (href === "/dashboard") return pathname === "/dashboard";
  return pathname === href || pathname.startsWith(href + "/");
}

export function Sidebar() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <>
      {/* Mobile toggle */}
      <button
        className="fixed left-3 top-3 z-40 cursor-pointer rounded-md border border-line-2 bg-surface px-2.5 py-2 text-text-dim lg:hidden"
        onClick={() => setOpen(!open)}
        aria-label="Toggle navigation"
      >
        ☰
      </button>

      <aside
        className={`fixed inset-y-0 left-0 z-30 flex w-56 flex-col border-r border-line bg-surface transition-transform lg:translate-x-0 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex h-14 items-center gap-2 border-b border-line px-4">
          <span className="text-[15px] font-bold tracking-wide text-accent">
            VCT
          </span>
          <span className="text-[15px] font-bold tracking-wide">analyzer</span>
        </div>

        <nav className="flex-1 overflow-y-auto px-2 py-3">
          {NAV.map((entry) => {
            if ("items" in entry && entry.items) {
              return (
                <div key={entry.label} className="mb-3">
                  <div className="px-2.5 pb-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-text-faint">
                    {entry.label}
                  </div>
                  {entry.items.map((item) => (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setOpen(false)}
                      className={`block rounded-md px-2.5 py-1.5 text-[13px] transition-colors ${
                        isActive(pathname, item.href)
                          ? "bg-surface-3 font-semibold text-text"
                          : "text-text-dim hover:bg-surface-2 hover:text-text"
                      }`}
                    >
                      {item.label}
                    </Link>
                  ))}
                </div>
              );
            }
            const href = (entry as { href: string }).href;
            const label = (entry as { label: string }).label;
            const icon = "icon" in entry ? (entry as { icon?: string }).icon : undefined;
            return (
              <Link
                key={href}
                href={href}
                onClick={() => setOpen(false)}
                className={`mb-0.5 flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-[13px] transition-colors ${
                  isActive(pathname, href)
                    ? "bg-surface-3 font-semibold text-text"
                    : "text-text-dim hover:bg-surface-2 hover:text-text"
                }`}
              >
                {icon ? <span className="w-4 text-center text-text-faint">{icon}</span> : null}
                {label}
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-line px-4 py-3">
          <div className="text-[12px] font-semibold">Coach</div>
          <div className="text-[11px] text-text-faint">coach@fnatic.gg</div>
        </div>
      </aside>

      {open ? (
        <div
          className="fixed inset-0 z-20 bg-black/60 lg:hidden"
          onClick={() => setOpen(false)}
        />
      ) : null}
    </>
  );
}
