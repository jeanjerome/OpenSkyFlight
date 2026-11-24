import * as THREE from 'three';
import { DAYS_PER_YEAR } from './sunPosition.js';

/**
 * Low-precision positions of the sun and the moon, and the rotation of the
 * Earth, for the night sky: the moon's place and phase, and the stars turning
 * with the hour. Formulas of the Astronomical Almanac's low-precision section
 * (sun within 0.01°, moon within 0.3°, the moon seen from the Earth's centre:
 * its parallax, up to 1°, is left out).
 *
 * The game clock is a day of the year and a local solar time; the moon needs
 * an absolute date, taken in SIMULATION_YEAR.
 */

const DEG2RAD = Math.PI / 180;

/** Year of the simulated dates (moon phases follow its calendar) */
export const SIMULATION_YEAR = 2026;

/** Julian date of 1 January of SIMULATION_YEAR, 0 h UTC */
const JD_YEAR_START = 2440587.5 + Date.UTC(SIMULATION_YEAR, 0, 1) / 86400000;

const J2000 = 2451545.0;

/** Obliquity of the ecliptic (J2000) */
const OBLIQUITY = 23.439 * DEG2RAD;

const sin = (deg) => Math.sin(deg * DEG2RAD);

/**
 * Equation of time (minutes): apparent minus mean solar time, NOAA series.
 * @param {number} dayOfYear
 */
export function equationOfTime(dayOfYear) {
  const g = ((2 * Math.PI) / DAYS_PER_YEAR) * (dayOfYear - 1);
  return (
    229.18 *
    (0.000075 +
      0.001868 * Math.cos(g) -
      0.032077 * Math.sin(g) -
      0.014615 * Math.cos(2 * g) -
      0.040849 * Math.sin(2 * g))
  );
}

/**
 * Julian date of a local apparent solar time at a longitude.
 * @param {number} dayOfYear - 1 to 365
 * @param {number} solarTime - hours
 * @param {number} longitude - degrees, east positive
 */
export function julianDate(dayOfYear, solarTime, longitude) {
  const utc = solarTime - longitude / 15 - equationOfTime(dayOfYear) / 60;
  return JD_YEAR_START + (dayOfYear - 1) + utc / 24;
}

/** Unit vector toward ecliptic coordinates, in the equatorial frame (ECI) */
function eclipticToEquatorial(longitudeDeg, latitudeDeg, target) {
  const l = longitudeDeg * DEG2RAD;
  const b = latitudeDeg * DEG2RAD;
  const x = Math.cos(b) * Math.cos(l);
  const y = Math.cos(b) * Math.sin(l);
  const z = Math.sin(b);
  const c = Math.cos(OBLIQUITY);
  const s = Math.sin(OBLIQUITY);
  return target.set(x, c * y - s * z, s * y + c * z);
}

/** Direction of the sun in the Earth-centred inertial frame (equator and equinox) */
export function sunDirectionECI(jd, target = new THREE.Vector3()) {
  const n = jd - J2000;
  const mean = 280.46 + 0.9856474 * n;
  const anomaly = 357.528 + 0.9856003 * n;
  return eclipticToEquatorial(mean + 1.915 * sin(anomaly) + 0.02 * sin(2 * anomaly), 0, target);
}

/** Direction of the moon in the Earth-centred inertial frame */
export function moonDirectionECI(jd, target = new THREE.Vector3()) {
  const t = (jd - J2000) / 36525;
  const longitude =
    218.32 +
    481267.881 * t +
    6.29 * sin(135.0 + 477198.87 * t) -
    1.27 * sin(259.3 - 413335.36 * t) +
    0.66 * sin(235.7 + 890534.22 * t) +
    0.21 * sin(269.9 + 954397.74 * t) -
    0.19 * sin(357.5 + 35999.05 * t) -
    0.11 * sin(186.5 + 966404.03 * t);
  const latitude =
    5.13 * sin(93.3 + 483202.02 * t) +
    0.28 * sin(228.2 + 960400.89 * t) -
    0.28 * sin(318.3 + 6003.15 * t) -
    0.17 * sin(217.6 - 407332.21 * t);
  return eclipticToEquatorial(longitude, latitude, target);
}

/** Rotation from the inertial frame to the Earth-fixed one: the Greenwich mean sidereal time about the pole */
export function eciToEcefMatrix(jd, target = new THREE.Matrix4()) {
  const gmst = (280.46061837 + 360.98564736629 * (jd - J2000)) * DEG2RAD;
  return target.makeRotationZ(-gmst);
}
