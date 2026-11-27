import { CONFIG, DEFAULTS, onChange, update } from '../utils/config.js';
import { SETTINGS, SETTINGS_BY_KEY } from '../utils/settingsSchema.js';
import { resetSettings } from '../utils/settingsStore.js';
import { QUALITY_PRESETS, PRESET_GPU_COST } from '../utils/qualityPresets.js';
import Logger from '../utils/Logger.js';
import { showNotification } from './Notification.js';
import { SHORTCUTS } from './shortcuts.js';
import { CREDITS } from './credits.js';
import { playUiSound } from './uiSounds.js';
import { searchAirports } from '../airports/Airports.js';

const ICONS = {
  graphics: '<rect x="3" y="5" width="18" height="12" rx="1"/><path d="M8 21h8M12 17v4"/>',
  world: '<path d="M3 18l6-9 4 6 3-4 5 7z"/><circle cx="17" cy="6" r="2"/>',
  flight: '<path d="M12 2l2 7 8 3-8 2-2 8-2-8-8-2 8-3z"/>',
  audio: '<path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M16.5 8.5a5 5 0 010 7M19 6a8.5 8.5 0 010 12"/>',
  controls: '<rect x="2" y="6" width="20" height="12" rx="2"/><path d="M6 10h1M10 10h1M14 10h1M18 10h1M7 14h10"/>',
  credits: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7v.5"/>',
  dev: '<path d="M8 9l-4 3 4 3M16 9l4 3-4 3M14 5l-4 14"/>',
};

const TABS = [
  { id: 'graphics', label: 'Graphics', help: 'Image quality and the cost of each setting.' },
  { id: 'world', label: 'World', help: 'Where to fly, the ground imagery, the sun, the sky and the clouds.' },
  { id: 'flight', label: 'Flight', help: 'Speed, view, mouse, gamepad and what is shown over the view.' },
  { id: 'audio', label: 'Audio', help: 'Volume of each kind of sound.' },
  { id: 'controls', label: 'Controls', help: 'Keyboard, mouse and gamepad controls in flight.' },
  { id: 'credits', label: 'Credits', help: 'The data, imagery, models and software the simulator is built on.' },
  { id: 'dev', label: 'Developer', help: 'Measurements, reference views and raw rendering values.', dev: true },
];

const LOG_SLIDER_STEPS = 1000;
/** Slider positions moved by one press of ← or → on a logarithmic slider */
const LOG_SLIDER_KEY_STEP = 20;
const METRICS_INTERVAL_MS = 250;
const RESET_CONFIRM_MS = 3000;
/** An Escape this soon after the menu opened is the one that released the mouse */
const ESCAPE_REOPEN_GUARD_MS = 500;
const MAX_LEVEL_BARS = 5;

/** Creates an element with a class and optional text */
function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function button(className, text, label) {
  const b = el('button', className, text);
  b.type = 'button';
  if (label) b.setAttribute('aria-label', label);
  return b;
}

/** Row of `count` bars, the first `filled` of them lit */
function levelBars(className, count, filled) {
  const bars = el('div', className);
  for (let i = 0; i < count; i++) {
    const bar = el('i');
    if (i < filled) bar.className = 'f';
    bars.append(bar);
  }
  return bars;
}

function formatCoordinates(lat, lon) {
  const ns = lat >= 0 ? 'N' : 'S';
  const ew = lon >= 0 ? 'E' : 'W';
  return `${Math.abs(lat).toFixed(2)}°${ns}  ${Math.abs(lon).toFixed(2)}°${ew}`;
}

function isTextField(target) {
  return target?.tagName === 'INPUT' && target.type !== 'range';
}

