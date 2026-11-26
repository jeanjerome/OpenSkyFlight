import * as THREE from 'three';
import { HalfFloatType, NodeMaterial, QuadMesh, RenderTarget, RendererUtils } from 'three/webgpu';
import {
  Fn,
  If,
  abs,
  cameraPosition,
  exp,
  float,
  length,
  max,
  mix,
  positionWorld,
  renderGroup,
  saturate,
  screenCoordinate,
  smoothstep,
  texture,
  select,
  uniform,
  vec3,
  vec4,
} from 'three/tsl';
import { EARTH_RADIUS } from 'three-tile';
import {
  CLOUD_LAYERS,
  CLOUD_SHADOW_CIRRUS_STEPS,
  CLOUD_SHADOW_MIN_SUN,
  CLOUD_SHADOW_REFRESH,
  CLOUD_SHADOW_SIZE,
  CLOUD_SHADOW_SPAN,
  CLOUD_SHADOW_STEPS,
} from '../constants/clouds.js';

const R = EARTH_RADIUS;
const TEXEL = CLOUD_SHADOW_SPAN / CLOUD_SHADOW_SIZE;

/** Densities of the weather map below this are taken as clear sky */
const MIN_DENSITY = 1e-5;

const frameUniform = (value) => uniform(value).setGroup(renderGroup);

const _quad = /* @__PURE__ */ new QuadMesh();
const _toWorld = /* @__PURE__ */ new THREE.Matrix4();
let _rendererState;

/**
 * Shadows of the volumetric clouds on the ground (and whatever receives
 * shadows), as a factor of the direct light of the sun or the moon.
 *
 * Every few frames a map centred below the camera, snapped to its texels so
 * that its samples stay put on the ground, marches the ray toward the light that
 * crosses the base of the cumulus above each texel, through the layers, and
 * keeps the optical depth of the clouds above four heights along it: the base,
 * a third and two thirds of the way to the top of the mid-level clouds, and
 * that top (above it only the cirrus remain). A point that receives shadows is
 * projected along the light onto the base to read its ray, and the depth is
 * interpolated at its height, so that a summit rising into the layer is not
 * shaded by the clouds below it. The shape noise erodes the clouds as in their
 * own march, without the detail noise.
 */
export default class CloudShadow {
  /** @param {import('./VolumetricClouds.js').default} clouds */
  constructor(clouds) {
    this.clouds = clouds;
    this.target = new RenderTarget(CLOUD_SHADOW_SIZE, CLOUD_SHADOW_SIZE, { depthBuffer: false, type: HalfFloatType });
    this.target.texture.name = 'clouds.shadow';
    this.target.texture.minFilter = this.target.texture.magFilter = THREE.LinearFilter;

    /** Centre of the map relative to the camera (world x, z) */
    this._centre = frameUniform(new THREE.Vector2());
    /** Direction toward the light (world), its elevation clamped */
    this._light = frameUniform(new THREE.Vector3(0, 1, 0));
    /** Heights the optical depth is kept above (m): base of the cumulus to top of the mid-level clouds */
    this._heights = frameUniform(new THREE.Vector4());
    this._cirrusBottom = frameUniform(0);
    this._cirrusTop = frameUniform(0);
    /** 1 while the clouds cast shadows, 0 for none */
    this.enabled = frameUniform(0);
    /** Centre of the map drawn last (world x, z), in doubles */
    this._mapCentre = new THREE.Vector2();
    this._renders = 0;

    this._material = new NodeMaterial();
    this._material.name = 'clouds.shadow';
    // The output itself: as a color, an opaque material's alpha would be forced to 1
    this._material.outputNode = this._mapNode();
    this._material.depthTest = this._material.depthWrite = false;

    /** Factor of the direct light where it is evaluated (see receiverNode) */
    this.node = this._receiverNode();
  }

  /** @param {number} base - base of the cumulus (m above sea level) */
  setBase(base) {
    const top = base + Math.max(CLOUD_LAYERS[0].base + CLOUD_LAYERS[0].thickness, CLOUD_LAYERS[1].base + CLOUD_LAYERS[1].thickness);
    this._heights.value.set(base, base + (top - base) / 3, base + ((top - base) * 2) / 3, top);
    const cirrus = CLOUD_LAYERS[2];
    // The cirrus above the mid-level clouds' top only (lower, the march through the thirds covers them)
    this._cirrusBottom.value = Math.max(cirrus.altitude, top);
    this._cirrusTop.value = Math.max(cirrus.altitude + cirrus.thickness, top);
  }

