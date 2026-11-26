import * as THREE from 'three';
import {
  Fn,
  If,
  Loop,
  abs,
  clamp,
  dot,
  float,
  dFdx,
  dFdy,
  floor,
  fract,
  int,
  length,
  max,
  min,
  mix,
  mod,
  positionWorld,
  renderGroup,
  select,
  smoothstep,
  uniform,
  uniformArray,
  vec2,
  vec3,
  vec4,
} from 'three/tsl';

/** Runways drawn at once: the nearest to the camera */
const MAX_RUNWAYS = 8;

/** Farthest runway drawn from the camera (m) */
const DRAW_DISTANCE = 30000;

/** Camera move after which the runways drawn are chosen again (m) */
const RESELECT_DISTANCE = 1000;

/** Width given to runways whose width is not published (m) */
const DEFAULT_WIDTH = 30;

/**
 * Albedo of the pavements and of the paint; the imagery keeps a share of the
 * pavement's colour for its wear and stains
 */
const ASPHALT = new THREE.Color(0.075, 0.075, 0.08);
const CONCRETE = new THREE.Color(0.3, 0.29, 0.27);
const PAINT = new THREE.Color(0.72, 0.72, 0.7);
const IMAGERY_SHARE = 0.25;

/**
 * Metres per pixel across a runway over which its paint fades out with
 * distance: finer than a pixel it would shimmer
 */
const PAINT_FADE_FROM = 1.5;
const PAINT_FADE_TO = 5;

/** Surfaces drawn as pavements, with their markings: OurAirports codes, upper case, by prefix */
const ASPHALT_CODES = ['ASP', 'BIT', 'TAR', 'MAC', 'BLA'];
const CONCRETE_CODES = ['CON', 'PEM', 'COP', 'CEM'];

/**
 * Glyphs of the runway designations: segments of a seven-segment digit and a
 * diagonal for R (bit k: segment k of SEGMENTS)
 */
const GLYPHS = {
  0: 63,
  1: 6,
  2: 91,
  3: 79,
  4: 102,
  5: 109,
  6: 125,
  7: 7,
  8: 127,
  9: 111,
  L: 56,
  C: 57,
  R: 243,
};
const LETTERS = ['', 'L', 'C', 'R'];

/**
 * A glyph is 3 m across and 9 m along the runway (its top farther from the
 * threshold), drawn with strokes 0.9 m wide (ICAO Annex 14, figure 5-3)
 */
const GLYPH_WIDTH = 3;
const GLYPH_LENGTH = 9;
const STROKE = 0.9;
const r = STROKE / 2;
const SEGMENTS = [
  [r, GLYPH_LENGTH - r, GLYPH_WIDTH - r, GLYPH_LENGTH - r], // a: top
  [GLYPH_WIDTH - r, GLYPH_LENGTH - r, GLYPH_WIDTH - r, GLYPH_LENGTH / 2], // b: top right
  [GLYPH_WIDTH - r, GLYPH_LENGTH / 2, GLYPH_WIDTH - r, r], // c: bottom right
  [r, r, GLYPH_WIDTH - r, r], // d: bottom
  [r, r, r, GLYPH_LENGTH / 2], // e: bottom left
  [r, GLYPH_LENGTH / 2, r, GLYPH_LENGTH - r], // f: top left
  [r, GLYPH_LENGTH / 2, GLYPH_WIDTH - r, GLYPH_LENGTH / 2], // g: middle
  [GLYPH_WIDTH * 0.45, GLYPH_LENGTH / 2, GLYPH_WIDTH - r, r], // diagonal of R
];

/**
 * Markings along a runway from a threshold (ICAO Annex 14), in metres: the
 * threshold stripes, then 12 m on the designation (number, then letter), the
 * aiming point and the touchdown zone pairs at 150 m intervals, the centre
 * line in 30 m dashes with 20 m gaps between the two designations
 */
