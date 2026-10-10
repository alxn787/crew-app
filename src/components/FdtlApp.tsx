"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { analyze, worstLevel } from "@/lib/fdtl/engine";
import { resolveDuty } from "@/lib/fdtl/resolve";
import { RULE_SETS } from "@/lib/fdtl/rules";
import { addDays, localDate } from "@/lib/fdtl/time";
import { DEFAULT_SETTINGS, type DutyInput, type Finding, type Level, type ResolvedDuty, type RuleSetId, type Settings } from "@/lib/fdtl/types";
import { usePersistentState } from "@/lib/storage";
import { Calendar } from "./Calendar";
import { DayPanel } from "./DayPanel";
import { DutyForm } from "./DutyForm";
import { LimitsCard } from "./LimitsCard";
import { SettingsSheet } from "./SettingsSheet";
import { LoginModal, SyncButton, useCrewAccess, type SyncPayload } from "./SyncButton";
import { btn } from "./ui";

const NO_DUTIES: DutyInput[] = [];
const noSubscribe = () => () => {};

export function FdtlApp() {
  const [inputs, setInputs, loadedDuties] = usePersistentState<DutyInput[]>("fdtl.duties.v1", NO_DUTIES);
  const [storedSettings, setSettings, loadedSettings] = usePersistentState<Settings>("fdtl.settings.v1", DEFAULT_SETTINGS);
  const settings = useMemo(() => ({ ...DEFAULT_SETTINGS, ...storedSettings }), [storedSettings]);
  // Read the clock on the client only; the server render shows the loading state.
  const today = useSyncExternalStore(noSubscribe, () => localDate(Date.now()), () => null);
  const [pickedDay, setSelected] = useState<string | null>(null);
  const [pickedMonth, setMonth] = useState<string | null>(null);
  const selected = pickedDay ?? today ?? "";
  const month = pickedMonth ?? selected.slice(0, 7);
  const [editing, setEditing] = useState<DutyInput | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const dayPanelRef = useRef<HTMLDivElement>(null);

  const mergeSync = useCallback((p: SyncPayload) => {
    setInputs((prev) => {
      const kept = prev.filter((d) => !(d.id.startsWith("cae-") && d.date >= p.range.from && d.date < p.range.to));
      return [...kept, ...p.duties];
    });
  }, [setInputs]);
  const session = useCrewAccess(mergeSync);

  // Issue IV is the default. A browser that already saved the old Issue V default is moved once;
  // choosing a rule set after that is kept.
  useEffect(() => {
    if (!loadedSettings) return;
    let picked = false;
    try {
      picked = localStorage.getItem("fdtl.rulePicked") === "1";
    } catch {
      return;
    }
    if (picked) return;
    if (storedSettings.ruleSet === "V") setSettings({ ...DEFAULT_SETTINGS, ...storedSettings, ruleSet: "IV" });
    try {
      localStorage.setItem("fdtl.rulePicked", "1");
    } catch {
      // private mode — the in-memory default still applies for this session
    }
  }, [loadedSettings, storedSettings, setSettings]);

  const chooseRule = (id: RuleSetId) => {
    try {
      localStorage.setItem("fdtl.rulePicked", "1");
    } catch {
      // ignore
    }
    setSettings({ ...settings, ruleSet: id });
  };

  const rules = RULE_SETS[settings.ruleSet];
  const resolved = useMemo(
    () => inputs.map((d) => resolveDuty(d, settings)).filter((d): d is ResolvedDuty => d !== null),
    [inputs, settings],
  );
  const analysis = useMemo(() => analyze(resolved, rules, settings), [resolved, rules, settings]);

  const { dutiesByDay, statusByDay, findingsByDay, findingsByDuty } = useMemo(() => {
    const dutiesByDay = new Map<string, ResolvedDuty[]>();
    const push = <T,>(m: Map<string, T[]>, k: string, v: T) => m.set(k, [...(m.get(k) ?? []), v]);
    for (const d of analysis.duties) {
      if (d.kind === "leave" || d.kind === "off") {
        for (let day = localDate(d.start); day < localDate(d.end); day = addDays(day, 1)) push(dutiesByDay, day, d);
      } else push(dutiesByDay, localDate(d.start), d);
    }
    const findingsByDay = new Map<string, Finding[]>();
    const findingsByDuty = new Map<string, Finding[]>();
    for (const f of analysis.findings) {
      push(findingsByDay, f.day, f);
      if (f.dutyId) push(findingsByDuty, f.dutyId, f);
    }
    // A breach on a flight called from a standby also shows on the standby's day.
    for (const [sb, fl] of analysis.standbyCalled)
      for (const f of findingsByDuty.get(fl) ?? []) if (f.level === "breach") push(findingsByDuty, sb, f);
    const statusByDay = new Map<string, Level>();
    for (const [day, fs] of findingsByDay) {
      const w = worstLevel(fs);
      if (w) statusByDay.set(day, w);
    }
    return { dutiesByDay, statusByDay, findingsByDay, findingsByDuty };
  }, [analysis]);

  const firstDay = resolved.length ? localDate(Math.min(...resolved.map((d) => d.start))) : null;

  if (!loadedDuties || !loadedSettings || !session.loaded || !today)
    return <div className="p-8 text-center text-stone-500">Loading…</div>;
  const upcomingIssues = analysis.findings.filter((f) => f.level === "breach" && f.day >= today);

  const save = (d: DutyInput) => {
    setInputs((prev) => (prev.some((x) => x.id === d.id) ? prev.map((x) => (x.id === d.id ? d : x)) : [...prev, d]));
    setEditing(null);
    const r = resolveDuty(d, settings);
    if (r) select(localDate(r.start));
  };

  const changeMonth = (delta: number) => {
    const [y, m] = month.split("-").map(Number);
    const next = new Date(Date.UTC(y, m - 1 + delta, 1)).toISOString().slice(0, 7);
    setMonth(next);
  };

  const select = (day: string) => {
    setSelected(day);
    if (!day.startsWith(month)) setMonth(day.slice(0, 7));
    if (window.matchMedia("(max-width: 1023px)").matches) {
      requestAnimationFrame(() => dayPanelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
    }
  };

  if (!session.creds) {
    return (
      <div className="min-h-dvh bg-stone-100 dark:bg-stone-950">
        <LoginModal session={session} />
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-6xl px-3 pt-[max(0.75rem,env(safe-area-inset-top))] pb-[max(1.5rem,env(safe-area-inset-bottom))] sm:px-4 sm:pb-16 sm:pt-4">
      <header className="mb-3 flex flex-wrap items-center gap-x-1.5 gap-y-2">
        <div className="min-w-0 basis-full sm:flex-1 sm:basis-auto">
          <h1 className="truncate text-lg font-bold tracking-tight sm:text-xl">FDTL Check</h1>
          <p className="truncate text-[11px] text-stone-500">Issue {settings.ruleSet}</p>
        </div>
        <div className="flex w-full items-center gap-1 sm:w-auto">
        <div role="radiogroup" aria-label="Rule set" className="flex shrink-0 rounded-lg bg-stone-200 p-0.5 text-xs dark:bg-stone-800">
          {(["IV", "V"] as const).map((id) => (
            <button
              key={id}
              role="radio"
              aria-checked={settings.ruleSet === id}
              onClick={() => chooseRule(id)}
              className={`min-h-11 rounded-md px-2.5 font-medium sm:px-3 ${
                settings.ruleSet === id ? "bg-white shadow-sm dark:bg-stone-600" : "text-stone-600 dark:text-stone-300"
              }`}
            >
              <span className="sm:hidden">{id}</span>
              <span className="hidden sm:inline">
                Issue {id}
                {id === "V" && <span className="ml-1 font-normal text-stone-500 dark:text-stone-300">draft</span>}
              </span>
            </button>
          ))}
        </div>
        <SyncButton session={session} />
        <button className={`${btn.ghost} px-2.5`} onClick={() => setShowSettings(true)} aria-label="Settings">
          <span className="sm:hidden" aria-hidden>
            ⚙
          </span>
          <span className="hidden sm:inline">⚙︎ Settings</span>
        </button>
        </div>
      </header>

      {session.message && (
        <p className={`mb-3 text-xs ${session.state === "error" ? "text-rose-600 dark:text-rose-400" : "text-stone-500"}`}>
          {session.message}
        </p>
      )}

      {upcomingIssues.length > 0 && (
        <button
          onClick={() => select(upcomingIssues[0].day)}
          className="mb-3 w-full rounded-xl bg-rose-50 px-3 py-3 text-left text-sm text-rose-800 sm:px-4 dark:bg-rose-950/50 dark:text-rose-200"
        >
          <span className="font-semibold">
            {upcomingIssues.length} issue{upcomingIssues.length > 1 ? "s" : ""} ahead
          </span>
          <span className="mt-0.5 line-clamp-2 block text-rose-700/90 dark:text-rose-200/90">{upcomingIssues[0].message}</span>
        </button>
      )}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <div className="space-y-4">
          <Calendar
            month={month}
            selected={selected}
            today={today}
            dutiesByDay={dutiesByDay}
            statusByDay={statusByDay}
            onSelect={select}
            onMonth={changeMonth}
          />
          <div className="hidden lg:block">
            <LimitsCard analysis={analysis} day={selected} firstDay={firstDay} />
          </div>
        </div>
        <div ref={dayPanelRef} className="scroll-mt-3 space-y-4">
          <DayPanel
            day={selected}
            duties={dutiesByDay.get(selected) ?? []}
            dayFindings={findingsByDay.get(selected) ?? []}
            findingsByDuty={findingsByDuty}
            analysis={analysis}
            allDuties={resolved}
            settings={settings}
            onEdit={(id) => setEditing(inputs.find((d) => d.id === id) ?? null)}
          />
          <details className="rounded-2xl border border-stone-200 bg-white p-4 lg:hidden dark:border-stone-800 dark:bg-stone-900">
            <summary className="cursor-pointer font-semibold">Running totals</summary>
            <div className="mt-3">
              <LimitsCard analysis={analysis} day={selected} firstDay={firstDay} plain />
            </div>
          </details>
        </div>
      </div>

      <footer className="mt-6 text-[11px] leading-relaxed text-stone-500 sm:mt-8 sm:text-xs">
        Personal cross-check, not an official Akasa or DGCA tool. Using <span className="font-medium">{rules.name}</span>.
      </footer>

      {editing && (
        <DutyForm
          initial={editing}
          date={selected}
          settings={settings}
          onSave={save}
          onDelete={() => {
            setInputs((prev) => prev.filter((x) => x.id !== editing.id));
            setEditing(null);
          }}
          onClose={() => setEditing(null)}
        />
      )}
      {showSettings && (
        <SettingsSheet
          settings={settings}
          onChange={(next) => {
            if (next.ruleSet !== settings.ruleSet) {
              try {
                localStorage.setItem("fdtl.rulePicked", "1");
              } catch {
                // ignore
              }
            }
            setSettings(next);
          }}
          duties={inputs}
          onImport={setInputs}
          onClear={() => setInputs([])}
          onLogout={session.logout}
          onClose={() => setShowSettings(false)}
        />
      )}
    </div>
  );
}
