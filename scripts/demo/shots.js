// Shot list of the demo film, recorded by scripts/cinematic-record.js and cut
// by scripts/demo/edit.js on the bars of the music (131 BPM, 4 beats a bar).
// Each shot starts at bar `bar` of the timeline (bar 0 is the first drop) and
// lasts `bars` bars; it is recorded with a little more for the transitions.

import { sunPosition } from '../../js/atmosphere/sunPosition.js';

/** Length of a bar (s) and time of bar 0 in the music (s) */
export const BAR = 4 * 0.4580016;
export const BAR0 = 14.7;

/** Extra seconds recorded after each shot, for the transitions */
const HANDLE = 0.6;

const R = 6371000;
const RAD = Math.PI / 180;
/** Place `dist` metres from `p` along a compass bearing, with extra fields */
function offset(p, bearing, dist, extra = {}) {
  const lat = p.lat + (dist * Math.cos(bearing * RAD)) / R / RAD;
  const lon = p.lon + (dist * Math.sin(bearing * RAD)) / (R * Math.cos(p.lat * RAD)) / RAD;
  return { lat, lon, ...extra };
}
const at = (lat, lon, extra = {}) => ({ lat, lon, ...extra });
const agl = (h) => (p) => ({ ...p, agl: h });
const msl = (h) => (p) => ({ ...p, msl: h });
/** Points on a circle around a centre, from a bearing, sweeping `sweep` degrees (clockwise when positive) */
function circle(centre, radius, from, sweep, n, extra) {
  return Array.from({ length: n + 1 }, (_, i) => offset(centre, from + (sweep * i) / n, radius, extra));
}
/**
 * A straight pass in front of the sun's disc: the camera at `camera` looks at
 * the sun of that day and time, the path crosses its line of sight `distance`
 * metres away, square to it
 */
function sunCrossing(camera, env, distance) {
  const { elevation, azimuth } = sunPosition(camera.lat, env.dayOfYear, env.timeOfDay);
  const crossing = offset(camera, azimuth, distance * Math.cos(elevation * RAD), {
    msl: camera.msl + distance * Math.sin(elevation * RAD),
  });
  return [-3500, -1500, 0, 1500, 3500].map((d) => offset(crossing, azimuth + 90, d, { msl: crossing.msl }));
}

/** Shots followed by a long transition: they run on for longer */
const LONG_HANDLE = new Set([
  'i0-orbit-view',
  'i1-sunrise-pan',
  'a8-mer-de-glace-dive',
  'b1-stratosphere',
  'c12-canyon-pull-up',
  'd1-sunset-crossing',
  'd2-canyon-golden',
  'f12-summit-vertical',
  'g1-departure',
]);

function shot(bar, bars, def) {
  return { bar, bars, duration: bars * BAR + (LONG_HANDLE.has(def.name) ? 1.6 : HANDLE), ...def };
}

// ---------------------------------------------------------------------------
// Places and light
// ---------------------------------------------------------------------------

/** Terrain centres: the shots of one region share theirs, so the terrain is not rebuilt between them */
const CHAMONIX = [45.92, 6.87];
const YOSEMITE = [37.73, -119.62];
const GRAND_CANYON = [36.09, -112.1];
const EVEREST = [27.98, 86.87];

const MONT_BLANC = at(45.8326, 6.8652);
const AIGUILLE_DU_MIDI = at(45.8786, 6.8872);
const KALA_PATTHAR = at(27.9957, 86.8285);
const HOPI_POINT = at(36.0757, -112.1545);
const MATHER_POINT = at(36.0617, -112.1078);

