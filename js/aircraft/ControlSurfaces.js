import * as THREE from 'three';

const DEG = Math.PI / 180;

/**
 * Hinges of the moving surfaces of the Rafale model, found from their
 * geometry (the model's parts all have identity transforms, their vertices in
 * the aircraft's frame: x left, y up, z forward):
 * - along: axis the hinge runs along ('x' spanwise, 'y' for the fin)
 * - edge: which edge of the part the hinge follows: 'front' (elevons and
 *   rudder, hinged on their leading edge), 'rear' (leading-edge slats, hinged
 *   on their trailing edge) or 'middle' (all-moving canards, on their spar)
 * - side: +1 left, -1 right, 0 on the centre line
 */
const PARTS = {
  KanardL: { along: 'x', edge: 'middle', side: 1, kind: 'canard' },
  KanardR: { along: 'x', edge: 'middle', side: -1, kind: 'canard' },
  FlapL: { along: 'x', edge: 'front', side: 1, kind: 'elevon' },
  FlapR: { along: 'x', edge: 'front', side: -1, kind: 'elevon' },
  EleronL: { along: 'x', edge: 'front', side: 1, kind: 'elevon' },
  EleronR: { along: 'x', edge: 'front', side: -1, kind: 'elevon' },
  SlatL: { along: 'x', edge: 'rear', side: 1, kind: 'slat' },
  SlatR: { along: 'x', edge: 'rear', side: -1, kind: 'slat' },
  Rudder: { along: 'y', edge: 'front', side: 0, kind: 'rudder' },
};

/** Largest deflections (rad), estimates (no published figures) */
const ELEVON_PITCH = 25 * DEG;
const ELEVON_ROLL = 20 * DEG;
const CANARD = 20 * DEG;
const RUDDER = 30 * DEG;
const SLAT = 20 * DEG;
/** Airbrake: canards leading edge down, elevons trailing edge up */
const AIRBRAKE_CANARD = 40 * DEG;
const AIRBRAKE_ELEVON = 12 * DEG;

/** Actuator rate (rad/s) */
const SURFACE_RATE = 100 * DEG;

/** Share of the part's span at each end whose vertices locate the hinge */
const END_SHARE = 0.15;

/**
 * Moves the control surfaces of the aircraft model from the commands of the
 * flight control system (FlightModel.surfaces): elevons up for pitch and
 * differentially for roll, canards along the airflow and with pitch, rudder,
 * leading-edge slats with the angle of attack, canards and elevons together
 * as an airbrake.
 */
export default class ControlSurfaces {
  /** @param {THREE.Object3D} model - the loaded aircraft model */
  constructor(model) {
    this.parts = [];
    for (const [name, spec] of Object.entries(PARTS)) {
      const mesh = model.getObjectByName(name);
      if (!mesh?.geometry) continue;
      const { pivot, axis } = hinge(mesh.geometry, spec);
      // Put the part's origin on its hinge so that it turns about it
      mesh.geometry.translate(-pivot.x, -pivot.y, -pivot.z);
      mesh.position.copy(pivot);
      mesh.updateMatrix();
      this.parts.push({ mesh, spec, axis, angle: 0 });
    }
  }

  /**
   * @param {number} dt - s
   * @param {{pitch: number, roll: number, yaw: number, canard: number, slat: number, airbrake: number}|null} s -
   *   normalized deflections; null puts the surfaces back to neutral
   */
  update(dt, s) {
    const step = SURFACE_RATE * dt;
    for (const part of this.parts) {
      const target = s ? deflection(part.spec, s) : 0;
      part.angle += Math.max(-step, Math.min(step, target - part.angle));
      part.mesh.quaternion.setFromAxisAngle(part.axis, part.angle);
    }
  }
}

/**
 * Rotation of a part about its hinge axis. Wing hinges point to +x (left), so
 * a positive rotation raises what lies behind the hinge and lowers what lies
 * in front of it; the fin's hinge points up, so a positive rotation swings the
 * rudder's trailing edge to the right (−x).
 */
function deflection(spec, s) {
  switch (spec.kind) {
    case 'elevon':
      // Trailing edge up to pull; the right elevons up to roll right
      return s.pitch * ELEVON_PITCH + spec.side * -s.roll * ELEVON_ROLL + s.airbrake * AIRBRAKE_ELEVON;
    case 'canard':
      // Positive canard command raises the leading edge
      return -s.canard * CANARD + s.airbrake * AIRBRAKE_CANARD;
    case 'slat':
      return s.slat * SLAT;
    case 'rudder':
      return s.yaw * RUDDER;
    default:
      return 0;
  }
}

/** Hinge of a part: a point on it and its axis, from the vertices at both ends of its span */
function hinge(geometry, spec) {
  const position = geometry.attributes.position;
  const a = spec.along === 'x' ? 0 : 1;
  let lo = Infinity;
  let hi = -Infinity;
  for (let i = 0; i < position.count; i++) {
    const v = position.getComponent(i, a);
    lo = Math.min(lo, v);
    hi = Math.max(hi, v);
  }
  const margin = (hi - lo) * END_SHARE;
  const ends = [lo + margin, hi - margin].map((limit, k) => {
    const point = new THREE.Vector3();
    const pick = new THREE.Vector3();
    let count = 0;
    let z = spec.edge === 'front' ? -Infinity : Infinity;
    let zSum = 0;
    for (let i = 0; i < position.count; i++) {
      const v = position.getComponent(i, a);
      if (k === 0 ? v > limit : v < limit) continue;
      pick.fromBufferAttribute(position, i);
      point.add(pick);
      zSum += pick.z;
      count++;
      if (spec.edge === 'front') z = Math.max(z, pick.z);
      if (spec.edge === 'rear') z = Math.min(z, pick.z);
    }
    point.divideScalar(count);
    point.z = spec.edge === 'middle' ? zSum / count : z;
    return point;
  });
  const axis = new THREE.Vector3().subVectors(ends[1], ends[0]).normalize();
  if (spec.along === 'x' && axis.x < 0) axis.negate();
  if (spec.along === 'y' && axis.y < 0) axis.negate();
  return { pivot: ends[0].clone().add(ends[1]).multiplyScalar(0.5), axis };
}
