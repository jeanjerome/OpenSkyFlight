import { CONFIG } from '../utils/config.js';

/**
 * Sounds of the settings menu, synthesised with Web Audio (no sound files).
 * Muted by CONFIG.uiSounds. The audio context starts on the first sound, which
 * always follows a key press or a click, as browsers require.
 */

const MASTER_GAIN = 0.35;

let ctx = null;
let master = null;

function audio() {
  if (!ctx) {
    try {
      ctx = new AudioContext();
    } catch {
      return null;
    }
    master = ctx.createGain();
    master.gain.value = MASTER_GAIN;
    master.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

/** A short tone gliding from `from` to `to` Hz, with a fast attack and an exponential decay */
function tone(c, { from, to = from, duration, type = 'sine', gain, delay = 0, cutoff = 6000 }) {
  const t0 = c.currentTime + delay;
  const osc = c.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(from, t0);
  osc.frequency.exponentialRampToValueAtTime(to, t0 + duration);
  const filter = c.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = cutoff;
  const env = c.createGain();
  env.gain.setValueAtTime(0, t0);
  env.gain.linearRampToValueAtTime(gain, t0 + 0.005);
  env.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
  osc.connect(filter).connect(env).connect(master);
  osc.start(t0);
  osc.stop(t0 + duration + 0.02);
}

const SOUNDS = {
  // Moving the highlight to another setting
  move: (c) => tone(c, { from: 2400, to: 2000, duration: 0.035, type: 'triangle', gain: 0.05 }),
  // A value changed
  change: (c) => {
    tone(c, { from: 880, duration: 0.05, type: 'square', gain: 0.03, cutoff: 2500 });
    tone(c, { from: 1320, duration: 0.06, type: 'square', gain: 0.03, cutoff: 2500, delay: 0.04 });
  },
  // A value at the end of its range, or an action that cannot be done
  deny: (c) => tone(c, { from: 220, to: 180, duration: 0.08, type: 'square', gain: 0.03, cutoff: 1200 }),
  tab: (c) => tone(c, { from: 600, to: 1500, duration: 0.09, type: 'sawtooth', gain: 0.025, cutoff: 3000 }),
  open: (c) => {
    tone(c, { from: 300, to: 900, duration: 0.18, type: 'sawtooth', gain: 0.03, cutoff: 2200 });
    tone(c, { from: 1800, duration: 0.08, type: 'triangle', gain: 0.04, delay: 0.12 });
  },
  close: (c) => tone(c, { from: 900, to: 260, duration: 0.16, type: 'sawtooth', gain: 0.03, cutoff: 2200 }),
  confirm: (c) => {
    tone(c, { from: 990, duration: 0.07, type: 'triangle', gain: 0.05 });
    tone(c, { from: 1480, duration: 0.12, type: 'triangle', gain: 0.05, delay: 0.07 });
  },
};

/** @param {keyof SOUNDS} name */
export function playUiSound(name) {
  if (!CONFIG.uiSounds) return;
  const c = audio();
  if (c) SOUNDS[name](c);
}
