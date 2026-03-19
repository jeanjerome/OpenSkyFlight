#!/usr/bin/env node

// Pre-downloads elevation (Terrarium) and texture (OSM) tiles into cache/
// Usage: node scripts/prefetch-tiles.js --lat 45.8326 --lon 6.8652 --zoom 12 --radius 12

import { mkdirSync, existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';

const { values } = parseArgs({
  options: {
    lat: { type: 'string' },
    lon: { type: 'string' },
    zoom: { type: 'string', default: '12' },
    radius: { type: 'string', default: '12' },
    delay: { type: 'string', default: '100' },
  },
});

const lat = parseFloat(values.lat);
const lon = parseFloat(values.lon);
const zoom = parseInt(values.zoom, 10);
const radius = parseInt(values.radius, 10);
const delay = parseInt(values.delay, 10);

if (isNaN(lat) || isNaN(lon)) {
  console.error(
    'Usage: node scripts/prefetch-tiles.js --lat <lat> --lon <lon> [--zoom 12] [--radius 12] [--delay 100]',
  );
  process.exit(1);
}

// Tile math (same formulas as TileMath.js)
function latLonToTile(lat, lon, zoom) {
  const n = 1 << zoom;
  const x = Math.floor(((lon + 180) / 360) * n);
  const latRad = (lat * Math.PI) / 180;
  const y = Math.floor(((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n);
  return { x, y };
}

const center = latLonToTile(lat, lon, zoom);
console.log(`Center tile: ${center.x}, ${center.y} (zoom ${zoom})`);
console.log(`Radius: ${radius} → grid ${2 * radius + 1}×${2 * radius + 1} = ${(2 * radius + 1) ** 2} tiles per source`);

const sources = [
  {
    name: 'terrarium',
    ext: 'png',
    urlTemplate: (z, x, y) => `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${z}/${x}/${y}.png`,
  },
  {
    name: 'osm',
    ext: 'png',
    urlTemplate: (z, x, y) => `https://tile.openstreetmap.org/${z}/${x}/${y}.png`,
  },
  {
    name: 'satellite',
    ext: 'jpg',
    urlTemplate: (z, x, y) =>
      `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${y}/${x}`,
  },
];

const cacheDir = join(process.cwd(), 'cache');

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function downloadTile(source, z, x, y) {
  const filePath = join(cacheDir, source.name, String(z), String(x), `${y}.${source.ext}`);
  if (existsSync(filePath)) return 'cached';

  const url = source.urlTemplate(z, x, y);
  const res = await fetch(url);
  if (!res.ok) {
    console.warn(`  FAIL ${source.name} ${z}/${x}/${y} → ${res.status}`);
    return 'failed';
  }

  const buffer = Buffer.from(await res.arrayBuffer());
  const dir = join(cacheDir, source.name, String(z), String(x));
  mkdirSync(dir, { recursive: true });
  writeFileSync(filePath, buffer);
  return 'downloaded';
}

async function main() {
  const maxTile = (1 << zoom) - 1;
  const tiles = [];

  for (let dx = -radius; dx <= radius; dx++) {
    for (let dy = -radius; dy <= radius; dy++) {
      const x = center.x + dx;
      const y = center.y + dy;
      if (x < 0 || x > maxTile || y < 0 || y > maxTile) continue;
      tiles.push({ x, y });
    }
  }

  const total = tiles.length * sources.length;
  let done = 0;
  let downloaded = 0;
  let cached = 0;
  let failed = 0;

  for (const tile of tiles) {
    for (const source of sources) {
      const result = await downloadTile(source, zoom, tile.x, tile.y);
      done++;
      if (result === 'downloaded') downloaded++;
      else if (result === 'cached') cached++;
      else failed++;

      if (done % 20 === 0 || done === total) {
        const pct = ((done / total) * 100).toFixed(1);
        process.stdout.write(`\r  [${pct}%] ${done}/${total} — ${downloaded} new, ${cached} cached, ${failed} failed`);
      }

      if (result === 'downloaded' && delay > 0) {
        await sleep(delay);
      }
    }
  }

  console.log('\nDone!');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
