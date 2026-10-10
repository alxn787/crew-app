import { CaeAuthError, fetchCaeData } from "@/lib/cae/client";
import { transformSchedule, transformStatistics, type CaeSchedule, type CaeStatistics } from "@/lib/cae/transform";

function defaultRange() {
  const now = new Date();
  const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 2, 1));
  const to = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 3, 1));
  return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
}

async function run(username: string, password: string, url: URL) {
  const range = defaultRange();
  const from = url.searchParams.get("from") ?? range.from;
  const to = url.searchParams.get("to") ?? range.to;
  try {
    const raw = await fetchCaeData(username, password, from, to);
    const duties = transformSchedule(raw.schedule as CaeSchedule);
    const totals = transformStatistics(raw.statistics as CaeStatistics);
    return Response.json({ duties, totals, range: raw.range, fetchedAt: raw.fetchedAt });
  } catch (err) {
    if (err instanceof CaeAuthError) {
      return Response.json({ error: err.message }, { status: 401 });
    }
    return Response.json({ error: err instanceof Error ? err.message : "Sync failed" }, { status: 502 });
  }
}

function missing() {
  return Response.json(
    { error: "No Crew Access credentials — sign in from the Sync button, or set CAE_USERNAME / CAE_PASSWORD in .env.local" },
    { status: 400 },
  );
}

/**
 * POST /api/cae/sync { username, password } — sign in to CAE Crew Access as
 * the given crew member and return their roster + rolling duty statistics
 * converted into the app's duty format. Credentials are used for this request
 * only and never stored server-side.
 */
export async function POST(request: Request) {
  let body: { username?: string; password?: string } = {};
  try {
    body = await request.json();
  } catch {
    // no body
  }
  const username = body.username ?? process.env.CAE_USERNAME;
  const password = body.password ?? process.env.CAE_PASSWORD;
  if (!username || !password) return missing();
  return run(username, password, new URL(request.url));
}

/** GET /api/cae/sync — same, using the server env credentials. */
export async function GET(request: Request) {
  const username = process.env.CAE_USERNAME;
  const password = process.env.CAE_PASSWORD;
  if (!username || !password) return missing();
  return run(username, password, new URL(request.url));
}
