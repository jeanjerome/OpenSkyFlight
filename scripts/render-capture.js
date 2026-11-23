#!/usr/bin/env node

// Captures every reference view (js/constants/referenceViews.js) in Chrome and
// measures frame pacing and GPU time on each one.
//
// Requires the dev server (`npm run dev`) and Google Chrome.
// Usage: node scripts/render-capture.js --out benchmarks/render/<label> [--headless] [--width 2056 --height 1290]
//
// Output: view-<n>.png screenshots (HUD and minimap hidden) and views.json.
// Chrome runs headed with vsync by default: headless or uncapped frame pacing
// does not present every frame, so its FPS figures are not representative.

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

/** Sample requestAnimationFrame intervals and GPU time for `ms` milliseconds. */
function measure(ms) {
  return page.evaluate(
    (ms) =>
      new Promise((resolve) => {
        const frameTimes = [];
        const gpuTimes = [];
        let prev = performance.now();
        const end = prev + ms;
        function tick(now) {
          frameTimes.push(now - prev);
          prev = now;
          const gpu = window.osf.lastGpuTimeMs();
          if (gpu > 0) gpuTimes.push(gpu);
          if (now < end) {
            requestAnimationFrame(tick);
            return;
          }
          const sorted = frameTimes.slice(1).sort((a, b) => a - b);
          const pct = (p) => sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];
          const avg = sorted.reduce((a, b) => a + b, 0) / sorted.length;
          gpuTimes.sort((a, b) => a - b);
          resolve({
            frames: sorted.length,
            fpsAvg: +(1000 / avg).toFixed(1),
            fpsP5: +(1000 / pct(0.95)).toFixed(1),
            fpsP1: +(1000 / pct(0.99)).toFixed(1),
            frameTimeAvgMs: +avg.toFixed(2),
            gpuMedianMs: gpuTimes.length ? +gpuTimes[Math.floor(gpuTimes.length / 2)].toFixed(2) : null,
          });
        }
        requestAnimationFrame(tick);
      }),
    ms,
  );
}

const views = await page.evaluate(() => window.osf.referenceViews);
const results = [];
for (let n = 1; n <= views.length; n++) {
  await page.evaluate((i) => window.osf.setReferenceView(i), n);
  await page.waitForTimeout(1500);
  const tilesSettledMs = await waitTilesSettled();
  await page.waitForTimeout(2500); // chase camera settles, notification fades out
  const metrics = await measure(Number(values.measureMs));
  await page.screenshot({ path: `${values.out}/view-${n}.png` });
  results.push({ view: n, name: views[n - 1], tilesSettledMs, ...metrics });
  console.log(JSON.stringify(results.at(-1)));
}

const report = {
  date: new Date().toISOString(),
  userAgent: await page.evaluate(() => navigator.userAgent),
  viewport: `${values.width}x${values.height}@2x`,
  headless: values.headless,
  results,
  errors,
};
writeFileSync(`${values.out}/views.json`, JSON.stringify(report, null, 2));
if (errors.length) console.log('Page errors:', errors.slice(0, 10));
await browser.close();
