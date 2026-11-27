import * as THREE from 'three';
import FlightPath from './FlightPath.js';
import { sample, shake } from './keyframes.js';
import GearSequence from '../flight/GearSequence.js';

/**
 * Plays a cinematic shot: the aircraft flies an imposed path and the camera
 * follows one of several rigs, both computed from the shot's time alone, so
 * that a shot renders the same at any frame rate and can be recorded frame
 * by frame (see scripts/cinematic-record.js).
 *
 * A shot is plain data:
 * - aircraft: { path: [{lat, lon, agl|msl}], speed, maxGradient, smoothing,
 *   minClearance, t0, core, reheat, gear, roll, alpha } or null (no aircraft).
 *   t0 is the time along the path at the start of the shot; core, reheat and
 *   gear (0 up, 1 down) and roll (an extra roll about the flight path, °) are
 *   keyed values (see keyframes.js) over the shot's time.
 * - camera: { type, fov, roll, shake, ... } with type
 *   - 'chase': attached to the aircraft, at `offset` [right, up, back] (m) in
 *     its frame as it was `lag` seconds before, banking with it by
 *     `bankFollow` (0 to 1), looking at `look` in the same frame;
 *   - 'fixed': standing at `at` ({lat, lon, agl|msl}, or {pathTime, side,
 *     ahead, agl} beside the path), turning to follow the aircraft, `zoom`
 *     keeping it `zoom` of the frame height (fov between zoomMin and zoomMax);
 *     `passAt` shifts the path so the aircraft passes there at that shot time;
 *   - 'orbit': at `radius` (m) around the aircraft, `azimuth` (° from behind,
 *     clockwise seen from above) and `elevation` (°) in its heading frame;
 *   - 'path': flying its own path (`points`, `speed`) looking at the aircraft
 *     (`look: 'aircraft'`), along its way (`look: 'forward'`, `pitch` and
 *     `yaw` offsets in °) or at a place ({lat, lon, msl}).
 *   Every number may be keyed over the shot's time.
 */
export default class CinematicDirector {
  /**
   * @param {import('../terrain/GeoTerrainManager.js').default} terrain
   */
  constructor(terrain) {
    this.terrain = terrain;
    this.shot = null;
    this.path = null;
    this.cameraPath = null;
    /** Pose of the aircraft for the renderer, null without an aircraft */
    this.aircraft = null;
    /** Camera pose */
    this.camera = { position: new THREE.Vector3(), quaternion: new THREE.Quaternion(), fov: 60 };
    this._gear = new GearSequence(false);
    this._fixed = null;
    this._t0 = 0;
    this._v = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
    this._fv = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
    this._m = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._frame = {
      position: new THREE.Vector3(),
      forward: new THREE.Vector3(),
      up: new THREE.Vector3(),
      right: new THREE.Vector3(),
      level: { forward: new THREE.Vector3(), up: new THREE.Vector3(), right: new THREE.Vector3() },
      bank: 0,
      load: 1,
      speed: 0,
    };
    this._lagFrame = cloneFrame(this._frame);
    this._aheadFrame = cloneFrame(this._frame);
  }

  /**
   * Prepare a shot: its paths, with the ground elevations they follow
   * (fetched first). The terrain must already be centred on the shot.
   */
  async prepare(shot) {
    this.shot = shot;
    this._fixed = null;
    this.path = null;
    this.cameraPath = null;
    const ground = (this._ground = await this._groundSampler([
      ...(shot.aircraft?.path ?? []),
      ...(shot.camera.points ?? []),
      shot.camera.at,
    ]));
    if (shot.aircraft) {
      const points = shot.aircraft.path.map((p) => this._toWorld(p));
      this.path = new FlightPath(points, ground, shot.aircraft);
    }
    if (shot.camera.type === 'path') {
      this.cameraPath = new FlightPath(
        shot.camera.points.map((p) => this._toWorld(p)),
        ground,
        { speed: 50, maxGradient: 0.5, smoothing: 120, minClearance: 5, ...shot.camera },
      );
    }
    this._t0 = shot.aircraft?.t0 ?? 0;
    const at = shot.camera.at;
    if (shot.camera.type === 'fixed') {
      // Beside the path, or at a place
      const position = new THREE.Vector3();
      if (at.pathTime !== undefined) {
        const s = this.path.distanceAt(at.pathTime) + (at.ahead ?? 0);
        const p = this.path.positionAtDistance(s, new THREE.Vector3());
        const q = this.path.positionAtDistance(s + 5, new THREE.Vector3());
        const dir = q.sub(p).setY(0).normalize();
        position.set(p.x - dir.z * (at.side ?? 0), 0, p.z + dir.x * (at.side ?? 0));
      } else {
        const w = this._toWorld(at);
        position.set(w.x, 0, w.z);
      }
      this._fixed = { position, agl: at.agl, msl: at.msl, ground: ground(position.x, position.z) };
      if (shot.camera.passAt !== undefined && this.path) {
        const pass = at.pathTime ?? this.path.closestTime(this._fixedPosition(position.clone()));
        this._t0 = pass - shot.camera.passAt;
      }
    }
    return {
      pathDuration: this.path?.duration ?? null,
      t0: this._t0,
      pathLength: this.path?.length ?? null,
      clearance: this.path ? this._clearance() : null,
    };
  }

