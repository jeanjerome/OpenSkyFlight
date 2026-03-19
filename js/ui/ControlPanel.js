import { CONFIG, update } from '../utils/config.js';
import Logger from '../utils/Logger.js';
import { showNotification } from './Notification.js';
import { MACH_1_MS } from '../constants/physics.js';

export default class ControlPanel {
  constructor(onRegenerate) {
    this.onRegenerate = onRegenerate;
    this.panel = document.getElementById('control-panel');
    this._hideTimeout = null;

    this._setupHoverBehavior();
    this._setupRealworldControls();
    this._setupSpeedSlider();
    this._setupAtmosphere();

    this._bindCheckbox('showHud', 'showHud');
    this._bindCheckbox('showMinimap', 'showMinimap');
    this._bindCheckbox('showLogs', 'showLogs');

    this._setupLogLevel();
  }

  _bindCheckbox(elementId, configKey) {
    const cb = document.getElementById(elementId);
    cb.checked = CONFIG[configKey];
    cb.addEventListener('change', () => {
      update(configKey, cb.checked);
    });
  }

  _setupLogLevel() {
    const logLevelSelect = document.getElementById('logLevel');
    logLevelSelect.value = CONFIG.logLevel;
    logLevelSelect.addEventListener('change', () => {
      update('logLevel', logLevelSelect.value);
    });
  }

  _setupHoverBehavior() {
    const trigger = document.getElementById('panel-trigger');

    const showPanel = () => {
      clearTimeout(this._hideTimeout);
      this.panel.classList.add('visible');
    };

    const scheduleHide = () => {
      clearTimeout(this._hideTimeout);
      this._hideTimeout = setTimeout(() => {
        this.panel.classList.remove('visible');
      }, 300);
    };

    trigger.addEventListener('mouseenter', showPanel);
    trigger.addEventListener('mouseleave', scheduleHide);
    this.panel.addEventListener('mouseenter', showPanel);
    this.panel.addEventListener('mouseleave', scheduleHide);
  }

  _setupRealworldControls() {
    // --- Lat/Lon ---
    const latInput = document.getElementById('lat');
    const lonInput = document.getElementById('lon');
    latInput.value = CONFIG.lat;
    lonInput.value = CONFIG.lon;

    // --- Texture toggle ---
    this._bindCheckbox('useOsmTexture', 'useOsmTexture');

    // --- Texture source ---
    const texSrcSelect = document.getElementById('textureSource');
    texSrcSelect.value = CONFIG.textureSource;
    texSrcSelect.addEventListener('change', () => {
      update('textureSource', texSrcSelect.value);
    });

    // --- Place search ---
    const searchInput = document.getElementById('placeSearch');
    const searchBtn = document.getElementById('searchBtn');

    const doSearch = async () => {
      const query = searchInput.value.trim();
      if (!query) return;
      try {
        const res = await fetch(
          `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1`,
        );
        const data = await res.json();
        if (data.length > 0) {
          latInput.value = parseFloat(data[0].lat).toFixed(4);
          lonInput.value = parseFloat(data[0].lon).toFixed(4);
        } else {
          showNotification('Location not found', 'warn');
        }
      } catch (err) {
        Logger.warn('ControlPanel', `Nominatim search failed: ${err.message}`);
        showNotification('Search error', 'error');
      }
    };

    searchBtn.addEventListener('click', doSearch);
    searchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') doSearch();
    });

    // --- Load terrain button ---
    const loadBtn = document.getElementById('loadTerrain');
    loadBtn.addEventListener('click', () => {
      update('lat', parseFloat(latInput.value));
      update('lon', parseFloat(lonInput.value));
      if (this.onRegenerate) this.onRegenerate();
    });
  }

  _setupSpeedSlider() {
    const slider = document.getElementById('cameraSpeed');
    const display = document.getElementById('cameraSpeed-val');
    const MIN_LOG = Math.log(1);
    const MAX_LOG = Math.log(4000);
    slider.min = 0;
    slider.max = 1000;
    slider.step = 1;

    const toSpeed = (pos) => Math.exp(MIN_LOG + (pos / 1000) * (MAX_LOG - MIN_LOG));
    const toPos = (speed) => Math.round(((Math.log(speed) - MIN_LOG) / (MAX_LOG - MIN_LOG)) * 1000);
    const formatSpeed = (ms) => {
      if (ms < MACH_1_MS) return Math.round(ms * 3.6) + ' km/h';
      return 'Mach ' + (ms / MACH_1_MS).toFixed(1);
    };

    slider.value = toPos(CONFIG.cameraSpeed);
    display.textContent = formatSpeed(CONFIG.cameraSpeed);

    slider.addEventListener('input', () => {
      const speed = toSpeed(Number(slider.value));
      display.textContent = formatSpeed(speed);
      update('cameraSpeed', speed);
    });
  }

  _setupAtmosphere() {
    this._setupSlider('sunElevation', 'sunElevation', 0, 90, 1);
    this._setupSlider('sunAzimuth', 'sunAzimuth', 0, 360, 1);
    this._setupSlider('skyTurbidity', 'skyTurbidity', 1, 10, 0.5);
    this._setupSlider('cloudAltitude', 'cloudAltitude', 500, 12000, 100);

    this._bindCheckbox('showClouds', 'showClouds');
    this._bindCheckbox('fogEnabled', 'fogEnabled');
  }

  _setupSlider(id, configKey, min, max, step) {
    const slider = document.getElementById(id);
    const display = document.getElementById(id + '-val');
    slider.min = min;
    slider.max = max;
    slider.step = step;
    slider.value = CONFIG[configKey];
    display.textContent = CONFIG[configKey];

    slider.addEventListener('input', () => {
      const v = Number(slider.value);
      display.textContent = v;
      update(configKey, v);
    });
  }
}
