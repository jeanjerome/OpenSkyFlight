import * as THREE from 'three';
import { MeshBasicNodeMaterial } from 'three/webgpu';
import {
  Fn,
  atan,
  cameraFar,
  cameraNear,
  cameraPosition,
  cameraProjectionMatrix,
  cameraViewMatrix,
  exp,
  float,
  getScreenPosition,
  instancedBufferAttribute,
  max,
  mix,
  perspectiveDepthToViewZ,
  positionGeometry,
  select,
  smoothstep,
  uniform,
  uv,
  varying,
  vec3,
  vec4,
} from 'three/tsl';
import { EARTH_RADIUS } from 'three-tile';
import { GLOW_LAYER, SCENE_UNIT_LUMINANCE } from '../constants/rendering.js';
import RunwaysInWorld from './RunwaysInWorld.js';
import { RED, WHITE, layout } from './runwayLightLayout.js';

/** Runways lit at once: the nearest to the camera, within LIGHT_DISTANCE (m) */
const MAX_RUNWAYS = 8;
const LIGHT_DISTANCE = 40000;

/** Most lights drawn */
const MAX_LIGHTS = 12000;

/** Camera move after which the runways lit are chosen again (m) */
const RESELECT_DISTANCE = 1000;

/** Height of the lights above the runway (m) */
const LIGHT_HEIGHT = 0.4;

/** Halo of a light at close range (m) and smallest size on screen (pixels) */
const HALO_SIZE = 1.2;
const HALO_MIN_PIXELS = 4;

/**
 * Distance by which a light may lie behind the scene and still show (m), and
 * its growth with distance (m per m): the depth is read at the halo's centre,
 * which the jitter of the temporal reconstruction moves by up to half a
 * pixel onto the ground just before a light that stands only 0.4 m above
 * it; a fixed tolerance would hide the farther lights one frame in two
 */
const OCCLUSION_BIAS = 0.5;
const OCCLUSION_BIAS_PER_METRE = 0.004;

/**
 * Sun elevations (degrees) between which the lights come on at dusk, and the
 * visibility (km) below which they are on by day as well
 */
const ON_FROM_ELEVATION = 6;
const ON_AT_ELEVATION = 0;
const DAY_VISIBILITY = 5;

/** Width of a PAPI unit's change from red to white (rad) */
const PAPI_TRANSITION = (3 / 60) * (Math.PI / 180);

/**
 * Lights of the runways around the camera: edge, centre line, threshold and
 * end, approach lights and PAPI, as halos drawn by the glow pass (like the
 * aircraft's lights), one instanced draw call for all. Each light has the
 * colour and intensity it shows towards end 0 of its runway (seen from that
 * side) and towards end 1, brightest along the runway; a PAPI unit turns
 * from red to white as the eye rises above its angle. The halos grow to stay
 * visible from afar, dimming with their size, are hidden behind the scene,
 * and are lowered by the curvature of the Earth like the terrain.
 */
