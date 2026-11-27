#!/usr/bin/env node

// Draws the YouTube thumbnails of the demo film: a frame of a recorded shot
// behind the title, the hook and the badges laid out in
// demo/youtube/thumbnail*.html, saved as PNG and JPG (1920x1080).
//
// Requires Google Chrome, ffmpeg and the recorded clips (scripts/demo/README.md).
// Usage: node scripts/demo/thumbnail.js [--clips demo/clips] [--shot c3-aileron-roll] [--at 0.5]

import { chromium } from 'playwright-core';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';

const { values } = parseArgs({
  options: {
    clips: { type: 'string', default: 'demo/clips' },
    shot: { type: 'string', default: 'c3-aileron-roll' },
    at: { type: 'string', default: '0.5' },
  },
});

const dir = resolve('demo/youtube');
// The layouts read the frame as thumbnail-source.png next to them
execFileSync('ffmpeg', [
  '-y',
  '-loglevel',
  'error',
  '-ss',
  values.at,
  '-i',
  resolve(values.clips, `${values.shot}.mp4`),
  '-frames:v',
  '1',
  `${dir}/thumbnail-source.png`,
]);

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
for (const name of ['thumbnail', 'thumbnail-fr']) {
  await page.goto(pathToFileURL(`${dir}/${name}.html`).href);
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: `${dir}/${name}.png` });
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', `${dir}/${name}.png`, '-q:v', '2', `${dir}/${name}.jpg`]);
  console.log(`${dir}/${name}.jpg`);
}
await browser.close();
