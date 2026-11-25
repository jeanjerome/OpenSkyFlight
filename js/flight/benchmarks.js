import * as THREE from 'three';
import FlightModel from './FlightModel.js';
import {
  accelerationTime,
  instantaneousTurn,
  serviceCeiling,
  speedAtAlpha,
  sustainedTurn,
  topSpeed,
} from './performance.js';
import { BASIC_MASS, INTERNAL_FUEL, STORES_MASS } from '../constants/rafale.js';
import { isa } from '../sim/atmosphere.js';

/**
 * Verification bench of the flight model: each case measures the model and
 * gives the published figure it is compared with (docs/gameplay-roadmap.md,
 * reference data). Run by `npm run flight:bench` and the unit tests.
 */

const DEG = Math.PI / 180;
const KNOT = 0.514444;
const STEP = 1 / 240;

/** Mass with half the internal fuel (kg) */
const HALF_FUEL_MASS = BASIC_MASS + STORES_MASS + INTERNAL_FUEL / 2;

/** Flight model started in trimmed flight, wings banked by `bank` degrees */
function trimmed(altitude, speed, lever, bank = 0) {
  const model = new FlightModel();
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, -bank * DEG, 'YXZ'));
  model.reset(new THREE.Vector3(0, altitude, 0), q, speed, lever);
  return model;
}

/** Run a model for some seconds, calling `each` before every step */
function fly(model, seconds, each) {
  const steps = Math.round(seconds / STEP);
  for (let i = 0; i < steps; i++) {
    each?.(model, i * STEP);
    model.step(STEP);
  }
  return model;
}

/**
 * @returns {{name: string, value: number, unit: string, target: number, tolerance: number, source: string}[]}
 *   tolerance: largest accepted deviation from the target, in the unit
 */
export function runFlightBench() {
  const results = [];
  const add = (name, value, unit, target, tolerance, source) =>
    results.push({ name, value, unit, target, tolerance, source });

  add(
    'Instantaneous turn, sea level, Mach 0.5',
    instantaneousTurn(0, 0.5, HALF_FUEL_MASS).rate / DEG,
    '°/s',
    30,
    3,
    'estimate',
  );
  add(
    'Sustained turn, sea level, Mach 0.6',
    sustainedTurn(0, 0.6, HALF_FUEL_MASS).rate / DEG,
    '°/s',
    23.9,
    2,
    'estimate',
  );
  const mach11 = topSpeed(11000, HALF_FUEL_MASS);
  add('Top speed at 11 000 m', mach11, 'Mach', 1.8, 0.08, 'official');
  const machSL = topSpeed(0, HALF_FUEL_MASS);
  add('Top speed at sea level', (machSL * isa(0).speedOfSound) / KNOT, 'kt', 750, 50, 'official');
  add('Service ceiling', serviceCeiling(HALF_FUEL_MASS), 'm', 16000, 1300, 'official 15 240 m, flight test 16 760 m');
  add('Approach speed, 16° angle of attack, 15 t', speedAtAlpha(16 * DEG, 15000) / KNOT, 'kt', 125, 8, 'flight test');
  const tas = KNOT * Math.sqrt(isa(0).density / isa(1524).density);
  add(
    'Acceleration 200 → 500 kt, 5 000 ft, 1.8 t of fuel',
    accelerationTime(1524, BASIC_MASS + STORES_MASS + 1800, 200 * tas, 500 * tas),
    's',
    10,
    8,
    'flight test, doubtful (needs thrust/weight ≈ 1.6)',
  );

  // Dynamic cases: the fly-by-wire responses
  let peak = 0;
  let maxAlpha = 0;
  let time = null;
  fly(trimmed(500, 0.6 * 340, 1), 3, (m, t) => {
    m.controls.pitch = 1;
    peak = Math.max(peak, m.loadFactor);
    maxAlpha = Math.max(maxAlpha, m.alpha);
    if (time === null && m.loadFactor >= 8.5) time = t;
  });
  add('Full pull, Mach 0.6: time to 8.5 g', time ?? Infinity, 's', 0.7, 0.5, 'estimate');
  add('Full pull, Mach 0.6: peak load factor', peak, 'g', 9, 0.3, 'official limit');

  let rolled = 0;
  let previous = 0;
  let full = null;
  fly(trimmed(3000, 220, 0.8), 2.5, (m, t) => {
    m.controls.roll = 1;
    let d = m.bank - previous;
    if (d < -Math.PI) d += 2 * Math.PI;
    if (d > Math.PI) d -= 2 * Math.PI;
    rolled += d;
    previous = m.bank;
    if (full === null && rolled >= 2 * Math.PI) full = t;
  });
  add('Full roll at 430 kt: time for 360°', full ?? Infinity, 's', 1.45, 0.25, 'flight test 270°/s');

  let minimum = Infinity;
  fly(trimmed(5000, 250, 0.8), 3, (m) => {
    m.controls.pitch = -1;
    minimum = Math.min(minimum, m.loadFactor);
  });
  add('Full push: lowest load factor', minimum, 'g', -3.2, 0.3, 'official limit');

  let alphaLimit = 0;
  fly(trimmed(3000, 120, 0), 8, (m) => {
    m.controls.pitch = 1;
    if (m.dynamicPressure > 1500) alphaLimit = Math.max(alphaLimit, m.alpha);
  });
  add('Slow full pull: highest angle of attack', alphaLimit / DEG, '°', 29, 1, 'flight test limit');

  const level = fly(trimmed(5000, 250, 0.6), 30);
  add('Neutral stick 30 s: altitude change', level.position.y - 5000, 'm', 0, 30, 'flight path hold');
  const turn = fly(trimmed(3000, 200, 0.75, 45), 20);
  add('Neutral stick, 45° bank 20 s: altitude change', turn.position.y - 3000, 'm', 0, 40, 'level turn hold');

  return results;
}