export default class RunwayLights {
  /**
   * @param {THREE.Scene} scene
   * @param {{emissiveExposure: Node, sceneDepth: Node}} rendering
   */
  constructor(scene, { emissiveExposure, sceneDepth }) {
    this._world = new RunwaysInWorld();
    this._from = new THREE.Vector3(Infinity, 0, 0);
    /** Level of the lights: 0 off by day, 1 on */
    this._level = uniform(0);
    this._pixelAngle = uniform(0.001);

    const attribute = (size) => new THREE.InstancedBufferAttribute(new Float32Array(MAX_LIGHTS * size), size);
    this._position = attribute(3);
    // Axis of the runway (x, z) and the PAPI angle (rad, 0 for other lights):
    // WebGPU takes eight vertex buffers at most
    this._axis = attribute(3);
    this._front = attribute(4);
    this._back = attribute(4);

    const material = new MeshBasicNodeMaterial({
      transparent: true,
      depthWrite: false,
      depthTest: false,
      blending: THREE.AdditiveBlending,
    });
    const position = instancedBufferAttribute(this._position, 'vec3');
    const axisAndPapi = instancedBufferAttribute(this._axis, 'vec3');
    const axis = axisAndPapi.xy;
    const papi = axisAndPapi.z;
    const front = instancedBufferAttribute(this._front, 'vec4');
    const back = instancedBufferAttribute(this._back, 'vec4');

    // Lowered by the curvature of the Earth around the camera, as the terrain
    const offset = position.xz.sub(cameraPosition.xz);
    const world = position.sub(vec3(0, offset.dot(offset).div(2 * EARTH_RADIUS), 0));
    const centre = cameraViewMatrix.mul(vec4(world, 1)).xyz;
    const size = max(float(HALO_SIZE), centre.length().mul(this._pixelAngle).mul(HALO_MIN_PIXELS));
    material.vertexNode = cameraProjectionMatrix.mul(vec4(centre.add(vec3(positionGeometry.xy.mul(size), 0)), 1));

    // Side of the light the camera is on, and how far along the runway's axis it looks
    const toCamera = cameraPosition.sub(world);
    const flat = toCamera.xz.normalize();
    const along = flat.dot(axis);
    const shown = select(along.lessThan(0), front, back);
    const beam = mix(float(0.15), float(1), smoothstep(0.8, 0.97, along.abs()));
    // PAPI: white above the unit's angle, red below
    const elevation = atan(toCamera.y, toCamera.xz.length());
    const papiColour = mix(
      vec3(...RED),
      vec3(...WHITE),
      smoothstep(papi.sub(PAPI_TRANSITION), papi.add(PAPI_TRANSITION), elevation),
    );
    const colour = select(papi.greaterThan(0), papiColour, shown.rgb);
    // Hidden behind the scene, tested once per halo at its centre
    const screen = getScreenPosition(centre, cameraProjectionMatrix);
    const sceneZ = perspectiveDepthToViewZ(sceneDepth.sample(screen).r, cameraNear, cameraFar);
    const bias = centre.z.negate().mul(OCCLUSION_BIAS_PER_METRE).add(OCCLUSION_BIAS);
    const visible = select(centre.z.add(bias).greaterThan(sceneZ), float(1), float(0));
    // The light's intensity over its halo at close range; as the halo grows
    // to stay visible from afar it dims with its size rather than its area,
    // as the glare of a point light in the eye does
    const luminance = shown.a.div(size.mul((HALO_SIZE * HALO_SIZE * SCENE_UNIT_LUMINANCE * 0.3) / HALO_SIZE));
    const light = varying(colour.mul(luminance).mul(beam).mul(visible).mul(this._level));
    material.colorNode = Fn(() => {
      const r = uv().sub(0.5).length().mul(2);
      const falloff = exp(r.pow2().mul(-40))
        .mul(0.7)
        .add(exp(r.pow2().mul(-9)).mul(0.3));
      return vec4(light.mul(falloff).mul(emissiveExposure), 1);
    })();

    const quad = new THREE.PlaneGeometry(1, 1);
    quad.deleteAttribute('normal');
    const halos = new THREE.InstancedMesh(quad, material, MAX_LIGHTS);
    halos.count = 0;
    halos.layers.set(GLOW_LAYER);
    halos.frustumCulled = false;
    halos.name = 'RunwayLights';
    scene.add(halos);
    this.mesh = halos;
  }

  /**
   * @param {object[]} runways - see Airports.js
   * @param {import('../terrain/GeoTerrainManager.js').default} terrain
   * @param {THREE.PerspectiveCamera} camera
   * @param {number} viewportHeight - pixels
   * @param {number} sunElevation - degrees
   * @param {number} visibility - km
   */
  update(runways, terrain, camera, viewportHeight, sunElevation, visibility) {
    const dusk = THREE.MathUtils.clamp(
      (ON_FROM_ELEVATION - sunElevation) / (ON_FROM_ELEVATION - ON_AT_ELEVATION),
      0,
      1,
    );
    this._level.value = visibility < DAY_VISIBILITY ? 1 : dusk;
    this.mesh.visible = this._level.value > 0;
    this._pixelAngle.value = (2 * Math.tan((camera.fov * Math.PI) / 360)) / Math.max(1, viewportHeight);

    if (this._world.update(runways, terrain)) this._from.set(Infinity, 0, 0);
    if (!this.mesh.visible || this._from.distanceToSquared(camera.position) < RESELECT_DISTANCE ** 2) return;
    this._from.copy(camera.position);
    const lit = ({ runway }) => runway.lighted;
    const near = this._world.nearest(camera.position.x, camera.position.z, MAX_RUNWAYS, LIGHT_DISTANCE, lit);
    let count = 0;
    const add = (placed, s, t, front, frontCd, back, backCd, papiAngle = 0) => {
      if (count >= MAX_LIGHTS) return;
      const { runway, x0, z0, ux, uz, length, k } = placed;
      const [a, b] = runway.ends;
      const share = Math.min(1, Math.max(0, s / length));
      this._position.setXYZ(
        count,
        x0 + (ux * s - uz * t) * k,
        a.elevation + share * (b.elevation - a.elevation) + LIGHT_HEIGHT,
        z0 + (uz * s + ux * t) * k,
      );
      this._axis.setXYZ(count, ux, uz, papiAngle);
      this._front.setXYZW(count, ...(front ?? WHITE), front ? frontCd : 0);
      this._back.setXYZW(count, ...(back ?? WHITE), back ? backCd : 0);
      count++;
    };
    for (const placed of near) layout(placed, add);

    this.mesh.count = count;
    for (const attribute of [this._position, this._axis, this._front, this._back]) {
      attribute.needsUpdate = true;
    }
  }
}
