#!/usr/bin/env node

// Flies a circuit from a real runway in the application with the scripted
// pilot (js/flight/PilotBot.js) and saves how it went: the pilot's report
// (takeoff, circuit, final approach, touchdown, rollout, crash), the page's
// errors, and a screenshot at every phase of the flight.
//
// Requires the dev server (`npm run dev`) and Google Chrome.
// Usage: node scripts/flight-scenario.js --out benchmarks/flight/<label>
//   [--airport LSGG] [--runway 0] [--end 0] [--time-scale 3] [--set timeOfDay=21 ...]
//
// --runway picks the n-th runway of the airport as the search lists it, --end
// its end (0 or 1) to take off from and land on. --time-scale runs the
// simulation that many times faster than real time (the terrain still loads
// in real time). --set passes a configuration value as a URL parameter.

import { chromium } from 'playwright-core';
import { mkdirSync, writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';

const { values } = parseArgs({
  options: {
    out: { type: 'string' },
    url: { type: 'string', default: 'http://localhost:3000/' },
    airport: { type: 'string', default: 'LSGG' },
    runway: { type: 'string', default: '0' },
    end: { type: 'string', default: '0' },
    'time-scale': { type: 'string', default: '3' },
    set: { type: 'string', multiple: true, default: [] },
    width: { type: 'string', default: '1600' },
    height: { type: 'string', default: '1000' },
  },
});
if (!values.out) {
  console.error('Missing --out <directory>');
  process.exit(1);
}
mkdirSync(values.out, { recursive: true });

/** Longest scenario (real time, ms) */
const TIMEOUT = 15 * 60 * 1000;

const browser = await chromium.launch({
  channel: 'chrome',
  headless: false,
  args: ['--enable-unsafe-webgpu', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: Number(values.width), height: Number(values.height) } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text().slice(0, 500));
});
const url = new URL(values.url);
url.searchParams.set('dev', '1');
url.searchParams.set('cameraMode', 'chase');
url.searchParams.set('showMinimap', 'false');
for (const assignment of values.set) {
  const eq = assignment.indexOf('=');
  if (eq < 1) {
    console.error(`Invalid --set ${assignment}, expected key=value`);
    process.exit(1);
  }
  url.searchParams.set(assignment.slice(0, eq), assignment.slice(eq + 1));
}
await page.goto(url.href, { waitUntil: 'load' });
await page.waitForFunction(() => window.osf !== undefined, null, { timeout: 30000 });
await page.waitForTimeout(2000);

// Lined up on the runway, the ground under it loaded
const started = await page.evaluate(
  async ([code, runway, end]) => {
    const [airport] = await (await fetch(`/api/airports?q=${encodeURIComponent(code)}`)).json();
    if (!airport || !airport.runways[runway]) return null;
    window.osf.startOnRunway(airport, airport.runways[runway], end);
    const r = airport.runways[runway];
    return `${airport.ident} ${airport.name}, runway ${r.ends[end].ident} (${Math.round(r.length)} × ${Math.round(r.width)} m)`;
  },
  [values.airport, Number(values.runway), Number(values.end)],
);
if (!started) {
  console.error(`No runway ${values.runway} at ${values.airport}`);
  await browser.close();
  process.exit(1);
}
console.log(`Start: ${started}`);
await page.waitForTimeout(1000);
await page.waitForFunction(() => !window.osf.runwayStartPending(), null, { timeout: 60000, polling: 500 });
await page.waitForTimeout(2000);

await page.evaluate((scale) => window.osf.setTimeScale(scale), Number(values['time-scale']));
if (!(await page.evaluate(() => window.osf.startCircuit()))) {
  console.error('The scripted pilot could not start');
  await browser.close();
  process.exit(1);
}

// Follow the flight: a screenshot at each phase
let phase = null;
let status = null;
const t0 = Date.now();
while (Date.now() - t0 < TIMEOUT) {
  status = await page.evaluate(() => window.osf.pilot());
  if (status.phase !== phase) {
    phase = status.phase;
    const index = String(status.report.phases.length).padStart(2, '0');
    await page.screenshot({ path: `${values.out}/${index}-${phase}.png` });
    console.log(`${status.time.toFixed(0).padStart(4)} s  ${phase}`);
  }
  if (status.done) break;
  await page.waitForTimeout(250);
}
await page.evaluate(() => window.osf.setTimeScale(1));

const report = {
  start: started,
  timeScale: Number(values['time-scale']),
  settings: values.set,
  completed: Boolean(status?.done),
  simulatedTime: status ? +status.time.toFixed(1) : null,
  ...status?.report,
  errors,
};
writeFileSync(`${values.out}/scenario.json`, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ ...report, phases: undefined }, null, 2));
console.log(`Report saved to ${values.out}/scenario.json`);
await browser.close();
