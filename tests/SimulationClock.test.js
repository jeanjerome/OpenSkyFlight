import { test } from 'node:test';
import assert from 'node:assert/strict';
import SimulationClock from '../js/sim/SimulationClock.js';

test('runs the steps the elapsed time holds and carries the rest over', () => {
  const clock = new SimulationClock(240, 24);
  let steps = 0;
  // 60 frames of 1/120 s: 2 steps each
  for (let i = 0; i < 60; i++) clock.advance(1 / 120, () => steps++);
  assert.equal(steps, 120);
  assert.ok(Math.abs(clock.time - 0.5) < 1e-9);
});

test('frames shorter than a step accumulate', () => {
  const clock = new SimulationClock(240, 24);
  let steps = 0;
  assert.equal(
    clock.advance(1 / 1000, () => steps++),
    0,
  );
  assert.ok(clock.alpha > 0.2 && clock.alpha < 0.3);
  for (let i = 0; i < 3; i++) clock.advance(1 / 1000, () => steps++);
  assert.equal(steps, 0);
  clock.advance(1 / 1000, () => steps++);
  assert.equal(steps, 1);
});

test('the same total time gives the same steps whatever the frame rate', () => {
  const count = (frameTime, frames) => {
    const clock = new SimulationClock(240, 24);
    let steps = 0;
    for (let i = 0; i < frames; i++) clock.advance(frameTime, () => steps++);
    return steps;
  };
  assert.equal(count(1 / 60, 60), count(1 / 144, 144));
});

test('a long stall runs at most maxSteps and drops the rest', () => {
  const clock = new SimulationClock(240, 24);
  let steps = 0;
  clock.advance(1, () => steps++);
  assert.equal(steps, 24);
  assert.equal(clock.alpha, 0);
});

test('a pause (dt = 0) runs nothing', () => {
  const clock = new SimulationClock(240, 24);
  let steps = 0;
  clock.advance(0, () => steps++);
  assert.equal(steps, 0);
});
