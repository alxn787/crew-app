"use client";

import { useEffect, type ReactNode } from "react";
import type { DutyKind, Finding, Level } from "@/lib/fdtl/types";

export const KIND_STYLE: Record<DutyKind, { chip: string; short: string }> = {
  flight: { chip: "bg-sky-100 text-sky-900 dark:bg-sky-900/50 dark:text-sky-100", short: "FLT" },
  home_standby: { chip: "bg-violet-100 text-violet-900 dark:bg-violet-900/50 dark:text-violet-100", short: "HSB" },
  airport_standby: { chip: "bg-fuchsia-100 text-fuchsia-900 dark:bg-fuchsia-900/50 dark:text-fuchsia-100", short: "ASB" },
  training: { chip: "bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-100", short: "TRG" },
  office: { chip: "bg-stone-200 text-stone-800 dark:bg-stone-700 dark:text-stone-100", short: "GND" },
  leave: { chip: "bg-teal-100 text-teal-900 dark:bg-teal-900/50 dark:text-teal-100", short: "LVE" },
  off: { chip: "bg-stone-100 text-stone-500 dark:bg-stone-800 dark:text-stone-400", short: "OFF" },
};

export const LEVEL_STYLE: Record<Level, { text: string; bg: string; ring: string; label: string; icon: string }> = {
  breach: {
    text: "text-rose-700 dark:text-rose-300",
    bg: "bg-rose-50 dark:bg-rose-950/50",
    ring: "ring-2 ring-rose-500",
    label: "Not legal",
    icon: "✕",
  },
  warn: {
    text: "text-amber-700 dark:text-amber-300",
    bg: "bg-amber-50 dark:bg-amber-950/40",
    ring: "ring-2 ring-amber-400",
    label: "Close to a limit",
    icon: "!",
  },
  info: {
    text: "text-sky-700 dark:text-sky-300",
    bg: "bg-sky-50 dark:bg-sky-950/40",
    ring: "",
    label: "Note",
    icon: "i",
  },
};

export function FindingList({ findings }: { findings: Finding[] }) {
  if (!findings.length) return null;
  return (
    <ul className="space-y-1.5">
      {findings.map((f) => {
        const s = LEVEL_STYLE[f.level];
        return (
          <li key={f.key} className={`flex gap-2 rounded-lg px-3 py-2 text-sm ${s.bg}`}>
            <span className={`mt-px font-bold ${s.text}`} aria-label={s.label}>
              {s.icon}
            </span>
            <span>
              <span className={s.text}>{f.message}</span>{" "}
              <span className="whitespace-nowrap text-xs text-stone-500 dark:text-stone-400">{f.rule}</span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}

export function Meter({ used, max, label, value }: { used: number; max: number; label: ReactNode; value: ReactNode }) {
  const pct = Math.min(100, (used / max) * 100);
  const color = used > max ? "bg-rose-500" : used > max * 0.9 ? "bg-amber-400" : "bg-emerald-500";
  return (
    <div>
      <div className="flex justify-between text-xs">
        <span className="text-stone-600 dark:text-stone-300">{label}</span>
        <span className="tabular-nums">{value}</span>
      </div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-stone-200 dark:bg-stone-700">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export function Stat({ label, value, sub }: { label: string; value: ReactNode; sub?: ReactNode }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wide text-stone-500 dark:text-stone-400">{label}</div>
      <div className="font-medium tabular-nums">{value}</div>
      {sub && <div className="text-xs break-words text-stone-500 dark:text-stone-400">{sub}</div>}
    </div>
  );
}

export function Sheet({
  title,
  onClose,
  children,
  dismissible = true,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  /** When false, the sheet stays up until the caller closes it. */
  dismissible?: boolean;
}) {
  useEffect(() => {
    if (!dismissible) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, dismissible]);
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center"
      onClick={dismissible ? onClose : undefined}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="max-h-[92dvh] w-full overflow-y-auto rounded-t-2xl bg-white p-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-xl sm:max-w-lg sm:rounded-2xl sm:pb-4 dark:bg-stone-900"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold">{title}</h2>
          {dismissible && (
            <button onClick={onClose} className="rounded-full px-2 py-1 text-stone-500 hover:bg-stone-100 dark:hover:bg-stone-800" aria-label="Close">
              ✕
            </button>
          )}
        </div>
        {children}
      </div>
    </div>
  );
}

export const inputCls =
  "w-full rounded-lg border border-stone-300 bg-white px-3 py-2.5 text-base text-stone-900 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-500/30 sm:text-sm dark:border-stone-600 dark:bg-stone-800 dark:text-stone-100";

export const btn = {
  primary: "min-h-11 rounded-lg bg-sky-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-sky-700 disabled:opacity-40",
  ghost: "min-h-11 rounded-lg px-3 py-2 text-sm text-stone-600 hover:bg-stone-100 dark:text-stone-300 dark:hover:bg-stone-800",
  danger: "min-h-11 rounded-lg px-3 py-2 text-sm text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950",
};