const STRIPES_FROM = 6;
const STRIPES_LENGTH = 30;
const NUMBER_FROM = STRIPES_FROM + STRIPES_LENGTH + 12;
const LETTER_FROM = NUMBER_FROM + GLYPH_LENGTH + 6;
const CENTRE_LINE_FROM = LETTER_FROM + GLYPH_LENGTH + 12;
const DASH = 30;
const DASH_PERIOD = 50;
const TOUCHDOWN_BAR_LENGTH = 22.5;
const TOUCHDOWN_BAR_WIDTH = 3;
const TOUCHDOWN_BAR_GAP = 1.5;

/** Added to a designation code whose number is written with a leading zero ("04", as ICAO does) */
const LEADING_ZERO = 200;

/**
 * Designation of a runway end: its number (1 to 36) and side letter, packed
 * as number × 4 + letter, plus LEADING_ZERO when written "04"; 0 when none
 */
export function designationCode(ident) {
  const match = /^(\d{1,2})([LCR])?$/i.exec(String(ident ?? '').trim());
  if (!match) return 0;
  const number = Number(match[1]);
  if (number < 1 || number > 36) return 0;
  const lead = match[1].length === 2 && number < 10 ? LEADING_ZERO : 0;
  return lead + number * 4 + (match[2] ? LETTERS.indexOf(match[2].toUpperCase()) : 0);
}

/** Pavement of a surface code: 0 asphalt, 1 concrete, null for unpaved runways */
export function pavementOf(surface) {
  const code = String(surface ?? '').toUpperCase();
  if (CONCRETE_CODES.some((c) => code.startsWith(c))) return 1;
  if (ASPHALT_CODES.some((c) => code.startsWith(c))) return 0;
  return null;
}

/**
 * Runways painted on the ground: the paved runways nearest to the camera are
 * drawn into the colour of the terrain, before its lighting, so that they
 * take its shadows, its curvature and its aerial perspective. Each is given
 * to the shader as three vec4 (world metres, see update), and every terrain
 * fragment tests them; only the fragments on a runway compute its markings.
 */
export default class RunwayMarkings {
  constructor() {
    this._slots = Array.from({ length: MAX_RUNWAYS * 3 }, () => new THREE.Vector4());
    this._data = uniformArray(this._slots, 'vec4').setGroup(renderGroup);
    this._count = uniform(0, 'int').setGroup(renderGroup);
    this._glyphs = uniformArray(
      Array.from({ length: 13 }, (_, k) => (k < 10 ? GLYPHS[k] : GLYPHS[LETTERS[k - 9]])),
      'float',
    ).setGroup(renderGroup);
    this._nodes = new Map();
    this._runways = null;
    this._origin = null;
    this._world = [];
    this._from = new THREE.Vector3(Infinity, 0, 0);
  }

  /**
   * The terrain colour with the runways painted over it: one node per colour
   * node, shared by every tile material, so that they keep one compiled shader
   * @param {Node} imagery - the terrain's colour (vec4)
   */
  paint(imagery) {
    let node = this._nodes.get(imagery);
    if (!node) {
      node = this._build(imagery);
      this._nodes.set(imagery, node);
    }
    return node;
  }

  /**
   * Chooses the runways drawn: the paved ones nearest to the camera
   * @param {object[]} runways - see airports/Airports.js
   * @param {import('./GeoTerrainManager.js').default} terrain - world positions of the runway ends
   * @param {THREE.Vector3} camera - camera position
   */
  update(runways, terrain, camera) {
    const origin = terrain.tileMap;
    if (!origin) return;
    if (runways !== this._runways || origin !== this._origin) {
      this._runways = runways;
      this._origin = origin;
      this._world = runways.flatMap((runway) => this._place(runway, terrain) ?? []);
      this._from.set(Infinity, 0, 0);
    }
    if (this._from.distanceToSquared(camera) < RESELECT_DISTANCE ** 2) return;
    this._from.copy(camera);

    const near = this._world
      .map((runway) => ({ runway, distance: runway.distanceTo(camera.x, camera.z) }))
      .filter(({ distance }) => distance < DRAW_DISTANCE)
      .sort((a, b) => a.distance - b.distance)
      .slice(0, MAX_RUNWAYS);
    near.forEach(({ runway }, i) => {
      this._slots[i * 3].copy(runway.data[0]);
      this._slots[i * 3 + 1].copy(runway.data[1]);
      this._slots[i * 3 + 2].copy(runway.data[2]);
    });
    this._count.value = near.length;
  }

