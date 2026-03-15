# Benchmark System

## Overview

The benchmark system provides a reproducible way to measure rendering performance of the 3D landscape application across different machines. It automates a camera flight path, collects frame-by-frame metrics, and exports results as a JSON file for comparison.

## Architecture

Three modules in `/js/benchmark/`:

| Module | Role |
|---|---|
| `CameraPath.js` | Pilots the camera along a circular flight path |
| `MetricsCollector.js` | Records per-frame metrics and computes aggregates |
| `BenchmarkRunner.js` | Orchestrates warmup, flight, collection, and JSON export |

Integration points:
- `app.js` — key **B** to start/stop, `update()` call in the render loop
- `FPSController.js` — `enabled` flag to disable manual control during benchmark
- `HUD.js` — visual indicator (orange "WARMUP" countdown, then red blinking "REC BENCHMARK")

## How It Works

### 1. Warmup Phase (15 seconds)

The camera stays still at the starting position. This allows surrounding terrain tiles to load and stabilize, so that the measurement phase is not polluted by initial loading stutters.

### 2. Flight Phase (5 minutes)

The camera flies forward continuously using the same physics as the FPSController (as if pressing **W**). The heading (yaw) rotates smoothly through a full 360° over the flight duration, creating a large circular path that returns to the starting heading.

Key parameters:
- **Duration**: 300 seconds
- **Movement**: forward at `CONFIG.cameraSpeed` (default 800 units/s)
- **Yaw**: linear rotation of 2π over 300s (gentle continuous turn)
- **Pitch**: oscillates gently around -0.08 rad (slight nose-down)
- **Altitude clamp**: camera never goes below ground elevation + 50m

### 3. Export

When the flight completes (or is stopped manually with **B**), the system:
1. Computes aggregate statistics
2. Generates a JSON report
3. Triggers automatic download of `benchmark-YYYY-MM-DDTHH-MM-SS.json`
4. Logs a summary to the Logger panel

## Metrics Collected

### Per Frame

| Field | Description |
|---|---|
| `t` | Timestamp in ms since recording start |
| `ft` | Frame time in ms |
| `fps` | Instantaneous FPS (1000 / frameTime) |
| `tri` | Triangle count (`renderer.info.render.triangles`) |
| `dc` | Draw calls (`renderer.info.render.calls`) |
| `geo` | Geometry count in GPU memory |
| `tex` | Texture count in GPU memory |

### Aggregates (in `summary`)

- **FPS**: avg, min, max, P1, P5, P95
- **Frame time**: avg, min, max, P1, P5, P95
- **Triangles**: avg, max
- **Draw calls**: avg, max

### Machine Info (in `machine`)

- `userAgent`, `platform`
- `cpuCores` (navigator.hardwareConcurrency)
- `deviceMemory` (if available)
- `gpu` (WebGL UNMASKED_RENDERER)
- `canvasWidth`, `canvasHeight`, `pixelRatio`

### Config Snapshot (in `config`)

Captures the active configuration at benchmark time: `terrainMode`, `chunkResolution`, `viewDistance`, `hiResMode`, `wireframe`, `zoom`, `fogEnabled`, `showClouds`, `maxPixelRatio`.

## JSON Output Format

```json
{
  "version": 1,
  "date": "2026-03-14T18:24:40.104Z",
  "duration": 300.1,
  "machine": {
    "userAgent": "...",
    "platform": "MacIntel",
    "cpuCores": 16,
    "deviceMemory": 8,
    "gpu": "ANGLE (Apple, ANGLE Metal Renderer: Apple M4 Max, ...)",
    "canvasWidth": 2056,
    "canvasHeight": 1084,
    "pixelRatio": 2
  },
  "config": {
    "terrainMode": "realworld",
    "chunkResolution": 64,
    "viewDistance": 12,
    "hiResMode": false,
    "wireframe": true,
    "zoom": 15,
    "fogEnabled": true,
    "showClouds": false,
    "maxPixelRatio": 2
  },
  "summary": {
    "totalFrames": 19684,
    "fps": { "avg": 90.9, "min": 9.1, "max": 666.7, "p1": 14.1, "p5": 35.6, "p95": 163.9 },
    "frameTime": { "avg": 15.2, "min": 1.5, "max": 109.3, "p1": 3.8, "p5": 6.1, "p95": 28.1 },
    "triangles": { "avg": 114474530, "max": 243343374 },
    "drawCalls": { "avg": 864, "max": 1832 }
  },
  "frames": [
    { "t": 7.2, "ft": 8.1, "fps": 123.5, "tri": 31682574, "dc": 242, "geo": 4, "tex": 640 }
  ]
}
```

## Test Runs Performed

All runs on the same machine: **Apple M4 Max**, 16 cores, canvas 2056×1084 @2x, realworld mode (Mont Blanc, zoom 15, wireframe).

