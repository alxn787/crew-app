// Test the CAE Crew Access login flow end-to-end with a manual cookie jar.
// Usage: CAE_USER=... CAE_PASS=... node scripts/test-cae-login.mjs
const PORTAL = "https://communityportal.flightservices.cae.com";
const CAW = "https://caw-qp.crew.flightservices.cae.com";

const user = process.env.CAE_USER;
const pass = process.env.CAE_PASS;
if (!user || !pass) {
  console.error("set CAE_USER and CAE_PASS");
  process.exit(1);
}

const jar = new Map(); // name -> value

function storeCookies(res) {
  const sc = res.headers.getSetCookie?.() ?? [];
  for (const c of sc) {
    const [pair] = c.split(";");
    const eq = pair.indexOf("=");
    if (eq > 0) jar.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim());
  }
}

function cookieHeader() {
  return [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
}

async function req(method, url, { headers = {}, body, redirect = "manual" } = {}) {
  const res = await fetch(url, {
    method,
    redirect,
    headers: { cookie: cookieHeader(), ...headers },
    body,
  });
  storeCookies(res);
  return res;
}

// 1. CSRF token
const csrfRes = await req("GET", `${PORTAL}/community/ws/v1/auth/csrf-token`, {
  headers: { "cp-client": "nextgen-ui", accept: "*/*" },
});
const { csrfToken } = await csrfRes.json();
console.log("csrf-token:", csrfRes.status, "token len", String(csrfToken).length);

// 2. Authenticate
const authRes = await req("POST", `${PORTAL}/community/ws/v1/auth/authenticate`, {
  headers: {
    "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
    "csrf-token": csrfToken,
    "cp-client": "nextgen-ui",
    origin: PORTAL,
    referer: `${PORTAL}/nextgen/auth/login?goto=${encodeURIComponent(CAW)}`,
    accept: "*/*",
  },
  body: new URLSearchParams({ username: user, password: pass }).toString(),
});
const authBody = await authRes.text();
console.log("authenticate:", authRes.status, authBody.slice(0, 200));
console.log("cookies after auth:", [...jar.keys()]);

// 3. Hit the goto target, following redirects manually to catch SSO cookie-setting hops
let url = `${CAW}/`;
for (let i = 0; i < 10; i++) {
  const res = await req("GET", url);
  console.log(`hop ${i}:`, res.status, url, "| set-cookie ->", res.headers.getSetCookie?.().map((c) => c.split(";")[0].split("=")[0]));
  if ([301, 302, 303, 307, 308].includes(res.status)) {
    const loc = res.headers.get("location");
    url = loc.startsWith("http") ? loc : new URL(loc, url).toString();
    continue;
  }
  break;
}
console.log("cookies after goto:", [...jar.keys()]);

// 4. welcome
const wel = await req("GET", `${CAW}/rest/welcome/`, {
  headers: { "x-application": "CrewMobile", accept: "*/*" },
});
const welBody = await wel.text();
console.log("welcome:", wel.status, welBody.slice(0, 160));

// 5. statistics + one schedule month
const stats = await req("GET", `${CAW}/rest/crewstatistics`, { headers: { "x-application": "CrewMobile" } });
console.log("crewstatistics:", stats.status, (await stats.text()).slice(0, 120));

const sched = await req("GET", `${CAW}/rest/schedule/2026-10-01T00:00:00/2026-12-01T00:00:00?includeUnpublished=false`, {
  headers: { "x-application": "CrewMobile" },
});
const schedText = await sched.text();
console.log("schedule:", sched.status, "bytes:", schedText.length);