/** Summer afternoon: the sun in the south-west lights the north faces of the massif */
const DAY = { dayOfYear: 200, timeOfDay: 14.8 };
const DAY_LOW = { ...DAY, hiResMode: true };
const SUNRISE = {
  dayOfYear: 200,
  timeOfDay: 5.25,
  showClouds: true,
  cloudAltitude: 1900,
  cloudCover: 0.6,
  lensFlare: true,
};
const SPACE = { dayOfYear: 200, timeOfDay: 9.2, showClouds: true, cloudAltitude: 2400, cloudCover: 0.3 };
const STRATOSPHERE = { dayOfYear: 200, timeOfDay: 9.5 };
const CLOUDS = { dayOfYear: 200, timeOfDay: 11.2, showClouds: true, cloudAltitude: 2600, cloudCover: 0.55 };
/** A closed cloud deck from 2 600 to about 4 000 m, to fly through */
const CLOUD_DECK = { dayOfYear: 200, timeOfDay: 11.2, showClouds: true, cloudAltitude: 2600, cloudCover: 0.8 };
const CLOUDS_LOW_SUN = {
  dayOfYear: 200,
  timeOfDay: 16.8,
  showClouds: true,
  cloudAltitude: 2600,
  cloudCover: 0.5,
  lensFlare: true,
};
const VALLEY_LIGHT = { dayOfYear: 200, timeOfDay: 16.6, hiResMode: true };
const CANYON_GOLD = { dayOfYear: 200, timeOfDay: 17.3, hiResMode: true, lensFlare: true };
const CANYON_SUNSET = { dayOfYear: 200, timeOfDay: 18.9, lensFlare: true };
const CANYON_GOLDEN = { dayOfYear: 200, timeOfDay: 18.3 };
/** Just after sunset above the clouds, the massif in the afterglow */
const AFTERGLOW = { dayOfYear: 200, timeOfDay: 19.75, showClouds: true, cloudAltitude: 2600, cloudCover: 0.45 };
/** Blue hour: the sun 6° below the horizon, the first stars */
const BLUE_HOUR = { dayOfYear: 200, timeOfDay: 20.3, showClouds: true, cloudAltitude: 2600, cloudCover: 0.4 };
const HIMALAYA = { dayOfYear: 300, timeOfDay: 15.3 };
const MORNING_CLOUDS = { dayOfYear: 200, timeOfDay: 7.2, showClouds: true, cloudAltitude: 2200, cloudCover: 0.55 };

// ---------------------------------------------------------------------------
// Flight paths
// ---------------------------------------------------------------------------

/** Chamonix valley, south-west to north-east, low level */
const VALLEY = [
  at(45.893, 6.795),
  at(45.906, 6.834),
  at(45.922, 6.866),
  at(45.945, 6.893),
  at(45.97, 6.912),
  at(45.99, 6.925),
].map(agl(60));
const VALLEY_SW = [...VALLEY].reverse();

/** Over the Brévent, down into the valley, up the Bossons glacier to the summit */
const CROSS = [
  at(45.962, 6.8, { msl: 2900 }),
  at(45.936, 6.835, { agl: 110 }),
  at(45.922, 6.85, { agl: 70 }),
  at(45.909, 6.856, { agl: 60 }),
  at(45.895, 6.852, { agl: 90 }),
  at(45.875, 6.856, { agl: 110 }),
  at(45.86, 6.862, { agl: 150 }),
  at(45.84, 6.866, { agl: 250 }),
  at(45.82, 6.87, { msl: 5200 }),
];
const CROSS_OPTIONS = { speed: 240, maxGradient: 0.75, smoothing: 200 };

/** Down the Bossons glacier from the summit */
const DESCENT = [
  at(45.815, 6.87, { msl: 5100 }),
  at(45.84, 6.866, { agl: 200 }),
  at(45.86, 6.862, { agl: 120 }),
  at(45.88, 6.856, { agl: 100 }),
  at(45.9, 6.852, { agl: 80 }),
  at(45.915, 6.858, { agl: 70 }),
  at(45.93, 6.875, { agl: 70 }),
];

/** Down the Mer de Glace from the Vallée Blanche, out over Chamonix */
const MER_DE_GLACE = [
  at(45.862, 6.935, { msl: 4100 }),
  at(45.885, 6.94, { agl: 150 }),
  at(45.905, 6.94, { agl: 100 }),
  at(45.925, 6.93, { agl: 90 }),
  at(45.942, 6.92, { agl: 100 }),
  at(45.957, 6.903, { agl: 180 }),
];

const VALLEE_BLANCHE_TURN = circle(at(45.868, 6.915), 2600, 250, 300, 10, { msl: 4500 });
const GEANT_TURN = circle(at(45.872, 6.955), 1300, 0, -330, 11, { msl: 4050 });

/** Climbing past the summit into the sky */
const SUMMIT_CLIMB = [
  at(45.79, 6.835, { msl: 4900 }),
  at(45.815, 6.858, { msl: 5050 }),
  at(45.833, 6.866, { msl: 5250 }),
  at(45.845, 6.872, { msl: 6200 }),
  at(45.855, 6.876, { msl: 7400 }),
];

/** Toward the sunrise, above the clouds, to the camera */
const SUNRISE_RUN = [
  at(45.86, 7.02, { msl: 4000 }),
  at(45.845, 6.9, { msl: 3900 }),
  at(45.838, 6.78, { msl: 3800 }),
  at(45.835, 6.7, { msl: 3800 }),
];
/** Climb out of the cloud sea into the rising sun */
const SUNRISE_CLIMB = [
  at(45.88, 6.64, { msl: 2600 }),
  at(45.882, 6.652, { msl: 3100 }),
  at(45.884, 6.664, { msl: 3600 }),
  at(45.886, 6.676, { msl: 4100 }),
  at(45.888, 6.688, { msl: 4600 }),
  at(45.89, 6.7, { msl: 5100 }),
];

