import * as THREE from 'three';

const DEG = Math.PI / 180;

/**
 * Parts of the Rafale model's landing gear (the model's parts all have
 * identity transforms, their vertices in the aircraft's frame: x left, y up,
 * z forward; the gear is modelled down, its doors closed).
 */
const MAIN_LEG = ['UpperStrut', 'MainStrut', 'Strut1', 'Strut2', 'Strut3', 'Wheel'];
const NOSE_LEG = [
  'FrontMainStrut',
  'FrontLowerStrut',
  'FrontStrut1',
  'FrontStrut2',
  'FrontLights',
  'NoseWheelL',
  'NoseWheelR',
];
const WELLS = ['GearBoxRear', 'GearBoxFront'];

/**
 * Where the main wheel's centre lies once the leg is folded forward into its
 * well (model frame, left side; mirrored for the right), an estimate from the
 * shape of the well: the leg swings forward and inward, turning about its own
 * axis so that the wheel lies flat.
 */
const MAIN_WHEEL_STOWED = new THREE.Vector3(1.0, 1.3, -0.85);

/** Swing of the nose leg, forward into its well (rad) */
const NOSE_LEG_SWING = 90 * DEG;

/** Opening of the doors (rad) */
const DOOR_OPEN = 85 * DEG;

/** Share of a door's length at each end whose vertices locate its hinge */
const END_SHARE = 0.15;

/**
 * Moves the landing gear of the aircraft model through its extension and
 * retraction sequence (see flight/GearSequence.js): doors on hinges found
 * from their geometry, legs swinging forward into their wells, the main
 * gear's side stays following their legs. The gear and its wells are hidden
 * while the gear is up and its doors closed.
 */
export default class LandingGear {
  /** @param {THREE.Object3D} model - the loaded aircraft model */
  constructor(model) {
    this.hidden = [];
    this.legs = [];
    this.braces = [];
    this.doors = [];

    for (const [suffix, side] of [
      ['L', 1],
      ['R', -1],
    ]) {
      const parts = MAIN_LEG.map((name) => model.getObjectByName(name + suffix)).filter(Boolean);
      const upper = model.getObjectByName('UpperStrut' + suffix);
      const wheel = model.getObjectByName('Wheel' + suffix);
      if (!upper || !wheel) continue;
      const pivot = topOf(upper.geometry);
      const axle = centreOf(wheel.geometry);
      const stowed = MAIN_WHEEL_STOWED.clone();
      stowed.x *= side;
      const leg = this._leg(parts, pivot, mainFold(pivot, axle, stowed));
      const brace = model.getObjectByName('SideStrut' + suffix);
      if (brace) this._brace(brace, leg);
      this._door(model.getObjectByName('DoorsRear1' + suffix), side, 'inner', 'main');
      this._door(model.getObjectByName('DoorsRear2' + suffix), side, 'inner', 'leg');
    }

    const noseParts = NOSE_LEG.map((name) => model.getObjectByName(name)).filter(Boolean);
    const noseStrut = model.getObjectByName('FrontMainStrut');
    if (noseStrut) {
      const swing = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -NOSE_LEG_SWING);
      this._leg(noseParts, topOf(noseStrut.geometry), { swing, twist: new THREE.Quaternion() });
    }
    const noseDoor = model.getObjectByName('DoorsFront1');
    if (noseDoor) {
      const [left, right] = splitNoseDoor(noseDoor);
      this._door(left, 1, 'outer', 'main');
      this._door(right, -1, 'outer', 'main');
    }
    this._door(model.getObjectByName('DoorsFront2L'), 1, 'outer', 'leg');
    this._door(model.getObjectByName('DoorsFront2R'), -1, 'outer', 'leg');

    for (const name of WELLS) {
      const well = model.getObjectByName(name);
      if (well) this.hidden.push(well);
    }

    this._v = new THREE.Vector3();
  }

  /** @param {import('../flight/GearSequence.js').default} sequence */
  update(sequence) {
    // The model has its gear down: the legs turn from there by their fold
    const fold = 1 - sequence.legs;
    for (const leg of this.legs) {
      leg.group.quaternion.identity().slerp(leg.swing, fold);
      leg.inner.quaternion.identity().slerp(leg.twist, fold);
    }
    for (const brace of this.braces) {
      // The stay keeps its upper end and turns to keep its lower end on the leg
      const leg = brace.leg;
      const end = this._v.copy(brace.end).sub(leg.group.position).applyQuaternion(leg.inner.quaternion);
      end.applyQuaternion(leg.group.quaternion).add(leg.group.position).sub(brace.mesh.position).normalize();
      brace.mesh.quaternion.setFromUnitVectors(brace.direction, end);
    }
    for (const door of this.doors) {
      const open = door.kind === 'main' ? sequence.mainDoors : sequence.legDoors;
      door.mesh.quaternion.setFromAxisAngle(door.axis, door.angle * open);
    }
    const visible = !sequence.upLocked;
    for (const mesh of this.hidden) mesh.visible = visible;
  }

  /** Puts parts in a group turning about a pivot: the swing of the leg, applied after its twist */
  _leg(parts, pivot, { swing, twist }) {
    const group = new THREE.Group();
    const inner = new THREE.Group();
    group.position.copy(pivot);
    group.add(inner);
    parts[0].parent.add(group);
    for (const part of parts) {
      part.geometry.translate(-pivot.x, -pivot.y, -pivot.z);
      inner.add(part);
      this.hidden.push(part);
    }
    const leg = { group, inner, swing, twist };
    this.legs.push(leg);
    return leg;
  }

  _brace(mesh, leg) {
    const top = topOf(mesh.geometry);
    const end = bottomOf(mesh.geometry);
    mesh.geometry.translate(-top.x, -top.y, -top.z);
    mesh.position.copy(top);
    mesh.updateMatrix();
    this.braces.push({ mesh, leg, end, direction: end.clone().sub(top).normalize() });
    this.hidden.push(mesh);
  }

  /**
   * A door hinged along its length (z) on its inner or outer edge, opening
   * downwards
   */
  _door(mesh, side, edge, kind) {
    if (!mesh?.geometry) return;
    const { pivot, axis } = doorHinge(mesh.geometry, edge);
    mesh.geometry.translate(-pivot.x, -pivot.y, -pivot.z);
    mesh.position.copy(pivot);
    mesh.updateMatrix();
    // About +z, a positive turn lowers what lies on the −x side of the hinge
    const angle = (edge === 'inner' ? -side : side) * DOOR_OPEN;
    this.doors.push({ mesh, axis, angle, kind });
  }
}

