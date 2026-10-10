import { HOUR, MIN } from "./time";
import type { RuleSetId } from "./types";

/**
 * One row of the FDP table. Rows are read left to right as an envelope:
 * a duty fits a row when its flight time and landings are within the row's maxima,
 * and its FDP may then go up to the row's max FDP. The most generous fitting row wins.
 */
export interface FdpRow {
  ref: string;
  maxFt: number;
  maxFdp: number;
  maxLandings: number;
}

export interface CumulativeLimit {
  days: number;
  ft?: number;
  duty?: number;
  ref: string;
}

export interface RuleSet {
  id: RuleSetId;
  name: string;
  status: string;
  source: string;
  /** Rows used when the duty is not a night duty. */
  dayRows: FdpRow[];
  /** Rows used when the duty touches the night-duty window. Null = same as day rows. */
  nightRows: FdpRow[] | null;
  /** Night-duty window (IST minutes from midnight) that switches to `nightRows`. */
  nightDuty: { start: number; end: number };
  /** WOCL reduction applied to every row (Issue IV). */
  woclReduction: { start: number; end: number; ref: string } | null;
  /** Max duty period = max FDP + this (null = not prescribed). */
  dutyOverFdp: number | null;
  cumulative: CumulativeLimit[];
  rest: {
    minBeforeFdp: number;
    otherDuty: number;
    afterHomeStandby: number;
    afterAirportStandby: number;
    longDutyNeedsLocalNight: number | null;
    ref: string;
  };
  weekly: {
    hours: number;
    nights: number;
    maxGap: number;
    nightHeavy: { hours: number; afterNightDuties: number } | null;
    ref: string;
  };
  standby: {
    maxHome: number;
    maxAirport: number;
    /** Share of airport standby time counted as FDP when called. */
    airportToFdp: number;
    /** Home standby: called within this time → nothing counts. */
    homeFree: number;
    /** Called after homeFree → max FDP reduced by this share of standby time. */
    homeReduction: number;
    /** Share of home standby counted as cumulative duty when not free. */
    homeToDuty: number;
    ref: string;
  };
  consecutiveNights: { start: number; end: number; ref: string };
}

const h = (n: number) => n * HOUR;
const hm = (hh: number, mm: number) => hh * HOUR + mm * MIN;

export const ISSUE_V: RuleSet = {
  id: "V",
  name: "CAR 7-J-I Issue V",
  status: "Draft released 15 Oct 2025. Confirm with Akasa whether it is notified.",
  source:
    "https://www.dgca.gov.in/digigov-portal/Upload?flag=iframeAttachView&attachId=il6xIB9QE6ehTbKQ7uUHyQ%3D%3D&baseLocale=en_US",
  dayRows: [
    { ref: "§6.1.1", maxFt: h(8), maxFdp: hm(11, 0), maxLandings: 6 },
    { ref: "§6.1.1", maxFt: h(8), maxFdp: hm(11, 30), maxLandings: 5 },
    { ref: "§6.1.1", maxFt: h(8), maxFdp: hm(12, 0), maxLandings: 4 },
    { ref: "§6.1.1", maxFt: h(8), maxFdp: hm(12, 30), maxLandings: 3 },
    { ref: "§6.1.2", maxFt: h(9), maxFdp: h(14), maxLandings: 2 },
    { ref: "§6.1.3", maxFt: h(10), maxFdp: h(15), maxLandings: 1 },
  ],
  nightRows: [{ ref: "§6.1.4 (night)", maxFt: h(8), maxFdp: h(10), maxLandings: 2 }],
  nightDuty: { start: 0, end: 6 * 60 },
  woclReduction: null,
  dutyOverFdp: h(1),
  cumulative: [
    { days: 7, ft: h(35), duty: h(60), ref: "§8.1" },
    { days: 14, ft: h(65), duty: h(100), ref: "§8.2" },
    { days: 28, ft: h(100), duty: h(190), ref: "§8.3" },
    { days: 90, ft: h(300), duty: h(600), ref: "§8.4" },
    { days: 365, ft: h(1000), duty: h(1800), ref: "§8.5" },
  ],
  rest: {
    minBeforeFdp: h(12),
    otherDuty: h(10),
    afterHomeStandby: h(8),
    afterAirportStandby: h(12),
    longDutyNeedsLocalNight: h(18),
    ref: "§9.1",
  },
  weekly: {
    hours: h(48),
    nights: 2,
    maxGap: h(168),
    nightHeavy: { hours: h(60), afterNightDuties: 3 },
    ref: "§9.4",
  },
  standby: {
    maxHome: h(12),
    maxAirport: h(8),
    airportToFdp: 1,
    homeFree: h(6),
    homeReduction: 0.5,
    homeToDuty: 0.25,
    ref: "§10.2",
  },
  consecutiveNights: { start: 0, end: 6 * 60, ref: "§12.1" },
};

export const ISSUE_IV: RuleSet = {
  id: "IV",
  name: "CAR 7-J-I Issue IV",
  status: "Earlier cabin crew CAR (2018). Use if Akasa's scheme still follows it.",
  source: "https://understandingdgacfdtl2012.wordpress.com/car-fdtl/dgca-car-7-j-iii-fdtl-flight-crew-01-september-2016/",
  dayRows: [
    { ref: "§6.1.1", maxFt: h(8), maxFdp: h(12), maxLandings: 6 },
    { ref: "§6.1.2", maxFt: h(11), maxFdp: h(15), maxLandings: 3 },
    { ref: "§6.1.3", maxFt: h(14), maxFdp: h(18), maxLandings: 1 },
  ],
  nightRows: null,
  nightDuty: { start: 0, end: 5 * 60 },
  woclReduction: { start: 2 * 60, end: 6 * 60, ref: "§6.1 WOCL" },
  dutyOverFdp: null,
  cumulative: [
    { days: 7, ft: h(40), duty: h(65), ref: "§6.2/6.3" },
    { days: 28, ft: h(115), duty: h(210), ref: "§6.2/6.3" },
    { days: 90, ft: h(300), ref: "§6.2" },
    { days: 365, ft: h(1000), ref: "§6.2" },
  ],
  rest: {
    minBeforeFdp: h(12),
    otherDuty: h(10),
    afterHomeStandby: h(8),
    afterAirportStandby: h(12),
    longDutyNeedsLocalNight: null,
    ref: "§7.1",
  },
  weekly: { hours: h(36), nights: 2, maxGap: h(168), nightHeavy: null, ref: "§7.4" },
  standby: {
    maxHome: h(12),
    maxAirport: h(8),
    airportToFdp: 0.5,
    homeFree: h(6),
    homeReduction: 0.5,
    homeToDuty: 0.25,
    ref: "§8.2",
  },
  consecutiveNights: { start: 0, end: 5 * 60, ref: "§10.1" },
};

export const RULE_SETS: Record<RuleSetId, RuleSet> = { V: ISSUE_V, IV: ISSUE_IV };
