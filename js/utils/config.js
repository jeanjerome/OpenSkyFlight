import { SETTINGS_BY_KEY } from './settingsSchema.js';

/**
 * @typedef {Object} AppConfig
 *
 * Real-world terrain:
 * @property {number}  lat                    - Latitude in decimal degrees (default: 45.8326 — Mont Blanc)
 * @property {number}  lon                    - Longitude in decimal degrees (default: 6.8652)
 * @property {number}  zoom                   - Tile zoom level (default: 15)
 * @property {number}  minZoom                - Minimum zoom for LOD rings (default: 3)
 * @property {string}  textureMode             - 'satellite' | 'osm' | 'sar' | 'elevation' (default: 'satellite')
 * @property {boolean} hiResMode              - Hi-res zoom 18 mode (default: false)
 *
 * Camera & flight:
 * @property {number}  cameraSpeed            - Flight speed in m/s, range [1..4000] (default: 560)
 * @property {string}  cameraMode             - 'chase' | 'cockpit' (default: 'chase')
 * @property {number}  mouseSensitivity       - Mouse look sensitivity (default: 0.002)
 *
 * Graphics (user-facing; each one drives technical settings, see qualityPresets.js):
 * @property {string}  quality                - 'low' | 'medium' | 'high' | 'ultra' | 'custom' (default: 'high')
 * @property {string}  imageSharpness         - 'standard' | 'high' | 'maximum' (default: 'maximum')
 * @property {string}  terrainDetail          - 'normal' | 'high' | 'maximum' (default: 'high')
 *
 * Rendering:
 * @property {number}  terrainLodThreshold    - Tile subdivision threshold: higher keeps fine relief further away (default: 1.2)
 * @property {number}  textureAnisotropy      - Anisotropic filtering of ground textures, applied on terrain reload (default: 16)
 * @property {number}  maxPixelRatio          - Maximum device pixel ratio (default: 2)
 * @property {number}  renderScale            - Highest resolution of the 3D scene relative to the screen, range [0.5..1] (default: 1)
 * @property {boolean} dynamicResolution      - Lower the scene resolution when the GPU exceeds the 60 FPS budget (default: true)
 * @property {boolean} autoExposure           - Adapt the exposure to the scene brightness (default: true)
 * @property {boolean} bloomEnabled           - Glow around the sun and its specular reflections (default: true)
 *
 * Atmosphere:
 * @property {number}  sunElevation           - Sun elevation angle in degrees, range [0..90] (default: 35)
 * @property {number}  sunAzimuth             - Sun compass bearing in degrees, clockwise from north, range [0..360] (default: 160)
 * @property {number}  visibility             - Visibility at sea level in km, set by the aerosol density, range [10..280] (default: 220)
 * @property {boolean} showClouds             - Show cloud layer (default: false)
 * @property {number}  cloudAltitude          - Cloud layer altitude in meters, range [500..12000] (default: 3500)
 * @property {number}  cloudOpacity           - Cloud opacity (default: 0.7)
 * @property {boolean} aerialPerspectiveVolume - Aerial perspective read from a frustum-aligned volume instead of per pixel, WebGPU only (default: true)
 * @property {boolean} fogEnabled             - Aerial perspective: light scattered and absorbed by the air between the camera and the scenery (default: true)
 *
 * UI:
 * @property {boolean} showHud                - Show HUD overlay (default: true)
 * @property {string}  logLevel               - Log level: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR' (default: 'WARN')
 * @property {boolean} showLogs               - Show log panel (default: false)
 * @property {boolean} showMinimap            - Show minimap (default: true)
 * @property {number}  minimapZoom            - Minimap zoom level, range [3..18] (default: 13)
 *
 * Audio (0 to 1):
 * @property {number}  masterVolume           - Volume of all sounds (default: 0.8)
 * @property {number}  interfaceVolume        - Menu sounds (default: 0.6)
 * @property {number}  engineVolume           - Aircraft engines (default: 0.8)
 * @property {number}  radioVolume            - Radio voices (default: 0.8)
 */

/** @type {AppConfig} */
const CONFIG = {
  cameraSpeed: 560,
  cameraMode: 'chase',
  mouseSensitivity: 0.002,
  quality: 'high',
  imageSharpness: 'maximum',
  terrainDetail: 'high',
  terrainLodThreshold: 1.2,
  textureAnisotropy: 16,
  maxPixelRatio: 2,
  renderScale: 1,
  dynamicResolution: true,
  autoExposure: true,
  bloomEnabled: true,
  lat: 45.8326, // Mont Blanc default
  lon: 6.8652,
  zoom: 15,
  textureMode: 'satellite', // 'satellite' | 'osm' | 'sar' | 'elevation'
  minZoom: 3,
  showHud: true,
  logLevel: 'WARN',
  showLogs: false,
  showMinimap: true,
  minimapZoom: 13,
  masterVolume: 0.8,
  interfaceVolume: 0.6,
  engineVolume: 0.8,
  radioVolume: 0.8,
  sunElevation: 35,
  sunAzimuth: 160,
  visibility: 220,
  showClouds: false,
  cloudAltitude: 3500,
  cloudOpacity: 0.7,
  fogEnabled: true,
  aerialPerspectiveVolume: true,
  hiResMode: false,
};

/** Values before any stored, URL or user change */
const DEFAULTS = Object.freeze({ ...CONFIG });

const listeners = new Set();

function onChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function update(key, value) {
  // Clamp numbers to the range of their setting, reject unknown choices
  const setting = SETTINGS_BY_KEY[key];
  if (setting && typeof value === 'number' && setting.min !== undefined) {
    value = Math.max(setting.min, Math.min(setting.max, value));
  }
  if (setting?.options && !setting.options.some(([v]) => v === value)) return;

  if (CONFIG[key] !== value) {
    CONFIG[key] = value;
    for (const fn of listeners) fn(key, value);
  }
}

export { CONFIG, DEFAULTS, onChange, update };
