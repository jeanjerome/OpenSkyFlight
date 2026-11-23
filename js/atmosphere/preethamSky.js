/**
 * CPU evaluation of the Preetham sky model as implemented by three.js SkyMesh
 * (examples/jsm/objects/SkyMesh.js, r183), without its procedural clouds or
 * solar disc. Returns the same linear radiance the sky shader writes, so scene
 * colors derived from it (fog) match the rendered sky.
 */

const TOTAL_RAYLEIGH = [5.804542996261093e-6, 1.3562911419845635e-5, 3.0265902468824876e-5];
const MIE_CONST = [1.8399918514433978e14, 2.7798023919660528e14, 4.0790479543861094e14];
const CUTOFF_ANGLE = 1.6110731556870734;
const STEEPNESS = 1.5;
const EE = 1000;
const RAYLEIGH_ZENITH_LENGTH = 8.4e3;
const MIE_ZENITH_LENGTH = 1.25e3;
const THREE_OVER_SIXTEENPI = 0.05968310365946075;
const ONE_OVER_FOURPI = 0.07957747154594767;

const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));

/**
 * @param {{x:number,y:number,z:number}} dir - unit view direction (y up)
 * @param {{x:number,y:number,z:number}} sunPosition - sun position uniform as given to SkyMesh
 * @param {{turbidity:number, rayleigh:number, mieCoefficient:number, mieDirectionalG:number}} params
 * @param {number[]} [out] - receives [r, g, b] in linear space
 * @returns {number[]}
 */
export function preethamSkyRadiance(dir, sunPosition, params, out = [0, 0, 0]) {
  const { turbidity, rayleigh, mieCoefficient, mieDirectionalG: g } = params;

  const len = Math.hypot(sunPosition.x, sunPosition.y, sunPosition.z) || 1;
  const sx = sunPosition.x / len;
  const sy = sunPosition.y / len;
  const sz = sunPosition.z / len;

  // Per-vertex terms
  const sunE = EE * Math.max(0, 1 - Math.exp(-(CUTOFF_ANGLE - Math.acos(clamp(sy, -1, 1))) / STEEPNESS));
  const sunfade = 1 - clamp(1 - Math.exp(sunPosition.y / 450000), 0, 1);
  const rayleighCoefficient = rayleigh - (1 - sunfade);
  const mieScale = 0.434 * 0.2 * turbidity * 10e-18 * mieCoefficient;

  // Per-pixel terms
  const zenithAngle = Math.acos(Math.max(0, dir.y));
  const inverse = 1 / (Math.cos(zenithAngle) + 0.15 * Math.pow(93.885 - (zenithAngle * 180) / Math.PI, -1.253));
  const sR = RAYLEIGH_ZENITH_LENGTH * inverse;
  const sM = MIE_ZENITH_LENGTH * inverse;

  const cosTheta = dir.x * sx + dir.y * sy + dir.z * sz;
  const c = cosTheta * 0.5 + 0.5;
  const rPhase = THREE_OVER_SIXTEENPI * (1 + c * c);
  const g2 = g * g;
  const mPhase = (ONE_OVER_FOURPI * (1 - g2)) / Math.pow(1 - 2 * g * cosTheta + g2, 1.5);
  const sunsetBlend = clamp(Math.pow(1 - sy, 5), 0, 1);
  const ambientBias = [0, 0.0003, 0.00075];

  for (let i = 0; i < 3; i++) {
    const betaR = TOTAL_RAYLEIGH[i] * rayleighCoefficient;
    const betaM = mieScale * MIE_CONST[i];
    const fex = Math.exp(-(betaR * sR + betaM * sM));
    const scatter = (sunE * (betaR * rPhase + betaM * mPhase)) / (betaR + betaM);
    let lin = Math.pow(scatter * (1 - fex), 1.5);
    lin *= 1 + (Math.sqrt(scatter * fex) - 1) * sunsetBlend;
    out[i] = (lin + 0.1 * fex) * 0.04 + ambientBias[i];
  }
  return out;
}

