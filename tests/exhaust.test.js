import { test } from 'node:test';
import assert from 'node:assert/strict';
import { exhaustJet, EXIT_DIAMETER_DRY, EXIT_DIAMETER_REHEAT } from '../js/flight/exhaust.js';

test('at full dry power on a stand the jet is underexpanded with shock cells about 0.8 m apart', () => {
  const jet = exhaustJet(1, 0, 0);
  assert.ok(Math.abs(jet.jetMach - 1.47) < 0.02, `Mj ${jet.jetMach}`);
  assert.equal(jet.exitDiameter, EXIT_DIAMETER_DRY);
  assert.ok(jet.cellSpacing > 0.7 && jet.cellSpacing < 0.85, `spacing ${jet.cellSpacing}`);
  assert.equal(jet.flame, 0);
  assert.equal(jet.flameLength, 0);
});

test('at full afterburner the nozzle opens, the cells are about 1 m apart and the flame is 8 m long', () => {
  const jet = exhaustJet(1, 1, 0);
  assert.equal(jet.exitDiameter, EXIT_DIAMETER_REHEAT);
  assert.ok(jet.cellSpacing > 0.85 && jet.cellSpacing < 1.05, `spacing ${jet.cellSpacing}`);
  assert.ok(jet.firstDisc > 0.75 && jet.firstDisc < 0.95, `first disc ${jet.firstDisc}`);
  assert.equal(jet.flame, 1);
  assert.equal(jet.flameLength, 8);
});

test('the lowest afterburner stage gives a 4 m flame', () => {
  const jet = exhaustJet(1, 0.25, 0);
  assert.ok(Math.abs(jet.flameLength - 4) < 1e-9);
  assert.ok(jet.flame > 0.5 && jet.flame < 0.7);
});

test('at idle the jet is subsonic: no shock cells', () => {
  assert.equal(exhaustJet(0, 0, 0).cellSpacing, 0);
});

test('the shock cells stretch with flight speed', () => {
  assert.ok(exhaustJet(1, 1, 0.9).cellSpacing > 1.3 * exhaustJet(1, 1, 0).cellSpacing);
});
