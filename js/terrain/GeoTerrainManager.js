import { Fn, float, vec2, vec3, uv, positionWorld, fract, smoothstep, mix, min, max, sin, step, clamp, fwidth } from 'three/tsl';
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
    return Fn(() => {
      const elev = positionWorld.y;

      // --- Hypsometric background color based on elevation ---
      // Normalized elevation: 0 = sea level, 1 = 4000m+
      const t = clamp(elev.div(float(4000.0)), 0.0, 1.0);

      // Color stops: deep green → yellow-green → brown → grey → white
      const c0 = vec3(0.02, 0.18, 0.08);  // deep green (0m)
      const c1 = vec3(0.12, 0.30, 0.05);  // forest green (~500m)
      const c2 = vec3(0.35, 0.30, 0.10);  // brown (~1500m)
      const c3 = vec3(0.55, 0.50, 0.45);  // grey rock (~3000m)
      const c4 = vec3(0.85, 0.85, 0.90);  // snow (~4000m+)

      // Piecewise linear interpolation between color stops
      const t1 = clamp(t.mul(float(8.0)), 0.0, 1.0);                       // 0–0.125 (0–500m)
      const t2 = clamp(t.sub(float(0.125)).mul(float(2.667)), 0.0, 1.0);   // 0.125–0.5 (500–2000m)
      const t3 = clamp(t.sub(float(0.5)).mul(float(4.0)), 0.0, 1.0);      // 0.5–0.75 (2000–3000m)
      const t4 = clamp(t.sub(float(0.75)).mul(float(4.0)), 0.0, 1.0);     // 0.75–1.0 (3000–4000m)

      const bg = mix(mix(mix(mix(c0, c1, t1), c2, t2), c3, t3), c4, t4);

      // --- Below sea level: dark blue-green ---
      const belowSea = clamp(elev.negate().div(float(200.0)), 0.0, 1.0);
      const seaColor = vec3(0.0, 0.05, 0.12);
      const baseColor = mix(bg, seaColor, belowSea);

      // --- Contour lines at 3 scales (constant-width via fwidth) ---
      // Minor lines every 50m (subtle)
      const fracMinor = fract(elev.div(float(50.0)));
      const distMinor = min(fracMinor, float(1.0).sub(fracMinor));
      const fwMinor = fwidth(fracMinor);
      const lineMinor = smoothstep(fwMinor.mul(float(1.5)), fwMinor.mul(float(0.5)), distMinor);

      // Medium lines every 100m
      const fracMed = fract(elev.div(float(100.0)));
      const distMed = min(fracMed, float(1.0).sub(fracMed));
      const fwMed = fwidth(fracMed);
      const lineMed = smoothstep(fwMed.mul(float(1.5)), fwMed.mul(float(0.5)), distMed);

      // Major lines every 500m (bold, slightly thicker)
      const fracMaj = fract(elev.div(float(500.0)));
      const distMaj = min(fracMaj, float(1.0).sub(fracMaj));
      const fwMaj = fwidth(fracMaj);
      const lineMaj = smoothstep(fwMaj.mul(float(2.0)), fwMaj.mul(float(0.5)), distMaj);

      // Line colors: brighter versions of the base tint
      const minorColor = mix(baseColor, vec3(0.0, 0.6, 0.7), float(0.3));
      const medColor   = vec3(0.0, 0.80, 0.90);
      const majColor   = vec3(0.9, 0.95, 1.0);

      // Composite: minor → medium → major (major wins)
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
