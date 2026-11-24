import * as THREE from 'three';
import {
  Fn,
  If,
  exp,
  float,
  floor,
  fract,
  fwidth,
  hash,
  mix,
  mx_noise_float,
  positionWorld,
  renderGroup,
  smoothstep,
  step,
  texture,
  uint,
  uniform,
  vec2,
  vec3,
} from 'three/tsl';
import { CONFIG } from '../utils/config.js';
import Logger from '../utils/Logger.js';
import {
  CITY_LIGHTS_ADAPTATION_FLOOR,
  CITY_LIGHTS_ADAPTATION_MAX_RADIUS,
  CITY_LIGHTS_ADAPTATION_MIN_RADIUS,
  CITY_LIGHTS_ADAPTATION_RADIUS,
  CITY_LIGHTS_ADAPTATION_SPEED_TO_BRIGHT,
  CITY_LIGHTS_ADAPTATION_SPEED_TO_DARK,
  CITY_LIGHTS_COLOR,
  CITY_LIGHTS_LUMINANCE,
  CITY_LIGHTS_OFF_ELEVATION,
  CITY_LIGHTS_ON_ELEVATION,
  CITY_LIGHTS_REGION_TILES,
  CITY_LIGHTS_ZOOM,
  SCENE_UNIT_LUMINANCE,
} from '../constants/rendering.js';

const TILE_SIZE = 256;

/** Ground lights: one possible light per cell of this size (m), a spot of this radius (m) */
const LIGHT_CELL = 30;
const LIGHT_RADIUS = 3;

/** Scale of the noise that gathers countryside lights into hamlets (m), and the share of land it covers */
const HAMLET_SIZE = 180;
const HAMLET_SHARE = 0.33;

/** Share of a cell's light spilled evenly over the ground around it */
const LIGHT_SPILL = 0.05;

/** Share of the cell the spot covers: the spot's mean over a cell */
const SPOT_COVERAGE = (Math.PI * LIGHT_RADIUS ** 2) / LIGHT_CELL ** 2;
const REGION_SIZE = CITY_LIGHTS_REGION_TILES * TILE_SIZE;

/** Samples across the area whose mean light the eye adapts to (see _updateViewLuminance) */
const ADAPTATION_GRID = 9;

/** Lit share of the ground from the stored value (square root of the intensity), as the shader's contrast */
function densityOf(stored) {
  return Math.max(0, (stored * stored - 0.04) / 0.96) ** 2;
}

/** Seconds between texture uploads while the tiles of a region arrive */
const UPLOAD_INTERVAL = 0.3;

/** Web Mercator tile coordinates (fractional) of a place */
function lonLatToTile(lon, lat, zoom) {
  const n = 2 ** zoom;
  const latRad = (lat * Math.PI) / 180;
  return {
    x: ((lon + 180) / 360) * n,
    y: ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n,
  };
}

/** Longitude and latitude of a tile corner */
function tileToLonLat(x, y, zoom) {
  const n = 2 ** zoom;
  return {
    lon: (x / n) * 360 - 180,
    lat: (Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / n))) * 180) / Math.PI,
  };
}

/**
 * Binomial 5 × 5 blur of a tile, in place through a scratch buffer (edges
 * clamped): the images come in blocks of about 450 m that bilinear filtering
 * leaves visible on the ground.
 * @param {Float32Array} values - TILE_SIZE² values, blurred in place
 * @param {Float32Array} scratch
 * @returns {Float32Array} values
 */
function blur(values, scratch) {
  const w = [1 / 16, 4 / 16, 6 / 16, 4 / 16, 1 / 16];
  const last = TILE_SIZE - 1;
  const pass = (from, to, step) => {
    for (let a = 0; a < TILE_SIZE; a++) {
      for (let b = 0; b < TILE_SIZE; b++) {
        let sum = 0;
        for (let t = -2; t <= 2; t++) {
          const c = Math.min(last, Math.max(0, b + t));
          sum += w[t + 2] * from[step === 1 ? a * TILE_SIZE + c : c * TILE_SIZE + a];
        }
        to[step === 1 ? a * TILE_SIZE + b : b * TILE_SIZE + a] = sum;
      }
    }
  };
  pass(values, scratch, 1);
  pass(scratch, values, TILE_SIZE);
  return values;
}

/**
 * Intensity of the artificial lights in a Black Marble pixel (sRGB, 0–255),
 * from 0 to 1. The images also show the moonlit ground, bluish, and seas in
 * black: lights are the warm part of the image, and its white cores.
 */
