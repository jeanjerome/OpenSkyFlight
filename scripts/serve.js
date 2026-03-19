#!/usr/bin/env node

// Dev server with transparent tile caching proxy.
// Serves static files and intercepts /tiles/{source}/{z}/{x}/{y}.png requests:
//   - If the tile exists in cache/{source}/{z}/{x}/{y}.png → serve from disk
//   - Otherwise → fetch from remote, save to cache/, and return
//
// Usage: node scripts/serve.js [--port 3000]

import { createServer } from 'node:http';
import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises';
import { join, extname } from 'node:path';
import { parseArgs } from 'node:util';

const { values } = parseArgs({
  options: {
    port: { type: 'string', default: '3000' },
  },
});

const PORT = parseInt(values.port, 10);
const ROOT = process.cwd();
const CACHE_DIR = join(ROOT, 'cache');

// Semaphore: limit concurrent outbound fetches to upstream servers
const MAX_OUTBOUND = 6;
let outboundCount = 0;
const outboundQueue = [];

function acquireOutbound() {
  if (outboundCount < MAX_OUTBOUND) {
    outboundCount++;
    return Promise.resolve();
  }
  return new Promise((resolve) => outboundQueue.push(resolve));
}

function releaseOutbound() {
  if (outboundQueue.length > 0) {
    const next = outboundQueue.shift();
    next();
  } else {
    outboundCount--;
  }
}

const SOURCES = {
  terrarium: (z, x, y) => `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${z}/${x}/${y}.png`,
  osm: (z, x, y) => `https://tile.openstreetmap.org/${z}/${x}/${y}.png`,
  satellite: (z, x, y) =>
    `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${y}/${x}`,
};

const MIME = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

// Content types per source (ESRI satellite returns JPEG, others PNG)
const SOURCE_CONTENT_TYPE = {
  terrarium: 'image/png',
  osm: 'image/png',
  satellite: 'image/jpeg',
};

async function serveTile(req, res, source, z, x, y) {
  const ext = source === 'satellite' ? 'jpg' : 'png';
  const cachePath = join(CACHE_DIR, source, z, x, `${y}.${ext}`);
  const contentType = SOURCE_CONTENT_TYPE[source] || 'image/png';

  // Try cache first
  try {
    const data = await readFile(cachePath);
    res.writeHead(200, { 'Content-Type': contentType, 'X-Cache': 'HIT' });
    res.end(data);
    return;
  } catch (_) {
    /* cache miss */
  }

  // Fetch from remote
  const urlFn = SOURCES[source];
  if (!urlFn) {
    res.writeHead(404);
    res.end('Unknown tile source');
    return;
  }

  const remoteUrl = urlFn(z, x, y);
  await acquireOutbound();
  try {
    const remote = await fetch(remoteUrl);
    if (!remote.ok) {
      res.writeHead(remote.status);
      res.end(`Remote fetch failed: ${remote.status}`);
      return;
    }

    const buffer = Buffer.from(await remote.arrayBuffer());

    // Save to cache (fire and forget — don't block the response)
    const dir = join(CACHE_DIR, source, z, x);
    mkdir(dir, { recursive: true })
      .then(() => writeFile(cachePath, buffer))
      .catch(() => {});

    res.writeHead(200, { 'Content-Type': contentType, 'X-Cache': 'MISS' });
    res.end(buffer);
  } catch (err) {
    res.writeHead(502);
    res.end(`Proxy error: ${err.message}`);
  } finally {
    releaseOutbound();
  }
}

async function serveStatic(req, res, urlPath) {
  const safePath = urlPath.replace(/\.\./g, '');
  const filePath = join(ROOT, safePath === '/' ? 'index.html' : safePath);
  const ext = extname(filePath);

  try {
    const data = await readFile(filePath);
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(data);
  } catch (_) {
    res.writeHead(404);
    res.end('Not found');
  }
}

const TILE_RE = /^\/tiles\/(\w+)\/(\d+)\/(\d+)\/(\d+)\.png$/;
const FLIGHTPLANS_DIR = join(ROOT, 'assets', 'flightplans');

async function serveFlightPlanList(req, res) {
  try {
    const entries = await readdir(FLIGHTPLANS_DIR);
    const files = entries.filter((f) => f.endsWith('.json')).sort();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(files));
  } catch (_) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end('[]');
  }
}

const server = createServer((req, res) => {
  const urlPath = req.url.split('?')[0];
  const match = urlPath.match(TILE_RE);
  if (match) {
    const [, source, z, x, y] = match;
    serveTile(req, res, source, z, x, y);
  } else if (urlPath === '/api/flightplans') {
    serveFlightPlanList(req, res);
  } else {
    serveStatic(req, res, urlPath);
  }
});

server.listen(PORT, () => {
  console.log(`OpenSkyFlight — http://localhost:${PORT}`);
  console.log(`Tile cache: ${CACHE_DIR}`);
  console.log(`Tile proxy: /tiles/{terrarium,osm,satellite}/{z}/{x}/{y}.png`);
});
