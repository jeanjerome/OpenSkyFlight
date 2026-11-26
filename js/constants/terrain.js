/** Maximum native zoom level for Terrarium elevation tiles */
export const SOURCE_MAX_ZOOM = 15;

/** Standard tile size in pixels */
export const TILE_SIZE = 256;

/** Minimap grid size (NxN tiles) */
export const MINIMAP_GRID = 5;

/** Minimap tile cache limit before eviction */
export const MINIMAP_CACHE_LIMIT = 200;

/** Minimap update interval (every N frames, ~20Hz at 60fps) */
export const MINIMAP_UPDATE_INTERVAL = 3;

/** Minimap redraw debounce (ms) for tile load events */
export const MINIMAP_REDRAW_DEBOUNCE = 100;

/** Benchmark warmup duration (seconds) */
export const BENCHMARK_WARMUP_DURATION = 15;

/** Raycast origin altitude for ground elevation checks */
export const RAYCAST_ALTITUDE = 10000;

/** Ground of the contour map: dark green from the valleys to the summits ([elevation (m), sRGB colour]) */
export const CONTOUR_GROUND = [
  [0, 0x050a04],
  [1500, 0x0a1208],
  [3000, 0x0f1a0d],
  [4500, 0x152313],
];

/** Colour of the contour lines (sRGB): green-yellow phosphor */
export const CONTOUR_LINE_COLOR = 0x9dff3a;

/**
 * Luminance of the contour lines in scene units (1 = 72 000 cd/m²): a lit
 * display, which keeps its hue through the tone mapping (brighter lines turn white)
 */
export const CONTOUR_LINE_LUMINANCE = 0.08;

/**
 * Levels of contour lines: interval (m), half width (pixels, at the
 * thinning distance and closer) and intensity
 */
export const CONTOUR_LEVELS = [
  { interval: 50, halfWidth: 1.0, intensity: 0.3 },
  { interval: 250, halfWidth: 1.6, intensity: 0.75 },
  { interval: 1000, halfWidth: 2.4, intensity: 1 },
];

/** Contour lines closer than this on screen (pixels) fade out */
export const CONTOUR_MIN_SPACING = 10;

/**
 * Distance (m) beyond which the contour lines thin out in proportion, as if
 * painted on the ground, down to a share of their width
 */
export const CONTOUR_THINNING_DISTANCE = 4000;
export const CONTOUR_MIN_THICKNESS = 0.4;

/**
 * Maps of the terrain's shadows, centred below the camera, finest first:
 * width (m), texels across, least seconds between two redraws as the tiles on
 * display change, and frames the march toward the light is spread over.
 */
export const TERRAIN_SHADOW_CASCADES = [
  { span: 30e3, size: 2048, refresh: 1, slices: 4 },
  { span: 240e3, size: 1024, refresh: 4, slices: 1 },
];

/** Samples of the march toward the light, spaced geometrically up to the farthest blocker sought */
export const TERRAIN_SHADOW_STEPS = 128;

/** Farthest relief that can shade a point (m): a 4 000 m drop seen 2.3° above the horizon */
export const TERRAIN_SHADOW_MAX_DISTANCE = 100e3;

/** A map is redrawn when the camera has moved this fraction of its width from the map's centre */
export const TERRAIN_SHADOW_RECENTRE = 0.15;

/** A map is redrawn when the light has turned by this much (radians) */
export const TERRAIN_SHADOW_LIGHT_CHANGE = 0.002;

/** Tangent of the angular radius of the sun's disc, which spreads the edges of the shadows */
export const SUN_ANGULAR_RADIUS = 0.00465;

/** Lowest light elevation the shadows are cast at (tangent): below, the direct light has faded out */
export const TERRAIN_SHADOW_MIN_ELEVATION = 0.01;
