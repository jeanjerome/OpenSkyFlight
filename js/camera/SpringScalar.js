/**
 * SpringScalar — critically-damped 1D spring, semi-implicit Euler.
 * Optionally wraps angle values to [-PI, PI].
 */
export default class SpringScalar {
  constructor(initial = 0, wrapAngle = false) {
    this.value = initial;
    this.velocity = 0;
    this.wrapAngle = wrapAngle;
  }

  update(target, stiffness, damping, dt) {
    if (damping === 0) damping = 2 * Math.sqrt(stiffness);

    let delta = target - this.value;
    if (this.wrapAngle) {
      while (delta > Math.PI) delta -= 2 * Math.PI;
      while (delta < -Math.PI) delta += 2 * Math.PI;
    }

    const accel = stiffness * delta - damping * this.velocity;
    this.velocity += accel * dt;
    this.value += this.velocity * dt;

    if (this.wrapAngle) {
      while (this.value > Math.PI) this.value -= 2 * Math.PI;
      while (this.value < -Math.PI) this.value += 2 * Math.PI;
    }
  }

  reset(value) {
    this.value = value;
    this.velocity = 0;
  }
}
