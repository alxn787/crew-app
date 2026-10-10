"use client";

import { cumulativeOn, type Analysis } from "@/lib/fdtl/engine";
import { HOUR, fmtDur, fmtIst } from "@/lib/fdtl/time";
import { Meter } from "./ui";

export function LimitsCard({
  analysis,
  day,
  firstDay,
  plain = false,
}: {
  analysis: Analysis;
  day: string;
  firstDay: string | null;
  /** Skip the card chrome when a parent already provides it. */
  plain?: boolean;
}) {
  const rows = cumulativeOn(analysis, day);
  const { weeklyDeadline, rules } = analysis;
  return (
    <section className={plain ? "" : "rounded-2xl border border-stone-200 bg-white p-4 dark:border-stone-800 dark:bg-stone-900"}>
      {!plain && <h2 className="font-semibold">Running totals</h2>}
      <p className="mb-3 text-xs text-stone-500">
        Windows ending {new Date(`${day}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" })}
        {firstDay && ` · counting entries from ${firstDay}`}
      </p>
      <div className="space-y-3">
        {rows.map((r) => (
          <div key={r.days} className="space-y-1.5">
            <div className="text-xs font-medium">{r.days} days</div>
            {r.ft !== undefined && (
              <Meter used={r.ftUsed} max={r.ft} label="Flight time" value={`${fmtDur(r.ftUsed)} / ${r.ft / HOUR}h`} />
            )}
            {r.duty !== undefined && (
              <Meter used={r.dutyUsed} max={r.duty} label="Duty" value={`${fmtDur(r.dutyUsed)} / ${r.duty / HOUR}h`} />
            )}
          </div>
        ))}
      </div>
      {weeklyDeadline !== null && (
        <p className="mt-4 rounded-lg bg-stone-100 px-3 py-2 text-sm dark:bg-stone-800">
          Next weekly rest ({rules.weekly.hours / HOUR}h incl. {rules.weekly.nights} local nights) must start by{" "}
          <span className="font-semibold">{fmtIst(weeklyDeadline)}</span>
          {analysis.weeklyRests.length === 0 && (
            <span className="block text-xs text-stone-500">
              No weekly rest found in your entries yet — this assumes you were rested before your first entry. Add your last
              weekly off for an accurate deadline.
            </span>
          )}
        </p>
      )}
    </section>
  );
}
