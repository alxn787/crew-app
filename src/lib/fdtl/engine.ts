import type { FdpRow, RuleSet } from "./rules";
import {
  HOUR,
  MIN,
  addDays,
  daysBetween,
  fmtDur,
  fmtIst,
  hhmmToMin,
  istDailyWindows,
  istMidnight,
  localDate,
  localNightsIn,
  overlap,
} from "./time";
import type { Finding, Level, ResolvedDuty, Settings } from "./types";

export interface FdpCheck {
  dutyId: string;
  standbyId?: string;
  night: boolean;
  row: FdpRow | null;
  fdpStart: number;
  fdpEnd: number;
  /** FDP counted against the limit (includes airport standby credit). */
  fdpUsed: number;
  maxFdp: number;
  reductions: { label: string; ms: number }[];
  dutyStart: number;
  dutyLen: number;
  maxDuty: number | null;
}

export interface RestCheck {
  dutyId: string;
  prevId: string;
  gap: number;
  required: number;
  ref: string;
  why: string;
  ok: boolean;
}

export interface Block {
  ids: string[];
  /** The duty the block is reported against (the flight if a standby was called). */
  mainId: string;
  kind: "fdp" | "home_standby" | "airport_standby" | "other";
  start: number;
  end: number;
  /** Preceding-duty length used for the next rest requirement. */
  restLen: number;
  hasFdp: boolean;
  /** FDP interval, for night checks. */
  fdp?: [number, number];
}

interface Weighted {
  start: number;
  end: number;
  w: number;
}

export interface Analysis {
  rules: RuleSet;
  duties: ResolvedDuty[];
  blocks: Block[];
  fdp: Map<string, FdpCheck>;
  rest: Map<string, RestCheck>;
  /** standby id → flight id it turned into */
  standbyCalled: Map<string, string>;
  weeklyRests: { start: number; end: number }[];
  weeklyDeadline: number | null;
  findings: Finding[];
  dutyIntervals: Weighted[];
  ftIntervals: Weighted[];
}

const WORK = new Set(["flight", "home_standby", "airport_standby", "training", "office"]);

