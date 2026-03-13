# Landscape 3D

Interactive 3D terrain viewer with flight controls, supporting both procedural generation and real-world elevation data. Built with Three.js and vanilla JavaScript — no build step required.

![WebGL](https://img.shields.io/badge/WebGL-Three.js-green)

## Features

- **Dual terrain modes** — procedural (Simplex noise) or real-world (elevation tiles)
- **Real-world elevation** — decoded from [AWS Terrarium](https://registry.opendata.aws/terrain-tiles/) PNG tiles
- **Map textures** — optional OpenStreetMap raster overlay
- **Flight simulator controls** — 6-DOF camera with pointer lock, banking, pitch/yaw
- **Aircraft-style HUD** — compass, artificial horizon, altimeter (AGL), speed indicator
- **Dynamic chunk loading** — spiral-ordered around camera, with frustum culling
- **Web Worker** — terrain geometry built off the main thread
- **Local tile cache** — pre-download tiles for offline or faster loading
- **Configurable** — control panel with sliders for resolution, view distance, height, etc.

## Quick Start

No dependencies to install. Start the dev server:

```bash
node scripts/serve.js
```

Then open [http://localhost:3000](http://localhost:3000) in your browser.

The server acts as a **caching proxy** for map tiles — every tile downloaded from the internet is automatically saved to `cache/` on disk, so it's never fetched twice.

### Controls

| Input | Action |
|---|---|
| Click the viewport | Lock the mouse pointer |
| Mouse | Look around (yaw / pitch) |
| `W` / `S` or `↑` / `↓` | Move forward / backward |
| `A` / `D` or `←` / `→` | Strafe left / right |
| `Esc` | Release pointer lock |

Use the right-side control panel to switch between **Procedural** and **Real-World** modes, adjust terrain parameters, and toggle wireframe or OSM textures.

## Real-World Mode

Switch to **Real-World** in the control panel, enter coordinates (or search a place name), then click **Load Terrain**. The app fetches elevation data from AWS Terrarium and optionally overlays OpenStreetMap textures.

Default location: **Mont Blanc** (45.8326°N, 6.8652°E).

## Tile Cache

The dev server (`scripts/serve.js`) acts as a transparent caching proxy. When the browser requests a tile:

1. **Cache hit** — the file exists in `cache/`, served instantly from disk (`X-Cache: HIT`)
2. **Cache miss** — fetched from the remote server, saved to `cache/`, then returned (`X-Cache: MISS`)

Every tile is downloaded **at most once**. Subsequent sessions, or navigating back to a previously visited area, will always load from the local cache.

```
cache/
  terrarium/        ← elevation tiles (AWS Terrarium)
    12/
      2045/
        1423.png
  osm/              ← map textures (OpenStreetMap)
    12/
      2045/
        1423.png
```

The cache is organized by source name (`terrarium`, `osm`), so changing providers in the future won't cause conflicts.

> The `cache/` directory is listed in `.gitignore` and should not be committed — it can be regenerated at any time.

### Bulk pre-download

To pre-fill the cache for a region (useful before going offline):

```bash
node scripts/prefetch-tiles.js --lat 45.8326 --lon 6.8652 --zoom 12 --radius 12
```

| Option | Default | Description |
|---|---|---|
| `--lat` | *(required)* | Latitude of the center point |
| `--lon` | *(required)* | Longitude of the center point |
| `--zoom` | `12` | Zoom level (matches the app's zoom setting) |
| `--radius` | `12` | Number of tiles around the center in each direction |
| `--delay` | `100` | Delay in ms between downloads (rate limiting) |

Both the server and the prefetch script write to the same `cache/` directory — no duplication.

## Project Structure

```
├── index.html                  Main HTML page
├── js/
│   ├── app.js                  Scene setup & animation loop
│   ├── camera/
│   │   └── FPSController.js    Flight camera (pointer lock, 6-DOF)
│   ├── terrain/
│   │   ├── ChunkManager.js     Chunk loading & disposal
│   │   ├── TerrainChunk.js     Geometry & mesh for one chunk
│   │   ├── NoiseGenerator.js   Simplex noise implementation
│   │   └── terrainWorker.js    Web Worker for off-thread generation
│   ├── geo/
│   │   ├── TileMath.js         Lat/lon ↔ tile coordinate math
│   │   ├── ElevationProvider.js Terrarium tile fetch + decode
│   │   └── TextureProvider.js  OSM tile fetch
│   ├── ui/
│   │   ├── HUD.js              Flight instrument overlay
│   │   └── ControlPanel.js     Settings panel
│   └── utils/
│       └── config.js           Configuration & reactive updates
├── scripts/
│   ├── serve.js                Dev server with caching tile proxy
│   └── prefetch-tiles.js       Bulk tile pre-download CLI
└── cache/                      Local tile cache (git-ignored)
```

## Technologies

- [Three.js](https://threejs.org/) v0.163 — 3D rendering (loaded via CDN, no install)
- Web Workers — off-thread terrain generation
- Canvas 2D — HUD overlay
- [AWS Terrarium Tiles](https://registry.opendata.aws/terrain-tiles/) — elevation data
- [OpenStreetMap](https://www.openstreetmap.org/) — map textures
- ES modules — no bundler needed

## License

MIT
