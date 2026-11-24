/** Scene clear color (dark navy) */
export const CLEAR_COLOR = 0x0a0a1a;

/** Maximum concurrent fetch requests to avoid ERR_INSUFFICIENT_RESOURCES */
export const MAX_CONCURRENT_FETCHES = 6;

/** Render order for cloud layer (above water) */
export const CLOUD_RENDER_ORDER = 100;

// --- Dynamic resolution (see AdaptiveQualityManager) ---

/** Frames per decision; the decision uses their median */
export const ADAPTIVE_WINDOW_FRAMES = 30;

/** GPU time budget of a frame (60 FPS) */
export const ADAPTIVE_TARGET_FRAME_MS = 1000 / 60;

/** Share of the budget above which the scene resolution drops */
export const ADAPTIVE_DOWN_LOAD = 0.9;

/** Share of the budget below which the scene resolution may rise, and that a drop aims for */
export const ADAPTIVE_UP_LOAD = 0.8;

/** Time without change before the scene resolution rises (ms) */
export const ADAPTIVE_UP_HOLD_MS = 2000;

/** Scene resolution rise per decision */
export const ADAPTIVE_SCALE_UP_STEP = 0.05;

/** Smallest change of the scene resolution */
export const ADAPTIVE_MIN_SCALE_STEP = 0.05;

/** Lowest scene resolution relative to the output (a quarter of the pixels) */
export const ADAPTIVE_MIN_RENDER_SCALE = 0.5;

/** Without GPU timing: frame interval above which the scene resolution drops (below 50 FPS) */
export const ADAPTIVE_FALLBACK_HIGH_FRAME_MS = 20;

/** Without GPU timing: frame interval below which the scene resolution may rise */
export const ADAPTIVE_FALLBACK_LOW_FRAME_MS = 12;

// --- Clip planes ---

/** Far plane for realworld mode (three-tile handles LOD) */
export const REALWORLD_FAR_PLANE = 1e7;

/** Clip plane change threshold before updating projection */
export const CLIP_PLANE_EPSILON = 100;

// --- Ambient / directional light defaults ---

export const AMBIENT_INTENSITY = 0.3;
export const DIR_LIGHT_INTENSITY = 1.2;
export const DIR_LIGHT_POSITION = [1, 0.5, 0.8];

// --- Tone mapping and sky-consistent lighting ---
// Sky, sun and ambient light share the radiance scale of the Preetham sky
// (three.js SkyMesh), whose horizon reaches about 10 in daylight.

/** Exposure applied before AgX tone mapping */
export const TONE_MAPPING_EXPOSURE = 0.35;

/**
 * Sun illuminance at normal incidence for a fully transmitted Preetham sun.
 * Gives a direct-sun to sky-dome irradiance ratio of about 5:1 on flat ground
 * with the sun 55° high, as measured under a clear sky.
 */
export const SUN_ILLUMINANCE_SCALE = 57;

/** Average albedo of the ground seen from the air (forest, meadows, rock), for bounced light */
export const GROUND_ALBEDO = 0.15;

// --- Bloom ---
// Only pixels brighter than any lit diffuse surface and than the sky itself
// (the sun disc and mirror-like reflections of the sun) bloom; see
// AtmosphericSky for the threshold.

/** Share of the light above the threshold spread by the bloom, per blur level (5 levels) */
export const BLOOM_STRENGTH = 0.015;

/** Weight of the wide blur levels against the narrow ones, in [0, 1] */
export const BLOOM_RADIUS = 0.8;

// --- Automatic exposure (see AutoExposureNode) ---

/** Histogram bins of log2 luminance */
export const AUTO_EXPOSURE_BINS = 64;

/** log2 luminance range of the histogram: deep shadow to well above the brightest sky */
export const AUTO_EXPOSURE_LOG_MIN = -8;
export const AUTO_EXPOSURE_LOG_MAX = 10;

/** Metering grid (samples across, down), whatever the resolution */
export const AUTO_EXPOSURE_GRID = [256, 144];

/** Share of the darkest and of the brightest samples left out of the average */
export const AUTO_EXPOSURE_LOW_PERCENTILE = 0.4;
export const AUTO_EXPOSURE_HIGH_PERCENTILE = 0.9;

/**
 * Scene luminance (before exposure) for which the base exposure (TONE_MAPPING_EXPOSURE)
 * is right: the geometric mean of the metered luminance of the daytime reference views
 */
export const AUTO_EXPOSURE_REFERENCE_LUMINANCE = 1.32;

/**
 * Share of the deviation from the reference luminance that the exposure compensates,
 * in stops. Below 1, as with the eye, snow in full sun still looks brighter than a
 * valley and a dusk scene darker than noon.
 */
export const AUTO_EXPOSURE_COMPENSATION = 0.6;

/** Limits of the correction around the base exposure, in stops */
export const AUTO_EXPOSURE_MIN_EV = -1.5;
export const AUTO_EXPOSURE_MAX_EV = 1;

/** Adaptation rates (1/s): toward a brighter scene, toward a darker one */
export const AUTO_EXPOSURE_SPEED_TO_BRIGHT = 3;
export const AUTO_EXPOSURE_SPEED_TO_DARK = 1;