/**
 * Fold of a main leg: a swing taking its wheel from where it is to where it is
 * stowed, after a twist about the leg's axis that lays the wheel flat (its
 * axle upright once swung)
 */
function mainFold(pivot, axle, stowed) {
  const leg = axle.clone().sub(pivot).normalize();
  const swing = new THREE.Quaternion().setFromUnitVectors(leg, stowed.clone().sub(pivot).normalize());
  const twist = new THREE.Quaternion();
  const turn = new THREE.Quaternion();
  const wheelAxle = new THREE.Vector3();
  let best = -1;
  for (let i = -90; i <= 90; i++) {
    turn.setFromAxisAngle(leg, i * DEG);
    wheelAxle.set(1, 0, 0).applyQuaternion(turn).applyQuaternion(swing);
    const upright = Math.abs(wheelAxle.y);
    if (upright > best) {
      best = upright;
      twist.copy(turn);
    }
  }
  return { swing, twist };
}

function centreOf(geometry) {
  geometry.computeBoundingBox();
  return geometry.boundingBox.getCenter(new THREE.Vector3());
}

/** Centre of the vertices within 5 cm of the top of a part */
function topOf(geometry) {
  return endOf(geometry, 1);
}

function bottomOf(geometry) {
  return endOf(geometry, -1);
}

function endOf(geometry, sign) {
  const position = geometry.attributes.position;
  let extreme = -Infinity;
  for (let i = 0; i < position.count; i++) extreme = Math.max(extreme, sign * position.getY(i));
  const point = new THREE.Vector3();
  const pick = new THREE.Vector3();
  let count = 0;
  for (let i = 0; i < position.count; i++) {
    if (sign * position.getY(i) < extreme - 0.05) continue;
    point.add(pick.fromBufferAttribute(position, i));
    count++;
  }
  return point.divideScalar(count);
}

/** Hinge of a door along z: the vertices of its inner or outer edge near both ends */
function doorHinge(geometry, edge) {
  const position = geometry.attributes.position;
  let lo = Infinity;
  let hi = -Infinity;
  for (let i = 0; i < position.count; i++) {
    lo = Math.min(lo, position.getZ(i));
    hi = Math.max(hi, position.getZ(i));
  }
  const margin = (hi - lo) * END_SHARE;
  const pick = new THREE.Vector3();
  const ends = [0, 1].map((k) => {
    const inSlice = (z) => (k === 0 ? z <= lo + margin : z >= hi - margin);
    let extreme = edge === 'inner' ? Infinity : -Infinity;
    for (let i = 0; i < position.count; i++) {
      if (!inSlice(position.getZ(i))) continue;
      const x = Math.abs(position.getX(i));
      extreme = edge === 'inner' ? Math.min(extreme, x) : Math.max(extreme, x);
    }
    const point = new THREE.Vector3();
    let count = 0;
    for (let i = 0; i < position.count; i++) {
      if (!inSlice(position.getZ(i)) || Math.abs(Math.abs(position.getX(i)) - extreme) > 0.02) continue;
      point.add(pick.fromBufferAttribute(position, i));
      count++;
    }
    return point.divideScalar(count);
  });
  const axis = new THREE.Vector3().subVectors(ends[1], ends[0]).normalize();
  return { pivot: ends[0].clone().add(ends[1]).multiplyScalar(0.5), axis };
}

/**
 * The model's nose-gear door is one mesh across the fuselage: split it on the
 * centre line into two doors (the blade antenna under it goes with the left
 * one)
 */
function splitNoseDoor(mesh) {
  const geometry = mesh.geometry;
  const position = geometry.attributes.position;
  const index = geometry.index;
  const sides = [[], []];
  for (let t = 0; t < index.count; t += 3) {
    const a = index.getX(t);
    const b = index.getX(t + 1);
    const c = index.getX(t + 2);
    const x = position.getX(a) + position.getX(b) + position.getX(c);
    const y = Math.min(position.getY(a), position.getY(b), position.getY(c));
    const antenna = Math.abs(x) < 0.06 && y < 1.24;
    sides[x >= 0 || antenna ? 0 : 1].push(a, b, c);
  }
  const right = new THREE.Mesh(geometry.clone(), mesh.material);
  right.name = mesh.name + 'R';
  right.castShadow = mesh.castShadow;
  right.receiveShadow = mesh.receiveShadow;
  right.layers.mask = mesh.layers.mask;
  right.frustumCulled = mesh.frustumCulled;
  mesh.parent.add(right);
  geometry.setIndex(sides[0]);
  right.geometry.setIndex(sides[1]);
  return [mesh, right];
}