### Run 1 — Baseline (no warmup, position interpolation, 2 min)

The initial implementation used absolute position waypoints with lerp interpolation. The camera was teleported between waypoints rather than flying forward.

| Metric | Value |
|---|---|
| Duration | 120s |
| Frames | 11,412 |
| FPS avg | 100.0 |
| FPS P1 / P5 | 69.9 / 81.3 |
| FT avg | 10.5 ms |
| Triangles avg / max | 59.6M / 70.8M |
| Draw calls max | 536 |
| Stutters (<60 FPS) | 0.5% |

**Findings**: Tile loading stutters concentrated in the first 30 seconds (57 frames below 30 FPS). Once tiles stabilized (~90s), performance locked at ~90 FPS. The position-interpolation approach caused the camera to drift laterally rather than fly forward naturally.

### Run 2 — With warmup, forward flight (2 min)

Added 15s static warmup. Switched to heading-based flight (yaw/pitch control + forward movement). However, negative pitch values caused the camera to dive below the terrain tiles for most of the flight.

| Metric | Value |
|---|---|
| Duration | 120s |
| Frames | 14,358 |
| FPS avg | 120.6 |
| FPS P1 / P5 | 104.2 / 112.4 |
| FT avg | 8.4 ms |
| FT P95 | 8.9 ms |
| Triangles avg / max | 59.4M / 61.6M |
| Draw calls max | 467 |
| Stutters (<60 FPS) | 0.15% |

**Findings**: The warmup eliminated initial loading stutters effectively. However, results were artificially good because the camera flew under the terrain — frustum culling hid most geometry. The 120 FPS lock was vsync, not a real GPU measurement. Triangles stayed flat at 61M because `renderer.info` counts submitted triangles, not rasterized ones.

### Run 3 — With altitude clamp, circular path (5 min)

Added ground elevation clamping (minimum 50m AGL). Extended flight to 5 minutes with a full 360° circular path. Camera starts from the current position, so the starting location can be chosen by the user before pressing B.

| Metric | Value |
|---|---|
| Duration | 300s |
| Frames | 19,684 |
| FPS avg | 90.9 |
| FPS P1 / P5 | 14.1 / 35.6 |
| FT avg | 15.2 ms |
| FT P95 | 28.1 ms |
| Triangles avg / max | 114.5M / 243.3M |
| Draw calls max | 1,832 |
| Stutters (<60 FPS) | 32.7% |
| Stutters (<30 FPS) | 4.1% |

**Performance over time:**

| Segment | FPS avg | FPS min | Triangles avg | Draw Calls |
|---|---|---|---|---|
| 0–30s | 121 | 48 | 36M | 275 |
| 60–90s | 97 | 17 | 72M | 543 |
| 120–150s | 78 | 13 | 134M | 1,014 |
| 180–210s | 68 | 11 | 192M | 1,445 |
| 270–300s | 54 | 9 | 239M | 1,796 |

**Findings**: This run reflects real-world GPU stress. The circular path continuously loads new tiles, causing triangles to grow from 32M to 243M (7.7x). FPS degrades linearly from 121 to 54 as more geometry accumulates. Worst stutters (100+ ms) occur during tile loading at high triangle counts. The M4 Max still holds ~55 FPS at 240M triangles and 1800 draw calls, which remains playable.

## Known Limitations and Future Improvements

- **Tile streaming dominates**: The benchmark measures both rendering and tile loading. Frames with >100ms are caused by tile creation, not GPU rendering. Separating these two concerns (e.g., waiting for all tiles to load before measuring) would give a cleaner GPU-only benchmark.
- **Triangle accumulation**: The circular path keeps loading new tiles throughout the flight. Tiles behind the camera are not unloaded, so triangle count grows monotonically. A tighter circle (smaller radius) or a `maxTotalTiles` cap would produce more stable measurements.
- **No camera speed normalization**: Different `cameraSpeed` values produce different circle radii, loading different amounts of terrain. The benchmark config should be locked to fixed values for reproducibility.
- **Single flight pattern**: Only a circular path is available. Adding options (straight line, figure-eight, hover in place) would test different scenarios.
- **No comparison tool**: Results must be compared manually. A companion script or web page to overlay two JSON reports would be valuable.
- **Warmup could be smarter**: The current warmup is a fixed 15s timer. It could instead wait until the frame time stabilizes (e.g., 60 consecutive frames under 12ms).

## Usage

1. Navigate to the desired starting location
2. Press **B** to start the benchmark
3. Wait for the orange "WARMUP" countdown (15s)
4. The red "REC BENCHMARK" indicator appears — recording is active
5. After 5 minutes, the benchmark completes and a JSON file downloads automatically
6. Press **B** at any time to stop early (partial results are exported)