/**
 * Settings menu: tabs generated from the settings schema (js/utils/settingsSchema.js),
 * kept in sync with CONFIG both ways. Opening it pauses the flight (see app.js).
 *
 * Every setting is a row. One row is highlighted at a time, by the mouse or with
 * ↑ ↓; ← → change its value, R restores its default, Q E switch tabs, Escape
 * resumes the flight. While the menu is open, keys do not reach the flight shortcuts.
 *
 * @typedef {Object} PanelActions
 * @property {() => void} resume - give the mouse back to the flight
 * @property {(lat: number, lon: number) => void} flyTo - load the terrain around a new location
 * @property {(airport: object, runway: object, end: number) => void} startOnRunway - stand lined up on a runway
 * @property {() => void} reloadTerrain - reload the terrain tiles in place
 * @property {() => Object<string, string>} metrics - live figures for the developer tab
 * @property {string[]} referenceViews - names of the reference views
 * @property {(index: number) => void} setReferenceView - 0-based
 * @property {() => boolean} toggleDebugTiles - returns whether the overlay is on
 * @property {() => void} toggleBenchmark
 * @property {() => void} storeBaseline
 *
 * @typedef {Object} Row
 * @property {HTMLElement} el
 * @property {string} title
 * @property {string} [help]
 * @property {Object} [impact]
 * @property {(dir: number) => void} [adjust] - ← (-1) or → (+1)
 * @property {() => void} [activate] - Enter or Space
 * @property {() => void} [reset] - R
 */
export default class ControlPanel {
  /**
   * @param {{ devMode: boolean, actions: PanelActions }} options
   */
  constructor({ devMode, actions }) {
    this.devMode = devMode;
    this.actions = actions;
    this.isOpen = false;
    /** performance.now() of the last opening */
    this.openedAt = 0;
    this._listeners = new Set();
    this._controls = {};
    this._panes = {};
    this._tabButtons = {};
    /** @type {Object<string, Row[]>} */
    this._rows = {};
    this._selected = null;
    this._tabs = TABS.filter((t) => !t.dev || devMode);
    this._activeTab = 'graphics';
    this._pendingTerrainReload = false;
    this._metricsTimer = null;

    this._build();

    onChange((key, value) => {
      this._controls[key]?.(value);
      if (key === 'lat' || key === 'lon') this._locEl.textContent = formatCoordinates(CONFIG.lat, CONFIG.lon);
      if (SETTINGS_BY_KEY[key]?.reload === 'terrain') {
        if (this.isOpen) this._pendingTerrainReload = true;
        else this.actions.reloadTerrain();
      }
    });

    // Capture phase on window: runs before the flight shortcuts and controls
    window.addEventListener('keydown', (e) => this._onKeyDown(e), true);
  }

  /** @param {(open: boolean) => void} fn - called when the menu opens or closes */
  onToggle(fn) {
    this._listeners.add(fn);
  }

  open() {
    if (this.isOpen) return;
    this.isOpen = true;
    this.openedAt = performance.now();
    this.root.hidden = false;
    document.body.classList.add('menu-open');
    playUiSound('open');
    this._selectTab(this._activeTab, { silent: true });
    for (const fn of this._listeners) fn(true);
  }

  close() {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.root.hidden = true;
    document.body.classList.remove('menu-open');
    this._stopMetrics();
    if (document.activeElement && this.root.contains(document.activeElement)) document.activeElement.blur();
    if (this._pendingTerrainReload) {
      this._pendingTerrainReload = false;
      this.actions.reloadTerrain();
    }
    for (const fn of this._listeners) fn(false);
  }

  /** Closes the menu and gives the mouse back to the flight */
  resume() {
    playUiSound('close');
    this.close();
    this.actions.resume();
  }

  /** Changes a setting from the menu, with its sound */
  _set(key, value) {
    const before = CONFIG[key];
    update(key, value);
    playUiSound(CONFIG[key] !== before ? 'change' : 'deny');
  }

  // ── Keyboard ──

