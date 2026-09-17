/**
 * Reference Track Matching
 * Computes a long-term average tonal curve (Welch-style averaged FFT) for a
 * track, compares it against a reference track's curve, and derives a bank
 * of gentle peaking-EQ corrections that pull the source toward the
 * reference's tonal balance. Loudness is intentionally NOT matched here —
 * only spectral shape (the delta is mean-normalized).
 */

import { FFTProcessor } from './fft.js';
import { applyEqBandToBuffer } from './utils.js';

export const MATCH_BANDS = [
  40, 63, 100, 160, 250, 400, 630, 1000, 1600, 2500, 4000, 6300, 10000, 16000
];

export const REF_MATCH_DEFAULTS = {
  enabled: false,
  amount: 50, // percent
  maxAdjustDb: 6
};

const FFT_SIZE = 4096;
const MAX_FRAMES = 120;

/**
 * Compute the long-term average tonal curve of an AudioBuffer.
 * @param {AudioBuffer} buffer
 * @returns {{freq: number, db: number}[]} Average band energies in dB (relative)
 */
export function computeTonalCurve(buffer) {
  const sampleRate = buffer.sampleRate;
  const length = buffer.length;
  const numCh = buffer.numberOfChannels;
  const processor = new FFTProcessor(FFT_SIZE);
  const half = FFT_SIZE / 2;

  // Mono mix analysis frames spread across the track
  const numFrames = Math.max(1, Math.min(MAX_FRAMES, Math.floor(length / FFT_SIZE)));
  const hop = Math.max(FFT_SIZE, Math.floor((length - FFT_SIZE) / numFrames));

  const power = new Float64Array(half);
  const frame = new Float32Array(FFT_SIZE);
  const channels = [];
  for (let ch = 0; ch < numCh; ch++) channels.push(buffer.getChannelData(ch));

  let framesUsed = 0;
  for (let start = 0; start + FFT_SIZE <= length && framesUsed < numFrames; start += hop) {
    // Mono mix + silence gate
    let energy = 0;
    for (let i = 0; i < FFT_SIZE; i++) {
      let s = 0;
      for (let ch = 0; ch < numCh; ch++) s += channels[ch][start + i];
      s /= numCh;
      frame[i] = s;
      energy += s * s;
    }
    if (energy / FFT_SIZE < 1e-8) continue; // skip near-silent frames

    const spectrum = processor.forward(frame);
    for (let bin = 0; bin < half; bin++) {
      const re = spectrum[bin * 2];
      const im = spectrum[bin * 2 + 1];
      power[bin] += re * re + im * im;
    }
    framesUsed++;
  }

  if (framesUsed === 0) {
    return MATCH_BANDS.map(freq => ({ freq, db: 0 }));
  }

  // Aggregate bins into log-spaced bands (geometric mean edges)
  return MATCH_BANDS.map((freq, i) => {
    const lo = i === 0 ? freq / 1.6 : Math.sqrt(MATCH_BANDS[i - 1] * freq);
    const hi = i === MATCH_BANDS.length - 1 ? freq * 1.6 : Math.sqrt(freq * MATCH_BANDS[i + 1]);
    const binLo = Math.max(1, Math.floor(lo * FFT_SIZE / sampleRate));
    const binHi = Math.min(half - 1, Math.ceil(hi * FFT_SIZE / sampleRate));

    let sum = 0;
    let count = 0;
    for (let bin = binLo; bin <= binHi; bin++) {
      sum += power[bin];
      count++;
    }
    const mean = count > 0 ? sum / (count * framesUsed) : 1e-20;
    return { freq, db: 10 * Math.log10(mean + 1e-20) };
  });
}

/**
 * Compute match-EQ bands from source and reference tonal curves.
 * The delta is mean-normalized (tonal shape only, not level) and clamped.
 *
 * @param {{freq, db}[]} sourceCurve
 * @param {{freq, db}[]} referenceCurve
 * @param {Object} options - { maxAdjustDb }
 * @returns {{freq: number, gain: number, Q: number}[]} Peaking corrections
 */
export function computeMatchEQ(sourceCurve, referenceCurve, options = {}) {
  const maxAdjust = options.maxAdjustDb ?? REF_MATCH_DEFAULTS.maxAdjustDb;
  if (!sourceCurve || !referenceCurve || sourceCurve.length !== referenceCurve.length) {
    return [];
  }

  const deltas = sourceCurve.map((pt, i) => referenceCurve[i].db - pt.db);
  const meanDelta = deltas.reduce((a, b) => a + b, 0) / deltas.length;

  // Smooth deltas across neighboring bands (simple 3-tap) to avoid comb-like EQ
  const smoothed = deltas.map((d, i) => {
    const prev = deltas[i - 1] ?? d;
    const next = deltas[i + 1] ?? d;
    return prev * 0.25 + d * 0.5 + next * 0.25;
  });

  return sourceCurve.map((pt, i) => {
    const gain = Math.max(-maxAdjust, Math.min(maxAdjust, smoothed[i] - meanDelta));
    return { freq: pt.freq, gain, Q: 1.6 };
  });
}

/**
 * Apply match-EQ corrections to a buffer (in-place), scaled by amount.
 *
 * @param {AudioBuffer} buffer
 * @param {{freq, gain, Q}[]} bands - From computeMatchEQ (possibly via settings)
 * @param {number} amount - 0-100 percent strength
 * @returns {AudioBuffer}
 */
export function applyMatchEQ(buffer, bands, amount = 50) {
  if (!bands || bands.length === 0 || amount <= 0) return buffer;
  const scale = Math.max(0, Math.min(1, amount / 100));

  let out = buffer;
  for (const band of bands) {
    const gain = (Number(band.gain) || 0) * scale;
    if (Math.abs(gain) > 0.05) {
      out = applyEqBandToBuffer(out, 'peaking', band.freq, gain, band.Q || 1.6);
    }
  }
  return out;
}
