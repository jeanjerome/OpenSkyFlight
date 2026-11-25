import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import AircraftState from '../js/flight/AircraftState.js';
import SimulatedFlight from '../js/flight/SimulatedFlight.js';

const DEG = Math.PI / 180;
const STEP = 1 / 240;

/**
 * Level flight at 220 m/s and 5 000 m; the mouse sweeps the aim by (yaw, pitch)
 * in 0.3 s, then lets go. Returns when the nose first comes within 3° of the
 * aim, the largest bank, how often the roll rate reversed (above 0.15 rad/s)
 * and the bank at the end.
 */
function sweep(yaw, pitch, seconds = 14) {
  const flight = new SimulatedFlight(new AircraftState(), () => 0);
  flight.teleport(new THREE.Vector3(0, 5000, 0), 0, 0, 220);
  const commands = {
    flight: { pitch: 0, roll: 0, yaw: 0, direct: false, throttle: 0, airbrake: false, aimYaw: 0, aimPitch: 0 },
  };
  const nose = new THREE.Vector3();
  let reached = null;
  let maxBank = 0;
  let reversals = 0;
  let lastSign = 0;
  for (let i = 0; i < seconds / STEP; i++) {
    const t = i * STEP;
    if (i % 2 === 0) {
      const share = t < 0.3 ? (2 * STEP) / 0.3 : 0;
      commands.flight.aimYaw = yaw * share;
      commands.flight.aimPitch = pitch * share;
      flight.applyControls(commands, 2 * STEP);
    }
    flight.step(STEP);
    const model = flight.model;
    maxBank = Math.max(maxBank, Math.abs(model.bank));
    const rollRate = -model.angularVelocity.z;
    const sign = Math.abs(rollRate) > 0.15 ? Math.sign(rollRate) : 0;
    if (sign && lastSign && sign !== lastSign) reversals++;
    if (sign) lastSign = sign;
    nose.set(0, 0, -1).applyQuaternion(model.quaternion);
    if (reached === null && t > 0.3 && Math.acos(Math.min(1, nose.dot(flight.aim.direction))) < 3 * DEG) reached = t;
  }
  return { reached, maxBank: maxBank / DEG, reversals, endBank: flight.model.bank / DEG };
}

test('the mouse aim reaches an aim 20° or 30° below by pushing, without rolling', () => {
  for (const below of [20, 30]) {
    const r = sweep(0, -below * DEG);
    assert.ok(r.maxBank < 5, `${below}° below: bank up to ${r.maxBank.toFixed(0)}°`);
    assert.ok(r.reached !== null && r.reached < 4, `${below}° below: reached at ${r.reached}`);
  }
});

test('the mouse aim reaches a steep aim by rolling inverted and pulling, then rolls upright once', () => {
  const r = sweep(0, -60 * DEG);
  assert.ok(r.reached !== null && r.reached < 5, `reached at ${r.reached}`);
  assert.ok(r.reversals <= 2, `${r.reversals} roll reversals`);
  assert.ok(Math.abs(r.endBank) < 15, `bank at the end ${r.endBank.toFixed(0)}°`);
});

test('the mouse aim reaches a low aim to the side without swinging', () => {
  for (const [yaw, pitch] of [
    [-20, -20],
    [40, -30],
  ]) {
    const r = sweep(yaw * DEG, pitch * DEG);
    assert.ok(r.reached !== null && r.reached < 4, `${yaw}°, ${pitch}°: reached at ${r.reached}`);
    assert.ok(r.reversals <= 3, `${yaw}°, ${pitch}°: ${r.reversals} roll reversals`);
    assert.ok(Math.abs(r.endBank) < 15, `${yaw}°, ${pitch}°: bank at the end ${r.endBank.toFixed(0)}°`);
  }
});

test('the mouse aim does not rock the wings near a steep climbing aim', () => {
  const r = sweep(-30 * DEG, 60 * DEG);
  assert.ok(r.reached !== null && r.reached < 4, `reached at ${r.reached}`);
  assert.ok(r.reversals <= 4, `${r.reversals} roll reversals`);
  assert.ok(r.maxBank < 45, `bank up to ${r.maxBank.toFixed(0)}°`);
});
