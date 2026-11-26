import * as THREE from 'three';
import { MeshBasicNodeMaterial, NodeMaterial, QuadMesh, RenderTarget, RendererUtils } from 'three/webgpu';
import {
  Fn,
  If,
  Loop,
  abs,
  cameraPosition,
  float,
  length,
  max,
  mix,
  positionWorld,
  renderGroup,
  screenCoordinate,
  smoothstep,
  texture,
  uniform,
  vec3,
  vec4,
} from 'three/tsl';
import { EARTH_RADIUS } from 'three-tile';
import {
  SUN_ANGULAR_RADIUS,
  TERRAIN_SHADOW_CASCADES,
  TERRAIN_SHADOW_LIGHT_CHANGE,
  TERRAIN_SHADOW_MAX_DISTANCE,
  TERRAIN_SHADOW_MIN_ELEVATION,
  TERRAIN_SHADOW_RECENTRE,
  TERRAIN_SHADOW_STEPS,
} from '../constants/terrain.js';

const R = EARTH_RADIUS;

/** Added to the heights stored in the height maps: a map cleared to 0 reads as no ground */
const HEIGHT_OFFSET = 1e4;

/** Height of the top-down camera above the ground drawn into the height maps (m) */
const CAMERA_HEIGHT = 2e4;

/** Centre of a map not drawn yet: far enough for every point to fall outside it, finite to keep the shaders' arithmetic */
const NOWHERE = 1e9;

const frameUniform = (value) => uniform(value).setGroup(renderGroup);

const _quad = /* @__PURE__ */ new QuadMesh();
const _light = /* @__PURE__ */ new THREE.Vector3();
let _rendererState;

/** One map of the shadows, centred below the camera */
class Cascade {
  constructor({ span, size, refresh, slices }) {
    this.span = span;
    this.size = size;
    this.texel = span / size;
    this.refresh = refresh;
    this.slices = slices;

    const options = { type: THREE.FloatType, magFilter: THREE.LinearFilter, minFilter: THREE.LinearFilter };
    /** Elevation of the ground drawn there (m above sea level, plus HEIGHT_OFFSET) */
    this.heights = new RenderTarget(size, size, { ...options, format: THREE.RedFormat, depthBuffer: true });
    this.heights.texture.name = 'terrain.shadow.heights';
    /**
     * Height below which a point is in the shade, and the distance of the
     * relief that casts it: one map read while the other is marched
     */
    this.shadows = [0, 1].map(() => {
      const target = new RenderTarget(size, size, { ...options, format: THREE.RGFormat, depthBuffer: false });
      target.texture.name = 'terrain.shadow';
      target.scissorTest = true;
      return target;
    });
    this.front = 0;

    /** Centres of the height map and of the shadow map read (world x, z), in doubles */
    this.heightsCentre = new THREE.Vector2(NOWHERE, NOWHERE);
    this.shadowCentre = new THREE.Vector2(NOWHERE, NOWHERE);
    /** The same relative to the camera */
    this.heightsOffset = frameUniform(new THREE.Vector2());
    this.shadowOffset = frameUniform(new THREE.Vector2());
    /** Light of the height map drawn last (world) */
    this.light = new THREE.Vector3();
    /** Time the height map was drawn at (s, see TerrainShadow._clock) */
    this.drawnAt = -Infinity;
    /** Redraw in progress: { heights: still to draw, slice: next slice of the march }, null for none */
    this.pending = null;

    this.camera = new THREE.OrthographicCamera(-span / 2, span / 2, span / 2, -span / 2, 1, CAMERA_HEIGHT * 2);
    // Looking down, north (-z) up: texel (column, row) from the top-left
    // corner is at x and z increasing, as the other maps are read
    this.camera.up.set(0, 0, -1);
  }

  /** Height map coordinates of a point given by its offset from the camera (world x, z) */
  heightsUv(offset) {
    return offset.sub(this.heightsOffset).div(this.span).add(0.5);
  }

