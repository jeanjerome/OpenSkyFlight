import * as THREE from 'three';
import TerrainChunk from './TerrainChunk.js';
import { CONFIG, onChange } from '../utils/config.js';
import { latLonToTile, tileWorldSize, horizonTiles, nearZoomForAltitude, buildLodRings, EARTH_RADIUS } from '../geo/TileMath.js';
import ElevationProvider from '../geo/ElevationProvider.js';
import TextureProvider from '../geo/TextureProvider.js';

export default class ChunkManager {
  constructor(scene) {
    this.scene = scene;
    this.chunks = new Map();
    this.pending = new Set();
    this.worker = new Worker(new URL('./terrainWorker.js', import.meta.url));
    this.workerReady = false;
    this.requestQueue = [];

    this.material = new THREE.MeshBasicMaterial({
      wireframe: true,
      vertexColors: true,
      side: THREE.DoubleSide,
    });

    this.elevationProvider = new ElevationProvider();
    this.textureProvider = new TextureProvider();
    this._centerTile = null;
    this._pendingReal = new Set();
    this._stagingChunks = new Map(); // key → chunk awaiting texture before entering scene
    this._effectiveViewDistance = CONFIG.viewDistance;
    this._inFlightCount = 0;
    this._maxInFlight = 6;
    this._failedTiles = new Map(); // key → timestamp of last failure

    this.worker.onmessage = (e) => {
      if (e.data.type === 'ready') {
        this.workerReady = true;
        return;
      }
      if (e.data.type === 'chunk') {
        this._onChunkReady(e.data);
      }
    };

    onChange((key, value) => {
      if (key === 'wireframe') {
        this.material.wireframe = value;
        for (const chunk of this.chunks.values()) {
          if (chunk._textureMaterial) {
            chunk._textureMaterial.wireframe = value;
          }
        }
      }
      if ((key === 'useOsmTexture' || key === 'textureSource') && CONFIG.terrainMode === 'realworld') {
        this._toggleTextures(CONFIG.useOsmTexture);
      }
    });

    this._initWorker();
  }

  _initWorker() {
    this.worker.postMessage({ type: 'init', seed: CONFIG.seed });
  }

  _computeCenterTile() {
    this._centerTile = latLonToTile(CONFIG.lat, CONFIG.lon, CONFIG.zoom);
  }

  reinit() {
    for (const [key, chunk] of this.chunks) {
      this.scene.remove(chunk.mesh);
      chunk.dispose();
    }
    this.chunks.clear();
    this.pending.clear();
    this._pendingReal.clear();
    this._failedTiles.clear();
    for (const chunk of this._stagingChunks.values()) {
      chunk.dispose();
    }
    this._stagingChunks.clear();
    this._inFlightCount = 0;
    this.requestQueue = [];
    this.workerReady = false;

    if (CONFIG.terrainMode === 'realworld') {
      this._computeCenterTile();
    }

    this._initWorker();
  }

  _onChunkReady(data) {
    const { cx, cz, positions, colors, indices, uvs, res, zoom } = data;

    // LOD path: zoom is defined → key uses "zoom/tx/ty" format
    if (zoom !== undefined) {
      const key = `${zoom}/${cx}/${cz}`;
      this.pending.delete(key);
      this._pendingReal.delete(key);

      // Check if this tile is still needed
      if (!this._currentNeededKeys || !this._currentNeededKeys.has(key)) return;

      const chunk = new TerrainChunk(cx, cz, this.material);
      const vertexCount = positions.byteLength / 12;
      const typedIndices = vertexCount <= 65536 ? new Uint16Array(indices) : new Uint32Array(indices);
      const typedUvs = uvs ? new Float32Array(uvs) : undefined;

      // worldSize for this zoom level
      const scale = 1 << (CONFIG.zoom - zoom);
      const worldSize = scale * CONFIG.chunkSize;

      // Tile world offset on the flat plane (before spherical projection)
      const worldX = (cx * scale - this._centerTile.x) * CONFIG.chunkSize;
      const worldZ = (cz * scale - this._centerTile.y) * CONFIG.chunkSize;

      // Project vertices onto Earth sphere
      const posArr = new Float32Array(positions);
      this._projectOnSphere(posArr, worldX, worldZ);

      chunk.buildFromBuffers(
        posArr,
        new Float32Array(colors),
        typedIndices,
        worldSize,
        typedUvs
      );

      // Positions are already in world-space (spherical), no mesh offset needed
      chunk.mesh.position.set(0, 0, 0);

      // Store zoom info on chunk for texture loading
      chunk._lodZoom = zoom;
      chunk._lodTx = cx;
      chunk._lodTy = cz;

      // When textures are enabled, stage the chunk off-screen until texture is ready
      if (CONFIG.useOsmTexture) {
        this._stagingChunks.set(key, chunk);
        this._stageWithTexture(chunk, cx, cz, zoom, key);
      } else {
        this.chunks.set(key, chunk);
        this.scene.add(chunk.mesh);
      }

      return;
    }

    // Procedural path (unchanged)
    const key = `${cx},${cz}`;
    this.pending.delete(key);
    this._pendingReal.delete(key);

    if (!this._isInRange(cx, cz, this._lastCamCX, this._lastCamCZ)) return;

    const chunk = new TerrainChunk(cx, cz, this.material);
    const vertexCount = positions.byteLength / 12;
    const typedIndices = vertexCount <= 65536 ? new Uint16Array(indices) : new Uint32Array(indices);
    const typedUvs = uvs ? new Float32Array(uvs) : undefined;

    chunk.buildFromBuffers(
      new Float32Array(positions),
      new Float32Array(colors),
      typedIndices,
      CONFIG.chunkSize,
      typedUvs
    );
    this.chunks.set(key, chunk);
    this.scene.add(chunk.mesh);
  }

