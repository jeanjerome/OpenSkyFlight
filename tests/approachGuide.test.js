import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AIM_POINT, approachGuidance } from '../js/flight/ApproachGuide.js';

const DEG = Math.PI / 180;

/** A 3 000 m runway from the origin northwards (world −z), at 100 m */
const runway = {
  runway: {
    airport: 'TEST',
    ends: [
      { ident: '36', elevation: 100, displaced: 0 },
      { ident: '18', elevation: 100, displaced: 0 },
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

test('on the extended centre line and the 3° glide path: no deviation, two white and two red', () => {
  const g = approachGuidance([runway], { x: 0, y: 100 + Math.tan(3 * DEG) * (5000 + AIM_POINT), z: 5000 }, 0, -1);
  assert.equal(g.ident, '36');
  assert.ok(Math.abs(g.distance - 5000) < 1e-6);
  assert.ok(Math.abs(g.localizer) < 1e-9 && Math.abs(g.glide) < 1e-9);
  assert.deepEqual(g.papi, [false, false, true, true]);
  assert.ok(Math.abs(g.course) < 1e-9, 'course north');
});

test('right of the centre line the localizer points left; low, the glide path is above', () => {
  const g = approachGuidance([runway], { x: 150, y: 150, z: 5000 }, 0, -1);
  assert.ok(g.localizer < 0);
  assert.ok(g.glide > 0);
  assert.deepEqual(g.papi, [false, false, false, false]);
});

test('the runway end flown towards is chosen, none when flying away or across', () => {
  const south = approachGuidance([runway], { x: 0, y: 400, z: -9000 }, 0, 1);
  assert.equal(south.ident, '18');
  assert.ok(Math.abs(Math.abs(south.course) - Math.PI) < 1e-9, 'course south');
  assert.equal(approachGuidance([runway], { x: 0, y: 400, z: 5000 }, 0, 1), null);
  assert.equal(approachGuidance([runway], { x: 0, y: 400, z: 5000 }, 1, 0), null);
  assert.equal(approachGuidance([runway], { x: 0, y: 400, z: 40000 }, 0, -1), null);
});