  /** Path of the aircraft every `step` seconds: [time, lat, lon, altitude, ground, heading°] */
  profile(step = 1) {
    if (!this.path) return [];
    const rows = [];
    const p = new THREE.Vector3();
    const q = new THREE.Vector3();
    for (let t = 0; t <= this.path.duration; t += step) {
      const s = this.path.distanceAt(t);
      this.path.positionAtDistance(s, p);
      this.path.positionAtDistance(s + 10, q);
      const geo = this.terrain.worldToGeo(p.x, p.z);
      const heading = ((Math.atan2(q.x - p.x, -(q.z - p.z)) * 180) / Math.PI + 360) % 360;
      rows.push([
        t,
        +geo.lat.toFixed(4),
        +geo.lon.toFixed(4),
        Math.round(p.y),
        Math.round(this.path.groundAtDistance(s)),
        Math.round(heading),
      ]);
    }
    return rows;
  }

  /** Lowest height of the aircraft above the ground along the part of the path flown in the shot (m) */
  _clearance() {
    const duration = this.shot.duration ?? 10;
    let lowest = Infinity;
    const p = new THREE.Vector3();
    for (let t = 0; t <= duration; t += 0.1) {
      const s = this.path.distanceAt(this._t0 + t);
      this.path.positionAtDistance(s, p);
      lowest = Math.min(lowest, p.y - this.path.groundAtDistance(s));
    }
    return Math.round(lowest);
  }

  /**
   * Ground under the aircraft and under the camera as drawn and as the
   * elevation tiles give it: a large difference shows a tile drawn without its
   * relief, or an error in the elevation data
   * @returns {{aircraft: number[]|null, camera: number[]}} [drawn, elevation data] (m)
   */
  groundCheck() {
    const pair = (x, z) =>
      [this.terrain.groundHeight(x, z), this._ground ? this._ground(x, z) : null].map((v) =>
        v === null ? null : Math.round(v),
      );
    const a = this.aircraft?.position;
    const c = this.camera.position;
    const result = { aircraft: a ? pair(a.x, a.z) : null, camera: pair(c.x, c.z) };
    // Far below a high camera the terrain is drawn coarse on purpose: compare it only nearby
    if (result.camera[1] !== null && c.y - result.camera[1] > 3000) result.camera = null;
    if (a && result.aircraft[1] !== null && a.distanceTo(c) > 3000) result.aircraft = null;
    return result;
  }

  /** The fixed camera's position, at its height above the ground as drawn once loaded */
  _fixedPosition(target) {
    const f = this._fixed;
    target.copy(f.position);
    if (f.msl !== undefined) target.y = f.msl;
    else {
      const drawn = this.terrain.groundHeight(f.position.x, f.position.z);
      target.y = (drawn ?? f.ground) + (f.agl ?? 2);
    }
    return target;
  }

  /** Freeze the fixed camera's height on the ground as drawn now (call once the tiles have loaded) */
  settle() {
    const f = this._fixed;
    if (!f || f.msl !== undefined) return;
    const drawn = this.terrain.groundHeight(f.position.x, f.position.z);
    if (drawn !== null) {
      f.msl = drawn + (f.agl ?? 2);
    }
  }

  _toWorld({ lat, lon, agl, msl }) {
    const w = this.terrain.geoToWorld(lat, lon, 0);
    return { x: w.x, z: w.z, agl, msl };
  }