  _getTextureSource() {
    return CONFIG.textureSource || 'osm';
  }

  async _applyTextureLod(chunk, tx, ty, zoom) {
    const maxTile = 1 << zoom;
    if (tx < 0 || tx >= maxTile || ty < 0 || ty >= maxTile) return;

    try {
      const source = this._getTextureSource();
      const texture = await this.textureProvider.fetchTexture(tx, ty, zoom, source);
      if (!chunk.disposed) {
        chunk.setTexture(texture);
      }
    } catch (err) {
      console.warn('Texture load failed:', err.message);
    }
  }

  async _applyTexture(chunk, cx, cz) {
    const tileX = this._centerTile.x + cx;
    const tileY = this._centerTile.y + cz;
    const maxTile = 1 << CONFIG.zoom;
    if (tileX < 0 || tileX >= maxTile || tileY < 0 || tileY >= maxTile) return;

    try {
      const source = this._getTextureSource();
      const texture = await this.textureProvider.fetchTexture(tileX, tileY, CONFIG.zoom, source);
      if (!chunk.disposed) {
        chunk.setTexture(texture);
      }
    } catch (err) {
      console.warn('Texture load failed:', err.message);
    }
  }

  async _stageWithTexture(chunk, tx, ty, zoom, key) {
    const maxTile = 1 << zoom;
    if (tx >= 0 && tx < maxTile && ty >= 0 && ty < maxTile) {
      try {
        const source = this._getTextureSource();
        const texture = await this.textureProvider.fetchTexture(tx, ty, zoom, source);
        if (!chunk.disposed) {
          chunk.setTexture(texture);
        }
      } catch (err) {
        console.warn('Texture stage failed:', err.message);
        // Will proceed without texture — still better than a hole
      }
    }

    // Check if still staged (may have been cleaned up by reinit or prune)
    if (!this._stagingChunks.has(key)) {
      if (!this.chunks.has(key)) chunk.dispose();
      return;
    }
    this._stagingChunks.delete(key);

    // Check if still needed
    if (this._currentNeededKeys && !this._currentNeededKeys.has(key)) {
      chunk.dispose();
      return;
    }

    this.chunks.set(key, chunk);
    this.scene.add(chunk.mesh);
  }

  _toggleTextures(useTexture) {
    // Clear texture cache when source changes so new source tiles are fetched
    this.textureProvider.clearCache();
    for (const [key, chunk] of this.chunks) {
      if (useTexture) {
        chunk.setTexture(null); // clear old texture first
        if (chunk._lodZoom !== undefined) {
          this._applyTextureLod(chunk, chunk._lodTx, chunk._lodTy, chunk._lodZoom);
        } else if (this._centerTile) {
          this._applyTexture(chunk, chunk.cx, chunk.cz);
        }
      } else {
        chunk.setTexture(null);
      }
    }
  }

  _isInRange(cx, cz, camCX, camCZ) {
    const d = this._effectiveViewDistance;
    return Math.abs(cx - camCX) <= d && Math.abs(cz - camCZ) <= d;
  }

  // Convert camera world-Y to meters and compute horizon-based view distance
  _computeEffectiveViewDistance(cameraY) {
    if (CONFIG.terrainMode !== 'realworld') return CONFIG.viewDistance;
    const metersPerUnit = tileWorldSize(CONFIG.zoom) / CONFIG.chunkSize;
    const altitudeMeters = Math.max(0, cameraY * metersPerUnit);
    const horizon = horizonTiles(altitudeMeters, CONFIG.zoom);
    return Math.max(CONFIG.viewDistance, Math.ceil(horizon));
  }

