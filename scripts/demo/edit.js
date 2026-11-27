#!/usr/bin/env node

// Cuts the demo film from the recorded shots (scripts/demo/shots.js, recorded
// by scripts/cinematic-record.js) on the bars of the music, with its
// transitions, letterbox, titles and grade.
//
// Usage: node scripts/demo/edit.js --clips demo/clips --music <mp3> --out demo/film.mp4
//   [--scale 1] [--only-titles]
//
// The cuts fall on whole frames at 60 fps, rounded from the bar times so that
// they never drift from the music. Shots joined by a transition are cut into
// one intermediate file each; the files are then joined end to end, with the
// overlays and the music, in a last pass. --scale renders a smaller draft
// (0.5: 1920x1080).

import { chromium } from 'playwright-core';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import shots, { BAR, BAR0 } from './shots.js';

const { values } = parseArgs({
  options: {
    clips: { type: 'string', default: 'demo/clips' },
    music: { type: 'string' },
    out: { type: 'string', default: 'demo/film.mp4' },
    work: { type: 'string', default: 'demo/edit' },
    scale: { type: 'string', default: '1' },
    'only-titles': { type: 'boolean', default: false },
  },
});

const FPS = 60;
const SCALE = Number(values.scale);
const W = Math.round((3840 * SCALE) / 2) * 2;
const H = Math.round((2160 * SCALE) / 2) * 2;
/** Height of each letterbox bar for a 2.39:1 picture */
const BAR_H = Math.round((H - W / 2.39) / 2);
const work = resolve(values.work);
mkdirSync(work, { recursive: true });

/** Frame of the timeline where a bar starts; the film starts at frame 0 */
const frameOf = (bar) => Math.max(0, Math.round((BAR0 + bar * BAR) * FPS));

// ---------------------------------------------------------------------------
// Edit decisions
// ---------------------------------------------------------------------------

/** Transition into a shot (xfade type, seconds); none: a cut */
const TRANSITIONS = {
  'i1-sunrise-pan': ['fade', 1.2],
  'i2-sunrise-approach': ['fade', 0.8],
  'a1-valley-flyby': ['fadewhite', 0.3],
  'a4-brevent-dive': ['smoothleft', 0.35],
  'a7-midi-orbit': ['smoothright', 0.35],
  'b1-stratosphere': ['fadewhite', 0.8],
  'b2-tunnel-view': ['fade', 1.2],
  'c1-cloud-punch': ['fadewhite', 0.3],
  'c5-yosemite-chase': ['fadewhite', 0.5],
  'c7-canyon-tracking': ['smoothleft', 0.35],
  'd1-sunset-crossing': ['fadeblack', 1.0],
  'd2-canyon-golden': ['fade', 1.2],
  'e1-afterglow-orbit': ['fade', 1.0],
  'f1-sunrise-climb': ['fadewhite', 0.3],
  'f2-everest-pass': ['fadewhite', 0.5],
  'f5-bossons-descent': ['smoothleft', 0.35],
  'g1-departure': ['fade', 1.2],
  'g2-back-to-orbit': ['fade', 1.5],
};

/** Letterboxed stretches of the timeline, in bars: the bars close and open over BOX_EASE */
const LETTERBOX = [
  [-8, 0],
  [16, 24],
  [48, 64],
  [88, 99],
];
const BOX_EASE = 0.7;

/** Fade in from black at the start, out to black at the end (s) */
const FADE_IN = 2.0;
const FADE_OUT = 3.0;

/** Titles: [id, html, first bar, last bar] */
const LOWER_THIRD = (place, detail) =>
  `<div class="lt"><div class="rule"></div><div class="place">${place}</div><div class="detail">${detail}</div></div>`;
const TITLES = [
  [
    'title',
    `<div class="title"><div class="name">OPENSKYFLIGHT</div><div class="tag">Real-world flight&ensp;·&ensp;WebGPU</div></div>`,
    -5.2,
    -0.6,
  ],
  ['montblanc', LOWER_THIRD('MONT BLANC MASSIF', 'France&ensp;·&ensp;4 808 m'), 0.6, 3.6],
  ['strato', LOWER_THIRD('STRATOSPHERE', '17 000 m'), 16.5, 19.5],
  ['yosemite', LOWER_THIRD('YOSEMITE VALLEY', 'California'), 20.5, 23.5],
  ['canyon', LOWER_THIRD('GRAND CANYON', 'Arizona'), 36.3, 39.5],
  ['everest', LOWER_THIRD('MOUNT EVEREST', 'Nepal&ensp;·&ensp;8 849 m'), 66.3, 69.8],
  ['montblanc2', LOWER_THIRD('MONT BLANC', '4 808 m'), 84.3, 87.5],
  [
    'end',
    `<div class="title end"><div class="name">OPENSKYFLIGHT</div><div class="tag">In-engine footage&ensp;·&ensp;Real-world imagery and elevation</div><div class="credit">Music&ensp;·&ensp;Audio Hertz — World War Outerspace</div></div>`,
    93,
    98.6,
  ],
];
/** Seconds a title takes to fade in and out */
const TITLE_FADE = 0.6;

