/**
 * DOM-based overlay menu for selecting saved flight plans.
 * Independent of the HUD canvas — works whether HUD is visible or not.
 */
export default class FlightPlanMenu {
  constructor() {
    this._open = false;
    this._files = [];
    this._el = document.getElementById('flightplan-menu');
    this._listEl = document.getElementById('flightplan-list');
  }

  get isOpen() {
    return this._open;
  }

  show(files) {
    this._files = files || [];
    this._open = true;
    this._render();
    this._el.style.display = 'flex';
  }

  close() {
    this._open = false;
    this._el.style.display = 'none';
  }

  select(index) {
    if (index >= 0 && index < this._files.length) {
      return this._files[index];
    }
    return null;
  }

  _render() {
    const files = this._files;
    if (files.length === 0) {
      this._listEl.innerHTML = '<div class="fp-empty">(no plans found)</div>';
    } else {
      this._listEl.innerHTML = files
        .slice(0, 9)
        .map((f, i) => `<div class="fp-item">${i + 1}. ${f.replace('.json', '')}</div>`)
        .join('');
    }
  }
}
