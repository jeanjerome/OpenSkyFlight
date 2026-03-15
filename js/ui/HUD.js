import { CONFIG } from '../utils/config.js';

const HUD_COLOR = '#00ff88';
const HUD_ALPHA = 0.85;
const HUD_SHADOW_COLOR = 'rgba(0, 0, 0, 0.9)';
const HUD_SHADOW_BLUR = 6;
const BADGE_HEIGHT = 24;
const BADGE_SPACING = 30;
const COMPASS_POINTS = [
  { deg: 0, label: 'N' },
  { deg: 45, label: 'NE' },
  { deg: 90, label: 'E' },
  { deg: 135, label: 'SE' },
  { deg: 180, label: 'S' },
  { deg: 225, label: 'SW' },
  { deg: 270, label: 'W' },
  { deg: 315, label: 'NW' },
];

export default class HUD {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.w = 0;
    this.h = 0;
    this.showStats = false;
    this.statsText = '';
    this.prevPos = null;
    this.groundSpeed = 0;
    this.resize();
  }

  toggleStats() {
    this.showStats = !this.showStats;
    return this.showStats;
  }

  setStats(text) {
    this.statsText = text;
  }

  resize(w, h) {
    const dpr = window.devicePixelRatio || 1;
    this.w = w || window.innerWidth;
    this.h = h || window.innerHeight;
    this.canvas.width = this.w * dpr;
    this.canvas.height = this.h * dpr;
    this.canvas.style.width = this.w + 'px';
    this.canvas.style.height = this.h + 'px';
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  update(camera, groundElevation, benchmarkRunner, dt) {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.w, this.h);

    const yaw = camera.rotation.y;
    const pitch = camera.rotation.x;
    const altY = camera.position.y;

    // Compute ground speed (horizontal distance / dt)
    const px = camera.position.x;
    const pz = camera.position.z;
    if (this.prevPos && dt > 0) {
      const dx = px - this.prevPos.x;
      const dz = pz - this.prevPos.z;
      const dist = Math.sqrt(dx * dx + dz * dz);
      // Smooth the speed display
      const instant = dist / dt;
      this.groundSpeed += (instant - this.groundSpeed) * Math.min(1, 5 * dt);
    }
    this.prevPos = { x: px, z: pz };

    this._drawCompass(ctx, yaw);
    this._drawHorizon(ctx, pitch);
    this._drawAltimeter(ctx, altY, groundElevation);
    this._drawSpeed(ctx, this.groundSpeed);
    // Top-right badges: stack vertically
    let badgeY = 44;
    if (this.showStats && this.statsText) {
      this._drawStatsBadge(ctx, badgeY);
      badgeY += BADGE_SPACING;
    }
    if (CONFIG.hiResMode) {
      this._drawHiResBadge(ctx, badgeY);
      badgeY += BADGE_SPACING;
    }
    if (benchmarkRunner && benchmarkRunner.isRunning()) {
      if (benchmarkRunner.isWarmup()) {
        this._drawBenchmarkWarmup(ctx, benchmarkRunner.getWarmupRemaining(), badgeY);
      } else {
        this._drawBenchmarkBadge(ctx, benchmarkRunner.getElapsed(), badgeY);
      }
    }
  }

  _applyHudShadow(ctx) {
    ctx.shadowColor = HUD_SHADOW_COLOR;
    ctx.shadowBlur = HUD_SHADOW_BLUR;
  }

  // --- Compass / Heading (top center) ---
  _drawCompass(ctx, yaw) {
    const cx = this.w / 2;
    const bandW = 400;
    const bandY = 40;
    const bandH = 28;

    // Heading in degrees (0=N, 90=E, 180=S, 270=W)
    let headingDeg = (-yaw * 180 / Math.PI) % 360;
    if (headingDeg < 0) headingDeg += 360;

    ctx.save();
    this._applyHudShadow(ctx);
    ctx.beginPath();
    ctx.rect(cx - bandW / 2, bandY - 2, bandW, bandH + 20);
    ctx.clip();

    ctx.globalAlpha = HUD_ALPHA;
    ctx.strokeStyle = HUD_COLOR;
    ctx.fillStyle = HUD_COLOR;
    ctx.lineWidth = 1;

    // Draw tick marks and labels
    const pxPerDeg = bandW / 90; // 90° visible range
    for (let d = -180; d <= 540; d += 5) {
      let diff = d - headingDeg;
      // Wrap around
      while (diff > 180) diff -= 360;
      while (diff < -180) diff += 360;

      const x = cx + diff * pxPerDeg;
      if (x < cx - bandW / 2 - 10 || x > cx + bandW / 2 + 10) continue;

      const isMajor = d % 10 === 0;
      ctx.beginPath();
      ctx.moveTo(x, bandY);
      ctx.lineTo(x, bandY + (isMajor ? 12 : 6));
      ctx.stroke();
    }

    // Cardinal/intercardinal labels
    ctx.font = 'bold 14px Courier New';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    for (const pt of COMPASS_POINTS) {
      let diff = pt.deg - headingDeg;
      while (diff > 180) diff -= 360;
      while (diff < -180) diff += 360;

      const x = cx + diff * pxPerDeg;
      if (x < cx - bandW / 2 - 20 || x > cx + bandW / 2 + 20) continue;

      ctx.fillText(pt.label, x, bandY + 14);
    }

    // Center marker
    ctx.beginPath();
    ctx.moveTo(cx, bandY - 2);
    ctx.lineTo(cx - 5, bandY - 8);
    ctx.lineTo(cx + 5, bandY - 8);
    ctx.closePath();
    ctx.fill();

    ctx.restore();

    // Heading readout
    this._applyHudShadow(ctx);
    ctx.globalAlpha = HUD_ALPHA;
    ctx.fillStyle = HUD_COLOR;
    ctx.font = 'bold 13px Courier New';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    const hdgStr = 'HDG ' + String(Math.round(headingDeg) % 360).padStart(3, '0') + '°';
    ctx.fillText(hdgStr, cx, bandY + bandH + 4);
  }

  // --- Artificial horizon (center) ---
  _drawHorizon(ctx, pitch) {
    const cx = this.w / 2;
    const cy = this.h / 2;
    const pxPerDeg = 8; // pixels per degree of pitch
    const pitchDeg = pitch * 180 / Math.PI;

    ctx.save();
    this._applyHudShadow(ctx);
    ctx.globalAlpha = HUD_ALPHA;
    ctx.strokeStyle = HUD_COLOR;
    ctx.fillStyle = HUD_COLOR;
    ctx.lineWidth = 1.5;

    // Horizon line offset: line goes UP when looking DOWN (negative pitch)
    const horizonY = cy - pitchDeg * pxPerDeg;

    // Main horizon line
    const lineW = 200;
    ctx.beginPath();
    ctx.moveTo(cx - lineW, horizonY);
    ctx.lineTo(cx - 40, horizonY);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx + 40, horizonY);
    ctx.lineTo(cx + lineW, horizonY);
    ctx.stroke();

    // Pitch ladder: every 10°
    ctx.font = '11px Courier New';
    ctx.textBaseline = 'middle';
    for (let deg = -90; deg <= 90; deg += 10) {
      if (deg === 0) continue;
      const y = cy - (deg - pitchDeg * -1) * pxPerDeg;
      // Only draw if within visible area
      if (y < cy - 150 || y > cy + 150) continue;

      // Recalculate: pitch ladder shows where each angle is relative to camera
      const ladderY = horizonY - deg * pxPerDeg;
      if (ladderY < cy - 150 || ladderY > cy + 150) continue;

      const tickW = deg % 20 === 0 ? 60 : 35;
      const isDashed = deg < 0;

      if (isDashed) {
        ctx.setLineDash([4, 4]);
      } else {
        ctx.setLineDash([]);
      }

      ctx.beginPath();
      ctx.moveTo(cx - tickW, ladderY);
      ctx.lineTo(cx - 20, ladderY);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(cx + 20, ladderY);
      ctx.lineTo(cx + tickW, ladderY);
      ctx.stroke();

      ctx.setLineDash([]);
      ctx.textAlign = 'right';
      ctx.fillText(deg > 0 ? '+' + deg : String(deg), cx - tickW - 4, ladderY);
      ctx.textAlign = 'left';
      ctx.fillText(deg > 0 ? '+' + deg : String(deg), cx + tickW + 4, ladderY);
    }

    // Center aircraft symbol (fixed)
    ctx.setLineDash([]);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx - 30, cy);
    ctx.lineTo(cx - 10, cy);
    ctx.lineTo(cx - 10, cy + 5);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx + 30, cy);
    ctx.lineTo(cx + 10, cy);
    ctx.lineTo(cx + 10, cy + 5);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx, cy, 3, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  // --- Altimeter (right of center) ---
  _drawAltimeter(ctx, altY, groundElevation) {
    const x = this.w / 2 + 250;
    const cy = this.h / 2;
    const scaleH = 200;

    // Convert to real-world meters in realworld mode
    let alt = altY;
    let agl = altY - groundElevation;
    let unit = '';

    if (CONFIG.terrainMode === 'realworld') {
      // In geo-three mode, camera Y and groundElevation are both in meters
      alt = altY;
      agl = altY - groundElevation;
      unit = 'm';
    }

    ctx.save();
    this._applyHudShadow(ctx);
    ctx.globalAlpha = HUD_ALPHA;
    ctx.strokeStyle = HUD_COLOR;
    ctx.fillStyle = HUD_COLOR;
    ctx.font = 'bold 13px Courier New';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';

    // Vertical scale
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, cy - scaleH / 2);
    ctx.lineTo(x, cy + scaleH / 2);
    ctx.stroke();

    // Cursor (current alt)
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x, cy);
    ctx.lineTo(x + 8, cy - 6);
    ctx.lineTo(x + 70, cy - 6);
    ctx.lineTo(x + 70, cy + 6);
    ctx.lineTo(x + 8, cy + 6);
    ctx.closePath();
    ctx.stroke();

    // ALT value
    ctx.fillText(Math.round(alt), x + 12, cy);

    // Tick marks on scale
    const step = CONFIG.terrainMode === 'realworld' ? 100 : 50;
    const pxPerUnit = scaleH / (step * 4);
    const baseAlt = Math.round(alt / step) * step;

    ctx.font = '10px Courier New';
    ctx.lineWidth = 1;
    for (let i = -4; i <= 4; i++) {
      const tickAlt = baseAlt + i * step;
      const tickY = cy - (tickAlt - alt) * pxPerUnit;
      if (tickY < cy - scaleH / 2 || tickY > cy + scaleH / 2) continue;

      ctx.beginPath();
      ctx.moveTo(x - 5, tickY);
      ctx.lineTo(x, tickY);
      ctx.stroke();

      ctx.textAlign = 'right';
      ctx.fillText(Math.round(tickAlt), x - 8, tickY);
    }

    // Labels
    ctx.font = 'bold 12px Courier New';
    ctx.textAlign = 'left';
    ctx.fillText('ALT' + (unit ? ' ' + unit : ''), x, cy - scaleH / 2 - 14);

    // AGL readout below scale
    ctx.font = 'bold 13px Courier New';
    ctx.fillText('AGL ' + Math.round(Math.max(0, agl)) + (unit ? ' ' + unit : ''), x - 10, cy + scaleH / 2 + 20);

    ctx.restore();
  }

  _getTileWorldSize() {
    // Approximate tile world size for current zoom
    const earthCircumference = 40075016.686;
    const tileWorldSize = earthCircumference / (1 << CONFIG.zoom);
    return { tileWorldSize };
  }

  // --- Speed indicator (left of center) ---
  _drawSpeed(ctx, speed) {
    const x = this.w / 2 - 250;
    const cy = this.h / 2;
    const scaleH = 200;

    ctx.save();
    this._applyHudShadow(ctx);
    ctx.globalAlpha = HUD_ALPHA;
    ctx.strokeStyle = HUD_COLOR;
    ctx.fillStyle = HUD_COLOR;

    // Vertical scale
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, cy - scaleH / 2);
    ctx.lineTo(x, cy + scaleH / 2);
    ctx.stroke();

    // Cursor
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x, cy);
    ctx.lineTo(x - 8, cy - 6);
    ctx.lineTo(x - 70, cy - 6);
    ctx.lineTo(x - 70, cy + 6);
    ctx.lineTo(x - 8, cy + 6);
    ctx.closePath();
    ctx.stroke();

    // Speed value
    ctx.font = 'bold 13px Courier New';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.fillText(Math.round(speed), x - 12, cy);

    // Label
    ctx.font = 'bold 12px Courier New';
    ctx.textAlign = 'right';
    ctx.fillText('SPD', x, cy - scaleH / 2 - 14);

    ctx.restore();
  }

  // --- Stats badge (top-right) ---
  _drawStatsBadge(ctx, y) {
    const x = this.w - 20;
    const label = this.statsText;

    ctx.save();
    ctx.font = 'bold 13px Courier New';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';

    const tw = ctx.measureText(label).width;
    const pad = 6;

    ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
    ctx.fillRect(x - tw - pad * 2, y - 12, tw + pad * 2, BADGE_HEIGHT);

    ctx.strokeStyle = HUD_COLOR;
    ctx.lineWidth = 1.5;
    ctx.globalAlpha = HUD_ALPHA;
    ctx.strokeRect(x - tw - pad * 2, y - 12, tw + pad * 2, BADGE_HEIGHT);

    ctx.fillStyle = HUD_COLOR;
    ctx.fillText(label, x - pad, y);

    ctx.restore();
  }

  // --- Hi-Res mode badge (top-right) ---
  _drawHiResBadge(ctx, y) {
    const label = 'HI-RES Z18';
    const x = this.w - 20;

    ctx.save();
    ctx.font = 'bold 13px Courier New';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';

    const tw = ctx.measureText(label).width;
    const pad = 6;

    // Background box
    ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
    ctx.fillRect(x - tw - pad * 2, y - 12, tw + pad * 2, 24);

    // Border
    ctx.strokeStyle = HUD_COLOR;
    ctx.lineWidth = 1.5;
    ctx.globalAlpha = HUD_ALPHA;
    ctx.strokeRect(x - tw - pad * 2, y - 12, tw + pad * 2, 24);

    // Text
    ctx.fillStyle = HUD_COLOR;
    ctx.fillText(label, x - pad, y);

    ctx.restore();
  }

  // --- Benchmark warmup badge (top-right) ---
  _drawBenchmarkWarmup(ctx, remaining, y) {
    const x = this.w - 20;
    const secs = Math.ceil(remaining);
    const label = `WARMUP  ${secs}s`;

    ctx.save();
    ctx.font = 'bold 13px Courier New';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';

    const tw = ctx.measureText(label).width;
    const pad = 6;

    ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
    ctx.fillRect(x - tw - pad * 2, y - 12, tw + pad * 2, 24);

    ctx.strokeStyle = '#ffaa00';
    ctx.lineWidth = 1.5;
    ctx.globalAlpha = 0.9;
    ctx.strokeRect(x - tw - pad * 2, y - 12, tw + pad * 2, 24);

    ctx.fillStyle = '#ffaa00';
    ctx.fillText(label, x - pad, y);

    ctx.restore();
  }

  // --- Benchmark recording badge (top-right) ---
  _drawBenchmarkBadge(ctx, elapsed, y) {
    const x = this.w - 20;
    const secs = Math.floor(elapsed);
    const label = `REC BENCHMARK  ${secs}s`;

    ctx.save();
    ctx.font = 'bold 13px Courier New';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';

    const tw = ctx.measureText(label).width;
    const dotSize = 8;
    const pad = 6;
    const totalW = dotSize + 8 + tw + pad * 2;

    // Background box
    ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
    ctx.fillRect(x - totalW, y - 12, totalW, 24);

    // Border
    ctx.strokeStyle = '#ff3333';
    ctx.lineWidth = 1.5;
    ctx.globalAlpha = 0.9;
    ctx.strokeRect(x - totalW, y - 12, totalW, 24);

    // Blinking red dot
    const blink = Math.floor(elapsed * 2) % 2 === 0;
    if (blink) {
      ctx.fillStyle = '#ff3333';
      ctx.beginPath();
      ctx.arc(x - totalW + pad + dotSize / 2, y, dotSize / 2, 0, Math.PI * 2);
      ctx.fill();
    }

    // Text
    ctx.fillStyle = '#ff3333';
    ctx.fillText(label, x - pad, y);

    ctx.restore();
  }
}
