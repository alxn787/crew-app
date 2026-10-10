import { describe, expect, it } from "vitest";
import { analyze, cumulativeOn } from "./engine";
import { resolveDuty } from "./resolve";
import { ISSUE_IV, ISSUE_V, type RuleSet } from "./rules";
import { standbyWhatIf } from "./standby";
import { HOUR, addDays, fmtDur, fmtIst } from "./time";
import { DEFAULT_SETTINGS, type DutyInput, type ResolvedDuty, type SectorInput } from "./types";

const S = DEFAULT_SETTINGS;
let n = 0;
const id = () => `d${++n}`;

const sec = (from: string, to: string, dep: string, arr: string, positioning = false): SectorInput => ({
  from, to, dep, arr, positioning,
});
const flight = (date: string, sectors: SectorInput[], reportOverride?: string): DutyInput => ({
  id: id(), kind: "flight", date, sectors, reportOverride,
});
const timed = (kind: DutyInput["kind"], date: string, start: string, end: string): DutyInput => ({
  id: id(), kind, date, start, end,
});

function run(inputs: DutyInput[], rules: RuleSet = ISSUE_V) {
  const resolved = inputs.map((d) => resolveDuty(d, S)!);
  return { a: analyze(resolved, rules, S), resolved };
}
const breaches = (a: ReturnType<typeof analyze>) => a.findings.filter((f) => f.level === "breach");

const D = "2026-10-12";
const fourSectorDay = (date: string, firstDep = "07:00") =>
  flight(date, [
    sec("BLR", "BOM", firstDep, "08:45"),
    sec("BOM", "BLR", "09:30", "11:15"),
    sec("BLR", "HYD", "12:00", "13:15"),
    sec("HYD", "BLR", "14:00", "15:15"),
  ]);

describe("resolve", () => {
  it("computes report, flight time, landings and duty end", () => {
    const r = resolveDuty(fourSectorDay(D), S)!;
    expect(fmtIst(r.start)).toBe("12 Oct 06:00");
    expect(fmtDur(r.flightTime)).toBe("6:00");
    expect(r.landings).toBe(4);
    expect(fmtIst(r.end)).toBe("12 Oct 15:45");
  });

  it("handles Gulf local times and next-day arrivals", () => {
    const r = resolveDuty(flight(D, [sec("BLR", "DOH", "21:00", "23:30"), sec("DOH", "BLR", "00:45", "07:30")]), S)!;
    // BLR 21:00 IST → DOH 23:30 local (+3) = 02:00 IST: block 5:00
    expect(fmtDur(r.sectors[0].arr - r.sectors[0].dep)).toBe("5:00");
    // DOH 00:45 local = 03:15 IST → BLR 07:30 IST: block 4:15
    expect(fmtDur(r.sectors[1].arr - r.sectors[1].dep)).toBe("4:15");
    expect(r.international).toBe(true);
    expect(fmtIst(r.start)).toBe("12 Oct 19:45"); // 75 min international report
  });

  it("does not count positioning as flight time or landings", () => {
    const r = resolveDuty(flight(D, [sec("BLR", "BOM", "07:00", "08:45", true), sec("BOM", "DEL", "10:00", "12:10")]), S)!;
    expect(r.landings).toBe(1);
    expect(fmtDur(r.flightTime)).toBe("2:10");
  });
});