  /** Optical depth of the clouds along the light from a point of a ray, between two heights */
  _segment(origin, light, from, to, steps) {
    const length = to.sub(from).div(light.y).toConst();
    const step = length.div(steps).toConst();
    let depth = float(0);
    for (let i = 0; i < steps; i++) {
      const s = from.sub(this._heights.x).div(light.y).add(step.mul(i + 0.5));
      const height = this._heights.x.add(light.y.mul(s));
      const position = vec3(origin.x.add(light.x.mul(s)), 0, origin.y.add(light.z.mul(s)));
      const weather = this.clouds._weather(position, height);
      // The shape noise only where the weather map forms clouds
      const extinction = float(0).toVar();
      If(weather.density.greaterThan(vec4(MIN_DENSITY)).any(), () => {
        extinction.assign(this.clouds._media(weather, position, height, null).extinction);
      });
      depth = depth.add(extinction.mul(step));
    }
    return depth.toConst();
  }

  _mapNode() {
    return Fn(() => {
      // Where this texel's ray crosses the base of the cumulus, relative to the camera
      const uv = screenCoordinate.xy.div(CLOUD_SHADOW_SIZE);
      const origin = uv.sub(0.5).mul(CLOUD_SHADOW_SPAN).add(this._centre).toConst();
      const light = this._light;
      const h = this._heights;
      const cirrus = this._segment(origin, light, this._cirrusBottom, this._cirrusTop, CLOUD_SHADOW_CIRRUS_STEPS);
      const third3 = this._segment(origin, light, h.z, h.w, CLOUD_SHADOW_STEPS);
      const third2 = this._segment(origin, light, h.y, h.z, CLOUD_SHADOW_STEPS);
      const third1 = this._segment(origin, light, h.x, h.y, CLOUD_SHADOW_STEPS);
      const above3 = cirrus;
      const above2 = above3.add(third3);
      const above1 = above2.add(third2);
      return vec4(above1.add(third1), above1, above2, above3);
    })();
  }

  _receiverNode() {
    return Fn(() => {
      const offset = positionWorld.xz.sub(cameraPosition.xz).toConst();
      // Height above sea level: the terrain is lowered by the curvature of the Earth around the camera
      const height = length(vec3(offset.x, positionWorld.y.add(R), offset.y)).sub(R).toConst();
      return exp(this.opticalDepth(offset, height).negate());
    })();
  }

  /**
   * Optical depth of the clouds between a point and the light, faded out
   * toward the edges of the map
   * @param {Node} offset - vec2, horizontal offset of the point from the camera (world x, z, m)
   * @param {Node} height - above sea level (m)
   */
  opticalDepth(offset, height) {
    return Fn(() => {
      const light = this._light;
      const h = this._heights;
      const onBase = offset.add(light.xz.mul(h.x.sub(height).div(light.y)));
      const uv = onBase.sub(this._centre).div(CLOUD_SHADOW_SPAN).add(0.5).toConst();
      const depths = texture(this.target.texture, uv).level(0);
      // Depth above this point, between the heights the map keeps
      const f = height.sub(h.x).div(h.w.sub(h.x)).mul(3).toConst();
      const depth = mix(mix(mix(depths.x, depths.y, saturate(f)), depths.z, saturate(f.sub(1))), depths.w, saturate(f.sub(2)));
      // Above the cirrus nothing is left; toward the edges of the map the shadows fade out
      const above = select(height.greaterThan(this._cirrusTop), float(0), float(1));
      const edge = max(abs(uv.x.sub(0.5)), abs(uv.y.sub(0.5))).mul(2);
      const fade = smoothstep(1, 0.8, edge).mul(above).mul(this.enabled);
      return depth.mul(fade);
    })();
  }

  /**
   * Before each render of the scene: place the map relative to the camera,
   * and redraw it every CLOUD_SHADOW_REFRESH renders
   * @param {THREE.WebGPURenderer} renderer
   */
  render(renderer) {
    const { camera, sky } = this.clouds;
    const { x, z } = camera.position;
    const redraw = this._renders++ % CLOUD_SHADOW_REFRESH === 0;
    if (redraw) this._mapCentre.set(Math.round(x / TEXEL) * TEXEL, Math.round(z / TEXEL) * TEXEL);
    this._centre.value.set(this._mapCentre.x - x, this._mapCentre.y - z);
    if (!redraw) return;

    _toWorld.copy(sky.atmosphere.matrixWorldToECEF.value).invert();
    const light = this._light.value.copy(sky.lightDirectionECEF.value).transformDirection(_toWorld);
    if (light.y < CLOUD_SHADOW_MIN_SUN) {
      const horizontal = Math.hypot(light.x, light.z) || 1;
      const scale = Math.sqrt(1 - CLOUD_SHADOW_MIN_SUN ** 2) / horizontal;
      light.set(light.x * scale, CLOUD_SHADOW_MIN_SUN, light.z * scale);
    }

    _rendererState = RendererUtils.resetRendererState(renderer, _rendererState);
    renderer.setRenderTarget(this.target);
    _quad.material = this._material;
    _quad.name = 'clouds.shadow';
    _quad.render(renderer);
    RendererUtils.restoreRendererState(renderer, _rendererState);
  }

  dispose() {
    this.target.dispose();
    this._material.dispose();
  }
}
