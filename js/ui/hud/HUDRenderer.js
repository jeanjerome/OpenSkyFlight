import { CONFIG } from '../../utils/config.js';
import {
  HUD_COLOR,
  HUD_ALPHA,
  HUD_SHADOW_COLOR,
  HUD_SHADOW_BLUR,
  BADGE_SPACING,
  BADGE_START_Y,
  BADGE_PAD,
  BADGE_RIGHT_MARGIN,
  COMPASS_BAND_WIDTH,
  COMPASS_BAND_Y,
  COMPASS_BAND_HEIGHT,
  COMPASS_VISIBLE_RANGE,
  HORIZON_PX_PER_DEG,
  HORIZON_LINE_WIDTH,
  HORIZON_VISIBLE_RANGE,
  INSTRUMENT_OFFSET_X,
  INSTRUMENT_SCALE_HEIGHT,
  BENCH_DOT_SIZE,
  BENCH_COLOR,
  WARN_COLOR,
  COMPASS_POINTS,
} from '../../constants/hud.js';

/**
 * Canvas renderer for HUD instruments: compass, horizon, altimeter, speed, badges.
 */
export default class HUDRenderer {
  constructor(ctx) {
    this._ctx = ctx;
  }

  drawInstruments(w, h, yaw, pitch, altY, groundElevation, speed) {
    const ctx = this._ctx;
    this._drawCompass(ctx, w, yaw);
    this._drawHorizon(ctx, w, h, pitch);
    this._drawAltimeter(ctx, w, h, altY, groundElevation);
    this._drawSpeed(ctx, w, h, speed);
  }

  drawBadges(w, benchmarkRunner, isRecording, wpCount, isAutopilot, fpRec) {
    const ctx = this._ctx;
    let badgeY = BADGE_START_Y;

    if (CONFIG.hiResMode) {
      this._drawHiResBadge(ctx, w, badgeY);
      badgeY += BADGE_SPACING;
    }
    if (benchmarkRunner && benchmarkRunner.isRunning()) {
      if (benchmarkRunner.isWarmup()) {
        this._drawBenchmarkWarmup(ctx, w, benchmarkRunner.getWarmupRemaining(), badgeY);
      } else {
        this._drawBenchmarkBadge(ctx, w, benchmarkRunner.getElapsed(), badgeY);
      }
      badgeY += BADGE_SPACING;
    }
    if (isRecording) {
      this._drawFlightPlanRecBadge(ctx, w, wpCount, badgeY);
      badgeY += BADGE_SPACING;
    }
    if (isAutopilot && fpRec && fpRec.getPlan()) {
      const plan = fpRec.getPlan();
      const nextWp = plan.getNextWaypointIndex();
      const totalWp = fpRec.getWaypointCount();
      const progressPct = Math.round(plan.getProgress() * 100);
      this._drawAutopilotBadge(ctx, w, nextWp, totalWp, progressPct, badgeY);
    }
  }

  _applyHudShadow(ctx) {
    ctx.shadowColor = HUD_SHADOW_COLOR;
    ctx.shadowBlur = HUD_SHADOW_BLUR;
  }

  _drawCompass(ctx, w, yaw) {
    const cx = w / 2;
    let headingDeg = ((-yaw * 180) / Math.PI) % 360;
    if (headingDeg < 0) headingDeg += 360;

    ctx.save();
    this._applyHudShadow(ctx);
    ctx.beginPath();
    ctx.rect(cx - COMPASS_BAND_WIDTH / 2, COMPASS_BAND_Y - 2, COMPASS_BAND_WIDTH, COMPASS_BAND_HEIGHT + 20);
    ctx.clip();

    ctx.globalAlpha = HUD_ALPHA;
    ctx.strokeStyle = HUD_COLOR;
    ctx.fillStyle = HUD_COLOR;
    ctx.lineWidth = 1;

    const pxPerDeg = COMPASS_BAND_WIDTH / COMPASS_VISIBLE_RANGE;
    for (let d = -180; d <= 540; d += 5) {
      let diff = d - headingDeg;
      while (diff > 180) diff -= 360;
      while (diff < -180) diff += 360;

      const x = cx + diff * pxPerDeg;
      if (x < cx - COMPASS_BAND_WIDTH / 2 - 10 || x > cx + COMPASS_BAND_WIDTH / 2 + 10) continue;

      const isMajor = d % 10 === 0;
      ctx.beginPath();
      ctx.moveTo(x, COMPASS_BAND_Y);
      ctx.lineTo(x, COMPASS_BAND_Y + (isMajor ? 12 : 6));
      ctx.stroke();
    }

    ctx.font = 'bold 14px Courier New';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    for (const pt of COMPASS_POINTS) {
      let diff = pt.deg - headingDeg;
      while (diff > 180) diff -= 360;
      while (diff < -180) diff += 360;

      const x = cx + diff * pxPerDeg;
      if (x < cx - COMPASS_BAND_WIDTH / 2 - 20 || x > cx + COMPASS_BAND_WIDTH / 2 + 20) continue;

      ctx.fillText(pt.label, x, COMPASS_BAND_Y + 14);
    }

    ctx.beginPath();
    ctx.moveTo(cx, COMPASS_BAND_Y - 2);
    ctx.lineTo(cx - 5, COMPASS_BAND_Y - 8);
    ctx.lineTo(cx + 5, COMPASS_BAND_Y - 8);
    ctx.closePath();
    ctx.fill();

    ctx.restore();

    this._applyHudShadow(ctx);
    ctx.globalAlpha = HUD_ALPHA;
    ctx.fillStyle = HUD_COLOR;
    ctx.font = 'bold 13px Courier New';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    const hdgStr = 'HDG ' + String(Math.round(headingDeg) % 360).padStart(3, '0') + '\u00B0';
    ctx.fillText(hdgStr, cx, COMPASS_BAND_Y + COMPASS_BAND_HEIGHT + 4);
  }