  /**
   * Ground elevation at a world position from the zoom-13 elevation tiles,
   * fetched first around the given places (and the area between them)
   */
  async _groundSampler(places) {
    const geo = await elevationSampler(this.terrain.elevationProvider, places);
    return (wx, wz) => {
      const p = this.terrain.worldToGeo(wx, wz);
      return (p && geo(p.lat, p.lon)) ?? this.terrain.getGroundElevation(wx, wz, 0);
    };
  }

  /**
   * Aircraft frame at a time along its path: flight direction, lift
   * direction (banked into the turn so that lift and gravity give the path's
   * acceleration) and the level frame of its heading
   */
  _aircraftFrame(time, out = this._frame) {
    const path = this.path;
    const [a, b, c] = this._fv;
    const h = 0.05;
    const H = 0.45;
    path.positionAt(time, out.position);
    path.positionAt(time + h, a);
    path.positionAt(time - h, b);
    out.forward.subVectors(a, b).normalize();
    out.speed = a.distanceTo(b) / (2 * h);
    // Acceleration over a longer span, smoother; lift balances it with gravity
    path.positionAt(time + H, a);
    path.positionAt(time - H, b);
    c.copy(a)
      .add(b)
      .addScaledVector(out.position, -2)
      .divideScalar(H * H);
    c.y += 9.81;
    // Pushing over keeps some positive load: the airframe stays upright instead of rolling over
    c.y = Math.max(c.y, 3);
    c.addScaledVector(out.forward, -c.dot(out.forward));
    out.load = c.length() / 9.81;
    if (c.lengthSq() < 1e-6) c.set(0, 1, 0);
    out.up.copy(c).normalize();
    const level = out.level;
    level.forward.copy(out.forward);
    level.right.crossVectors(out.forward, THREE.Object3D.DEFAULT_UP).normalize();
    level.up.crossVectors(level.right, out.forward).normalize();
    // Extra roll about the flight path (aileron rolls)
    const roll = sample(this.shot.aircraft.roll ?? 0, time - this._t0) * (Math.PI / 180);
    if (roll) out.up.applyAxisAngle(out.forward, -roll);
    out.right.crossVectors(out.forward, out.up).normalize();
    out.bank = Math.atan2(out.up.dot(level.right), out.up.dot(level.up));
    return out;
  }

  /**
   * Poses at a shot time
   * @param {number} t - s since the start of the shot
   */
  update(t) {
    if (this.path) this._updateAircraft(t);
    else this.aircraft = null;
    this._updateCamera(t);
    return this;
  }

  _updateAircraft(t) {
    const spec = this.shot.aircraft;
    const frame = this._aircraftFrame(this._t0 + t);
    // Nose above the flight path by the angle of attack, which grows with the load
    const alpha = Math.min(14, (spec.alpha ?? 1.6) * frame.load) * (Math.PI / 180);
    const nose = this._v[0].copy(frame.forward).applyAxisAngle(frame.right, alpha);
    const up = this._v[1].crossVectors(frame.right, nose).normalize();
    const back = this._v[2].copy(nose).negate();
    this._m.makeBasis(frame.right, up, back);
    const state = this.aircraft ?? {
      position: new THREE.Vector3(),
      quaternion: new THREE.Quaternion(),
      yaw: 0,
      pitch: 0,
      yawRate: 0,
      pitchRate: 0,
      roll: 0,
      thrust: true,
      engines: { core: 1, reheat: 0, mach: 0.7, running: true },
      model: {
        surfaces: { pitch: 0, roll: 0, yaw: 0, canard: 0, slat: 0, airbrake: 0 },
        gear: this._gear,
        wheels: null,
      },
    };
    state.position.copy(frame.position);
    state.quaternion.setFromRotationMatrix(this._m);
    state.yaw = Math.atan2(-frame.forward.x, -frame.forward.z);
    state.pitch = Math.asin(Math.max(-1, Math.min(1, frame.forward.y)));
    state.engines.core = sample(spec.core ?? 0.95, t);
    state.engines.reheat = sample(spec.reheat ?? 0, t);
    state.engines.mach = frame.speed / 330;
    this._gear.position = sample(spec.gear ?? 0, t);
    // Control surfaces as a pilot would hold them: pull with the load, roll with the roll rate
    const ahead = this._aircraftFrame(this._t0 + t + 0.1, this._aheadFrame);
    const rollRate = wrap(ahead.bank - frame.bank) / 0.1;
    const s = state.model.surfaces;
    s.pitch = Math.max(-1, Math.min(1, (frame.load - 1) * 0.12));
    s.canard = s.pitch * 0.6;
    s.roll = Math.max(-1, Math.min(1, rollRate * 0.35));
    this.aircraft = state;
  }

