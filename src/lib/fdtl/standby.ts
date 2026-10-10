import { analyze } from "./engine";
import type { RuleSet } from "./rules";
import { DAY, HOUR, MIN, localDate } from "./time";
import type { Finding, ResolvedDuty, Settings } from "./types";

export interface CallOption {
  landings: number;
  /** Latest on-blocks of the last landing that keeps everything legal. */
  latestOnBlocks: number | null;
  /** What stops it going later (or stops the call entirely). */
  limitedBy: Finding[];
}

export interface CallSlot {
  reportAt: number;
  options: CallOption[];
}

const STEP = 5 * MIN;
const WHATIF_ID = "__whatif__";

/**
 * For a standby, works out — for each possible call (report) time — the latest you could
 * be kept flying for a given number of landings without breaking any rule. It inserts a
 * hypothetical flight into the roster and re-runs the full analysis, so rest, weekly rest,
 * cumulative limits and night rules are all included.
 *
 * Assumes a domestic pattern with flight time spread evenly and fixed turnarounds.
 */
export function standbyWhatIf(
  standby: ResolvedDuty,
  duties: ResolvedDuty[],
  rules: RuleSet,
  settings: Settings,
  { landings = [2, 4], stepMin = 60 }: { landings?: number[]; stepMin?: number } = {},
): CallSlot[] {
  const window = duties.filter((d) => d.end >= standby.start - 366 * DAY && d.start <= standby.end + 14 * DAY);
  const fromDay = localDate(standby.start - DAY);
  const baseline = new Set(
    analyze(window, rules, settings, { cumulativeFromDay: fromDay })
      .findings.filter((f) => f.level === "breach")
      .map((f) => f.key),
  );

  const newBreaches = (reportAt: number, onBlocks: number, n: number) => {
    const flight = syntheticFlight(reportAt, onBlocks, n, settings);
    if (!flight) return null;
    const a = analyze([...window, flight], rules, settings, { cumulativeFromDay: fromDay });
    return a.findings.filter((f) => f.level === "breach" && !baseline.has(f.key));
  };

  const slots: CallSlot[] = [];
  for (let r = standby.start; r <= standby.end; r += stepMin * MIN) {
    const options = landings.map((n): CallOption => {
      const minEnd = minOnBlocks(r, n, settings);
      const first = newBreaches(r, minEnd, n) ?? [];
      if (first.length) return { landings: n, latestOnBlocks: null, limitedBy: first };

      // Legality only gets worse as the day gets longer, so binary search the last legal end.
      let lo = minEnd;
      let hi = r + 20 * HOUR;
      if ((newBreaches(r, hi, n) ?? []).length === 0) return { landings: n, latestOnBlocks: hi, limitedBy: [] };
      while (hi - lo > STEP) {
        const mid = lo + Math.max(STEP, Math.floor((hi - lo) / 2 / STEP) * STEP);
        if ((newBreaches(r, mid, n) ?? []).length === 0) lo = mid;
        else hi = mid;
      }
      return { landings: n, latestOnBlocks: lo, limitedBy: newBreaches(r, hi, n) ?? [] };
    });
    slots.push({ reportAt: r, options });
  }
  return slots;
}

function minOnBlocks(reportAt: number, n: number, s: Settings) {
  return reportAt + s.reportDomesticMin * MIN + n * 45 * MIN + (n - 1) * s.turnaroundMin * MIN;
}

function syntheticFlight(reportAt: number, onBlocks: number, n: number, s: Settings): ResolvedDuty | null {
  const firstDep = reportAt + s.reportDomesticMin * MIN;
  const turn = s.turnaroundMin * MIN;
  const span = onBlocks - firstDep;
  // Flight time is capped at 8h; anything longer is ground time between sectors.
  const block = Math.min((span - (n - 1) * turn) / n, (8 * HOUR) / n);
  if (block < 30 * MIN) return null;
  const gap = n > 1 ? (span - n * block) / (n - 1) : 0;
  const sectors = Array.from({ length: n }, (_, i) => {
    const dep = n > 1 ? firstDep + i * (block + gap) : onBlocks - block;
    return { from: "XXX", to: "XXX", dep, arr: dep + block, positioning: false };
  });
  return {
    id: WHATIF_ID,
    kind: "flight",
    synthetic: true,
    start: reportAt,
    end: onBlocks + s.postFlightMin * MIN,
    sectors,
    fdpEnd: onBlocks,
    flightTime: n * block,
    landings: n,
    international: false,
    label: "If called",
  };
}
