/** Scene clear color (dark navy) */
export const CLEAR_COLOR = 0x0a0a1a;

/** Maximum concurrent fetch requests to avoid ERR_INSUFFICIENT_RESOURCES */
export const MAX_CONCURRENT_FETCHES = 6;

/** Render order for water plane (below clouds) */
export const WATER_RENDER_ORDER = 99;

/** Render order for cloud layer (above water) */
export const CLOUD_RENDER_ORDER = 100;

/** Water plane geometry size (world units) */
export const WATER_PLANE_SIZE = 20000;

/** Water plane color */
export const WATER_COLOR = 0x1a3a5c;

/** Water plane opacity */
export const WATER_OPACITY = 0.4;

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

/** Far plane for realworld mode (geo-three handles LOD) */
export const REALWORLD_FAR_PLANE = 1e7;

/** Minimum far plane for procedural mode */
export const PROCEDURAL_MIN_FAR = 5000;

/** Near/far ratio for procedural mode */
export const PROCEDURAL_NEAR_FAR_RATIO = 0.0001;

/** Clip plane change threshold before updating projection */
export const CLIP_PLANE_EPSILON = 100;

/** Far plane multiplier for procedural view distance */
export const PROCEDURAL_FAR_MULTIPLIER = 1.5;

// --- Ambient / directional light defaults ---

export const AMBIENT_INTENSITY = 0.3;
export const DIR_LIGHT_INTENSITY = 1.2;
export const DIR_LIGHT_POSITION = [1, 0.5, 0.8];
