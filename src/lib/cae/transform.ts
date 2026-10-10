import type { DutyInput } from "@/lib/fdtl/types";

// ---- CAE payload shapes (only the fields we use) ----

export interface CaeActivity {
  id: string;
  dutyId?: string;
  activityType?: string;
  activitySubType?: string;
  activityTypeDescription?: string;
  startAirportCode?: string;
  endAirportCode?: string;
  startTimeLocal?: string; // "2026-08-01T12:54+05:30" (local at the airport)
  endTimeLocal?: string;
  canceled?: boolean;
  trainings?: unknown[];
  flightKey?: { flightNumber?: string; airlineCode?: string };
}

export interface CaeDuty {
  id: string;
  activities?: string[];
}

export interface CaeSchedule {
  activities?: Record<string, CaeActivity>;
  duties?: Record<string, CaeDuty>;
}

export interface CaeAggregate {
  name: string;
  label: string;
  value: number;
}

export interface CaeStatistics {
  crewAggregatesForPeriod?: {
    startDateTimeRange: string;
    endDateTimeRange: string;
    label: string;
    crewAggregateList: CaeAggregate[];
  }[];
}

export interface RollingTotals {
  days: number;
  blockMinutes: number;
  dutyMinutes: number;
}

const dateOf = (local: string | undefined) => (local ? local.slice(0, 10) : "");
const hhmm = (local: string | undefined) => (local ? local.slice(11, 16) : "");
const caeId = (dutyId: string) => `cae-${dutyId}`;

/**
 * Convert a CAE schedule payload into DutyInput entries.
 * Ids are namespaced `cae-<dutyId>` so a re-sync can replace them cleanly.
 */
export function transformSchedule(schedule: CaeSchedule): DutyInput[] {
  const activities = schedule.activities ?? {};
  const duties = schedule.duties ?? {};
  const out: DutyInput[] = [];

  for (const duty of Object.values(duties)) {
    const acts = (duty.activities ?? [])
      .map((id) => activities[id])
      .filter((a): a is CaeActivity => Boolean(a) && !a.canceled);
    if (acts.length === 0) continue;

    const flies = acts
      .filter((a) => a.activityType === "FLY")
      .sort((a, b) => (a.startTimeLocal ?? "").localeCompare(b.startTimeLocal ?? ""));

    if (flies.length > 0) {
      const checkIn = acts.find((a) => a.activityType === "CHECK" && a.activitySubType === "IN");
      const flightNums = flies
        .map((f) => f.flightKey && `${f.flightKey.airlineCode ?? ""}${f.flightKey.flightNumber ?? ""}`.trim())
        .filter(Boolean)
        .join(" · ");
      out.push({
        id: caeId(duty.id),
        kind: "flight",
        date: dateOf(flies[0].startTimeLocal),
        reportOverride: checkIn ? hhmm(checkIn.startTimeLocal) : undefined,
        sectors: flies.map((f) => ({
          from: f.startAirportCode ?? "",
          to: f.endAirportCode ?? "",
          dep: hhmm(f.startTimeLocal),
          arr: hhmm(f.endTimeLocal),
          positioning: f.activitySubType === "DEADHEAD",
        })),
        note: flightNums || undefined,
      });
      continue;
    }

    // Single-activity non-flying duties
    const a = acts.find((x) => x.activityType === "NON_OP") ?? acts[0];
    const date = dateOf(a.startTimeLocal);
    if (!date) continue;

    if (a.activitySubType === "STANDBY") {
      const airport = (a.activityTypeDescription ?? "").toLowerCase().includes("airport");
      out.push({
        id: caeId(duty.id),
        kind: airport ? "airport_standby" : "home_standby",
        date,
        start: hhmm(a.startTimeLocal),
        end: hhmm(a.endTimeLocal),
        note: a.activityTypeDescription,
      });
    } else if (a.activitySubType === "OFF" || a.activitySubType === "LEAVE") {
      out.push({
        id: caeId(duty.id),
        kind: a.activitySubType === "OFF" ? "off" : "leave",
        date,
        endDate: dateOf(a.endTimeLocal) || date,
        note: a.activityTypeDescription,
      });
    } else if (a.activitySubType === "GROUND") {
      out.push({
        id: caeId(duty.id),
        kind: (a.trainings?.length ?? 0) > 0 ? "training" : "office",
        date,
        start: hhmm(a.startTimeLocal),
        end: hhmm(a.endTimeLocal),
        note: a.activityTypeDescription,
      });
    }
    // HOTEL / TRANSPORT / CHECK activities are context, not duties — skipped.
  }

  // Merge consecutive leave/off days of the same kind into a single range entry.
  return mergeConsecutive(out);
}

function mergeConsecutive(inputs: DutyInput[]): DutyInput[] {
  const result: DutyInput[] = [];
  // sort so same-kind day entries are adjacent
  const sorted = [...inputs].sort((x, y) => (x.kind + x.date).localeCompare(y.kind + y.date));
  for (const d of sorted) {
    const prev = result[result.length - 1];
    if (
      prev &&
      (prev.kind === "leave" || prev.kind === "off") &&
      prev.kind === d.kind &&
      prev.note === d.note &&
      nextDay(prev.endDate ?? prev.date) === d.date
    ) {
      prev.endDate = d.endDate ?? d.date;
      continue;
    }
    result.push({ ...d });
  }
  return result.sort((x, y) => x.date.localeCompare(y.date));
}

function nextDay(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

/** Pull the DGCA rolling windows (7/14/28/90/365) out of the statistics payload. */
export function transformStatistics(stats: CaeStatistics): RollingTotals[] {
  const out: RollingTotals[] = [];
  for (const period of stats.crewAggregatesForPeriod ?? []) {
    const m = period.label.match(/^(\d+)\s*days backwards$/);
    if (!m) continue;
    const days = Number(m[1]);
    if (![7, 14, 28, 90, 365].includes(days)) continue;
    const block = period.crewAggregateList.find((a) => a.name === "DAILY_BLOCK_HOURS_NON_SEG")?.value ?? 0;
    const duty = period.crewAggregateList.find((a) => a.name === "DAILY_DUTY_HOURS")?.value ?? 0;
    out.push({ days, blockMinutes: block, dutyMinutes: duty });
  }
  return out.sort((a, b) => a.days - b.days);
}
