/**
 * @typedef {Object} AppConfig
 *
 * Real-world terrain:
 * @property {number}  lat                    - Latitude in decimal degrees (default: 45.8326 — Mont Blanc)
 * @property {number}  lon                    - Longitude in decimal degrees (default: 6.8652)
 * @property {number}  zoom                   - Tile zoom level (default: 15)
 * @property {number}  minZoom                - Minimum zoom for LOD rings (default: 3)
 * @property {number}  maxTotalTiles          - Maximum loaded tiles (default: 1000)
 * @property {number}  lodRingRadius          - LOD ring radius in tiles (default: 8)
 * @property {boolean} useOsmTexture          - Enable texture on terrain (default: true)
 * @property {string}  textureSource          - 'satellite' | 'osm' (default: 'satellite')
 * @property {boolean} hiResMode              - Hi-res zoom 18 mode (default: false)
 *
 * Camera & flight:
 * @property {number}  cameraSpeed            - Flight speed in units/sec, range [1..4000] (default: 800)
 * @property {string}  cameraMode             - 'chase' | 'cockpit' (default: 'chase')
 * @property {number}  mouseSensitivity       - Mouse look sensitivity (default: 0.002)
 *
 * Rendering:
 * @property {number}  maxPixelRatio          - Maximum device pixel ratio (default: 2)
 *
 * Atmosphere:
 * @property {number}  sunElevation           - Sun elevation angle in degrees, range [0..90] (default: 80)
 * @property {number}  sunAzimuth             - Sun azimuth angle in degrees, range [0..360] (default: 180)
 * @property {number}  skyTurbidity           - Atmospheric turbidity, range [1..10] (default: 2.0)
 * @property {number}  skyRayleigh            - Rayleigh scattering coefficient (default: 1.0)
 * @property {boolean} showClouds             - Show cloud layer (default: false)
 * @property {number}  cloudAltitude          - Cloud layer altitude in meters, range [500..12000] (default: 3500)
 * @property {number}  cloudOpacity           - Cloud opacity (default: 0.7)
 * @property {boolean} fogEnabled             - Enable atmospheric fog (default: true)
 * @property {number}  fogDensity             - Fog density (default: 0.000015)
 *
 * UI:
 * @property {boolean} showHud                - Show HUD overlay (default: true)
 * @property {string}  logLevel               - Log level: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR' (default: 'WARN')
 * @property {boolean} showLogs               - Show log panel (default: false)
 * @property {boolean} showMinimap            - Show minimap (default: true)
 * @property {number}  minimapZoom            - Minimap zoom level, range [3..18] (default: 13)
 */

/** Validation rules: { min, max } for numeric clamping */
const CONFIG_VALIDATION = {
  cameraSpeed: { min: 1, max: 4000 },
  sunElevation: { min: 0, max: 90 },
  sunAzimuth: { min: 0, max: 360 },
  skyTurbidity: { min: 1, max: 10 },
  cloudAltitude: { min: 500, max: 12000 },
  cloudOpacity: { min: 0, max: 1 },
  fogDensity: { min: 0, max: 0.01 },
  minimapZoom: { min: 3, max: 18 },
  lat: { min: -90, max: 90 },
  lon: { min: -180, max: 180 },
};

/** @type {AppConfig} */
const CONFIG = {
  cameraSpeed: 800,
  cameraMode: 'chase',
  mouseSensitivity: 0.002,
  maxPixelRatio: 2,
  lat: 45.8326, // Mont Blanc default
  lon: 6.8652,
  zoom: 15,
  useOsmTexture: true,
  textureSource: 'satellite', // 'osm' | 'satellite'
  minZoom: 3,
  maxTotalTiles: 1000,
  lodRingRadius: 8,
  showHud: true,
  logLevel: 'WARN',
  showLogs: false,
  showMinimap: true,
  minimapZoom: 13,
  sunElevation: 80,
  sunAzimuth: 180,
  skyTurbidity: 2.0,
  skyRayleigh: 1.0,
  showClouds: false,
  cloudAltitude: 3500,
  cloudOpacity: 0.7,
  fogEnabled: true,
  fogDensity: 0.000015,
  hiResMode: false,
};

const listeners = new Set();

function onChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function update(key, value) {
  // Validate and clamp numeric values
  const rule = CONFIG_VALIDATION[key];
  if (rule && typeof value === 'number') {
    value = Math.max(rule.min, Math.min(rule.max, value));
  }

  if (CONFIG[key] !== value) {
    CONFIG[key] = value;
    for (const fn of listeners) fn(key, value);
  }
}

export { CONFIG, onChange, update };
