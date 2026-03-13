// Slippy Map tile math utilities

import Logger from '../utils/Logger.js';

const DEG2RAD = Math.PI / 180;

export function latLonToTile(lat, lon, zoom) {
  const n = 1 << zoom;
  const x = Math.floor(((lon + 180) / 360) * n);
  const latRad = lat * DEG2RAD;
  const y = Math.floor(
    ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n
  );
  return { x, y };
}

export function tileToLatLon(x, y, zoom) {
  const n = 1 << zoom;
  const lon = (x / n) * 360 - 180;
  const latRad = Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / n)));
  const lat = latRad / DEG2RAD;
  return { lat, lon };
}

export function tileWorldSize(zoom) {
  // Approximate size of a tile in meters at equator
  const earthCircumference = 40075016.686;
  return earthCircumference / (1 << zoom);
}

export const EARTH_RADIUS = 6_371_000; // meters

// Returns the geometric horizon distance in tiles for a given altitude (meters)
export function horizonTiles(altitudeMeters, zoom) {
  if (altitudeMeters <= 0) return 0;
  // d = sqrt(2·R·h + h²)
  const d = Math.sqrt(2 * EARTH_RADIUS * altitudeMeters + altitudeMeters * altitudeMeters);
  return d / tileWorldSize(zoom);
}

/**
 * Compute the max useful zoom level for a given altitude.
 * Based on: at altitude h with ~70° FOV, the visible ground width ≈ 2·h·tan(35°).
 * We want each tile to subtend ~256px on a ~1920px screen ≈ 7.5 tiles across.
 * So desiredTileMeters ≈ 2·h·tan(35°) / 7.5 ≈ h × 0.187 → rounded to 0.2.
 */
export function nearZoomForAltitude(altMeters, baseZoom, minZoom = 3) {
  if (altMeters <= 0) return baseZoom;
  const desiredTileMeters = Math.max(altMeters * 0.2, 1);
  const z = Math.floor(Math.log2(40075016.686 / desiredTileMeters));
  const result = Math.max(minZoom, Math.min(baseZoom, z));
  Logger.debug('TileMath', `nearZoom: alt=${Math.round(altMeters)}m → zoom=${result}`);
  return result;
}

/**
 * Build LOD tile set using quadtree subdivision.
 * Each tile decides to subdivide (show 4 children) based on its distance
 * to the camera. This guarantees that adjacent tiles at the same distance
 * always share the same zoom level — no hard ring boundaries.
 *
 * @param {Object} camTile  - camera position in fractional baseZoom tile coords {x, y}
 * @param {number} nearZoom - highest zoom (closest, most detailed)
 * @param {number} minZoom  - lowest zoom
 * @param {number} _unused  - (kept for signature compat, formerly ringRadius)
 * @param {number} baseZoom - CONFIG.zoom
 * @param {number} altMeters - camera altitude in meters
 * @returns {Array<{zoom: number, tiles: Array<{tx: number, ty: number}>}>}
 */
export function buildLodRings(camTile, nearZoom, minZoom, _unused, baseZoom, altMeters) {
  const horizonMeters = altMeters > 0
    ? Math.sqrt(2 * EARTH_RADIUS * altMeters + altMeters * altMeters)
    : Infinity;

  // Subdivide when camera is within K × tileSize metres of the tile centre.
  // K ≈ 6 gives ~256 px per tile on a 1920 px / 70° FOV screen.
  const SUBDIVIDE_K = 6;

  const baseTileMeters = tileWorldSize(baseZoom);
  const tileList = []; // {zoom, tx, ty}
  const visited = new Set();

  // Pick a start zoom where a small grid covers the horizon
  const startZoom = horizonMeters < Infinity
    ? Math.max(minZoom, Math.floor(Math.log2(40075016.686 / (horizonMeters / 3))))
    : minZoom;
  const clamped = Math.min(startZoom, nearZoom);
  const startScale = 1 << (baseZoom - clamped);
  const startCamTx = Math.floor(camTile.x / startScale);
  const startCamTy = Math.floor(camTile.y / startScale);
  const startRadius = Math.min(
    Math.ceil(horizonMeters / tileWorldSize(clamped)) + 1,
    20,
  );

  function visit(tx, ty, z) {
    const key = `${z}/${tx}/${ty}`;
    if (visited.has(key)) return;
    visited.add(key);

    const maxTile = 1 << z;
    if (tx < 0 || tx >= maxTile || ty < 0 || ty >= maxTile) return;

    // Distance camera → tile centre, in metres
    const scale = 1 << (baseZoom - z);
    const cx = (tx + 0.5) * scale;
    const cy = (ty + 0.5) * scale;
    const distMeters = Math.sqrt((cx - camTile.x) ** 2 + (cy - camTile.y) ** 2) * baseTileMeters;

    if (distMeters > horizonMeters * 1.1) return; // horizon + margin

    if (z < nearZoom && distMeters < tileWorldSize(z) * SUBDIVIDE_K) {
      // Close enough → show 4 children at higher zoom
      const c = tx * 2, r = ty * 2;
      visit(c, r, z + 1);
      visit(c + 1, r, z + 1);
      visit(c, r + 1, z + 1);
      visit(c + 1, r + 1, z + 1);
    } else {
      tileList.push({ zoom: z, tx, ty });
    }
  }

  for (let dy = -startRadius; dy <= startRadius; dy++) {
    for (let dx = -startRadius; dx <= startRadius; dx++) {
      visit(startCamTx + dx, startCamTy + dy, clamped);
    }
  }

  // Group by zoom (high → low) to match the ring format expected by ChunkManager
  const byZoom = {};
  for (const t of tileList) {
    (byZoom[t.zoom] ||= []).push({ tx: t.tx, ty: t.ty });
  }
  const rings = [];
  for (let z = nearZoom; z >= minZoom; z--) {
    if (byZoom[z]?.length) rings.push({ zoom: z, tiles: byZoom[z] });
  }
  Logger.debug('TileMath', `buildLodRings: nearZoom=${nearZoom}, startZoom=${clamped}, total=${tileList.length} tiles, ${rings.length} rings`);
  return rings;
}
