/**
 * 4-Band Multiband Compressor
 * Linkwitz-Riley 4th-order crossovers with per-band threshold / ratio /
 * attack / release / makeup and a stereo-linked sidechain per band.
 *
 * Band layout (crossovers at 120 / 700 / 5000 Hz):
 *   low      < 120 Hz     (sub + kick body)
 *   lowMid   120–700 Hz   (bass, mud, warmth)
 *   highMid  700–5000 Hz  (presence, vocals, harshness)
 *   high     > 5000 Hz    (air, cymbals, sibilance)
 */

import { calcEqBandCoeffs, applyBiquadFilter } from './utils.js';

export const MULTIBAND4_CROSSOVERS = [120, 700, 5000];

export const MULTIBAND4_BAND_KEYS = ['low', 'lowMid', 'highMid', 'high'];

export const MULTIBAND4_DEFAULTS = {
  enabled: false,
  bands: {
    low: { threshold: -24, ratio: 2.5, attack: 30, release: 150, makeup: 0 },
    lowMid: { threshold: -22, ratio: 2.0, attack: 20, release: 120, makeup: 0 },
    highMid: { threshold: -20, ratio: 2.0, attack: 12, release: 90, makeup: 0 },
    high: { threshold: -18, ratio: 1.8, attack: 8, release: 70, makeup: 0 }
  }
};

/**
 * LR4 = two cascaded Butterworth (Q=0.7071) biquads of the same type.
 */
function lr4(samples, type, freq, sampleRate) {
  const coeffs = calcEqBandCoeffs(type, sampleRate, freq, 0, Math.SQRT1_2);
  return applyBiquadFilter(applyBiquadFilter(samples, coeffs), coeffs);
}

/**
 * Split a channel into 4 bands using an LR4 crossover tree.
 * @returns {Float32Array[]} [low, lowMid, highMid, high]
 */
export function splitBands4(samples, sampleRate, crossovers = MULTIBAND4_CROSSOVERS) {
  const [f1, f2, f3] = crossovers;

  const low = lr4(samples, 'lowpass', f1, sampleRate);
  const rest = lr4(samples, 'highpass', f1, sampleRate);

  const lowMid = lr4(rest, 'lowpass', f2, sampleRate);
  const rest2 = lr4(rest, 'highpass', f2, sampleRate);

  const highMid = lr4(rest2, 'lowpass', f3, sampleRate);
  const high = lr4(rest2, 'highpass', f3, sampleRate);

  return [low, lowMid, highMid, high];
}

/**
 * Compute a stereo-linked gain curve for one band.
 * @param {Float32Array[]} bandChannels - This band's samples per channel
 * @param {number} sampleRate
 * @param {Object} bandSettings - { threshold, ratio, attack, release }
 * @returns {Float32Array} Per-sample gain
 */
function computeBandGain(bandChannels, sampleRate, bandSettings) {
  const { threshold = -20, ratio = 2, attack = 20, release = 100 } = bandSettings;
  const length = bandChannels[0].length;
  const numCh = bandChannels.length;

  const thresholdLin = Math.pow(10, threshold / 20);
  const attackCoef = Math.exp(-1 / (Math.max(0.1, attack) * sampleRate / 1000));
  const releaseCoef = Math.exp(-1 / (Math.max(1, release) * sampleRate / 1000));
  const safeRatio = Math.max(1, ratio);

  const gain = new Float32Array(length);
  let envelope = 0;

  for (let i = 0; i < length; i++) {
    // Stereo-linked detector: max of channel magnitudes
    let inputAbs = 0;
    for (let ch = 0; ch < numCh; ch++) {
      const a = Math.abs(bandChannels[ch][i]);
      if (a > inputAbs) inputAbs = a;
    }

    if (inputAbs > envelope) {
      envelope = attackCoef * envelope + (1 - attackCoef) * inputAbs;
    } else {
      envelope = releaseCoef * envelope + (1 - releaseCoef) * inputAbs;
    }

    if (envelope > thresholdLin) {
      const overDB = 20 * Math.log10(envelope / thresholdLin);
      const reductionDB = overDB * (1 - 1 / safeRatio);
      gain[i] = Math.pow(10, -reductionDB / 20);
    } else {
      gain[i] = 1;
    }
  }

  return gain;
}

/**
 * Apply 4-band multiband compression to an AudioBuffer (in-place).
 *
 * @param {AudioBuffer} buffer - Input buffer (main thread or worker polyfill)
 * @param {Object} options
 * @param {Object} options.bands - Per-band settings keyed low/lowMid/highMid/high,
 *   each { threshold(dB), ratio, attack(ms), release(ms), makeup(dB) }
 * @param {number[]} [options.crossovers] - Crossover frequencies [f1, f2, f3]
 * @param {Function} [onProgress] - Progress callback (0-1)
 * @returns {AudioBuffer} The same buffer, compressed
 */
export function applyMultiband4(buffer, options = {}, onProgress = null) {
  const bands = { ...MULTIBAND4_DEFAULTS.bands, ...(options.bands || {}) };
  const crossovers = options.crossovers || MULTIBAND4_CROSSOVERS;
  const sampleRate = buffer.sampleRate;
  const numCh = buffer.numberOfChannels;
  const length = buffer.length;

  // Split every channel into bands: bandData[bandIdx][chIdx] = Float32Array
  const bandData = [[], [], [], []];
  for (let ch = 0; ch < numCh; ch++) {
    const split = splitBands4(buffer.getChannelData(ch), sampleRate, crossovers);
    for (let b = 0; b < 4; b++) bandData[b].push(split[b]);
    if (onProgress) onProgress(0.4 * (ch + 1) / numCh);
  }

  // Compress each band with a linked sidechain, then sum back
  const outputs = [];
  for (let ch = 0; ch < numCh; ch++) outputs.push(new Float32Array(length));

  MULTIBAND4_BAND_KEYS.forEach((key, b) => {
    const settings = bands[key] || {};
    const gainCurve = computeBandGain(bandData[b], sampleRate, settings);
    const makeupLin = Math.pow(10, (settings.makeup || 0) / 20);

    for (let ch = 0; ch < numCh; ch++) {
      const src = bandData[b][ch];
      const dst = outputs[ch];
      for (let i = 0; i < length; i++) {
        dst[i] += src[i] * gainCurve[i] * makeupLin;
      }
    }
    if (onProgress) onProgress(0.4 + 0.6 * (b + 1) / 4);
  });

  for (let ch = 0; ch < numCh; ch++) {
    buffer.getChannelData(ch).set(outputs[ch]);
  }

  return buffer;
}
