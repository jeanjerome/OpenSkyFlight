/** Primary HUD color (green) */
export const HUD_COLOR = '#00ff88';

/** HUD global alpha */
export const HUD_ALPHA = 0.85;

/** HUD shadow color for text readability */
export const HUD_SHADOW_COLOR = 'rgba(0, 0, 0, 0.9)';

/** HUD shadow blur (reduced from 6 for perf — avoids SW blur path) */
export const HUD_SHADOW_BLUR = 2;

/** Vertical spacing between top-right badges */
export const BADGE_SPACING = 30;

/** Starting Y position for the first badge */
export const BADGE_START_Y = 44;

/** Badge padding */
export const BADGE_PAD = 6;

/** Badge height */
export const BADGE_HEIGHT = 24;

/** Badge margin from right edge */
export const BADGE_RIGHT_MARGIN = 20;

/** Compass band width (px) */
export const COMPASS_BAND_WIDTH = 400;

/** Compass band Y position */
export const COMPASS_BAND_Y = 40;

/** Compass band height */
export const COMPASS_BAND_HEIGHT = 28;

/** Compass visible range (degrees) */
export const COMPASS_VISIBLE_RANGE = 90;

/** Pitch ladder pixels per degree */
export const HORIZON_PX_PER_DEG = 8;

/** Horizon line half-width */
export const HORIZON_LINE_WIDTH = 200;

/** Pitch ladder visible range (px from center) */
export const HORIZON_VISIBLE_RANGE = 150;

/** Altimeter / speed indicator offset from center (px) */
export const INSTRUMENT_OFFSET_X = 250;

/** Altimeter / speed scale height (px) */
export const INSTRUMENT_SCALE_HEIGHT = 200;

/** Flight plan menu box width */
export const MENU_BOX_WIDTH = 400;

/** Flight plan menu line height */
export const MENU_LINE_HEIGHT = 28;

/** Benchmark recording dot size */
export const BENCH_DOT_SIZE = 8;

/** Benchmark badge color (red) */
export const BENCH_COLOR = '#ff3333';

/** Warmup / flight plan recording badge color (orange) */
export const WARN_COLOR = '#ffaa00';

/** Compass cardinal/intercardinal points */
export const COMPASS_POINTS = [
  { deg: 0, label: 'N' },
  { deg: 45, label: 'NE' },
  { deg: 90, label: 'E' },
  { deg: 135, label: 'SE' },
  { deg: 180, label: 'S' },
  { deg: 225, label: 'SW' },
  { deg: 270, label: 'W' },
  { deg: 315, label: 'NW' },
];

/** Dirty flag thresholds */
export const DIRTY_YAW_THRESHOLD = 0.001;
export const DIRTY_PITCH_THRESHOLD = 0.001;
export const DIRTY_ALT_THRESHOLD = 0.5;
export const DIRTY_SPEED_THRESHOLD = 0.5;

/** Speed smoothing factor */
export const SPEED_SMOOTH_RATE = 5;

/** Earth circumference for tile size calculations (meters) */
export const EARTH_CIRCUMFERENCE = 40075016.686;