  /**
   * Project flat vertex positions onto the Earth sphere.
   * Sphere center is at (0, -R, 0) so that the surface at the origin is at y=0.
   * Each vertex's flat (worldX + localX, worldZ + localZ) is treated as arc distance
   * on the sphere surface, then mapped to 3D spherical coordinates.
   */
  _projectOnSphere(positions, worldOffsetX, worldOffsetZ) {
    const metersPerUnit = tileWorldSize(CONFIG.zoom) / CONFIG.chunkSize;
    const R = EARTH_RADIUS / metersPerUnit; // Earth radius in world units

    for (let i = 0; i < positions.length; i += 3) {
      const wx = worldOffsetX + positions[i];
      const wz = worldOffsetZ + positions[i + 2];
      const wy = positions[i + 1]; // elevation in world units

      const dist = Math.sqrt(wx * wx + wz * wz);
      const theta = dist / R; // angular displacement on sphere

      if (dist > 0) {
        const phi = Math.atan2(wz, wx); // direction on flat plane
        const r = R + wy;
        positions[i]     = r * Math.sin(theta) * Math.cos(phi);
        positions[i + 1] = r * Math.cos(theta) - R;
        positions[i + 2] = r * Math.sin(theta) * Math.sin(phi);
      } else {
        // Directly below camera — just shift by elevation
        positions[i + 1] = wy;
      }
    }
  }

  // --- LOD plan computation ---
  _computeLodPlan(cameraPosition) {
    const metersPerUnit = tileWorldSize(CONFIG.zoom) / CONFIG.chunkSize;
    const altMeters = Math.max(0, cameraPosition.y * metersPerUnit);
    const nz = nearZoomForAltitude(altMeters, CONFIG.zoom, CONFIG.minZoom);
    // Use the camera's actual tile position (fractional), not the fixed center tile
    const camTile = {
      x: this._centerTile.x + cameraPosition.x / CONFIG.chunkSize,
      y: this._centerTile.y + cameraPosition.z / CONFIG.chunkSize,
    };
    const rings = buildLodRings(camTile, nz, CONFIG.minZoom, CONFIG.lodRingRadius, CONFIG.zoom, altMeters);
    return { nearZoom: nz, rings };
  }

  // --- Main LOD update for realworld mode ---
  _updateRealWorldLod(cameraPosition) {
    if (!this._centerTile) return;

    const { nearZoom, rings } = this._computeLodPlan(cameraPosition);
    const neededKeys = new Set();
    const now = Date.now();
    let totalTiles = 0;

    // Build the set of needed keys from LOD plan (quadtree — no overlap by construction)
    for (const ring of rings) {
      for (const { tx, ty } of ring.tiles) {
        if (totalTiles >= CONFIG.maxTotalTiles) break;
        neededKeys.add(`${ring.zoom}/${tx}/${ty}`);
        totalTiles++;
      }
      if (totalTiles >= CONFIG.maxTotalTiles) break;
    }

    // Store for use in _onChunkReady
    this._currentNeededKeys = neededKeys;

    // Prune chunks no longer needed
    this._pruneOutOfRangeChunks(neededKeys, cameraPosition);

    // Fetch missing tiles
    for (const key of neededKeys) {
      if (this._inFlightCount >= this._maxInFlight) break;
      if (this.chunks.has(key) || this.pending.has(key) || this._stagingChunks.has(key)) continue;

      // Skip tiles still in cooldown after failure
      const failedAt = this._failedTiles.get(key);
      if (failedAt !== undefined && now - failedAt < 5000) continue;
      this._failedTiles.delete(key);

      const [zoomStr, txStr, tyStr] = key.split('/');
      const zoom = Number(zoomStr);
      const tx = Number(txStr);
      const ty = Number(tyStr);

      this.pending.add(key);
      this._pendingReal.add(key);
      this._fetchAndGenerateLod(zoom, tx, ty, key);
    }

    // Update effective view distance for far plane calculation
    // Use the outermost ring's coverage in base-zoom tiles
    if (rings.length > 0) {
      const outerRing = rings[rings.length - 1];
      const outerScale = 1 << (CONFIG.zoom - outerRing.zoom);
      const outerRadiusInBaseTiles = CONFIG.lodRingRadius * outerScale;
      this._effectiveViewDistance = Math.max(CONFIG.viewDistance, outerRadiusInBaseTiles);
    }
  }

