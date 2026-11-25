import {
  DRY_THRUST,
  ENGINE_COUNT,
  IDLE_THRUST_SHARE,
  MIN_REHEAT_SHARE,
  REHEAT_THRUST,
  REHEAT_TIME,
  SPOOL_TIME,
  THROTTLE_RATIO,
  TSFC_DRY,
  TSFC_REHEAT,
} from '../constants/rafale.js';

/** Throttle lever position of full dry power: the afterburner range lies beyond */
export const DRY_DETENT = 0.8;

/** Fuel burnt by the afterburner per newton of its thrust (kg/(N·s)) */
const TSFC_REHEAT_MARGINAL = (TSFC_REHEAT * REHEAT_THRUST - TSFC_DRY * DRY_THRUST) / (REHEAT_THRUST - DRY_THRUST);

/**
 * Share of the sea-level pressure below which thrust falls in proportion
 * (≈ 15 km): the engines lose combustion and component efficiency in very
 * thin air, which sets the service ceiling near the published 50 000 ft
 */
const THIN_AIR_PRESSURE = 0.12;

/** Sea-level standard temperature (K) and pressure (Pa) */
const T_SL = 288.15;
const P_SL = 101325;

/**
 * The two M88-2 engines, driven together by one throttle lever.
 *
 * Lever: 0 idle, DRY_DETENT full dry power, then the afterburner from its
 * lowest stage to full at 1. The core spools towards the demanded power, more
 * slowly from low power (idle to full afterburner in about 4 s); the
 * afterburner lights once the core is near full power.
 *
 * Thrust lapse with altitude and speed (Mattingly, Aircraft Engine Design,
 * low-bypass mixed-flow turbofan): thrust follows the total pressure at the
 * inlet, δ0 = δ·(1 + 0.2M²)^3.5, until the total temperature ratio
 * θ0 = θ·(1 + 0.2M²) exceeds the throttle ratio; beyond, the control lowers
 * thrust (by 3.5 (θ0 − TR)/θ0 with afterburner, 3.8 dry).
 */
export default class Engines {
  constructor() {
    /** Core power, 0 idle to 1 full dry */
    this.core = 0.7;
    /** Afterburner stage, 0 off to 1 full */
    this.reheat = 0;
    /** Total thrust (N) and fuel flow (kg/s) of the last update */
    this.thrust = 0;
    this.fuelFlow = 0;
  }

  /** Set the engines at once to the power of a lever position */
  setLever(lever) {
    const { core, reheat } = demand(lever);
    this.core = core;
    this.reheat = reheat;
  }

  /**
   * @param {number} dt - s
   * @param {number} lever - throttle lever, 0 to 1
   * @param {{temperature: number, pressure: number}} air - ambient air
   * @param {number} mach
   * @param {boolean} fuel - whether fuel is left: without, the engines flame out
   */
  update(dt, lever, air, mach, fuel) {
    const target = fuel ? demand(lever) : { core: 0, reheat: 0 };
    const spool = SPOOL_TIME * (1 + 1.5 * (1 - this.core));
    this.core += (target.core - this.core) * Math.min(1, dt / spool);
    const reheatTarget = this.core > 0.95 ? target.reheat : 0;
    this.reheat += (reheatTarget - this.reheat) * Math.min(1, dt / REHEAT_TIME);
    if (!fuel) {
      // Flamed out: the core winds down, no thrust
      this.thrust = 0;
      this.fuelFlow = 0;
      return 0;
    }

    const ram = 1 + 0.2 * mach * mach;
    const theta0 = (air.temperature / T_SL) * ram;
    const delta0 = (air.pressure / P_SL) * Math.pow(ram, 3.5);
    const over = Math.max(0, theta0 - THROTTLE_RATIO) / theta0;
    const dryLapse = Math.max(0, delta0 * (1 - 3.8 * over));
    const reheatLapse = Math.max(0, delta0 * (1 - 3.5 * over));
    // Combustion and component efficiency fall in very thin air
    const thinAir = Math.min(1, air.pressure / P_SL / THIN_AIR_PRESSURE);

    const coreShare = IDLE_THRUST_SHARE + (1 - IDLE_THRUST_SHARE) * this.core;
    const dry = DRY_THRUST * dryLapse * coreShare * thinAir;
    const boost = Math.max(0, REHEAT_THRUST * reheatLapse - DRY_THRUST * dryLapse) * this.reheat * thinAir;
    this.thrust = ENGINE_COUNT * (dry + boost);
    this.fuelFlow = ENGINE_COUNT * (TSFC_DRY * dry + TSFC_REHEAT_MARGINAL * boost);
    return this.thrust;
  }
}

/** Core power and afterburner stage demanded by a lever position */
function demand(lever) {
  if (lever <= DRY_DETENT) return { core: Math.max(0, lever) / DRY_DETENT, reheat: 0 };
  const stage = Math.min(1, (lever - DRY_DETENT) / (1 - DRY_DETENT));
  return { core: 1, reheat: MIN_REHEAT_SHARE + (1 - MIN_REHEAT_SHARE) * stage };
}
