const CONFIG = {
  chunkSize: 256,
  chunkResolution: 64,
  viewDistance: 12,
  maxHeight: 960,
  octaves: 6,
  lacunarity: 2.0,
  persistence: 0.5,
  redistribution: 1.8,
  seed: 'landscape-3d',
  cameraSpeed: 800,
  mouseSensitivity: 0.002,
  maxPixelRatio: 2,
  maxChunkRequestsPerFrame: 4,
  wireframe: true,
  waterLevel: 0.18,
  terrainMode: 'realworld', // 'procedural' | 'realworld'
  lat: 45.8326,              // Mont Blanc default
  lon: 6.8652,
  zoom: 15,
  useOsmTexture: true,
  textureSource: 'satellite', // 'osm' | 'satellite'
  minZoom: 3,
  maxTotalTiles: 1000,
  lodRingRadius: 8,
};

const listeners = new Set();

function onChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function update(key, value) {
  if (CONFIG[key] !== value) {
    CONFIG[key] = value;
    for (const fn of listeners) fn(key, value);
  }
}

export { CONFIG, onChange, update };
