#!/usr/bin/env node

// Runs the in-app benchmark (B key) in Chrome and saves the JSON report it downloads.
//
// Requires the dev server (`npm run dev`) and Google Chrome.
// Usage: node scripts/render-benchmark.js --out benchmarks/render/<label> [--plan <n>]
//
// Without --plan the built-in default flight is flown (≈ 5 min at 6000 m, the
// flight used by BENCHMARKS.md). --plan <n> selects the n-th file of
// assets/flightplans/ (sorted by name) through the flight plan menu.

import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
import { parseArgs } from 'node:util';

const { values } = parseArgs({
  options: {
    out: { type: 'string' },
    url: { type: 'string', default: 'http://localhost:3000/' },
    plan: { type: 'string' },
    width: { type: 'string', default: '2056' },
    height: { type: 'string', default: '1290' },
  },
});
if (!values.out) {
  console.error('Missing --out <directory>');
  process.exit(1);
}
mkdirSync(values.out, { recursive: true });

const browser = await chromium.launch({
  channel: 'chrome',
  headless: false,
  args: ['--enable-unsafe-webgpu', '--ignore-gpu-blocklist'],
});
const context = await browser.newContext({
  viewport: { width: Number(values.width), height: Number(values.height) },
  deviceScaleFactor: 2,
  acceptDownloads: true,
});
const page = await context.newPage();
await page.goto(values.url, { waitUntil: 'load' });
await page.waitForFunction(() => window.osf !== undefined, null, { timeout: 30000 });

// Let the initial terrain finish loading so the warmup starts from a steady state
const t0 = Date.now();
while (Date.now() - t0 < 60000 && (await page.evaluate(() => window.osf.pendingTileDownloads())) > 0) {
  await page.waitForTimeout(500);
}
await page.waitForTimeout(2000);

if (values.plan) {
  await page.keyboard.press('l');
  await page.waitForSelector('#flightplan-menu', { state: 'visible' });
  await page.keyboard.press(`Digit${values.plan}`);
  await page.waitForTimeout(1000);
}

const download = page.waitForEvent('download', { timeout: 15 * 60 * 1000 });
await page.keyboard.press('b');
console.log(`Benchmark started (${values.plan ? `flight plan ${values.plan}` : 'default flight'})`);
const file = `${values.out}/benchmark-${values.plan ? `plan${values.plan}` : 'default'}.json`;
await (await download).saveAs(file);
console.log(`Report saved to ${file}`);
await browser.close();