  _updateCamera(t) {
    const spec = this.shot.camera;
    const cam = this.camera;
    const [a, b, c] = this._v;
    const lookAt = this._v[3];
    let up = THREE.Object3D.DEFAULT_UP;
    const target = this.aircraft?.position;
    switch (spec.type) {
      case 'chase': {
        const lag = sample(spec.lag ?? 0.12, t);
        const frame = this._aircraftFrame(this._t0 + t - lag, this._lagFrame);
        const bankFollow = sample(spec.bankFollow ?? 0.6, t);
        // Level frame turned about the flight path by part of the bank
        const right = a.copy(frame.level.right).applyAxisAngle(frame.forward, -frame.bank * bankFollow);
        const frameUp = b.crossVectors(right, frame.forward).normalize();
        const [ox, oy, oz] = sample(spec.offset ?? [0, 4, 28], t);
        const [lx, ly, lz] = sample(spec.look ?? [0, 0, 0], t);
        const here = this.aircraft.position;
        cam.position
          .copy(here)
          .addScaledVector(right, ox)
          .addScaledVector(frameUp, oy)
          .addScaledVector(frame.forward, -oz);
        lookAt.copy(here).addScaledVector(right, lx).addScaledVector(frameUp, ly).addScaledVector(frame.forward, -lz);
        up = c.copy(frameUp);
        break;
      }
      case 'fixed': {
        this._fixedPosition(cam.position);
        const lag = spec.lag ?? 0.08;
        const lead = sample(spec.lead ?? 0, t);
        if (this.path) {
          this.path.positionAt(this._t0 + t - lag, lookAt);
          if (lead) {
            this.path.positionAt(this._t0 + t - lag + 0.1, a);
            lookAt.addScaledVector(a.sub(lookAt).normalize(), lead * this.path.speedAt(this._t0 + t));
          }
        } else {
          const w = this._toWorld(spec.look);
          lookAt.set(w.x, w.msl, w.z);
        }
        break;
      }
      case 'orbit': {
        const frame = this._frame;
        const azimuth = sample(spec.azimuth ?? 0, t) * (Math.PI / 180);
        const elevation = sample(spec.elevation ?? 10, t) * (Math.PI / 180);
        const radius = sample(spec.radius ?? 40, t);
        const level = frame.level;
        a.copy(level.forward).multiplyScalar(-Math.cos(azimuth)).addScaledVector(level.right, Math.sin(azimuth));
        a.multiplyScalar(Math.cos(elevation)).addScaledVector(level.up, Math.sin(elevation));
        cam.position.copy(target).addScaledVector(a, radius);
        const [lx, ly, lz] = sample(spec.look ?? [0, 0, 0], t);
        lookAt
          .copy(target)
          .addScaledVector(level.right, lx)
          .addScaledVector(level.up, ly)
          .addScaledVector(level.forward, -lz);
        break;
      }
      case 'path': {
        const ct = (spec.t0 ?? 0) + t;
        this.cameraPath.positionAt(ct, cam.position);
        const look = spec.look ?? 'forward';
        if (look === 'aircraft' && target) {
          lookAt.copy(target);
        } else if (look === 'forward') {
          this.cameraPath.positionAt(ct + 0.5, a);
          b.subVectors(a, cam.position).setY(0).normalize();
          const yaw = sample(spec.yaw ?? 0, t) * (Math.PI / 180);
          const pitch = sample(spec.pitch ?? -5, t) * (Math.PI / 180);
          b.applyAxisAngle(THREE.Object3D.DEFAULT_UP, -yaw);
          lookAt
            .copy(cam.position)
            .addScaledVector(b, Math.cos(pitch) * 100)
            .add(c.set(0, Math.sin(pitch) * 100, 0));
        } else {
          const w = this._toWorld(look);
          lookAt.set(w.x, w.msl, w.z);
        }
        break;
      }
      default:
        throw new Error(`Unknown camera type ${spec.type}`);
    }

    // Looking at the point, the view's top towards `up`, then the Dutch angle and the shake
    const forward = a.subVectors(lookAt, cam.position);
    const distance = forward.length();
    forward.normalize();
    const right = b.crossVectors(forward, up).normalize();
    const camUp = c.crossVectors(right, forward).normalize();
    this._m.makeBasis(right, camUp, forward.clone().negate());
    cam.quaternion.setFromRotationMatrix(this._m);
    const amplitude = sample(spec.shake ?? 0, t) * (Math.PI / 180);
    const roll = sample(spec.roll ?? 0, t) * (Math.PI / 180);
    if (amplitude || roll) {
      const e = new THREE.Euler(
        shake(t, 1) * amplitude,
        shake(t, 2) * amplitude,
        roll + shake(t, 3) * amplitude * 0.5,
        'YXZ',
      );
      cam.quaternion.multiply(this._q.setFromEuler(e));
    }

    // Field of view, or the zoom that keeps the aircraft a share of the frame height
    if (spec.zoom !== undefined && target) {
      const share = sample(spec.zoom, t);
      const fov = 2 * Math.atan(15.3 / (2 * distance * share)) * (180 / Math.PI);
      cam.fov = Math.max(spec.zoomMin ?? 2, Math.min(spec.zoomMax ?? 60, fov));
    } else {
      cam.fov = sample(spec.fov ?? 55, t);
    }
  }
}