  /** A runway in world metres, null when unpaved or outside the map */
  _place(runway, terrain) {
    const pavement = pavementOf(runway.surface);
    if (pavement === null) return null;
    const [a, b] = runway.ends;
    const p0 = terrain.geoToWorld(a.lat, a.lon, 0);
    const p1 = terrain.geoToWorld(b.lat, b.lon, 0);
    if (!p0 || !p1) return null;
    const dx = p1.x - p0.x;
    const dz = p1.z - p0.z;
    const worldLength = Math.hypot(dx, dz);
    if (!(worldLength > 1)) return null;
    // World metres per true metre: the map is exact at its centre's latitude only
    const k = worldLength / Math.max(1, runway.length || worldLength);
    const width = runway.width > 0 ? runway.width : DEFAULT_WIDTH;
    const data = [
      new THREE.Vector4(p0.x, p0.z, dx / worldLength, dz / worldLength),
      new THREE.Vector4(worldLength / k, width / 2, k, pavement),
      new THREE.Vector4(designationCode(a.ident), designationCode(b.ident), a.displaced, b.displaced),
    ];
    return {
      data,
      /** Distance from a world position to the runway's segment (world metres) */
      distanceTo(x, z) {
        const t = Math.max(0, Math.min(1, ((x - p0.x) * dx + (z - p0.z) * dz) / (worldLength * worldLength)));
        return Math.hypot(x - p0.x - t * dx, z - p0.z - t * dz);
      },
    };
  }