function lightIntensity(r, g, b) {
  const luminance = 0.2126 * (r / 255) ** 2.2 + 0.7152 * (g / 255) ** 2.2 + 0.0722 * (b / 255) ** 2.2;
  const warmth = Math.min(1, Math.max(0, ((r - b) / Math.max(r, 12)) * 2.5));
  const core = Math.min(1, Math.max(0, (Math.min(r, g, b) - 190) / 50));
  return luminance * Math.max(warmth, core);
}

/**
 * Lights of towns and roads at night, from NASA's Black Marble (VIIRS, 2016,
 * about 450 m per pixel in the Alps) through the tile proxy, as an emissive
 * term of the terrain material.
 *
 * The tiles of a square region around the camera are assembled into one
 * texture, which a single node shared by every terrain tile reads at the
 * fragment's world position: a texture sample per fragment and no material
 * of its own, so no extra draw call and no compilation per tile. The region is
 * moved when the camera nears its edge. Lights come on as the sun sets
 * (CITY_LIGHTS_OFF_ELEVATION to CITY_LIGHTS_ON_ELEVATION) and take the
 * scene's night exposure.
 */
export default class CityLights {
  /**
   * @param {import('./GeoTerrainManager.js').default} terrain
   * @param {Node} exposure - night exposure of the scene (AtmosphericSky.preExposure): lit ground
   *   is an extended source of a few cd/m², which does not glare like a lamp seen directly
   */
  constructor(terrain, exposure) {
    this.terrain = terrain;

    this._data = new Uint8Array(REGION_SIZE * REGION_SIZE);
    this.texture = new THREE.DataTexture(this._data, REGION_SIZE, REGION_SIZE, THREE.RedFormat);
    this.texture.minFilter = THREE.LinearMipmapLinearFilter;
    this.texture.magFilter = THREE.LinearFilter;
    this.texture.generateMipmaps = true;
    this.texture.colorSpace = THREE.NoColorSpace;
    this.texture.needsUpdate = true;

    // World position of the region's north-west corner and its size (x east, z south)
    this._origin = uniform(new THREE.Vector2()).setGroup(renderGroup);
    this._size = uniform(new THREE.Vector2(1, 1)).setGroup(renderGroup);
    this._level = uniform(0).setGroup(renderGroup);

    this._region = null;
    this._tileMap = null;
    this._dirty = false;
    this._sinceUpload = 0;
    this._generation = 0;
    this._intensity = new Float32Array(TILE_SIZE * TILE_SIZE);
    this._blurred = new Float32Array(TILE_SIZE * TILE_SIZE);
    this._canvas = new OffscreenCanvas(TILE_SIZE, TILE_SIZE);
    this._context = this._canvas.getContext('2d', { willReadFrequently: true });

    this.node = this._buildNode(exposure);

    /** Mean luminance (cd/m²) of the lit ground the camera overlooks, as the eye adapts to it */
    this.viewLuminance = 0;
    this._forward = new THREE.Vector3();
  }

  /**
   * The satellite image gives the mean light of 450 m squares. Up close it is
   * broken into lights: each LIGHT_CELL cell may hold a spot (a street lamp, a
   * lit building), lit with a probability that follows the local density, of
   * random brightness, scaled so that the mean over the area stays the
   * image's. Where a spot gets smaller than a pixel, the pattern gives way to
   * its mean, so that distant towns do not shimmer.
   */
  _buildNode(exposure) {
    return Fn(() => {
      const light = vec3(0).toVar();
      // By day the whole term is skipped (a branch on a uniform)
      If(this._level.greaterThan(0), () => {
        const world = positionWorld.xz;
        const st = world.sub(this._origin).div(this._size);
        const inside = step(0, st.x).mul(step(st.x, 1)).mul(step(0, st.y)).mul(step(st.y, 1));
        // Stored as the square root of the intensity, for 8-bit precision in dim areas
        const stored = texture(this.texture, st).r;
        // Contrast: the sensor's background goes, town centres stand out and
        // the glow the image spreads around them fades
        // (densityOf on the CPU)
        const density = stored.mul(stored).sub(0.04).max(0).div(0.96).pow2().toVar();

        // Towns are lit everywhere; elsewhere lights gather in hamlets, where a
        // coarser noise is high
        const urban = density.mul(3).min(1);
        const hamlets = smoothstep(
          0.5,
          0.65,
          mx_noise_float(vec3(world.div(HAMLET_SIZE), 0))
            .mul(0.5)
            .add(0.5),
        );
        const probability = urban.mul(mix(hamlets, float(1), urban.pow2()));

        const p = world.div(LIGHT_CELL);
        const cell = floor(p).add(1 << 20);
        const seed = uint(cell.x)
          .mul(uint(73856093))
          .bitXor(uint(cell.y).mul(uint(19349663)));
        const spotAt = vec2(hash(seed), hash(seed.add(uint(1))))
          .mul(0.9)
          .add(0.05);
        const distance = fract(p).sub(spotAt).length().mul(LIGHT_CELL);
        const lit = step(hash(seed.add(uint(2))), probability);
        const brightness = hash(seed.add(uint(3)))
          .pow2()
          .mul(1.5)
          .add(0.25);
        const spot = exp(distance.div(LIGHT_RADIUS).pow2().negate()).mul(lit).mul(brightness);
        // Mean of `spot` over the area (a third of the countryside in hamlets,
        // mean brightness 0.75), to keep the area's light whatever the pattern
        const mean = urban
          .mul(mix(float(HAMLET_SHARE), float(1), urban.pow2()))
          .mul(0.75 * SPOT_COVERAGE)
          .max(1e-4);
        const pixel = fwidth(world).length();
        const detail = smoothstep(LIGHT_RADIUS * 0.5, LIGHT_RADIUS * 2, pixel).oneMinus();
        const pattern = mix(float(1), spot.div(mean), detail);
        // Sodium lamps and whiter LED lamps
        const lampColor = mix(vec3(...CITY_LIGHTS_COLOR), vec3(1, 0.85, 0.65), step(0.6, hash(seed.add(uint(4)))));
        const color = mix(vec3(...CITY_LIGHTS_COLOR), lampColor, detail);

        light.assign(
          color
            .mul(density.mul(pattern.mul(1 - LIGHT_SPILL).add(LIGHT_SPILL)))
            .mul(inside)
            .mul(this._level)
            .mul(CITY_LIGHTS_LUMINANCE)
            .mul(exposure),
        );
      });
      return light;
    })();
  }

