import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runFlightBench } from '../js/flight/benchmarks.js';
import { alphaForLift, liftCoefficient } from '../js/flight/aerodynamics.js';
import Engines, { DRY_DETENT } from '../js/flight/Engines.js';
import { isa } from '../js/sim/atmosphere.js';

for (const r of runFlightBench()) {
  test(`flight bench: ${r.name}`, () => {
    assert.ok(
      Math.abs(r.value - r.target) <= r.tolerance,
      `${r.value} ${r.unit}, expected ${r.target} ± ${r.tolerance}`,
    );
  });
}

test('the angle of attack for a lift coefficient inverts the lift curve', () => {
  for (const mach of [0.3, 0.9, 1.5]) {
    for (const alpha of [-0.2, 0.05, 0.3, 0.5]) {
      assert.ok(Math.abs(alphaForLift(liftCoefficient(alpha, mach), mach) - alpha) < 1e-9);
    }
  }
});

test('static sea-level thrust matches 2 × 50 kN dry and 2 × 75 kN with afterburner', () => {
  const engines = new Engines();
  engines.setLever(DRY_DETENT);
  assert.equal(Math.round(engines.update(0, DRY_DETENT, isa(0), 0, true)), 100000);
  engines.setLever(1);
  assert.equal(Math.round(engines.update(0, 1, isa(0), 0, true)), 150000);
});

test('the engines spool from idle to full afterburner in about 4 s', () => {
  const engines = new Engines();
  engines.setLever(0);
  let t = 0;
  while (engines.update(1 / 240, 1, isa(0), 0, true) < 0.95 * 150000 && t < 20) t += 1 / 240;
  assert.ok(t > 2.5 && t < 5.5, `${t.toFixed(2)} s`);
});

test('the engines flame out without fuel', () => {
  const engines = new Engines();
  engines.setLever(1);
  for (let i = 0; i < 240 * 10; i++) engines.update(1 / 240, 1, isa(0), 0, false);
  assert.equal(engines.thrust, 0);
});
