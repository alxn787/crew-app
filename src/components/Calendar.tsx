"use client";

import { addDays, airportOffset, localTime } from "@/lib/fdtl/time";
import type { Level, ResolvedDuty } from "@/lib/fdtl/types";
import { KIND_STYLE, LEVEL_STYLE } from "./ui";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function chipText(d: ResolvedDuty) {
  if (d.kind === "flight") {
    const off = airportOffset(d.sectors[0]?.from ?? "BLR");
    return `${localTime(d.start, off)} ${d.label}`;
  }
  if (d.kind === "leave" || d.kind === "off") return d.label;
  return `${KIND_STYLE[d.kind].short} ${localTime(d.start)}–${localTime(d.end)}`;
}

export function Calendar({
  month,
  selected,
  today,
  dutiesByDay,
  statusByDay,
  onSelect,
  onMonth,
}: {
  month: string; // YYYY-MM
  selected: string;
  today: string;
  dutiesByDay: Map<string, ResolvedDuty[]>;
  statusByDay: Map<string, Level>;
  onSelect: (day: string) => void;
  onMonth: (delta: number) => void;
}) {
  const first = `${month}-01`;
  const [y, m] = month.split("-").map(Number);
  const weekday = (new Date(Date.UTC(y, m - 1, 1)).getUTCDay() + 6) % 7;
  const gridStart = addDays(first, -weekday);
  const days = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));
  const weeks = days[35].startsWith(month) ? 6 : 5;
  const title = new Date(Date.UTC(y, m - 1, 1)).toLocaleString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });

  return (
    <section className="rounded-2xl border border-stone-200 bg-white p-2 sm:p-4 dark:border-stone-800 dark:bg-stone-900">
      <div className="mb-2 flex items-center justify-between sm:mb-3">
        <button onClick={() => onMonth(-1)} className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg text-lg hover:bg-stone-100 dark:hover:bg-stone-800" aria-label="Previous month">
          ‹
        </button>
        <h2 className="font-semibold">{title}</h2>
        <button onClick={() => onMonth(1)} className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg text-lg hover:bg-stone-100 dark:hover:bg-stone-800" aria-label="Next month">
          ›
        </button>
      </div>
      <div className="grid grid-cols-7 gap-0.5 text-center text-[11px] font-medium text-stone-500 sm:gap-1">
        {WEEKDAYS.map((w) => (
          <div key={w}>
            <span className="sm:hidden">{w.slice(0, 1)}</span>
            <span className="hidden sm:inline">{w}</span>
          </div>
        ))}
      </div>
      <div className="mt-1 grid grid-cols-7 gap-0.5 sm:gap-1">
        {days.slice(0, weeks * 7).map((day) => {
          const ds = dutiesByDay.get(day) ?? [];
          const status = statusByDay.get(day);
          const inMonth = day.startsWith(month);
          const ring = status && status !== "info" ? LEVEL_STYLE[status].ring : "";
          return (
            <button
              key={day}
              aria-label={`${day}${ds.length ? `: ${ds.map((d) => d.label).join(", ")}` : ""}${status === "breach" ? " (not legal)" : ""}`}
              aria-pressed={day === selected}
              onClick={() => onSelect(day)}
              className={`flex min-h-14 flex-col items-stretch rounded-lg p-0.5 text-left sm:min-h-24 sm:p-1 ${ring} ${
                day === selected ? "bg-sky-50 outline-2 outline-sky-500 dark:bg-sky-950/60" : "hover:bg-stone-50 dark:hover:bg-stone-800"
              } ${inMonth ? "" : "opacity-40"}`}
            >
              <span className="flex items-center justify-between text-xs">
                <span
                  className={`tabular-nums ${
                    day === today ? "rounded-full bg-sky-600 px-1.5 font-semibold text-white" : ""
                  }`}
                >
                  {Number(day.slice(8))}
                </span>
                {status && status !== "info" && (
                  <span className={`text-[10px] font-bold ${LEVEL_STYLE[status].text}`}>{LEVEL_STYLE[status].icon}</span>
                )}
              </span>
              <span className="mt-0.5 flex flex-col gap-0.5">
                {ds.slice(0, 3).map((d, i) => (
                  <span
                    key={d.id}
                    className={`truncate rounded px-0.5 text-[10px] leading-4 sm:px-1 ${KIND_STYLE[d.kind].chip} ${i > 1 ? "hidden sm:block" : ""}`}
                  >
                    <span className="sm:hidden">{KIND_STYLE[d.kind].short}</span>
                    <span className="hidden sm:inline">{chipText(d)}</span>
                  </span>
                ))}
                {ds.length > 2 && <span className="text-[10px] text-stone-500 sm:hidden">+{ds.length - 2}</span>}
                {ds.length > 3 && <span className="hidden text-[10px] text-stone-500 sm:inline">+{ds.length - 3}</span>}
              </span>
            </button>
          );
        })}
      </div>
      <div className="mt-2 flex flex-nowrap gap-x-3 overflow-x-auto pb-1 text-[11px] whitespace-nowrap text-stone-500 sm:mt-3 sm:flex-wrap">
        <span className="flex shrink-0 items-center gap-1">
          <span className="inline-block size-3 rounded ring-2 ring-rose-500" /> not legal
        </span>
        <span className="flex shrink-0 items-center gap-1">
          <span className="inline-block size-3 rounded ring-2 ring-amber-400" /> close to a limit
        </span>
        {(["flight", "home_standby", "airport_standby", "training", "leave"] as const).map((k) => (
          <span key={k} className={`shrink-0 rounded px-1 ${KIND_STYLE[k].chip}`}>
            {KIND_STYLE[k].short}
          </span>
        ))}
      </div>
    </section>
  );
}