  _onKeyDown(e) {
    if (!this.isOpen || e.metaKey || e.ctrlKey || e.altKey) return;
    const typing = isTextField(e.target);

    if (e.key === 'Escape') {
      e.stopPropagation();
      e.preventDefault();
      if (typing) e.target.blur();
      else if (performance.now() - this.openedAt > ESCAPE_REOPEN_GUARD_MS) this.resume();
      return;
    }
    if (typing) return;

    // No other key reaches the flight shortcuts while the menu is open
    e.stopPropagation();
    const row = this._selected;
    const handlers = {
      ArrowUp: () => this._moveSelection(-1),
      ArrowDown: () => this._moveSelection(1),
      ArrowLeft: () => row?.adjust?.(-1),
      ArrowRight: () => row?.adjust?.(1),
      Enter: () => row?.activate?.(),
      ' ': () => row?.activate?.(),
      q: () => this._stepTab(-1),
      e: () => this._stepTab(1),
      r: () => row?.reset?.(),
    };
    const handler = handlers[e.key.length === 1 ? e.key.toLowerCase() : e.key];
    if (handler) {
      e.preventDefault();
      handler();
    }
  }

  _moveSelection(dir) {
    const rows = this._rows[this._activeTab] || [];
    if (rows.length === 0) {
      // Panes without rows (Controls) scroll instead
      this._panes[this._activeTab].parentElement.scrollBy({ top: dir * 120, behavior: 'smooth' });
      return;
    }
    const index = rows.indexOf(this._selected);
    const next = rows[Math.max(0, Math.min(rows.length - 1, index + dir))];
    if (next === this._selected) playUiSound('deny');
    else this._selectRow(next, { keyboard: true });
  }

  _stepTab(dir) {
    const ids = this._tabs.map((t) => t.id);
    const index = ids.indexOf(this._activeTab);
    this._selectTab(ids[(index + dir + ids.length) % ids.length]);
  }

  // ── Construction ──

