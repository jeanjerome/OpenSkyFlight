/**
 * Description of every configurable value: the settings menu is generated from it
 * (js/ui/ControlPanel.js) and config.js validates updates against it.
 *
 * Fields:
 * - key      CONFIG key
 * - tab      menu tab ('graphics' | 'world' | 'flight' | 'dev'); absent for values with no control
 * - section  heading the control is listed under, within its tab
 * - label    control label; help: one sentence shown while the control is hovered or focused
 * - type     'toggle' | 'choice' (segmented buttons) | 'select' (drop-down) | 'range'
 * - options  [[value, label], …] for 'choice' and 'select'
 * - min, max range of a number (clamped by update()); step: slider step
 * - log      the slider moves along a logarithmic scale
 * - format   value → displayed text, for 'range'
 * - persist  kept in localStorage across sessions
 * - reload   'terrain' when the value only applies to terrain tiles loaded afterwards:
 *            the terrain is reloaded when the menu closes
 */

import { MACH_1_MS } from '../constants/physics.js';

const COMPASS = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];

function formatSpeed(ms) {
  if (ms < MACH_1_MS) return `${Math.round(ms * 3.6)} km/h`;
  return `Mach ${(ms / MACH_1_MS).toFixed(1)}`;
}

function formatClarity(turbidity) {
  if (turbidity <= 2) return 'Crystal clear';
  if (turbidity <= 4) return 'Clear';
  if (turbidity <= 7) return 'Hazy';
  return 'Very hazy';
}

const percent = (v) => `${Math.round(v * 100)} %`;