describe("Issue V flight duty period", () => {
  it("4 landings by day: max FDP 12:00", () => {
    const { a, resolved } = run([fourSectorDay(D)]);
    const c = a.fdp.get(resolved[0].id)!;
    expect(c.night).toBe(false);
    expect(fmtDur(c.maxFdp)).toBe("12:00");
    expect(fmtDur(c.fdpUsed)).toBe("9:15");
    expect(breaches(a)).toHaveLength(0);
  });

  it("night duty (report 05:30): only 2 landings / 10:00 allowed", () => {
    const { a } = run([fourSectorDay(D, "06:30")]);
    expect(breaches(a).map((f) => f.key)).toContain(`fdp-row-d${n}`);
  });

  it("late finish past midnight: 6:18 block is legal, 4 landings are not", () => {
    // Fri 4 Sep 2026. Report 14:05, last on-blocks 23:41, 30 min post-flight → off duty 00:11.
    const { a, resolved } = run([
      flight("2026-09-04", [
        sec("BLR", "PNQ", "15:08", "16:39"),
        sec("PNQ", "BLR", "17:27", "19:17"),
        sec("BLR", "PNQ", "20:00", "21:22"),
        sec("PNQ", "BLR", "22:06", "23:41"),
      ], "14:05"),
    ]);
    const r = resolved[0];
    expect(fmtDur(r.flightTime)).toBe("6:18");
    expect(r.landings).toBe(4);
    expect(fmtIst(r.fdpEnd!, false)).toBe("23:41");
    expect(fmtIst(r.end, false)).toBe("00:11");
    const c = a.fdp.get(r.id)!;
    expect(c.night).toBe(true);
    expect(c.row).toBeNull();
    expect(fmtDur(c.fdpUsed)).toBe("9:36");
    expect(fmtDur(c.dutyLen)).toBe("10:06");
    const msg = breaches(a).find((f) => f.key === `fdp-row-${r.id}`)!.message;
    expect(msg).toBe(
      "Night duty allows 2 landings. This duty has 4. Flight time 6:18 is within the 8:00 limit.",
    );
  });

  it("night duty with 2 landings is fine within 10:00", () => {
    const { a, resolved } = run([flight(D, [sec("BLR", "DEL", "06:00", "08:50"), sec("DEL", "BLR", "09:40", "12:30")])]);
    const c = a.fdp.get(resolved[0].id)!;
    expect(c.night).toBe(true);
    expect(fmtDur(c.maxFdp)).toBe("10:00");
    expect(breaches(a)).toHaveLength(0);
  });

  it("flags over-long FDP", () => {
    const { a } = run([
      flight(D, [
        sec("BLR", "DEL", "07:00", "09:50"),
        sec("DEL", "BLR", "13:00", "15:50"),
        sec("BLR", "BOM", "17:30", "19:15"),
      ]),
    ]);
    // report 06:00 → 19:15 = 13:15 > 12:30 (3 landings)
    expect(breaches(a).some((f) => f.message.includes("exceeds max 12:30"))).toBe(true);
  });
});

describe("rest", () => {
  it("needs the longer of previous duty or 12h before a flight", () => {
    const { a } = run([fourSectorDay(D), flight(addDays(D, 1), [sec("BLR", "MAA", "04:00", "05:00")])]);
    // ends 15:45, next report 03:00 → 11:15 rest
    expect(breaches(a).some((f) => f.message.startsWith("Rest 11:15"))).toBe(true);
  });

  it("8h after an uncalled home standby is enough", () => {
    const sb = timed("home_standby", D, "04:00", "16:00");
    expect(breaches(run([sb, timed("training", addDays(D, 1), "00:00", "06:00")]).a)).toHaveLength(0);
    expect(breaches(run([sb, timed("training", D, "23:30", "06:00")]).a)).toHaveLength(1);
  });
});

describe("standby", () => {
  it("home standby called after 6h reduces max FDP by half the standby time", () => {
    const sb = timed("home_standby", D, "04:00", "16:00");
    const f = flight(D, [
      sec("BLR", "BOM", "12:00", "13:45"),
      sec("BOM", "BLR", "14:30", "16:15"),
      sec("BLR", "HYD", "17:00", "18:15"),
      sec("HYD", "BLR", "19:00", "20:15"),
    ]); // report 11:00 = 7h into standby
    const { a } = run([sb, f]);
    const c = a.fdp.get(f.id)!;
    expect(fmtDur(c.maxFdp)).toBe("8:30"); // 12:00 − 3:30
    expect(fmtDur(c.fdpUsed)).toBe("9:15");
    expect(breaches(a).some((x) => x.key === `fdp-${f.id}`)).toBe(true);
    expect(a.standbyCalled.get(sb.id)).toBe(f.id);
  });

  it("home standby called within 6h: no reduction", () => {
    const sb = timed("home_standby", D, "06:00", "18:00");
    const f = flight(D, [sec("BLR", "BOM", "11:00", "12:45")]); // report 10:00
    const { a } = run([sb, f]);
    expect(a.fdp.get(f.id)!.reductions).toHaveLength(0);
  });

  it("airport standby counts 100% to FDP in Issue V, 50% in Issue IV", () => {
    const sb = timed("airport_standby", D, "06:00", "14:00");
    const f = flight(D, [sec("BLR", "DEL", "11:00", "13:50"), sec("DEL", "BLR", "14:30", "17:20")]); // report 10:00
    expect(fmtDur(run([sb, f]).a.fdp.get(f.id)!.fdpUsed)).toBe("11:20");
    expect(fmtDur(run([sb, f], ISSUE_IV).a.fdp.get(f.id)!.fdpUsed)).toBe("9:20");
  });

  it("what-if: night call limited to 2 landings / 10h; later calls lose 50% of standby time", () => {
    const prev = fourSectorDay(addDays(D, -1)); // ends 15:45 the day before → 12h15 rest to 04:00
    const sb = timed("home_standby", D, "04:00", "16:00");
    const resolved = [prev, sb].map((d) => resolveDuty(d, S)!) as ResolvedDuty[];
    const slots = standbyWhatIf(resolved[1], resolved, ISSUE_V, S, { landings: [2, 4], stepMin: 60 });

    const at04 = slots[0];
    expect(fmtIst(at04.reportAt, false)).toBe("04:00");
    expect(fmtIst(at04.options[0].latestOnBlocks!, false)).toBe("14:00"); // 10h night FDP
    expect(at04.options[1].latestOnBlocks).toBeNull(); // 4 landings not allowed on a night duty

    const at10 = slots[6];
    expect(fmtIst(at10.reportAt, false)).toBe("10:00");
    expect(fmtIst(at10.options[0].latestOnBlocks!, false)).toBe("21:00"); // 14:00 − 3:00
    expect(fmtIst(at10.options[1].latestOnBlocks!, false)).toBe("19:00"); // 12:00 − 3:00
  });

  it("what-if: no call possible when rest before the standby is short", () => {
    const prev = timed("training", addDays(D, -1), "06:00", "19:00"); // 13h duty, ends 19:00
    const sb = timed("home_standby", D, "04:00", "16:00"); // 9h after
    const resolved = [prev, sb].map((d) => resolveDuty(d, S)!);
    const slots = standbyWhatIf(resolved[1], resolved, ISSUE_V, S, { landings: [2] });
    expect(slots.every((s) => s.options[0].latestOnBlocks === null)).toBe(true);
    expect(slots[0].options[0].limitedBy[0].message).toMatch(/^Rest 9:00/);
  });
});

