import { MapProvider } from 'geo-three';
import { SOURCE_MAX_ZOOM, TILE_SIZE } from '../constants/terrain.js';

/**
 * Fetches Terrarium-encoded elevation tiles from the local proxy.
 * Returns raw Terrarium PNG images (no CPU re-encoding).
 *
 * Terrarium: h = R*256 + G + B/256 - 32768
 *
 * Decoding is performed on the GPU via TSL positionNode in MapHeightNodeShader.
 *
 * Source tiles go up to zoom 15. For zoom > 15, the parent tile at zoom 15
 * is fetched and the relevant sub-region is extracted and upscaled.
 */

export default class TerrariumProvider extends MapProvider {
  constructor() {
    super();
    this.minZoom = 0;
    this.maxZoom = 18;
    this._parentCache = new Map();
  }

  async fetchTile(zoom, x, y) {
    if (zoom <= SOURCE_MAX_ZOOM) {
      return this._fetchImage(zoom, x, y);
    }

    // Upsample from parent tile at SOURCE_MAX_ZOOM
    const dz = zoom - SOURCE_MAX_ZOOM;
    const parentX = x >> dz;
    const parentY = y >> dz;
    const scale = 1 << dz;
    const localX = x - (parentX << dz);
    const localY = y - (parentY << dz);
    const srcSize = TILE_SIZE / scale;
    const srcX = localX * srcSize;
    const srcY = localY * srcSize;

    const parentImage = await this._getParentImage(parentX, parentY);
    if (!parentImage) return this._flatImage();

    // Extract sub-region from parent and upscale to TILE_SIZE x TILE_SIZE
    const size = TILE_SIZE;
    const srcCanvas = document.createElement('canvas');
    srcCanvas.width = size;
    srcCanvas.height = size;
    const srcCtx = srcCanvas.getContext('2d');
    srcCtx.drawImage(parentImage, 0, 0, size, size);
    const srcData = srcCtx.getImageData(srcX, srcY, srcSize, srcSize);

    // Upscale with bilinear interpolation, output stays Terrarium-encoded
    return this._upsampleTerrariumTile(srcData, srcSize);
  }

  /**
   * Fetch a raw Terrarium PNG tile and return the HTMLImageElement directly.
   */
  _fetchImage(zoom, x, y) {
    return new Promise((resolve) => {
      const path = `/tiles/terrarium/${zoom}/${x}/${y}.png`;
      const image = new Image();
      image.crossOrigin = 'anonymous';

      image.onload = () => {
        resolve(image);
      };
      image.onerror = () => {
        resolve(this._flatImage());
      };
      image.src = path;
    });
  }

  _getParentImage(parentX, parentY) {
    const key = `${parentX}/${parentY}`;
    if (this._parentCache.has(key)) {
      return this._parentCache.get(key);
    }

    const promise = new Promise((resolve) => {
      const path = `/tiles/terrarium/${SOURCE_MAX_ZOOM}/${parentX}/${parentY}.png`;
      const image = new Image();
      image.crossOrigin = 'anonymous';
      image.onload = () => resolve(image);
      image.onerror = () => resolve(null);
      image.src = path;
    });

    this._parentCache.set(key, promise);
    return promise;
  }

  /**
   * Upsample a sub-region with bilinear interpolation, outputting Terrarium-encoded pixels.
   */
  _upsampleTerrariumTile(srcData, srcSize) {
    const size = TILE_SIZE;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    const outData = ctx.createImageData(size, size);
    const out = outData.data;
    const src = srcData.data;

    for (let dy = 0; dy < size; dy++) {
      for (let dx = 0; dx < size; dx++) {
        // Map destination pixel to source position
        const sx = ((dx + 0.5) * srcSize) / size - 0.5;
        const sy = ((dy + 0.5) * srcSize) / size - 0.5;
        const x0 = Math.max(0, Math.floor(sx));
        const y0 = Math.max(0, Math.floor(sy));
        const x1 = Math.min(srcSize - 1, x0 + 1);
        const y1 = Math.min(srcSize - 1, y0 + 1);
        const fx = sx - x0;
        const fy = sy - y0;

        // Decode Terrarium at 4 corners
        const h00 = this._decodeTerrariumAt(src, y0 * srcSize + x0);
        const h10 = this._decodeTerrariumAt(src, y0 * srcSize + x1);
        const h01 = this._decodeTerrariumAt(src, y1 * srcSize + x0);
        const h11 = this._decodeTerrariumAt(src, y1 * srcSize + x1);

        // Bilinear interpolation
        const h = h00 * (1 - fx) * (1 - fy) + h10 * fx * (1 - fy) + h01 * (1 - fx) * fy + h11 * fx * fy;

        // Re-encode as Terrarium: R*256 + G + B/256 - 32768 = h
        // → R*256 + G + B/256 = h + 32768
        const hClamped = Math.max(0, h + 32768);
        const p = (dy * size + dx) * 4;
        out[p] = Math.floor(hClamped / 256) & 0xff; // R
        out[p + 1] = Math.floor(hClamped) & 0xff; // G
        out[p + 2] = Math.floor((hClamped % 1) * 256) & 0xff; // B
        out[p + 3] = 255;
      }
    }

    ctx.putImageData(outData, 0, 0);
    return canvas;
  }

  _decodeTerrariumAt(pixels, index) {
    const p = index * 4;
    return pixels[p] * 256 + pixels[p + 1] + pixels[p + 2] / 256 - 32768;
  }

  /**
   * Return a 1x1 canvas encoding sea-level (h=0) in Terrarium format.
   * h=0 → R=128, G=0, B=0 (128*256 + 0 + 0/256 - 32768 = 0)
   */
  _flatImage() {
    const canvas = document.createElement('canvas');
    canvas.width = 1;
    canvas.height = 1;
    const ctx = canvas.getContext('2d');
    const imageData = ctx.createImageData(1, 1);
    const pixels = imageData.data;
    pixels[0] = 128; // R
    pixels[1] = 0; // G
    pixels[2] = 0; // B
    pixels[3] = 255;
    ctx.putImageData(imageData, 0, 0);
    return canvas;
  }
}
