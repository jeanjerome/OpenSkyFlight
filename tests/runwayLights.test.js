import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GREEN, RED, layout } from '../js/airports/runwayLightLayout.js';

const DEG = Math.PI / 180;

/** Lights of a 3 000 × 45 m runway, as { s, t, front, frontCd, back, backCd, papi } */
function lights(displaced = [0, 0]) {
  const runway = {
    length: 3000,
    lighted: true,
    ends: displaced.map((d) => ({ elevation: 400, displaced: d })),
  };
  const out = [];
  layout({ runway, length: 3000, width: 45 }, (placed, s, t, front, frontCd, back, backCd, papi = 0) =>
    out.push({ s, t, front, frontCd, back, backCd, papi }),
  );
  return out;
}

test('thresholds show green towards their approach, and red towards the runway at its ends', () => {
  const all = lights();
  const atEnd0 = all.filter((l) => l.s === 0 && l.papi === 0 && Math.abs(l.t) <= 22.5);
  assert.ok(atEnd0.some((l) => l.front === GREEN && l.back === RED));
  const atEnd1 = all.filter((l) => l.s === 3000 && Math.abs(l.t) <= 22.5);
  assert.ok(atEnd1.some((l) => l.back === GREEN && l.front === RED));
});

test('a displaced threshold has its green bar inside the runway and red lights at the end', () => {
  const all = lights([300, 0]);
  assert.ok(all.some((l) => l.s === 300 && l.front === GREEN && l.back === null));
  assert.ok(all.some((l) => l.s === 0 && l.front === null && l.back === RED));
});

test('the centre line turns red over the last 300 m in each direction', () => {
  const centre = lights().filter((l) => l.t === 0 && l.s > 0 && l.s < 3000);
  for (const l of centre) {
    if (3000 - l.s < 300) assert.equal(l.front, RED, `towards end 1 at ${l.s}`);
    if (l.s < 300) assert.equal(l.back, RED, `towards end 0 at ${l.s}`);
    if (l.s > 900 && l.s < 2100) assert.notEqual(l.front, RED);
  }
});

test('the PAPI stand on the pilot’s left, from 3°30′ nearest the runway to 2°30′', () => {
  const papi = lights().filter((l) => l.papi > 0);
  assert.equal(papi.length, 8);
  // Landing towards end 1, seen from the end 0 side: on the left, −t
  const towardsEnd1 = papi.filter((l) => l.frontCd > 0).sort((a, b) => b.t - a.t);
  assert.ok(towardsEnd1.every((l) => l.t < 0 && Math.abs(l.s - 300) < 1e-9));
  assert.deepEqual(
    towardsEnd1.map((l) => +(l.papi / DEG).toFixed(2)),
    [3.5, 3.17, 2.83, 2.5],
  );
  const towardsEnd0 = papi.filter((l) => l.backCd > 0);
  assert.ok(towardsEnd0.every((l) => l.t > 0 && Math.abs(l.s - 2700) < 1e-9));
});
