import { Fn, float, vec2, vec3, uv, positionWorld, fract, smoothstep, mix, min, sin } from 'three/tsl';
import { MapView, LODRaycastPruning, UnitsUtils, DebugProvider } from 'geo-three';
import { CONFIG, onChange } from '../utils/config.js';
import LocalTileProvider from '../geo/LocalTileProvider.js';
import TerrariumProvider from '../geo/TerrariumProvider.js';
import ElevationProvider from '../geo/ElevationProvider.js';

export default class GeoTerrainManager {
  static _isSynthetic(mode) {
    return mode === 'sar' || mode === 'elevation';
  }

  constructor(scene, renderer) {
    this.scene = scene;
    this.renderer = renderer;
    this.mapView = null;
    this.textureProvider = null;
    this.heightProvider = null;
    this.elevationProvider = new ElevationProvider();
    this._effectiveViewDistance = 0;
    this._centerCoords = null; // Mercator coords of center lat/lon
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
            // texture → synthetic: apply colorNode overlay
            this._applyWireframeToggle();
          } else {
            // synthetic → texture: must reinit to reload tile textures
            this.reinit();
          }
        } else if (newWireframe) {
          // sar ↔ elevation: same wireframe state, different synthetic style
          this._wireframedMeshes = new WeakSet();
          this._enforceWireframe();
        } else {
          // satellite ↔ osm: same non-wireframe state, different tile source
          this.reinit();
        }
      }
    });
  }

  init(lat, lon) {
    // Keep old mapView visible during transition (avoid black screen)
    const oldMapView = this.mapView;
    this.mapView = null;

    // Create providers
    this.textureProvider = this._debugMode
      ? new DebugProvider()
      : new LocalTileProvider(CONFIG.textureMode === 'osm' ? 'osm' : 'satellite');
    this.heightProvider = new TerrariumProvider();
    const effectiveZoom = CONFIG.hiResMode ? 18 : 15;
    this.heightProvider.maxZoom = effectiveZoom;
    this.textureProvider.maxZoom = effectiveZoom;

    // Create MapView with HEIGHT_SHADER mode
    this.mapView = new MapView(MapView.HEIGHT_SHADER, this.textureProvider, this.heightProvider);

    // Configure LOD (Sprint 3.1: tuned for fewer triangles with stable hysteresis)
    const lod = new LODRaycastPruning();
    lod.subdivisionRays = 7;
    lod.thresholdUp = 0.6;
    lod.thresholdDown = 0.2;
    lod.maxLeafNodes = 300;
    lod.pruneGraceMultiplier = 2.5;
    lod.pruneMinLevel = 4;
    this.mapView.lod = lod;

    // Position map so that (lat, lon) is at world origin
    // In geo-three's 3D plane, Z_local = -Mercator_Y (north is negative Z).
    // So to center on (lat, lon): shift X by -Mercator_X, shift Z by +Mercator_Y.
    this._centerCoords = UnitsUtils.datumsToSpherical(lat, lon);
    this.mapView.position.set(-this._centerCoords.x, 0, this._centerCoords.y);

    this.scene.add(this.mapView);

    this._wireframedMeshes = new WeakSet();
    if (this._wireframeMode) this._enforceWireframe();

    // Store old mapView for deferred cleanup
    if (this._oldMapView) {
      this._disposeMapView(this._oldMapView);
    }
    this._oldMapView = oldMapView;

    // Set effective view distance for far plane
    this._effectiveViewDistance = 1e6;
  }

  update(_cameraPosition) {
    if (!this.mapView) return;

    // Transition: remove old terrain once new one has visible tiles
    if (this._oldMapView && this._hasVisibleTiles(this.mapView)) {
      this._disposeMapView(this._oldMapView);
      this._oldMapView = null;
    }

    if (this._wireframeMode) this._enforceWireframe();
  }

  _hasVisibleTiles(mapView) {
    let found = false;
    mapView.traverse((child) => {
      if (found) return;
      if (child.isMesh && child.visible && child !== mapView) found = true;
    });
    return found;
  }

  _disposeMapView(target) {
    this.scene.remove(target);
    target.traverse((child) => {
      if (child.geometry) child.geometry.dispose();
      if (child.material) {
        if (Array.isArray(child.material)) {
          child.material.forEach((m) => m.dispose());
        } else {
          child.material.dispose();
        }
      }
    });
  }

  _createRadarNode() {
    return Fn(() => {
      // Speckle noise (SAR-like grain) via classic GPU hash
      const uvScaled = uv().mul(float(512.0));
      const h = fract(sin(uvScaled.dot(vec2(12.9898, 78.233))).mul(43758.5453));
      const speckle = mix(float(0.4), float(0.65), h);
      return vec3(speckle, speckle, speckle);
    })();
  }

  _createLinesNode() {
    const interval = float(50.0);
    const bg = vec3(0, 0.10, 0.10);
    const fg = vec3(0, 0.90, 1.0);
    return Fn(() => {
      const t = fract(positionWorld.y.div(interval));
      const dist = min(t, float(1.0).sub(t));
      const line = smoothstep(float(0.04), float(0.015), dist);
      return mix(bg, fg, line);
    })();
  }

  _getSyntheticNode(mode) {
    if (!this._syntheticNodes[mode]) {
      this._syntheticNodes[mode] =
        mode === 'elevation' ? this._createLinesNode() : this._createRadarNode();
    }
    return this._syntheticNodes[mode];
  }

  _enforceWireframe() {
    const node = this._getSyntheticNode(CONFIG.textureMode);
    this.mapView.traverse((child) => {
      if (!child.isMesh || !child.material) return;
      if (this._wireframedMeshes.has(child.material)) return;
      child.material.colorNode = node;
      child.material.map = null;
      child.material.wireframe = false;
      child.material.needsUpdate = true;
      this._wireframedMeshes.add(child.material);
    });
  }

  _applyWireframeToggle() {
    if (!this.mapView) return;
    if (this._wireframeMode) {
      this._enforceWireframe();
    } else {
      this._wireframedMeshes = new WeakSet();
      this.mapView.traverse((child) => {
        if (!child.isMesh || !child.material) return;
        child.material.colorNode = null;
        child.material.map = null;
        child.material.wireframe = false;
        if (child.material.color) child.material.color.set(0xffffff);
        if (child.material.emissive) {
          child.material.emissive.set(0x000000);
          child.material.emissiveIntensity = 1.0;
        }
        child.material.needsUpdate = true;
      });
    }
  }

  getMeshes() {
    // In HEIGHT_SHADER mode, the map manages its own meshes
    return this.mapView ? [this.mapView] : [];
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
   * Converts world coords to lat/lon, finds the tile, and samples the cached heightmap.
   * Returns elevation in world units (same scale as geo-three terrain).
   */
  getGroundElevation(worldX, worldZ) {
    if (!this._centerCoords) return 0;

    // Convert world position to Mercator coordinates
    // Map X_local = Mercator_X, so Mercator_X = worldX - mapPos.x
    // Map Z_local = -Mercator_Y, so Mercator_Y = mapPos.z - worldZ
    const mercX = worldX - this.mapView.position.x;
    const mercY = this.mapView.position.z - worldZ;

    // Convert Mercator to lat/lon
    let latLon;
    try {
      latLon = UnitsUtils.sphericalToDatums(mercX, mercY);
    } catch {
      return 0;
    }

    const { latitude, longitude } = latLon;
    if (isNaN(latitude) || isNaN(longitude)) return 0;

    // Convert to tile coordinates at a reasonable zoom for elevation lookup
    const zoom = Math.min(CONFIG.zoom, 12);
    const n = 1 << zoom;
    const tileX = Math.floor(((longitude + 180) / 360) * n);
    const latRad = (latitude * Math.PI) / 180;
    const tileY = Math.floor(((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n);

    // Try to get cached heightmap
    const key = `${zoom}/${tileX}/${tileY}`;
    const heightmap = this.elevationProvider._cache.get(key);
    if (!heightmap) {
      // Trigger fetch for next frame (non-blocking)
      this.elevationProvider.fetchHeightmap(tileX, tileY, zoom).catch(() => {});
      return 0;
    }

    // Compute fractional position within the tile (0..1)
    const fracX = ((longitude + 180) / 360) * n - tileX;
    const fracY = ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n - tileY;

    // Sample heightmap with bilinear interpolation
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

    const heightMeters = h00 * (1 - fx) * (1 - fy) + h10 * fx * (1 - fy) + h01 * (1 - fx) * fy + h11 * fx * fy;

    // geo-three HEIGHT_SHADER works in its own coordinate space
    // The height in world units depends on how geo-three scales the terrain
    // Return meters directly — the HUD will handle unit conversion
    return heightMeters;
  }

  dispose() {
    if (this._oldMapView) {
      this._disposeMapView(this._oldMapView);
      this._oldMapView = null;
    }
    if (this.mapView) {
      this._disposeMapView(this.mapView);
      this.mapView = null;
    }
    this._centerCoords = null;
  }
}
