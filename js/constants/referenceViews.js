/**
 * Reproducible viewpoints used to compare rendering quality across changes.
 *
 * - lat / lon: decimal degrees (WGS84)
 * - altitude: metres above sea level
 * - heading: compass degrees, clockwise from north
 * - pitch: degrees, negative looks down
 * - dayOfYear, timeOfDay: date and local solar time (hours), set for the sun
 *   elevation and compass bearing noted beside them (within 0.15°)
 */
export const REFERENCE_VIEWS = [
  {
    name: 'Mont Blanc — grazing view, high sun',
    lat: 45.905,
    lon: 6.775,
    altitude: 4300,
    heading: 140,
    pitch: -6,
    dayOfYear: 110,
    timeOfDay: 11.6125, // sun at 55° elevation, bearing 170°
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
    dayOfYear: 272,
    timeOfDay: 10.9875, // sun at 40° elevation, bearing 160°
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
    dayOfYear: 62,
    timeOfDay: 13.0917, // sun at 35° elevation, bearing 200°
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
    dayOfYear: 130,
    timeOfDay: 18.7417, // sun at 5° elevation, bearing 290°
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
    dayOfYear: 305,
    timeOfDay: 12.0, // sun at 30° elevation, bearing 180°
    cameraMode: 'chase',
    showClouds: true,
    cloudAltitude: 4500,
  },
  {
    name: 'Mont Blanc massif — facing the low sun',
    lat: 45.93,
    lon: 6.98,
    altitude: 4200,
    heading: 225,
    pitch: -2,
    dayOfYear: 291,
    timeOfDay: 16.3208, // sun at 10° elevation, bearing 245°
    cameraMode: 'chase',
    showClouds: false,
  },
];
