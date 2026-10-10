// All instants are epoch milliseconds (UTC). India and the Gulf have no DST,
// so every airport maps to a fixed UTC offset in minutes.

export const MIN = 60_000;
export const HOUR = 60 * MIN;
export const DAY = 24 * HOUR;

export const IST_OFFSET = 330;

const INTL_AIRPORTS: Record<string, { name: string; offset: number }> = {
  DOH: { name: "Doha", offset: 180 },
  JED: { name: "Jeddah", offset: 180 },
  RUH: { name: "Riyadh", offset: 180 },
  KWI: { name: "Kuwait", offset: 180 },
  DMM: { name: "Dammam", offset: 180 },
  MED: { name: "Madinah", offset: 180 },
  BAH: { name: "Bahrain", offset: 180 },
  AUH: { name: "Abu Dhabi", offset: 240 },
  DXB: { name: "Dubai", offset: 240 },
  SHJ: { name: "Sharjah", offset: 240 },
  MCT: { name: "Muscat", offset: 240 },
  KTM: { name: "Kathmandu", offset: 345 },
  CMB: { name: "Colombo", offset: 330 },
  MLE: { name: "Male", offset: 300 },
  DAC: { name: "Dhaka", offset: 360 },
};

const INDIAN_AIRPORTS: Record<string, string> = {
  BLR: "Bengaluru", BOM: "Mumbai", NMI: "Navi Mumbai", DEL: "Delhi", AMD: "Ahmedabad",
  HYD: "Hyderabad", MAA: "Chennai", CCU: "Kolkata", COK: "Kochi", GOI: "Goa Dabolim",
  GOX: "Goa Mopa", PNQ: "Pune", LKO: "Lucknow", VNS: "Varanasi", GAU: "Guwahati",
  IXB: "Bagdogra", BBI: "Bhubaneswar", PAT: "Patna", AYJ: "Ayodhya", GWL: "Gwalior",
  IXA: "Agartala", IXZ: "Port Blair", IXD: "Prayagraj", GOP: "Gorakhpur", SXR: "Srinagar",
  VTZ: "Visakhapatnam", TRV: "Thiruvananthapuram", CCJ: "Kozhikode", IXE: "Mangaluru",
  IXM: "Madurai", JAI: "Jaipur", IDR: "Indore", NAG: "Nagpur", RPR: "Raipur",
  IXC: "Chandigarh", ATQ: "Amritsar", IXJ: "Jammu", BDQ: "Vadodara", STV: "Surat",
  UDR: "Udaipur", DED: "Dehradun", IXR: "Ranchi", CJB: "Coimbatore", HBX: "Hubballi",
};

export const KNOWN_AIRPORTS = [...Object.keys(INDIAN_AIRPORTS), ...Object.keys(INTL_AIRPORTS)].sort();

export function airportOffset(code: string): number {
  return INTL_AIRPORTS[code.toUpperCase()]?.offset ?? IST_OFFSET;
}

export function airportName(code: string): string | undefined {
  const c = code.toUpperCase();
  return INDIAN_AIRPORTS[c] ?? INTL_AIRPORTS[c]?.name;
}

export function isInternational(code: string): boolean {
  return code.toUpperCase() in INTL_AIRPORTS;
}

/** "2026-10-07" + "05:30" at a UTC offset → epoch ms. */
export function localToUtc(date: string, hhmm: string, offsetMin: number): number {
  const [y, m, d] = date.split("-").map(Number);
  const [h, mi] = hhmm.split(":").map(Number);
  return Date.UTC(y, m - 1, d, h, mi) - offsetMin * MIN;
}

/** Local calendar date ("YYYY-MM-DD") of an instant at a UTC offset. */
export function localDate(ms: number, offsetMin = IST_OFFSET): string {
  return new Date(ms + offsetMin * MIN).toISOString().slice(0, 10);
}

/** "HH:MM" of an instant at a UTC offset. */
export function localTime(ms: number, offsetMin = IST_OFFSET): string {
  return new Date(ms + offsetMin * MIN).toISOString().slice(11, 16);
}

export function istMidnight(date: string): number {
  return localToUtc(date, "00:00", IST_OFFSET);
}

export function addDays(date: string, n: number): string {
  return localDate(istMidnight(date) + n * DAY + 12 * HOUR);
}

export function daysBetween(a: string, b: string): number {
  return Math.round((istMidnight(b) - istMidnight(a)) / DAY);
}

export function overlap(s1: number, e1: number, s2: number, e2: number): number {
  return Math.max(0, Math.min(e1, e2) - Math.max(s1, s2));
}

/** 754 minutes → "12:34" */
export function fmtDur(ms: number): string {
  const sign = ms < 0 ? "-" : "";
  const total = Math.round(Math.abs(ms) / MIN);
  return `${sign}${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

/** IST "07 Oct 05:30" */
export function fmtIst(ms: number, withDate = true): string {
  const d = new Date(ms + IST_OFFSET * MIN);
  const t = d.toISOString().slice(11, 16);
  if (!withDate) return t;
  const mon = d.toLocaleString("en-GB", { month: "short", timeZone: "UTC" });
  return `${String(d.getUTCDate()).padStart(2, "0")} ${mon} ${t}`;
}

export function hhmmToMin(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

export function isValidHHMM(s: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(s);
}

/** IST windows [d+startMin, d+endMin) intersecting [s, e), for each IST day. */
export function istDailyWindows(s: number, e: number, startMin: number, endMin: number) {
  const out: { day: string; start: number; end: number }[] = [];
  for (let day = addDays(localDate(s), -1); istMidnight(day) < e; day = addDays(day, 1)) {
    const ws = istMidnight(day) + startMin * MIN;
    const we = istMidnight(day) + endMin * MIN;
    if (overlap(s, e, ws, we) > 0) out.push({ day, start: ws, end: we });
  }
  return out;
}

/** Number of complete local nights (startMin + 8h, IST) contained in [s, e]. */
export function localNightsIn(s: number, e: number, nightStartMin: number): number {
  let n = 0;
  for (let day = addDays(localDate(s), -1); istMidnight(day) < e; day = addDays(day, 1)) {
    const ns = istMidnight(day) + nightStartMin * MIN;
    if (ns >= s && ns + 8 * HOUR <= e) n++;
  }
  return n;
}
