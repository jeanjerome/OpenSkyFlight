import { MapProvider } from 'geo-three';

export default class LocalTileProvider extends MapProvider {
  constructor(source = 'satellite') {
    super();
    this.source = source;
    this.minZoom = 0;
    this.maxZoom = 20;
  }

  fetchTile(zoom, x, y) {
    return new Promise((resolve) => {
      const path = this.source === 'osm'
        ? `/tiles/osm/${zoom}/${x}/${y}.png`
        : `/tiles/satellite/${zoom}/${x}/${y}.png`;

      const image = new Image();
      image.crossOrigin = 'anonymous';
      image.onload = () => resolve(image);
      image.onerror = () => {
        // Fallback: 1×1 transparent canvas to unblock geo-three nodeReady
        const c = document.createElement('canvas');
        c.width = 1; c.height = 1;
        resolve(c);
      };
      image.src = path;
    });
  }
}