  _drawHorizon(ctx, w, h, pitch) {
    const cx = w / 2;
    const cy = h / 2;
    const pitchDeg = (pitch * 180) / Math.PI;

    ctx.save();
    this._applyHudShadow(ctx);
    ctx.globalAlpha = HUD_ALPHA;
    ctx.strokeStyle = HUD_COLOR;
    ctx.fillStyle = HUD_COLOR;
    ctx.lineWidth = 1.5;

    const horizonY = cy - pitchDeg * HORIZON_PX_PER_DEG;

    ctx.beginPath();
    ctx.moveTo(cx - HORIZON_LINE_WIDTH, horizonY);
    ctx.lineTo(cx - 40, horizonY);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx + 40, horizonY);
    ctx.lineTo(cx + HORIZON_LINE_WIDTH, horizonY);
    ctx.stroke();

    ctx.font = '11px Courier New';
    ctx.textBaseline = 'middle';
    for (let deg = -90; deg <= 90; deg += 10) {
      if (deg === 0) continue;
      const ladderY = horizonY - deg * HORIZON_PX_PER_DEG;
      if (ladderY < cy - HORIZON_VISIBLE_RANGE || ladderY > cy + HORIZON_VISIBLE_RANGE) continue;

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

  _drawAltimeter(ctx, w, h, altY, groundElevation) {
    const x = w / 2 + INSTRUMENT_OFFSET_X;
    const cy = h / 2;

    const alt = altY;
    const agl = altY - groundElevation;

    ctx.save();
    this._applyHudShadow(ctx);
    ctx.globalAlpha = HUD_ALPHA;
    ctx.strokeStyle = HUD_COLOR;
    ctx.fillStyle = HUD_COLOR;
    ctx.font = 'bold 13px Courier New';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';

    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, cy - INSTRUMENT_SCALE_HEIGHT / 2);
    ctx.lineTo(x, cy + INSTRUMENT_SCALE_HEIGHT / 2);
    ctx.stroke();

    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x, cy);
    ctx.lineTo(x + 8, cy - 6);
    ctx.lineTo(x + 70, cy - 6);
    ctx.lineTo(x + 70, cy + 6);
    ctx.lineTo(x + 8, cy + 6);
    ctx.closePath();
    ctx.stroke();

    ctx.fillText(Math.round(alt), x + 12, cy);

    const step = 100;
    const pxPerUnit = INSTRUMENT_SCALE_HEIGHT / (step * 4);
    const baseAlt = Math.round(alt / step) * step;

    ctx.font = '10px Courier New';
    ctx.lineWidth = 1;
    for (let i = -4; i <= 4; i++) {
      const tickAlt = baseAlt + i * step;
      const tickY = cy - (tickAlt - alt) * pxPerUnit;
      if (tickY < cy - INSTRUMENT_SCALE_HEIGHT / 2 || tickY > cy + INSTRUMENT_SCALE_HEIGHT / 2) continue;

      ctx.beginPath();
      ctx.moveTo(x - 5, tickY);
      ctx.lineTo(x, tickY);
      ctx.stroke();

      ctx.textAlign = 'right';
      ctx.fillText(Math.round(tickAlt), x - 8, tickY);
    }