describe("weekly rest", () => {
  it("flags 8 straight working days", () => {
    const days = Array.from({ length: 8 }, (_, i) => timed("office", addDays(D, i), "08:00", "16:00"));
    const { a } = run(days);
    expect(breaches(a).some((f) => f.rule.includes("§9.4"))).toBe(true);
  });

  it("accepts a 48h break with two local nights", () => {
    const days = [0, 1, 2, 3, 4, 7, 8, 9].map((i) => timed("office", addDays(D, i), "08:00", "16:00"));
    const { a } = run(days);
    expect(breaches(a)).toHaveLength(0);
    expect(a.weeklyRests).toHaveLength(1);
  });

  it("Issue IV only needs 36h", () => {
    // 16:00 → next day+1 06:00 = 38h with nights 22–06 twice? 16:00 d → 06:00 d+2 contains 2 local nights
    const days = [0, 1, 2, 3, 4].map((i) => timed("office", addDays(D, i), "08:00", "16:00"));
    days.push(timed("office", addDays(D, 6), "06:00", "14:00"));
    days.push(...[7, 8, 9].map((i) => timed("office", addDays(D, i), "08:00", "16:00")));
    expect(breaches(run(days, ISSUE_IV).a)).toHaveLength(0);
    expect(breaches(run(days, ISSUE_V).a).length).toBeGreaterThan(0);
  });
});

describe("consecutive nights", () => {
  const nightOp = (date: string) =>
    flight(date, [sec("BLR", "DEL", "01:30", "04:20"), sec("DEL", "BLR", "05:00", "07:50")]);

  it("allows one pair of consecutive nights in 168h but not two", () => {
    const ok = run([nightOp(D), nightOp(addDays(D, 1))]).a;
    expect(breaches(ok)).toHaveLength(0);
    const bad = run([nightOp(D), nightOp(addDays(D, 1)), nightOp(addDays(D, 3)), nightOp(addDays(D, 4))]).a;
    expect(breaches(bad).some((f) => f.rule.includes("§12.1"))).toBe(true);
  });

  it("§12.3 names the exact earliest legal report time", () => {
    // Second night duty is on blocks at 07:50 on D+1; a day flight reporting 06:00 on D+2 is 22:10 later.
    const day = flight(addDays(D, 2), [sec("BLR", "BOM", "07:00", "08:45"), sec("BOM", "BLR", "09:30", "11:15")]);
    const { a } = run([nightOp(D), nightOp(addDays(D, 1)), day]);
    const warn = a.findings.find((f) => f.rule.includes("§12.3"));
    expect(warn).toBeDefined();
    expect(warn!.message).toContain("Earliest legal report: 14 Oct 07:50 IST");
  });
});

describe("cumulative", () => {
  it("sums flight time in the 7-day window", () => {
    const { a } = run([fourSectorDay(D), fourSectorDay(addDays(D, 2))]);
    const seven = cumulativeOn(a, addDays(D, 2)).find((c) => c.days === 7)!;
    expect(seven.ftUsed).toBe(12 * HOUR);
    expect(fmtDur(seven.dutyUsed)).toBe("19:30");
  });
});
