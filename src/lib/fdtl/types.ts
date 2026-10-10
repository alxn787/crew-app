export type DutyKind =
  | "flight"
  | "home_standby"
  | "airport_standby"
  | "training"
  | "office"
  | "leave"
  | "off";

export const DUTY_LABELS: Record<DutyKind, string> = {
  flight: "Flight",
  home_standby: "Home standby",
  airport_standby: "Airport standby",
  training: "Training",
  office: "Office / ground",
  leave: "Leave",
  off: "Day off",
};

/** One sector as typed by the crew member. Times are local at each airport. */
export interface SectorInput {
  from: string;
  to: string;
  dep: string; // HH:MM local at `from`
  arr: string; // HH:MM local at `to`
  positioning: boolean;
}

/** A roster entry as stored. */
export interface DutyInput {
  id: string;
  kind: DutyKind;
  /** Flight: local date of first departure. Others: IST date the duty starts. */
  date: string;
  sectors?: SectorInput[];
  /** Flight: report time (local at first departure airport) when it differs from the default. */
  reportOverride?: string;
  /** Standby / training / office: IST HH:MM. End before start rolls to next day. */
  start?: string;
  end?: string;
  /** Leave / off: last date (inclusive). */
  endDate?: string;
  note?: string;
}

export interface Settings {
  ruleSet: RuleSetId;
  homeBase: string;
  reportDomesticMin: number;
  reportIntlMin: number;
  postFlightMin: number;
  /** Start of the operator's 8-hour local night, IST HH:MM. */
  localNightStart: string;
  turnaroundMin: number;
}

export const DEFAULT_SETTINGS: Settings = {
  ruleSet: "IV",
  homeBase: "BLR",
  reportDomesticMin: 60,
  reportIntlMin: 75,
  postFlightMin: 30,
  localNightStart: "22:00",
  turnaroundMin: 35,
};

export type RuleSetId = "V" | "IV";

export interface ResolvedSector {
  from: string;
  to: string;
  dep: number;
  arr: number;
  positioning: boolean;
}

/** A duty with absolute times. */
export interface ResolvedDuty {
  id: string;
  kind: DutyKind;
  synthetic?: boolean;
  /** Report time (flight) or start. */
  start: number;
  /** End of duty: flight = last on-blocks + post-flight allowance (or last positioning arrival). */
  end: number;
  sectors: ResolvedSector[];
  /** Flight with operating sectors: last operating on-blocks. */
  fdpEnd?: number;
  flightTime: number;
  landings: number;
  international: boolean;
  label: string;
}

export type Level = "breach" | "warn" | "info";

export interface Finding {
  key: string;
  level: Level;
  rule: string;
  message: string;
  day: string;
  dutyId?: string;
}
