import { SPEED_SMOOTH_RATE } from '../../constants/hud.js';

/**
 * Computes smoothed ground speed from camera position deltas.
 */
export default class SpeedTracker {
  constructor() {
    this._prevPos = null;
    this._groundSpeed = 0;
  }

  get groundSpeed() {
    return this._groundSpeed;
  }

  update(px, pz, dt) {
    if (this._prevPos && dt > 0) {
      const dx = px - this._prevPos.x;
      const dz = pz - this._prevPos.z;
      const dist = Math.sqrt(dx * dx + dz * dz);
      const instant = dist / dt;
      this._groundSpeed += (instant - this._groundSpeed) * Math.min(1, SPEED_SMOOTH_RATE * dt);
    }
    this._prevPos = { x: px, z: pz };
  }
}
