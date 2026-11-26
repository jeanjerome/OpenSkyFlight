import * as THREE from 'three';
import { GEAR_SPEED_LIMIT } from '../../flight/GearSequence.js';
import { GLIDE_FULL_SCALE, LOCALIZER_FULL_SCALE } from '../../flight/ApproachGuide.js';
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
    this._point = new THREE.Vector3();
    this._direction = new THREE.Vector3();
  }

  /**
   * @param {number} roll - bank of the pitch ladder (rad, right wing down positive)
   * @param {string} speedLabel - title of the speed tape
   */
  drawInstruments(w, h, yaw, pitch, altY, groundElevation, speed, roll = 0, speedLabel = 'SPD') {
    const ctx = this._ctx;
    this._drawCompass(ctx, w, yaw);
    this._drawHorizon(ctx, w, h, pitch, roll);
    this._drawAltimeter(ctx, w, h, altY, groundElevation);
    this._drawSpeed(ctx, w, h, speed, speedLabel);
  }

  /**
   * Flight data of the Simulation mode: Mach, load factor and angle of attack
   * below the speed tape, throttle and fuel below the altimeter; flight path
   * marker (where the aircraft goes), nose cross (where it points) and the
   * mouse aim circle, projected through the camera
   * @param {THREE.Camera} camera
   * @param {{position: THREE.Vector3, quaternion: THREE.Quaternion, model: import('../../flight/FlightModel.js').default, aim: THREE.Vector3|null}} state
   */
  drawFlightData(w, h, camera, state) {
    const ctx = this._ctx;
    const m = state.model;
    ctx.save();
    this._applyHudShadow(ctx);
    ctx.globalAlpha = HUD_ALPHA;
    ctx.strokeStyle = HUD_COLOR;
    ctx.fillStyle = HUD_COLOR;
    ctx.font = 'bold 13px Courier New';
    ctx.textBaseline = 'middle';

    const below = h / 2 + INSTRUMENT_SCALE_HEIGHT / 2;
    const left = w / 2 - INSTRUMENT_OFFSET_X;
    ctx.textAlign = 'right';
    ctx.fillText(`M ${m.mach.toFixed(2)}`, left, below + 20);
    ctx.fillText(`G ${m.loadFactor.toFixed(1)}  ${m.peakLoadFactor.toFixed(1)}`, left, below + 38);
    ctx.fillText(`\u03b1 ${Math.round((m.alpha * 180) / Math.PI)}\u00b0`, left, below + 56);
    // Landing gear: in transit, or down and locked; red beyond its speed limit
    const gear = m.gear;
    if (!gear.upLocked) {
      const overspeed = m.indicatedAirspeed > GEAR_SPEED_LIMIT;
      ctx.fillStyle = overspeed ? WARN_COLOR : HUD_COLOR;
      const label = gear.downLocked ? 'GEAR DOWN' : 'GEAR TRANSIT';
      ctx.fillText(overspeed ? `${label}  SPEED` : label, left, below + 74);
      ctx.fillStyle = HUD_COLOR;
    }

    const right = w / 2 + INSTRUMENT_OFFSET_X - 10;
    const engines = m.engines;
    ctx.textAlign = 'left';
    const power =
      engines.reheat > 0.02
        ? `AB ${Math.round(engines.reheat * 100)} %`
        : `THR ${Math.round((m.controls.lever / 0.8) * 100)} %`;
    ctx.fillText(power, right, below + 38);
    ctx.fillStyle = m.fuel < 600 ? WARN_COLOR : HUD_COLOR;
    ctx.fillText(`FUEL ${Math.round(m.fuel)} kg`, right, below + 56);
    ctx.fillStyle = HUD_COLOR;
    if (m.controls.airbrake) ctx.fillText(m.onGround ? 'AIRBRAKE  BRAKES' : 'AIRBRAKE', right, below + 74);
    if (state.autopilot) {
      const { heading, altitude } = state.autopilot;
      const degrees = Math.round((((-heading * 180) / Math.PI) % 360) + 360) % 360;
      ctx.fillText(`AP ${String(degrees).padStart(3, '0')}° ${Math.round(altitude)} m`, right, below + 92);
    }

    ctx.lineWidth = 1.5;
    // Flight path marker: circle with wings and fin
    const fpm = this._project(camera, state.position, this._direction.copy(m.velocity).normalize(), w, h);
    if (fpm) {
      ctx.beginPath();
      ctx.arc(fpm.x, fpm.y, 7, 0, Math.PI * 2);
      ctx.moveTo(fpm.x - 7, fpm.y);
      ctx.lineTo(fpm.x - 18, fpm.y);
      ctx.moveTo(fpm.x + 7, fpm.y);
      ctx.lineTo(fpm.x + 18, fpm.y);
      ctx.moveTo(fpm.x, fpm.y - 7);
      ctx.lineTo(fpm.x, fpm.y - 14);
      ctx.stroke();
    }
    // Nose cross
    const nose = this._project(
      camera,
      state.position,
      this._direction.set(0, 0, -1).applyQuaternion(state.quaternion),
      w,
      h,
    );
    if (nose) {
      ctx.beginPath();
      ctx.moveTo(nose.x - 9, nose.y);
      ctx.lineTo(nose.x + 9, nose.y);
      ctx.moveTo(nose.x, nose.y - 9);
      ctx.lineTo(nose.x, nose.y + 9);
      ctx.stroke();
    }
    // Mouse aim
    if (state.aim) {
      const aim = this._project(camera, camera.position, state.aim, w, h);
      if (aim) {
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.arc(aim.x, aim.y, 12, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }
    ctx.restore();
  }

  /** Screen position of a direction seen from a point, far away; null behind the camera */
  _project(camera, from, direction, w, h) {
    const p = this._point.copy(from).addScaledVector(direction, 5000).project(camera);
    if (p.z > 1 || p.z < -1) return null;
    return { x: ((p.x + 1) / 2) * w, y: ((1 - p.y) / 2) * h };
  }

  /**
   * Approach guidance (see flight/ApproachGuide.js): the runway and its
   * distance and a virtual PAPI above the centre, the glide path deviation
   * on a vertical scale right of it and the localizer deviation on a
   * horizontal scale below it (two dots either side, the diamond where the
   * guidance lies)
   * @param {ReturnType<import('../../flight/ApproachGuide.js').approachGuidance>} approach
   */
  drawApproach(w, h, approach) {
    const ctx = this._ctx;
    ctx.save();
    this._applyHudShadow(ctx);
    ctx.globalAlpha = HUD_ALPHA;
    ctx.strokeStyle = HUD_COLOR;
    ctx.fillStyle = HUD_COLOR;
    ctx.lineWidth = 1.5;
    const cx = w / 2;
    const cy = h / 2;
    const dot = 30;
    const clamp = (v) => Math.max(-2.3, Math.min(2.3, v));
    const diamond = (x, y) => {
      ctx.beginPath();
      ctx.moveTo(x, y - 7);
      ctx.lineTo(x + 7, y);
      ctx.lineTo(x, y + 7);
      ctx.lineTo(x - 7, y);
      ctx.closePath();
      ctx.fill();
    };
    const dots = (horizontal, x0, y0) => {
      for (const k of [-2, -1, 1, 2]) {
        ctx.beginPath();
        ctx.arc(horizontal ? x0 + k * dot : x0, horizontal ? y0 : y0 + k * dot, 3, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.beginPath();
      if (horizontal) {
        ctx.moveTo(x0, y0 - 9);
        ctx.lineTo(x0, y0 + 9);
      } else {
        ctx.moveTo(x0 - 9, y0);
        ctx.lineTo(x0 + 9, y0);
      }
      ctx.stroke();
    };
    // Glide path: the diamond above the centre when the path is above the aircraft
    const gx = cx + 150;
    dots(false, gx, cy);
    diamond(gx, cy - clamp((approach.glide / GLIDE_FULL_SCALE) * 2) * dot);
    // Localizer: the diamond right of the centre when the centre line is to the
    // right, just below the centre (the chase view draws the aircraft lower)
    const ly = cy + 70;
    dots(true, cx, ly);
    diamond(cx + clamp((approach.localizer / LOCALIZER_FULL_SCALE) * 2) * dot, ly);

    // Runway, distance and glide angle; virtual PAPI beside
    ctx.font = 'bold 13px Courier New';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const km = Math.max(0, approach.distance) / 1000;
    const label = `${approach.airport} ${approach.ident}  ${km.toFixed(1)} km  ${((approach.glideAngle * 180) / Math.PI).toFixed(1)}°`;
    // Above the centre, clear of the aircraft in the chase view
    ctx.fillText(label, cx, cy - 110);
    const papiY = cy - 90;
    approach.papi.forEach((white, i) => {
      ctx.beginPath();
      // The unit nearest the runway on the right, as seen from the left of the runway
      ctx.arc(cx + 27 - i * 18, papiY, 5, 0, Math.PI * 2);
      ctx.fillStyle = white ? '#ffffff' : '#ff3020';
      ctx.fill();
    });
    ctx.restore();
  }

  drawBadges(w, benchmarkRunner, isRecording, wpCount, isAutopilot, fpRec) {
    const ctx = this._ctx;
    let badgeY = BADGE_START_Y;

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

  _drawHorizon(ctx, w, h, pitch, roll = 0) {
    const cx = w / 2;
    const cy = h / 2;
    // Normalize pitch to [-180, 180] for continuous 360° display
    let pitchDeg = ((pitch * 180) / Math.PI) % 360;
    if (pitchDeg > 180) pitchDeg -= 360;
    if (pitchDeg < -180) pitchDeg += 360;

    ctx.save();
    // The ladder turns against the bank, as the horizon does seen from the cockpit
    if (roll) {
      ctx.translate(cx, cy);
      ctx.rotate(-roll);
      ctx.translate(-cx, -cy);
    }
    this._applyHudShadow(ctx);
    ctx.globalAlpha = HUD_ALPHA;
    ctx.strokeStyle = HUD_COLOR;
    ctx.fillStyle = HUD_COLOR;
    ctx.lineWidth = 1.5;

    // Nose up: the horizon lies below the centre of the view
    const horizonY = cy + pitchDeg * HORIZON_PX_PER_DEG;

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
    for (let deg = -180; deg <= 180; deg += 10) {
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
    ctx.fillText('AGL ' + Math.round(Math.max(0, agl)) + ' m', x - 10, cy + INSTRUMENT_SCALE_HEIGHT / 2 + 20);

    ctx.restore();
  }

  _drawSpeed(ctx, w, h, speed, label = 'SPD') {
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
    ctx.fillText(label, x, cy - INSTRUMENT_SCALE_HEIGHT / 2 - 14);

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
