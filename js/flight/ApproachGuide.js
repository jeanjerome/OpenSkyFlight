/**
 * Approach guidance to the runway ahead, as an instrument landing system
 * would give it, computed from the runway's published geometry: the runway
 * end the aircraft is heading for, its distance, and the aircraft's offsets
 * from the extended centre line and from a 3° glide path aimed at the touchdown
 * point (where the PAPI stand), with a virtual PAPI.
 */

const DEG = Math.PI / 180;

/** Glide path angle (rad) and its aiming point past the threshold (m) */
export const GLIDE_ANGLE = 3 * DEG;
export const AIM_POINT = 300;

/** Transition angles of the four PAPI units (rad), from the unit nearest the runway */
export const PAPI_ANGLES = [3.5, 3 + 10 / 60, 2 + 50 / 60, 2.5].map((d) => d * DEG);

/** Farthest approach guided (m before the threshold), and how far over the runway it lasts (m) */
const MAX_RANGE = 25000;
const OVER_RUNWAY = 1500;

/** Largest angle between the track and the runway, and off the centre line seen from the runway (rad) */
const MAX_TRACK_OFFSET = 45 * DEG;
const MAX_LATERAL_ANGLE = 35 * DEG;

/** Full-scale deflections of the deviation scales (rad): localizer and glide path */
export const LOCALIZER_FULL_SCALE = 2.5 * DEG;
export const GLIDE_FULL_SCALE = 0.7 * DEG;

/**
 * Guidance to the runway end the aircraft is heading for, or null
 * @param {object[]} placed - runways in world metres (see airports/RunwaysInWorld.js)
 * @param {{x: number, y: number, z: number}} position - world metres
 * @param {number} trackX - horizontal direction of flight, unit vector (x)
 * @param {number} trackZ - horizontal direction of flight, unit vector (z)
 * @returns {null|{airport: string, ident: string, distance: number, height: number,
 *   localizer: number, glide: number, glideAngle: number, papi: boolean[], course: number}}
 *   distance to the threshold (m), height above it (m), localizer and glide
 *   deviations (rad: positive when the centre line is to the right, when the
 *   glide path is above), angle of the line from the aiming point (rad), PAPI
 *   units white (true) or red, from the runway outwards, course (rad, clockwise from north)
 */
export function approachGuidance(placed, position, trackX, trackZ) {
  let best = null;
  let bestScore = Infinity;
  for (const runway of placed) {
    const { x0, z0, ux, uz, length, k } = runway;
    const rx = (position.x - x0) / k;
    const rz = (position.z - z0) / k;
    const s = rx * ux + rz * uz;
    const t = rz * ux - rx * uz;
    for (let e = 0; e < 2; e++) {
      const end = runway.runway.ends[e];
      const direction = e === 0 ? 1 : -1;
      const threshold = e === 0 ? end.displaced : length - end.displaced;
      // Before the threshold along the landing direction, and to the right of the centre line
      const along = direction * (threshold - s);
      const cross = direction * t;
      if (along > MAX_RANGE || along < -OVER_RUNWAY) continue;
      const lateral = Math.atan2(Math.abs(cross), Math.max(along + length, 1));
      if (lateral > MAX_LATERAL_ANGLE) continue;
      const track = Math.acos(Math.max(-1, Math.min(1, direction * (trackX * ux + trackZ * uz))));
      if (track > MAX_TRACK_OFFSET) continue;
      const score = lateral + track + along / MAX_RANGE;
      if (score < bestScore) {
        bestScore = score;
        best = { runway, end, along, cross, direction };
      }
    }
  }
  if (!best) return null;

  const { runway, end, along, cross, direction } = best;
  const height = position.y - end.elevation;
  const glideAngle = Math.atan2(height, along + AIM_POINT);
  // Localizer seen from the far end of the runway, as its antenna stands there
  const localizer = -Math.atan2(cross, along + runway.length);
  return {
    airport: runway.runway.airport,
    ident: end.ident,
    distance: along,
    height,
    localizer,
    glide: GLIDE_ANGLE - glideAngle,
    glideAngle,
    papi: PAPI_ANGLES.map((angle) => glideAngle > angle),
    course: Math.atan2(direction * runway.ux, -direction * runway.uz),
  };
}
