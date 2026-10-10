"use client";

import { useMemo, useState } from "react";
import { touchesWindow, type Analysis } from "@/lib/fdtl/engine";
import { standbyWhatIf } from "@/lib/fdtl/standby";
import { IST_OFFSET, airportOffset, fmtDur, fmtIst, localTime } from "@/lib/fdtl/time";
import { DUTY_LABELS, type Finding, type ResolvedDuty, type Settings } from "@/lib/fdtl/types";
import { FindingList, KIND_STYLE, LEVEL_STYLE, Stat, btn } from "./ui";

export function DayPanel({
  day,
  duties,
  dayFindings,
  findingsByDuty,
  analysis,
  allDuties,
  settings,
  onEdit,
}: {
  day: string;
  duties: ResolvedDuty[];
  dayFindings: Finding[];
  findingsByDuty: Map<string, Finding[]>;
  analysis: Analysis;
  allDuties: ResolvedDuty[];
  settings: Settings;
  onEdit: (id: string) => void;
}) {
  const title = new Date(`${day}T12:00:00Z`).toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  });
  const dutyIds = new Set(duties.map((d) => d.id));
  const loose = dayFindings.filter((f) => !f.dutyId || !dutyIds.has(f.dutyId));

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">{title}</h2>
      </div>
      {duties.length === 0 && (
        <p className="rounded-xl border border-dashed border-stone-300 p-4 text-sm text-stone-500 dark:border-stone-700">
          Nothing on this day.
        </p>
      )}
      {duties.map((d) => (
        <DutyCard
          key={d.id}
          duty={d}
          findings={findingsByDuty.get(d.id) ?? []}
          analysis={analysis}
          allDuties={allDuties}
          settings={settings}
          onEdit={() => onEdit(d.id)}
        />
      ))}
      <FindingList findings={loose} />
    </section>
  );
}

function DutyCard({
  duty: d,
  findings,
  analysis,
  allDuties,
  settings,
  onEdit,
}: {
  duty: ResolvedDuty;
  findings: Finding[];
  analysis: Analysis;
  allDuties: ResolvedDuty[];
  settings: Settings;
  onEdit: () => void;
}) {
  const worst = findings.some((f) => f.level === "breach") ? "breach" : findings.some((f) => f.level === "warn") ? "warn" : null;
  const isStandby = d.kind === "home_standby" || d.kind === "airport_standby";
  const calledFlightId = analysis.standbyCalled.get(d.id);
  const rest = analysis.rest.get(d.id);

  return (
    <article className="rounded-2xl border border-stone-200 bg-white p-4 dark:border-stone-800 dark:bg-stone-900">
      <header className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${KIND_STYLE[d.kind].chip}`}>{DUTY_LABELS[d.kind]}</span>
          <h3 className="mt-1 break-words font-semibold leading-snug">{d.kind === "flight" ? d.label : timeRange(d)}</h3>
        </div>
        <div className="flex items-center gap-2">
          {d.kind !== "leave" && d.kind !== "off" && (
            <span
              className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                worst ? `${LEVEL_STYLE[worst].bg} ${LEVEL_STYLE[worst].text}` : "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300"
              }`}
            >
              {worst ? LEVEL_STYLE[worst].label : "Legal"}
            </span>
          )}
          <button className={btn.ghost} onClick={onEdit}>
            Edit
          </button>
        </div>
      </header>

      {d.kind === "flight" && <FlightDetails duty={d} analysis={analysis} settings={settings} />}

      {isStandby && (
        <div className="mt-2 text-sm text-stone-600 dark:text-stone-300">
          {fmtDur(d.end - d.start)} {d.kind === "home_standby" ? "at home / hotel" : "at the airport"}
          {calledFlightId && (
            <p className="mt-1">
              Called — flight reported at{" "}
              {fmtIst(allDuties.find((x) => x.id === calledFlightId)!.start, false)} (see that flight for FDP).
            </p>
          )}
        </div>
      )}

      {rest && rest.gap >= 0 && (
        <p className="mt-3 text-sm text-stone-600 dark:text-stone-300">
          Rest before: <span className="font-medium tabular-nums">{fmtDur(rest.gap)}</span>{" "}
          <span className="text-stone-500">(needs {fmtDur(rest.required)})</span>
        </p>
      )}

      {findings.length > 0 && (
        <div className="mt-3">
          <FindingList findings={findings} />
        </div>
      )}

      {isStandby && !calledFlightId && (
        <StandbyCheck standby={d} allDuties={allDuties} analysis={analysis} settings={settings} />
      )}
    </article>
  );
}