/** Cruising in the stratosphere */
const STRATO_RUN = [at(45.7, 6.5, { msl: 17000 }), at(45.85, 6.85, { msl: 17000 }), at(46.0, 7.2, { msl: 17000 })];

/** Cruising past the summit above the clouds */
const SUMMIT_CRUISE = [
  at(45.8, 6.74, { msl: 4600 }),
  at(45.822, 6.83, { msl: 4600 }),
  at(45.845, 6.905, { msl: 4600 }),
  at(45.87, 6.99, { msl: 4600 }),
];
/** Climbing through the cloud deck at about 35° */
const CLOUD_PUNCH = [
  at(45.965, 6.73, { msl: 2500 }),
  at(45.96, 6.74, { msl: 3200 }),
  at(45.955, 6.75, { msl: 3900 }),
  at(45.95, 6.76, { msl: 4600 }),
  at(45.945, 6.77, { msl: 5300 }),
  at(45.94, 6.78, { msl: 6000 }),
];
/** West, into the afternoon sun, above the clouds */
const CLOUDS_WEST = [
  at(45.87, 7.02, { msl: 4250 }),
  at(45.865, 6.92, { msl: 4250 }),
  at(45.858, 6.8, { msl: 4250 }),
  at(45.85, 6.68, { msl: 4250 }),
];
/** Level above the cloud deck, then a dive into it at about 35° */
const CLOUD_DIVE = [
  at(45.86, 6.66, { msl: 4600 }),
  at(45.862, 6.69, { msl: 4600 }),
  at(45.864, 6.705, { msl: 4450 }),
  at(45.866, 6.715, { msl: 3900 }),
  at(45.868, 6.725, { msl: 3300 }),
  at(45.87, 6.735, { msl: 2700 }),
];
/** Climbing away above the morning clouds */
const DEPARTURE = [
  at(45.85, 6.72, { msl: 4200 }),
  at(45.86, 6.78, { msl: 4400 }),
  at(45.875, 6.86, { msl: 4900 }),
  at(45.89, 6.95, { msl: 5600 }),
  at(45.905, 7.05, { msl: 6400 }),
];

/** Yosemite Valley from the west, under El Capitan, up past Half Dome */
const YOSEMITE_RUN = [
  at(37.7165, -119.7, { agl: 150 }),
  at(37.72, -119.67, { agl: 100 }),
  at(37.725, -119.645, { agl: 90 }),
  at(37.729, -119.625, { agl: 90 }),
  at(37.736, -119.605, { agl: 90 }),
  at(37.741, -119.585, { agl: 90 }),
  at(37.744, -119.565, { agl: 120 }),
  at(37.749, -119.545, { msl: 2500 }),
  at(37.753, -119.53, { msl: 3300 }),
];
/** Down Yosemite Valley from the east, over the camera at Tunnel View */
const YOSEMITE_WEST = [
  at(37.742, -119.585, { agl: 110 }),
  at(37.736, -119.605, { agl: 90 }),
  at(37.729, -119.625, { agl: 90 }),
  at(37.725, -119.645, { agl: 80 }),
  at(37.72, -119.668, { agl: 70 }),
  at(37.7165, -119.69, { agl: 120 }),
  at(37.714, -119.71, { agl: 300 }),
];
const YOSEMITE_OPTIONS = { speed: 230, smoothing: 250, maxGradient: 0.6 };
const TUNNEL_VIEW = at(37.7156, -119.6772);

/** Down the Colorado in the Grand Canyon, east to west, below the rims */
const CANYON_RUN = [
  at(36.063, -112.01),
  at(36.078, -112.03),
  at(36.087, -112.05),
  at(36.096, -112.07),
  at(36.1, -112.1),
  at(36.098, -112.13),
  at(36.104, -112.15),
  at(36.1, -112.18),
  at(36.098, -112.21),
].map(msl(1350));
/** Low in the canyon, then up to the vertical past the rim */
const CANYON_PULL = [
  at(36.087, -112.05, { msl: 1300 }),
  at(36.096, -112.07, { msl: 1300 }),
  at(36.099, -112.09, { msl: 1350 }),
  at(36.1, -112.1, { msl: 1900 }),
  at(36.1005, -112.104, { msl: 2700 }),
  at(36.101, -112.108, { msl: 3500 }),
];
const CANYON_TURN = circle(at(36.095, -112.1), 1600, 90, 300, 10, { msl: 1700 });

/** High above the Alps toward the lowlands of Geneva, whose lights show far ahead */
const TOWARD_GENEVA = [
  at(45.98, 6.75, { msl: 6000 }),
  at(46.03, 6.62, { msl: 6000 }),
  at(46.08, 6.49, { msl: 6000 }),
  at(46.13, 6.36, { msl: 6000 }),
];