export function analyze(
  all: ResolvedDuty[],
  rules: RuleSet,
  settings: Settings,
  { cumulativeFromDay }: { cumulativeFromDay?: string } = {},
): Analysis {
  const duties = [...all].sort((a, b) => a.start - b.start);
  const work = duties.filter((d) => WORK.has(d.kind));
  const findings: Finding[] = [];
  const add = (level: Level, rule: string, key: string, message: string, at: number, dutyId?: string) =>
    findings.push({ level, rule: `${rules.id} ${rule}`, key, message, day: localDate(at), dutyId });

  // 1. Link standbys to the flight they turned into (report inside the standby window).
  const standbyCalled = new Map<string, string>();
  const calledFrom = new Map<string, ResolvedDuty>();
  for (const f of work) {
    if (f.kind !== "flight") continue;
    const sb = work
      .filter(
        (s) =>
          (s.kind === "home_standby" || s.kind === "airport_standby") &&
          !standbyCalled.has(s.id) &&
          s.start <= f.start &&
          f.start <= s.end,
      )
      .at(-1);
    if (sb) {
      standbyCalled.set(sb.id, f.id);
      calledFrom.set(f.id, sb);
    }
  }

  // 2. Blocks, FDP checks and cumulative intervals.
  const blocks: Block[] = [];
  const fdp = new Map<string, FdpCheck>();
  const dutyIntervals: Weighted[] = [];
  const ftIntervals: Weighted[] = [];
  const { standby: sbr } = rules;

  for (const d of work) {
    if (standbyCalled.has(d.id)) continue; // folded into its flight

    if (d.kind === "home_standby" || d.kind === "airport_standby") {
      const home = d.kind === "home_standby";
      const max = home ? sbr.maxHome : sbr.maxAirport;
      if (d.end - d.start > max)
        add("breach", sbr.ref, `sb-len-${d.id}`,
          `${home ? "Home" : "Airport"} standby is ${fmtDur(d.end - d.start)}; max ${fmtDur(max)}.`, d.start, d.id);
      blocks.push({ ids: [d.id], mainId: d.id, kind: d.kind, start: d.start, end: d.end,
        restLen: d.end - d.start, hasFdp: false });
      dutyIntervals.push({ start: d.start, end: d.end, w: home ? sbr.homeToDuty : 1 });
      continue;
    }

    if (d.kind !== "flight") {
      blocks.push({ ids: [d.id], mainId: d.id, kind: "other", start: d.start, end: d.end,
        restLen: d.end - d.start, hasFdp: false });
      dutyIntervals.push({ start: d.start, end: d.end, w: 1 });
      continue;
    }

    const sb = calledFrom.get(d.id);
    const airport = sb?.kind === "airport_standby";
    const home = sb?.kind === "home_standby";
    const dutyStart = airport ? sb!.start : d.start;
    const hasFdp = d.landings > 0 && d.fdpEnd !== undefined;
    const ids = sb ? [sb.id, d.id] : [d.id];

    if (sb) {
      const waited = d.start - sb.start;
      const max = home ? sbr.maxHome : sbr.maxAirport;
      if (waited > max)
        add("breach", sbr.ref, `sb-len-${sb.id}`,
          `Called after ${fmtDur(waited)} on standby; standby max is ${fmtDur(max)}.`, d.start, d.id);
      if (airport) dutyIntervals.push({ start: sb.start, end: d.start, w: 1 });
      else if (waited >= sbr.homeFree) dutyIntervals.push({ start: sb.start, end: d.start, w: sbr.homeToDuty });
    }
    dutyIntervals.push({ start: d.start, end: d.end, w: 1 });
    for (const s of d.sectors) if (!s.positioning) ftIntervals.push({ start: s.dep, end: s.arr, w: 1 });

    blocks.push({
      ids, mainId: d.id, kind: hasFdp ? "fdp" : "other",
      start: sb ? sb.start : d.start, end: d.end,
      restLen: d.end - dutyStart, hasFdp,
      fdp: hasFdp ? [d.start, d.fdpEnd!] : undefined,
    });
    if (!hasFdp) continue;

    const check = checkFdp(d, sb, rules);
    fdp.set(d.id, check);
    const at = d.start;
    if (!check.row) {
      add("breach", "§6.1", `fdp-row-${d.id}`,
        rowMissMessage(d, check.night, check.night ? rules.nightRows! : rules.dayRows), at, d.id);
    } else if (check.fdpUsed > check.maxFdp) {
      add("breach", check.row.ref, `fdp-${d.id}`,
        `FDP ${fmtDur(check.fdpUsed)} exceeds max ${fmtDur(check.maxFdp)}.`, at, d.id);
    } else if (check.fdpUsed > check.maxFdp - 30 * MIN) {
      add("warn", check.row.ref, `fdp-close-${d.id}`,
        `FDP ${fmtDur(check.fdpUsed)} is within 30 min of max ${fmtDur(check.maxFdp)}.`, at, d.id);
    }
    if (check.maxDuty !== null && check.dutyLen > check.maxDuty)
      add("breach", "§6.2", `duty-${d.id}`,
        `Duty period ${fmtDur(check.dutyLen)} exceeds max ${fmtDur(check.maxDuty)}.`, at, d.id);
  }
  blocks.sort((a, b) => a.start - b.start);

  // 3. Rest between consecutive blocks.
  const rest = new Map<string, RestCheck>();
  const nightStart = hhmmToMin(settings.localNightStart);
  for (let i = 1; i < blocks.length; i++) {
    const p = blocks[i - 1];
    const b = blocks[i];
    const gap = b.start - p.end;
    let required: number;
    let ref: string;
    let why: string;
    if (p.kind === "home_standby" || p.kind === "airport_standby") {
      required = p.kind === "home_standby" ? rules.rest.afterHomeStandby : rules.rest.afterAirportStandby;
      ref = sbr.ref;
      why = "rest after a standby that wasn't called";
    } else if (b.hasFdp) {
      required = Math.max(p.restLen, rules.rest.minBeforeFdp);
      ref = rules.rest.ref;
      why = `longer of previous duty (${fmtDur(p.restLen)}) or ${fmtDur(rules.rest.minBeforeFdp)}`;
    } else {
      required = rules.rest.otherDuty;
      ref = rules.rest.ref;
      why = "minimum rest before a non-flying duty";
    }
    const r: RestCheck = { dutyId: b.mainId, prevId: p.mainId, gap, required, ref, why, ok: gap >= required };
    rest.set(b.mainId, r);
    if (gap < 0) {
      add("breach", "entry", `overlap-${b.mainId}`, "Overlaps the previous duty — check the times.", b.start, b.mainId);
    } else if (!r.ok) {
      add("breach", ref, `rest-${b.mainId}`,
        `Rest ${fmtDur(gap)} before this duty; needs ${fmtDur(required)} (${why}).`, b.start, b.mainId);
    }
    const ln = rules.rest.longDutyNeedsLocalNight;
    if (ln !== null && p.restLen > ln && gap >= 0 && localNightsIn(p.end, b.start, nightStart) < 1)
      add("breach", "§9.2", `rest-night-${b.mainId}`,
        `Previous duty was over ${fmtDur(ln)}, so the rest must include a local night.`, b.start, b.mainId);
  }

  // 4. Weekly rest.
  const nightFdpEnds = blocks
    .filter((b) => b.hasFdp && touchesWindow(b.start, b.end, rules.nightDuty.start, rules.nightDuty.end))
    .map((b) => b.end);
  const weeklyRests: { start: number; end: number }[] = [];
  let weeklyDeadline: number | null = null;
  if (blocks.length) {
    const wk = rules.weekly;
    let lastEnd = blocks[0].start; // history before the first entry is unknown — assume rested
    let runEnd = blocks[0].end;
    let flagged = false;
    for (let i = 1; i < blocks.length; i++) {
      const g = { start: runEnd, end: blocks[i].start };
      const nights = localNightsIn(g.start, g.end, nightStart);
      let need = wk.hours;
      if (wk.nightHeavy) {
        const n = nightFdpEnds.filter((e) => e <= g.start && e > g.start - 168 * HOUR).length;
        if (n > wk.nightHeavy.afterNightDuties) need = wk.nightHeavy.hours;
      }
      if (g.end - g.start >= need && nights >= wk.nights) {
        if (g.start - lastEnd > wk.maxGap && !flagged)
          add("breach", wk.ref, `weekly-${blocks[i - 1].mainId}`,
            `No weekly rest within ${wk.maxGap / HOUR}h — it had to start by ${fmtIst(lastEnd + wk.maxGap)}.`,
            blocks[i - 1].start, blocks[i - 1].mainId);
        weeklyRests.push(g);
        lastEnd = g.end;
        flagged = false;
      } else if (g.end - g.start >= wk.hours && nights >= wk.nights && need > wk.hours) {
        add("info", wk.ref, `weekly-heavy-${blocks[i].mainId}`,
          `This ${fmtDur(g.end - g.start)} break doesn't count as weekly rest: after more than ${wk.nightHeavy!.afterNightDuties} night duties it must be ${need / HOUR}h.`,
          blocks[i].start, blocks[i].mainId);
      }
      if (!flagged && blocks[i].end > lastEnd + wk.maxGap) {
        // Duty runs past the deadline and no qualifying rest has started yet.
        add("breach", wk.ref, `weekly-${blocks[i].mainId}`,
          `Weekly rest overdue — it had to start by ${fmtIst(lastEnd + wk.maxGap)} (${wk.hours / HOUR}h incl. ${wk.nights} local nights).`,
          blocks[i].start, blocks[i].mainId);
        flagged = true;
      }
      runEnd = Math.max(runEnd, blocks[i].end);
    }
    weeklyDeadline = lastEnd + wk.maxGap;
  }

  // 5. Consecutive nights.
  const cn = rules.consecutiveNights;
  const nightDays = new Map<string, Block>();
  for (const b of blocks) {
    if (!b.fdp) continue;
    for (const w of istDailyWindows(b.fdp[0], b.fdp[1], cn.start, cn.end)) nightDays.set(w.day, b);
  }
  const pairs = [...nightDays.keys()].sort().filter((d) => nightDays.has(addDays(d, 1)));
  for (const [k, d] of pairs.entries()) {
    const second = nightDays.get(addDays(d, 1))!;
    if (pairs.slice(0, k).some((p) => daysBetween(p, d) < 7))
      add("breach", cn.ref, `nights-${second.mainId}`,
        "Flight duty over two consecutive nights more than once in 168h.", second.start, second.mainId);
    // §12.3: after consecutive nights, a 24h break before going back to day flying.
    const next = blocks.find(
      (b) => b.hasFdp && b.start > second.end && !touchesWindow(b.fdp![0], b.fdp![1], cn.start, cn.end),
    );
    if (next && next.start - second.fdp![1] < 24 * HOUR && blocks.indexOf(next) === blocks.indexOf(second) + 1)
      add("warn", "§12.3", `nights-transition-${next.mainId}`,
        `Landed ${fmtIst(second.fdp![1])} IST after two consecutive nights; this day flight reports ${fmtIst(next.start)} IST — only ${fmtDur(next.start - second.fdp![1])} later. Earliest legal report: ${fmtIst(second.fdp![1] + 24 * HOUR)} IST (24h incl. a local night).`,
        next.start, next.mainId);
  }

  // 6. Cumulative limits, evaluated on each day with a duty.
  const workDays = new Set(blocks.map((b) => localDate(b.start)));
  for (const day of workDays) {
    if (cumulativeFromDay && day < cumulativeFromDay) continue;
    for (const lim of rules.cumulative) {
      const from = istMidnight(addDays(day, 1 - lim.days));
      const to = istMidnight(addDays(day, 1));
      for (const [kind, max, ivs] of [
        ["Flight time", lim.ft, ftIntervals],
        ["Duty", lim.duty, dutyIntervals],
      ] as const) {
        if (max === undefined) continue;
        const used = sumIn(ivs, from, to);
        const dutyId = blocks.find((b) => localDate(b.start) === day)?.mainId;
        if (used > max)
          add("breach", lim.ref, `cum-${kind}-${lim.days}-${day}`,
            `${kind} ${fmtDur(used)} in ${lim.days} days; max ${max / HOUR}h.`, to - HOUR, dutyId);
        else if (used > max * 0.9)
          add("warn", lim.ref, `cum-${kind}-${lim.days}-${day}`,
            `${kind} ${fmtDur(used)} in ${lim.days} days — close to the ${max / HOUR}h limit.`, to - HOUR, dutyId);
      }
    }
  }

  return { rules, duties, blocks, fdp, rest, standbyCalled, weeklyRests, weeklyDeadline, findings,
    dutyIntervals, ftIntervals };
}

