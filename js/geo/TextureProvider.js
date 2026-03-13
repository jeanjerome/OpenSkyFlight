// Fetches raster tiles (OSM or satellite) as THREE.Texture

import * as THREE from 'three';
import { acquireFetch, releaseFetch } from './fetchSemaphore.js';

export default class TextureProvider {
  constructor() {
    this._cache = new Map();
  }

  /**
   * @param {number} tileX
   * @param {number} tileY
   * @param {number} zoom
   * @param {'osm'|'satellite'} source - tile source (default 'osm')
   */
  async fetchTexture(tileX, tileY, zoom, source = 'osm') {
    const key = `${source}/${zoom}/${tileX}/${tileY}`;
    if (this._cache.has(key)) return this._cache.get(key);

    await acquireFetch();
    try {
      if (this._cache.has(key)) return this._cache.get(key);

      const url = `tiles/${source}/${zoom}/${tileX}/${tileY}.png`;
      const response = await fetch(url);
      if (!response.ok) throw new Error(`Failed to load ${source} tile: ${url}`);
      const blob = await response.blob();
      const bitmap = await createImageBitmap(blob);

      const texture = new THREE.CanvasTexture(bitmap);
      texture.minFilter = THREE.LinearFilter;
      texture.magFilter = THREE.LinearFilter;
      texture.wrapS = THREE.ClampToEdgeWrapping;
      texture.wrapT = THREE.ClampToEdgeWrapping;

      this._cache.set(key, texture);
      return texture;
    } finally {
      releaseFetch();
    }
  }

  clearCache() {
    for (const tex of this._cache.values()) tex.dispose();
    this._cache.clear();
  }
}
