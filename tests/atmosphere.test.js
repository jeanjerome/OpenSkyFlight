import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isa, SEA_LEVEL_DENSITY } from '../js/sim/atmosphere.js';

/** Within a relative tolerance */
function near(actual, expected, tolerance, label) {
  assert.ok(Math.abs(actual - expected) <= Math.abs(expected) * tolerance, `${label}: ${actual} vs ${expected}`);
}

// Reference values of the standard atmosphere tables at geometric altitudes
const TABLE = [
  { altitude: 0, temperature: 288.15, pressure: 101325, density: 1.225, speedOfSound: 340.29 },
  { altitude: 1000, temperature: 281.65, pressure: 89876, density: 1.1117, speedOfSound: 336.43 },
  { altitude: 5000, temperature: 255.68, pressure: 54048, density: 0.73643, speedOfSound: 320.55 },
  { altitude: 11000, temperature: 216.77, pressure: 22700, density: 0.3648, speedOfSound: 295.15 },
  { altitude: 15000, temperature: 216.65, pressure: 12111, density: 0.19476, speedOfSound: 295.07 },
  { altitude: 20000, temperature: 216.65, pressure: 5529.3, density: 0.08891, speedOfSound: 295.07 },
  { altitude: 30000, temperature: 226.51, pressure: 1197.0, density: 0.01841, speedOfSound: 301.71 },
];

test('matches the standard atmosphere tables', () => {
  for (const row of TABLE) {
    const air = isa(row.altitude);
    for (const key of ['temperature', 'pressure', 'density', 'speedOfSound']) {
      near(air[key], row[key], 0.002, `${key} at ${row.altitude} m`);
    }
  }
});

test('sea-level density constant agrees with the model', () => {
  near(isa(0).density, SEA_LEVEL_DENSITY, 1e-4, 'density');
});

test('works below sea level and stays finite far above the model', () => {
  assert.ok(isa(-430).pressure > 101325);
  const high = isa(100000);
  assert.ok(Number.isFinite(high.density) && high.density > 0);
});

test('fills the given object', () => {
  const out = {};
  assert.equal(isa(3000, out), out);
  assert.ok(out.density < SEA_LEVEL_DENSITY);
});
