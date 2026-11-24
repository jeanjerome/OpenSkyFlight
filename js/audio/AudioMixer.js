import { CONFIG, onChange } from '../utils/config.js';

/**
 * Shared Web Audio context and mixing: every sound plays on a channel whose gain
 * follows a volume setting, and all channels go through the master volume.
 *
 * The context is created on the first sound, which browsers only allow after a
 * key press or a click.
 */

/** Channel name → CONFIG key of its volume */
export const CHANNELS = {
  interface: 'interfaceVolume',
  engine: 'engineVolume',
  radio: 'radioVolume',
};

let ctx = null;
let master = null;
const channelGains = {};

/** Volume settings go from 0 to 1; loudness follows their square more evenly than the raw gain */
function gainOf(volume) {
  return volume * volume;
}

function createGraph() {
  try {
    ctx = new AudioContext();
  } catch {
    return false;
  }
  master = ctx.createGain();
  master.gain.value = gainOf(CONFIG.masterVolume);
  master.connect(ctx.destination);
  for (const [name, key] of Object.entries(CHANNELS)) {
    const gain = ctx.createGain();
    gain.gain.value = gainOf(CONFIG[key]);
    gain.connect(master);
    channelGains[name] = gain;
  }
  return true;
}

onChange((key, value) => {
  if (!ctx) return;
  if (key === 'masterVolume') master.gain.setTargetAtTime(gainOf(value), ctx.currentTime, 0.02);
  for (const [name, channelKey] of Object.entries(CHANNELS)) {
    if (key === channelKey) channelGains[name].gain.setTargetAtTime(gainOf(value), ctx.currentTime, 0.02);
  }
});

/**
 * Audio context and the input node of a channel, or null when audio is unavailable
 * or the channel is silent
 * @param {keyof CHANNELS} channel
 * @returns {{ ctx: AudioContext, out: AudioNode } | null}
 */
export function audioChannel(channel) {
  if (CONFIG.masterVolume === 0 || CONFIG[CHANNELS[channel]] === 0) return null;
  if (!ctx && !createGraph()) return null;
  if (ctx.state === 'suspended') ctx.resume();
  return { ctx, out: channelGains[channel] };
}