// ---------------------------------------------------------------------------
// Titles, drawn in Chrome on a transparent page
// ---------------------------------------------------------------------------

const STYLE = `
  html, body { margin: 0; background: transparent; width: ${W}px; height: ${H}px; overflow: hidden; }
  body { font-family: 'Avenir Next Condensed', 'Avenir Next', 'Helvetica Neue', sans-serif; color: #fff; }
  .title { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center;
    text-shadow: 0 0 ${40 * SCALE}px rgba(0,0,0,.45); }
  .name { font-weight: 600; font-size: ${190 * SCALE}px; letter-spacing: ${0.32}em; margin-right: -0.32em; }
  .tag { margin-top: ${30 * SCALE}px; font-weight: 500; font-size: ${54 * SCALE}px; letter-spacing: .3em; text-transform: uppercase; opacity: .9; }
  .credit { margin-top: ${90 * SCALE}px; font-weight: 500; font-size: ${42 * SCALE}px; letter-spacing: .18em; opacity: .75; }
  .end { justify-content: center; }
  .lt { position: absolute; left: ${170 * SCALE}px; bottom: ${380 * SCALE}px; text-shadow: 0 0 ${24 * SCALE}px rgba(0,0,0,.55); }
  .rule { width: ${120 * SCALE}px; height: ${6 * SCALE}px; background: #fff; margin-bottom: ${26 * SCALE}px; box-shadow: 0 0 ${18 * SCALE}px rgba(0,0,0,.4); }
  .place { font-weight: 600; font-size: ${96 * SCALE}px; letter-spacing: .14em; }
  .detail { margin-top: ${10 * SCALE}px; font-weight: 500; font-size: ${48 * SCALE}px; letter-spacing: .22em; text-transform: uppercase; opacity: .85; }
`;

async function drawTitles() {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage({ viewport: { width: W, height: H } });
  for (const [id, html] of TITLES) {
    await page.setContent(`<style>${STYLE}</style>${html}`);
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: join(work, `title-${id}.png`), omitBackground: true });
  }
  await browser.close();
}

// ---------------------------------------------------------------------------
// Cutting
// ---------------------------------------------------------------------------

function run(args) {
  execFileSync('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', ...args], { stdio: 'inherit' });
}

/** Encoding of the intermediate and final files */
const INTERMEDIATE = [
  '-c:v',
  'h264_videotoolbox',
  '-b:v',
  `${Math.round(220 * SCALE * SCALE)}M`,
  '-pix_fmt',
  'yuv420p',
  '-r',
  String(FPS),
];
const FINAL = [
  '-c:v',
  'h264_videotoolbox',
  '-profile:v',
  'high',
  '-b:v',
  `${Math.round(95 * SCALE * SCALE)}M`,
  '-maxrate',
  `${Math.round(130 * SCALE * SCALE)}M`,
  '-bufsize',
  `${Math.round(200 * SCALE * SCALE)}M`,
  '-pix_fmt',
  'yuv420p',
  '-r',
  String(FPS),
  '-movflags',
  '+faststart',
];

/** Shots in timeline order with their frames: start, length, and the transition into each */
function timeline() {
  const list = [...shots].sort((a, b) => a.bar - b.bar);
  return list.map((shot, i) => {
    const start = i === 0 ? 0 : frameOf(shot.bar);
    const end = i + 1 < list.length ? frameOf(list[i + 1].bar) : frameOf(shot.bar + shot.bars);
    const [type, seconds] = TRANSITIONS[shot.name] ?? [null, 0];
    return { shot, start, frames: end - start, transition: type && { type, frames: Math.round(seconds * FPS) } };
  });
}

/**
 * One file per run of shots joined by transitions. A transition starts on the
 * cut: the outgoing shot runs on into its recorded handle while the next one
 * starts, so the next shot's own first frame is on the beat.
 */
function cutChains(items) {
  const chains = [];
  for (const item of items) {
    if (item.transition && chains.length) chains[chains.length - 1].push(item);
    else chains.push([item]);
  }
  const files = [];
  chains.forEach((chain, c) => {
    const file = join(work, `chain-${String(c).padStart(2, '0')}.mp4`);
    files.push(file);
    const inputs = [];
    const filters = [];
    chain.forEach((item, k) => {
      const clip = resolve(values.clips, `${item.shot.name}.mp4`);
      if (!existsSync(clip)) throw new Error(`Missing clip ${clip}`);
      inputs.push('-i', clip);
      // Runs on through the next transition
      const next = chain[k + 1];
      const frames = item.frames + (next ? next.transition.frames : 0);
      const available = Math.floor((item.shot.duration - 0.05) * FPS);
      if (frames > available) throw new Error(`${item.shot.name}: ${frames} frames needed, ${available} recorded`);
      filters.push(
        `[${k}:v]trim=start_frame=0:end_frame=${frames},setpts=PTS-STARTPTS,fps=${FPS},scale=${W}:${H}:flags=lanczos,format=yuv420p[v${k}]`,
      );
    });
    let label = 'v0';
    let length = chain[0].frames;
    for (let k = 1; k < chain.length; k++) {
      const { type, frames } = chain[k].transition;
      const out = `x${k}`;
      filters.push(
        `[${label}][v${k}]xfade=transition=${type}:duration=${(frames / FPS).toFixed(4)}:offset=${(length / FPS).toFixed(4)}[${out}]`,
      );
      label = out;
      length += chain[k].frames;
    }
    filters.push(`[${label}]trim=end_frame=${length},setpts=PTS-STARTPTS[out]`);
    console.log(`Chain ${c}: ${chain.map((i) => i.shot.name).join(' → ')} (${length} frames)`);
    run([...inputs, '-filter_complex', filters.join(';'), '-map', '[out]', ...INTERMEDIATE, file]);
  });
  return files;
}

