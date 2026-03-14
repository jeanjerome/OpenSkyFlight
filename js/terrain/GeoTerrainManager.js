import { MapView, MapHeightNodeShader, LODRaycast, UnitsUtils, DebugProvider } from 'geo-three';
import { CONFIG, onChange } from '../utils/config.js';
import LocalTileProvider from '../geo/LocalTileProvider.js';
import TerrariumProvider from '../geo/TerrariumProvider.js';
import ElevationProvider from '../geo/ElevationProvider.js';

// Patch MapHeightNodeShader.prepareMaterial for Three.js r152+ compatibility
// geo-three uses 'vUv' which was renamed to 'vMapUv' in Three.js r152
const _origPrepareMaterial = MapHeightNodeShader.prepareMaterial;
MapHeightNodeShader.prepareMaterial = function(material) {
  material.userData = { heightMap: { value: MapHeightNodeShader.defaultHeightTexture } };
  material.onBeforeCompile = (shader) => {
    for (const i in material.userData) {
      shader.uniforms[i] = material.userData[i];
    }
    shader.vertexShader = 'uniform sampler2D heightMap;\n' + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace('#include <fog_vertex>', `
#include <fog_vertex>

// geo-three height displacement (patched for Three.js r152+)
vec4 _theight = texture2D(heightMap, vMapUv);
float _height = ((_theight.r * 255.0 * 65536.0 + _theight.g * 255.0 * 256.0 + _theight.b * 255.0) * 0.1) - 10000.0;
vec3 _transformed = position + _height * normal;
gl_Position = projectionMatrix * modelViewMatrix * vec4(_transformed, 1.0);
    `);
  };
  return material;
};

export default class GeoTerrainManager {
  constructor(scene, renderer) {
    this.scene = scene;
    this.renderer = renderer;
    this.mapView = null;
    this.textureProvider = null;
    this.heightProvider = null;
    this.elevationProvider = new ElevationProvider();
    this._effectiveViewDistance = CONFIG.viewDistance;
    this._centerCoords = null; // Mercator coords of center lat/lon
    this._wireframeMode = !CONFIG.useOsmTexture;
    this._debugMode = false;

    onChange((key) => {
      if (key === 'useOsmTexture') {
        this._wireframeMode = !CONFIG.useOsmTexture;
        this._applyWireframeToggle();
      }
      if (key === 'textureSource') {
        this._updateTextureSource();
      }
    });
  }

  init(lat, lon) {
    this.dispose();

    // Create providers
    this.textureProvider = this._debugMode
      ? new DebugProvider()
      : new LocalTileProvider(CONFIG.textureSource || 'satellite');
    this.heightProvider = new TerrariumProvider();

    // Create MapView with HEIGHT_SHADER mode
    this.mapView = new MapView(MapView.HEIGHT_SHADER, this.textureProvider, this.heightProvider);

    // Configure LOD
    const lod = new LODRaycast();
    lod.subdivisionRays = 11;
    lod.thresholdUp = 0.6;
    lod.thresholdDown = 0.15;
    this.mapView.lod = lod;

    // Position map so that (lat, lon) is at world origin
    // In geo-three's 3D plane, Z_local = -Mercator_Y (north is negative Z).
    // So to center on (lat, lon): shift X by -Mercator_X, shift Z by +Mercator_Y.
    this._centerCoords = UnitsUtils.datumsToSpherical(lat, lon);
    this.mapView.position.set(-this._centerCoords.x, 0, this._centerCoords.y);

    this.scene.add(this.mapView);

    // Set effective view distance for far plane
    this._effectiveViewDistance = 1e6;
  }

  update(cameraPosition) {
    if (!this.mapView) return;
    if (this._wireframeMode) this._enforceWireframe();
  }

  _enforceWireframe() {
    this.mapView.traverse((child) => {
      if (!child.isMesh || !child.material || !child.material.color) return;
      child.material.wireframe = true;
      child.material.color.set(0x00ff88);
      if (child.material.emissive) {
        child.material.emissive.set(0x004422);
        child.material.emissiveIntensity = 0.3;
      }
    });
  }

  _applyWireframeToggle() {
    if (!this.mapView) return;
    if (this._wireframeMode) {
      this._enforceWireframe();
    } else {
      this.reinit();
    }
  }

  _updateTextureSource() {
    if (!this.mapView || this._wireframeMode) return;
    this.reinit();
  }

  get _effectiveViewDistanceValue() {
    return this._effectiveViewDistance;
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
    const latRad = latitude * Math.PI / 180;
    const tileY = Math.floor(
      ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n
    );

    // Try to get cached heightmap
    const key = `${zoom}/${tileX}/${tileY}`;
    const heightmap = this.elevationProvider._cache.get(key);
    if (!heightmap) {
      // Trigger fetch for next frame (non-blocking)
      this.elevationProvider.fetchHeightmap(tileX, tileY, zoom).catch(() => {});
      return 0;
    }

    // Compute fractional position within the tile (0..1)
    const fracX = (((longitude + 180) / 360) * n) - tileX;
    const fracY = (((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n) - tileY;

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

    const heightMeters = h00 * (1 - fx) * (1 - fy)
                       + h10 * fx * (1 - fy)
                       + h01 * (1 - fx) * fy
                       + h11 * fx * fy;

    // geo-three HEIGHT_SHADER works in its own coordinate space
    // The height in world units depends on how geo-three scales the terrain
    // Return meters directly — the HUD will handle unit conversion
    return heightMeters;
  }

  dispose() {
    if (this.mapView) {
      this.scene.remove(this.mapView);
      this.mapView.clear();
      this.mapView = null;
    }
    this._centerCoords = null;
  }
}
