import { MapProvider } from 'geo-three';

/**
 * Fetches Terrarium-encoded elevation tiles from the local proxy,
 * decodes them, and re-encodes to Mapbox terrain-RGB format
 * expected by geo-three's HEIGHT_SHADER mode.
 *
 * Terrarium: h = R*256 + G + B/256 - 32768
 * Mapbox:    val = (h + 10000) * 10  →  R = val>>16, G = (val>>8)&0xFF, B = val&0xFF
 * Shader decodes: (R*65536 + G*256 + B) * 0.1 - 10000
 *
 * Source tiles go up to zoom 15. For zoom > 15, the parent tile at zoom 15
 * is fetched and the relevant sub-region is extracted and upscaled.
 */
const SOURCE_MAX_ZOOM = 15;

export default class TerrariumProvider extends MapProvider {
  constructor() {
    super();
    this.minZoom = 0;
    this.maxZoom = 18;
    this._parentCache = new Map();
  }

  fetchTile(zoom, x, y) {
    if (zoom <= SOURCE_MAX_ZOOM) {
      return this._fetchAndReencode(zoom, x, y);
    }

    // Upsample from parent tile at SOURCE_MAX_ZOOM
    const dz = zoom - SOURCE_MAX_ZOOM;
    const parentX = x >> dz;
    const parentY = y >> dz;
    const scale = 1 << dz;
    const localX = x - (parentX << dz);
    const localY = y - (parentY << dz);
    const srcSize = 256 / scale;
    const srcX = localX * srcSize;
    const srcY = localY * srcSize;

    return this._getParentImage(parentX, parentY).then((parentImage) => {
      if (!parentImage) return this._flatCanvas();

      // Extract sub-region from parent and upscale to 256x256
      const size = 256;
      const srcCanvas = document.createElement('canvas');
      srcCanvas.width = size;
      srcCanvas.height = size;
      const srcCtx = srcCanvas.getContext('2d');
      srcCtx.drawImage(parentImage, 0, 0, size, size);
      const srcData = srcCtx.getImageData(srcX, srcY, srcSize, srcSize);

      // Upscale with bilinear interpolation and reencode
      return this._upsampleAndReencode(srcData, srcSize);
    });
  }

  _fetchAndReencode(zoom, x, y) {
    return new Promise((resolve) => {
      const path = `/tiles/terrarium/${zoom}/${x}/${y}.png`;
      const image = new Image();
      image.crossOrigin = 'anonymous';

      image.onload = () => {
        try {
          const canvas = this._reencode(image);
          resolve(canvas);
        } catch (err) {
          resolve(this._flatCanvas());
        }
      };
      image.onerror = () => {
        resolve(this._flatCanvas());
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

  _upsampleAndReencode(srcData, srcSize) {
    const size = 256;
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
        const sx = (dx + 0.5) * srcSize / size - 0.5;
        const sy = (dy + 0.5) * srcSize / size - 0.5;
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
        const h = h00 * (1 - fx) * (1 - fy) + h10 * fx * (1 - fy)
                + h01 * (1 - fx) * fy + h11 * fx * fy;

        // Encode Mapbox terrain-RGB
        const val = Math.round((h + 10000) * 10);
        const p = (dy * size + dx) * 4;
        out[p]     = (val >> 16) & 0xFF;
        out[p + 1] = (val >> 8) & 0xFF;
        out[p + 2] = val & 0xFF;
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

  _flatCanvas() {
    // Canvas encoding sea-level (h=0) in Mapbox terrain-RGB: val=(0+10000)*10=100000
    // R=1, G=134, B=160
    const size = 256;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    const imageData = ctx.createImageData(size, size);
    const pixels = imageData.data;
    for (let i = 0; i < size * size; i++) {
      const p = i * 4;
      pixels[p]     = 1;   // R
      pixels[p + 1] = 134; // G
      pixels[p + 2] = 160; // B
      pixels[p + 3] = 255;
    }
    ctx.putImageData(imageData, 0, 0);
    return canvas;
  }

  _reencode(image) {
    const size = 256;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');

    ctx.drawImage(image, 0, 0, size, size);
    const imageData = ctx.getImageData(0, 0, size, size);
    const pixels = imageData.data;

    for (let i = 0; i < size * size; i++) {
      const p = i * 4;
      const r = pixels[p];
      const g = pixels[p + 1];
      const b = pixels[p + 2];

      // Decode Terrarium
      const h = r * 256 + g + b / 256 - 32768;

      // Encode Mapbox terrain-RGB
      const val = Math.round((h + 10000) * 10);
      pixels[p]     = (val >> 16) & 0xFF;
      pixels[p + 1] = (val >> 8) & 0xFF;
      pixels[p + 2] = val & 0xFF;
      pixels[p + 3] = 255;
    }

    ctx.putImageData(imageData, 0, 0);
    return canvas;
  }
}
