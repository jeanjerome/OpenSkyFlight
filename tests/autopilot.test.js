import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import AircraftState from '../js/flight/AircraftState.js';
import SimulatedFlight from '../js/flight/SimulatedFlight.js';

const STEP = 1 / 240;
const DEG = Math.PI / 180;
const idle = () => ({
  flight: { pitch: 0, roll: 0, yaw: 0, direct: false, throttle: 0, airbrake: false, aimYaw: 0, aimPitch: 0 },
});

function fly(flight, seconds, commands = idle) {
  for (let i = 0; i < seconds / STEP; i++) {
    if (i % 2 === 0) flight.applyControls(commands(i * STEP), 2 * STEP);
    flight.step(STEP);
  }
}

test('the autopilot turns to its heading and climbs to its altitude, wings level at the end', () => {
  const flight = new SimulatedFlight(new AircraftState(), () => 0);
  flight.teleport(new THREE.Vector3(0, 3000, 0), 0, 0, 200);
  flight.model.controls.lever = 0.7;
  assert.ok(flight.toggleAutopilot());
  // 30° to the right (headings are positive to the west) and 300 m higher
  flight.autopilot.heading = -30 * DEG;
  flight.autopilot.altitude = 3300;
  fly(flight, 90);
  const heading = flight.aircraft.yaw / DEG;
  assert.ok(Math.abs(heading + 30) < 2, `heading ${heading}°`);
  assert.ok(Math.abs(flight.model.position.y - 3300) < 30, `altitude ${flight.model.position.y}`);
  assert.ok(Math.abs(flight.model.bank) < 3 * DEG, `bank ${flight.model.bank / DEG}°`);
  assert.ok(flight.autopilot, 'still engaged');
});

test('moving the stick disconnects the autopilot', () => {
  const flight = new SimulatedFlight(new AircraftState(), () => 0);
  flight.teleport(new THREE.Vector3(0, 3000, 0), 0, 0, 200);
  let off = 0;
  flight.onAutopilotOff = () => off++;
  flight.toggleAutopilot();
  fly(flight, 1, (t) => {
    const c = idle();
    if (t > 0.5) c.flight.pitch = 0.5;
    return c;
  });
  assert.equal(flight.autopilot, null);
  assert.equal(off, 1);
});
