#!/usr/bin/env node

// Records cinematic shots (js/cinematic/CinematicDirector.js) frame by frame
// in Chrome: each frame is rendered at a fixed time step once the terrain
// around it has loaded, then read back and encoded, so that the clip plays
// smoothly whatever the rendering speed.
//
// Requires the dev server (`npm run dev`), Google Chrome and ffmpeg.
// Usage: node scripts/cinematic-record.js --shots <module> --out <directory>
//   [--only name,name] [--fps 60] [--width 3840 --height 2160] [--scale 1]
//   [--preview 6] [--renders 1] [--set key=value ...]
//
// --shots is a module whose default export is the list of shots; each shot
// has a `name`, a `duration` (s of video) and an optional `speed` (simulated
// seconds per second of video, keyed over the video time for speed ramps).
// --scale renders at that multiple of the output size (supersampling): the
// clip is scaled down to --width x --height. --preview saves that many stills
// per shot (PNG, quarter size) instead of recording it. --renders draws each
// frame that many times at its pose. --set passes a configuration value in
// the URL for every shot.
//
// Output: <name>.mp4 per shot (H.264, quality 12, from JPEG frames at quality 96) and <name>.json, the
// shot's path figures and the frames that waited longest for the terrain.

import { chromium } from 'playwright-core';
import { mkdirSync, writeFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { sample } from '../js/cinematic/keyframes.js';

const { values } = parseArgs({
  options: {
    shots: { type: 'string' },
    out: { type: 'string' },
    url: { type: 'string', default: 'http://localhost:3000/' },
    only: { type: 'string' },
    fps: { type: 'string', default: '60' },
    width: { type: 'string', default: '3840' },
    height: { type: 'string', default: '2160' },
    scale: { type: 'string', default: '1' },
    preview: { type: 'string' },
    renders: { type: 'string', default: '1' },
    'tile-wait': { type: 'string', default: '4000' },
    set: { type: 'string', multiple: true, default: [] },
  },
});
if (!values.shots || !values.out) {
  console.error('Usage: cinematic-record.js --shots <module> --out <directory>');
  process.exit(1);
}
mkdirSync(values.out, { recursive: true });

const { default: allShots } = await import(pathToFileURL(resolve(values.shots)).href);
const only = values.only?.split(',');
const shots = only ? only.map((name) => allShots.find((s) => s.name === name) ?? die(`No shot ${name}`)) : allShots;
const fps = Number(values.fps);
const preview = values.preview ? Number(values.preview) : 0;
const width = Number(values.width);
const height = Number(values.height);
const scale = preview ? 0.25 : Number(values.scale);
const tileWait = Number(values['tile-wait']);

function die(message) {
  console.error(message);
  process.exit(1);
}

const browser = await chromium.launch({
  channel: 'chrome',
  headless: false,
  args: ['--enable-unsafe-webgpu', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({
  viewport: { width: Math.round((width * scale) / 2), height: Math.round((height * scale) / 2) },
  deviceScaleFactor: 2,
});
const cdp = await page.context().newCDPSession(page);
const errors = [];
/** Requests that failed since the last recorded shot: [url, error] */
const failedRequests = [];
page.on('requestfailed', (r) =>
  failedRequests.push([r.url().replace(/^https?:\/\/[^/]+/, ''), r.failure()?.errorText]),
);
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text().slice(0, 500));
});

const url = new URL(values.url);
url.searchParams.set('dev', '1');
url.searchParams.set('showHud', 'false');
url.searchParams.set('showMinimap', 'false');
url.searchParams.set('quality', 'ultra');
url.searchParams.set('dynamicResolution', 'false');
url.searchParams.set('antiCollisionLights', 'true');
for (const assignment of values.set) {
  const eq = assignment.indexOf('=');
  if (eq < 1) die(`Invalid --set ${assignment}, expected key=value`);
  url.searchParams.set(assignment.slice(0, eq), assignment.slice(eq + 1));
}
/**
 * Open the application afresh, its terrain centred on the shot: a page that
 * has loaded several places in a row ends up drawing tiles without their relief
 */
async function openApp(shot) {
  const first = shot.aircraft?.path[0] ?? shot.camera.points?.[0] ?? shot.camera.at;
  const [lat, lon] = shot.origin ?? [first.lat, first.lon];
  url.searchParams.set('lat', String(lat));
  url.searchParams.set('lon', String(lon));
  url.searchParams.set('hiResMode', String(Boolean(shot.env?.hiResMode)));
  await page.goto(url.href, { waitUntil: 'load' });
  await page.waitForFunction(() => window.osf !== undefined, null, { timeout: 60000 });
  // The scene alone: no overlay over the canvas
  await page.addStyleTag({ content: 'body > *:not(#canvas-container) { display: none !important; }' });
  await page.waitForTimeout(2000);
}

/**
 * Wait until no tile download is pending, and with `settled` until no tile
 * morphs either, several checks in a row (ms waited, or -1 after maxMs)
 */
async function waitTiles(maxMs, settled = false) {
  const t0 = Date.now();
  let quiet = 0;
  let waited = false;
  const needed = settled ? 4 : 2;
  while (Date.now() - t0 < maxMs) {
    const busy = await page.evaluate(
      (s) => (s ? window.osf.cinematic.terrainBusy() : window.osf.pendingTileDownloads() > 0),
      settled,
    );
    if (!busy && !waited) return 0;
    waited = true;
    quiet = busy ? 0 : quiet + 1;
    if (quiet >= needed) return Date.now() - t0;
    await page.waitForTimeout(settled ? 150 : 40);
  }
  return -1;
}

/** Places where the ground as drawn departs from the elevation data, beyond `tolerance` metres */
async function groundErrors(tolerance = 120) {
  const check = await page.evaluate(() => window.osf.cinematic.groundCheck());
  return Object.entries(check)
    .filter(([, pair]) => pair && pair[0] !== null && pair[1] !== null && Math.abs(pair[0] - pair[1]) > tolerance)
    .map(([what, pair]) => `${what}: drawn ${pair[0]} m, data ${pair[1]} m`);
}

const frame = (dt, renders = 1) => page.evaluate(([dt, n]) => window.osf.cinematic.frame(dt, n), [dt, renders]);

/** Simulated time step of the video frame starting at video time tau */
const stepAt = (shot, tau) => (shot.speed === undefined ? 1 : sample(shot.speed, tau + 0.5 / fps)) / fps;

/** Load a shot and fly through it in coarse steps so that its terrain is in the caches */
async function warmUp(shot, stills) {
  let info = await page.evaluate((s) => window.osf.cinematic.load(s), shot);
  const duration = shot.duration;
  const steps = stills || Math.max(4, Math.ceil(duration / 0.5));
  let tau = 0;
  let last = 0;
  await frame(0);
  for (let i = 0; i <= steps; i++) {
    // Video time of this still, and the simulated time to reach it
    const target = (duration * i) / steps;
    let dt = 0;
    while (tau < target - 1e-9) {
      dt += stepAt(shot, tau);
      tau += 1 / fps;
    }
    await frame(dt);
    await waitTiles(stills ? 30000 : 15000, true);
    if (i === 0) {
      // Tiles drawn without their relief: build the terrain again, once
      if ((await groundErrors()).length) {
        console.log('  ground errors at the start: reloading the terrain');
        await page.evaluate(() => window.osf.cinematic.reloadTerrain());
        await frame(0);
        await waitTiles(30000, true);
      }
      await page.evaluate(() => window.osf.cinematic.settle());
    }
    await frame(0, 3);
    if (stills) {
      const pose = await page.evaluate(() => window.osf.cinematic.pose());
      for (const error of await groundErrors())
        console.log(`  WARNING ${shot.name} still ${i}: ground under the ${error}`);
      await page.screenshot({ path: `${values.out}/${shot.name}-${i}.png` });
      console.log(
        `  still ${i} at ${target.toFixed(2)} s`,
        JSON.stringify(pose, (k, v) => (typeof v === 'number' ? Math.round(v) : v)),
      );
    }
    last = target;
  }
  return { info, last };
}

for (const shot of shots) {
  const started = Date.now();
  console.log(`Shot ${shot.name}: ${shot.duration} s`);
  await openApp(shot);
  const { info } = await warmUp(shot, preview);
  console.log('  ', JSON.stringify(info));
  if (preview) {
    if (failedRequests.length)
      console.log('  failed requests:', failedRequests.length, JSON.stringify(failedRequests.splice(0).slice(0, 3)));
    continue;
  }

  for (let attempt = 1; attempt <= 3; attempt++) {
    const result = await record(shot, info, started);
    if (result.ok) break;
    console.log(`\n  ${shot.name}, attempt ${attempt}: ${result.reason}; reloading the terrain`);
    await page.evaluate(() => window.osf.cinematic.reloadTerrain());
  }
}

/**
 * Record a shot from its start, with the camera's height fixed on the loaded
 * ground. Gives up when the ground as drawn departs from the elevation data
 * (tiles that failed to load their relief): the caller reloads the terrain.
 */
async function record(shot, info, started) {
  await page.evaluate((s) => window.osf.cinematic.load(s), shot);
  await frame(0);
  await waitTiles(30000, true);
  await page.evaluate(() => window.osf.cinematic.settle());
  // A moment of motion before the first frame, for the temporal filters
  const preroll = shot.preroll ?? 0.5;
  const prerollFrames = Math.round(preroll * fps);
  await frame(-prerollFrames * stepAt(shot, 0));
  for (let i = 0; i < prerollFrames; i++) await frame(stepAt(shot, 0));
  await waitTiles(30000, true);
  await frame(0, 1);
  const before = await groundErrors();
  if (before.length) return { ok: false, reason: before.join(', ') };

  const file = `${values.out}/${shot.name}.mp4`;
  const ffmpeg = spawn(
    'ffmpeg',
    [
      '-y',
      '-loglevel',
      'error',
      '-f',
      'image2pipe',
      '-framerate',
      String(fps),
      '-c:v',
      'mjpeg',
      '-i',
      '-',
      ...(scale === 1 ? [] : ['-vf', `scale=${width}:${height}:flags=lanczos`]),
      '-c:v',
      'libx264',
      '-preset',
      'medium',
      '-crf',
      '12',
      '-pix_fmt',
      'yuv420p',
      '-r',
      String(fps),
      file,
    ],
    { stdio: ['pipe', 'inherit', 'inherit'] },
  );
  const closed = new Promise((r) => ffmpeg.on('close', r));
  const frames = Math.round(shot.duration * fps);
  const waits = [];
  let failure = null;
  for (let i = 0; i < frames; i++) {
    const tau = i / fps;
    // Frame i shows video time tau: the first one where the preroll left off
    if (i > 0) await frame(stepAt(shot, tau - 1 / fps), Number(values.renders));
    else await frame(0, Number(values.renders));
    const waited = await waitTiles(tileWait);
    if (waited !== 0) {
      waits.push([i, waited]);
      // Draw the tiles that arrived meanwhile
      if (waited > 0) await frame(0, 1);
    }
    if (i % 20 === 0) {
      const errors = await groundErrors();
      if (errors.length) {
        failure = `frame ${i}: ${errors.join(', ')}`;
        break;
      }
    }
    const { data } = await cdp.send('Page.captureScreenshot', { format: 'jpeg', quality: 96, optimizeForSpeed: true });
    if (!ffmpeg.stdin.write(Buffer.from(data, 'base64'))) await new Promise((r) => ffmpeg.stdin.once('drain', r));
    if (i % fps === 0)
      process.stdout.write(`\r  ${i}/${frames} frames, ${((Date.now() - started) / 1000).toFixed(0)} s`);
  }
  ffmpeg.stdin.end();
  await closed;
  if (failure) return { ok: false, reason: failure };
  const seconds = (Date.now() - started) / 1000;
  console.log(
    `\r  ${frames} frames in ${seconds.toFixed(0)} s (${((seconds * 1000) / frames).toFixed(0)} ms per frame)`,
  );
  waits.sort((a, b) => b[1] - a[1]);
  writeFileSync(
    `${values.out}/${shot.name}.json`,
    JSON.stringify(
      {
        shot,
        info,
        seconds,
        longestTileWaits: waits.slice(0, 20),
        timeouts: waits.filter((w) => w[1] < 0).length,
        failedRequests: failedRequests.splice(0),
      },
      null,
      2,
    ),
  );
  return { ok: true };
}

await page.evaluate(() => window.osf.cinematic.stop());
if (errors.length) console.log('Page errors:', errors.slice(0, 10));
await browser.close();