  _build(imagery) {
    const data = this._data;
    const count = this._count;
    const glyphs = this._glyphs;
    const asphalt = vec3(ASPHALT.r, ASPHALT.g, ASPHALT.b);
    const concrete = vec3(CONCRETE.r, CONCRETE.g, CONCRETE.b);
    const paintColour = vec3(PAINT.r, PAINT.g, PAINT.b);

    // Coverage of a shape by its signed distance (m, negative inside), over a pixel of `pixel` metres
    const cover = (distance, pixel) => clamp(float(0.5).sub(distance.div(pixel)), 0, 1);
    // Signed distance to an axis-aligned box from its centre and half size
    const box = (p, centre, half) => {
      const q = abs(p.sub(centre)).sub(half);
      return length(max(q, 0)).add(min(max(q.x, q.y), 0));
    };
    // Distance to a segment
    const segment = (p, a, b) => {
      const pa = p.sub(a);
      const ba = b.sub(a);
      const h = clamp(dot(pa, ba).div(dot(ba, ba)), 0, 1);
      return length(pa.sub(ba.mul(h)));
    };
    // Coverage of a glyph (index into GLYPHS) whose box starts at (x0, y0): x across, y along
    const glyph = (p, index, x0, y0, pixel) => {
      const local = p.sub(vec2(x0, y0)).toVar();
      const mask = glyphs.element(index).toVar();
      const distance = float(1e6).toVar();
      SEGMENTS.forEach(([ax, ay, bx, by], k) => {
        const on = mod(floor(mask.div(2 ** k)), 2);
        If(on.greaterThan(0.5), () => {
          distance.assign(min(distance, segment(local, vec2(ax, ay), vec2(bx, by))));
        });
      });
      return cover(distance.sub(STROKE / 2), pixel);
    };

    /**
     * Paint from one threshold: `u` along the runway from it (m), `v` across
     * (m, to the right seen from the approach), runway half width and length,
     * designation code
     */
    const fromThreshold = (u, v, halfWidth, runwayLength, code, pixel) => {
      const paint = float(0).toVar();
      const p = vec2(v, u);
      const width = halfWidth.mul(2);

      // Threshold stripes: 4 to 16 by width, within 3 m of the edges (27 m of the centre line at most)
      If(u.lessThan(STRIPES_FROM + STRIPES_LENGTH).and(width.greaterThanEqual(18)), () => {
        const perSide = select(
          width.lessThan(23),
          float(2),
          select(
            width.lessThan(30),
            float(3),
            select(width.lessThan(45), float(4), select(width.lessThan(60), float(6), float(8))),
          ),
        );
        const outer = min(halfWidth.sub(3), float(27));
        const inner = float(STROKE * 2);
        const stripe = outer.sub(inner).div(perSide.mul(2).sub(1));
        const across = outer.sub(abs(v));
        const k = floor(across.div(stripe));
        const onStripe = mod(k, 2)
          .lessThan(0.5)
          .and(across.greaterThan(0))
          .and(k.lessThan(perSide.mul(2)));
        const along = box(vec2(0, u), vec2(0, STRIPES_FROM + STRIPES_LENGTH / 2), vec2(1, STRIPES_LENGTH / 2));
        // Edges of the stripes softened over a pixel
        const edge = min(fract(across.div(stripe)).mul(stripe), stripe.sub(fract(across.div(stripe)).mul(stripe)));
        paint.assign(select(onStripe, cover(along, pixel).mul(clamp(edge.div(pixel).add(0.5), 0, 1)), float(0)));
      });

      // Designation: number, then letter
      If(
        code
          .greaterThan(0.5)
          .and(u.greaterThan(NUMBER_FROM - 1))
          .and(u.lessThan(LETTER_FROM + GLYPH_LENGTH + 1)),
        () => {
          const lead = code.greaterThanEqual(LEADING_ZERO);
          const designation = select(lead, code.sub(LEADING_ZERO), code);
          const number = floor(designation.div(4));
          const letter = designation.sub(number.mul(4));
          const tens = floor(number.div(10));
          const units = number.sub(tens.mul(10));
          const gap = float(1.5);
          // Two digits side by side about the centre line (one when below 10 without a leading zero)
          const twoDigits = tens.greaterThan(0.5).or(lead);
          const left = select(twoDigits, gap.div(-2).sub(GLYPH_WIDTH), float(-GLYPH_WIDTH / 2));
          const right = select(twoDigits, gap.div(2), float(-GLYPH_WIDTH / 2));
          const digits = max(
            select(twoDigits, glyph(p, int(tens), left, float(NUMBER_FROM), pixel), float(0)),
            glyph(p, int(units), right, float(NUMBER_FROM), pixel),
          );
          const side = select(
            letter.greaterThan(0.5),
            glyph(p, int(letter.add(9)), float(-GLYPH_WIDTH / 2), float(LETTER_FROM), pixel),
            float(0),
          );
          paint.assign(max(paint, max(digits, side)));
        },
      );

      // Aiming point and touchdown zone, on runways of 1 200 m and more
      If(runwayLength.greaterThanEqual(1200).and(u.lessThan(1000)), () => {
        const long = runwayLength.greaterThanEqual(2400);
        const aimFrom = select(long, float(400), float(300));
        const aimLength = select(long, float(60), float(45));
        const aimWidth = select(long, float(10), float(6));
        const innerEdge = min(float(9), halfWidth.mul(0.4));
        const aim = box(
          vec2(abs(v), u),
          vec2(innerEdge.add(aimWidth.div(2)), aimFrom.add(aimLength.div(2))),
          vec2(aimWidth.div(2), aimLength.div(2)),
        );
        paint.assign(max(paint, cover(aim, pixel)));

        // Pairs of 3, 3, 2, 2, 1, 1 bars every 150 m, as many as the length allows, none on the aiming point
        const pairs = select(runwayLength.lessThan(1500), float(3), select(long, float(6), float(4)));
        const k = floor(u.div(150));
        const from = k.mul(150);
        const bars = select(k.lessThan(2.5), float(3), select(k.lessThan(4.5), float(2), float(1)));
        const clearOfAim = from
          .add(TOUCHDOWN_BAR_LENGTH)
          .lessThan(aimFrom)
          .or(from.greaterThan(aimFrom.add(aimLength)));
        If(
          k
            .greaterThan(0.5)
            .and(k.lessThan(pairs.add(0.5)))
            .and(clearOfAim),
          () => {
            const across = abs(v).sub(innerEdge);
            const period = TOUCHDOWN_BAR_WIDTH + TOUCHDOWN_BAR_GAP;
            const bar = floor(across.div(period));
            const inBar = mod(across, period);
            const lateral = max(inBar.sub(TOUCHDOWN_BAR_WIDTH), float(0).sub(across));
            const along = box(
              vec2(0, u),
              vec2(0, from.add(TOUCHDOWN_BAR_LENGTH / 2)),
              vec2(1, TOUCHDOWN_BAR_LENGTH / 2),
            );
            const onBar = bar.lessThan(bars).and(across.greaterThanEqual(0));
            paint.assign(max(paint, select(onBar, cover(max(along, lateral), pixel), float(0))));
          },
        );
      });
      return paint;
    };

    return Fn(() => {
      const base = imagery.toVar();
      const colour = base.rgb.toVar();
      const world = positionWorld.xz;
      // Steps of the world position between neighbouring pixels, taken where
      // every fragment follows the same path
      const stepX = dFdx(world).toVar();
      const stepY = dFdy(world).toVar();

      Loop(count, ({ i }) => {
        const d0 = data.element(i.mul(3));
        const d1 = data.element(i.mul(3).add(1));
        const d2 = data.element(i.mul(3).add(2));
        const k = d1.z;
        const rel = world.sub(d0.xy);
        const s = dot(rel, d0.zw).div(k);
        // To the right of the direction from end 0 to end 1
        const across = vec2(d0.w.negate(), d0.z);
        const t = dot(rel, across).div(k);
        const runwayLength = d1.x;
        const halfWidth = d1.y;
        // Pixel footprint across the runway, in metres: the markings are
        // narrow across it, long along it, where grazing views stretch the pixels
        const metres = max(
          abs(dot(stepX, across))
            .add(abs(dot(stepY, across)))
            .div(k),
          float(0.02),
        );
        const fade = float(1).sub(smoothstep(PAINT_FADE_FROM, PAINT_FADE_TO, metres));
        const outside = box(vec2(t, s), vec2(0, runwayLength.div(2)), vec2(halfWidth, runwayLength.div(2)));
        If(outside.lessThan(metres), () => {
          const pavement = cover(outside, metres);
          const surface = mix(asphalt, concrete, d1.w);
          const paved = mix(surface, colour, IMAGERY_SHARE);
          // Half the runway from each threshold, the far half seen upside down
          const fromEnd0 = s.lessThan(runwayLength.div(2));
          const u = select(fromEnd0, s.sub(d2.z), runwayLength.sub(s).sub(d2.w));
          const v = select(fromEnd0, t, t.negate());
          const code = select(fromEnd0, d2.x, d2.y);
          const marks = fromThreshold(u, v, halfWidth, runwayLength, code, metres).toVar();
          // Centre line between the designations, dashes counted from end 0
          const lineWidth = select(halfWidth.mul(2).greaterThanEqual(30), float(0.9), float(0.45));
          const along = s.sub(d2.z).sub(CENTRE_LINE_FROM);
          const dash = mod(along, DASH_PERIOD);
          const inLine = along.greaterThan(0).and(runwayLength.sub(s).sub(d2.w).greaterThan(CENTRE_LINE_FROM));
          const lineDistance = max(abs(t).sub(lineWidth.div(2)), max(dash.sub(DASH), dash.negate()));
          marks.assign(max(marks, select(inLine, cover(lineDistance, metres), float(0))));
          // Side stripes along the edges of runways 30 m wide and more
          const sideDistance = abs(abs(t).sub(halfWidth.sub(0.45))).sub(0.45);
          marks.assign(max(marks, select(halfWidth.greaterThanEqual(15), cover(sideDistance, metres), float(0))));
          const painted = mix(paved, paintColour, marks.mul(fade));
          colour.assign(mix(colour, painted, pavement));
        });
      });
      return vec4(colour, base.a);
    })();
  }
}
