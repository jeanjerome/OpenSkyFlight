// Fetches and decodes AWS Terrarium elevation tiles into Float32Array heightmaps
// Source: https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png
// Encoding: height = (R * 256 + G + B / 256) - 32768

import { acquireFetch, releaseFetch } from './fetchSemaphore.js';
import Logger from '../utils/Logger.js';

export default class ElevationProvider {
  constructor() {
    this._cache = new Map();
    this._pending = new Map(); // in-flight fetch promises, keyed by tile key
    this._canvas = document.createElement('canvas');
    this._canvas.width = 256;
    this._canvas.height = 256;
    this._ctx = this._canvas.getContext('2d', { willReadFrequently: true });
  }

  async fetchHeightmap(tileX, tileY, zoom) {
    const key = `${zoom}/${tileX}/${tileY}`;
    if (this._cache.has(key)) {
      Logger.debug('Elevation', `Cache hit: ${key}`);
      return this._cache.get(key);
    }

    // Deduplicate in-flight requests: return existing promise if fetch already running
    if (this._pending.has(key)) return this._pending.get(key);

    const promise = this._doFetch(key, tileX, tileY, zoom);
    this._pending.set(key, promise);
    promise.finally(() => this._pending.delete(key));
    return promise;
  }

  async _doFetch(key, tileX, tileY, zoom) {
    await acquireFetch();
    try {
      // Check cache again — another request may have populated it while queued
      if (this._cache.has(key)) return this._cache.get(key);

      const url = `tiles/terrarium/${zoom}/${tileX}/${tileY}.png`;
      const response = await fetch(url);
      if (!response.ok) throw new Error(`Tile fetch failed (${response.status}): ${url}`);
      const blob = await response.blob();
      const bitmap = await createImageBitmap(blob);

      this._ctx.clearRect(0, 0, 256, 256);
      this._ctx.drawImage(bitmap, 0, 0, 256, 256);
      bitmap.close();

      const imageData = this._ctx.getImageData(0, 0, 256, 256);
      const pixels = imageData.data;

      const heightmap = new Float32Array(256 * 256);
      let min = Infinity, max = -Infinity;
      for (let i = 0; i < 256 * 256; i++) {
        const p = i * 4;
        const r = pixels[p];
        const g = pixels[p + 1];
        const b = pixels[p + 2];
        const h = (r * 256 + g + b / 256) - 32768;
        heightmap[i] = h;
        if (h < min) min = h;
        if (h > max) max = h;
      }

      Logger.info('Elevation', `Fetched ${key}`, { min: Math.round(min), max: Math.round(max) });

      this._cache.set(key, heightmap);
      return heightmap;
    } finally {
      releaseFetch();
    }
  }

  clearCache() {
    this._cache.clear();
    this._pending.clear();
  }
}