  /** Shadow map coordinates of a point given by its offset from the camera (world x, z) */
  shadowUv(offset) {
    return offset.sub(this.shadowOffset).div(this.span).add(0.5);
  }

  dispose() {
    this.heights.dispose();
    for (const target of this.shadows) target.dispose();
  }
}

/**
 * Shadows of the relief on the ground and on whatever receives shadows (the
 * aircraft included), as a factor of the direct light of the sun or the moon.
 *
 * Each map draws the terrain on display from above into a height map (true
 * elevations: the curvature of the Earth around the camera, by which the
 * terrain is lowered, is taken out), then marches every texel toward the light
 * over it and keeps the height below which a point there is in the shade: the
 * highest relief along the way, lowered by the rise of the light ray and the
 * curvature of the Earth over its distance, and that distance, which spreads
 * the edge of the shadow over the sun's disc. A finer map around the camera
 * reads the coarser one beyond its edges. A point that receives shadows only
 * compares its height above sea level with the map's.
 *
 * The maps are redrawn when the camera has moved a fraction of their width,
 * when the light has turned, and, a few seconds apart at most, when the tiles
 * on display have changed since (until they have finished morphing). A redraw
 * is spread over frames: the height map in one, then the march a slice of
 * rows per frame into a second shadow map, read once complete.
 */
export default class TerrainShadow {
  /**
   * @param {import('./GeoTerrainManager.js').default} terrain
   * @param {import('../atmosphere/AtmosphericSky.js').default} sky
   */
  constructor(terrain, sky) {
    this.terrain = terrain;
    this.sky = sky;
    this.cascades = TERRAIN_SHADOW_CASCADES.map((cascade) => new Cascade(cascade));
    /** Direction toward the light (world) of the march being drawn */
    this._light = frameUniform(new THREE.Vector3(0, 1, 0));
    /** 1 while the relief casts shadows, 0 for none */
    this.enabled = frameUniform(1);
    /** Seconds since the start, and when the tiles on display last changed */
    this._clock = 0;
    this._changedAt = 0;
    this._tileChanges = -1;

    this._heightScene = new THREE.Scene();
    this._heightMaterial = new MeshBasicNodeMaterial();
    this._heightMaterial.name = 'terrain.shadow.heights';
    // Height above sea level, the terrain having been lowered around this camera
    this._heightMaterial.outputNode = Fn(() => {
      const offset = positionWorld.xz.sub(cameraPosition.xz);
      const height = length(vec3(offset.x, positionWorld.y.add(R), offset.y)).sub(R);
      return vec4(height.add(HEIGHT_OFFSET), 0, 0, 1);
    })();
    // The tiles pass their transparency on to it: the height map has no alpha to blend with
    this._heightMaterial.blending = THREE.NoBlending;
    this._heightScene.overrideMaterial = this._heightMaterial;

    this._marchMaterials = this.cascades.map((cascade, k) => {
      const material = new NodeMaterial();
      material.name = 'terrain.shadow.march';
      // The output itself: as a color, an opaque material's alpha would be forced to 1
      material.outputNode = this._marchNode(k);
      material.depthTest = material.depthWrite = false;
      return material;
    });

    // Offset of the point shaded from the camera (world x, z)
    this._receiverOffset = positionWorld.xz.sub(cameraPosition.xz);
    /** Shadow maps read by the receivers: one node each, whose texture is switched as the marches complete */
    this._shadowTextures = this.cascades.map((cascade) =>
      texture(cascade.shadows[cascade.front].texture, cascade.shadowUv(this._receiverOffset), 0),
    );
    /** Factor of the direct light where it is evaluated */
    this.node = this._receiverNode();
  }

  /**
   * Cast the shadows of the relief, or not
   * @param {boolean} on
   */
  setEnabled(on) {
    this.enabled.value = on ? 1 : 0;
    // The maps are drawn again from scratch once turned back on
    for (const cascade of this.cascades) {
      cascade.heightsCentre.set(NOWHERE, NOWHERE);
      cascade.shadowCentre.set(NOWHERE, NOWHERE);
      cascade.pending = null;
    }
  }

