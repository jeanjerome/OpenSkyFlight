/** Scene clear color (dark navy) */
export const CLEAR_COLOR = 0x0a0a1a;

/** Maximum concurrent fetch requests to avoid ERR_INSUFFICIENT_RESOURCES */
export const MAX_CONCURRENT_FETCHES = 6;

/** Render order for cloud layer (above water) */
export const CLOUD_RENDER_ORDER = 100;

// --- Adaptive quality (dynamic resolution scaling) ---

/** Ring buffer size for frame time averaging */
export const FRAME_TIME_RING_SIZE = 30;

/** Minimum samples before adaptive quality kicks in */
export const ADAPTIVE_MIN_SAMPLES = 10;

/** Frame time threshold (ms) above which resolution scales down */
export const ADAPTIVE_HIGH_FRAME_TIME = 20;

/** Frame time threshold (ms) below which resolution scales up */
export const ADAPTIVE_LOW_FRAME_TIME = 12;

/** Resolution scale-down step per evaluation */
export const ADAPTIVE_SCALE_DOWN_STEP = 0.05;

/** Resolution scale-up step per evaluation */
export const ADAPTIVE_SCALE_UP_STEP = 0.02;

/** Minimum pixel ratio floor */
export const ADAPTIVE_MIN_PIXEL_RATIO = 0.5;

/** Minimum delta to apply pixel ratio change */
export const ADAPTIVE_RATIO_EPSILON = 0.01;

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
