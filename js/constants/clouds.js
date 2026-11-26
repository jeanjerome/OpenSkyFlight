/** Voxels along each side of the cloud shape volume (billows, a few kilometres per repeat) */
export const CLOUD_SHAPE_SIZE = 128;

/** Voxels along each side of the cloud detail volume (eroded edges, a hundred metres per repeat) */
export const CLOUD_DETAIL_SIZE = 32;

/** Texels along each side of the weather map (where each layer of clouds forms) */
export const CLOUD_WEATHER_SIZE = 512;

/** Texels along each side of the cirrus map (their fibres) */
export const CLOUD_CIRRUS_SIZE = 1024;

/** Ground distance covered by one repeat of the cirrus map (m) */
export const CLOUD_CIRRUS_TILE = 20e3;

/**
 * Fibres of the cirrus map: ridges of Perlin noise, cells of the first octave
 * along x (the wind) and how much more of them across it (the stretch of the
 * streaks), sharpness of the ridges, octaves, cells and amplitude of the broad
 * swirls that bend them. Each octave's ridges must stay several texels wide
 * (cells × stretch × 2^(octaves − 1) well below CLOUD_CIRRUS_SIZE), or a
 * diagonal fibre breaks into a row of beads. Where the weather map is dense the
 * cirrus fill the fibres above `fill` (fading in over `softness`), where it
 * thins out only their crests.
 */
export const CLOUD_CIRRUS_FIBRES = {
  cells: 2,
  stretch: 16,
  sharpness: 7,
  octaves: 3,
  warpCells: 2,
  warp: 0.11,
  fill: 0.1,
  softness: 0.4,
};

/** Ground distance covered by one repeat of the weather map (m) */
export const CLOUD_WEATHER_TILE = 100e3;

/** Distance covered by one repeat of the shape volume (m) */
export const CLOUD_SHAPE_TILE = 3300;

/** Distance covered by one repeat of the detail volume (m) */
export const CLOUD_DETAIL_TILE = 170;

/**
 * The cloud layers, one per channel of the weather map (low cumulus, mid-level
 * clouds, high cirrus): base relative to the cumulus base (the cloud altitude
 * setting; the cirrus keep their own altitude, m), thickness (m), density
 * (extinction per metre at full density), share of the shape noise that erodes
 * them and of the detail noise, exponent of the weather map, bias of the
 * rounding of their tops and softness of their edges where the coverage cuts
 * the weather map (after takram's three-clouds defaults). The cirrus are thin
 * and translucent, shaped by the fibres of the cirrus map instead of the shape
 * noise (see CLOUD_CIRRUS_FIBRES).
 */
export const CLOUD_LAYERS = [
  { base: 0, thickness: 650, density: 0.2, shape: 1, detail: 1, weatherExponent: 1, bias: 0.35, edge: 0.6 },
  { base: 250, thickness: 1200, density: 0.2, shape: 1, detail: 1, weatherExponent: 1, bias: 0.35, edge: 0.6 },
  { altitude: 7500, thickness: 175, density: 0.0011, shape: 0, detail: 0, weatherExponent: 2.5, bias: 0.35, edge: 0.3 },
];

/** Sky fraction the clouds cover at the default weather (0 clear, 1 overcast) */
export const CLOUD_DEFAULT_COVERAGE = 0.4;

/** Wind carrying the clouds (m/s, toward +x east and +z south) */
export const CLOUD_WIND = [8, -3];

/** Primary ray march: steps at most, first step (m), growth of each step, longest step and distance (m) */
export const CLOUD_MAX_STEPS = 256;
export const CLOUD_MIN_STEP = 60;
export const CLOUD_STEP_GROWTH = 1.01;
export const CLOUD_MAX_STEP = 1000;
export const CLOUD_MAX_DISTANCE = 200e3;

/** The march stops when the light from behind is below this share */
export const CLOUD_MIN_TRANSMITTANCE = 0.01;

/** Ray march toward the light: steps, first step (m), growth of each step */
export const CLOUD_LIGHT_STEPS = 6;
export const CLOUD_LIGHT_MIN_STEP = 40;
export const CLOUD_LIGHT_STEP_GROWTH = 2;

/** The detail noise is only read within this distance from the camera (m) */
export const CLOUD_DETAIL_DISTANCE = 20e3;

/**
 * Light scattering in a cloud: two Henyey-Greenstein lobes (forward, back) and
 * the share of the second, octaves of the multiple scattering approximation,
 * scale of the sky light. Thin edges are not darkened ("powder", Schneider):
 * it greyed the thin cirrus, darker than the sky behind them, and dulled the
 * cumulus.
 */
export const CLOUD_PHASE_G = [0.7, -0.2];
export const CLOUD_PHASE_MIX = 0.5;
export const CLOUD_SCATTERING_OCTAVES = 8;
/**
 * Factors applied at each octave of the multiple scattering (Wrenninge 2013):
 * to its energy, to the optical depth it goes through (below 1, the light of
 * the later octaves reaches deeper into the cloud) and to the anisotropy of its
 * phase function
 */
export const CLOUD_SCATTERING_DECAY = { energy: 0.5, opticalDepth: 0.5, anisotropy: 0.5 };
export const CLOUD_SKY_LIGHT_SCALE = 1;

/** Distance standing for the sky, where the scene pass drew nothing (m) */
export const CLOUD_SKY_DISTANCE = 1e7;

/**
 * Temporal upscaling of the clouds: each frame marches one pixel of every 4×4
 * block of the scene pass, and the image of the previous frames is reprojected
 * for the others. The history of a pixel is kept while the scene distance there
 * changes by less than this share, and clipped to the spread of the clouds
 * marched around it, widened by this factor (variance clipping)
 */
export const CLOUD_HISTORY_DEPTH_TOLERANCE = 0.1;
export const CLOUD_VARIANCE_GAMMA = 2;

/**
 * Share of a freshly marched pixel blended into its history (the rest of the
 * noise averages out over the frames): a pixel is marched every sixteen frames,
 * so that its history spans about five of its samples
 */
export const CLOUD_CURRENT_WEIGHT = 0.2;

/**
 * Shadows of the clouds on the ground: a map of the optical depth of the
 * clouds along the light, of CLOUD_SHADOW_SIZE² texels over CLOUD_SHADOW_SPAN
 * (m) centred below the camera, marched in CLOUD_SHADOW_STEPS steps through
 * each third of the cumulus and mid-level layers and CLOUD_SHADOW_CIRRUS_STEPS
 * through the cirrus, redrawn every CLOUD_SHADOW_REFRESH renders (the clouds
 * and their shadows move slowly). The light's elevation is taken as at least
 * CLOUD_SHADOW_MIN_SUN (sine) for the projection along it.
 */
export const CLOUD_SHADOW_SIZE = 512;
export const CLOUD_SHADOW_SPAN = 60e3;
export const CLOUD_SHADOW_STEPS = 8;
export const CLOUD_SHADOW_CIRRUS_STEPS = 2;
export const CLOUD_SHADOW_MIN_SUN = 0.05;
export const CLOUD_SHADOW_REFRESH = 4;
