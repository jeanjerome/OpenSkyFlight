import { Fn, float, vec2, vec3, uv, positionWorld, fract, smoothstep, mix, min, max, sin, step, clamp, fwidth } from 'three/tsl';
import * as THREE from 'three';
import { TileMap, TileSource, applyTerrariumElevation } from 'three-tile';
import { CONFIG, onChange } from '../utils/config.js';
import ElevationProvider from '../geo/ElevationProvider.js';

// Web Mercator constants (WGS84)
const EARTH_RAD = 6378137;

/**
 * Convert lat/lon to Mercator coordinates (same as three-tile's ProjMCT).
 */
function latLonToMercator(lat, lon) {
  const lonRad = lon * (Math.PI / 180);
  const latRad = lat * (Math.PI / 180);
  const x = EARTH_RAD * lonRad;
  const y = EARTH_RAD * Math.log(Math.tan(Math.PI / 4 + latRad / 2));
  return { x, y };
}


export default class GeoTerrainManager {
  static _isSynthetic(mode) {
    return mode === 'sar' || mode === 'elevation';
  }

  constructor(scene, renderer) {
    this.scene = scene;
    this.renderer = renderer;
    this.tileMap = null;
    /** @deprecated Alias for backwards compat — use tileMap */
    this.mapView = null;
    this.elevationProvider = new ElevationProvider();
    this._effectiveViewDistance = 0;
    this._centerMercator = null; // {x, y} Mercator coords of center lat/lon
    this._wireframeMode = GeoTerrainManager._isSynthetic(CONFIG.textureMode);
    this._debugMode = false;
    this._wireframedMeshes = new WeakSet();
    this._syntheticNodes = {};

    onChange((key, value) => {
      if (key === 'textureMode') {
        const newWireframe = GeoTerrainManager._isSynthetic(value);
        if (newWireframe !== this._wireframeMode) {
          this._wireframeMode = newWireframe;
          if (newWireframe) {
            this._applyWireframeToggle();
          } else {
            this.reinit();
          }
        } else if (newWireframe) {
          this._wireframedMeshes = new WeakSet();
          this._enforceWireframe();
        } else {
          this.reinit();
        }
      }
    });
  }

  init(lat, lon) {
    // Keep old tileMap visible during transition (avoid black screen)
    const oldTileMap = this.tileMap;
    this.tileMap = null;
    this.mapView = null;

    const effectiveZoom = CONFIG.hiResMode ? 18 : 15;

    // Image source — satellite or OSM tiles
    const imgSource = new TileSource({
      url: CONFIG.textureMode === 'osm'
        ? '/tiles/osm/{z}/{x}/{y}.png'
        : '/tiles/satellite/{z}/{x}/{y}.png',
      dataType: 'image',
      minLevel: 0,
      maxLevel: effectiveZoom,
    });

    // DEM source — Terrarium PNG tiles, GPU-decoded via TSL
    const demSource = new TileSource({
      url: '/tiles/terrarium/{z}/{x}/{y}.png',
      dataType: 'terrarium-shader',
      minLevel: 0,
      maxLevel: 15, // AWS Terrarium caps at zoom 15
    });

    // Debug source — draws tile z/x/y coordinates on a colored grid
    const source = this._debugMode
      ? new TileSource({
          url: '',
          dataType: 'debug',
          minLevel: 0,
          maxLevel: effectiveZoom,
        })
      : imgSource;

    // Create TileMap
    this.tileMap = new TileMap({
      imgSource: source,
      demSource,
      minLevel: 2,
      maxLevel: effectiveZoom,
    });
    this.mapView = this.tileMap; // Alias for backwards compat

    // Z-up → Y-up (matches Three.js convention)
    this.tileMap.rotateX(-Math.PI / 2);

    // LOD tuning
    this.tileMap.LODThreshold = 1.2;

    // Center the map so that (lat, lon) is at world origin
    this._centerMercator = latLonToMercator(lat, lon);
    // Ensure world matrix is updated after rotateX before computing world position
    this.tileMap.updateMatrixWorld(true);
    const worldPos = this.tileMap.geo2world(new THREE.Vector3(lon, lat, 0));
    this.tileMap.position.sub(worldPos);
    this.tileMap.updateMatrixWorld(true);

    // Hook into tile-loaded events to apply TSL elevation
    this.tileMap.addEventListener('tile-loaded', (event) => {
      this._onTileLoaded(event.tile);
    });

    this.scene.add(this.tileMap);

    this._wireframedMeshes = new WeakSet();
    if (this._wireframeMode) this._enforceWireframe();

    // Store old tileMap for deferred cleanup
    if (this._oldTileMap) {
      this._disposeTileMap(this._oldTileMap);
    }
    this._oldTileMap = oldTileMap;

    this._effectiveViewDistance = 1e6;
  }

