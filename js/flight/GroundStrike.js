import * as THREE from 'three';
import { STRUCTURE_POINTS } from '../constants/rafale.js';

/** Farthest structure point from the centre of gravity (m) */
const REACH = Math.max(...STRUCTURE_POINTS.map(({ position }) => Math.hypot(...position)));

const points = STRUCTURE_POINTS.map(({ part, position }) => ({ part, position: new THREE.Vector3(...position) }));
const _arm = new THREE.Vector3();
const _point = new THREE.Vector3();
const _omega = new THREE.Vector3();
const _velocity = new THREE.Vector3();

/**
 * First point of the airframe found below the ground, with the speed at which
 * it sinks into it; null while none touches. The ground is sampled only near
 * the points within reach of it: ground slopes up to 45° are assumed.
 * @param {import('./FlightModel.js').default} model
 * @param {(x: number, z: number) => number|null} groundHeight
 * @returns {{part: string, sink: number}|null}
 */
export function groundStrike(model, groundHeight) {
  const height = model.wheels.height;
  if (!groundHeight || !(height < REACH)) return null;
  const { position, quaternion, velocity } = model;
  const below = position.y - height;
  _omega.copy(model.angularVelocity).applyQuaternion(quaternion);
  for (const { part, position: offset } of points) {
    const arm = _arm.copy(offset).applyQuaternion(quaternion);
    const point = _point.copy(position).add(arm);
    if (point.y > below + Math.hypot(arm.x, arm.z) + 0.5) continue;
    const ground = groundHeight(point.x, point.z);
    if (ground === null || point.y > ground) continue;
    const sink = -_velocity.crossVectors(_omega, arm).add(velocity).y;
    return { part, sink };
  }
  return null;
}
