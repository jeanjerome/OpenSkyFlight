/** Width given to runways whose width is not published (m) */
export const DEFAULT_RUNWAY_WIDTH = 30;

/**
 * The runways of the catalogue in world metres, placed again whenever the
 * list or the world's origin (the terrain's tile map) changes, and the ones
 * nearest to a position. A placed runway:
 * { runway, x0, z0 (world position of end 0), ux, uz (unit vector towards
 *   end 1), length (true metres), width (m), k (world metres per true metre:
 *   the map is exact at its centre's latitude only), distanceTo(x, z) }
 */
export default class RunwaysInWorld {
  constructor() {
    this.placed = [];
    this._runways = null;
    this._origin = null;
  }

  /**
   * @param {object[]} runways - see Airports.js
   * @param {import('../terrain/GeoTerrainManager.js').default} terrain
   * @returns {boolean} whether the runways were placed again
   */
  update(runways, terrain) {
    const origin = terrain.tileMap;
    if (!origin || (runways === this._runways && origin === this._origin)) return false;
    this._runways = runways;
    this._origin = origin;
    this.placed = runways.flatMap((runway) => place(runway, terrain) ?? []);
    return true;
  }

  /**
   * The runways within a distance of a position, nearest first
   * @param {(placed: object) => boolean} [accept] - which runways count
   */
  nearest(x, z, count, distance, accept = () => true) {
    return this.placed
      .filter(accept)
      .map((placed) => ({ placed, d: placed.distanceTo(x, z) }))
      .filter(({ d }) => d < distance)
      .sort((a, b) => a.d - b.d)
      .slice(0, count)
      .map(({ placed }) => placed);
  }
}

function place(runway, terrain) {
  const [a, b] = runway.ends;
  const p0 = terrain.geoToWorld(a.lat, a.lon, 0);
  const p1 = terrain.geoToWorld(b.lat, b.lon, 0);
  if (!p0 || !p1) return null;
  const dx = p1.x - p0.x;
  const dz = p1.z - p0.z;
  const worldLength = Math.hypot(dx, dz);
  if (!(worldLength > 1)) return null;
  const k = worldLength / Math.max(1, runway.length || worldLength);
  return {
    runway,
    x0: p0.x,
    z0: p0.z,
    ux: dx / worldLength,
    uz: dz / worldLength,
    length: worldLength / k,
    width: runway.width > 0 ? runway.width : DEFAULT_RUNWAY_WIDTH,
    k,
    /** Distance from a world position to the runway's centre line (world metres) */
    distanceTo(x, z) {
      const t = Math.max(0, Math.min(1, ((x - p0.x) * dx + (z - p0.z) * dz) / (worldLength * worldLength)));
      return Math.hypot(x - p0.x - t * dx, z - p0.z - t * dz);
    },
  };
}
