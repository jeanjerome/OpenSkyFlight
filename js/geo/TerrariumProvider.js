import { MapProvider } from 'geo-three';

/**
 * Fetches Terrarium-encoded elevation tiles from the local proxy,
 * decodes them, and re-encodes to Mapbox terrain-RGB format
 * expected by geo-three's HEIGHT_SHADER mode.
 *
 * Terrarium: h = R*256 + G + B/256 - 32768
 * Mapbox:    val = (h + 10000) * 10  →  R = val>>16, G = (val>>8)&0xFF, B = val&0xFF
 * Shader decodes: (R*65536 + G*256 + B) * 0.1 - 10000
 */
export default class TerrariumProvider extends MapProvider {
  constructor() {
    super();
    this.minZoom = 0;
    this.maxZoom = 15;
  }

  fetchTile(zoom, x, y) {
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
