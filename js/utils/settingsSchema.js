/**
 * Description of every configurable value: the settings menu is generated from it
 * (js/ui/ControlPanel.js) and config.js validates updates against it.
 *
 * Fields:
 * - key      CONFIG key
 * - tab      menu tab ('graphics' | 'world' | 'flight' | 'audio' | 'dev'); absent for values with no control
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
 * - ordered  the options of a 'choice' or 'select' go from least to most: the menu shows
 *            the level reached and stops at both ends instead of wrapping around
 * - impact   { cost, gain } from 0 to 5, and a note, shown for the graphics settings:
 *            measured on the reference views (docs/rendering-roadmap.md, L2.7)
 */

import { MACH_1_MS } from '../constants/physics.js';

function formatSpeed(ms) {
  if (ms < MACH_1_MS) return `${Math.round(ms * 3.6)} km/h`;
  return `Mach ${(ms / MACH_1_MS).toFixed(1)}`;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTH_DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

/** Hours → 'HH:MM' */
function formatClock(hours) {
  const minutes = Math.round(hours * 60) % (24 * 60);
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}

/** Day of the year (1 to 365) → '3 Mar' */
function formatDate(dayOfYear) {
  let day = Math.round(dayOfYear);
  let month = 0;
  while (month < 11 && day > MONTH_DAYS[month]) day -= MONTH_DAYS[month++];
  return `${day} ${MONTHS[month]}`;
}

function formatVisibility(km) {
  const distance = `${km < 20 ? km.toFixed(1) : Math.round(km)} km`;
  if (km >= 150) return `${distance} · crystal clear`;
  if (km >= 60) return `${distance} · clear`;
  if (km >= 25) return `${distance} · hazy`;
  return `${distance} · very hazy`;
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
    ordered: true,
    impact: { note: 'The GPU time of each preset is shown relative to High, as measured on the reference views.' },
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
    ordered: true,
    impact: {
      cost: 4,
      gain: 4,
      note: 'Standard saves about a quarter of the GPU time of Maximum, High about a tenth.',
    },
    persist: true,
  },
  {
    key: 'dynamicResolution',
    tab: 'graphics',
    section: 'Image',
    label: 'Prioritise smoothness',
    help: 'Lowers the image sharpness when needed to keep 60 frames per second.',
    type: 'toggle',
    impact: { cost: 0, gain: 0, note: 'Costs nothing: it only lowers the load when the GPU falls behind.' },
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
    ordered: true,
    impact: {
      cost: 3,
      gain: 3,
      note: 'Normal shows less than half as many of the finest terrain tiles as High. Maximum shows about a third more, and can stutter at 120 Hz.',
    },
    persist: true,
  },
  {
    key: 'bloomEnabled',
    tab: 'graphics',
    section: 'Light',
    label: 'Sun glow',
    help: 'Soft glow around the sun and its reflections on water and snow.',
    type: 'toggle',
    impact: { cost: 2, gain: 3, note: 'About a tenth of the GPU time of a frame.' },
    persist: true,
  },
  {
    key: 'lensFlare',
    tab: 'graphics',
    section: 'Light',
    label: 'Lens flare',
    help: 'Facing the sun, faint ghost images of it spread across the view, as through a camera lens.',
    type: 'toggle',
    impact: { cost: 1, gain: 1 },
    persist: true,
  },
  {
    key: 'heatHaze',
    tab: 'graphics',
    section: 'Light',
    label: 'Heat haze',
    help: 'The hot exhaust behind the engines makes the view through it shimmer.',
    type: 'toggle',
    impact: { cost: 1, gain: 1 },
    persist: true,
  },
  {
    key: 'afterburnerLight',
    tab: 'graphics',
    section: 'Light',
    label: 'Afterburner light',
    help: 'The afterburner flame lights the aircraft and, low over it, the ground.',
    type: 'toggle',
    impact: { cost: 1, gain: 1, note: 'About 0.1 to 0.2 ms of GPU time per frame, with or without afterburner.' },
    persist: true,
  },
  {
    key: 'autoExposure',
    tab: 'graphics',
    section: 'Light',
    label: 'Eye adaptation',
    help: 'Adjusts the brightness to the scene, as the eye does between shaded valleys and bright snow.',
    type: 'toggle',
    impact: { cost: 1, gain: 3, note: 'Under 1 % of the GPU time of a frame.' },
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
    key: 'timeOfDay',
    tab: 'world',
    section: 'Sun and sky',
    label: 'Time of day',
    help: 'Local solar time where you fly: the sun is highest at 12:00.',
    type: 'range',
    min: 0,
    max: 24 - 5 / 60,
    step: 5 / 60,
    format: formatClock,
    persist: true,
  },
  {
    key: 'dayOfYear',
    tab: 'world',
    section: 'Sun and sky',
    label: 'Date',
    help: 'Sets how high the sun climbs and where it rises and sets.',
    type: 'range',
    min: 1,
    max: 365,
    step: 1,
    format: formatDate,
    persist: true,
  },
  {
    key: 'timeSpeed',
    tab: 'world',
    section: 'Sun and sky',
    label: 'Time speed',
    help: 'How fast the sun moves across the sky while you fly.',
    type: 'choice',
    options: [
      [0, 'Frozen'],
      [1, 'Real time'],
      [60, '×60'],
      [600, '×600'],
    ],
    ordered: true,
    persist: true,
  },
  {
    key: 'visibility',
    tab: 'world',
    section: 'Sun and sky',
    label: 'Visibility',
    help: 'How far you can see near the ground through the haze and dust in the air, which whiten the sky and redden the sun.',
    type: 'range',
    min: 10,
    max: 280,
    log: true,
    format: formatVisibility,
    persist: true,
  },
  {
    key: 'fogEnabled',
    tab: 'world',
    section: 'Sun and sky',
    label: 'Distance haze',
    help: 'Light scattered by the air between you and the scenery: distant mountains fade into blue, sunsets into orange.',
    type: 'toggle',
    persist: true,
  },
  {
    key: 'showClouds',
    tab: 'world',
    section: 'Clouds',
    label: 'Clouds',
    help: 'Clouds you can fly through, casting their shadows on the ground (needs a browser with WebGPU).',
    type: 'toggle',
    persist: true,
  },
  {
    key: 'cloudAltitude',
    tab: 'world',
    section: 'Clouds',
    label: 'Cloud altitude',
    help: 'Altitude above sea level of the base of the lowest clouds.',
    type: 'range',
    min: 500,
    max: 12000,
    step: 100,
    format: (v) => `${Math.round(v).toLocaleString('en-US')} m`,
    persist: true,
  },
  {
    key: 'cloudCover',
    tab: 'world',
    section: 'Clouds',
    label: 'Cloud cover',
    help: 'How much of the sky the clouds cover, from a few scattered clouds to an overcast sky.',
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
    key: 'flightMode',
    tab: 'flight',
    section: 'Aircraft',
    label: 'Flight',
    help: 'Simulation: the Rafale flies by its weight, wings and engines. Exploration: free flight at any speed, to travel and look around (F).',
    type: 'choice',
    options: [
      ['simulation', 'Simulation'],
      ['exploration', 'Exploration'],
    ],
    persist: true,
  },
  {
    key: 'cameraSpeed',
    tab: 'flight',
    section: 'Aircraft',
    label: 'Exploration speed',
    help: 'Flying speed in the Exploration mode while W or ↑ is held.',
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
    help: 'Behind the aircraft; around it, turned with the mouse or the right stick and zoomed with the wheel; or from the cockpit (V).',
    type: 'choice',
    options: [
      ['chase', 'Chase'],
      ['orbit', 'Orbit'],
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
    key: 'antiCollisionLights',
    tab: 'flight',
    section: 'Aircraft',
    label: 'Anti-collision lights',
    help: 'Flashing red beacons and white wingtip strobes (O).',
    type: 'toggle',
    persist: true,
  },
  {
    key: 'gamepadSensitivity',
    tab: 'flight',
    section: 'Gamepad',
    label: 'Stick sensitivity',
    help: 'How quickly the aircraft turns at full stick.',
    type: 'range',
    min: 0.25,
    max: 2,
    step: 0.05,
    format: (v) => `${v.toFixed(2)}×`,
    persist: true,
  },
  {
    key: 'invertStickPitch',
    tab: 'flight',
    section: 'Gamepad',
    label: 'Invert stick pitch',
    help: 'Off: pull the stick back to raise the nose, as in an aircraft. On: push it forward to raise the nose.',
    type: 'toggle',
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

  // ── Audio ──
  {
    key: 'masterVolume',
    tab: 'audio',
    section: 'Volume',
    label: 'Master volume',
    help: 'Volume of every sound of the simulator.',
    type: 'range',
    min: 0,
    max: 1,
    step: 0.05,
    format: percent,
    persist: true,
  },
  {
    key: 'interfaceVolume',
    tab: 'audio',
    section: 'Volume',
    label: 'Interface',
    help: 'Sounds of this menu when moving through it and changing a setting.',
    type: 'range',
    min: 0,
    max: 1,
    step: 0.05,
    format: percent,
    persist: true,
  },
  {
    key: 'engineVolume',
    tab: 'audio',
    section: 'Volume',
    label: 'Engines',
    help: 'Sound of the aircraft engines: turbine whine, jet roar and afterburner rumble.',
    type: 'range',
    min: 0,
    max: 1,
    step: 0.05,
    format: percent,
    persist: true,
  },
  {
    key: 'radioVolume',
    tab: 'audio',
    section: 'Volume',
    label: 'Radio',
    help: 'Voices on the radio. There is no radio traffic yet: this volume will apply to it.',
    type: 'range',
    min: 0,
    max: 1,
    step: 0.05,
    format: percent,
    persist: true,
  },

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
    ordered: true,
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
    ordered: true,
    reload: 'terrain',
  },
  {
    key: 'aerialPerspectiveVolume',
    tab: 'dev',
    section: 'Atmosphere',
    label: 'Aerial perspective volume',
    help: 'Reads the aerial perspective from a volume computed once per frame instead of evaluating it at every pixel (WebGPU only).',
    type: 'toggle',
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
];

export const SETTINGS_BY_KEY = Object.fromEntries(SETTINGS.map((s) => [s.key, s]));
