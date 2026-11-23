/**
 * Reproducible viewpoints used to compare rendering quality across changes.
 *
 * - lat / lon: decimal degrees (WGS84)
 * - altitude: metres above sea level
 * - heading: compass degrees, clockwise from north
 * - pitch: degrees, negative looks down
 * - sunElevation: degrees above the horizon
 * - sunCompassAzimuth: compass direction of the sun, clockwise from north
 */
export const REFERENCE_VIEWS = [
  {
    name: 'Mont Blanc — grazing view, high sun',
    lat: 45.905,
    lon: 6.775,
    altitude: 4300,
    heading: 140,
    pitch: -6,
    sunElevation: 55,
    sunCompassAzimuth: 170,
    cameraMode: 'chase',
    showClouds: false,
  },
  {
    name: 'Chamonix valley — low altitude',
    lat: 45.955,
    lon: 6.915,
    altitude: 1700,
    heading: 225,
    pitch: -6,
    sunElevation: 40,
    sunCompassAzimuth: 160,
    cameraMode: 'chase',
    showClouds: false,
  },
  {
    name: 'Lake Annecy',
    lat: 45.915,
    lon: 6.145,
    altitude: 1400,
    heading: 160,
    pitch: -10,
    sunElevation: 35,
    sunCompassAzimuth: 200,
    cameraMode: 'chase',
    showClouds: false,
  },
  {
    name: 'Mont Blanc massif — sunset',
    lat: 45.9,
    lon: 7.0,
    altitude: 3800,
    heading: 235,
    pitch: -4,
    sunElevation: 5,
    sunCompassAzimuth: 290,
    cameraMode: 'chase',
    showClouds: false,
  },
  {
    name: 'Above the cloud layer',
    lat: 45.8,
    lon: 6.8,
    altitude: 6500,
    heading: 120,
    pitch: -3,
    sunElevation: 30,
    sunCompassAzimuth: 180,
    cameraMode: 'chase',
    showClouds: true,
    cloudAltitude: 4500,
  },
];
