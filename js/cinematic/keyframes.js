/**
 * Values animated over time for the cinematic shots: a plain number (or
 * array) holds still, a list of [time, value] keys eases from one key to the
 * next (smoothstep), and holds the first and last values outside them.
 * Values may be numbers or arrays of numbers of the same length.
 */

/** Whether a value is a list of [time, value] keys rather than a constant */
export function isKeyed(value) {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    Array.isArray(value[0]) &&
    typeof value[0][0] === 'number' &&
    value[0].length === 2
  );
}

function mix(a, b, w) {
  if (typeof a === 'number') return a + (b - a) * w;
  return a.map((v, i) => v + (b[i] - v) * w);
}

/** Ease of a key: 'linear' or smoothstep (default) */
function ease(w, mode) {
  if (mode === 'linear') return w;
  return w * w * (3 - 2 * w);
}

/**
 * Value at time t
 * @param {number|number[]|Array<[number, number|number[]]>} value
 * @param {number} t - s
 * @param {'smooth'|'linear'} [mode='smooth']
 */
export function sample(value, t, mode = 'smooth') {
  if (value === undefined || value === null) return value;
  if (!isKeyed(value)) return value;
  const keys = value;
  if (t <= keys[0][0]) return keys[0][1];
  const last = keys[keys.length - 1];
  if (t >= last[0]) return last[1];
  let i = 0;
  while (keys[i + 1][0] < t) i++;
  const [t0, v0] = keys[i];
  const [t1, v1] = keys[i + 1];
  return mix(v0, v1, ease((t - t0) / (t1 - t0), mode));
}

/**
 * Deterministic camera shake: a sum of sines per axis, about unit amplitude
 * @param {number} t - s
 * @param {number} seed - shifts the phases, one per axis
 */
export function shake(t, seed) {
  return (
    0.5 * Math.sin(t * 1.7 + seed * 1.3) + 0.3 * Math.sin(t * 3.9 + seed * 2.9) + 0.2 * Math.sin(t * 8.3 + seed * 4.7)
  );
}