  _pruneOutOfRangeChunks(neededKeys, cameraPosition) {
    for (const [key, chunk] of this.chunks) {
      // Only prune LOD-keyed chunks (zoom/tx/ty format)
      if (!key.includes('/')) continue;
      if (!neededKeys.has(key)) {
        const coverage = this._tileCoverageStatus(key, neededKeys);
        if (coverage === 'covered') {
          // All replacement tiles are loaded — safe to remove
          this.scene.remove(chunk.mesh);
          chunk.dispose();
          this.chunks.delete(key);
        } else if (coverage === 'no_overlap' && this._isTileFarFromCamera(key, cameraPosition)) {
          // No overlap with needed tiles AND far from camera — remove to free memory
          this.scene.remove(chunk.mesh);
          chunk.dispose();
          this.chunks.delete(key);
        } else {
          // Keep old tile visible as fallback; push it behind new tiles
          chunk.mesh.renderOrder = -1;
        }
      } else {
        // Tile is still needed — ensure normal render order
        chunk.mesh.renderOrder = 0;
      }
    }

    // Clean staging, pending and failed that are no longer needed
    for (const [key, chunk] of this._stagingChunks) {
      if (key.includes('/') && !neededKeys.has(key)) {
        chunk.dispose();
        this._stagingChunks.delete(key);
      }
    }
    for (const key of this.pending) {
      if (key.includes('/') && !neededKeys.has(key)) {
        this.pending.delete(key);
        this._pendingReal.delete(key);
      }
    }
    for (const key of this._failedTiles.keys()) {
      if (key.includes('/') && !neededKeys.has(key)) {
        this._failedTiles.delete(key);
      }
    }
  }

  /**
   * Check whether an old tile's area is fully covered by loaded tiles from neededKeys.
   * Returns:
   *   'covered'    — all overlapping needed tiles are loaded, safe to remove
   *   'pending'    — some overlapping needed tiles are not yet loaded, keep old tile
   *   'no_overlap' — no needed tile overlaps this area (may still be visible)
   */
  _tileCoverageStatus(oldKey, neededKeys) {
    const [z, tx, ty] = oldKey.split('/').map(Number);
    const baseZoom = CONFIG.zoom;
    const oldScale = 1 << (baseZoom - z);
    const oldMinX = tx * oldScale;
    const oldMaxX = (tx + 1) * oldScale;
    const oldMinY = ty * oldScale;
    const oldMaxY = (ty + 1) * oldScale;

    let hasOverlap = false;

    for (const nk of neededKeys) {
      const [nz, ntx, nty] = nk.split('/').map(Number);
      const nScale = 1 << (baseZoom - nz);
      const nMinX = ntx * nScale;
      const nMaxX = (ntx + 1) * nScale;
      const nMinY = nty * nScale;
      const nMaxY = (nty + 1) * nScale;

      // Check if this needed tile overlaps the old tile's area
      if (nMinX < oldMaxX && nMaxX > oldMinX && nMinY < oldMaxY && nMaxY > oldMinY) {
        hasOverlap = true;
        if (!this.chunks.has(nk)) {
          return 'pending'; // Replacement not in scene yet — keep old tile
        }
      }
    }

    return hasOverlap ? 'covered' : 'no_overlap';
  }

  /**
   * Check if a tile is far enough from the camera to be safely discarded.
   * Uses 2× the effective view distance as threshold.
   */
  _isTileFarFromCamera(tileKey, cameraPosition) {
    const [z, tx, ty] = tileKey.split('/').map(Number);
    const scale = 1 << (CONFIG.zoom - z);
    // Tile center in base-zoom tile coords, relative to center tile
    const tileCenterX = (tx + 0.5) * scale - this._centerTile.x;
    const tileCenterY = (ty + 0.5) * scale - this._centerTile.y;
    // Camera position in base-zoom tile coords, relative to center tile
    const camTileX = cameraPosition.x / CONFIG.chunkSize;
    const camTileY = cameraPosition.z / CONFIG.chunkSize;

    const dx = tileCenterX - camTileX;
    const dy = tileCenterY - camTileY;
    const dist = Math.sqrt(dx * dx + dy * dy);

    return dist > this._effectiveViewDistance * 2;
  }