/** Zoom level of the elevation tiles the paths follow */
const ELEVATION_ZOOM = 13;

/** Fractional tile coordinates of a place at ELEVATION_ZOOM */
function tileOf(lat, lon) {
  const n = 2 ** ELEVATION_ZOOM;
  const r = (lat * Math.PI) / 180;
  return [((lon + 180) / 360) * n, ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * n];
}

/**
 * Ground elevation at a place (m, null where no tile loaded), from the
 * elevation tiles fetched first over the area around the given places
 * @param {import('../geo/ElevationProvider.js').default} provider
 * @param {{lat: number, lon: number}[]} places
 */
export async function elevationSampler(provider, places) {
  const valid = places.filter((p) => p && p.lat !== undefined);
  if (valid.length) {
    const xy = valid.map((p) => tileOf(p.lat, p.lon));
    const x0 = Math.floor(Math.min(...xy.map((v) => v[0]))) - 1;
    const x1 = Math.floor(Math.max(...xy.map((v) => v[0]))) + 1;
    const y0 = Math.floor(Math.min(...xy.map((v) => v[1]))) - 1;
    const y1 = Math.floor(Math.max(...xy.map((v) => v[1]))) + 1;
    const jobs = [];
    for (let x = x0; x <= x1; x++) {
      for (let y = y0; y <= y1; y++) jobs.push(provider.fetchHeightmap(x, y, ELEVATION_ZOOM).catch(() => null));
    }
    await Promise.all(jobs);
  }
  return (lat, lon) => {
    const [fx, fy] = tileOf(lat, lon);
    const tx = Math.floor(fx);
    const ty = Math.floor(fy);
    const map = provider._cache.get(`${ELEVATION_ZOOM}/${tx}/${ty}`);
    if (!map) return null;
    const px = Math.min((fx - tx) * 255, 254);
    const py = Math.min((fy - ty) * 255, 254);
    const ix = Math.floor(px);
    const iy = Math.floor(py);
    const ax = px - ix;
    const ay = py - iy;
    const h = (i, j) => map[(iy + j) * 256 + ix + i];
    return h(0, 0) * (1 - ax) * (1 - ay) + h(1, 0) * ax * (1 - ay) + h(0, 1) * (1 - ax) * ay + h(1, 1) * ax * ay;
  };
}

function wrap(angle) {
  return Math.atan2(Math.sin(angle), Math.cos(angle));
}

function cloneFrame(frame) {
  return {
    position: frame.position.clone(),
    forward: frame.forward.clone(),
    up: frame.up.clone(),
    right: frame.right.clone(),
    level: { forward: frame.level.forward.clone(), up: frame.level.up.clone(), right: frame.level.right.clone() },
    bank: 0,
    load: 1,
    speed: 0,
  };
}
