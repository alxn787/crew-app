"use client";

import { useState } from "react";
import { defaultReportMinutes, resolveDuty } from "@/lib/fdtl/resolve";
import { KNOWN_AIRPORTS, airportName, airportOffset, fmtDur, isValidHHMM, localTime } from "@/lib/fdtl/time";
import { DUTY_LABELS, type DutyInput, type DutyKind, type SectorInput, type Settings } from "@/lib/fdtl/types";
import { Sheet, btn, inputCls } from "./ui";

const KINDS: DutyKind[] = ["flight", "home_standby", "airport_standby", "training", "office", "leave", "off"];

const blankSector = (from: string): SectorInput => ({ from, to: "", dep: "", arr: "", positioning: false });

export function DutyForm({
  initial,
  date,
  settings,
  onSave,
  onDelete,
  onClose,
}: {
  initial?: DutyInput;
  date: string;
  settings: Settings;
  onSave: (d: DutyInput) => void;
  onDelete?: () => void;
  onClose: () => void;
}) {
  const [d, setD] = useState<DutyInput>(
    () =>
      initial ?? {
        id: crypto.randomUUID(),
        kind: "flight",
        date,
        sectors: [blankSector(settings.homeBase)],
      },
  );
  const set = (patch: Partial<DutyInput>) => setD((p) => ({ ...p, ...patch }));
  const sectors = d.sectors ?? [blankSector(settings.homeBase)];
  const setSector = (i: number, patch: Partial<SectorInput>) =>
    set({ sectors: sectors.map((s, j) => (j === i ? { ...s, ...patch } : s)) });

  const isTimed = d.kind !== "flight" && d.kind !== "leave" && d.kind !== "off";
  const errors: string[] = [];
  if (!d.date) errors.push("Pick a date.");
  if (d.kind === "flight") {
    sectors.forEach((s, i) => {
      if (!/^[A-Z]{3}$/.test(s.from) || !/^[A-Z]{3}$/.test(s.to)) errors.push(`Sector ${i + 1}: enter 3-letter airport codes.`);
      if (!isValidHHMM(s.dep) || !isValidHHMM(s.arr)) errors.push(`Sector ${i + 1}: enter departure and arrival times.`);
    });
    if (d.reportOverride && !isValidHHMM(d.reportOverride)) errors.push("Report time must be HH:MM.");
  }
  if (isTimed && (!d.start || !d.end)) errors.push("Enter start and end times.");

  const clean = (): DutyInput => {
    const base = { id: d.id, kind: d.kind, date: d.date, note: d.note?.trim() || undefined };
    if (d.kind === "flight") return { ...base, sectors, reportOverride: d.reportOverride || undefined };
    if (isTimed) return { ...base, start: d.start, end: d.end };
    return { ...base, endDate: d.endDate && d.endDate > d.date ? d.endDate : undefined };
  };
  const preview = errors.length === 0 ? resolveDuty(clean(), settings) : null;

  const reportMin = defaultReportMinutes(sectors, settings);
  const firstOff = airportOffset(sectors[0]?.from ?? "BLR");

  return (
    <Sheet title={initial ? "Edit duty" : "Add duty"} onClose={onClose}>
      <div className="space-y-4">
        <div className="flex flex-wrap gap-1.5">
          {KINDS.map((k) => (
            <button
              key={k}
              type="button"
              onClick={() =>
                set({
                  kind: k,
                  sectors: k === "flight" ? sectors : d.sectors,
                  start: d.start ?? (k === "home_standby" || k === "airport_standby" ? "04:00" : "09:00"),
                  end: d.end ?? (k === "home_standby" ? "16:00" : k === "airport_standby" ? "12:00" : "17:00"),
                })
              }
              className={`rounded-full border px-3 py-1 text-sm ${
                d.kind === k
                  ? "border-sky-600 bg-sky-600 text-white"
                  : "border-stone-300 text-stone-700 hover:bg-stone-100 dark:border-stone-600 dark:text-stone-200 dark:hover:bg-stone-800"
              }`}
            >
              {DUTY_LABELS[k]}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <label className="text-sm">
            <span className="mb-1 block text-stone-600 dark:text-stone-300">
              {d.kind === "flight" ? "Date of first departure" : d.kind === "leave" || d.kind === "off" ? "From" : "Date"}
            </span>
            <input type="date" className={inputCls} value={d.date} onChange={(e) => set({ date: e.target.value })} />
          </label>
          {(d.kind === "leave" || d.kind === "off") && (
            <label className="text-sm">
              <span className="mb-1 block text-stone-600 dark:text-stone-300">To (optional)</span>
              <input type="date" className={inputCls} value={d.endDate ?? ""} min={d.date} onChange={(e) => set({ endDate: e.target.value })} />
            </label>
          )}
        </div>

        {isTimed && (
          <div className="grid grid-cols-2 gap-3">
            <label className="text-sm">
              <span className="mb-1 block text-stone-600 dark:text-stone-300">Start (IST)</span>
              <input type="time" className={inputCls} value={d.start ?? ""} onChange={(e) => set({ start: e.target.value })} />
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-stone-600 dark:text-stone-300">End (IST)</span>
              <input type="time" className={inputCls} value={d.end ?? ""} onChange={(e) => set({ end: e.target.value })} />
            </label>
            {(d.kind === "home_standby" || d.kind === "airport_standby") && (
              <p className="col-span-2 text-xs text-stone-500 dark:text-stone-400">
                If you get called, add the flight as a separate duty with its real report time — the app links it to
                this standby automatically.
              </p>
            )}
          </div>
        )}

        {d.kind === "flight" && (
          <div className="space-y-3">
            <p className="text-xs text-stone-500 dark:text-stone-400">
              Times are local at each airport (IST in India, local time in the Gulf). Arrivals after midnight roll over
              automatically.
            </p>
            {sectors.map((s, i) => (
              <div key={i} className="rounded-xl border border-stone-200 p-3 dark:border-stone-700">
                <div className="mb-2 flex items-center justify-between text-xs font-medium text-stone-500">
                  <span>Sector {i + 1}</span>
                  <div className="flex items-center gap-3">
                    <label className="flex items-center gap-1.5">
                      <input
                        type="checkbox"
                        checked={s.positioning}
                        onChange={(e) => setSector(i, { positioning: e.target.checked })}
                      />
                      Positioning (not operating)
                    </label>
                    {sectors.length > 1 && (
                      <button type="button" className="text-rose-600" onClick={() => set({ sectors: sectors.filter((_, j) => j !== i) })}>
                        Remove
                      </button>
                    )}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-x-2 gap-y-3 sm:grid-cols-4">
                  {(["from", "to"] as const).map((f) => (
                    <label key={f} className="text-[11px] text-stone-500">
                      <input
                        aria-label={f === "from" ? "From" : "To"}
                        placeholder={f === "from" ? "From" : "To"}
                        list="airports"
                        maxLength={3}
                        className={`${inputCls} uppercase`}
                        value={s[f]}
                        onChange={(e) => setSector(i, { [f]: e.target.value.toUpperCase() })}
                      />
                      <span className="mt-0.5 block h-4 truncate">
                        {airportName(s[f]) ?? (s[f].length === 3 ? "assumed IST" : "")}
                      </span>
                    </label>
                  ))}
                  {(["dep", "arr"] as const).map((f) => (
                    <label key={f} className="text-[11px] text-stone-500">
                      <input
                        type="time"
                        aria-label={f === "dep" ? "Off blocks" : "On blocks"}
                        className={inputCls}
                        value={s[f]}
                        onChange={(e) => setSector(i, { [f]: e.target.value })}
                      />
                      <span className="mt-0.5 block">{f === "dep" ? "Off blocks (local)" : "On blocks (local)"}</span>
                    </label>
                  ))}
                </div>
              </div>
            ))}
            <button
              type="button"
              className={btn.ghost}
              onClick={() => {
                const last = sectors.at(-1)!;
                set({ sectors: [...sectors, { ...blankSector(last.to), to: last.from }] });
              }}
            >
              + Add sector
            </button>

            <label className="block text-sm">
              <span className="mb-1 block text-stone-600 dark:text-stone-300">Report time</span>
              <input
                type="time"
                className={inputCls}
                value={d.reportOverride ?? ""}
                onChange={(e) => set({ reportOverride: e.target.value })}
              />
              <span className="mt-1 block text-xs text-stone-500">
                Leave blank to use {reportMin} min before first departure
                {sectors[0]?.dep && isValidHHMM(sectors[0].dep) && preview
                  ? ` (${localTime(preview.start, firstOff)})`
                  : ""}
                . Change the default in Settings.
              </span>
            </label>
          </div>
        )}

        <label className="block text-sm">
          <span className="mb-1 block text-stone-600 dark:text-stone-300">Note (optional)</span>
          <input className={inputCls} value={d.note ?? ""} onChange={(e) => set({ note: e.target.value })} placeholder="e.g. QP 1402" />
        </label>

        {preview && d.kind === "flight" && (
          <div className="rounded-lg bg-stone-100 px-3 py-2 text-sm dark:bg-stone-800">
            {preview.landings} landing{preview.landings === 1 ? "" : "s"} · flight time {fmtDur(preview.flightTime)}
            {preview.fdpEnd && <> · FDP {fmtDur(preview.fdpEnd - preview.start)}</>}
          </div>
        )}

        {errors.length > 0 && <p className="text-sm text-rose-600">{errors[0]}</p>}

        <div className="flex items-center justify-between pt-1">
          {onDelete ? (
            <button type="button" className={btn.danger} onClick={onDelete}>
              Delete
            </button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <button type="button" className={btn.ghost} onClick={onClose}>
              Cancel
            </button>
            <button type="button" className={btn.primary} disabled={errors.length > 0} onClick={() => onSave(clean())}>
              Save
            </button>
          </div>
        </div>
      </div>
      <datalist id="airports">
        {KNOWN_AIRPORTS.map((c) => (
          <option key={c} value={c}>
            {airportName(c)}
          </option>
        ))}
      </datalist>
    </Sheet>
  );
}
