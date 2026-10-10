/**
 * Server-side client for CAE Crew Access (Akasa instance, company code QP).
 *
 * Login flow captured from the official app / community portal:
 *   1. GET  {portal}/community/ws/v1/auth/csrf-token   → { csrfToken }
 *   2. POST {portal}/community/ws/v1/auth/authenticate  (form: username, password; header csrf-token)
 *   3. GET  {caw}/ following redirects                  → picks up iPlanetDirectoryPro SSO cookie
 *   4. GET  {caw}/rest/...  with header X-Application: CrewMobile
 *
 * Credentials come from env vars (CAE_USERNAME / CAE_PASSWORD); nothing is
 * sent to the browser.
 */

const PORTAL = "https://communityportal.flightservices.cae.com";
const CAW = "https://caw-qp.crew.flightservices.cae.com";

export class CaeAuthError extends Error {}

/** Minimal cookie jar over fetch (Node fetch does not persist cookies). */
class CookieJar {
  private jar = new Map<string, string>();

  store(res: Response) {
    for (const c of res.headers.getSetCookie()) {
      const [pair] = c.split(";");
      const eq = pair.indexOf("=");
      if (eq > 0) this.jar.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim());
    }
  }

  header(): string {
    return [...this.jar.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
  }

  has(name: string) {
    return this.jar.has(name);
  }
}

export class CaeClient {
  private jar = new CookieJar();

  private async req(method: string, url: string, init: { headers?: Record<string, string>; body?: string } = {}) {
    const res = await fetch(url, {
      method,
      redirect: "manual",
      headers: { cookie: this.jar.header(), ...init.headers },
      body: init.body,
    });
    this.jar.store(res);
    return res;
  }

  /** Log in via the community portal and establish the caw-qp session. */
  async login(username: string, password: string) {
    const csrfRes = await this.req("GET", `${PORTAL}/community/ws/v1/auth/csrf-token`, {
      headers: { "cp-client": "nextgen-ui", accept: "*/*" },
    });
    if (!csrfRes.ok) throw new CaeAuthError(`CSRF token request failed (${csrfRes.status})`);
    const { csrfToken } = (await csrfRes.json()) as { csrfToken: string };

    const authRes = await this.req("POST", `${PORTAL}/community/ws/v1/auth/authenticate`, {
      headers: {
        "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
        "csrf-token": csrfToken,
        "cp-client": "nextgen-ui",
        origin: PORTAL,
        referer: `${PORTAL}/nextgen/auth/login?goto=${encodeURIComponent(CAW)}`,
        accept: "*/*",
      },
      body: new URLSearchParams({ username, password }).toString(),
    });
    if (authRes.status === 401 || authRes.status === 403) {
      throw new CaeAuthError("Crew Access rejected the username/password — update CAE_PASSWORD in .env.local");
    }
    if (!authRes.ok) throw new CaeAuthError(`Authenticate failed (${authRes.status})`);

    // Follow the goto chain to collect the iPlanetDirectoryPro SSO cookie.
    let url: string = `${CAW}/`;
    for (let i = 0; i < 10; i++) {
      const res = await this.req("GET", url);
      if ([301, 302, 303, 307, 308].includes(res.status)) {
        const loc = res.headers.get("location");
        if (!loc) break;
        url = loc.startsWith("http") ? loc : new URL(loc, url).toString();
        continue;
      }
      break;
    }

    // Verify the session works the way the app uses it.
    const welcome = await this.getJson<{ success?: boolean }>("/rest/welcome/");
    if (!welcome.success) {
      throw new CaeAuthError("Logged in but /rest/welcome did not return success — session cookie missing");
    }
  }

  async getJson<T>(path: string): Promise<T> {
    const res = await this.req("GET", `${CAW}${path}`, {
      headers: { "x-application": "CrewMobile", accept: "application/json" },
    });
    if (res.status === 401 || res.status === 403) {
      throw new CaeAuthError(`Session rejected on ${path} (${res.status})`);
    }
    if (!res.ok) throw new Error(`GET ${path} failed (${res.status})`);
    return (await res.json()) as T;
  }
}

export interface CaeSyncResult {
  schedule: unknown;
  statistics: unknown;
  range: { from: string; to: string };
  fetchedAt: string;
}

/** Log in and pull the schedule for [from, to) plus the rolling statistics. */
export async function fetchCaeData(username: string, password: string, from: string, to: string): Promise<CaeSyncResult> {
  const client = new CaeClient();
  await client.login(username, password);
  const schedule = await client.getJson<unknown>(
    `/rest/schedule/${from}T00:00:00/${to}T00:00:00?includeUnpublished=false`,
  );
  const statistics = await client.getJson<unknown>("/rest/crewstatistics");
  return { schedule, statistics, range: { from, to }, fetchedAt: new Date().toISOString() };
}
