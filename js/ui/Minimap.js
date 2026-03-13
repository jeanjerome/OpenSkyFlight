import * as THREE from 'three';
import { CONFIG, update, onChange } from '../utils/config.js';
import { UnitsUtils } from 'geo-three';
import Logger from '../utils/Logger.js';

const TILE_SIZE = 256;
const GRID = 5; // 5x5 tile grid

export default class Minimap {
  constructor(canvas, geoTerrainManager) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.geo = geoTerrainManager;
    this.container = document.getElementById('minimap-container');

    this._tileCache = new Map(); // "z/x/y" -> Image
    this._pendingLoads = new Set();
    this._worldDir = new THREE.Vector3();

    // Last draw parameters — used to redraw when tiles arrive
    this._drawParams = null; // { lat, lon, zoom, yaw }
    this._redrawTimer = null;

    this._setupControls();
    this._applyVisibility();
    onChange((key) => {
      if (key === 'showMinimap' || key === 'terrainMode') {
        this._applyVisibility();
      }
    });
  }

  _setupControls() {
    document.getElementById('minimap-zoom-in').addEventListener('click', () => {
      update('minimapZoom', Math.min(CONFIG.minimapZoom + 1, 18));
    });
    document.getElementById('minimap-zoom-out').addEventListener('click', () => {
      update('minimapZoom', Math.max(CONFIG.minimapZoom - 1, 3));
    });

    this.container.addEventListener('wheel', (e) => {
      e.preventDefault();
      if (e.deltaY < 0) {
        update('minimapZoom', Math.min(CONFIG.minimapZoom + 1, 18));
      } else {
        update('minimapZoom', Math.max(CONFIG.minimapZoom - 1, 3));
      }
    }, { passive: false });
  }

  _applyVisibility() {
    const visible = CONFIG.showMinimap && CONFIG.terrainMode === 'realworld';
    this.container.style.display = visible ? 'flex' : 'none';
  }

  /** Called every frame from the animation loop. */
  update(camera) {
    if (!CONFIG.showMinimap || CONFIG.terrainMode !== 'realworld') return;
    if (!this.geo.mapView) return;

    const mapView = this.geo.mapView;

    // Convert world → Mercator → lat/lon
    const mercX = camera.position.x - mapView.position.x;
    const mercY = mapView.position.z - camera.position.z;

    let latLon;
    try {
      latLon = UnitsUtils.sphericalToDatums(mercX, mercY);
    } catch {
      return;
    }

    const { latitude, longitude } = latLon;
    if (isNaN(latitude) || isNaN(longitude)) return;

    const dir = camera.getWorldDirection(this._worldDir);
    const yaw = Math.atan2(dir.x, dir.z);
    const zoom = CONFIG.minimapZoom;

    // Only redraw when something actually changed
    const p = this._drawParams;
    if (p &&
        Math.round(latitude * 1e5) === Math.round(p.lat * 1e5) &&
        Math.round(longitude * 1e5) === Math.round(p.lon * 1e5) &&
        zoom === p.zoom &&
        Math.round(yaw * 100) === Math.round(p.yaw * 100)) {
      return;
    }

    this._drawParams = { lat: latitude, lon: longitude, zoom, yaw };
    this._draw();
  }

  /** Redraw using saved parameters. Safe to call from tile onload. */
  _draw() {
    const p = this._drawParams;
    if (!p) return;

    const { lat, lon, zoom, yaw } = p;
    const ctx = this.ctx;
    const n = 1 << zoom;

    // Fractional tile coordinates
    const xTile = ((lon + 180) / 360) * n;
    const latRad = lat * Math.PI / 180;
    const yTile = ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n;

    const centerTileX = Math.floor(xTile);
    const centerTileY = Math.floor(yTile);

    const fracX = xTile - centerTileX;
    const fracY = yTile - centerTileY;

    const cw = this.canvas.width;
    const ch = this.canvas.height;
    const halfW = cw / 2;
    const halfH = ch / 2;

    const offsetX = halfW - fracX * TILE_SIZE;
    const offsetY = halfH - fracY * TILE_SIZE;

    ctx.clearRect(0, 0, cw, ch);

    const halfGrid = Math.floor(GRID / 2);
    for (let dy = -halfGrid; dy <= halfGrid; dy++) {
      for (let dx = -halfGrid; dx <= halfGrid; dx++) {
        const tx = centerTileX + dx;
        const ty = centerTileY + dy;

        if (ty < 0 || ty >= n) continue;
        const wrappedTx = ((tx % n) + n) % n;

        const px = offsetX + dx * TILE_SIZE;
        const py = offsetY + dy * TILE_SIZE;

        const img = this._getTile(zoom, wrappedTx, ty);
        if (img) {
          ctx.drawImage(img, px, py, TILE_SIZE, TILE_SIZE);
        } else {
          ctx.fillStyle = 'rgba(0, 20, 10, 0.6)';
          ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
        }
      }
    }

    this._drawMarker(halfW, halfH, yaw);

    // Zoom label
    ctx.fillStyle = 'rgba(0, 10, 5, 0.7)';
    ctx.fillRect(0, ch - 16, 40, 16);
    ctx.fillStyle = '#00cc66';
    ctx.font = '10px Courier New';
    ctx.fillText(`Z${zoom}`, 4, ch - 4);
  }

  _drawMarker(cx, cy, yaw) {
    const ctx = this.ctx;
    const size = 10;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(Math.PI - yaw);
    ctx.beginPath();
    ctx.moveTo(0, -size);
    ctx.lineTo(size * 0.6, size * 0.6);
    ctx.lineTo(0, size * 0.3);
    ctx.lineTo(-size * 0.6, size * 0.6);
    ctx.closePath();
    ctx.fillStyle = 'rgba(0, 255, 136, 0.9)';
    ctx.fill();
    ctx.strokeStyle = '#003322';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();
  }

  /** Batch tile-load redraws — one repaint per 100ms burst. */
  _scheduleRedraw() {
    if (this._redrawTimer) return;
    this._redrawTimer = setTimeout(() => {
      this._redrawTimer = null;
      this._draw();
    }, 100);
  }

  _getTile(z, x, y) {
    const key = `${z}/${x}/${y}`;
    if (this._tileCache.has(key)) return this._tileCache.get(key);
    if (this._pendingLoads.has(key)) return null;

    this._pendingLoads.add(key);
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = `/tiles/osm/${z}/${x}/${y}.png`;
    img.onload = () => {
      this._tileCache.set(key, img);
      this._pendingLoads.delete(key);
      if (this._tileCache.size > 200) {
        const first = this._tileCache.keys().next().value;
        this._tileCache.delete(first);
      }
      this._scheduleRedraw();
    };
    img.onerror = () => {
      this._pendingLoads.delete(key);
      Logger.warn('Minimap', `Tile ${key} load failed`);
      // Retry after delay (tile will be re-requested on next _draw)
      setTimeout(() => this._scheduleRedraw(), 1000);
    };
    return null;
  }
}