  async _fetchAndGenerateLod(zoom, tx, ty, key) {
    this._inFlightCount++;
    try {
      const heightmap = await this.elevationProvider.fetchHeightmap(tx, ty, zoom);

      if (!this.pending.has(key)) return;

      // elevationScale is always relative to base zoom — meters to world units
      const elevationScale = CONFIG.chunkSize / tileWorldSize(CONFIG.zoom);

      // worldSize: a tile at this zoom covers 2^(baseZoom - zoom) base tiles
      const scale = 1 << (CONFIG.zoom - zoom);
      const worldSize = scale * CONFIG.chunkSize;

      const hmCopy = new Float32Array(heightmap);
      this.worker.postMessage({
        type: 'generate-real',
        cx: tx,
        cz: ty,
        heightmap: hmCopy,
        chunkSize: worldSize,
        elevationScale,
        res: Math.min(CONFIG.chunkResolution, 256),
        zoom,
      }, [hmCopy.buffer]);
    } catch (err) {
      console.warn(`Elevation fetch failed for tile z${zoom}/${tx}/${ty}:`, err.message);
      this.pending.delete(key);
      this._pendingReal.delete(key);
      this._failedTiles.set(key, Date.now());
    } finally {
      this._inFlightCount--;
    }
  }

  update(cameraPosition) {
    const cs = CONFIG.chunkSize;
    const camCX = Math.floor(cameraPosition.x / cs + 0.5);
    const camCZ = Math.floor(cameraPosition.z / cs + 0.5);
    this._lastCamCX = camCX;
    this._lastCamCZ = camCZ;

    if (!this.workerReady) return;

    if (CONFIG.terrainMode === 'realworld') {
      this._updateRealWorldLod(cameraPosition);
    } else {
      this._effectiveViewDistance = this._computeEffectiveViewDistance(cameraPosition.y);

      // Remove out-of-range procedural chunks
      for (const [key, chunk] of this.chunks) {
        if (key.includes('/')) continue; // skip LOD chunks
        if (!this._isInRange(chunk.cx, chunk.cz, camCX, camCZ)) {
          this.scene.remove(chunk.mesh);
          chunk.dispose();
          this.chunks.delete(key);
        }
      }

      for (const key of this.pending) {
        if (key.includes('/')) continue;
        const [cx, cz] = key.split(',').map(Number);
        if (!this._isInRange(cx, cz, camCX, camCZ)) {
          this.pending.delete(key);
          this._pendingReal.delete(key);
        }
      }

      for (const key of this._failedTiles.keys()) {
        if (key.includes('/')) continue;
        const [cx, cz] = key.split(',').map(Number);
        if (!this._isInRange(cx, cz, camCX, camCZ)) {
          this._failedTiles.delete(key);
        }
      }

      this._updateProcedural(camCX, camCZ);
    }
  }

  _updateProcedural(camCX, camCZ) {
    const needed = this._spiralOrder(camCX, camCZ, this._effectiveViewDistance);
    let sent = 0;

    for (const [cx, cz] of needed) {
      const key = `${cx},${cz}`;
      if (this.chunks.has(key) || this.pending.has(key)) continue;
      if (sent >= CONFIG.maxChunkRequestsPerFrame) break;

      this.pending.add(key);
      this.worker.postMessage({
        type: 'generate',
        cx,
        cz,
        res: CONFIG.chunkResolution,
        chunkSize: CONFIG.chunkSize,
        maxHeight: CONFIG.maxHeight,
        octaves: CONFIG.octaves,
        lacunarity: CONFIG.lacunarity,
        persistence: CONFIG.persistence,
        redistribution: CONFIG.redistribution,
      });
      sent++;
    }
  }

  _spiralOrder(cx, cz, dist) {
    const result = [];
    result.push([cx, cz]);
    for (let r = 1; r <= dist; r++) {
      for (let x = -r; x <= r; x++) {
        for (let z = -r; z <= r; z++) {
          if (Math.abs(x) === r || Math.abs(z) === r) {
            result.push([cx + x, cz + z]);
          }
        }
      }
    }
    result.sort((a, b) => {
      const da = (a[0] - cx) ** 2 + (a[1] - cz) ** 2;
      const db = (b[0] - cx) ** 2 + (b[1] - cz) ** 2;
      return da - db;
    });
    return result;
  }

  getMeshes() {
    const meshes = [];
    for (const chunk of this.chunks.values()) {
      if (chunk.mesh) meshes.push(chunk.mesh);
    }
    return meshes;
  }

  dispose() {
    this.worker.terminate();
    for (const [, chunk] of this.chunks) {
      this.scene.remove(chunk.mesh);
      chunk.dispose();
    }
    for (const chunk of this._stagingChunks.values()) {
      chunk.dispose();
    }
    this.material.dispose();
    this.chunks.clear();
    this._stagingChunks.clear();
  }
}
