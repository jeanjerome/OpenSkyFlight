const DEG2RAD = Math.PI / 180;
const RAD2DEG = 180 / Math.PI;

/** Days in the simulated year (no leap day) */
export const DAYS_PER_YEAR = 365;

/**
 * Declination of the sun (radians) on a day of the year, from the Fourier
 * series of the NOAA solar calculator (within 0.05° of the ephemeris).
 * @param {number} dayOfYear - 1 for 1 January, fractional for the time of day
 */
export function solarDeclination(dayOfYear) {
  const g = ((2 * Math.PI) / DAYS_PER_YEAR) * (dayOfYear - 1);
  return (
    0.006918 -
    0.399912 * Math.cos(g) +
    0.070257 * Math.sin(g) -
    0.006758 * Math.cos(2 * g) +
    0.000907 * Math.sin(2 * g) -
    0.002697 * Math.cos(3 * g) +
    0.00148 * Math.sin(3 * g)
  );
}

/**
 * Position of the sun in the sky of a place, from the day of the year and the
 * apparent solar time there (12:00 when the sun crosses the meridian), without
 * atmospheric refraction.
 * @param {number} latitude - degrees, north positive
 * @param {number} dayOfYear - 1 to 365
 * @param {number} solarTime - hours, 0 to 24
 * @returns {{elevation: number, azimuth: number}} degrees above the horizon,
 *   and compass bearing clockwise from north
 */
export function sunPosition(latitude, dayOfYear, solarTime) {
  const phi = latitude * DEG2RAD;
  const delta = solarDeclination(dayOfYear + (solarTime - 12) / 24);
  const hourAngle = (solarTime - 12) * 15 * DEG2RAD;
  const sinElevation = Math.sin(phi) * Math.sin(delta) + Math.cos(phi) * Math.cos(delta) * Math.cos(hourAngle);
  const elevation = Math.asin(Math.max(-1, Math.min(1, sinElevation)));
  // Bearing measured from the south, westward positive, then turned to a compass bearing
  const fromSouth = Math.atan2(
    Math.sin(hourAngle),
    Math.cos(hourAngle) * Math.sin(phi) - Math.tan(delta) * Math.cos(phi),
  );
  return {
    elevation: elevation * RAD2DEG,
    azimuth: (fromSouth * RAD2DEG + 180 + 360) % 360,
  };
}