    ctx.font = 'bold 12px Courier New';
    ctx.textAlign = 'left';
    ctx.fillText('ALT m', x, cy - INSTRUMENT_SCALE_HEIGHT / 2 - 14);

    ctx.font = 'bold 13px Courier New';
    ctx.fillText(
      'AGL ' + Math.round(Math.max(0, agl)) + ' m',
      x - 10,
      cy + INSTRUMENT_SCALE_HEIGHT / 2 + 20,
    );

    ctx.restore();
  }

  _drawSpeed(ctx, w, h, speed) {
    const x = w / 2 - INSTRUMENT_OFFSET_X;
    const cy = h / 2;

    ctx.save();
    this._applyHudShadow(ctx);
    ctx.globalAlpha = HUD_ALPHA;
    ctx.strokeStyle = HUD_COLOR;
    ctx.fillStyle = HUD_COLOR;

    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, cy - INSTRUMENT_SCALE_HEIGHT / 2);
    ctx.lineTo(x, cy + INSTRUMENT_SCALE_HEIGHT / 2);
    ctx.stroke();

    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x, cy);
    ctx.lineTo(x - 8, cy - 6);
    ctx.lineTo(x - 70, cy - 6);
    ctx.lineTo(x - 70, cy + 6);
    ctx.lineTo(x - 8, cy + 6);
    ctx.closePath();
    ctx.stroke();

    ctx.font = 'bold 13px Courier New';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.fillText(Math.round(speed), x - 12, cy);

    ctx.font = 'bold 12px Courier New';
    ctx.textAlign = 'right';
    ctx.fillText('SPD', x, cy - INSTRUMENT_SCALE_HEIGHT / 2 - 14);

    ctx.restore();
  }

  _drawBadge(ctx, w, label, borderColor, y) {
    const x = w - BADGE_RIGHT_MARGIN;
    ctx.save();
    ctx.font = 'bold 13px Courier New';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';

    const tw = ctx.measureText(label).width;

    ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
    ctx.fillRect(x - tw - BADGE_PAD * 2, y - 12, tw + BADGE_PAD * 2, 24);

    ctx.strokeStyle = borderColor;
    ctx.lineWidth = 1.5;
    ctx.globalAlpha = 0.9;
    ctx.strokeRect(x - tw - BADGE_PAD * 2, y - 12, tw + BADGE_PAD * 2, 24);

    ctx.fillStyle = borderColor;
    ctx.fillText(label, x - BADGE_PAD, y);

    ctx.restore();
  }

  _drawHiResBadge(ctx, w, y) {
    this._drawBadge(ctx, w, 'HI-RES Z18', HUD_COLOR, y);
  }

  _drawBenchmarkWarmup(ctx, w, remaining, y) {
    const secs = Math.ceil(remaining);
    this._drawBadge(ctx, w, `WARMUP  ${secs}s`, WARN_COLOR, y);
  }

  _drawBenchmarkBadge(ctx, w, elapsed, y) {
    const x = w - BADGE_RIGHT_MARGIN;
    const secs = Math.floor(elapsed);
    const label = `REC BENCHMARK  ${secs}s`;

    ctx.save();
    ctx.font = 'bold 13px Courier New';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';

    const tw = ctx.measureText(label).width;
    const totalW = BENCH_DOT_SIZE + 8 + tw + BADGE_PAD * 2;

    ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
    ctx.fillRect(x - totalW, y - 12, totalW, 24);

    ctx.strokeStyle = BENCH_COLOR;
    ctx.lineWidth = 1.5;
    ctx.globalAlpha = 0.9;
    ctx.strokeRect(x - totalW, y - 12, totalW, 24);

    const blink = Math.floor(elapsed * 2) % 2 === 0;
    if (blink) {
      ctx.fillStyle = BENCH_COLOR;
      ctx.beginPath();
      ctx.arc(x - totalW + BADGE_PAD + BENCH_DOT_SIZE / 2, y, BENCH_DOT_SIZE / 2, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.fillStyle = BENCH_COLOR;
    ctx.fillText(label, x - BADGE_PAD, y);

    ctx.restore();
  }

  _drawFlightPlanRecBadge(ctx, w, wpCount, y) {
    this._drawBadge(ctx, w, `REC FLTPLAN  WP:${wpCount}`, WARN_COLOR, y);
  }

  _drawAutopilotBadge(ctx, w, nextWp, totalWp, progressPct, y) {
    this._drawBadge(ctx, w, `AP  WP ${nextWp}/${totalWp}  ${progressPct}%`, HUD_COLOR, y);
  }
}