  _build() {
    this.root = el('div');
    this.root.id = 'settings-menu';
    this.root.hidden = true;
    this.root.setAttribute('role', 'dialog');
    this.root.setAttribute('aria-label', 'Settings');

    // Top bar
    const top = el('header', 'sm-top');
    this._crumbEl = el('span', 'sm-crumb');
    this._locEl = el('span', 'sm-loc', formatCoordinates(CONFIG.lat, CONFIG.lon));
    top.append(el('span', 'sm-paused', 'Paused'), el('span', 'sm-sep'), this._crumbEl, this._locEl);

    // Category rail
    const rail = el('nav', 'sm-rail');
    rail.setAttribute('role', 'tablist');
    const main = el('main', 'sm-main');
    for (const tab of this._tabs) {
      const b = button('sm-cat');
      b.setAttribute('role', 'tab');
      b.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[tab.id]}</svg>`;
      b.append(el('span', '', tab.label));
      b.addEventListener('click', () => this._selectTab(tab.id));
      rail.append(b);
      this._tabButtons[tab.id] = b;

      const pane = el('div', 'sm-pane');
      pane.setAttribute('role', 'tabpanel');
      this._panes[tab.id] = pane;
      this._rows[tab.id] = [];
      main.append(pane);
    }
    const reset = button('sm-reset', 'Reset all');
    reset.addEventListener('click', () => this._onReset(reset));
    rail.append(el('div', 'sm-rail-fill'), reset);

    // Description of the highlighted row
    const info = el('aside', 'sm-info');
    this._infoTitle = el('h4');
    this._infoText = el('p');
    this._infoMeters = el('div', 'sm-meters');
    this._infoNote = el('p', 'sm-note');
    info.append(this._infoTitle, this._infoText, this._infoMeters, this._infoNote);

    // Key hints
    const bottom = el('footer', 'sm-bottom');
    const hint = (keys, text) => {
      const span = el('span', 'sm-hint');
      for (const k of keys) span.append(el('kbd', '', k));
      span.append(text);
      return span;
    };
    const resume = button('sm-resume');
    resume.append(el('kbd', '', 'Esc'), 'Resume flight');
    resume.addEventListener('click', () => this.resume());
    bottom.append(
      hint(['↑↓'], 'Select'),
      hint(['←→'], 'Change'),
      hint(['Q', 'E'], 'Tab'),
      hint(['R'], 'Default'),
      resume,
    );

    this._buildWorldLocation();
    this._buildWorldAirports();
    this._buildControls(this._panes.controls);
    this._buildCredits(this._panes.credits);
    if (this.devMode) this._buildDevTools(this._panes.dev);
    this._buildSettings();

    this.root.append(el('div', 'sm-shade'), top, rail, main, info, bottom);
    document.body.append(this.root);
  }

  _selectTab(id, { silent = false } = {}) {
    if (!silent && id !== this._activeTab) playUiSound('tab');
    this._activeTab = id;
    const tab = this._tabs.find((t) => t.id === id);
    this._crumbEl.textContent = `Settings / ${tab.label}`;
    for (const [tabId, b] of Object.entries(this._tabButtons)) {
      const active = tabId === id;
      b.classList.toggle('on', active);
      b.setAttribute('aria-selected', String(active));
      this._panes[tabId].hidden = !active;
    }
    const first = this._rows[id][0];
    if (first) this._selectRow(first, { keyboard: true, silent: true });
    else this._showInfo({ title: tab.label, help: tab.help });
    this._refreshMetrics();
  }

  /** Highlights a row and describes it in the info card */
  _selectRow(row, { keyboard = false, silent = false } = {}) {
    if (row === this._selected) return;
    this._selected?.el.classList.remove('sel');
    this._selected = row;
    row.el.classList.add('sel');
    if (!silent) playUiSound('move');
    if (keyboard) {
      row.el.focus({ preventScroll: true });
      row.el.scrollIntoView({ block: 'nearest' });
    }
    this._showInfo(row);
  }

  _showInfo({ title, help, impact }) {
    this._infoTitle.textContent = title;
    this._infoText.textContent = help || '';
    this._infoMeters.replaceChildren();
    if (impact?.cost !== undefined) {
      for (const [name, value, cls] of [
        ['Performance impact', impact.cost, 'cost'],
        ['Visual gain', impact.gain, 'gain'],
      ]) {
        const meter = el('div', `sm-meter sm-meter-${cls}`);
        meter.append(el('span', '', name), levelBars('sm-meter-bars', MAX_LEVEL_BARS, value));
        this._infoMeters.append(meter);
      }
    }
    this._infoNote.textContent = impact?.note || '';
  }

  /** Returns the section of a pane with that title, created on first use */
  _section(pane, title) {
    let section = [...pane.children].find((s) => s.dataset.title === (title || ''));
    if (!section) {
      section = el('section', 'sm-section');
      section.dataset.title = title || '';
      if (title) section.append(el('h3', 'sm-group', title));
      pane.append(section);
    }
    return section;
  }

  /**
   * Adds a selectable row to a tab
   * @param {string} tabId
   * @param {string} [sectionTitle]
   * @param {Row} row
   */
  _addRow(tabId, sectionTitle, row) {
    row.el.tabIndex = -1;
    row.el.addEventListener('mouseenter', () => this._selectRow(row));
    row.el.addEventListener('focusin', () => this._selectRow(row, { silent: true }));
    this._section(this._panes[tabId], sectionTitle).append(row.el);
    this._rows[tabId].push(row);
    return row;
  }

  _buildSettings() {
    for (const setting of SETTINGS) {
      if (!setting.tab || !setting.type || !this._panes[setting.tab]) continue;
      const row = setting.key === 'quality' ? this._presetRow(setting) : this._settingRow(setting);
      this._controls[setting.key](CONFIG[setting.key]);
      this._addRow(setting.tab, setting.section, row);
    }
  }

  _settingRow(setting) {
    const rowEl = el('div', `sm-row sm-row-${setting.type}`);
    rowEl.append(el('span', 'sm-label', setting.label));
    let help = setting.help || '';
    if (setting.reload === 'terrain') help += ' Applied to the terrain when the menu closes.';
    const row = {
      el: rowEl,
      title: setting.label,
      help,
      impact: setting.impact,
      reset: () => this._set(setting.key, DEFAULTS[setting.key]),
    };
    const builders = {
      toggle: () => this._toggle(setting, row),
      choice: () => this._cycle(setting, row),
      select: () => this._cycle(setting, row),
      range: () => this._range(setting, row),
    };
    rowEl.append(builders[setting.type]());
    return row;
  }

  _toggle(setting, row) {
    const group = el('div', 'sm-toggle');
    group.setAttribute('role', 'switch');
    group.setAttribute('aria-label', setting.label);
    const off = button('', 'Off');
    const on = button('', 'On');
    off.addEventListener('click', () => this._set(setting.key, false));
    on.addEventListener('click', () => this._set(setting.key, true));
    group.append(off, on);
    row.adjust = (dir) => this._set(setting.key, dir > 0);
    row.activate = () => this._set(setting.key, !CONFIG[setting.key]);
    row.el.querySelector('.sm-label').addEventListener('click', row.activate);
    this._controls[setting.key] = (value) => {
      group.setAttribute('aria-checked', String(Boolean(value)));
      off.classList.toggle('on', !value);
      on.classList.toggle('on', Boolean(value));
    };
    return group;
  }

  /** ◀ value ▶ selector for 'choice' and 'select' settings */
  _cycle(setting, row) {
    const options = setting.options.filter(([value]) => value !== 'custom');
    const wrap = el('div', 'sm-cycle');
    const prev = button('sm-arrow', '◀', `Previous ${setting.label}`);
    const next = button('sm-arrow', '▶', `Next ${setting.label}`);
    const value = el('div', 'sm-cycle-value');
    const text = el('span');
    const pips = el('div', 'sm-pips');
    value.append(text, pips);
    wrap.append(prev, value, next);

    const indexOf = () => options.findIndex(([v]) => v === CONFIG[setting.key]);
    const step = (dir) => {
      let index = indexOf() + dir;
      if (setting.ordered) {
        if (index < 0 || index >= options.length) {
          playUiSound('deny');
          return;
        }
      } else {
        index = (index + options.length) % options.length;
      }
      this._set(setting.key, options[index][0]);
    };
    prev.addEventListener('click', () => step(-1));
    next.addEventListener('click', () => step(1));
    value.addEventListener('click', () => step(1));
    row.adjust = step;
    row.activate = () => step(1);

    this._controls[setting.key] = (current) => {
      const index = options.findIndex(([v]) => v === current);
      text.textContent = index >= 0 ? options[index][1] : String(current);
      pips.replaceChildren(
        ...options.map((_, i) => {
          const pip = el('i');
          if (setting.ordered ? i <= index : i === index) pip.className = 'f';
          return pip;
        }),
      );
      if (setting.ordered) {
        prev.disabled = index <= 0;
        next.disabled = index >= options.length - 1;
      }
    };
    return wrap;
  }

  _range(setting, row) {
    const wrap = el('div', 'sm-slider');
    const input = el('input', 'sm-range');
    input.type = 'range';
    input.setAttribute('aria-label', setting.label);
    const value = el('span', 'sm-value');
    wrap.append(input, value);

    let toValue = Number;
    let toPosition = (v) => v;
    let keyStep = setting.step;
    if (setting.log) {
      const minLog = Math.log(setting.min);
      const span = Math.log(setting.max) - minLog;
      input.min = 0;
      input.max = LOG_SLIDER_STEPS;
      input.step = 1;
      keyStep = LOG_SLIDER_KEY_STEP;
      toValue = (p) => Math.exp(minLog + (p / LOG_SLIDER_STEPS) * span);
      toPosition = (v) => Math.round(((Math.log(v) - minLog) / span) * LOG_SLIDER_STEPS);
    } else {
      input.min = setting.min;
      input.max = setting.max;
      input.step = setting.step;
    }
    const format = setting.format || String;
    const fill = () => {
      const p = (Number(input.value) - Number(input.min)) / (Number(input.max) - Number(input.min));
      input.style.setProperty('--fill', `${(p * 100).toFixed(1)}%`);
    };

    input.addEventListener('input', () => update(setting.key, toValue(Number(input.value))));
    input.addEventListener('change', () => playUiSound('change'));
    // The slider is driven by the row's ← →, not by its own key handling
    input.tabIndex = -1;
    row.adjust = (dir) => {
      const position = Math.max(Number(input.min), Math.min(Number(input.max), Number(input.value) + dir * keyStep));
      this._set(setting.key, toValue(position));
    };
    this._controls[setting.key] = (v) => {
      input.value = toPosition(v);
      value.textContent = format(v);
      fill();
    };
    return wrap;
  }

  /** Preset cards: the quality setting */
  _presetRow(setting) {
    const rowEl = el('div', 'sm-row sm-row-presets');
    const head = el('div', 'sm-presets-head');
    const custom = el('span', 'sm-custom', 'Custom');
    head.append(el('span', 'sm-label', setting.label), custom);
    const cards = el('div', 'sm-presets');
    const names = Object.keys(QUALITY_PRESETS);
    const cardEls = names.map((name, i) => {
      const card = button('sm-preset');
      card.append(
        el('b', '', setting.options.find(([v]) => v === name)[1]),
        el('small', '', `${Math.round(PRESET_GPU_COST[name] * 100)} % GPU`),
        levelBars('sm-preset-bars', names.length, i + 1),
      );
      card.title = `GPU time relative to High: ${Math.round(PRESET_GPU_COST[name] * 100)} %`;
      card.addEventListener('click', () => this._set('quality', name));
      cards.append(card);
      return [name, card];
    });
    rowEl.append(head, cards);

    const row = {
      el: rowEl,
      title: setting.label,
      help: setting.help,
      impact: setting.impact,
      reset: () => this._set('quality', DEFAULTS.quality),
    };
    row.adjust = (dir) => {
      let index = names.indexOf(CONFIG.quality);
      // From Custom, ← → start from the middle presets
      if (index < 0) index = dir > 0 ? names.indexOf('medium') : names.indexOf('high');
      const next = index + dir;
      if (next < 0 || next >= names.length) playUiSound('deny');
      else this._set('quality', names[next]);
    };
    this._controls.quality = (current) => {
      for (const [name, card] of cardEls) {
        card.classList.toggle('on', name === current);
        card.setAttribute('aria-pressed', String(name === current));
      }
      custom.hidden = current !== 'custom';
    };
    return row;
  }

  // ── World: location ──

  _buildWorldLocation() {
    const search = el('input', 'sm-input');
    search.type = 'search';
    search.placeholder = 'Mont Blanc, Grand Canyon…';
    search.setAttribute('aria-label', 'Search a place');
    const searchBtn = button('sm-btn', 'Search');
    const searchRow = el('div', 'sm-row sm-row-field');
    const searchLine = el('div', 'sm-field');
    searchLine.append(search, searchBtn);
    searchRow.append(el('span', 'sm-label', 'Search'), searchLine);

    const lat = el('input', 'sm-input sm-input-num');
    const lon = el('input', 'sm-input sm-input-num');
    for (const [input, name] of [
      [lat, 'Latitude'],
      [lon, 'Longitude'],
    ]) {
      input.type = 'number';
      input.step = '0.0001';
      input.setAttribute('aria-label', name);
      input.placeholder = name;
    }
    lat.value = CONFIG.lat;
    lon.value = CONFIG.lon;
    const fly = button('sm-btn sm-btn-primary', 'Fly there');
    const coordRow = el('div', 'sm-row sm-row-field');
    const coordLine = el('div', 'sm-field');
    coordLine.append(lat, lon, fly);
    coordRow.append(el('span', 'sm-label', 'Coordinates'), coordLine);

    const searchHelp = 'Finds a place by name and fills in its coordinates.';
    const searchRowObj = this._addRow('world', 'Location', {
      el: searchRow,
      title: 'Search a place',
      help: searchHelp,
      activate: () => search.focus(),
    });
    this._addRow('world', 'Location', {
      el: coordRow,
      title: 'Coordinates',
      help: 'Latitude and longitude in decimal degrees. Fly there loads the terrain around them.',
      activate: () => fly.click(),
    });

    const doSearch = async () => {
      const query = search.value.trim();
      if (!query) return;
      searchRowObj.help = 'Searching…';
      this._showInfo(searchRowObj);
      try {
        const res = await fetch(
          `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1`,
        );
        const data = await res.json();
        if (data.length > 0) {
          lat.value = parseFloat(data[0].lat).toFixed(4);
          lon.value = parseFloat(data[0].lon).toFixed(4);
          searchRowObj.help = `Found: ${data[0].display_name}`;
          playUiSound('confirm');
        } else {
          searchRowObj.help = 'No place found.';
          playUiSound('deny');
        }
      } catch (err) {
        Logger.warn('ControlPanel', `Nominatim search failed: ${err.message}`);
        searchRowObj.help = searchHelp;
        showNotification('Search error', 'error');
      }
      this._showInfo(searchRowObj);
    };
    searchBtn.addEventListener('click', doSearch);
    search.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') doSearch();
    });

    fly.addEventListener('click', () => {
      const la = parseFloat(lat.value);
      const lo = parseFloat(lon.value);
      if (!Number.isFinite(la) || !Number.isFinite(lo)) {
        playUiSound('deny');
        return;
      }
      this.actions.flyTo(la, lo);
      this.resume();
    });

    this._controls.lat = (v) => (lat.value = v);
    this._controls.lon = (v) => (lon.value = v);
  }

  // ── World: airports ──

  _buildWorldAirports() {
    const search = el('input', 'sm-input');
    search.type = 'search';
    search.placeholder = 'LFPG, Geneva, Nice…';
    search.setAttribute('aria-label', 'Search an airport');
    const searchBtn = button('sm-btn', 'Search');
    const rowEl = el('div', 'sm-row sm-row-field sm-row-airports');
    const line = el('div', 'sm-field');
    line.append(search, searchBtn);
    const results = el('div', 'sm-airports');
    rowEl.append(el('span', 'sm-label', 'Airport'), line, results);
    const help =
      'Finds an airport by its code, name or town. Pick a runway end to start lined up on it, engines at idle: ' +
      'W for power, Space for the brakes, G for the gear once airborne.';
    const row = this._addRow('world', 'Airports', {
      el: rowEl,
      title: 'Take off from an airport',
      help,
      activate: () => search.focus(),
    });

    const KM = 1000;
    const show = (airports) => {
      results.replaceChildren();
      for (const airport of airports) {
        const item = el('div', 'sm-airport');
        const place = [airport.municipality, airport.country].filter(Boolean).join(', ');
        const name = el('div', 'sm-airport-name');
        name.append(el('b', '', airport.ident), ` ${airport.name}`, el('span', 'sm-airport-place', place));
        const ends = el('div', 'sm-field');
        for (const runway of airport.runways) {
          runway.ends.forEach((end, index) => {
            const length =
              runway.length >= KM ? `${(runway.length / KM).toFixed(1)} km` : `${Math.round(runway.length)} m`;
            const choice = button('sm-btn', `${end.ident} · ${length}`, `Runway ${end.ident}, ${length}`);
            choice.addEventListener('click', () => {
              playUiSound('confirm');
              this.actions.startOnRunway(airport, runway, index);
              this.resume();
            });
            ends.append(choice);
          });
        }
        item.append(name, ends);
        results.append(item);
      }
    };

    const doSearch = async () => {
      const query = search.value.trim();
      if (!query) return;
      row.help = 'Searching…';
      this._showInfo(row);
      try {
        const airports = await searchAirports(query);
        show(airports);
        row.help = airports.length ? `${airports.length} found. ${help}` : 'No airport found.';
        playUiSound(airports.length ? 'confirm' : 'deny');
      } catch (err) {
        Logger.warn('ControlPanel', `Airport search failed: ${err.message}`);
        row.help = help;
        showNotification('Airport search error: the airport data needs the dev server', 'error');
      }
      this._showInfo(row);
    };
    searchBtn.addEventListener('click', doSearch);
    search.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') doSearch();
    });
  }

  // ── Controls ──

  _buildControls(pane) {
    for (const group of SHORTCUTS) {
      if (group.dev && !this.devMode) continue;
      const section = this._section(pane, group.group);
      const list = el('dl', 'sm-keys');
      for (const item of group.items) {
        const keys = el('dt');
        item.keys.forEach((key, i) => {
          if (i > 0 && item.chord) keys.append(el('span', 'sm-plus', '+'));
          keys.append(el('kbd', '', key));
        });
        list.append(keys, el('dd', '', item.action));
      }
      section.append(list);
    }
  }

  // ── Credits ──

  _buildCredits(pane) {
    for (const group of CREDITS) {
      const section = this._section(pane, group.group);
      const list = el('dl', 'sm-credits');
      for (const item of group.items) {
        const name = el('dt');
        if (item.url) {
          const link = el('a', '', item.name);
          link.href = item.url;
          link.target = '_blank';
          link.rel = 'noopener';
          name.append(link);
        } else {
          name.textContent = item.name;
        }
        list.append(name, el('dd', '', item.credit));
      }
      section.append(list);
    }
  }

  // ── Developer ──

  _buildDevTools(pane) {
    const live = this._section(pane, 'Live');
    this._metricsEl = el('dl', 'sm-metrics');
    live.append(this._metricsEl);

    const views = el('div', 'sm-row sm-row-field');
    const viewButtons = el('div', 'sm-field');
    const names = this.actions.referenceViews;
    let viewIndex = -1;
    const showView = (i) => {
      viewIndex = i;
      this.actions.setReferenceView(i);
      playUiSound('change');
    };
    names.forEach((name, i) => {
      const b = button('sm-btn sm-btn-square', String(i + 1), name);
      b.title = name;
      b.addEventListener('click', () => showView(i));
      viewButtons.append(b);
    });
    views.append(el('span', 'sm-label', 'Reference views'), viewButtons);
    this._addRow('dev', 'Tools', {
      el: views,
      title: 'Reference views',
      help: 'Viewpoints used for rendering comparisons. ← → step through them.',
      adjust: (dir) => showView((viewIndex + dir + names.length) % names.length),
    });

    const tools = el('div', 'sm-row sm-row-field');
    const toolButtons = el('div', 'sm-field');
    const debug = button('sm-btn', 'Tile debug');
    debug.addEventListener('click', () => {
      debug.classList.toggle('on', this.actions.toggleDebugTiles());
      playUiSound('change');
    });
    const bench = button('sm-btn', 'Benchmark');
    bench.addEventListener('click', () => {
      this.actions.toggleBenchmark();
      this.resume();
    });
    const baseline = button('sm-btn', 'Store baseline');
    baseline.addEventListener('click', () => {
      this.actions.storeBaseline();
      playUiSound('confirm');
    });
    toolButtons.append(debug, bench, baseline);
    tools.append(el('span', 'sm-label', 'Actions'), toolButtons);
    this._addRow('dev', 'Tools', {
      el: tools,
      title: 'Actions',
      help: 'Tile debug overlay (X), benchmark flight (B), store the last benchmark as the baseline (Shift+B).',
    });
  }

  _refreshMetrics() {
    this._stopMetrics();
    if (!this.isOpen || this._activeTab !== 'dev' || !this._metricsEl) return;
    const render = () => {
      this._metricsEl.replaceChildren();
      for (const [name, value] of Object.entries(this.actions.metrics())) {
        this._metricsEl.append(el('dt', '', name), el('dd', '', value));
      }
    };
    render();
    this._metricsTimer = setInterval(render, METRICS_INTERVAL_MS);
  }

  _stopMetrics() {
    clearInterval(this._metricsTimer);
    this._metricsTimer = null;
  }

  // ── Reset ──

  _onReset(b) {
    if (b.dataset.confirm) {
      clearTimeout(this._resetTimer);
      delete b.dataset.confirm;
      b.textContent = 'Reset all';
      resetSettings();
      playUiSound('confirm');
      showNotification('Settings restored to their defaults');
      return;
    }
    playUiSound('deny');
    b.dataset.confirm = '1';
    b.textContent = 'Confirm reset';
    this._resetTimer = setTimeout(() => {
      delete b.dataset.confirm;
      b.textContent = 'Reset all';
    }, RESET_CONFIRM_MS);
  }
}