function timeRange(d: ResolvedDuty) {
  if (d.kind === "leave" || d.kind === "off") return d.label;
  return `${localTime(d.start)} – ${localTime(d.end)} IST`;
}

function FlightDetails({ duty: d, analysis, settings }: { duty: ResolvedDuty; analysis: Analysis; settings: Settings }) {
  const c = analysis.fdp.get(d.id);
  const off = airportOffset(d.sectors[0].from);
  const blocks = d.sectors.filter((s) => !s.positioning);
  return (
    <div className="mt-3 space-y-3">
      <ol className="space-y-1 text-sm">
        <li className="text-stone-500">
          Report {localTime(d.start, off)}
          {off !== IST_OFFSET && ` local (${localTime(d.start)} IST)`}
        </li>
        {d.sectors.map((s, i) => (
          <li key={i} className="flex items-baseline justify-between gap-3 tabular-nums">
            <span className="min-w-0">
              {s.from} {localTime(s.dep, airportOffset(s.from))} → {s.to} {localTime(s.arr, airportOffset(s.to))}
            </span>
            <span className="shrink-0 text-stone-500">{fmtDur(s.arr - s.dep)}</span>
            {s.positioning && <span className="rounded bg-stone-200 px-1 text-[10px] dark:bg-stone-700">POSITIONING</span>}
          </li>
        ))}
        <li className="text-stone-500">Off duty {fmtIst(d.end, false)} IST</li>
      </ol>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat
          label="Flight time"
          value={fmtDur(d.flightTime)}
          sub={blocks.length > 1 ? blocks.map((s) => fmtDur(s.arr - s.dep)).join(" + ") : "block time, chocks to chocks"}
        />
        <Stat label="Landings" value={d.landings} />
        {c && (
          <>
            <Stat
              label="FDP"
              value={`${fmtDur(c.fdpUsed)} / ${c.row ? fmtDur(c.maxFdp) : "—"}`}
              sub={
                c.row
                  ? `${c.row.ref}${c.night ? " · night" : ""} · report to last landing`
                  : c.night
                    ? "no night row for these landings"
                    : "no day row fits"
              }
            />
            <Stat
              label="Duty period"
              value={fmtDur(c.dutyLen)}
              sub={c.maxDuty !== null ? `max ${fmtDur(c.maxDuty)}` : undefined}
            />
          </>
        )}
      </div>

      {c?.night && <NightNote duty={d} analysis={analysis} settings={settings} />}
      {c && c.reductions.length > 0 && (
        <ul className="text-xs text-stone-500">
          {c.reductions.map((r) => (
            <li key={r.label}>
              Max FDP reduced by {fmtDur(r.ms)}: {r.label}
            </li>
          ))}
        </ul>
      )}
      {c?.standbyId && !c.reductions.length && (
        <p className="text-xs text-stone-500">
          Called from standby
          {c.dutyStart < c.fdpStart
            ? ` — airport standby counts toward FDP (from ${fmtIst(c.dutyStart, false)}).`
            : " within the first 6h — standby doesn't count toward FDP."}
        </p>
      )}
    </div>
  );
}

