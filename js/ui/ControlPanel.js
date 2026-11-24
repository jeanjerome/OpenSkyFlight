import { CONFIG, onChange, update } from '../utils/config.js';
import { SETTINGS, SETTINGS_BY_KEY } from '../utils/settingsSchema.js';
import { resetSettings } from '../utils/settingsStore.js';
import Logger from '../utils/Logger.js';
import { showNotification } from './Notification.js';
import { SHORTCUTS } from './shortcuts.js';

const TABS = [
  { id: 'graphics', label: 'Graphics' },
  { id: 'world', label: 'World' },
  { id: 'flight', label: 'Flight' },
  { id: 'controls', label: 'Controls' },
  { id: 'dev', label: 'Developer', dev: true },
];

const LOG_SLIDER_STEPS = 1000;
const METRICS_INTERVAL_MS = 250;
const RESET_CONFIRM_MS = 3000;

/** Creates an element with a class and optional text */
function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/**
 * Settings menu: tabs generated from the settings schema (js/utils/settingsSchema.js),
 * kept in sync with CONFIG both ways. Opening it pauses the flight (see app.js).
 *
 * @typedef {Object} PanelActions
 * @property {() => void} resume - give the mouse back to the flight
 * @property {(lat: number, lon: number) => void} flyTo - load the terrain around a new location
 * @property {() => void} reloadTerrain - reload the terrain tiles in place
 * @property {() => Object<string, string>} metrics - live figures for the developer tab
 * @property {string[]} referenceViews - names of the reference views
 * @property {(index: number) => void} setReferenceView - 0-based
 * @property {() => boolean} toggleDebugTiles - returns whether the overlay is on
 * @property {() => void} toggleBenchmark
 * @property {() => void} storeBaseline
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
    this._activeTab = 'graphics';
    this._pendingTerrainReload = false;
    this._metricsTimer = null;

    this._build();

    onChange((key, value) => {
      this._controls[key]?.(value);
      if (SETTINGS_BY_KEY[key]?.reload === 'terrain') {
        if (this.isOpen) this._pendingTerrainReload = true;
        else this.actions.reloadTerrain();
      }
    });
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
    this._refreshMetrics();
    for (const fn of this._listeners) fn(true);
  }

  close() {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.root.hidden = true;
    this._stopMetrics();
    if (this._pendingTerrainReload) {
      this._pendingTerrainReload = false;
      this.actions.reloadTerrain();
    }
    for (const fn of this._listeners) fn(false);
  }

  /** Closes the menu and gives the mouse back to the flight */
  resume() {
    this.close();
    this.actions.resume();
  }

  // ── Construction ──

  _build() {
    this.root = el('div');
    this.root.id = 'settings-menu';
    this.root.hidden = true;

    const panel = el('div', 'sm-panel');
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', 'Settings');

    const header = el('header', 'sm-header');
    header.append(el('span', 'sm-title', 'Settings'));
    const tabs = el('nav', 'sm-tabs');
    tabs.setAttribute('role', 'tablist');
    header.append(tabs);

    const body = el('div', 'sm-body');
    for (const tab of TABS) {
      if (tab.dev && !this.devMode) continue;
      const button = el('button', 'sm-tab', tab.label);
      button.type = 'button';
      button.setAttribute('role', 'tab');
      button.addEventListener('click', () => this._selectTab(tab.id));
      tabs.append(button);
      this._tabButtons[tab.id] = button;

      const pane = el('div', 'sm-pane');
      pane.setAttribute('role', 'tabpanel');
      this._panes[tab.id] = pane;
      body.append(pane);
    }

    this._buildWorldLocation(this._panes.world);
    this._buildControls(this._panes.controls);
    if (this.devMode) this._buildDevTools(this._panes.dev);
    this._buildSettings();

    const footer = el('footer', 'sm-footer');
    this._helpEl = el('p', 'sm-help');
    const buttons = el('div', 'sm-actions');
    const reset = el('button', 'sm-btn', 'Reset all');
    reset.type = 'button';
    reset.addEventListener('click', () => this._onReset(reset));
    const resume = el('button', 'sm-btn sm-btn-primary', 'Resume');
    resume.type = 'button';
    resume.addEventListener('click', () => this.resume());
    buttons.append(reset, resume);
    footer.append(this._helpEl, buttons);

    panel.append(header, body, footer);
    this.root.append(panel);
    document.body.append(this.root);
    this._selectTab(this._activeTab);
  }

  _selectTab(id) {
    this._activeTab = id;
    for (const [tabId, button] of Object.entries(this._tabButtons)) {
      const active = tabId === id;
      button.classList.toggle('active', active);
      button.setAttribute('aria-selected', String(active));
      this._panes[tabId].hidden = !active;
    }
    this._showHelp('');
    this._refreshMetrics();
  }

  _showHelp(text) {
    this._helpEl.textContent = text;
  }

  /** Returns the section of a pane with that title, created on first use */
  _section(pane, title) {
    let section = [...pane.children].find((s) => s.dataset.title === (title || ''));
    if (!section) {
      section = el('section', 'sm-section');
      section.dataset.title = title || '';
      if (title) section.append(el('h3', 'sm-section-title', title));
      pane.append(section);
    }
    return section;
  }

  _buildSettings() {
    for (const setting of SETTINGS) {
      const pane = setting.tab && this._panes[setting.tab];
      if (!pane || !setting.type) continue;
      const row = this._buildRow(setting);
      this._section(pane, setting.section).append(row);
    }
  }

  _buildRow(setting) {
    const row = el('div', `sm-row sm-row-${setting.type}`);
    const label = el('span', 'sm-label', setting.label);
    row.append(label);

    let help = setting.help || '';
    if (setting.reload === 'terrain') help += ' Applied to the terrain when the menu closes.';
    if (help) {
      row.addEventListener('mouseenter', () => this._showHelp(help));
      row.addEventListener('mouseleave', () => this._showHelp(''));
      row.addEventListener('focusin', () => this._showHelp(help));
    }

    const builders = {
      toggle: () => this._toggle(setting, label),
      choice: () => this._choice(setting),
      select: () => this._select(setting),
      range: () => this._range(setting, row),
    };
    row.append(builders[setting.type]());
    this._controls[setting.key](CONFIG[setting.key]);
    return row;
  }

  _toggle(setting, label) {
    const button = el('button', 'sm-switch');
    button.type = 'button';
    button.setAttribute('role', 'switch');
    button.setAttribute('aria-label', setting.label);
    button.addEventListener('click', () => update(setting.key, !CONFIG[setting.key]));
    label.addEventListener('click', () => button.click());
    this._controls[setting.key] = (value) => button.setAttribute('aria-checked', String(Boolean(value)));
    return button;
  }

  _choice(setting) {
    const group = el('div', 'sm-choice');
    group.setAttribute('role', 'radiogroup');
    group.setAttribute('aria-label', setting.label);
    const buttons = setting.options.map(([value, text]) => {
      const button = el('button', 'sm-choice-btn', text);
      button.type = 'button';
      button.setAttribute('role', 'radio');
      // 'custom' is a state reached by changing a setting by hand, not a choice
      if (value === 'custom') {
        button.classList.add('sm-choice-state');
        button.tabIndex = -1;
      } else {
        button.addEventListener('click', () => update(setting.key, value));
      }
      group.append(button);
      return [value, button];
    });
    this._controls[setting.key] = (current) => {
      for (const [value, button] of buttons) {
        const checked = value === current;
        button.setAttribute('aria-checked', String(checked));
        if (value === 'custom') button.hidden = !checked;
      }
    };
    return group;
  }

  _select(setting) {
    const select = el('select', 'sm-select');
    select.setAttribute('aria-label', setting.label);
    for (const [value, text] of setting.options) {
      const option = el('option', '', text);
      option.value = String(value);
      select.append(option);
    }
    select.addEventListener('change', () => {
      const option = setting.options.find(([value]) => String(value) === select.value);
      if (option) update(setting.key, option[0]);
    });
    this._controls[setting.key] = (value) => {
      select.value = String(value);
    };
    return select;
  }

  _range(setting, row) {
    const value = el('span', 'sm-value');
    row.querySelector('.sm-label').after(value);
    const input = el('input', 'sm-range');
    input.type = 'range';
    input.setAttribute('aria-label', setting.label);

    let toValue = Number;
    let toPosition = (v) => v;
    if (setting.log) {
      const minLog = Math.log(setting.min);
      const span = Math.log(setting.max) - minLog;
      input.min = 0;
      input.max = LOG_SLIDER_STEPS;
      input.step = 1;
      toValue = (p) => Math.exp(minLog + (p / LOG_SLIDER_STEPS) * span);
      toPosition = (v) => Math.round(((Math.log(v) - minLog) / span) * LOG_SLIDER_STEPS);
    } else {
      input.min = setting.min;
      input.max = setting.max;
      input.step = setting.step;
    }
    const format = setting.format || String;

    input.addEventListener('input', () => update(setting.key, toValue(Number(input.value))));
    this._controls[setting.key] = (v) => {
      input.value = toPosition(v);
      value.textContent = format(v);
    };
    return input;
  }

  // ── World: location ──

  _buildWorldLocation(pane) {
    const section = this._section(pane, 'Location');
    const searchRow = el('div', 'sm-row sm-row-stack');
    const searchLine = el('div', 'sm-inline');
    const search = el('input', 'sm-input');
    search.type = 'search';
    search.placeholder = 'Search a place: Mont Blanc, Grand Canyon…';
    search.setAttribute('aria-label', 'Search a place');
    const searchBtn = el('button', 'sm-btn', 'Search');
    searchBtn.type = 'button';
    searchLine.append(search, searchBtn);
    const found = el('p', 'sm-note');
    searchRow.append(searchLine, found);

    const coordRow = el('div', 'sm-row sm-row-stack');
    const coordLine = el('div', 'sm-inline');
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
    const fly = el('button', 'sm-btn sm-btn-primary', 'Fly there');
    fly.type = 'button';
    coordLine.append(lat, lon, fly);
    coordRow.append(coordLine);
    section.append(searchRow, coordRow);

    const doSearch = async () => {
      const query = search.value.trim();
      if (!query) return;
      found.textContent = 'Searching…';
      try {
        const res = await fetch(
          `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1`,
        );
        const data = await res.json();
        if (data.length > 0) {
          lat.value = parseFloat(data[0].lat).toFixed(4);
          lon.value = parseFloat(data[0].lon).toFixed(4);
          found.textContent = data[0].display_name;
        } else {
          found.textContent = 'No place found.';
        }
      } catch (err) {
        Logger.warn('ControlPanel', `Nominatim search failed: ${err.message}`);
        found.textContent = '';
        showNotification('Search error', 'error');
      }
    };
    searchBtn.addEventListener('click', doSearch);
    search.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') doSearch();
    });

    fly.addEventListener('click', () => {
      const la = parseFloat(lat.value);
      const lo = parseFloat(lon.value);
      if (!Number.isFinite(la) || !Number.isFinite(lo)) {
        found.textContent = 'Enter a latitude and a longitude.';
        return;
      }
      this.actions.flyTo(la, lo);
      this.resume();
    });

    const showRow = (help, row) => {
      row.addEventListener('mouseenter', () => this._showHelp(help));
      row.addEventListener('mouseleave', () => this._showHelp(''));
    };
    showRow('Finds a place by name and fills in its coordinates.', searchRow);
    showRow('Loads the terrain around these coordinates, in decimal degrees.', coordRow);
    this._controls.lat = (v) => (lat.value = v);
    this._controls.lon = (v) => (lon.value = v);
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
          if (i > 0) keys.append(item.chord ? ' + ' : ' ');
          keys.append(el('kbd', '', key));
        });
        list.append(keys, el('dd', '', item.action));
      }
      section.append(list);
    }
  }

  // ── Developer ──

  _buildDevTools(pane) {
    const live = this._section(pane, 'Live');
    this._metricsEl = el('dl', 'sm-metrics');
    live.append(this._metricsEl);

    const tools = this._section(pane, 'Tools');
    const views = el('div', 'sm-row sm-row-stack');
    views.append(el('span', 'sm-label', 'Reference views'));
    const viewButtons = el('div', 'sm-inline sm-wrap');
    this.actions.referenceViews.forEach((name, i) => {
      const button = el('button', 'sm-btn', String(i + 1));
      button.type = 'button';
      button.title = name;
      button.addEventListener('click', () => this.actions.setReferenceView(i));
      viewButtons.append(button);
    });
    views.append(viewButtons);

    const actions = el('div', 'sm-inline sm-wrap');
    const debug = el('button', 'sm-btn', 'Tile debug overlay');
    debug.type = 'button';
    debug.addEventListener('click', () => {
      debug.classList.toggle('active', this.actions.toggleDebugTiles());
    });
    const bench = el('button', 'sm-btn', 'Start / stop benchmark');
    bench.type = 'button';
    bench.addEventListener('click', () => {
      this.actions.toggleBenchmark();
      this.resume();
    });
    const baseline = el('button', 'sm-btn', 'Store baseline');
    baseline.type = 'button';
    baseline.addEventListener('click', () => this.actions.storeBaseline());
    actions.append(debug, bench, baseline);
    tools.append(views, actions);
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

  _onReset(button) {
    if (button.dataset.confirm) {
      clearTimeout(this._resetTimer);
      delete button.dataset.confirm;
      button.textContent = 'Reset all';
      resetSettings();
      showNotification('Settings restored to their defaults');
      return;
    }
    button.dataset.confirm = '1';
    button.textContent = 'Click again to reset';
    this._resetTimer = setTimeout(() => {
      delete button.dataset.confirm;
      button.textContent = 'Reset all';
    }, RESET_CONFIRM_MS);
  }
}