  /** Elevation of the ground at an offset from the camera, from map k or a coarser one; very low where none */
  _heightAt(offset, k) {
    const height = float(-HEIGHT_OFFSET).toVar();
    for (let i = this.cascades.length - 1; i >= k; i--) {
      const uv = this.cascades[i].heightsUv(offset).toConst();
      const inside = max(abs(uv.x.sub(0.5)), abs(uv.y.sub(0.5))).lessThan(0.5);
      If(inside, () => {
        height.assign(texture(this.cascades[i].heights.texture, uv).level(0).r.sub(HEIGHT_OFFSET));
      });
    }
    return height;
  }

  /** Shadow of map k: march each texel toward the light over the height maps */
  _marchNode(k) {
    const cascade = this.cascades[k];
    const first = cascade.texel * 1.5;
    const ratio = (TERRAIN_SHADOW_MAX_DISTANCE / first) ** (1 / TERRAIN_SHADOW_STEPS);
    return Fn(() => {
      const uv = screenCoordinate.xy.div(cascade.size);
      const origin = uv.sub(0.5).mul(cascade.span).add(cascade.heightsOffset).toConst();
      const light = this._light;
      const across = length(light.xz).toConst();
      const toward = light.xz.div(across).toConst();
      const rise = light.y.div(across).toConst();
      const shade = float(-HEIGHT_OFFSET).toVar();
      const blocker = float(0).toVar();
      const distance = float(first).toVar();
      Loop(TERRAIN_SHADOW_STEPS, () => {
        const ground = this._heightAt(origin.add(toward.mul(distance)), k);
        // Lowest height still in the shade of this relief: below the light ray
        // through its top, which climbs and leaves the curved ground behind
        const below = ground.sub(distance.mul(rise)).sub(distance.mul(distance).div(2 * R));
        If(below.greaterThan(shade), () => {
          shade.assign(below);
          blocker.assign(distance);
        });
        distance.mulAssign(ratio);
      });
      return vec4(shade, blocker, 0, 1);
    })();
  }

  _receiverNode() {
    return Fn(() => {
      const offset = this._receiverOffset;
      // Height above sea level: the terrain is lowered by the curvature of the Earth around the camera
      const height = length(vec3(offset.x, positionWorld.y.add(R), offset.y)).sub(R).toConst();
      // From the coarsest map to the finest, each faded out toward its edges
      const lit = float(1).toVar();
      for (let k = this.cascades.length - 1; k >= 0; k--) {
        const cascade = this.cascades[k];
        const uv = cascade.shadowUv(offset).toConst();
        const shadow = this._shadowTextures[k];
        // The edge spreads over the sun's disc seen from the relief that casts it, a texel at least
        const spread = max(shadow.y.mul(SUN_ANGULAR_RADIUS), cascade.texel);
        const inCascade = smoothstep(shadow.x.sub(spread), shadow.x.add(spread), height);
        const edge = max(abs(uv.x.sub(0.5)), abs(uv.y.sub(0.5))).mul(2);
        lit.assign(mix(lit, inCascade, smoothstep(1, 0.8, edge)));
      }
      return mix(float(1), lit, this.enabled);
    })();
  }

