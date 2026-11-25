import { audioChannel } from './AudioMixer.js';

/** Level of the engines at full power, heard from the chase camera, at full volume */
const LEVEL = 0.5;

/** Distance (m) at which the engines are heard at their reference level; closer, they get louder */
const REFERENCE_DISTANCE = 20;

/** Time constant (s) of the level and pitch changes: smooth at the frame rate */
const SMOOTHING = 0.06;

/** Seconds of noise looped by the noise sources: long enough not to be heard as a loop */
const NOISE_SECONDS = 4;

/**
 * Sound of the engines, synthesised with Web Audio (no sound files) on the
 * engine channel of the mixer:
 * - the whine of the fans and compressors, two tones rising with the shaft
 *   speed, heard most from ahead of the aircraft (the inlets);
 * - the roar of the jet, low-passed noise growing and brightening with power,
 *   heard most from behind it, where jet noise is loudest;
 * - the rumble and crackle of the afterburner.
 *
 * From the chase camera the level follows the distance to the nozzles; in the
 * cockpit, the canopy and the helmet muffle it all.
 *
 * Browsers only start audio after a key press or a click: the sound starts
 * with the first one, and whenever the engine volume is raised from zero.
 */
export default class EngineSound {
  constructor() {
    this._graph = null;
    this._gesture = false;
    this._retry = 0;
    const onGesture = () => {
      this._gesture = true;
      window.removeEventListener('keydown', onGesture);
      window.removeEventListener('pointerdown', onGesture);
    };
    window.addEventListener('keydown', onGesture);
    window.addEventListener('pointerdown', onGesture);
  }

  _build() {
    const channel = audioChannel('engine');
    if (!channel) return null;
    const { ctx, out } = channel;

    const master = ctx.createGain();
    master.gain.value = 0;
    // Canopy and helmet in the cockpit, open from outside
    const muffle = ctx.createBiquadFilter();
    muffle.type = 'lowpass';
    muffle.frequency.value = 18000;
    master.connect(muffle).connect(out);

    const noise = noiseBuffer(ctx);
    const loop = () => {
      const source = ctx.createBufferSource();
      source.buffer = noise;
      source.loop = true;
      // Each source starts at its own point of the loop, so they do not correlate
      source.start(0, Math.random() * NOISE_SECONDS);
      return source;
    };

    // Whine: blade-passing tones of the fan and of the compressor
    const whine = ctx.createGain();
    whine.gain.value = 0;
    whine.connect(master);
    const fan = ctx.createOscillator();
    fan.type = 'triangle';
    const compressor = ctx.createOscillator();
    compressor.type = 'sine';
    const compressorGain = ctx.createGain();
    compressorGain.gain.value = 0.4;
    fan.connect(whine);
    compressor.connect(compressorGain).connect(whine);
    fan.start();
    compressor.start();

    // Roar: broadband jet noise, brighter at high power
    const roarFilter = ctx.createBiquadFilter();
    roarFilter.type = 'lowpass';
    roarFilter.Q.value = 0.5;
    const roar = ctx.createGain();
    roar.gain.value = 0;
    loop().connect(roarFilter).connect(roar).connect(master);

    // Afterburner: deep rumble, and crackle from a band of higher noise
    const rumbleFilter = ctx.createBiquadFilter();
    rumbleFilter.type = 'lowpass';
    rumbleFilter.frequency.value = 160;
    const crackleFilter = ctx.createBiquadFilter();
    crackleFilter.type = 'bandpass';
    crackleFilter.frequency.value = 1400;
    crackleFilter.Q.value = 0.8;
    const crackleGain = ctx.createGain();
    crackleGain.gain.value = 0.25;
    const reheat = ctx.createGain();
    reheat.gain.value = 0;
    loop().connect(rumbleFilter).connect(reheat);
    loop().connect(crackleFilter).connect(crackleGain).connect(reheat);
    reheat.connect(master);

    return { ctx, master, muffle, whine, fan, compressor, roar, roarFilter, reheat };
  }

  /**
   * @param {number} dt - s
   * @param {?{core: number, reheat: number, running: boolean}} engines - core power (0 idle, 1 full
   *   dry), afterburner stage (0 off, 1 full), whether the engines run; null for no sound
   * @param {{distance: number, ahead: number, cockpit: boolean}} listener - distance (m) from the
   *   nozzles, cosine of the angle between the aircraft's nose and the direction of the listener,
   *   whether heard from the cockpit
   */
  update(dt, engines, { distance, ahead, cockpit }) {
    if (!this._graph) {
      this._retry -= dt;
      if (!this._gesture || this._retry > 0) return;
      this._retry = 1;
      this._graph = this._build();
      if (!this._graph) return;
    }
    const g = this._graph;
    const t = g.ctx.currentTime;
    const set = (param, value) => param.setTargetAtTime(value, t, SMOOTHING);

    const core = engines?.running ? engines.core : 0;
    const reheat = engines?.running ? engines.reheat : 0;
    // Shaft speed: about 60 % at idle; the engines wind down when they stop
    const shaft = engines?.running ? 0.6 + 0.4 * core : 0;

    set(g.fan.frequency, 900 + 2900 * shaft);
    set(g.compressor.frequency, 1500 + 5200 * shaft);
    set(g.roarFilter.frequency, 250 + 1700 * core + 1500 * reheat);

    // Whine loudest from ahead, jet noise from behind (≈ 140° off the nose)
    const front = (1 + ahead) / 2;
    const rear = Math.min(1, 0.35 + 0.65 * (1 - ahead) * 0.8);
    set(g.whine.gain, shaft * shaft * (0.025 + 0.07 * front) * (cockpit ? 2 : 1));
    set(g.roar.gain, (0.08 + 0.7 * core * core) * rear);
    set(g.reheat.gain, 1.6 * reheat * rear);

    const level = engines ? LEVEL * Math.min(2, REFERENCE_DISTANCE / Math.max(distance, 1)) : 0;
    set(g.master.gain, engines && cockpit ? LEVEL * 0.6 : level);
    set(g.muffle.frequency, cockpit ? 900 : 18000);
  }
}

/** Brown-tinted noise: white noise through a leaky integrator, normalised */
function noiseBuffer(ctx) {
  const length = Math.round(NOISE_SECONDS * ctx.sampleRate);
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  let last = 0;
  for (let i = 0; i < length; i++) {
    const white = Math.random() * 2 - 1;
    last = 0.97 * last + 0.03 * white;
    data[i] = last + 0.08 * white;
  }
  // Tilt the signal so that its end meets its start: the loop does not click
  const step = data[length - 1] - data[0];
  let peak = 0;
  for (let i = 0; i < length; i++) {
    data[i] -= (step * i) / length;
    peak = Math.max(peak, Math.abs(data[i]));
  }
  for (let i = 0; i < length; i++) data[i] /= peak;
  return buffer;
}
