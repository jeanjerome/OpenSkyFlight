#!/usr/bin/env node

// Prints comparable figures for benchmark reports saved by render-benchmark.js.
//
// Usage: node scripts/render-summary.js <report.json> [<report.json> ...]
//
// Figures, one line per report:
// - fps: frames / duration. Reports saved before summary.fps.avg was computed the
//   same way averaged instantaneous FPS values, which catch-up frames bias upward.
// - p5 / p1: FPS percentiles from the report summary.
// - gpu: median GPU time in ms (p95 in parentheses). At vsync the GPU clock governor
//   stretches light frames to about three quarters of the refresh interval, so this
//   shows GPU load, not frame cost; render-capture.js measures the cost.
// - slow: number of frames over 33.3 ms / over 50 ms.
// - tri: average triangle count; dc: median draw calls per frame.

import { readFileSync } from 'node:fs';
import { basename, dirname } from 'node:path';

const files = process.argv.slice(2);
if (files.length === 0) {
  console.error('Usage: node scripts/render-summary.js <report.json> [<report.json> ...]');
  process.exit(1);
}

const sorted = (values) => [...values].sort((a, b) => a - b);
const percentile = (values, p) => {
  const s = sorted(values);
  return s[Math.min(s.length - 1, Math.floor(s.length * p))];
};
const median = (values) => percentile(values, 0.5);

for (const file of files) {
  const report = JSON.parse(readFileSync(file, 'utf8'));
  const frames = report.frames.filter((f) => f.ft > 0);
  const durationS = report.duration;
  const frameTimes = frames.map((f) => f.ft);
  const gpu = frames.map((f) => f.gpu).filter((v) => v > 0);

  const fields = [
    `${basename(dirname(file))}/${basename(file)}`,
    `dur ${durationS.toFixed(0)} s`,
    `fps ${(frames.length / durationS).toFixed(1)}`,
    `p5 ${report.summary.fps.p5}`,
    `p1 ${report.summary.fps.p1}`,
    gpu.length ? `gpu ${median(gpu).toFixed(1)} (${percentile(gpu, 0.95).toFixed(1)})` : 'gpu n/a',
    `slow ${frameTimes.filter((t) => t > 33.3).length}/${frameTimes.filter((t) => t > 50).length}`,
    `tri ${(report.summary.triangles.avg / 1e6).toFixed(2)}M`,
    `dc ${median(frames.map((f) => f.dc))}`,
  ];
  console.log(fields.join('  '));
}
