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
