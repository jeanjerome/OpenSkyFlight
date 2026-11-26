import {
  Fn,
  float,
  vec3,
  dot,
  abs,
  fract,
  max,
  min,
  mix,
  clamp,
  smoothstep,
  fwidth,
  positionWorld,
  cameraPosition,
  sRGBTransferEOTF,
} from 'three/tsl';
import {
  CONTOUR_GROUND,
  CONTOUR_LINE_COLOR,
  CONTOUR_LINE_LUMINANCE,
  CONTOUR_LEVELS,
  CONTOUR_MIN_SPACING,
  CONTOUR_THINNING_DISTANCE,
  CONTOUR_MIN_THICKNESS,
} from '../constants/terrain.js';

/** Radius of the Earth the terrain is lowered by around the camera (three-tile's curvature) */
const EARTH_RADIUS = 6371008.8;

/** Linear colour of an sRGB hexadecimal colour */
const srgb = (hex) => sRGBTransferEOTF(vec3(((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255));

/** Piecewise linear gradient through [elevation, sRGB colour] stops */
const gradient = (elevation, stops) => {
  let color = srgb(stops[0][1]);
  for (let i = 1; i < stops.length; i++) {
    color = mix(color, srgb(stops[i][1]), smoothstep(stops[i - 1][0], stops[i][0], elevation));
  }
  return color;
};

/**
 * Coverage of the contour lines every `interval` metres: anti-aliased lines
 * `halfWidth` pixels wide on each side, faded out where they crowd closer than
 * CONTOUR_MIN_SPACING pixels. Lines thinner than a pixel keep a pixel's width
 * and dim in proportion, which does not flicker.
 */
const contours = (elevation, metresPerPixel, interval, halfWidth) => {
  const distance = abs(fract(elevation.div(interval).add(0.5)).sub(0.5)).mul(interval);
  const pixels = distance.div(metresPerPixel);
  const line = clamp(max(halfWidth, 0.5).add(0.5).sub(pixels), 0, 1).mul(min(halfWidth.mul(2), 1));
  const spacing = float(interval).div(metresPerPixel);
  return line.mul(smoothstep(CONTOUR_MIN_SPACING, CONTOUR_MIN_SPACING * 2.5, spacing));
};

/**
 * Colour and emission of the terrain in the contour map mode: dark ground,
 * lit by the sun and the sky like the rest of the scene, under glowing
 * contour lines that stay readable in the shade and at night.
 *
 * Three levels of lines (CONTOUR_LEVELS), each thicker and brighter than the
 * last, at the true elevation (the terrain is drawn lowered by the curvature
 * of the Earth around the camera). Lines keep their width on screen up to
 * CONTOUR_THINNING_DISTANCE and thin out beyond it, as if painted on the
 * ground, down to CONTOUR_MIN_THICKNESS of their width.
 *
 * @param {Node<float>} exposure - night exposure of the scene, which the lines
 *   follow like the other light sources of the ground
 * @returns {{ color: Node<vec3>, emissive: Node<vec3> }}
 */
export function createContourMapNodes(exposure) {
  const elevationNode = () => {
    const offset = positionWorld.xz.sub(cameraPosition.xz);
    return positionWorld.y.add(dot(offset, offset).div(2 * EARTH_RADIUS));
  };

  const color = Fn(() => gradient(elevationNode(), CONTOUR_GROUND))();

  const emissive = Fn(() => {
    const elevation = elevationNode();
    const metresPerPixel = max(fwidth(elevation), 1e-3);
    const distance = positionWorld.sub(cameraPosition).length();
    const thickness = clamp(float(CONTOUR_THINNING_DISTANCE).div(distance), CONTOUR_MIN_THICKNESS, 1);
    let glow = float(0);
    for (const { interval, halfWidth, intensity } of CONTOUR_LEVELS) {
      glow = max(glow, contours(elevation, metresPerPixel, interval, thickness.mul(halfWidth)).mul(intensity));
    }
    return srgb(CONTOUR_LINE_COLOR).mul(glow).mul(CONTOUR_LINE_LUMINANCE).mul(exposure);
  })();

  return { color, emissive };
}
