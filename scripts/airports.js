// Airports and runways from OurAirports (public domain), for the dev server:
// the CSV files are downloaded once into cache/ourairports/, then parsed and
// kept in memory. Only open runways of at least 300 m whose two ends are
// located are kept, at airports that take aeroplanes. Serves an airport search and the runways
// within a map tile.

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';

const BASE_URL = 'https://davidmegginson.github.io/ourairports-data';
const FEET = 0.3048;

/** Airport types kept: no heliports, seaplane bases, balloon ports or closed airports */
const AIRPORT_TYPES = new Set(['large_airport', 'medium_airport', 'small_airport']);
const TYPE_RANK = { large_airport: 0, medium_airport: 1, small_airport: 2 };

/** Shortest runway kept (m): shorter strips are helicopter lanes and ultralight fields */
const MIN_LENGTH = 300;

/** Most results returned by a search */
const SEARCH_LIMIT = 12;

let loading = null;

/**
 * Parses CSV text (RFC 4180: quoted fields may hold commas, quotes doubled,
 * line breaks) into objects keyed by the header row
 */
export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += c;
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  const [header, ...body] = rows;
  return body.filter((r) => r.length === header.length).map((r) => Object.fromEntries(header.map((h, k) => [h, r[k]])));
}

async function download(cacheDir, name) {
  const path = join(cacheDir, `${name}.csv`);
  try {
    return await readFile(path, 'utf8');
  } catch {
    const res = await fetch(`${BASE_URL}/${name}.csv`);
    if (!res.ok) throw new Error(`OurAirports ${name}.csv: HTTP ${res.status}`);
    const text = await res.text();
    await mkdir(cacheDir, { recursive: true });
    await writeFile(path, text);
    return text;
  }
}

const number = (value) => (value === '' || value === undefined ? null : Number(value));

/** Initial bearing from one point to another (degrees from true north, clockwise) */
function bearing(lat1, lon1, lat2, lon2) {
  const r = Math.PI / 180;
  const dLon = (lon2 - lon1) * r;
  const y = Math.sin(dLon) * Math.cos(lat2 * r);
  const x = Math.cos(lat1 * r) * Math.sin(lat2 * r) - Math.sin(lat1 * r) * Math.cos(lat2 * r) * Math.cos(dLon);
  return (((Math.atan2(y, x) / r) % 360) + 360) % 360;
}

/** Text folded for matching: lower case, without accents */
const fold = (text) =>
  text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

/**
 * Loads the data once (downloading it on first use)
 * @param {string} cacheDir
 * @returns {Promise<{airports: Map<string, object>, runways: object[]}>}
 */
export function loadAirports(cacheDir) {
  loading ??= (async () => {
    const dir = join(cacheDir, 'ourairports');
    const [airportText, runwayText] = await Promise.all([download(dir, 'airports'), download(dir, 'runways')]);
    const airports = new Map();
    for (const a of parseCsv(airportText)) {
      if (!AIRPORT_TYPES.has(a.type)) continue;
      airports.set(a.ident, {
        ident: a.ident,
        name: a.name,
        type: a.type,
        lat: Number(a.latitude_deg),
        lon: Number(a.longitude_deg),
        elevation: (number(a.elevation_ft) ?? 0) * FEET,
        country: a.iso_country,
        municipality: a.municipality,
        icao: a.icao_code || a.gps_code,
        iata: a.iata_code,
        runways: [],
        search: fold([a.ident, a.icao_code, a.gps_code, a.iata_code, a.name, a.municipality, a.keywords].join(' ')),
      });
    }
    const runways = [];
    for (const r of parseCsv(runwayText)) {
      const airport = airports.get(r.airport_ident);
      if (!airport || r.closed === '1' || !r.le_latitude_deg || !r.he_latitude_deg) continue;
      const end = (prefix, other) => {
        const lat = Number(r[`${prefix}_latitude_deg`]);
        const lon = Number(r[`${prefix}_longitude_deg`]);
        return {
          ident: r[`${prefix}_ident`],
          lat,
          lon,
          elevation: (number(r[`${prefix}_elevation_ft`]) ?? airport.elevation / FEET) * FEET,
          heading: bearing(lat, lon, Number(r[`${other}_latitude_deg`]), Number(r[`${other}_longitude_deg`])),
          displaced: (number(r[`${prefix}_displaced_threshold_ft`]) ?? 0) * FEET,
        };
      };
      const runway = {
        id: Number(r.id),
        airport: airport.ident,
        length: (number(r.length_ft) ?? 0) * FEET,
        width: (number(r.width_ft) ?? 0) * FEET,
        surface: r.surface,
        lighted: r.lighted === '1',
        ends: [end('le', 'he'), end('he', 'le')],
      };
      if (runway.length < MIN_LENGTH) continue;
      airport.runways.push(runway);
      runways.push(runway);
    }
    for (const [ident, airport] of airports) if (!airport.runways.length) airports.delete(ident);
    return { airports, runways };
  })();
  loading.catch(() => (loading = null));
  return loading;
}

/** An airport as sent to the browser */
const publicAirport = ({ search: _search, ...airport }) => airport;

/**
 * Airports whose code is the query, then whose name or town contain all its
 * words, larger airports first
 */
export async function searchAirports(cacheDir, query) {
  const { airports } = await loadAirports(cacheDir);
  const words = fold(query).split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const code = words.length === 1 ? words[0].toUpperCase() : null;
  const found = [];
  for (const airport of airports.values()) {
    const exact = code !== null && [airport.ident, airport.icao, airport.iata].includes(code);
    if (exact || words.every((w) => airport.search.includes(w))) found.push({ airport, exact });
  }
  found.sort(
    (a, b) =>
      b.exact - a.exact ||
      TYPE_RANK[a.airport.type] - TYPE_RANK[b.airport.type] ||
      a.airport.name.localeCompare(b.airport.name),
  );
  return found.slice(0, SEARCH_LIMIT).map(({ airport }) => publicAirport(airport));
}

/** Runways whose middle lies in a Web Mercator map tile */
export async function runwaysInTile(cacheDir, z, x, y) {
  const { runways } = await loadAirports(cacheDir);
  const n = 2 ** z;
  const r = Math.PI / 180;
  return runways.filter(({ ends: [a, b] }) => {
    const lat = (a.lat + b.lat) / 2;
    const lon = (a.lon + b.lon) / 2;
    const tx = Math.floor(((lon + 180) / 360) * n);
    const ty = Math.floor(((1 - Math.log(Math.tan(lat * r) + 1 / Math.cos(lat * r)) / Math.PI) / 2) * n);
    return tx === x && ty === y;
  });
}