export function checkFdp(d: ResolvedDuty, sb: ResolvedDuty | undefined, rules: RuleSet): FdpCheck {
  const airport = sb?.kind === "airport_standby";
  const home = sb?.kind === "home_standby";
  const dutyStart = airport ? sb!.start : d.start;
  const fdpEnd = d.fdpEnd!;
  const night =
    rules.nightRows !== null && touchesWindow(dutyStart, d.end, rules.nightDuty.start, rules.nightDuty.end);
  const rows = night ? rules.nightRows! : rules.dayRows;
  const row =
    rows
      .filter((r) => d.flightTime <= r.maxFt && d.landings <= r.maxLandings)
      .sort((a, b) => b.maxFdp - a.maxFdp)[0] ?? null;

  const reductions: { label: string; ms: number }[] = [];
  if (rules.woclReduction) {
    const { start, end, ref } = rules.woclReduction;
    let red = 0;
    for (const w of istDailyWindows(d.start, fdpEnd, start, end)) {
      if (d.start >= w.start) red = Math.max(red, Math.min(Math.min(fdpEnd, w.end) - d.start, 2 * HOUR));
      else red = Math.max(red, 0.5 * overlap(d.start, fdpEnd, w.start, w.end));
    }
    if (red > 0) reductions.push({ label: `WOCL encroachment ${ref}`, ms: red });
  }
  let credit = 0;
  if (sb) {
    const waited = d.start - sb.start;
    if (airport) credit = rules.standby.airportToFdp * waited;
    if (home && waited >= rules.standby.homeFree)
      reductions.push({
        label: `Home standby ${fmtDur(waited)} (called after ${rules.standby.homeFree / HOUR}h) ${rules.standby.ref}`,
        ms: rules.standby.homeReduction * waited,
      });
  }
  const maxFdp = (row?.maxFdp ?? 0) - reductions.reduce((t, r) => t + r.ms, 0);
  return {
    dutyId: d.id,
    standbyId: sb?.id,
    night,
    row,
    fdpStart: d.start,
    fdpEnd,
    fdpUsed: fdpEnd - d.start + credit,
    maxFdp,
    reductions,
    dutyStart,
    dutyLen: d.end - dutyStart,
    maxDuty: rules.dutyOverFdp === null || !row ? null : maxFdp + rules.dutyOverFdp,
  };
}