/** Ease 0 → 1 over BOX_EASE seconds into each letterboxed stretch and back out of it */
function letterboxExpression() {
  const terms = LETTERBOX.map(([b0, b1]) => {
    const t0 = frameOf(b0) / FPS;
    const t1 = frameOf(b1) / FPS;
    const up = `clip((t-${t0.toFixed(3)})/${BOX_EASE},0,1)`;
    const down = `clip((${t1.toFixed(3)}-t)/${BOX_EASE},0,1)`;
    return `min(${up},${down})`;
  });
  const k = terms.reduce((a, b) => `max(${a},${b})`);
  // Smoothstep of the closing
  return `(3*pow(${k},2)-2*pow(${k},3))`;
}

function finalPass(files, totalFrames) {
  const list = join(work, 'chains.txt');
  writeFileSync(list, files.map((f) => `file '${f}'`).join('\n'));
  const duration = totalFrames / FPS;
  const inputs = ['-f', 'concat', '-safe', '0', '-i', list, '-i', resolve(values.music)];
  const filters = [];
  // Grade: a touch of contrast and colour, a soft vignette
  filters.push(
    `[0:v]setpts=PTS-STARTPTS,eq=contrast=1.04:saturation=1.08:gamma=0.98,vignette=angle=PI/6:mode=forward,format=yuv420p[g]`,
  );
  let label = 'g';
  TITLES.forEach(([id, , b0, b1], i) => {
    const t0 = frameOf(b0) / FPS;
    const t1 = frameOf(b1) / FPS;
    inputs.push(
      '-loop',
      '1',
      '-framerate',
      String(FPS),
      '-t',
      (t1 - t0 + 0.1).toFixed(3),
      '-i',
      join(work, `title-${id}.png`),
    );
    const index = 2 + i;
    filters.push(
      `[${index}:v]format=rgba,fade=t=in:st=0:d=${TITLE_FADE}:alpha=1,fade=t=out:st=${(t1 - t0 - TITLE_FADE).toFixed(3)}:d=${TITLE_FADE}:alpha=1,setpts=PTS-STARTPTS+${t0.toFixed(3)}/TB[t${i}]`,
    );
    filters.push(
      `[${label}][t${i}]overlay=0:0:eof_action=pass:enable='between(t,${t0.toFixed(3)},${t1.toFixed(3)})'[o${i}]`,
    );
    label = `o${i}`;
  });
  const k = letterboxExpression();
  filters.push(`color=black:s=${W}x${BAR_H}:r=${FPS}[bar]`, `[bar]split[bar1][bar2]`);
  filters.push(`[${label}][bar1]overlay=x=0:y='-${BAR_H}+${BAR_H}*${k}':eval=frame:shortest=0[lb1]`);
  filters.push(`[lb1][bar2]overlay=x=0:y='${H}-${BAR_H}*${k}':eval=frame:shortest=0[lb2]`);
  filters.push(
    `[lb2]fade=t=in:st=0:d=${FADE_IN},fade=t=out:st=${(duration - FADE_OUT).toFixed(3)}:d=${FADE_OUT},trim=end_frame=${totalFrames}[v]`,
  );
  filters.push(
    `[1:a]atrim=0:${duration.toFixed(3)},afade=t=out:st=${(duration - FADE_OUT).toFixed(3)}:d=${FADE_OUT}[a]`,
  );
  run([
    ...inputs,
    '-filter_complex',
    filters.join(';'),
    '-map',
    '[v]',
    '-map',
    '[a]',
    ...FINAL,
    '-c:a',
    'aac',
    '-b:a',
    '320k',
    '-ar',
    '48000',
    resolve(values.out),
  ]);
}

await drawTitles();
if (!values['only-titles']) {
  if (!values.music) throw new Error('Missing --music <mp3>');
  const items = timeline();
  const files = cutChains(items);
  const total = items.reduce((n, i) => n + i.frames, 0);
  finalPass(files, total);
  console.log(`Film: ${resolve(values.out)} (${(total / FPS).toFixed(2)} s)`);
}
