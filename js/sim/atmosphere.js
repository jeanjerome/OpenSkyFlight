/**
 * International Standard Atmosphere (ISA, ICAO Doc 7488) up to 47 km:
 * temperature falling by 6.5 K/km up to the tropopause at 11 km, constant
 * 216.65 K up to 20 km, then rising by 1 K/km up to 32 km and 2.8 K/km up to
 * 47 km; pressure from hydrostatic balance in each layer. The layers are
 * defined in geopotential altitude, converted from the geometric altitude.
 */

/** Specific gas constant of dry air (J/(kg·K)) */
const R_AIR = 287.05287;
/** Standard gravity (m/s²) */
const G0 = 9.80665;
/** Ratio of specific heats of air */
const GAMMA = 1.4;
/** Earth radius used to convert geometric to geopotential altitude (m) */
const EARTH_RADIUS = 6356766;

/** Sea-level density (kg/m³) */
export const SEA_LEVEL_DENSITY = 1.225;

/** Layers: base geopotential altitude (m), base temperature (K), base pressure (Pa), lapse rate (K/m) */
const LAYERS = [
  { base: 0, temperature: 288.15, pressure: 101325, lapse: -0.0065 },
  { base: 11000, temperature: 216.65, pressure: 22632.06, lapse: 0 },
  { base: 20000, temperature: 216.65, pressure: 5474.889, lapse: 0.001 },
  { base: 32000, temperature: 228.65, pressure: 868.0187, lapse: 0.0028 },
];
/** Highest geopotential altitude of the model (m): above, the air is that of 47 km */
const TOP = 47000;

/**
 * State of the air at an altitude.
 * @param {number} altitude - geometric altitude above mean sea level (m)
 * @param {{temperature?: number, pressure?: number, density?: number, speedOfSound?: number}} [out]
 * @returns {{temperature: number, pressure: number, density: number, speedOfSound: number}}
 *   temperature (K), pressure (Pa), density (kg/m³), speed of sound (m/s)
 */
export function isa(altitude, out = {}) {
  const h = Math.min((EARTH_RADIUS * altitude) / (EARTH_RADIUS + altitude), TOP);
  let layer = LAYERS[0];
  for (let i = LAYERS.length - 1; i > 0; i--) {
    if (h >= LAYERS[i].base) {
      layer = LAYERS[i];
      break;
    }
  }
  const dh = h - layer.base;
  const temperature = layer.temperature + layer.lapse * dh;
  const pressure =
    layer.lapse === 0
      ? layer.pressure * Math.exp((-G0 * dh) / (R_AIR * layer.temperature))
      : layer.pressure * Math.pow(temperature / layer.temperature, -G0 / (layer.lapse * R_AIR));

  out.temperature = temperature;
  out.pressure = pressure;
  out.density = pressure / (R_AIR * temperature);
  out.speedOfSound = Math.sqrt(GAMMA * R_AIR * temperature);
  return out;
}
