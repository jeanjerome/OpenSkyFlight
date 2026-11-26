import { CONFIG, onChange, update } from './config.js';

/**
 * Quality presets and the user-facing graphics settings.
 *
 * A preset sets the user-facing settings; each of those sets technical values
 * (IMAGE_SHARPNESS, TERRAIN_DETAIL). Changing a user-facing setting by hand makes
 * the quality 'custom', unless the new combination matches a preset. Technical
 * values changed directly (developer tab, URL, window.osf) are left as they are.
 */

/** Settings a quality preset sets */
export const QUALITY_PRESETS = {
  low: {
    imageSharpness: 'standard',
    dynamicResolution: true,
    terrainDetail: 'normal',
    bloomEnabled: false,
    autoExposure: true,
    shadows: false,
    heatHaze: false,
    afterburnerLight: false,
  },
  medium: {
    imageSharpness: 'high',
    dynamicResolution: true,
    terrainDetail: 'high',
    bloomEnabled: true,
    autoExposure: true,
    shadows: true,
    heatHaze: false,
    afterburnerLight: false,
  },
  high: {
    imageSharpness: 'maximum',
    dynamicResolution: true,
    terrainDetail: 'high',
    bloomEnabled: true,
    autoExposure: true,
    shadows: true,
    heatHaze: true,
    afterburnerLight: false,
  },
  ultra: {
    imageSharpness: 'maximum',
    dynamicResolution: true,
    terrainDetail: 'maximum',
    bloomEnabled: true,
    autoExposure: true,
    shadows: true,
    heatHaze: true,
    afterburnerLight: true,
  },
};

/**
 * GPU time of each preset relative to High, averaged over the six reference views at a
 * fixed scale, shown on the preset cards of the menu (Ultra includes the afterburner light,
 * about 4 % of a frame)
 */
export const PRESET_GPU_COST = { low: 0.55, medium: 0.85, high: 1, ultra: 1.16 };

/** Highest resolution of the scene pass, relative to the output (TAAU reconstructs the rest) */
export const IMAGE_SHARPNESS = {
  standard: { renderScale: 0.6 },
  high: { renderScale: 0.8 },
  maximum: { renderScale: 1 },
};

/** Tile subdivision threshold and anisotropic filtering of the ground imagery */
export const TERRAIN_DETAIL = {
  normal: { terrainLodThreshold: 0.9, textureAnisotropy: 4 },
  high: { terrainLodThreshold: 1.2, textureAnisotropy: 16 },
  maximum: { terrainLodThreshold: 1.4, textureAnisotropy: 16 },
};

const PRESET_KEYS = Object.keys(QUALITY_PRESETS.high);

const DERIVED = {
  imageSharpness: IMAGE_SHARPNESS,
  terrainDetail: TERRAIN_DETAIL,
};

function matchingPreset() {
  for (const [name, preset] of Object.entries(QUALITY_PRESETS)) {
    if (PRESET_KEYS.every((key) => CONFIG[key] === preset[key])) return name;
  }
  return 'custom';
}

/**
 * Sets the technical values of the user-facing settings, except those in `explicit`
 * (set from the URL), then keeps them in sync with later changes.
 * @param {Set<string>} [explicit] - keys whose current value must be kept
 */
export function bindQualitySettings(explicit = new Set()) {
  // A stored or URL preset wins over the settings it covers, unless they were set explicitly
  const preset = QUALITY_PRESETS[CONFIG.quality];
  if (preset) {
    for (const key of PRESET_KEYS) {
      if (!explicit.has(key)) CONFIG[key] = preset[key];
    }
  }
  CONFIG.quality = matchingPreset();
  for (const [key, levels] of Object.entries(DERIVED)) {
    for (const [target, value] of Object.entries(levels[CONFIG[key]])) {
      if (!explicit.has(target)) CONFIG[target] = value;
    }
  }

  let applyingPreset = false;
  onChange((key, value) => {
    if (key === 'quality' && QUALITY_PRESETS[value]) {
      applyingPreset = true;
      for (const [k, v] of Object.entries(QUALITY_PRESETS[value])) update(k, v);
      applyingPreset = false;
      return;
    }
    if (DERIVED[key]) {
      for (const [target, v] of Object.entries(DERIVED[key][value])) update(target, v);
    }
    if (!applyingPreset && PRESET_KEYS.includes(key)) update('quality', matchingPreset());
  });
}