  /**
   * Advance the redraws of the maps. Call once per frame, after the terrain
   * and the light have been updated, before rendering.
   * @param {THREE.WebGPURenderer} renderer
   * @param {THREE.Camera} camera
   * @param {number} delta - seconds since the previous frame
   */
  update(renderer, camera, delta) {
    const tileMap = this.terrain.tileMap;
    if (!tileMap || this.enabled.value === 0) return;

    const light = this.sky.lightDirectionWorld(_light);
    const across = Math.hypot(light.x, light.z) || 1;
    if (light.y < TERRAIN_SHADOW_MIN_ELEVATION * across) {
      const scale = 1 / Math.hypot(1, TERRAIN_SHADOW_MIN_ELEVATION);
      light.set((light.x / across) * scale, TERRAIN_SHADOW_MIN_ELEVATION * scale, (light.z / across) * scale);
    }

    this._clock += delta;
    if (this.terrain.tileChanges !== this._tileChanges) {
      this._tileChanges = this.terrain.tileChanges;
      this._changedAt = this._clock;
    }
    // Tiles shown last are still morphing
    const settled = this._changedAt + tileMap.morphDuration;

    const { x, z } = camera.position;
    let coarserHeights = false;
    for (let k = this.cascades.length - 1; k >= 0; k--) {
      const cascade = this.cascades[k];
      const { heightsCentre } = cascade;
      const moved = Math.hypot(x - heightsCentre.x, z - heightsCentre.y) > cascade.span * TERRAIN_SHADOW_RECENTRE;
      const turned = cascade.light.angleTo(light) > TERRAIN_SHADOW_LIGHT_CHANGE;
      const changed = cascade.drawnAt < settled && this._clock - cascade.drawnAt >= cascade.refresh;
      if (moved || turned || changed) {
        heightsCentre.set(Math.round(x / cascade.texel) * cascade.texel, Math.round(z / cascade.texel) * cascade.texel);
        cascade.light.copy(light);
        cascade.drawnAt = this._clock;
        cascade.pending = { heights: true, slice: 0 };
      } else if (coarserHeights && !cascade.pending) {
        // Its march reads the coarser heights beyond its edges
        cascade.pending = { heights: false, slice: 0 };
      }
      cascade.heightsOffset.value.set(heightsCentre.x - x, heightsCentre.y - z);
      coarserHeights = false;
      if (cascade.pending?.heights) {
        this._drawHeights(renderer, tileMap, cascade);
        cascade.pending.heights = false;
        coarserHeights = true;
      } else if (cascade.pending) {
        this._marchSlice(renderer, k);
      }
      cascade.shadowOffset.value.set(cascade.shadowCentre.x - x, cascade.shadowCentre.y - z);
    }
  }

  /** Draw the terrain on display from above into the height map */
  _drawHeights(renderer, tileMap, cascade) {
    const { heightsCentre, camera } = cascade;
    camera.position.set(heightsCentre.x, CAMERA_HEIGHT, heightsCentre.y);
    camera.lookAt(heightsCentre.x, 0, heightsCentre.y);
    camera.updateMatrixWorld();

    const parent = tileMap.parent;
    this._heightScene.add(tileMap);
    _rendererState = RendererUtils.resetRendererState(renderer, _rendererState);
    renderer.setClearColor(0x000000, 0);
    renderer.setRenderTarget(cascade.heights);
    renderer.render(this._heightScene, camera);
    RendererUtils.restoreRendererState(renderer, _rendererState);
    parent?.add(tileMap);
  }

  /** March the next slice of rows of map k into its back shadow map; once complete, read it */
  _marchSlice(renderer, k) {
    const cascade = this.cascades[k];
    const { pending, size, slices } = cascade;
    const back = cascade.shadows[1 - cascade.front];
    const rows = Math.ceil(size / slices);
    back.scissor.set(0, pending.slice * rows, size, Math.min(rows, size - pending.slice * rows));

    this._light.value.copy(cascade.light);
    _rendererState = RendererUtils.resetRendererState(renderer, _rendererState);
    // The other rows keep what the previous slices drew
    renderer.autoClear = false;
    renderer.setRenderTarget(back);
    _quad.material = this._marchMaterials[k];
    _quad.name = 'terrain.shadow.march';
    _quad.render(renderer);
    RendererUtils.restoreRendererState(renderer, _rendererState);

    if (++pending.slice < slices) return;
    cascade.front = 1 - cascade.front;
    this._shadowTextures[k].value = back.texture;
    cascade.shadowCentre.copy(cascade.heightsCentre);
    cascade.pending = null;
  }

  dispose() {
    for (const cascade of this.cascades) cascade.dispose();
    this._heightMaterial.dispose();
    for (const material of this._marchMaterials) material.dispose();
  }
}
