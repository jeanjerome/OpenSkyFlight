/**
 * Layout of the lights of a runway (see RunwayLights), without the browser:
 * positions along and across the runway, colours and intensities on each side.
 */

/** Colours of the lights, and intensities in their beam (candelas) */
export const WHITE = [1, 0.9, 0.72];
export const YELLOW = [1, 0.72, 0.18];
export const RED = [1, 0.06, 0.02];
export const GREEN = [0.1, 1, 0.42];
const EDGE_CD = 4000;
const CENTRE_CD = 2500;
const THRESHOLD_CD = 8000;
const END_CD = 4000;
const APPROACH_CD = 12000;
const PAPI_CD = 10000;

/**
 * Light layout (ICAO Annex 14, simplified), in metres: edge lights every 60 m,
 * yellow over the last 600 m of instrument runways (from 1 800 m); centre line
 * every 30 m on runways from 2 000 m, alternately red and white over the last
 * 900 m and red over the last 300 m; threshold lights every 3 m across, green
 * towards the approach, and red end lights towards the runway; on runways
 * from 2 000 m an approach light line 900 m long (a five-light barrette every
 * 30 m, a crossbar 30 m wide at 300 m); PAPI on the left, 300 m past the
 * threshold, four units 9 m apart from 15 m beyond the edge, white above
 * 3°30′, 3°10′, 2°50′ and 2°30′ from the unit nearest the runway outwards.
 */
const EDGE_SPACING = 60;
const CAUTION_ZONE = 600;
const INSTRUMENT_LENGTH = 1800;
const CENTRE_SPACING = 30;
const LONG_RUNWAY = 2000;
const THRESHOLD_SPACING = 3;
const APPROACH_LENGTH = 900;
const APPROACH_SPACING = 30;
const CROSSBAR_AT = 300;
const CROSSBAR_HALF_WIDTH = 15;
const PAPI_FROM_THRESHOLD = 300;
const PAPI_FROM_EDGE = 15;
const PAPI_SPACING = 9;
const PAPI_ANGLES = [3.5, 3 + 10 / 60, 2 + 50 / 60, 2.5].map((d) => (d * Math.PI) / 180);

/**
 * Lights of one runway, given to `add(placed, s, t, front, frontCd, back,
 * backCd, papi)`: s along from end 0 and t across, to the right looking
 * towards end 1 (m); colours and intensities seen from the end 0 side (front)
 * and from the end 1 side (back), none for a dark side
 */
export function layout(placed, add) {
  const { runway, length: L, width } = placed;
  const half = width / 2;
  const [a, b] = runway.ends;
  const instrument = L >= INSTRUMENT_LENGTH;
  const long = L >= LONG_RUNWAY;

  // Edge lights
  const edges = Math.max(1, Math.round(L / EDGE_SPACING));
  for (let i = 0; i <= edges; i++) {
    const s = (i * L) / edges;
    const towardsEnd1 = instrument && L - s < CAUTION_ZONE ? YELLOW : WHITE;
    const towardsEnd0 = instrument && s < CAUTION_ZONE ? YELLOW : WHITE;
    for (const side of [-1, 1]) add(placed, s, side * (half + 1), towardsEnd1, EDGE_CD, towardsEnd0, EDGE_CD);
  }

  // Centre line: colour coded over the last 900 m in each direction
  if (long) {
    const code = (left, i) => (left < 300 ? RED : left < 900 ? (i % 2 ? RED : WHITE) : WHITE);
    for (let i = 1, s = CENTRE_SPACING; s < L - CENTRE_SPACING / 2; i++, s += CENTRE_SPACING) {
      add(placed, s, 0, code(L - s, i), CENTRE_CD, code(s, i), CENTRE_CD);
    }
  }

  // Thresholds (green towards the approach), runway ends (red towards the runway)
  const across = Math.max(1, Math.round(width / THRESHOLD_SPACING));
  const bar = (s, front, frontCd, back, backCd) => {
    for (let i = 0; i <= across; i++) add(placed, s, -half + (i * width) / across, front, frontCd, back, backCd);
  };
  const t0 = a.displaced;
  const t1 = L - b.displaced;
  bar(t0, GREEN, THRESHOLD_CD, t0 > 0 ? null : RED, END_CD);
  if (t0 > 0) bar(0, null, 0, RED, END_CD);
  bar(t1, t1 < L ? null : RED, END_CD, GREEN, THRESHOLD_CD);
  if (t1 < L) bar(L, RED, END_CD, null, 0);

  // Approach lights before each threshold, seen from the approach only
  if (long) {
    for (const [threshold, direction] of [
      [t0, -1],
      [t1, 1],
    ]) {
      const seen = direction < 0 ? [WHITE, APPROACH_CD, null, 0] : [null, 0, WHITE, APPROACH_CD];
      for (let d = APPROACH_SPACING; d <= APPROACH_LENGTH; d += APPROACH_SPACING) {
        const s = threshold + direction * d;
        for (let t = -2; t <= 2; t++) add(placed, s, t, ...seen);
        if (d === CROSSBAR_AT) {
          for (let t = 3; t <= CROSSBAR_HALF_WIDTH; t += 1.5) {
            add(placed, s, t, ...seen);
            add(placed, s, -t, ...seen);
          }
        }
      }
    }
  }

  // PAPI on the pilot's left, seen from the approach only
  if (runway.length >= 1200) {
    PAPI_ANGLES.forEach((angle, i) => {
      const out = half + PAPI_FROM_EDGE + i * PAPI_SPACING;
      // Landing towards end 1 the left is −t; towards end 0, +t
      add(placed, t0 + PAPI_FROM_THRESHOLD, -out, WHITE, PAPI_CD, null, 0, angle);
      add(placed, t1 - PAPI_FROM_THRESHOLD, out, null, 0, WHITE, PAPI_CD, angle);
    });
  }
}
