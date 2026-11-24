#!/usr/bin/env node

// Captures every reference view (js/constants/referenceViews.js) in Chrome and
// measures frame pacing and GPU time on each one.
//
// Requires the dev server (`npm run dev`) and Google Chrome.
// Usage: node scripts/render-capture.js --out benchmarks/render/<label> [--headless] [--width 2056 --height 1290]
//        [--views 1,6] [--set bloomEnabled=false ...]
//
// --views captures only the listed views (1-based). --set overrides a configuration
// value (js/utils/config.js) before the captures, e.g. to measure the cost of an
// effect by difference; values are parsed as JSON, falling back to a string.
//
// Output: view-<n>.png screenshots (HUD and minimap hidden) and views.json.
// Chrome runs headed with vsync by default: headless or uncapped frame pacing
// does not present every frame, so its FPS figures are not representative.
//
// GPU time is measured separately from frame pacing. At vsync a light frame leaves
// the GPU idle and its clock governor slows it down until the frame fills about
// three quarters of the refresh interval, whatever the frame costs. Each view is
// therefore also rendered --renders times per frame, which makes the GPU the
// bottleneck at a steady clock: the GPU span divided by that count is the cost of
// one frame. gpuBusy (GPU time x frame rate) close to 1 confirms the GPU was the
// limit; keep the same --renders value for runs that are compared.

import { chromium } from 'playwright-core';
import { mkdirSync, writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';

const { values } = parseArgs({
  options: {
    out: { type: 'string' },
    url: { type: 'string', default: 'http://localhost:3000/' },
    headless: { type: 'boolean', default: false },
    width: { type: 'string', default: '2056' },
    height: { type: 'string', default: '1290' },
    measureMs: { type: 'string', default: '5000' },
    renders: { type: 'string', default: '12' },
    views: { type: 'string' },
    set: { type: 'string', multiple: true, default: [] },
  },
});
if (!values.out) {
  console.error('Missing --out <directory>');
  process.exit(1);
}
mkdirSync(values.out, { recursive: true });

const browser = await chromium.launch({
  channel: 'chrome',
  headless: values.headless,
  args: ['--enable-unsafe-webgpu', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({
  viewport: { width: Number(values.width), height: Number(values.height) },
  deviceScaleFactor: 2,
});
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text());
});

await page.goto(values.url, { waitUntil: 'load' });
await page.waitForFunction(() => window.osf !== undefined, null, { timeout: 30000 });
await page.keyboard.press('h'); // hide HUD
await page.keyboard.press('m'); // hide minimap

const overrides = {};
for (const assignment of values.set) {
  const eq = assignment.indexOf('=');
  if (eq < 1) {
    console.error(`Invalid --set ${assignment}, expected key=value`);
    process.exit(1);
  }
  const raw = assignment.slice(eq + 1);
  let value;
  try {
    value = JSON.parse(raw);
  } catch {
    value = raw;
  }
  overrides[assignment.slice(0, eq)] = value;
}
for (const [key, value] of Object.entries(overrides)) {
  await page.evaluate(([k, v]) => window.osf.setConfig(k, v), [key, value]);
}

/** Wait until no tile download has been pending for 3 s. Returns the wait in ms, -1 on timeout. */
async function waitTilesSettled(maxMs = 90000) {
  const t0 = Date.now();
  let stable = 0;
  while (Date.now() - t0 < maxMs) {
    const pending = await page.evaluate(() => window.osf.pendingTileDownloads());
    stable = pending === 0 ? stable + 1 : 0;
    if (stable >= 6) return Date.now() - t0;
    await page.waitForTimeout(500);
  }
  return -1;
}

/** Sample requestAnimationFrame intervals for `ms` milliseconds. */
function measurePacing(ms) {
  return page.evaluate(
    (ms) =>
      new Promise((resolve) => {
        const frameTimes = [];
        let prev = performance.now();
        const end = prev + ms;
        function tick(now) {
          frameTimes.push(now - prev);
          prev = now;
          if (now < end) {
            requestAnimationFrame(tick);
            return;
          }
          const sorted = frameTimes.slice(1).sort((a, b) => a - b);
          const pct = (p) => sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];
          const avg = sorted.reduce((a, b) => a + b, 0) / sorted.length;
          resolve({
            frames: sorted.length,
            fpsAvg: +(1000 / avg).toFixed(1),
            fpsP5: +(1000 / pct(0.95)).toFixed(1),
            fpsP1: +(1000 / pct(0.99)).toFixed(1),
            frameTimeAvgMs: +avg.toFixed(2),
          });
        }
        requestAnimationFrame(tick);
      }),
    ms,
  );
}

