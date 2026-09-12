import Link from "next/link";
import type { ReactNode } from "react";

/* ------------------------------------------------------------------ */
/* Card                                                                */
/* ------------------------------------------------------------------ */

export function Card({
  children,
  className = "",
  padded = true,
}: {
  children: ReactNode;
  className?: string;
  padded?: boolean;
}) {
  return (
    <div
      className={`rounded-lg border border-line bg-surface ${
        padded ? "p-4" : ""
      } ${className}`}
    >
      {children}
    </div>
  );
}

export function SectionTitle({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <h2
      className={`text-[13px] font-semibold uppercase tracking-[0.14em] text-text-dim ${className}`}
    >
      {children}
    </h2>
  );
}

/* ------------------------------------------------------------------ */
/* Button                                                              */
/* ------------------------------------------------------------------ */

const buttonVariants = {
  primary:
    "bg-accent text-white hover:bg-accent/85 border border-accent/60",
  secondary:
    "bg-surface-2 text-text border border-line-2 hover:bg-surface-3",
  ghost:
    "bg-transparent text-text-dim border border-transparent hover:bg-surface-2 hover:text-text",
} as const;

export function Button({
  children,
  variant = "secondary",
  className = "",
  type = "button",
  onClick,
  disabled,
}: {
  children: ReactNode;
  variant?: keyof typeof buttonVariants;
  className?: string;
  type?: "button" | "submit";
  onClick?: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex cursor-pointer items-center justify-center gap-2 rounded-md px-3.5 py-2 text-[13px] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${buttonVariants[variant]} ${className}`}
    >
      {children}
    </button>
  );
}

export function LinkButton({
  href,
  children,
  variant = "secondary",
  className = "",
}: {
  href: string;
  children: ReactNode;
  variant?: keyof typeof buttonVariants;
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={`inline-flex items-center justify-center gap-2 rounded-md px-3.5 py-2 text-[13px] font-semibold transition-colors ${buttonVariants[variant]} ${className}`}
    >
      {children}
    </Link>
  );
}

/* ------------------------------------------------------------------ */
/* Badge — semantic status / tag                                       */
/* ------------------------------------------------------------------ */

const badgeTones = {
  neutral: "bg-surface-3 text-text-dim border-line-2",
  info: "bg-info/10 text-info border-info/30",
  success: "bg-win/10 text-win border-win/30",
  danger: "bg-loss/10 text-loss border-loss/30",
  warning: "bg-warning/10 text-warning border-warning/30",
  accent: "bg-accent-soft text-accent border-accent/40",
} as const;

export function Badge({
  children,
  tone = "neutral",
  className = "",
}: {
  children: ReactNode;
  tone?: keyof typeof badgeTones;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${badgeTones[tone]} ${className}`}
    >
      {children}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* StatCard                                                            */
/* ------------------------------------------------------------------ */

export function StatCard({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: ReactNode;
  sub?: string;
  tone?: "win" | "loss" | "warning" | "info" | "accent";
}) {
  const valueColor =
    tone === "win"
      ? "text-win"
      : tone === "loss"
        ? "text-loss"
        : tone === "warning"
          ? "text-warning"
          : tone === "info"
            ? "text-info"
            : tone === "accent"
              ? "text-accent"
              : "text-text";
  return (
    <Card>
      <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-text-faint">
        {label}
      </div>
      <div className={`tabular mt-2 text-2xl font-bold ${valueColor}`}>
        {value}
      </div>
      {sub ? (
        <div className="mt-1 text-[12px] text-text-dim">{sub}</div>
      ) : null}
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* Tabs                                                                */
/* ------------------------------------------------------------------ */

export function Tabs({
  tabs,
  active,
  onSelect,
}: {
  tabs: string[];
  active: string;
  onSelect: (tab: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1 border-b border-line">
      {tabs.map((tab) => (
        <button
          key={tab}
          onClick={() => onSelect(tab)}
          className={`cursor-pointer px-3 py-2 text-[13px] font-medium transition-colors ${
            tab === active
              ? "border-b-2 border-accent text-text"
              : "border-b-2 border-transparent text-text-dim hover:text-text"
          }`}
        >
          {tab}
        </button>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* ProgressBar                                                         */
/* ------------------------------------------------------------------ */

export function ProgressBar({
  value,
  tone = "accent",
  className = "",
}: {
  value: number; // 0-100
  tone?: "accent" | "win" | "info" | "warning";
  className?: string;
}) {
  const barColor =
    tone === "win"
      ? "bg-win"
      : tone === "info"
        ? "bg-info"
        : tone === "warning"
          ? "bg-warning"
          : "bg-accent";
  return (
    <div
      className={`h-1.5 w-full overflow-hidden rounded-full bg-surface-3 ${className}`}
    >
      <div
        className={`h-full rounded-full ${barColor} transition-[width] duration-500`}
        style={{ width: `${Math.max(0, Math.min(100, value))}%` }}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Form fields (upload / match creation)                               */
/* ------------------------------------------------------------------ */

export function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[12px] font-semibold uppercase tracking-[0.12em] text-text-dim">
        {label}
      </span>
      {children}
      {hint ? (
        <span className="mt-1 block text-[12px] text-text-faint">{hint}</span>
      ) : null}
    </label>
  );
}

const fieldClasses =
  "w-full rounded-md border border-line-2 bg-surface-2 px-3 py-2 text-[13px] text-text placeholder:text-text-faint focus:border-accent focus:outline-none";

export function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`${fieldClasses} ${props.className ?? ""}`} />;
}

export function Select({
  options,
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement> & {
  options: { value: string; label: string }[];
}) {
  return (
    <select {...props} className={`${fieldClasses} ${props.className ?? ""}`}>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

/* ------------------------------------------------------------------ */
/* Tooltip (CSS-only)                                                  */
/* ------------------------------------------------------------------ */

export function Tooltip({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <span className="group relative inline-flex">
      {children}
      <span className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-1.5 -translate-x-1/2 whitespace-nowrap rounded border border-line-2 bg-surface-3 px-2 py-1 text-[11px] text-text opacity-0 transition-opacity group-hover:opacity-100">
        {label}
      </span>
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* EmptyState                                                          */
/* ------------------------------------------------------------------ */

export function EmptyState({
  title,
  body,
  action,
}: {
  title: string;
  body?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-line-2 px-6 py-14 text-center">
      <div className="text-[15px] font-semibold text-text">{title}</div>
      {body ? (
        <div className="mt-1 max-w-md text-[13px] text-text-dim">{body}</div>
      ) : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}
