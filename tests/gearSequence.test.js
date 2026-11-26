import { test } from 'node:test';
import assert from 'node:assert/strict';
import GearSequence, { GEAR_TRANSIT_TIME } from '../js/flight/GearSequence.js';

const run = (gear, seconds, dt = 1 / 240) => {
  for (let t = 0; t < seconds; t += dt) gear.update(dt);
};

test('the gear extends in its transit time: doors open, legs down, main doors closed', () => {
  const gear = new GearSequence();
  assert.ok(gear.upLocked);
  gear.command(true);
  run(gear, GEAR_TRANSIT_TIME * 0.25);
  assert.ok(gear.mainDoors > 0.99 && gear.legs < 0.01, 'doors open before the legs move');
  run(gear, GEAR_TRANSIT_TIME * 0.5);
  assert.ok(gear.legs > 0.99 && !gear.downLocked);
  run(gear, GEAR_TRANSIT_TIME * 0.25 + 0.01);
  assert.ok(gear.downLocked);
  assert.equal(gear.mainDoors, 0);
  assert.equal(gear.legDoors, 1);
});

test('a new command reverses the sequence where it stands', () => {
  const gear = new GearSequence(true);
  gear.toggle();
  run(gear, GEAR_TRANSIT_TIME * 0.5);
  const legs = gear.legs;
  gear.toggle();
  run(gear, GEAR_TRANSIT_TIME * 0.1);
  assert.ok(gear.legs > legs, 'the legs go back down');
  gear.toggle();
  run(gear, GEAR_TRANSIT_TIME * 1.1);
  assert.ok(gear.upLocked);
  assert.equal(gear.mainDoors, 0);
  assert.equal(gear.legDoors, 0);
});
