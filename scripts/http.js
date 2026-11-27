// HTTP requests of the dev server and the scripts to the tile and data providers.

/**
 * Identifies the application to the providers: the OpenStreetMap tile servers
 * refuse a generic library User-Agent (`node`, which fetch sends by default)
 * and serve their "Access blocked" image instead of the tile.
 */
export const USER_AGENT = 'OpenSkyFlight/1.0 (+https://github.com/jeanjerome/OpenSkyFlight)';

/** fetch() with the application's User-Agent */
export function fetchFromProvider(url) {
  return fetch(url, { headers: { 'User-Agent': USER_AGENT } });
}

/**
 * Whether a tile answered by a source may be stored in the tile cache. The
 * OpenStreetMap servers answer a refused request with HTTP 200 and an
 * "Access blocked" image marked no-cache, where every real tile carries a
 * max-age: stored, that image would stand in for the tile for good. NASA GIBS
 * marks its real tiles no-cache, so the rule only applies to OpenStreetMap.
 * @param {string} source - name of the tile source (osm, satellite…)
 * @param {Response} response
 */
export function isStorableTile(source, response) {
  if (source !== 'osm') return true;
  return !/no-cache|no-store/i.test(response.headers.get('cache-control') ?? '');
}
