import { readFileSync } from "node:fs";
import { transformSchedule, transformStatistics } from "../src/lib/cae/transform.ts";

// Feed the real captured schedule payloads through the transform.
const har = JSON.parse(readFileSync("captures/caw-qp.crew.flightservices.cae.com_10-07-2026-23-36-05.har", "utf8"));

const decode = (e) => {
  const c = e.response.content;
  return c.encoding === "base64" ? Buffer.from(c.text, "base64").toString("utf8") : c.text;
};

let all = [];
for (const e of har.log.entries) {
  const url = e.request.url;
  if (url.includes("/rest/schedule") && (e.response.content.size ?? 0) > 1000) {
    const duties = transformSchedule(JSON.parse(decode(e)));
    const tag = url.match(/schedule\/([^?]+)/)?.[1] ?? "schedule";
    console.log(`\n--- ${tag}: ${duties.length} duties`);
    all = all.concat(duties);
  }
  if (url.includes("crewstatistics")) {
    console.log("\n--- crewstatistics rolling totals:");
    console.log(JSON.stringify(transformStatistics(JSON.parse(decode(e))), null, 1));
  }
}

// show a spread of examples
const pick = (kind) => all.find((d) => d.kind === kind);
for (const k of ["flight", "home_standby", "airport_standby", "training", "office", "leave", "off"]) {
  const d = pick(k);
  if (d) console.log("\n", k.toUpperCase(), JSON.stringify(d));
}
const multiSector = all.find((d) => (d.sectors?.length ?? 0) > 2);
if (multiSector) console.log("\n MULTI-SECTOR", JSON.stringify(multiSector));
console.log("\nTOTAL duties:", all.length);
