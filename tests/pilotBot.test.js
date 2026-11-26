import { test } from 'node:test';
import assert from 'node:assert/strict';
import AircraftState from '../js/flight/AircraftState.js';
import SimulatedFlight from '../js/flight/SimulatedFlight.js';
import PilotBot from '../js/flight/PilotBot.js';

const STEP = 1 / 240;

/** A 3 000 m runway northwards from the origin, on flat ground at sea level */
const placed = {
  runway: {
    airport: 'FLAT',
    ends: [
      { ident: '36', elevation: 0, displaced: 0 },
      { ident: '18', elevation: 0, displaced: 0 },
    ],
  },
  x0: 0,
  z0: 0,
  ux: 0,
  uz: -1,
  length: 3000,
  width: 45,
  k: 1,
};

test('the scripted pilot flies a circuit and lands back on the runway', () => {
  const flight = new SimulatedFlight(new AircraftState(), () => 0);
  flight.placeOnGround(0, -40, 0);
  const bot = new PilotBot(placed, 0);
  for (let i = 0; i < 600 / STEP && !bot.done; i++) {
    bot.tick(flight, STEP);
    flight.step(STEP);
  }
  const r = bot.report;
  assert.equal(r.crash, null, JSON.stringify(r.crash));
  assert.ok(bot.done, `ended in ${bot.phase}`);
  assert.deepEqual(
    r.phases.map((p) => p.phase),
    ['lineup', 'takeoff', 'rotate', 'climb', 'crosswind', 'downwind', 'base', 'final', 'flare', 'rollout', 'done'],
  );
  assert.ok(r.takeoffRun < 900, `takeoff run ${r.takeoffRun} m`);
  assert.ok(r.circuitHeightError < 40, `circuit height ${r.circuitHeightError} m`);
  assert.ok(r.final.centreLine < 10 && r.final.glidePath < 15, JSON.stringify(r.final));
  assert.ok(r.touchdown.sink > 0 && r.touchdown.sink < 3, `sink ${r.touchdown.sink} m/s`);
  assert.ok(r.touchdown.along > 0 && r.touchdown.along < 600, `touchdown ${r.touchdown.along} m past the threshold`);
  assert.ok(Math.abs(r.touchdown.cross) < 5);
  assert.ok(r.rollout < 1200, `rollout ${r.rollout} m`);
});
