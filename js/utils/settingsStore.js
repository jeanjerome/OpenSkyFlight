import { DEFAULTS, onChange, update } from './config.js';
import { SETTINGS, SETTINGS_BY_KEY } from './settingsSchema.js';

/**
 * Settings kept across sessions and settings given in the URL.
 *
 * Settings marked `persist` in the schema are saved to localStorage when they
 * change. Any CONFIG key can be given as a URL parameter (?quality=low&showHud=false);
 * URL values override the stored ones for the session and are not saved unless
 * changed afterwards. ?dev=1 shows the developer tab and enables the developer
 * shortcuts, and is remembered until ?dev=0.
 */

const STORAGE_KEY = 'osf.settings';
const DEV_KEY = 'osf.dev';

const PERSISTED = SETTINGS.filter((s) => s.persist).map((s) => s.key);

function readStorage(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(key, value) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // Storage unavailable (private browsing, blocked site data): settings last for the session
  }
}

/** Parses a URL value as JSON (numbers, booleans), falling back to the raw string */
function parseValue(raw) {
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

/** Type of a value for a key, from its default */
function coerce(key, value) {
  const expected = typeof DEFAULTS[key];
  if (typeof value === expected) return value;
  if (expected === 'string') return String(value);
  return undefined;
}

let devMode = false;
/** Values saved to localStorage */
let stored = {};

/**
 * Applies the stored settings, then the URL parameters, and starts saving changes.
 * Call before anything reads CONFIG.
 * @returns {Set<string>} keys set from the URL
 */
export function loadSettings() {
  try {
    stored = JSON.parse(readStorage(STORAGE_KEY)) || {};
  } catch {
    stored = {};
  }
  for (const key of PERSISTED) {
    const value = coerce(key, stored[key]);
    if (value !== undefined) update(key, value);
  }

  const params = new URLSearchParams(window.location.search);
  const explicit = new Set();
  for (const [key, raw] of params) {
    if (!(key in DEFAULTS)) continue;
    const value = coerce(key, parseValue(raw));
    if (value === undefined) continue;
    update(key, value);
    explicit.add(key);
  }

  if (params.has('dev')) writeStorage(DEV_KEY, params.get('dev') === '1' ? '1' : null);
  devMode = readStorage(DEV_KEY) === '1';

  onChange((key, value) => {
    if (!SETTINGS_BY_KEY[key]?.persist) return;
    stored[key] = value;
    writeStorage(STORAGE_KEY, JSON.stringify(stored));
  });

  return explicit;
}

/** Whether the developer tab and shortcuts are enabled (?dev=1) */
export function isDevMode() {
  return devMode;
}

/** Restores every persisted setting to its default and forgets the stored values */
export function resetSettings() {
  for (const key of PERSISTED) update(key, DEFAULTS[key]);
  stored = {};
  writeStorage(STORAGE_KEY, null);
}
