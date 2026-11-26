import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import FlightModel from '../js/flight/FlightModel.js';

const STEP = 1 / 240;
const KNOT = 0.514444;
const DEG = Math.PI / 180;

/** Aircraft standing on flat ground, gear down, engines at idle */
function standing() {
  const model = new FlightModel();
  model.reset(new THREE.Vector3(0, 1.9, 0), new THREE.Quaternion(), 0, 0, true);
  model.groundHeight = () => 0;
  return model;
}

function fly(model, seconds, each) {
  for (let t = 0; t < seconds; t += STEP) {
    each?.(model, t);
    model.step(STEP);
  }
  return model;
}

const legs = (model) => Object.fromEntries(model.wheels.legs.map((leg) => [leg.spec.name, leg]));

test('standing on its wheels, the struts settle within their travel and the nose wheel carries a small share', () => {
  const model = fly(standing(), 3, (m) => (m.controls.brake = 1));
  const { nose, left, right } = legs(model);
  assert.ok(model.onGround);
  for (const leg of [nose, left, right])
    assert.ok(leg.compression > 0.03 && leg.compression < 0.25, `${leg.spec.name} ${leg.compression}`);
  const share = nose.load / (nose.load + left.load + right.load);
  assert.ok(share > 0.08 && share < 0.2, `nose share ${share}`);
  assert.ok(model.velocity.length() < 0.05, 'the brakes hold it against idle thrust');
  assert.ok(Math.abs(model.angularVelocity.length()) < 0.01);
});

test('with the gear up the wheels do not touch', () => {
  const model = standing();
  model.controls.gear = false;
  model.gear.command(false);
  fly(model, 7);
  assert.ok(!model.onGround);
});

test('the nose wheel steers widely while taxiing, little at speed, and the aircraft stays upright', () => {
  for (const [speed, wide] of [
    [5, true],
    [40, false],
  ]) {
    const model = standing();
    const euler = new THREE.Euler();
    let maxRoll = 0;
    fly(model, 30, (m, t) => {
      const v = m.velocity.length();
      m.controls.lever = v < speed * KNOT ? 0.5 : 0;
      m.controls.brake = v > speed * KNOT * 1.2 ? 0.3 : 0;
      m.controls.yaw = t > 15 ? 1 : 0;
      euler.setFromQuaternion(m.quaternion, 'YXZ');
      if (t > 15) maxRoll = Math.max(maxRoll, Math.abs(euler.z));
    });
    const steering = model.wheels.steering / DEG;
    assert.ok(wide ? steering > 30 : steering < 5, `${speed} kt: steering ${steering}°`);
    assert.ok(maxRoll < 8 * DEG, `${speed} kt: roll ${maxRoll / DEG}°`);
    assert.ok(model.onGround);
  }
});

test('the control system takes over in flight once the wheels leave the ground', () => {
  const model = standing();
  model.controls.lever = 1;
  let airborne = null;
  fly(model, 25, (m, t) => {
    m.controls.pitch = m.indicatedAirspeed > 125 * KNOT ? 1 : 0;
    if (airborne === null && m.position.y > 30) airborne = t;
    if (airborne !== null) m.controls.pitch = 0;
  });
  assert.ok(airborne !== null, 'climbed away');
  assert.ok(!model.onGround);
  assert.ok(model.pathAngle > 0, 'still climbing at neutral stick');
});