/** Past the summit of Everest from the south-west */
const EVEREST_PASS = [
  at(27.95, 86.86, { msl: 9300 }),
  at(27.97, 86.895, { msl: 9300 }),
  at(27.99, 86.93, { msl: 9350 }),
  at(28.01, 86.965, { msl: 9400 }),
];
/** Up the Khumbu glacier from Lobuche, toward the icefall and the Western Cwm */
const KHUMBU = [
  at(27.93, 86.805, { agl: 150 }),
  at(27.948, 86.81, { agl: 110 }),
  at(27.965, 86.818, { agl: 100 }),
  at(27.978, 86.828, { agl: 100 }),
  at(27.986, 86.845, { agl: 120 }),
  at(27.99, 86.862, { agl: 150 }),
  at(27.985, 86.885, { agl: 250 }),
  at(27.978, 86.905, { msl: 7600 }),
];

// Sunsets: a camera looking at the setting sun, the aircraft crossing its disc 3 km away
const CANYON_SUN_CAMERA = { ...HOPI_POINT, msl: 2250 };

// ---------------------------------------------------------------------------
// Shots
// ---------------------------------------------------------------------------

export default [
  // ===== Intro: from orbit down to the sunrise above the sea of clouds =====
  shot(-8, 3, {
    name: 'i0-orbit-view',
    origin: CHAMONIX,
    env: SPACE,
    camera: {
      type: 'path',
      points: [at(45.35, 6.3, { msl: 38000 }), at(45.5, 6.5, { msl: 34000 })],
      speed: 2800,
      maxGradient: 20,
      look: 'forward',
      pitch: [
        [0, -24],
        [6, -30],
      ],
      yaw: 0,
      roll: [
        [0, -4],
        [6, 0],
      ],
      fov: 50,
    },
  }),
  shot(-5, 2, {
    name: 'i1-sunrise-pan',
    origin: CHAMONIX,
    env: SUNRISE,
    camera: {
      type: 'path',
      points: [at(45.84, 6.735, { msl: 4250 }), at(45.836, 6.775, { msl: 4350 })],
      speed: 70,
      look: 'forward',
      pitch: [
        [0, -2],
        [4, 0],
      ],
      yaw: [
        [0, -12],
        [4, -5],
      ],
      fov: 45,
    },
  }),
  shot(-3, 3, {
    name: 'i2-sunrise-approach',
    origin: CHAMONIX,
    env: SUNRISE,
    aircraft: { path: SUNRISE_RUN, speed: 220, core: 0.85 },
    camera: {
      type: 'fixed',
      at: { pathTime: 35, side: -45, msl: 3960 },
      passAt: 5.7,
      zoom: 0.16,
      zoomMin: 1.5,
      zoomMax: 55,
      lag: 0.15,
    },
  }),

  // ===== Drop A: the Chamonix valley at low level =====
  shot(0, 2, {
    name: 'a1-valley-flyby',
    origin: CHAMONIX,
    env: DAY_LOW,
    aircraft: { path: VALLEY, speed: 250, reheat: 1 },
    camera: {
      type: 'fixed',
      at: { pathTime: 30, side: -150, agl: 2 },
      passAt: 1.4,
      zoom: 0.3,
      zoomMin: 6,
      zoomMax: 65,
      lag: 0.1,
      shake: 0.15,
    },
  }),
  shot(2, 2, {
    name: 'a2-valley-chase',
    origin: CHAMONIX,
    env: DAY_LOW,
    aircraft: { path: VALLEY, speed: 240, smoothing: 350, t0: 6 },
    camera: { type: 'chase', offset: [5, 2.5, 26], look: [0, 0, -30], fov: 55, lag: 0.15, shake: 0.12 },
  }),
  shot(4, 2, {
    name: 'a3-valley-front',
    origin: CHAMONIX,
    env: DAY_LOW,
    aircraft: { path: VALLEY, speed: 240, smoothing: 350, t0: 14 },
    camera: {
      type: 'chase',
      offset: [
        [0, [-6, 3, -45]],
        [4, [-14, 2, -34]],
      ],
      look: [0, 0, 0],
      fov: 50,
      lag: 0.05,
      bankFollow: 0.3,
      shake: 0.1,
    },
  }),
  shot(6, 2, {
    name: 'a4-brevent-dive',
    origin: CHAMONIX,
    env: DAY,
    aircraft: { path: CROSS, ...CROSS_OPTIONS, t0: 16.5 },
    camera: { type: 'chase', offset: [3, 6, 30], look: [0, -3, -80], fov: 60, lag: 0.25, bankFollow: 0.4, shake: 0.12 },
  }),
  shot(8, 2, {
    name: 'a5-bossons-climb',
    origin: CHAMONIX,
    env: DAY_LOW,
    aircraft: {
      path: CROSS,
      ...CROSS_OPTIONS,
      t0: 36,
      reheat: [
        [0, 0],
        [1.2, 1],
      ],
    },
    camera: { type: 'chase', offset: [-4, 4, 28], look: [0, 2, -40], fov: 58, lag: 0.2, bankFollow: 0.4, shake: 0.12 },
  }),
  shot(10, 2, {
    name: 'a6-bossons-orbit',
    origin: CHAMONIX,
    env: DAY_LOW,
    aircraft: { path: CROSS, ...CROSS_OPTIONS, t0: 42, reheat: 1 },
    camera: {
      type: 'orbit',
      radius: 28,
      azimuth: [
        [0, 100],
        [4.3, 40],
      ],
      elevation: [
        [0, -6],
        [4.3, 2],
      ],
      fov: 52,
    },
  }),
  shot(12, 2, {
    name: 'a7-midi-orbit',
    origin: CHAMONIX,
    env: DAY,
    aircraft: { path: VALLEE_BLANCHE_TURN, speed: 230, t0: 10 },
    camera: {
      type: 'orbit',
      radius: 32,
      azimuth: [
        [0, 200],
        [4.2, 290],
      ],
      elevation: [
        [0, 4],
        [4.2, 14],
      ],
      fov: 48,
    },
  }),
  shot(14, 2, {
    name: 'a8-mer-de-glace-dive',
    origin: CHAMONIX,
    env: DAY,
    aircraft: { path: MER_DE_GLACE, speed: 250, maxGradient: 0.6, t0: 4 },
    camera: {
      type: 'chase',
      offset: [0, 18, 26],
      look: [0, -4, -12],
      fov: 60,
      lag: 0.25,
      bankFollow: 0.2,
      shake: 0.08,
    },
  }),

  // ===== Break A: the stratosphere, the fjord =====
  shot(16, 4, {
    name: 'b1-stratosphere',
    origin: CHAMONIX,
    env: STRATOSPHERE,
    aircraft: { path: STRATO_RUN, speed: 450, t0: 30, reheat: 1 },
    camera: {
      type: 'orbit',
      radius: 32,
      azimuth: [
        [0, 75],
        [8, 125],
      ],
      elevation: [
        [0, 6],
        [8, -2],
      ],
      fov: 50,
    },
  }),
  shot(20, 4, {
    name: 'b2-tunnel-view',
    origin: YOSEMITE,
    env: VALLEY_LIGHT,
    aircraft: { path: YOSEMITE_RUN, ...YOSEMITE_OPTIONS, speed: 190, core: 0.85 },
    camera: {
      type: 'chase',
      offset: [
        [0, [4, 9, 46]],
        [8, [-6, 12, 52]],
      ],
      look: [0, -3, -150],
      fov: 55,
      lag: 0.4,
      bankFollow: 0.2,
    },
  }),

  // ===== Drop B: through the clouds to the fjords and the canyons =====
  shot(24, 2, {
    name: 'c1-cloud-punch',
    origin: CHAMONIX,
    env: CLOUD_DECK,
    aircraft: { path: CLOUD_PUNCH, speed: 250, reheat: 1, maxGradient: 1.2, smoothing: 150, t0: 4.5 },
    camera: {
      type: 'chase',
      offset: [-2, -3, 26],
      look: [0, 4, -60],
      fov: 60,
      lag: 0.15,
      bankFollow: 0.3,
      shake: 0.15,
    },
  }),
  shot(26, 2, {
    name: 'c2-clouds-into-sun',
    origin: CHAMONIX,
    env: CLOUDS_LOW_SUN,
    aircraft: { path: CLOUDS_WEST, speed: 240, t0: 6 },
    camera: { type: 'chase', offset: [3, 1, 22], look: [0, 1, -60], fov: 55, lag: 0.15, shake: 0.1 },
  }),
  shot(28, 2, {
    name: 'c3-aileron-roll',
    origin: CHAMONIX,
    env: CLOUDS_LOW_SUN,
    aircraft: {
      path: CLOUDS_WEST,
      speed: 240,
      t0: 14,
      roll: [
        [0.7, 0],
        [2.3, 360],
      ],
    },
    camera: { type: 'chase', offset: [-15, 1.5, 7], look: [0, 0, -6], fov: 50, lag: 0.1, bankFollow: 0, shake: 0.1 },
  }),
  shot(30, 2, {
    name: 'c4-cloud-dive',
    origin: CHAMONIX,
    env: CLOUD_DECK,
    aircraft: { path: CLOUD_DIVE, speed: 250, maxGradient: 1.2, smoothing: 150, t0: 14 },
    camera: { type: 'chase', offset: [0, 7, 26], look: [0, -3, -40], fov: 58, lag: 0.2, bankFollow: 0.3, shake: 0.12 },
  }),
  shot(32, 2, {
    name: 'c5-yosemite-chase',
    origin: YOSEMITE,
    env: VALLEY_LIGHT,
    aircraft: { path: YOSEMITE_RUN, ...YOSEMITE_OPTIONS, t0: 9 },
    camera: { type: 'chase', offset: [5, 2, 24], look: [0, 0, -30], fov: 58, lag: 0.15, shake: 0.12 },
  }),
  shot(34, 2, {
    name: 'c6-half-dome',
    origin: YOSEMITE,
    env: VALLEY_LIGHT,
    aircraft: {
      path: YOSEMITE_RUN,
      ...YOSEMITE_OPTIONS,
      t0: 22,
      reheat: [
        [0, 0],
        [1.5, 1],
      ],
    },
    camera: {
      type: 'chase',
      offset: [
        [0, [-38, 4, 18]],
        [4.3, [-26, 2, -18]],
      ],
      look: [0, 0, 0],
      fov: 45,
      lag: 0.08,
      bankFollow: 0.2,
      shake: 0.1,
    },
  }),
  shot(36, 2, {
    name: 'c7-canyon-tracking',
    origin: GRAND_CANYON,
    env: CANYON_GOLD,
    aircraft: { path: CANYON_RUN, speed: 240, smoothing: 300, t0: 44 },
    camera: {
      type: 'chase',
      offset: [
        [0, [-110, 10, 50]],
        [4.3, [-110, 10, -50]],
      ],
      look: [0, 0, 0],
      fov: 30,
      lag: 0,
      bankFollow: 0,
      shake: 0.08,
    },
  }),
  shot(38, 2, {
    name: 'c8-canyon-chase',
    origin: GRAND_CANYON,
    env: CANYON_GOLD,
    aircraft: { path: CANYON_RUN, speed: 240, smoothing: 300, t0: 10 },
    camera: { type: 'chase', offset: [6, 3, 28], look: [0, 1, -50], fov: 58, lag: 0.15, shake: 0.1 },
  }),
  shot(40, 2, {
    name: 'c9-canyon-front',
    origin: GRAND_CANYON,
    env: CANYON_GOLD,
    aircraft: { path: CANYON_RUN, speed: 240, smoothing: 300, t0: 22, reheat: 1 },
    camera: {
      type: 'chase',
      offset: [
        [0, [-6, 3, -45]],
        [4.3, [-14, 2, -32]],
      ],
      look: [0, 0, 0],
      fov: 52,
      lag: 0.05,
      bankFollow: 0.3,
      shake: 0.1,
    },
  }),
  shot(42, 2, {
    name: 'c10-canyon-plunge',
    origin: GRAND_CANYON,
    env: CANYON_GOLD,
    aircraft: { path: CANYON_RUN, speed: 240, smoothing: 300, t0: 34, reheat: 1 },
    camera: {
      type: 'chase',
      offset: [0, 20, 28],
      look: [0, -4, -14],
      fov: 60,
      lag: 0.25,
      bankFollow: 0.2,
      shake: 0.08,
    },
  }),
  shot(44, 2, {
    name: 'c11-canyon-orbit',
    origin: GRAND_CANYON,
    env: CANYON_GOLD,
    aircraft: { path: CANYON_TURN, speed: 220, t0: 6 },
    camera: {
      type: 'orbit',
      radius: 30,
      azimuth: [
        [0, 230],
        [4.3, 150],
      ],
      elevation: [
        [0, 10],
        [4.3, 2],
      ],
      fov: 50,
    },
  }),
  shot(46, 2, {
    name: 'c12-canyon-pull-up',
    origin: GRAND_CANYON,
    env: CANYON_GOLD,
    aircraft: { path: CANYON_PULL, speed: 240, maxGradient: 3, smoothing: 120, reheat: 1, t0: 5 },
    camera: { type: 'chase', offset: [-3, -4, 30], look: [0, 3, -40], fov: 62, lag: 0.25, bankFollow: 0.3, shake: 0.1 },
  }),

  // ===== Break B: sunset over the Grand Canyon =====
  shot(48, 4, {
    name: 'd1-sunset-crossing',
    origin: GRAND_CANYON,
    env: CANYON_SUNSET,
    aircraft: { path: sunCrossing(CANYON_SUN_CAMERA, CANYON_SUNSET, 800), speed: 200, core: 0.85 },
    camera: { type: 'fixed', at: CANYON_SUN_CAMERA, passAt: 4.4, fov: 9, lag: 0.25 },
  }),
  shot(52, 4, {
    name: 'd2-canyon-golden',
    origin: GRAND_CANYON,
    env: CANYON_GOLDEN,
    aircraft: { path: CANYON_TURN.map((p) => ({ ...p, msl: 2700 })), speed: 200, core: 0.8, t0: 10 },
    camera: {
      type: 'orbit',
      radius: 30,
      azimuth: [
        [0, 140],
        [8, 205],
      ],
      elevation: [
        [0, 3],
        [8, 9],
      ],
      fov: 42,
    },
  }),

  // ===== Build: afterglow and blue hour above the clouds =====
  shot(56, 2, {
    name: 'e1-afterglow-orbit',
    origin: CHAMONIX,
    env: AFTERGLOW,
    aircraft: { path: SUMMIT_CRUISE, speed: 210, core: 0.85, t0: 10 },
    camera: {
      type: 'orbit',
      radius: 30,
      azimuth: [
        [0, 150],
        [4.3, 185],
      ],
      elevation: [
        [0, 3],
        [4.3, 6],
      ],
      fov: 45,
    },
  }),
  shot(58, 2, {
    name: 'e2-lights-afar',
    origin: CHAMONIX,
    env: BLUE_HOUR,
    aircraft: { path: TOWARD_GENEVA, speed: 230, reheat: 1, t0: 10 },
    camera: { type: 'chase', offset: [4, 4, 28], look: [0, -4, -90], fov: 55, lag: 0.15, shake: 0.08 },
  }),
  shot(60, 2, {
    name: 'e3-afterburner',
    origin: CHAMONIX,
    env: BLUE_HOUR,
    aircraft: { path: CLOUDS_WEST, speed: 230, reheat: 1, t0: 8 },
    camera: { type: 'chase', offset: [1.5, -2.2, 15], look: [0, 0.5, -30], fov: 52, lag: 0.1, shake: 0.12 },
  }),
  shot(62, 1, {
    name: 'e4-strobe-side',
    origin: CHAMONIX,
    env: BLUE_HOUR,
    aircraft: { path: CLOUDS_WEST, speed: 230, reheat: 1, t0: 16 },
    camera: {
      type: 'chase',
      offset: [
        [0, [-16, 3, 8]],
        [2.4, [-14, 3, -2]],
      ],
      look: [0, -1, 0],
      fov: 50,
      lag: 0.05,
      bankFollow: 0.5,
      shake: 0.12,
    },
  }),
  shot(63, 1, {
    name: 'e5-strobe-front',
    origin: CHAMONIX,
    env: BLUE_HOUR,
    aircraft: { path: CLOUDS_WEST, speed: 230, reheat: 1, t0: 22 },
    camera: {
      type: 'chase',
      offset: [
        [0, [-3, 1, -30]],
        [2.4, [-2, 0.5, -18]],
      ],
      look: [0, 0, 0],
      fov: 50,
      lag: 0.05,
      shake: 0.12,
    },
  }),

  // ===== Drop C: sunrise, the Himalaya, back to the summit of Mont Blanc =====
  shot(64, 2, {
    name: 'f1-sunrise-climb',
    origin: CHAMONIX,
    env: SUNRISE,
    aircraft: { path: SUNRISE_CLIMB, speed: 250, maxGradient: 1.2, smoothing: 150, reheat: 1, t0: 4.2 },
    camera: { type: 'chase', offset: [-3, 3, 26], look: [0, 3, -60], fov: 58, lag: 0.25, bankFollow: 0.3, shake: 0.12 },
  }),
  shot(66, 2, {
    name: 'f2-everest-pass',
    origin: EVEREST,
    env: HIMALAYA,
    aircraft: { path: EVEREST_PASS, speed: 240, t0: 8 },
    camera: {
      type: 'orbit',
      radius: 34,
      azimuth: [
        [0, 110],
        [4.3, 160],
      ],
      elevation: [
        [0, 8],
        [4.3, 3],
      ],
      fov: 50,
    },
  }),
  shot(68, 2, {
    name: 'f3-everest-summit',
    origin: EVEREST,
    env: HIMALAYA,
    aircraft: { path: EVEREST_PASS.map((p) => ({ ...p, msl: 9050 })), speed: 240, reheat: 1, t0: 4 },
    camera: { type: 'chase', offset: [6, 3, 30], look: [0, -12, -220], fov: 58, lag: 0.2, bankFollow: 0.3, shake: 0.1 },
  }),
  shot(70, 2, {
    name: 'f4-khumbu-chase',
    origin: EVEREST,
    env: HIMALAYA,
    aircraft: {
      path: KHUMBU,
      speed: 230,
      maxGradient: 0.6,
      t0: 18,
      reheat: [
        [0, 0],
        [2, 1],
      ],
    },
    camera: { type: 'chase', offset: [5, 3, 26], look: [0, 2, -50], fov: 58, lag: 0.2, bankFollow: 0.4, shake: 0.12 },
  }),
  shot(72, 2, {
    name: 'f5-bossons-descent',
    origin: CHAMONIX,
    env: DAY_LOW,
    aircraft: { path: DESCENT, speed: 250, maxGradient: 0.8, t0: 10 },
    camera: { type: 'chase', offset: [4, 4, 28], look: [0, -8, -80], fov: 58, lag: 0.2, bankFollow: 0.4, shake: 0.12 },
  }),
  shot(74, 2, {
    name: 'f6-valley-tracking',
    origin: CHAMONIX,
    env: DAY_LOW,
    aircraft: { path: VALLEY, speed: 250, smoothing: 350, t0: 22 },
    camera: {
      type: 'chase',
      offset: [
        [0, [-90, 4, 45]],
        [4.3, [-90, 4, -45]],
      ],
      look: [0, 0, 0],
      fov: 28,
      lag: 0,
      bankFollow: 0,
      shake: 0.08,
    },
  }),
  shot(76, 2, {
    name: 'f7-geant-knife-edge',
    origin: CHAMONIX,
    env: DAY,
    aircraft: { path: GEANT_TURN, speed: 230, t0: 6 },
    camera: {
      type: 'orbit',
      radius: 26,
      azimuth: [
        [0, 300],
        [4.3, 420],
      ],
      elevation: [
        [0, -4],
        [4.3, 8],
      ],
      fov: 52,
    },
  }),
  shot(78, 2, {
    name: 'f8-mer-de-glace-low',
    origin: CHAMONIX,
    env: DAY,
    aircraft: { path: MER_DE_GLACE, speed: 250, maxGradient: 0.6, t0: 14, reheat: 1 },
    camera: {
      type: 'chase',
      offset: [-9, -1, 18],
      look: [0, 0, -30],
      fov: 56,
      lag: 0.12,
      bankFollow: 0.5,
      shake: 0.12,
    },
  }),
  shot(80, 2, {
    name: 'f9-roll-front',
    origin: CHAMONIX,
    env: DAY_LOW,
    aircraft: {
      path: VALLEY_SW,
      speed: 240,
      smoothing: 350,
      t0: 8,
      roll: [
        [0.6, 0],
        [2.0, -360],
      ],
    },
    camera: { type: 'chase', offset: [-4, 2, -38], look: [0, 0, 0], fov: 50, lag: 0.05, bankFollow: 0, shake: 0.1 },
  }),
  shot(82, 2, {
    name: 'f10-heat-haze',
    origin: CHAMONIX,
    env: DAY_LOW,
    aircraft: { path: VALLEY, speed: 230, reheat: 1 },
    camera: {
      type: 'fixed',
      at: { pathTime: 34, side: 18, agl: 2 },
      passAt: 0.35,
      zoom: 0.12,
      zoomMin: 2.5,
      zoomMax: 70,
      lag: 0.05,
    },
  }),
  shot(84, 2, {
    name: 'f11-summit-approach',
    origin: CHAMONIX,
    env: DAY,
    aircraft: {
      path: SUMMIT_CLIMB,
      speed: 240,
      maxGradient: 1.5,
      t0: 9,
      reheat: [
        [0, 0],
        [2.5, 1],
      ],
    },
    camera: { type: 'chase', offset: [5, 3, 28], look: [0, -2, -90], fov: 58, lag: 0.2, bankFollow: 0.4, shake: 0.1 },
  }),
  shot(86, 2, {
    name: 'f12-summit-vertical',
    origin: CHAMONIX,
    env: DAY,
    aircraft: { path: SUMMIT_CLIMB, speed: 240, maxGradient: 1.5, reheat: 1, t0: 17 },
    camera: { type: 'chase', offset: [-3, -4, 30], look: [0, 3, -40], fov: 62, lag: 0.25, bankFollow: 0.3, shake: 0.1 },
  }),

  // ===== Outro: departure, back to orbit =====
  shot(88, 4, {
    name: 'g1-departure',
    origin: CHAMONIX,
    env: MORNING_CLOUDS,
    aircraft: { path: DEPARTURE, speed: 230, core: 0.9, t0: 6 },
    camera: {
      type: 'chase',
      offset: [
        [0, [4, 3, 30]],
        [8, [10, 14, 230]],
      ],
      look: [0, 2, -40],
      fov: 42,
      lag: 0.3,
      bankFollow: 0.2,
    },
  }),
  shot(92, 6, {
    name: 'g2-back-to-orbit',
    origin: CHAMONIX,
    env: SPACE,
    camera: {
      type: 'path',
      points: [at(45.72, 6.7, { msl: 9000 }), at(45.6, 6.55, { msl: 20000 }), at(45.45, 6.38, { msl: 38000 })],
      speed: 3000,
      maxGradient: 20,
      look: { ...MONT_BLANC, msl: 4000 },
      fov: 45,
    },
  }),
];