  /**
   * @param {THREE.Camera} camera
   * @param {number} groundElevation - elevation of the ground below the camera (m)
   * @param {number} sunElevation - degrees
   * @param {number} dt - seconds
   */
  update(camera, groundElevation, sunElevation, dt) {
    const cameraPosition = camera.position;
    const dusk = (CITY_LIGHTS_OFF_ELEVATION - sunElevation) / (CITY_LIGHTS_OFF_ELEVATION - CITY_LIGHTS_ON_ELEVATION);
    this._level.value = CONFIG.textureMode === 'sar' ? 0 : THREE.MathUtils.smoothstep(dusk, 0, 1);

    const geo = this.terrain.worldToGeo(cameraPosition.x, cameraPosition.z);
    if (geo) {
      const tile = lonLatToTile(geo.lon, geo.lat, CITY_LIGHTS_ZOOM);
      const half = CITY_LIGHTS_REGION_TILES / 2;
      const region = this._region;
      if (
        !region ||
        Math.abs(tile.x - (region.x + half)) > half / 2 ||
        Math.abs(tile.y - (region.y + half)) > half / 2
      ) {
        this._loadRegion(Math.round(tile.x - half), Math.round(tile.y - half));
      }
    }
    // The world origin moves when the terrain is rebuilt around a new place
    if (this._region && this.terrain.tileMap !== this._tileMap) this._placeRegion();

    this._updateViewLuminance(camera, groundElevation, dt);

    this._sinceUpload += dt;
    if (this._dirty && this._sinceUpload >= UPLOAD_INTERVAL) {
      this.texture.needsUpdate = true;
      this._dirty = false;
      this._sinceUpload = 0;
    }
  }

