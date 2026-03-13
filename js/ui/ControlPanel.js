import { CONFIG, update } from '../utils/config.js';

export default class ControlPanel {
  constructor(onRegenerate) {
    this.onRegenerate = onRegenerate;
    this.panel = document.getElementById('control-panel');
    this.toggleBtn = document.getElementById('toggle-panel');
    this.collapsed = false;

    this.toggleBtn.addEventListener('click', () => {
      this.collapsed = !this.collapsed;
      this.panel.classList.toggle('collapsed', this.collapsed);
      this.toggleBtn.textContent = this.collapsed ? '▶' : '◀';
    });

    // --- Terrain mode ---
    this._setupTerrainMode();

    // --- Procedural sliders ---
    this._setupSlider('resolution', 'chunkResolution', 16, 128, 1);
    this._setupSlider('viewDistance', 'viewDistance', 2, 25, 1);
    this._setupSlider('maxHeight', 'maxHeight', 100, 2400, 40);
    this._setupSlider('octaves', 'octaves', 1, 8, 1);
    this._setupSlider('cameraSpeed', 'cameraSpeed', 50, 4000, 50);

    const wireframeCb = document.getElementById('wireframe');
    wireframeCb.checked = CONFIG.wireframe;
    wireframeCb.addEventListener('change', () => {
      update('wireframe', wireframeCb.checked);
    });

    const seedInput = document.getElementById('seed');
    seedInput.value = CONFIG.seed;
    const regenBtn = document.getElementById('regenerate');
    regenBtn.addEventListener('click', () => {
      update('seed', seedInput.value || 'landscape-3d');
      if (this.onRegenerate) this.onRegenerate();
    });
  }

  _setupTerrainMode() {
    const modeSelect = document.getElementById('terrainMode');
    const realworldControls = document.getElementById('realworld-controls');
    const proceduralControls = document.getElementById('procedural-controls');

    modeSelect.value = CONFIG.terrainMode;

    const togglePanels = (mode) => {
      realworldControls.style.display = mode === 'realworld' ? 'block' : 'none';
      proceduralControls.style.display = mode === 'procedural' ? 'block' : 'none';
    };
    togglePanels(CONFIG.terrainMode);

    modeSelect.addEventListener('change', () => {
      const mode = modeSelect.value;
      update('terrainMode', mode);
      togglePanels(mode);
      if (this.onRegenerate) this.onRegenerate();
    });

    // --- Lat/Lon ---
    const latInput = document.getElementById('lat');
    const lonInput = document.getElementById('lon');
    latInput.value = CONFIG.lat;
    lonInput.value = CONFIG.lon;

    // --- Texture toggle ---
    const osmCb = document.getElementById('useOsmTexture');
    osmCb.checked = CONFIG.useOsmTexture;
    osmCb.addEventListener('change', () => {
      update('useOsmTexture', osmCb.checked);
    });

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
          `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1`
        );
        const data = await res.json();
        if (data.length > 0) {
          latInput.value = parseFloat(data[0].lat).toFixed(4);
          lonInput.value = parseFloat(data[0].lon).toFixed(4);
        } else {
          alert('Lieu non trouvé');
        }
      } catch (err) {
        console.warn('Nominatim search failed:', err);
        alert('Erreur de recherche');
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
      if (['chunkResolution', 'octaves', 'maxHeight'].includes(configKey)) {
        if (this.onRegenerate) this.onRegenerate();
      }
    });
  }
}