function fmtMin(m: number) {
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

function NightNote({ duty: d, analysis, settings }: { duty: ResolvedDuty; analysis: Analysis; settings: Settings }) {
  const { start, end } = analysis.rules.nightDuty;
  const window = `${fmtMin(start)}–${fmtMin(end)}`;
  const row = analysis.rules.nightRows?.[0];
  const last = d.fdpEnd;
  const onlyTheFinish =
    last !== undefined && !touchesWindow(d.start, last, start, end) && touchesWindow(d.start, d.end, start, end);
  return (
    <p className="text-xs text-stone-500">
      {`Night duty: part of this duty falls in ${window} IST${
        row ? `. The night limit is ${row.maxLandings} landings and ${fmtDur(row.maxFt)} flight time` : ""
      }.`}
      {onlyTheFinish && last !== undefined && (
        <>
          {" "}
          The flights finish at {fmtIst(last, false)}. You stay on duty until {fmtIst(d.end, false)} — {settings.postFlightMin} min
          after the last landing, for checks. That finish is what falls inside {window}.
        </>
      )}
    </p>
  );
}

function StandbyCheck({
  standby,
  allDuties,
  analysis,
  settings,
}: {
  standby: ResolvedDuty;
  allDuties: ResolvedDuty[];
  analysis: Analysis;
  settings: Settings;
}) {
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState<number | null>(null);
  const slots = useMemo(
    () => (open ? standbyWhatIf(standby, allDuties, analysis.rules, settings, { landings: [2, 4], stepMin: 60 }) : []),
    [open, standby, allDuties, analysis.rules, settings],
  );

  if (!open)
    return (
      <button
        className="mt-3 w-full rounded-xl bg-violet-50 px-3 py-2.5 text-sm font-medium text-violet-800 hover:bg-violet-100 dark:bg-violet-950/50 dark:text-violet-200"
        onClick={() => setOpen(true)}
      >
        If crew control calls me… can they? Until when?
      </button>
    );

  return (
    <div className="mt-3">
      <h4 className="text-sm font-semibold">If you&apos;re called from this standby</h4>
      <p className="mb-2 text-xs text-stone-500">
        Latest time the last aircraft can stop. FDP is the time from that row&apos;s report until the stop. Tap a row for the
        limit. Assumes report {settings.reportDomesticMin} min before departure and {settings.turnaroundMin} min turnarounds.
      </p>
      <div className="-mx-1 overflow-x-auto">
      <table className="w-full min-w-[18rem] text-xs tabular-nums sm:text-sm">
        <thead>
          <tr className="text-left text-xs text-stone-500">
            <th className="py-1 font-medium">Report at</th>
            <th className="py-1 font-medium">2 landings</th>
            <th className="py-1 font-medium">4 landings</th>
          </tr>
        </thead>
        <tbody>
          {slots.map((s, i) => (
            <SlotRow key={s.reportAt} slot={s} expanded={expanded === i} onToggle={() => setExpanded(expanded === i ? null : i)} />
          ))}
        </tbody>
      </table>
      </div>
    </div>
  );
}

function SlotRow({
  slot,
  expanded,
  onToggle,
}: {
  slot: ReturnType<typeof standbyWhatIf>[number];
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <>
      <tr className="cursor-pointer border-t border-stone-100 hover:bg-stone-50 dark:border-stone-800 dark:hover:bg-stone-800" onClick={onToggle}>
        <td className="py-1.5">{fmtIst(slot.reportAt, false)}</td>
        {slot.options.map((o) => (
          <td key={o.landings} className="py-1.5">
            {o.latestOnBlocks === null ? (
              <span className="text-rose-600 dark:text-rose-400">✕ not legal</span>
            ) : (
              <span className="text-emerald-700 dark:text-emerald-400">
                by {fmtIst(o.latestOnBlocks, false)}
                <span className="mt-0.5 block text-xs font-normal text-stone-500">
                  FDP {fmtDur(o.latestOnBlocks - slot.reportAt)}
                </span>
              </span>
            )}
          </td>
        ))}
      </tr>
      {expanded && (
        <tr>
          <td colSpan={3} className="pb-2">
            {slot.options.map((o) => (
              <div key={o.landings} className="mt-1 text-xs">
                <span className="font-medium">{o.landings} landings: </span>
                {o.limitedBy.length === 0 ? (
                  <span className="text-stone-500">no limit reached within 20h</span>
                ) : (
                  <span className="text-stone-600 dark:text-stone-300">
                    {o.latestOnBlocks === null ? "can't be called — " : "limited by — "}
                    {o.limitedBy.map((f) => `${f.message} (${f.rule})`).join(" · ")}
                  </span>
                )}
              </div>
            ))}
          </td>
        </tr>
      )}
    </>
  );
}
