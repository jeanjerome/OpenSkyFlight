import * as THREE from 'three';

/**
 * SpringVector3 — critically-damped 3D spring, semi-implicit Euler.
 */
export default class SpringVector3 {
  constructor(initial) {
    this.value = initial ? initial.clone() : new THREE.Vector3();
    this.velocity = new THREE.Vector3();
    this._delta = new THREE.Vector3();
    this._accel = new THREE.Vector3();
  }

  update(target, stiffness, damping, dt) {
    if (damping === 0) damping = 2 * Math.sqrt(stiffness);

    this._delta.subVectors(target, this.value);
    this._accel.copy(this._delta).multiplyScalar(stiffness).addScaledVector(this.velocity, -damping);

    this.velocity.addScaledVector(this._accel, dt);
    this.value.addScaledVector(this.velocity, dt);
  }

  reset(position) {
    this.value.copy(position);
    this.velocity.set(0, 0, 0);
  }
}