  /**
   * Mean luminance of the lit ground over a disc ahead of the camera, whose
   * radius grows with the height above the ground (the area in view), from
   * the region's image: over a town at low altitude the lights fill the view
   * and the eye adapts to them, from high above they are a small part of it.
   * The eye adapts to the logarithmic mean of the luminances in view, over
   * the light of the unlit ground (CITY_LIGHTS_ADAPTATION_FLOOR), so that a
   * town only counts once it fills much of the view.
   * It follows the view at the eye's pace, faster toward light.
   */
  _updateViewLuminance(camera, groundElevation, dt) {
    let target = 0;
    const size = this._size.value;
    if (this._region && this._level.value > 0 && size.x !== 0 && size.y !== 0) {
      const height = Math.max(0, camera.position.y - groundElevation);
      const radius = THREE.MathUtils.clamp(
        height * CITY_LIGHTS_ADAPTATION_RADIUS,
        CITY_LIGHTS_ADAPTATION_MIN_RADIUS,
        CITY_LIGHTS_ADAPTATION_FLOOR,
  CITY_LIGHTS_ADAPTATION_MAX_RADIUS,
      );
      const forward = camera.getWorldDirection(this._forward).setY(0);
      if (forward.lengthSq() > 1e-6) forward.normalize();
      const cx = camera.position.x + forward.x * radius * 0.5;
      const cz = camera.position.z + forward.z * radius * 0.5;
      const origin = this._origin.value;
      let sum = 0;
      let count = 0;
      for (let j = 0; j < ADAPTATION_GRID; j++) {
        for (let i = 0; i < ADAPTATION_GRID; i++) {
          const u = ((i + 0.5) / ADAPTATION_GRID) * 2 - 1;
          const v = ((j + 0.5) / ADAPTATION_GRID) * 2 - 1;
          if (u * u + v * v > 1) continue;
          const s = (cx + u * radius - origin.x) / size.x;
          const t = (cz + v * radius - origin.y) / size.y;
          count++;
          let luminance = 0;
          if (s >= 0 && s < 1 && t >= 0 && t < 1) {
            const stored = this._data[Math.floor(t * REGION_SIZE) * REGION_SIZE + Math.floor(s * REGION_SIZE)] / 255;
            luminance = densityOf(stored) * CITY_LIGHTS_LUMINANCE * SCENE_UNIT_LUMINANCE * this._level.value;
          }
          sum += Math.log2(luminance + CITY_LIGHTS_ADAPTATION_FLOOR);
        }
      }
      target = Math.max(0, 2 ** (sum / count) - CITY_LIGHTS_ADAPTATION_FLOOR);
    }
    // In stops, from a floor far below any lit town
    const floor = 1e-4;
    const current = Math.log2(this.viewLuminance + floor);
    const goal = Math.log2(target + floor);
    const speed = goal > current ? CITY_LIGHTS_ADAPTATION_SPEED_TO_BRIGHT : CITY_LIGHTS_ADAPTATION_SPEED_TO_DARK;
    const step = Math.sign(goal - current) * Math.min(Math.abs(goal - current), speed * dt);
    this.viewLuminance = Math.max(0, 2 ** (current + step) - floor);
  }

  /** World bounds of the region, from its corners */
  _placeRegion() {
    const { x, y } = this._region;
    const nw = tileToLonLat(x, y, CITY_LIGHTS_ZOOM);
    const se = tileToLonLat(x + CITY_LIGHTS_REGION_TILES, y + CITY_LIGHTS_REGION_TILES, CITY_LIGHTS_ZOOM);
    const a = this.terrain.geoToWorld(nw.lat, nw.lon, 0);
    const b = this.terrain.geoToWorld(se.lat, se.lon, 0);
    if (!a || !b) return;
    this._tileMap = this.terrain.tileMap;
    this._origin.value.set(a.x, a.z);
    this._size.value.set(b.x - a.x, b.z - a.z);
  }

  _loadRegion(x0, y0) {
    const generation = ++this._generation;
    this._region = { x: x0, y: y0 };
    this._data.fill(0);
    this._dirty = true;
    this._placeRegion();
    const n = 2 ** CITY_LIGHTS_ZOOM;
    for (let j = 0; j < CITY_LIGHTS_REGION_TILES; j++) {
      for (let i = 0; i < CITY_LIGHTS_REGION_TILES; i++) {
        const x = (((x0 + i) % n) + n) % n;
        const y = y0 + j;
        if (y < 0 || y >= n) continue;
        this._loadTile(generation, i, j, `/tiles/nightlights/${CITY_LIGHTS_ZOOM}/${x}/${y}.png`);
      }
    }
  }

  async _loadTile(generation, i, j, url) {
    try {
      const response = await fetch(url);
      if (!response.ok) return;
      const bitmap = await createImageBitmap(await response.blob());
      if (generation !== this._generation) return;
      this._context.clearRect(0, 0, TILE_SIZE, TILE_SIZE);
      this._context.drawImage(bitmap, 0, 0, TILE_SIZE, TILE_SIZE);
      bitmap.close();
      const pixels = this._context.getImageData(0, 0, TILE_SIZE, TILE_SIZE).data;
      const intensity = this._intensity;
      for (let k = 0; k < TILE_SIZE * TILE_SIZE; k++) {
        intensity[k] = lightIntensity(pixels[4 * k], pixels[4 * k + 1], pixels[4 * k + 2]);
      }
      const smooth = blur(intensity, this._blurred);
      for (let py = 0; py < TILE_SIZE; py++) {
        const row = (j * TILE_SIZE + py) * REGION_SIZE + i * TILE_SIZE;
        for (let px = 0; px < TILE_SIZE; px++) {
          this._data[row + px] = Math.round(Math.sqrt(smooth[py * TILE_SIZE + px]) * 255);
        }
      }
      this._dirty = true;
    } catch (error) {
      Logger.debug('CityLights', `Night lights tile not loaded: ${url} (${error.message})`);
    }
  }
}