/** Render each frame `renders` times and sample the GPU time of one render for `ms` milliseconds. */
async function measureGpu(renders, ms) {
  await page.evaluate((n) => window.osf.setRendersPerFrame(n), renders);
  await page.waitForTimeout(1000); // clock ramps up, older frames drain from the timer
  const result = await page.evaluate(
    ({ renders, ms }) =>
      new Promise((resolve) => {
        const gpuTimes = [];
        const start = performance.now();
        const end = start + ms;
        function tick(now) {
          const gpu = window.osf.lastGpuTimeMs();
          if (gpu > 0) gpuTimes.push(gpu);
          if (now < end) {
            requestAnimationFrame(tick);
            return;
          }
          gpuTimes.sort((a, b) => a - b);
          const pct = (p) => gpuTimes[Math.min(gpuTimes.length - 1, Math.floor(p * gpuTimes.length))];
          const fps = gpuTimes.length / ((now - start) / 1000);
          const median = pct(0.5);
          resolve({
            gpuRenders: renders,
            gpuMedianMs: gpuTimes.length ? +median.toFixed(2) : null,
            gpuP90Ms: gpuTimes.length ? +pct(0.9).toFixed(2) : null,
            gpuBusy: gpuTimes.length ? +((median * renders * fps) / 1000).toFixed(2) : null,
          });
        }
        requestAnimationFrame(tick);
      }),
    { renders, ms },
  );
  await page.evaluate(() => window.osf.setRendersPerFrame(1));
  return result;
}

const views = await page.evaluate(() => window.osf.referenceViews);
const selected = values.views ? values.views.split(',').map(Number) : views.map((_, i) => i + 1);
const results = [];
for (const n of selected) {
  await page.evaluate((i) => window.osf.setReferenceView(i), n);
  await page.waitForTimeout(1500);
  const tilesSettledMs = await waitTilesSettled();
  await page.waitForTimeout(2500); // chase camera settles, notification fades out
  const pacing = await measurePacing(Number(values.measureMs));
  await page.screenshot({ path: `${values.out}/view-${n}.png` });
  const renderInfo = await page.evaluate(() => ({ ...window.osf.renderInfo(), renderScale: window.osf.renderScale() }));
  const gpu = await measureGpu(Number(values.renders), 3000);
  if (gpu.gpuBusy !== null && gpu.gpuBusy < 0.9) {
    console.warn(`View ${n}: GPU busy ${gpu.gpuBusy}, not GPU-bound — raise --renders`);
  }
  results.push({ view: n, name: views[n - 1], tilesSettledMs, ...pacing, ...renderInfo, ...gpu });
  console.log(JSON.stringify(results.at(-1)));
}

const report = {
  date: new Date().toISOString(),
  userAgent: await page.evaluate(() => navigator.userAgent),
  viewport: `${values.width}x${values.height}@2x`,
  headless: values.headless,
  overrides,
  results,
  errors,
};
writeFileSync(`${values.out}/views.json`, JSON.stringify(report, null, 2));
if (errors.length) console.log('Page errors:', errors.slice(0, 10));
await browser.close();
