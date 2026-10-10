"use client";

import { useRef } from "react";
import { RULE_SETS } from "@/lib/fdtl/rules";
import { HOUR, fmtDur, hhmmToMin, isValidHHMM } from "@/lib/fdtl/time";
import type { DutyInput, RuleSetId, Settings } from "@/lib/fdtl/types";
import { Sheet, btn, inputCls } from "./ui";

export function SettingsSheet({
  settings,
  onChange,
  duties,
  onImport,
  onClear,
  onLogout,
  onClose,
}: {
  settings: Settings;
  onChange: (s: Settings) => void;
  duties: DutyInput[];
  onImport: (d: DutyInput[]) => void;
  onClear: () => void;
  onLogout: () => void;
  onClose: () => void;
}) {
  const file = useRef<HTMLInputElement>(null);
  const set = (patch: Partial<Settings>) => onChange({ ...settings, ...patch });
  const num = (k: keyof Settings) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = Number(e.target.value);
    if (Number.isFinite(v) && v >= 0) set({ [k]: v });
  };
  const nightEnd = isValidHHMM(settings.localNightStart) ? clock((hhmmToMin(settings.localNightStart) + 480) % 1440) : "";

  const exportData = () => {
    const blob = new Blob([JSON.stringify({ version: 1, settings, duties }, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `fdtl-roster-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const importData = async (f: File) => {
    try {
      const data = JSON.parse(await f.text());
      if (!Array.isArray(data.duties)) throw new Error();
      onImport(data.duties);
      if (data.settings) onChange({ ...settings, ...data.settings });
    } catch {
      alert("That file isn't a roster backup from this app.");
    }
  };

  return (
    <Sheet title="Settings" onClose={onClose}>
      <div className="space-y-5 text-sm">
        <fieldset>
          <legend className="mb-2 font-medium">DGCA rule set</legend>
          <div className="space-y-2">
            {(["IV", "V"] as RuleSetId[]).map((id) => {
              const r = RULE_SETS[id];
              return (
                <label key={id} className="flex gap-2 rounded-lg border border-stone-200 p-2.5 dark:border-stone-700">
                  <input type="radio" name="rules" checked={settings.ruleSet === id} onChange={() => set({ ruleSet: id })} />
                  <span>
                    <span className="font-medium">{r.name}</span>
                    <span className="block text-xs text-stone-500">{r.status}</span>
                    <a href={r.source} target="_blank" rel="noreferrer" className="text-xs text-sky-600 underline">
                      Source
                    </a>
                  </span>
                </label>
              );
            })}
          </div>
        </fieldset>

        <fieldset className="space-y-3">
          <legend className="mb-1 font-medium">Akasa scheme values</legend>
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
            These are placeholders. Akasa sets them in its DGCA-approved FDTL scheme — check your cabin crew manual or ask
            crew scheduling, then update them here.
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label>
              <span className="mb-1 block text-stone-600 dark:text-stone-300">Report before STD — domestic (min)</span>
              <input type="number" min={0} className={inputCls} value={settings.reportDomesticMin} onChange={num("reportDomesticMin")} />
            </label>
            <label>
              <span className="mb-1 block text-stone-600 dark:text-stone-300">Report before STD — international (min)</span>
              <input type="number" min={0} className={inputCls} value={settings.reportIntlMin} onChange={num("reportIntlMin")} />
            </label>
            <label>
              <span className="mb-1 block text-stone-600 dark:text-stone-300">Local night starts (8h)</span>
              <input
                type="time"
                className={inputCls}
                value={settings.localNightStart}
                onChange={(e) => isValidHHMM(e.target.value) && set({ localNightStart: e.target.value })}
              />
              <span className="mt-1 block text-xs text-stone-500">
                {settings.localNightStart}–{nightEnd} · must sit within 22:00–08:00
              </span>
            </label>
            <label>
              <span className="mb-1 block text-stone-600 dark:text-stone-300">Post-flight allowance (min)</span>
              <input type="number" min={0} className={inputCls} value={settings.postFlightMin} onChange={num("postFlightMin")} />
              <span className="mt-1 block text-xs text-stone-500">CAR: 30 min for scheduled ops</span>
            </label>
            <label>
              <span className="mb-1 block text-stone-600 dark:text-stone-300">Home base</span>
              <input
                className={`${inputCls} uppercase`}
                maxLength={3}
                value={settings.homeBase}
                onChange={(e) => set({ homeBase: e.target.value.toUpperCase() })}
              />
            </label>
            <label>
              <span className="mb-1 block text-stone-600 dark:text-stone-300">Typical turnaround (min)</span>
              <input type="number" min={0} className={inputCls} value={settings.turnaroundMin} onChange={num("turnaroundMin")} />
              <span className="mt-1 block text-xs text-stone-500">Used only for standby “what if” estimates</span>
            </label>
          </div>
        </fieldset>

        <RulesSummary id={settings.ruleSet} />

        <fieldset>
          <legend className="mb-2 font-medium">Your data</legend>
          <p className="mb-2 text-xs text-stone-500">
            Stored only in this browser on this device. Export a backup before clearing browser data or switching phones.
          </p>
          <div className="flex flex-wrap gap-2">
            <button className={btn.ghost} onClick={exportData}>
              Export backup
            </button>
            <button className={btn.ghost} onClick={() => file.current?.click()}>
              Import backup
            </button>
            <button
              className={btn.danger}
              onClick={() => confirm("Delete every duty you've entered? This can't be undone.") && onClear()}
            >
              Clear all duties
            </button>
            <button className={btn.danger} onClick={onLogout}>
              Log out
            </button>
            <input
              ref={file}
              type="file"
              accept="application/json"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && importData(e.target.files[0])}
            />
          </div>
        </fieldset>
      </div>
    </Sheet>
  );
}

const clock = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

function RulesSummary({ id }: { id: RuleSetId }) {
  const r = RULE_SETS[id];
  const hrs = (ms: number) => `${ms / HOUR}h`;
  return (
    <details className="rounded-lg border border-stone-200 p-3 dark:border-stone-700">
      <summary className="cursor-pointer font-medium">What {r.name} checks</summary>
      <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-stone-600 dark:text-stone-300">
        <li>
          Max FDP:{" "}
          {r.dayRows.map((row) => `${fmtDur(row.maxFdp)} (≤${row.maxLandings} landings, ≤${hrs(row.maxFt)} FT)`).join(", ")}
          {r.nightRows &&
            `. Night duty (touching ${clock(r.nightDuty.start)}–${clock(r.nightDuty.end)}): ${r.nightRows
              .map((row) => `${fmtDur(row.maxFdp)}, ≤${row.maxLandings} landings`)
              .join("")}`}
          .
        </li>
        {r.woclReduction && <li>FDP reduced when it starts in or runs through 02:00–06:00 (WOCL).</li>}
        {r.dutyOverFdp !== null && <li>Duty period ≤ max FDP + {hrs(r.dutyOverFdp)}.</li>}
        <li>
          Rest before a flight: the longer of the previous duty or {hrs(r.rest.minBeforeFdp)}; {hrs(r.rest.otherDuty)} before other
          duties; {hrs(r.rest.afterHomeStandby)} after home / {hrs(r.rest.afterAirportStandby)} after airport standby not called.
        </li>
        <li>
          Weekly rest {hrs(r.weekly.hours)} incl. {r.weekly.nights} local nights, at most every 168h
          {r.weekly.nightHeavy && ` (${hrs(r.weekly.nightHeavy.hours)} after more than ${r.weekly.nightHeavy.afterNightDuties} night duties)`}.
        </li>
        <li>
          Standby: home ≤ {hrs(r.standby.maxHome)}, airport ≤ {hrs(r.standby.maxAirport)}. Airport standby counts{" "}
          {r.standby.airportToFdp * 100}% toward FDP if called. Home standby: nothing counts if called within{" "}
          {hrs(r.standby.homeFree)}; after that max FDP drops by {r.standby.homeReduction * 100}% of the standby time.
        </li>
        <li>
          Cumulative:{" "}
          {r.cumulative
            .map((c) => `${c.days}d ${[c.ft && `${hrs(c.ft)} FT`, c.duty && `${hrs(c.duty)} duty`].filter(Boolean).join(" / ")}`)
            .join(" · ")}
          .
        </li>
        <li>No flight duty over consecutive nights more than once in 168h.</li>
      </ul>
      <p className="mt-2 text-xs text-stone-500">
        Not modelled: augmented crew / ULR, split duty, time-zone rest (Akasa routes stay within 3 time zones), transport time
        over 30 min, and commander&apos;s discretion extensions.
      </p>
    </details>
  );
}
