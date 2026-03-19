import { HUD_COLOR, HUD_ALPHA, MENU_BOX_WIDTH, MENU_LINE_HEIGHT } from '../../constants/hud.js';

/**
 * Overlay menu for selecting saved flight plans.
 */
export default class FlightPlanMenu {
  constructor() {
    this._open = false;
    this._files = [];
  }

  get isOpen() {
    return this._open;
  }

  show(files) {
    this._open = true;
    this._files = files || [];
  }

  close() {
    this._open = false;
  }

  select(index) {
    if (index >= 0 && index < this._files.length) {
      return this._files[index];
    }
    return null;
  }

  draw(ctx, w, h) {
    if (!this._open) return;

    const cx = w / 2;
    const cy = h / 2;
    const files = this._files;
    const headerH = 50;
    const footerH = 36;
    const listH = Math.max(MENU_LINE_HEIGHT, files.length * MENU_LINE_HEIGHT);
    const boxH = headerH + listH + footerH + 20;

    ctx.save();

    // Background
    ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
    ctx.fillRect(cx - MENU_BOX_WIDTH / 2, cy - boxH / 2, MENU_BOX_WIDTH, boxH);

    // Border
    ctx.strokeStyle = HUD_COLOR;
    ctx.lineWidth = 2;
    ctx.globalAlpha = HUD_ALPHA;
    ctx.strokeRect(cx - MENU_BOX_WIDTH / 2, cy - boxH / 2, MENU_BOX_WIDTH, boxH);

    // Title
    ctx.fillStyle = HUD_COLOR;
    ctx.font = 'bold 18px Courier New';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText('FLIGHT PLANS', cx, cy - boxH / 2 + 14);

    // List
    ctx.font = '14px Courier New';
    ctx.textAlign = 'left';
    const listY = cy - boxH / 2 + headerH;

    if (files.length === 0) {
      ctx.fillStyle = '#667766';
      ctx.textAlign = 'center';
      ctx.fillText('(no plans found)', cx, listY + 6);
    } else {
      ctx.fillStyle = HUD_COLOR;
      for (let i = 0; i < files.length && i < 9; i++) {
        const name = files[i].replace('.json', '');
        ctx.fillText(`${i + 1}. ${name}`, cx - MENU_BOX_WIDTH / 2 + 30, listY + i * MENU_LINE_HEIGHT + 6);
      }
    }

    // Footer
    ctx.fillStyle = '#667766';
    ctx.font = '12px Courier New';
    ctx.textAlign = 'center';
    ctx.fillText('L: close  |  1-9: select  |  Esc: close', cx, cy + boxH / 2 - footerH + 8);

    ctx.restore();
  }
}
