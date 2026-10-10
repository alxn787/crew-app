import {
  DAY,
  IST_OFFSET,
  MIN,
  addDays,
  airportOffset,
  isInternational,
  istMidnight,
  localDate,
  localToUtc,
} from "./time";
import { DUTY_LABELS, type DutyInput, type ResolvedDuty, type ResolvedSector, type Settings } from "./types";

/** Smallest instant at `hhmm` (local at `offset`) that is strictly after `after`. */
function nextAfter(after: number, hhmm: string, offset: number, allowEqual = false): number {
  const ok = (x: number) => (allowEqual ? x >= after : x > after);
  let t = localToUtc(localDate(after, offset), hhmm, offset);
  while (!ok(t)) t += DAY;
  while (ok(t - DAY)) t -= DAY;
  return t;
}

export function defaultReportMinutes(sectors: { from: string; to: string }[], settings: Settings): number {
  const first = sectors[0];
  const intl = first && (isInternational(first.from) || isInternational(first.to));
  return intl ? settings.reportIntlMin : settings.reportDomesticMin;
}

/** Turns a stored roster entry into absolute times. Returns null if it is incomplete. */
export function resolveDuty(d: DutyInput, settings: Settings): ResolvedDuty | null {
  if (d.kind === "leave" || d.kind === "off") {
    const last = d.endDate && d.endDate >= d.date ? d.endDate : d.date;
    return {
      id: d.id,
      kind: d.kind,
      start: istMidnight(d.date),
      end: istMidnight(addDays(last, 1)),
      sectors: [],
      flightTime: 0,
      landings: 0,
      international: false,
      label: DUTY_LABELS[d.kind],
    };
  }

  if (d.kind !== "flight") {
    if (!d.start || !d.end) return null;
    const start = localToUtc(d.date, d.start, IST_OFFSET);
    const end = nextAfter(start, d.end, IST_OFFSET);
    return {
      id: d.id,
      kind: d.kind,
      start,
      end,
      sectors: [],
      flightTime: 0,
      landings: 0,
      international: false,
      label: DUTY_LABELS[d.kind],
    };
  }

  const inputs = (d.sectors ?? []).filter((s) => s.from && s.to && s.dep && s.arr);
  if (inputs.length === 0) return null;

  const sectors: ResolvedSector[] = [];
  let cursor = -Infinity;
  for (const [i, s] of inputs.entries()) {
    const fromOff = airportOffset(s.from);
    const dep =
      i === 0 ? localToUtc(d.date, s.dep, fromOff) : nextAfter(cursor, s.dep, fromOff, true);
    const arr = nextAfter(dep, s.arr, airportOffset(s.to));
    sectors.push({ from: s.from.toUpperCase(), to: s.to.toUpperCase(), dep, arr, positioning: s.positioning });
    cursor = arr;
  }

  const firstDep = sectors[0].dep;
  const firstOff = airportOffset(sectors[0].from);
  const start = d.reportOverride
    ? nextAfter(firstDep - DAY, d.reportOverride, firstOff, true)
    : firstDep - defaultReportMinutes(inputs, settings) * MIN;

  const operating = sectors.filter((s) => !s.positioning);
  const lastOp = operating.at(-1);
  const lastArr = sectors.at(-1)!.arr;
  const end = lastOp ? Math.max(lastOp.arr + settings.postFlightMin * MIN, lastArr) : lastArr;

  const route = [sectors[0].from, ...sectors.map((s) => s.to)].join("–");
  return {
    id: d.id,
    kind: "flight",
    start,
    end,
    sectors,
    fdpEnd: lastOp?.arr,
    flightTime: operating.reduce((t, s) => t + (s.arr - s.dep), 0),
    landings: operating.length,
    international: sectors.some((s) => isInternational(s.from) || isInternational(s.to)),
    label: operating.length ? route : `Positioning ${route}`,
  };
}
