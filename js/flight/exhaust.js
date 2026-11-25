import { MIN_REHEAT_SHARE } from '../constants/rafale.js';

/**
 * Exhaust jet of one M88-2 engine, from its power and the flight Mach number:
 * nozzle exit diameter, shock-cell pattern and afterburner flame.
 *
 * The nozzle is convergent (sonic at its exit), so above a pressure ratio of
 * 1.89 the jet leaves it underexpanded and settles to the ambient pressure
 * through a train of shock cells, the "diamonds" an afterburner makes visible.
 * Their spacing follows Prandtl–Pack, L ≈ 1.306·D·√(Mj² − 1), with Mj the Mach
 * number the jet would reach fully expanded; the first Mach disc stands at
 * x ≈ 0.67·D·√(P0/Pa) (Crist, Sherman and Glass). The nozzle pressure ratio
 * grows with the ram compression of the inlet, so the cells stretch with speed.
 */

/** Nozzle pressure ratio on a static stand at full dry power [estimate: gives Mj ≈ 1.47] */
const STATIC_NPR = 3.5;

/** Nozzle pressure ratio at idle on a static stand [estimate: subsonic jet, no shock cells] */
const IDLE_NPR = 1.3;

/** Ratio of specific heats used for the jet (the published spacing figures assume 1.4) */
const GAMMA = 1.4;

/**
 * Nozzle exit diameter (m): the variable nozzle opens at idle to lower the
 * idle thrust, closes at full dry power and opens with the afterburner
 * [0.55 dry and 0.68 full afterburner from the reference data; idle estimated]
 */
export const EXIT_DIAMETER_IDLE = 0.62;
export const EXIT_DIAMETER_DRY = 0.55;
export const EXIT_DIAMETER_REHEAT = 0.68;

/** Afterburner flame length (m) at the lowest and at full afterburner */
export const FLAME_LENGTH_MIN = 4;
export const FLAME_LENGTH_MAX = 8;

/**
 * @typedef {object} Jet
 * @property {number} pressureRatio - nozzle total pressure over ambient pressure
 * @property {number} jetMach - Mach number of the fully expanded jet
 * @property {number} exitDiameter - nozzle exit diameter (m)
 * @property {number} cellSpacing - shock-cell spacing (m), 0 for a subsonic jet
 * @property {number} firstDisc - distance of the first Mach disc from the exit (m)
 * @property {number} flame - afterburner flame level, 0 off to 1 full
 * @property {number} flameLength - afterburner flame length (m)
 */

/**
 * @param {number} core - core power, 0 idle to 1 full dry
 * @param {number} reheat - afterburner stage, 0 off to 1 full (MIN_REHEAT_SHARE once lit)
 * @param {number} mach - flight Mach number
 * @param {Jet} [out]
 * @returns {Jet}
 */
export function exhaustJet(core, reheat, mach, out = {}) {
  core = Math.min(1, Math.max(0, core));
  reheat = Math.min(1, Math.max(0, reheat));
  const ram = Math.pow(1 + ((GAMMA - 1) / 2) * mach * mach, GAMMA / (GAMMA - 1));
  const pressureRatio = (IDLE_NPR + (STATIC_NPR - IDLE_NPR) * core) * ram;
  const jetMach = Math.sqrt((2 / (GAMMA - 1)) * (Math.pow(pressureRatio, (GAMMA - 1) / GAMMA) - 1));

  const exitDiameter =
    reheat > 0
      ? EXIT_DIAMETER_DRY + (EXIT_DIAMETER_REHEAT - EXIT_DIAMETER_DRY) * reheat
      : EXIT_DIAMETER_IDLE + (EXIT_DIAMETER_DRY - EXIT_DIAMETER_IDLE) * core;

  // The flame grows as the afterburner lights (up to its lowest stage), then lengthens with the stage
  const lighting = Math.min(1, reheat / MIN_REHEAT_SHARE);
  const stage = Math.max(0, (reheat - MIN_REHEAT_SHARE) / (1 - MIN_REHEAT_SHARE));

  out.pressureRatio = pressureRatio;
  out.jetMach = jetMach;
  out.exitDiameter = exitDiameter;
  out.cellSpacing = jetMach > 1 ? 1.306 * exitDiameter * Math.sqrt(jetMach * jetMach - 1) : 0;
  out.firstDisc = 0.67 * exitDiameter * Math.sqrt(pressureRatio);
  out.flame = lighting * (0.6 + 0.4 * stage);
  out.flameLength = lighting * (FLAME_LENGTH_MIN + (FLAME_LENGTH_MAX - FLAME_LENGTH_MIN) * stage);
  return out;
}