  /**
   * Called when a tile finishes loading. Apply TSL positionNode for GPU elevation.
   */
  _onTileLoaded(tile) {
    if (!tile || !tile.model) return;
    const mesh = tile.model;
    if (!mesh.geometry || !mesh.geometry.userData.heightTexture) return;

    const heightTex = mesh.geometry.userData.heightTexture;
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];

    // Disable frustum culling — the CPU bounding box is flat (Z=0) but the GPU
    // positionNode displaces vertices by up to thousands of metres. Without this,
    // Three.js culls tiles whose flat bbox is outside the frustum even though their
    // displaced geometry is visible on screen.
    mesh.frustumCulled = false;

    for (const mat of materials) {
      // Skip background material (shared singleton) and already-processed materials
      if (mat._terrariumApplied) continue;
      // Only apply to MeshStandardNodeMaterial (TileMaterial clones), not MeshBasicNodeMaterial
      if (!mat.isMeshStandardNodeMaterial) continue;
      applyTerrariumElevation(mat, heightTex);
      mat._terrariumApplied = true;
      mat.needsUpdate = true;
    }

    // Also apply synthetic colorNode if in wireframe mode
    if (this._wireframeMode) {
      this._applyWireframeToMesh(mesh);
    }
  }

  update(_cameraPosition) {
    if (!this.tileMap) return;

    // Transition: remove old terrain once new one has visible tiles
    if (this._oldTileMap && this._hasVisibleTiles(this.tileMap)) {
      this._disposeTileMap(this._oldTileMap);
      this._oldTileMap = null;
    }

    if (this._wireframeMode) this._enforceWireframe();
  }

  _hasVisibleTiles(tileMap) {
    let found = false;
    tileMap.traverse((child) => {
      if (found) return;
      if (child.isMesh && child.visible && child !== tileMap) found = true;
    });
    return found;
  }

  _disposeTileMap(target) {
    this.scene.remove(target);
    target.dispose();
  }

  _createRadarNode() {
    return Fn(() => {
      const uvScaled = uv().mul(float(512.0));
      const h = fract(sin(uvScaled.dot(vec2(12.9898, 78.233))).mul(43758.5453));
      const speckle = mix(float(0.4), float(0.65), h);
      return vec3(speckle, speckle, speckle);
    })();
  }

  _createLinesNode() {
    return Fn(() => {
      const elev = positionWorld.y;

      const t = clamp(elev.div(float(4000.0)), 0.0, 1.0);

      const c0 = vec3(0.02, 0.18, 0.08);
      const c1 = vec3(0.12, 0.30, 0.05);
      const c2 = vec3(0.35, 0.30, 0.10);
      const c3 = vec3(0.55, 0.50, 0.45);
      const c4 = vec3(0.85, 0.85, 0.90);

      const t1 = clamp(t.mul(float(8.0)), 0.0, 1.0);
      const t2 = clamp(t.sub(float(0.125)).mul(float(2.667)), 0.0, 1.0);
      const t3 = clamp(t.sub(float(0.5)).mul(float(4.0)), 0.0, 1.0);
      const t4 = clamp(t.sub(float(0.75)).mul(float(4.0)), 0.0, 1.0);

      const bg = mix(mix(mix(mix(c0, c1, t1), c2, t2), c3, t3), c4, t4);

      const belowSea = clamp(elev.negate().div(float(200.0)), 0.0, 1.0);
      const seaColor = vec3(0.0, 0.05, 0.12);
      const baseColor = mix(bg, seaColor, belowSea);

      const fracMinor = fract(elev.div(float(50.0)));
      const distMinor = min(fracMinor, float(1.0).sub(fracMinor));
      const fwMinor = fwidth(fracMinor);
      const lineMinor = smoothstep(fwMinor.mul(float(1.5)), fwMinor.mul(float(0.5)), distMinor);

      const fracMed = fract(elev.div(float(100.0)));
      const distMed = min(fracMed, float(1.0).sub(fracMed));
      const fwMed = fwidth(fracMed);
      const lineMed = smoothstep(fwMed.mul(float(1.5)), fwMed.mul(float(0.5)), distMed);

      const fracMaj = fract(elev.div(float(500.0)));
      const distMaj = min(fracMaj, float(1.0).sub(fracMaj));
      const fwMaj = fwidth(fracMaj);
      const lineMaj = smoothstep(fwMaj.mul(float(2.0)), fwMaj.mul(float(0.5)), distMaj);

      const minorColor = mix(baseColor, vec3(0.0, 0.6, 0.7), float(0.3));
      const medColor   = vec3(0.0, 0.80, 0.90);
      const majColor   = vec3(0.9, 0.95, 1.0);

      const lineAlpha = max(lineMinor.mul(float(0.25)), max(lineMed.mul(float(0.55)), lineMaj));
      const lineColor = mix(
        mix(minorColor, medColor, step(float(0.25), lineMed)),
        majColor,
        step(float(0.5), lineMaj)
      );

      return mix(baseColor, lineColor, lineAlpha);
    })();
  }

  _getSyntheticNode(mode) {
    if (!this._syntheticNodes[mode]) {
      this._syntheticNodes[mode] =
        mode === 'elevation' ? this._createLinesNode() : this._createRadarNode();
    }
    return this._syntheticNodes[mode];
  }

  _applyWireframeToMesh(mesh) {
    if (!mesh.isMesh || !mesh.material) return;
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    const node = this._getSyntheticNode(CONFIG.textureMode);
    for (const mat of materials) {
      if (this._wireframedMeshes.has(mat)) continue;
      mat.colorNode = node;
      mat.map = null;
      mat.wireframe = false;
      mat.needsUpdate = true;
      this._wireframedMeshes.add(mat);
    }
  }

  _enforceWireframe() {
    if (!this.tileMap) return;
    const node = this._getSyntheticNode(CONFIG.textureMode);
    this.tileMap.traverse((child) => {
      if (!child.isMesh || !child.material) return;
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      for (const mat of materials) {
        if (this._wireframedMeshes.has(mat)) continue;
        mat.colorNode = node;
        mat.map = null;
        mat.wireframe = false;
        mat.needsUpdate = true;
        this._wireframedMeshes.add(mat);
      }
    });
  }

  _applyWireframeToggle() {
    if (!this.tileMap) return;
    if (this._wireframeMode) {
      this._enforceWireframe();
    } else {
      this._wireframedMeshes = new WeakSet();
      this.tileMap.traverse((child) => {
        if (!child.isMesh || !child.material) return;
        const materials = Array.isArray(child.material) ? child.material : [child.material];
        for (const mat of materials) {
          mat.colorNode = null;
          mat.map = null;
          mat.wireframe = false;
          if (mat.color) mat.color.set(0xffffff);
          if (mat.emissive) {
            mat.emissive.set(0x000000);
            mat.emissiveIntensity = 1.0;
          }
          mat.needsUpdate = true;
        }
      });
    }
  }

  getMeshes() {
    return this.tileMap ? [this.tileMap] : [];
  }

  toggleDebug() {
    this._debugMode = !this._debugMode;
    this.reinit();
    return this._debugMode;
  }

  toggleHiRes() {
    CONFIG.hiResMode = !CONFIG.hiResMode;
    this.reinit();
    return CONFIG.hiResMode;
  }

  reinit() {
    this.init(CONFIG.lat, CONFIG.lon);
  }

  /**
   * Compute ground elevation at a world position.
   * Uses CPU-decoded heightmaps from ElevationProvider (same approach as before).
   */
  getGroundElevation(worldX, worldZ) {
    if (!this._centerMercator || !this.tileMap) return 0;

    // World → Mercator: reverse the position offset + rotation
    // After rotateX(-PI/2): worldX = mapX, worldZ = -mapY
    // Map position was shifted: tileMap.position = -worldPos(center)
    // So: mapX = worldX - tileMap.position.x, mapY = -(worldZ - tileMap.position.z)
    // But since rotation complicates localToWorld, let's use world2geo.
    const worldVec = new THREE.Vector3(worldX, 0, worldZ);
    let geo;
    try {
      geo = this.tileMap.world2geo(worldVec);
    } catch {
      return 0;
    }

    // geo = Vector3(lon, lat, alt)
    const longitude = geo.x;
    const latitude = geo.y;
    if (isNaN(latitude) || isNaN(longitude)) return 0;

    // Convert to tile coordinates for elevation lookup
    const zoom = Math.min(CONFIG.zoom || 12, 12);
    const n = 1 << zoom;
    const tileX = Math.floor(((longitude + 180) / 360) * n);
    const latRad = (latitude * Math.PI) / 180;
    const tileY = Math.floor(((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n);

    const key = `${zoom}/${tileX}/${tileY}`;
    const heightmap = this.elevationProvider._cache.get(key);
    if (!heightmap) {
      this.elevationProvider.fetchHeightmap(tileX, tileY, zoom).catch(() => {});
      return 0;
    }

    const fracX = ((longitude + 180) / 360) * n - tileX;
    const fracY = ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n - tileY;

    const px = Math.min(fracX * 255, 254);
    const py = Math.min(fracY * 255, 254);
    const ix = Math.floor(px);
    const iy = Math.floor(py);
    const fx = px - ix;
    const fy = py - iy;

    const h00 = heightmap[iy * 256 + ix];
    const h10 = heightmap[iy * 256 + ix + 1];
    const h01 = heightmap[(iy + 1) * 256 + ix];
    const h11 = heightmap[(iy + 1) * 256 + ix + 1];

    return h00 * (1 - fx) * (1 - fy) + h10 * fx * (1 - fy) + h01 * (1 - fx) * fy + h11 * fx * fy;
  }

  dispose() {
    if (this._oldTileMap) {
      this._disposeTileMap(this._oldTileMap);
      this._oldTileMap = null;
    }
    if (this.tileMap) {
      this._disposeTileMap(this.tileMap);
      this.tileMap = null;
      this.mapView = null;
    }
    this._centerMercator = null;
  }
}
