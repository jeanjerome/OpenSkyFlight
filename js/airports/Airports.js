/**
 * Airports and runways served by the dev server from OurAirports (see
 * scripts/airports.js): an airport search, and the runways of the map tiles
 * around a position, loaded as the aircraft moves.
 *
 * Runway: { id, airport, length, width (m), surface, lighted, ends: [end, end] },
 * each end: { ident, lat, lon, elevation (m), heading (degrees true, towards
 * the other end), displaced (m: displaced threshold) }.
 */

/** Zoom of the map tiles runways are loaded by: about 310 km across at the equator */
export const RUNWAY_TILE_ZOOM = 7;

/** Tiles kept around the current one: within this many tiles of it */
const KEEP_RADIUS = 2;

/**
 * Airports whose code, name or town match a query, with their runways
 * @param {string} query
 * @returns {Promise<object[]>}
 */
export async function searchAirports(query) {
  const res = await fetch(`/api/airports?q=${encodeURIComponent(query)}`);
  if (!res.ok) throw new Error(`airport search: HTTP ${res.status}`);
  return res.json();
}

/**
 * A point at a distance along a heading from another, on a sphere (short
 * distances)
 * @returns {{lat: number, lon: number}}
 */
export function offsetPosition(lat, lon, headingDegrees, distance) {
  const r = Math.PI / 180;
  const earth = 6371000;
  const h = headingDegrees * r;
  return {
    lat: lat + (distance * Math.cos(h)) / earth / r,
    lon: lon + (distance * Math.sin(h)) / (earth * Math.cos(lat * r)) / r,
  };
}

/** Web Mercator tile containing a position */
export function tileOf(lat, lon, z = RUNWAY_TILE_ZOOM) {
  const n = 2 ** z;
  const r = Math.PI / 180;
  const x = Math.floor(((lon + 180) / 360) * n);
  const y = Math.floor(((1 - Math.log(Math.tan(lat * r) + 1 / Math.cos(lat * r)) / Math.PI) / 2) * n);
  return { x: Math.min(n - 1, Math.max(0, x)), y: Math.min(n - 1, Math.max(0, y)) };
}

/** Runways of the map tiles around the aircraft: its tile and the eight around it */
export class RunwayCatalog {
  constructor() {
    /** Runways loaded, from all the tiles kept */
    this.runways = [];
    /** Called when the runways loaded change */
    this.onChange = null;
    this._tiles = new Map();
    this._current = null;
  }

  /** Loads the tiles around a position, drops those far from it */
  update(lat, lon) {
    const { x, y } = tileOf(lat, lon);
    const key = `${x}/${y}`;
    if (key === this._current) return;
    this._current = key;
    const n = 2 ** RUNWAY_TILE_ZOOM;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const ty = y + dy;
        if (ty < 0 || ty >= n) continue;
        const tx = (x + dx + n) % n;
        this._load(tx, ty);
      }
    }
    let dropped = false;
    for (const [tileKey, tile] of this._tiles) {
      const far =
        Math.min(Math.abs(tile.x - x), n - Math.abs(tile.x - x)) > KEEP_RADIUS || Math.abs(tile.y - y) > KEEP_RADIUS;
      if (far) {
        this._tiles.delete(tileKey);
        dropped = true;
      }
    }
    if (dropped) this._collect();
  }

  _load(x, y) {
    const key = `${x}/${y}`;
    if (this._tiles.has(key)) return;
    const tile = { x, y, runways: [] };
    this._tiles.set(key, tile);
    fetch(`/api/runways/${RUNWAY_TILE_ZOOM}/${x}/${y}`)
      .then((res) => (res.ok ? res.json() : []))
      .then((runways) => {
        if (this._tiles.get(key) !== tile) return;
        tile.runways = runways;
        this._collect();
      })
      .catch(() => {
        // Without the server's airport data the world has no runways; a later move retries
        if (this._tiles.get(key) === tile) this._tiles.delete(key);
      });
  }

  _collect() {
    this.runways = [...this._tiles.values()].flatMap((tile) => tile.runways);
    this.onChange?.(this.runways);
  }
}
