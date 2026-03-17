// Fetches raster tiles (OSM or satellite) as THREE.Texture

import * as THREE from 'three';
import { acquireFetch, releaseFetch } from './fetchSemaphore.js';
import Logger from '../utils/Logger.js';
export default class TextureProvider {
  constructor() {
    this._cache = new Map();
    this._maxAnisotropy = 1; // will be set via setRenderer
  }

  /**
   * Pass the renderer to enable anisotropic filtering.
   * Call once after renderer creation.
   */
  setRenderer(renderer) {
    this._maxAnisotropy = renderer.capabilities.getMaxAnisotropy();
    Logger.debug('Texture', `Max anisotropy: ${this._maxAnisotropy}`);
  }

  /**
   * @param {number} tileX
   * @param {number} tileY
   * @param {number} zoom
   * @param {'osm'|'satellite'} source - tile source (default 'osm')
   */
  async fetchTexture(tileX, tileY, zoom, source = 'osm') {
    const key = `${source}/${zoom}/${tileX}/${tileY}`;
    if (this._cache.has(key)) {
      Logger.debug('Texture', `Cache hit: ${key}`);
      return this._cache.get(key);
    }

    await acquireFetch();
    try {
      if (this._cache.has(key)) return this._cache.get(key);

      const url = `tiles/${source}/${zoom}/${tileX}/${tileY}.png`;
      const response = await fetch(url);
      if (!response.ok) throw new Error(`Failed to load ${source} tile: ${url}`);
      const blob = await response.blob();
      const bitmap = await createImageBitmap(blob);

      const texture = new THREE.CanvasTexture(bitmap);
      // Sprint 2.5: trilinear filtering + mipmaps + anisotropy
      texture.generateMipmaps = true;
      texture.minFilter = THREE.LinearMipmapLinearFilter;
      texture.magFilter = THREE.LinearFilter;
      texture.wrapS = THREE.ClampToEdgeWrapping;
      texture.wrapT = THREE.ClampToEdgeWrapping;
      if (this._maxAnisotropy > 1) {
        texture.anisotropy = this._maxAnisotropy;
      }

      Logger.info('Texture', `Fetched ${key}`);
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
