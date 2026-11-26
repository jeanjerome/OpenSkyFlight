import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import AircraftState from '../js/flight/AircraftState.js';
import SimulatedFlight from '../js/flight/SimulatedFlight.js';
import { describeCrash } from '../js/ui/CrashScreen.js';

const STEP = 1 / 240;
const KNOT = 0.514444;
const DEG = Math.PI / 180;

/** Simulated flight over flat ground at sea level, on a straight approach path at 125 kt */
function approach(pathDegrees, gearDown, lever) {
  const flight = new SimulatedFlight(new AircraftState(), () => 0);
  flight.teleport(new THREE.Vector3(0, 40, 0), 0, pathDegrees * DEG, 125 * KNOT);
  const model = flight.model;
  model.controls.gear = gearDown;
  model.gear.command(gearDown);
  model.gear.position = gearDown ? 1 : 0;
  model.controls.lever = lever;
  model.engines.setLever(lever);
  return flight;
}

function run(flight, seconds, each) {
  for (let t = 0; t < seconds && !flight.crash; t += STEP) {
    each?.(flight.model, t);
    flight.step(STEP);
  }
  return flight;
}

test('a normal approach lands and rolls to a stop without crashing', () => {
  const flight = run(approach(-2.5, true, 0.2), 80, (m) => {
    if (m.onGround) {
      m.controls.lever = 0;
      m.controls.brake = 1;
    }
  });
  assert.equal(flight.crash, null);
  assert.ok(flight.model.onGround && flight.model.velocity.length() < 1);
});

test('landing with the gear up is a crash, the tail first at the approach angle of attack', () => {
  const flight = run(approach(-2.5, false, 0.2), 60);
  assert.ok(flight.crash, 'crashed');
  assert.equal(flight.crash.part, 'tail');
  assert.equal(flight.crash.gearDown, false);
  assert.equal(describeCrash(flight.crash).title, 'Landed with the gear up');
});

test('a touchdown faster than the gear takes is a hard landing', () => {
  // Wings level half a metre above the wheels' reach, sinking at 4 m/s
  const flight = approach(0, true, 0.2);
  const model = flight.model;
  model.position.set(0, 2.4, 0);
  model.velocity.set(0, -4, -64);
  run(flight, 2);
  assert.ok(flight.crash, 'crashed');
  assert.equal(flight.crash.part, 'wheels');
  assert.ok(flight.crash.sink > 3 && flight.crash.sink < 6, `sink ${flight.crash.sink}`);
  assert.equal(describeCrash(flight.crash).title, 'Hard landing');
});

test('on the ground, the tail strikes past about 16° of pitch and a wingtip past about 17° of bank', () => {
  for (const [axis, angle, part] of [
    [new THREE.Vector3(1, 0, 0), 14, null],
    [new THREE.Vector3(1, 0, 0), 19, 'tail'],
    [new THREE.Vector3(0, 0, 1), 15, null],
    [new THREE.Vector3(0, 0, 1), 20, 'wingtip'],
  ]) {
    const flight = new SimulatedFlight(new AircraftState(), () => 0);
    flight.placeOnGround(0, 0, 0);
    run(flight, 1);
    // Tilt about the main wheels' contact (pitch) or a main wheel (roll)
    const model = flight.model;
    const pivot = axis.x ? new THREE.Vector3(0, -1.75, 0.56) : new THREE.Vector3(-1.45, -1.75, 0.56);
    const turn = new THREE.Quaternion().setFromAxisAngle(axis, angle * DEG);
    model.position.add(pivot.clone().sub(pivot.clone().applyQuaternion(turn)));
    model.quaternion.multiply(turn);
    model.velocity.set(0, 0, 0);
    run(flight, STEP);
    assert.equal(flight.crash?.part ?? null, part, `${angle}° about ${axis.x ? 'pitch' : 'roll'}`);
  }
});
