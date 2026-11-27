# Demo film

The 4K demo film of OpenSkyFlight 2.0 (3 min 14 s, 3840×2160, 60 fps) is
made entirely from the sources of this repository and one music file:

| File | Role |
|---|---|
| `scripts/demo/shots.js` | The shot list: 46 shots placed on the bars of the music (place, light, weather, aircraft path, camera rig) |
| `js/cinematic/` | The cinematic mode of the application: imposed flight paths over the relief and camera rigs (see `CinematicDirector.js` for the shot format) |
| `scripts/cinematic-record.js` | Records shots frame by frame in Chrome, or saves preview stills |
| `scripts/demo/edit.js` | Cuts the film on the music: transitions, letterbox, titles, grade |
| `scripts/demo/thumbnail.js` | Draws the YouTube thumbnails from `demo/youtube/thumbnail*.html` |
| `demo/youtube/youtube.md` | Titles, description, chapters and tags for YouTube (English and French) |

The recorded clips, the renders and the images are not versioned: they are
written under `demo/` and can all be made again from these sources.

## Requirements

- Google Chrome with WebGPU, ffmpeg, and `npm install` (Playwright).
- macOS for the edit and the thumbnails as they are: the edit encodes with
  `h264_videotoolbox` and the titles use the Avenir Next Condensed system
  font (change `INTERMEDIATE`, `FINAL` and `STYLE` in `edit.js` elsewhere).
- The music, not versioned: *Audio Hertz — World War Outerspace* (MP3,
  3 min 19 s). `BAR` and `BAR0` in `shots.js` give its tempo (131 BPM) and
  the time of its first drop (14.7 s); another track needs other values.
- Network access: the terrain tiles of every place are downloaded on the
  first recording and kept in `cache/`.

## Making the film

Start a dev server (port 3002 here, to leave yours on 3000):

```bash
node scripts/build-vendor.js
node scripts/serve.js --port 3002
```

1. **Preview** a few stills of the shots being designed (quarter size, in
   `demo/preview`); the log warns when the ground as drawn departs from the
   elevation data (tiles without their relief, errors in the data):

   ```bash
   node scripts/cinematic-record.js --url http://localhost:3002/ --shots scripts/demo/shots.js \
     --out demo/preview --preview 3 --only a2-valley-chase,c5-yosemite-chase
   ```

2. **Record** the shots at 4K 60 fps into `demo/clips` (all of them without
   `--only`: about 50 minutes once the tiles are cached, much longer the
   first time):

   ```bash
   node scripts/cinematic-record.js --url http://localhost:3002/ --shots scripts/demo/shots.js \
     --out demo/clips [--only a2-valley-chase]
   ```

3. **Edit** the film (about 6 minutes in 4K; `--scale 0.5` makes a 1080p
   draft in under 2 minutes):

   ```bash
   node scripts/demo/edit.js --clips demo/clips --music "<path to the MP3>" \
     --out demo/OpenSkyFlight-demo-4K.mp4
   ```

4. **Thumbnails** (`demo/youtube/thumbnail.jpg` and `thumbnail-fr.jpg`):

   ```bash
   node scripts/demo/thumbnail.js
   ```

## Changing the film

- A shot: edit it in `shots.js`, preview it, record it again with `--only`,
  then run the edit again. A shot must be recorded at least as long as its
  bars plus the transition that follows it (`LONG_HANDLE` for the long
  dissolves); the edit stops with the missing frames otherwise.
- The cut: the transitions, letterboxed stretches and titles are the tables
  at the top of `edit.js` (`TRANSITIONS`, `LETTERBOX`, `TITLES`), in bars.
- The thumbnails: the text and layout are in `demo/youtube/thumbnail*.html`,
  the frame behind them is chosen with `--shot` and `--at`.

Lessons from the first film: cameras standing on the ground or on snow show
the relief at its lowest resolution, airborne cameras do better; narrow
fjords (Geirangerfjord), mesas (Monument Valley) and small canyons (Rainbow
Canyon) came out with aberrant relief; night views away from the twilight
show a flat brown ground, and close city lights look poor.
