/**
 * Extension and retraction sequence of the landing gear, as one position
 * running from 0 (gear up, doors closed) to 1 (gear down and locked):
 * - 0 → DOORS_OPEN: all doors open;
 * - DOORS_OPEN → LEGS_DOWN: the legs swing down;
 * - LEGS_DOWN → 1: the main doors close again, the doors carried by the legs
 *   stay open.
 * Retraction runs the same steps backwards. A new command reverses the
 * sequence where it stands, as the hydraulics would.
 */

/** Time of a full extension or retraction (s) */
export const GEAR_TRANSIT_TIME = 6;

/** Highest speed with the gear down (m/s): 230 kt */
export const GEAR_SPEED_LIMIT = 230 * 0.514444;

/** Positions of the sequence where the doors are open and where the legs are down */
const DOORS_OPEN = 0.25;
const LEGS_DOWN = 0.75;

export default class GearSequence {
  /** @param {boolean} [down=false] - whether the gear starts down and locked */
  constructor(down = false) {
    this.position = down ? 1 : 0;
    this.down = down;
  }

  /** Commands the gear down (true) or up (false) */
  command(down) {
    this.down = down;
  }

  toggle() {
    this.down = !this.down;
  }

  /** @param {number} dt - s */
  update(dt) {
    const target = this.down ? 1 : 0;
    const step = dt / GEAR_TRANSIT_TIME;
    this.position += Math.max(-step, Math.min(step, target - this.position));
  }

  /** Down and locked: the gear can take the aircraft's weight */
  get downLocked() {
    return this.position >= 1;
  }

  /** Up and locked, doors closed */
  get upLocked() {
    return this.position <= 0;
  }

  /** Legs' travel: 0 up, 1 down */
  get legs() {
    return smoothstep(DOORS_OPEN, LEGS_DOWN, this.position);
  }

  /** Opening of the main doors, closed again once the legs are down or up */
  get mainDoors() {
    return smoothstep(0, DOORS_OPEN, this.position) * (1 - smoothstep(LEGS_DOWN, 1, this.position));
  }

  /** Opening of the doors carried by the legs, open while the legs are not up */
  get legDoors() {
    return smoothstep(0, DOORS_OPEN, this.position);
  }
}

function smoothstep(a, b, x) {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}
