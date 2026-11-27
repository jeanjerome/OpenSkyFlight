#!/usr/bin/env node

// Builds the vendored three-tile bundle when it is missing or older than its
// sources, installing its build dependencies first when they are missing.
// The bundle (vendor/three-tile/packages/lib/dist/three-tile-osf.js) is not
// versioned: a fresh clone has none, and a change to the sources leaves it stale.
// Run before the dev server (npm run dev); does nothing when the bundle is up to date.
//
// Usage: node scripts/build-vendor.js [--force]

import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const THREE_TILE = join(process.cwd(), 'vendor', 'three-tile');
const LIB = join(THREE_TILE, 'packages', 'lib');
const BUNDLE = join(LIB, 'dist', 'three-tile-osf.js');
/** Inputs of the bundle: a change to any of them calls for a rebuild */
const SOURCES = [join(LIB, 'src'), join(LIB, 'vite.config.ts'), join(LIB, 'package.json'), join(LIB, 'tsconfig.json')];

/** Latest modification time (ms) of a file, or of the files under a directory */
function latestChange(path) {
  if (!existsSync(path)) return 0;
  const stats = statSync(path);
  if (!stats.isDirectory()) return stats.mtimeMs;
  return readdirSync(path).reduce((latest, name) => Math.max(latest, latestChange(join(path, name))), stats.mtimeMs);
}

/** Runs an npm command in vendor/three-tile, stopping the script if it fails */
function npm(...args) {
  console.log(`three-tile: npm ${args.join(' ')}`);
  // npm is a .cmd script on Windows, which only a shell can start
  const result = spawnSync('npm', args, { cwd: THREE_TILE, stdio: 'inherit', shell: process.platform === 'win32' });
  if (result.status !== 0) {
    console.error(`three-tile: npm ${args.join(' ')} failed`);
    process.exit(result.status ?? 1);
  }
}

const force = process.argv.includes('--force');
const built = existsSync(BUNDLE) ? statSync(BUNDLE).mtimeMs : 0;
const changed = Math.max(...SOURCES.map(latestChange));

if (!force && built > changed) {
  console.log('three-tile: bundle up to date');
} else {
  console.log(built ? 'three-tile: sources changed since the last build' : 'three-tile: no bundle yet');
  if (!existsSync(join(THREE_TILE, 'node_modules'))) npm('ci');
  npm('run', 'build:lib');
}