/**
 * Sky radiance just above the horizon, averaged over all compass directions.
 * @returns {number[]} [r, g, b] linear
 */
export function preethamHorizonRadiance(sunPosition, params, samples = 16, elevationDeg = 1) {
  const sum = [0, 0, 0];
  const tmp = [0, 0, 0];
  const el = (elevationDeg * Math.PI) / 180;
  const cosEl = Math.cos(el);
  const dir = { x: 0, y: Math.sin(el), z: 0 };
  for (let k = 0; k < samples; k++) {
    const az = (2 * Math.PI * k) / samples;
    dir.x = cosEl * Math.cos(az);
    dir.z = cosEl * Math.sin(az);
    preethamSkyRadiance(dir, sunPosition, params, tmp);
    sum[0] += tmp[0];
    sum[1] += tmp[1];
    sum[2] += tmp[2];
  }
  return sum.map((v) => v / samples);
}

/**
 * Relative sun intensity reaching the ground through the Preetham atmosphere:
 * the model's sun intensity (normalized to 1 at its 1000 peak) times the
 * extinction along the sun direction.
 * @returns {number[]} [r, g, b] linear
 */
export function preethamSunTransmittance(sunPosition, params, out = [0, 0, 0]) {
  const { turbidity, rayleigh, mieCoefficient } = params;
  const len = Math.hypot(sunPosition.x, sunPosition.y, sunPosition.z) || 1;
  const sy = sunPosition.y / len;

  const sunE = Math.max(0, 1 - Math.exp(-(CUTOFF_ANGLE - Math.acos(clamp(sy, -1, 1))) / STEEPNESS));
  const sunfade = 1 - clamp(1 - Math.exp(sunPosition.y / 450000), 0, 1);
  const rayleighCoefficient = rayleigh - (1 - sunfade);
  const mieScale = 0.434 * 0.2 * turbidity * 10e-18 * mieCoefficient;

  const zenithAngle = Math.acos(Math.max(0, sy));
  const inverse = 1 / (Math.cos(zenithAngle) + 0.15 * Math.pow(93.885 - (zenithAngle * 180) / Math.PI, -1.253));
  for (let i = 0; i < 3; i++) {
    const betaR = TOTAL_RAYLEIGH[i] * rayleighCoefficient;
    const betaM = mieScale * MIE_CONST[i];
    out[i] = sunE * Math.exp(-(betaR * RAYLEIGH_ZENITH_LENGTH + betaM * MIE_ZENITH_LENGTH) * inverse);
  }
  return out;
}

/**
 * Irradiance from the sky dome on a horizontal surface (cosine-weighted
 * integral of the sky radiance over the upper hemisphere), sun disc excluded.
 * @returns {number[]} [r, g, b] linear
 */
export function preethamSkyIrradiance(sunPosition, params, thetaSteps = 16, phiSteps = 32) {
  const sum = [0, 0, 0];
  const tmp = [0, 0, 0];
  const dir = { x: 0, y: 0, z: 0 };
  const dTheta = Math.PI / 2 / thetaSteps;
  const dPhi = (2 * Math.PI) / phiSteps;
  for (let i = 0; i < thetaSteps; i++) {
    const theta = (i + 0.5) * dTheta;
    const sinT = Math.sin(theta);
    const cosT = Math.cos(theta);
    const weight = cosT * sinT * dTheta * dPhi;
    for (let j = 0; j < phiSteps; j++) {
      const phi = (j + 0.5) * dPhi;
      dir.x = sinT * Math.cos(phi);
      dir.y = cosT;
      dir.z = sinT * Math.sin(phi);
      preethamSkyRadiance(dir, sunPosition, params, tmp);
      sum[0] += tmp[0] * weight;
      sum[1] += tmp[1] * weight;
      sum[2] += tmp[2] * weight;
    }
  }
  return sum;
}