/** Why flight time and landings fit no FDP row. Names the limit that failed. */
export function rowMissMessage(d: ResolvedDuty, night: boolean, rows: FdpRow[]): string {
  const n = d.landings;
  const ft = d.flightTime;
  const ftLabel = fmtDur(ft);
  const landingWord = n === 1 ? "landing" : "landings";
  if (night) {
    const row = rows[0];
    const overLandings = n > row.maxLandings;
    const overFt = ft > row.maxFt;
    if (overLandings && !overFt)
      return `Night duty allows ${row.maxLandings} landings. This duty has ${n}. Flight time ${ftLabel} is within the ${fmtDur(row.maxFt)} limit.`;
    if (!overLandings && overFt)
      return `Night duty allows ${fmtDur(row.maxFt)} flight time. This duty has ${ftLabel}. The ${n} ${landingWord} ${n === 1 ? "is" : "are"} within the limit of ${row.maxLandings}.`;
    return `Night duty allows ${row.maxLandings} landings and ${fmtDur(row.maxFt)} flight time. This duty has ${n} landings and ${ftLabel} flight time.`;
  }
  const maxLandings = Math.max(...rows.map((r) => r.maxLandings));
  const forLandings = rows.filter((r) => n <= r.maxLandings);
  if (forLandings.length === 0)
    return `${n} landings is more than any day row allows. The most is ${maxLandings}.`;
  const ftCap = Math.max(...forLandings.map((r) => r.maxFt));
  if (ft > ftCap)
    return `With ${n} landings the flight-time cap is ${fmtDur(ftCap)}. This duty has ${ftLabel}.`;
  return `${n} landings with ${ftLabel} flight time does not fit a day row.`;
}

export function touchesWindow(s: number, e: number, startMin: number, endMin: number): boolean {
  return istDailyWindows(s, e, startMin, endMin).length > 0;
}

function sumIn(ivs: Weighted[], from: number, to: number): number {
  return ivs.reduce((t, iv) => t + iv.w * overlap(iv.start, iv.end, from, to), 0);
}

/** Flight time and duty used in each cumulative window ending on `day` (IST). */
export function cumulativeOn(a: Analysis, day: string) {
  return a.rules.cumulative.map((lim) => {
    const from = istMidnight(addDays(day, 1 - lim.days));
    const to = istMidnight(addDays(day, 1));
    return {
      ...lim,
      ftUsed: sumIn(a.ftIntervals, from, to),
      dutyUsed: sumIn(a.dutyIntervals, from, to),
    };
  });
}

export const LEVEL_RANK: Record<Level, number> = { info: 0, warn: 1, breach: 2 };

export function worstLevel(fs: Finding[]): Level | null {
  return fs.reduce<Level | null>(
    (w, f) => (w === null || LEVEL_RANK[f.level] > LEVEL_RANK[w] ? f.level : w),
    null,
  );
}

