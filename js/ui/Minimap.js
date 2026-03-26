import * as THREE from 'three';
import { CONFIG, update, onChange } from '../utils/config.js';
import Logger from '../utils/Logger.js';

import {
  TILE_SIZE,
  MINIMAP_GRID as GRID,
  MINIMAP_CACHE_LIMIT,
  MINIMAP_UPDATE_INTERVAL,
  MINIMAP_REDRAW_DEBOUNCE,
} from '../constants/terrain.js';

export default class Minimap {
  constructor(canvas, geoTerrainManager) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.geo = geoTerrainManager;
    this.container = document.getElementById('minimap-container');

    this._tileCache = new Map(); // "z/x/y" -> Image
    this._pendingLoads = new Set();
    this._worldDir = new THREE.Vector3();
    this._flightPlanRecorder = null;

    // Last draw parameters — used to redraw when tiles arrive
    this._drawParams = null; // { lat, lon, zoom, yaw }
    this._redrawTimer = null;
    // Sprint 3.2: throttle update to ~20Hz (every 3 frames)
    this._frameCounter = 0;

    this._setupControls();
    this._applyVisibility();
    onChange((key) => {
      if (key === 'showMinimap') {
        this._applyVisibility();
      }
    });
  }

  setFlightPlanRecorder(recorder) {
    this._flightPlanRecorder = recorder;
  }

  _setupControls() {
    document.getElementById('minimap-zoom-in').addEventListener('click', () => {
      update('minimapZoom', Math.min(CONFIG.minimapZoom + 1, 18));
    });
    document.getElementById('minimap-zoom-out').addEventListener('click', () => {
      update('minimapZoom', Math.max(CONFIG.minimapZoom - 1, 3));
    });

    this.container.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        if (e.deltaY < 0) {
          update('minimapZoom', Math.min(CONFIG.minimapZoom + 1, 18));
        } else {
          update('minimapZoom', Math.max(CONFIG.minimapZoom - 1, 3));
        }
      },
      { passive: false },
    );
  }

  _applyVisibility() {
    const visible = CONFIG.showMinimap;
    this.container.style.display = visible ? 'flex' : 'none';
  }

  /** Called every frame from the animation loop. */
  update(camera, aircraftState) {
    if (!CONFIG.showMinimap) return;
    if (!this.geo.tileMap) return;

    // Sprint 3.2: only run every 3 frames (~20Hz at 60fps)
    this._frameCounter++;
    if (this._frameCounter % MINIMAP_UPDATE_INTERVAL !== 0) return;

    // Convert world �� lat/lon via three-tile coordinate API
    let geo;
    try {
      geo = this.geo.tileMap.world2geo(new THREE.Vector3(camera.position.x, camera.position.y, camera.position.z));
    } catch {
      return;
    }

    const latitude = geo.y;
    const longitude = geo.x;
    if (isNaN(latitude) || isNaN(longitude)) return;

    let yaw;
    if (aircraftState) {
      // FlightController convention: 0 = north; convert to atan2(dir.x, dir.z) convention: π = north
      yaw = aircraftState.yaw + Math.PI;
    } else {
      const dir = camera.getWorldDirection(this._worldDir);
      yaw = Math.atan2(dir.x, dir.z);
    }
    const zoom = CONFIG.minimapZoom;

    // Only redraw when something actually changed
    const p = this._drawParams;
    if (
      p &&
      Math.round(latitude * 1e5) === Math.round(p.lat * 1e5) &&
      Math.round(longitude * 1e5) === Math.round(p.lon * 1e5) &&
      zoom === p.zoom &&
      Math.round(yaw * 100) === Math.round(p.yaw * 100)
    ) {
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
    const latRad = (lat * Math.PI) / 180;
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
    this._drawFlightPlan(p, offsetX, offsetY, centerTileX, centerTileY);

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

  _worldToPixel(worldX, worldZ, offsetX, offsetY, centerTileX, centerTileY, zoom) {
    if (!this.geo.tileMap) return null;

    // World → lat/lon via three-tile
    let geo;
    try {
      geo = this.geo.tileMap.world2geo(new THREE.Vector3(worldX, 0, worldZ));
    } catch {
      return null;
    }
    const latitude = geo.y;
    const longitude = geo.x;
    if (isNaN(latitude) || isNaN(longitude)) return null;

    const n = 1 << zoom;
    const xTile = ((longitude + 180) / 360) * n;
    const latRad = (latitude * Math.PI) / 180;
    const yTile = ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n;

    const px = offsetX + (xTile - centerTileX) * TILE_SIZE;
    const py = offsetY + (yTile - centerTileY) * TILE_SIZE;
    return { x: px, y: py };
  }

  _drawFlightPlan(drawParams, offsetX, offsetY, centerTileX, centerTileY) {
    if (!this._flightPlanRecorder) return;
    const recorder = this._flightPlanRecorder;
    const waypoints = recorder.getWaypoints();
    const plan = recorder.getPlan();
    const zoom = drawParams.zoom;
    const ctx = this.ctx;

    // Draw spline if plan is built
    if (plan && recorder.autopilotActive) {
      const splinePoints = plan.getSplinePoints(200);
      ctx.save();
      ctx.strokeStyle = '#ffaa00';
      ctx.lineWidth = 2;
      ctx.globalAlpha = 0.7;
      ctx.setLineDash([6, 4]);
      ctx.beginPath();
      let started = false;
      for (const pt of splinePoints) {
        const px = this._worldToPixel(pt.x, pt.z, offsetX, offsetY, centerTileX, centerTileY, zoom);
        if (!px) continue;
        if (!started) {
          ctx.moveTo(px.x, px.y);
          started = true;
        } else {
          ctx.lineTo(px.x, px.y);
        }
      }
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
    }

    // Draw waypoints
    if (waypoints.length === 0) return;
    ctx.save();
    ctx.font = 'bold 9px Courier New';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';

    for (let i = 0; i < waypoints.length; i++) {
      const wp = waypoints[i];
      const px = this._worldToPixel(wp.position.x, wp.position.z, offsetX, offsetY, centerTileX, centerTileY, zoom);
      if (!px) continue;

      // Color: green (first), red (last), orange (intermediate)
      let color;
      if (i === 0) color = '#00ff88';
      else if (i === waypoints.length - 1) color = '#ff4444';
      else color = '#ffaa00';

      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(px.x, px.y, 4, 0, Math.PI * 2);
      ctx.fill();

      // Border
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 1;
      ctx.stroke();

      // Number label
      ctx.fillStyle = '#fff';
      ctx.fillText(String(i + 1), px.x, px.y - 6);
    }

    ctx.restore();
  }

  /** Batch tile-load redraws — one repaint per 100ms burst. */
  _scheduleRedraw() {
    if (this._redrawTimer) return;
    this._redrawTimer = setTimeout(() => {
      this._redrawTimer = null;
      this._draw();
    }, MINIMAP_REDRAW_DEBOUNCE);
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
      if (this._tileCache.size > MINIMAP_CACHE_LIMIT) {
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
