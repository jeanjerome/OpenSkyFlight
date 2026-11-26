import { Fn, float, vec2, vec3, uv, fract, mix, sin } from 'three/tsl';
import * as THREE from 'three';
import {
  LoaderFactory,
  TileMap,
  TileSource,
  applyTerrariumElevation,
  applyTerrariumImagery,
  gridCells,
  parentRow,
  MAX_STITCH_LEVELS,
} from 'three-tile';
import { CONFIG, onChange, update } from '../utils/config.js';
import ElevationProvider from '../geo/ElevationProvider.js';
import { createContourMapNodes } from './ContourMap.js';

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


/** Imagery texture of a tile mesh, null when it has none */
function imageryOf(mesh) {
  if (!mesh) return null;
  const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  return materials.find((material) => material.map)?.map ?? null;
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
    this._groundPoint = new THREE.Vector3();
    /** Web Mercator units to world metres (cos of the map centre latitude) */
    this.horizontalScale = 1;
    this._effectiveViewDistance = 0;
    this._centerMercator = null; // {x, y} Mercator coords of center lat/lon
    this._wireframeMode = GeoTerrainManager._isSynthetic(CONFIG.textureMode);
    this._debugMode = false;
    this._wireframedMeshes = new WeakSet();
    this._syntheticNodes = {};
    this._emissiveNode = null;
    this._exposureNode = null;
    /** Tiles drawn this frame by "z/x/y" */
    this._drawnTiles = new Map();

    onChange((key, value) => {
      if (key === 'terrainLodThreshold' && this.tileMap) this.tileMap.LODThreshold = value;
      if (key === 'hiResMode') this.reinit();
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
    // Read by the image loader for every tile, so a change applies to tiles loaded afterwards
    LoaderFactory.textureAnisotropy = Math.min(CONFIG.textureAnisotropy, this.renderer.getMaxAnisotropy());

    // Image source — satellite or OSM tiles
    const imgSource = new TileSource({
      url: CONFIG.textureMode === 'osm'
        ? '/tiles/osm/{z}/{x}/{y}.png'
        : '/tiles/satellite/{z}/{x}/{y}.png',
      dataType: 'image',
      minLevel: 0,
      maxLevel: effectiveZoom,
      // three-tile makes sources transparent by default: the tiles would be
      // sorted far to near and shade every hidden slope
      transparent: false,
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
          transparent: false,
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
    // The clouds' shadows (three-tile passes it on to every tile)
    this.tileMap.receiveShadow = true;
    // three-tile draws every tile twice: first with a flat background material
    // at sea level, then with its imagery, which covers every tile. The
    // background stays hidden below the terrain and only adds a draw call per
    // tile, so it is not drawn.
    this.tileMap.loader.backgroundMaterial.visible = false;

    // Z-up → Y-up (matches Three.js convention)
    this.tileMap.rotateX(-Math.PI / 2);

    // three-tile lays the map out in Web Mercator units, which stretch real
    // distances by 1/cos(latitude) (×1.43 at 45.8°), while elevations are in
    // metres. Shrinking the map horizontally by cos(latitude) makes one world
    // unit one real metre around the centre in all three axes, so slopes keep
    // their true steepness.
    this.horizontalScale = Math.cos((lat * Math.PI) / 180);
    this.tileMap.scale.set(this.horizontalScale, this.horizontalScale, 1);

    // Higher keeps finer tiles further away
    this.tileMap.LODThreshold = CONFIG.terrainLodThreshold;
    // The tile tree is updated by update(), not by the renderer: tiles shown
    // or hidden while rendering would be drawn with the morph and edges of the
    // previous frame, and every render of the scene (shadow maps included)
    // would update it from its own camera
    this.tileMap.autoUpdate = false;

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
   * Called when a tile finishes loading. Apply the shared TSL elevation nodes, which read
   * the height texture of the mesh being drawn.
   */
  _onTileLoaded(tile) {
    if (!tile || !tile.model) return;
    const mesh = tile.model;
    if (!mesh.geometry || !mesh.geometry.userData.heightTexture) return;

    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];

    for (const mat of materials) {
      // Skip background material (shared singleton) and already-processed materials
      if (mat._terrariumApplied) continue;
      // Only apply to MeshStandardNodeMaterial (TileMaterial clones), not MeshBasicNodeMaterial
      if (!mat.isMeshStandardNodeMaterial) continue;
      applyTerrariumElevation(mat);
      applyTerrariumImagery(mat);
      mat.emissiveNode = this._emissiveNode;
      mat._terrariumApplied = true;
      mat.needsUpdate = true;
    }

    // Also apply synthetic colorNode if in wireframe mode
    if (this._wireframeMode) {
      this._applyWireframeToMesh(mesh);
    }
  }

  /**
   * Light emitted by the ground (city lights), as one node shared by every
   * tile material, so that they keep a single compiled shader.
   * @param {?Node} node
   */
  setEmissiveNode(node) {
    this._emissiveNode = node;
    this.tileMap?.traverse((child) => {
      if (!child.isMesh || !child.material) return;
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      for (const mat of materials) {
        // The synthetic modes have their own emission
        if (!mat._terrariumApplied || this._wireframedMeshes.has(mat)) continue;
        mat.emissiveNode = node;
        mat.needsUpdate = true;
      }
    });
  }

  /**
   * Night exposure of the scene, which the glowing contour lines follow
   * (AtmosphericSky.preExposure). Set before the terrain is drawn.
   * @param {Node<float>} node
   */
  setExposureNode(node) {
    this._exposureNode = node;
  }

  /**
   * Updates the tile tree from the camera, then the morph and the edges of
   * the drawn tiles, before the frame is rendered.
   * @param {THREE.Camera} camera
   * @param {number} delta - seconds since the previous frame
   */
  update(camera, delta) {
    if (!this.tileMap) return;

    // Transition: remove old terrain once new one has visible tiles
    if (this._oldTileMap && this._hasVisibleTiles(this.tileMap)) {
      this._disposeTileMap(this._oldTileMap);
      this._oldTileMap = null;
    }

    if (this._wireframeMode) this._enforceWireframe();
    this.tileMap.update(camera);
    this.tileMap.updateMorph(delta);
    this._updateEdgeLevels();
  }

  /**
   * Coarseness of the surfaces drawn by each tile, read by the vertex shader:
   * of the tile itself as it morphs (`userData.coarseness`: 0 its own
   * surface, 1 its parent's), and along its west, east, south and north edges
   * (`userData.edgeLevels`, in levels above the tile's), which follow the
   * coarser side. A tile drawn at level z with morph m draws the surface of
   * level z - 1 + m; the neighbour along an edge is the drawn tile holding the
   * middle of the edge, just outside it, at the tile's level or above.
   */
  _updateEdgeLevels() {
    const drawn = this._drawnTiles;
    drawn.clear();
    this.tileMap.rootTile.traverse((tile) => {
      if (tile.isTile && tile.showing) drawn.set(`${tile.z}/${tile.x}/${tile.y}`, tile);
    });
    // Level of the surface drawn there by the neighbour, the tile's own when finer
    const surfaceLevel = (tile, u, v) => {
      for (let level = tile.z; level >= 0; level--) {
        const n = 2 ** level;
        const neighbour = drawn.get(`${level}/${((Math.floor(u * n) % n) + n) % n}/${Math.floor(v * n)}`);
        if (neighbour) return Math.min(level - 1 + neighbour.morph, tile.z - 1 + tile.morph);
      }
      return tile.z - 1 + tile.morph;
    };
    for (const tile of drawn.values()) {
      const n = 2 ** tile.z;
      const step = 0.25 / n / gridCells(tile.z);
      const { userData } = tile.model;
      userData.coarseness = 1 - tile.morph;
      // The parent's imagery fades out as the tile morphs (its own once done)
      userData.parentMap = tile.morph < 1 && tile.parent?.isTile ? imageryOf(tile.parent.model) : null;
      (userData.parentOffset ??= new THREE.Vector2()).set((tile.x & 1) * 0.5, (1 - (tile.y & 1)) * 0.5);
      const levels = (userData.edgeLevels ??= new THREE.Vector4());
      levels.set(
        surfaceLevel(tile, tile.x / n - step, (tile.y + 0.5) / n),
        surfaceLevel(tile, (tile.x + 1) / n + step, (tile.y + 0.5) / n),
        surfaceLevel(tile, (tile.x + 0.5) / n, (tile.y + 1) / n + step),
        surfaceLevel(tile, (tile.x + 0.5) / n, tile.y / n - step),
      );
      levels.subScalar(tile.z).negate().clampScalar(0, MAX_STITCH_LEVELS);
    }
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

  /** Colour and emission of the synthetic modes: { color, emissive } */
  _getSyntheticNode(mode) {
    if (!this._syntheticNodes[mode]) {
      this._syntheticNodes[mode] =
        mode === 'elevation'
          ? createContourMapNodes(this._exposureNode ?? float(1))
          : { color: this._createRadarNode(), emissive: null };
    }
    return this._syntheticNodes[mode];
  }

  _applySyntheticNode(mat, node) {
    mat.colorNode = node.color;
    mat.emissiveNode = node.emissive ?? this._emissiveNode;
    mat.map = null;
    mat.wireframe = false;
    mat.needsUpdate = true;
  }

  _applyWireframeToMesh(mesh) {
    if (!mesh.isMesh || !mesh.material) return;
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    const node = this._getSyntheticNode(CONFIG.textureMode);
    for (const mat of materials) {
      if (this._wireframedMeshes.has(mat)) continue;
      this._applySyntheticNode(mat, node);
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
        this._applySyntheticNode(mat, node);
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

  /**
   * Convert a geographic position to world coordinates.
   * World units are metres (exact at the map centre latitude); world Y is the altitude.
   * @returns {THREE.Vector3|null} null until the tile map exists
   */
  geoToWorld(lat, lon, altitude) {
    if (!this.tileMap) return null;
    const world = this.tileMap.geo2world(new THREE.Vector3(lon, lat, 0));
    world.y = altitude;
    return world;
  }

  /**
   * Geographic position below a world position.
   * @returns {{lat: number, lon: number}|null} null until the tile map exists
   */
  worldToGeo(x, z) {
    if (!this.tileMap) return null;
    const geo = this.tileMap.world2geo(new THREE.Vector3(x, 0, z));
    if (isNaN(geo.x) || isNaN(geo.y)) return null;
    return { lat: geo.y, lon: geo.x };
  }

  /** Number of tile downloads in flight (0 once the visible terrain has loaded). */
  get pendingDownloads() {
    return this.tileMap ? this.tileMap.downloading : 0;
  }

  /**
   * Number of displayed terrain tiles in the view, by zoom level
   * @returns {{ total: number, byLevel: Object<number, number> }}
   */
  tileLevels() {
    const byLevel = {};
    let total = 0;
    this.tileMap?.rootTile.traverse((tile) => {
      if (!tile.isTile || !tile.isLeaf || !tile.showing || !tile.inFrustum) return;
      byLevel[tile.z] = (byLevel[tile.z] || 0) + 1;
      total++;
    });
    return { total, byLevel };
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
    update('hiResMode', !CONFIG.hiResMode);
    return CONFIG.hiResMode;
  }

  reinit() {
    this.init(CONFIG.lat, CONFIG.lon);
  }

  /**
   * Height of the ground at a world position, as drawn: interpolated on the
   * triangles of the finest displayed tile there, from the elevations its
   * vertices are displaced by, so that contact with the ground matches the
   * screen. Where no tile is displayed, from the zoom-12 elevations decoded on
   * the CPU (fetched on first request). The curvature of the Earth, applied
   * around the camera when drawing, is left out.
   * @returns {number|null} altitude (m), null while no elevation is loaded there
   */
  groundHeight(worldX, worldZ) {
    const tileMap = this.tileMap;
    if (!tileMap) return null;

    // World → map coordinates (projected metres), then → [0, 1] across the
    // world, x eastward and y southward as the tile indices
    const local = tileMap.worldToLocal(this._groundPoint.set(worldX, 0, worldZ));
    const { mapWidth, mapHeight } = tileMap.projection;
    const u = local.x / mapWidth + 0.5;
    const v = 0.5 - local.y / mapHeight;
    if (!(u >= 0 && u < 1 && v >= 0 && v < 1)) return null;

    // Finest displayed tile containing the point, down the quadtree
    let displayed = null;
    let tile = tileMap.rootTile;
    while (tile) {
      if (tile.showing && tile.model.geometry.userData.heightTexture) displayed = tile;
      const children = tile.subTiles;
      if (!children) break;
      const n = 2 ** (tile.z + 1);
      const x = Math.floor(u * n);
      const y = Math.floor(v * n);
      tile = children.find((child) => child.x === x && child.y === y);
    }
    if (!displayed) return this.getGroundElevation(worldX, worldZ, null);

    // Grid of size × size vertices over the tile, row 0 along the south edge,
    // inside a ring of one vertex (texture rows and columns 1 to size); each
    // cell is split along the diagonal from its south-east to its north-west
    // vertex (three-tile's grid indices). Each elevation is blended towards
    // the parent's surface as the tile morphs. The edges stitched to coarser
    // neighbours are left out (a few metres at most).
    const texture = displayed.model.geometry.userData.heightTexture;
    const { data, width } = texture.image;
    const size = width - 2;
    const blend = 1 - displayed.morph;
    const parent = parentRow(width) * width;
    const at = (column, row) => {
      const k = (row + 1) * width + column + 1;
      return data[k] + blend * (data[parent + k] - data[k]);
    };
    const n = 2 ** displayed.z;
    const gx = (u * n - displayed.x) * (size - 1);
    const gy = (1 - (v * n - displayed.y)) * (size - 1);
    const i = Math.min(size - 2, Math.max(0, Math.floor(gx)));
    const j = Math.min(size - 2, Math.max(0, Math.floor(gy)));
    const fx = gx - i;
    const fy = gy - j;
    const a = at(i, j);
    const b = at(i + 1, j);
    const c = at(i, j + 1);
    const d = at(i + 1, j + 1);
    return fx + fy <= 1 ? a + fx * (b - a) + fy * (c - a) : d + (1 - fx) * (c - d) + (1 - fy) * (b - d);
  }

  /**
   * Ground elevation at a world position from the zoom-12 elevations decoded on
   * the CPU (ElevationProvider); a missing tile is fetched.
   * @param {number} [missing=0] - returned while the tile is not loaded
   */
  getGroundElevation(worldX, worldZ, missing = 0) {
    if (!this._centerMercator || !this.tileMap) return missing;

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
      return missing;
    }

    // geo = Vector3(lon, lat, alt)
    const longitude = geo.x;
    const latitude = geo.y;
    if (isNaN(latitude) || isNaN(longitude)) return missing;

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
      return missing;
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
