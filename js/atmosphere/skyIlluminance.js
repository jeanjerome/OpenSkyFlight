/**
 * Illuminance of a horizontal surface under a clear sky (lux), from the sun
 * and the sky it lights, and from the moon: the light level of the scene,
 * used to set the exposure of dusk and night scenes (see AtmosphericSky).
 */

/**
 * log10 of the illuminance from the sun and the daylit or twilight sky, by sun
 * elevation (degrees): civil twilight ends near 3 lux, nautical twilight near
 * 0.01 lux, astronomical twilight below 0.001 lux.
 */
const SUN_TABLE = [
  [-18, -3.3],
  [-12, -2.0],
  [-9, -0.9],
  [-6, 0.5],
  [-4, 1.2],
  [-2, 2.0],
  [0, 2.75],
  [2, 3.3],
  [5, 3.85],
  [10, 4.3],
  [20, 4.65],
  [35, 4.9],
  [90, 5.1],
];

/** Full moon at the zenith (lux) */
const FULL_MOON_ILLUMINANCE = 0.27;

/**
 * Light of a moonless night sky (lux): starlight and airglow give 0.002 lux
 * far from any town; the glow of the towns of a populated region over the
 * sky brings it to about 0.01
 */
export const NIGHT_SKY_ILLUMINANCE = 0.008;

/** @param {number} elevation - sun elevation in degrees */
export function sunIlluminance(elevation) {
  if (elevation <= SUN_TABLE[0][0]) return 10 ** SUN_TABLE[0][1];
  for (let i = 1; i < SUN_TABLE.length; i++) {
    const [e1, l1] = SUN_TABLE[i];
    if (elevation <= e1) {
      const [e0, l0] = SUN_TABLE[i - 1];
      return 10 ** (l0 + ((elevation - e0) / (e1 - e0)) * (l1 - l0));
    }
  }
  return 10 ** SUN_TABLE[SUN_TABLE.length - 1][1];
}

/**
 * Brightness of the moon relative to the full moon, from its phase angle
 * (Allen's magnitude law): half at a phase angle of 25°, a tenth at quarter moon.
 * @param {number} phaseAngle - angle Sun–Moon–Earth in degrees, 0 at full moon
 */
export function moonPhaseFactor(phaseAngle) {
  const a = Math.abs(phaseAngle);
  return 10 ** (-0.4 * (0.026 * a + 4e-9 * a ** 4));
}

/**
 * @param {number} elevation - moon elevation in degrees
 * @param {number} phaseAngle - degrees, 0 at full moon
 */
export function moonIlluminance(elevation, phaseAngle) {
  if (elevation <= 0) return 0;
  return FULL_MOON_ILLUMINANCE * moonPhaseFactor(phaseAngle) * Math.sin((elevation * Math.PI) / 180);
}