export const SETTINGS = [
  // ── Graphics ──
  {
    key: 'quality',
    tab: 'graphics',
    label: 'Quality',
    help: 'Sets all the graphics settings below at once. Changing one of them makes the quality Custom.',
    type: 'choice',
    options: [
      ['low', 'Low'],
      ['medium', 'Medium'],
      ['high', 'High'],
      ['ultra', 'Ultra'],
      ['custom', 'Custom'],
    ],
    persist: true,
  },
  {
    key: 'imageSharpness',
    tab: 'graphics',
    section: 'Image',
    label: 'Image sharpness',
    help: 'Resolution the landscape is drawn at. Lower settings look softer but run faster.',
    type: 'choice',
    options: [
      ['standard', 'Standard'],
      ['high', 'High'],
      ['maximum', 'Maximum'],
    ],
    persist: true,
  },
  {
    key: 'dynamicResolution',
    tab: 'graphics',
    section: 'Image',
    label: 'Prioritise smoothness',
    help: 'Lowers the image sharpness when needed to keep 60 frames per second.',
    type: 'toggle',
    persist: true,
  },
  {
    key: 'terrainDetail',
    tab: 'graphics',
    section: 'Landscape',
    label: 'Terrain detail',
    help: 'How far away the terrain keeps its fine relief and sharp ground imagery.',
    type: 'choice',
    options: [
      ['normal', 'Normal'],
      ['high', 'High'],
      ['maximum', 'Maximum'],
    ],
    persist: true,
  },
  {
    key: 'bloomEnabled',
    tab: 'graphics',
    section: 'Light',
    label: 'Sun glow',
    help: 'Soft glow around the sun and its reflections on water and snow.',
    type: 'toggle',
    persist: true,
  },
  {
    key: 'autoExposure',
    tab: 'graphics',
    section: 'Light',
    label: 'Eye adaptation',
    help: 'Adjusts the brightness to the scene, as the eye does between shaded valleys and bright snow.',
    type: 'toggle',
    persist: true,
  },

  // ── World ──
  {
    key: 'textureMode',
    tab: 'world',
    section: 'Ground',
    label: 'Ground map',
    help: 'Imagery draped over the terrain.',
    type: 'choice',
    options: [
      ['satellite', 'Satellite'],
      ['osm', 'Road map'],
      ['sar', 'Radar'],
      ['elevation', 'Contour lines'],
    ],
    persist: true,
  },
  {
    key: 'sunElevation',
    tab: 'world',
    section: 'Sun and sky',
    label: 'Sun height',
    help: 'Height of the sun above the horizon: low for sunrise and sunset light, high for midday.',
    type: 'range',
    min: 0,
    max: 90,
    step: 1,
    format: (v) => `${Math.round(v)}°`,
    persist: true,
  },
  {
    key: 'sunAzimuth',
    tab: 'world',
    section: 'Sun and sky',
    label: 'Sun direction',
    help: 'Compass direction of the sun.',
    type: 'range',
    min: 0,
    max: 360,
    step: 1,
    format: (v) => `${Math.round(v)}° ${COMPASS[Math.round(v / 22.5) % 16]}`,
    persist: true,
  },
  {
    key: 'skyTurbidity',
    tab: 'world',
    section: 'Sun and sky',
    label: 'Air clarity',
    help: 'Amount of haze and dust in the air, which whitens the sky and reddens the sun.',
    type: 'range',
    min: 1,
    max: 10,
    step: 0.5,
    format: formatClarity,
    persist: true,
  },
  {
    key: 'fogEnabled',
    tab: 'world',
    section: 'Sun and sky',
    label: 'Distance fog',
    help: 'Fades distant terrain into the colour of the sky.',
    type: 'toggle',
    persist: true,
  },
  {
    key: 'showClouds',
    tab: 'world',
    section: 'Clouds',
    label: 'Clouds',
    help: 'Layer of clouds over the whole landscape.',
    type: 'toggle',
    persist: true,
  },
  {
    key: 'cloudAltitude',
    tab: 'world',
    section: 'Clouds',
    label: 'Cloud altitude',
    help: 'Altitude of the cloud layer above sea level.',
    type: 'range',
    min: 500,
    max: 12000,
    step: 100,
    format: (v) => `${Math.round(v).toLocaleString('en-US')} m`,
    persist: true,
  },
  {
    key: 'cloudOpacity',
    tab: 'world',
    section: 'Clouds',
    label: 'Cloud density',
    help: 'How opaque the clouds are.',
    type: 'range',
    min: 0,
    max: 1,
    step: 0.05,
    format: percent,
    persist: true,
  },
  { key: 'lat', min: -90, max: 90 },
  { key: 'lon', min: -180, max: 180 },

  // ── Flight ──
  {
    key: 'cameraSpeed',
    tab: 'flight',
    section: 'Aircraft',
    label: 'Speed',
    help: 'Flying speed while W or ↑ is held.',
    type: 'range',
    min: 1,
    max: 4000,
    log: true,
    format: formatSpeed,
    persist: true,
  },
  {
    key: 'cameraMode',
    tab: 'flight',
    section: 'Aircraft',
    label: 'View',
    help: 'Behind the aircraft, or from the cockpit (V).',
    type: 'choice',
    options: [
      ['chase', 'Chase'],
      ['cockpit', 'Cockpit'],
    ],
    persist: true,
  },
  {
    key: 'mouseSensitivity',
    tab: 'flight',
    section: 'Aircraft',
    label: 'Mouse sensitivity',
    help: 'How quickly the aircraft turns as the mouse moves.',
    type: 'range',
    min: 0.0005,
    max: 0.005,
    step: 0.0001,
    format: (v) => `${(v / 0.002).toFixed(2)}×`,
    persist: true,
  },
  {
    key: 'showHud',
    tab: 'flight',
    section: 'Display',
    label: 'Head-up display',
    help: 'Speed, altitude and heading over the view (H).',
    type: 'toggle',
    persist: true,
  },
  {
    key: 'showMinimap',
    tab: 'flight',
    section: 'Display',
    label: 'Map',
    help: 'Map of the surroundings in the corner of the screen (M).',
    type: 'toggle',
    persist: true,
  },
  { key: 'minimapZoom', min: 3, max: 18, persist: true },

  // ── Developer ──
  {
    key: 'showLogs',
    tab: 'dev',
    section: 'Logs',
    label: 'Log panel',
    type: 'toggle',
    persist: true,
  },
  {
    key: 'logLevel',
    tab: 'dev',
    section: 'Logs',
    label: 'Log level',
    type: 'select',
    options: [
      ['DEBUG', 'Debug'],
      ['INFO', 'Info'],
      ['WARN', 'Warning'],
      ['ERROR', 'Error'],
    ],
    persist: true,
  },
  {
    key: 'hiResMode',
    tab: 'dev',
    section: 'Terrain',
    label: 'Zoom 18 ground imagery',
    help: 'Loads zoom 18 imagery for close-up static views (R). Too slow for flying.',
    type: 'toggle',
  },
  {
    key: 'terrainLodThreshold',
    tab: 'dev',
    section: 'Terrain',
    label: 'LOD threshold',
    help: 'Tile subdivision threshold, set by Terrain detail.',
    type: 'range',
    min: 0.5,
    max: 2.5,
    step: 0.1,
    format: (v) => v.toFixed(1),
  },
  {
    key: 'textureAnisotropy',
    tab: 'dev',
    section: 'Terrain',
    label: 'Texture anisotropy',
    help: 'Anisotropic filtering of ground imagery, set by Terrain detail.',
    type: 'select',
    options: [
      [1, '1×'],
      [2, '2×'],
      [4, '4×'],
      [8, '8×'],
      [16, '16×'],
    ],
    reload: 'terrain',
  },
  {
    key: 'maxPixelRatio',
    tab: 'dev',
    section: 'Resolution',
    label: 'Max pixel ratio',
    help: 'Output resolution cap, relative to CSS pixels.',
    type: 'range',
    min: 1,
    max: 3,
    step: 0.25,
    format: (v) => `${v.toFixed(2)}×`,
  },
  {
    key: 'renderScale',
    tab: 'dev',
    section: 'Resolution',
    label: 'Max render scale',
    help: 'Highest scene resolution relative to the output, set by Image sharpness.',
    type: 'range',
    min: 0.5,
    max: 1,
    step: 0.05,
    format: percent,
  },
  {
    key: 'skyRayleigh',
    tab: 'dev',
    section: 'Atmosphere',
    label: 'Rayleigh coefficient',
    type: 'range',
    min: 0,
    max: 4,
    step: 0.1,
    format: (v) => v.toFixed(1),
  },
  {
    key: 'fogDensity',
    tab: 'dev',
    section: 'Atmosphere',
    label: 'Fog density',
    type: 'range',
    min: 0,
    max: 0.0001,
    step: 0.000001,
    format: (v) => `${(v * 1e6).toFixed(0)} ×10⁻⁶ /m`,
  },
];

export const SETTINGS_BY_KEY = Object.fromEntries(SETTINGS.map((s) => [s.key, s]));
