/**
 * Mid/Side EQ Module
 * Three bands (low shelf 120Hz / peaking 1kHz / high shelf 8kHz) applied
 * independently to the mid (center) and side (stereo) signals.
 *
 * Classic mastering moves this enables:
 * - Tighten the low end by cutting side lows (mono-er bass)
 * - Open the mix by boosting side highs (air/width without harsh center)
 * - Bring a vocal forward with a mid boost around 1kHz
 */

import { calcEqBandCoeffs, applyBiquadFilter } from './utils.js';

export const MS_EQ_BANDS = [
  { key: 'low', type: 'lowshelf', freq: 120, Q: 0.707, label: 'Low (120Hz)' },
  { key: 'mid', type: 'peaking', freq: 1000, Q: 0.8, label: 'Mid (1kHz)' },
  { key: 'high', type: 'highshelf', freq: 8000, Q: 0.707, label: 'High (8kHz)' }
];

export const MS_EQ_DEFAULTS = {
  midLow: 0, midMid: 0, midHigh: 0,
  sideLow: 0, sideMid: 0, sideHigh: 0
};

/**
 * Whether an M/S EQ settings object does anything
 * @param {Object} msEq - { midLow, midMid, midHigh, sideLow, sideMid, sideHigh } in dB
 * @returns {boolean}
 */
export function msEqIsActive(msEq) {
  if (!msEq) return false;
  return ['midLow', 'midMid', 'midHigh', 'sideLow', 'sideMid', 'sideHigh']
    .some(k => Math.abs(Number(msEq[k]) || 0) > 0.01);
}

function applyBandsInPlace(signal, gains, sampleRate) {
  let out = signal;
  MS_EQ_BANDS.forEach((band, i) => {
    const gain = gains[i];
    if (Math.abs(gain) > 0.01) {
      const coeffs = calcEqBandCoeffs(band.type, sampleRate, band.freq, gain, band.Q);
      out = applyBiquadFilter(out, coeffs);
    }
  });
  return out;
}

/**
 * Apply mid/side EQ to a stereo AudioBuffer.
 * Mono buffers get the mid EQ only (no side signal exists).
 *
 * @param {AudioBuffer} buffer - Input buffer (main thread or worker polyfill)
 * @param {Object} msEq - Gains in dB { midLow, midMid, midHigh, sideLow, sideMid, sideHigh }
 * @returns {AudioBuffer} The same buffer with EQ applied in-place
 */
export function applyMidSideEQ(buffer, msEq) {
  if (!msEqIsActive(msEq)) return buffer;

  const sampleRate = buffer.sampleRate;
  const midGains = [msEq.midLow || 0, msEq.midMid || 0, msEq.midHigh || 0];
  const sideGains = [msEq.sideLow || 0, msEq.sideMid || 0, msEq.sideHigh || 0];

  if (buffer.numberOfChannels < 2) {
    const data = buffer.getChannelData(0);
    const processed = applyBandsInPlace(data, midGains, sampleRate);
    data.set(processed);
    return buffer;
  }

  const left = buffer.getChannelData(0);
  const right = buffer.getChannelData(1);
  const length = left.length;

  // Encode M/S
  let mid = new Float32Array(length);
  let side = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    mid[i] = (left[i] + right[i]) * 0.5;
    side[i] = (left[i] - right[i]) * 0.5;
  }

  mid = applyBandsInPlace(mid, midGains, sampleRate);
  side = applyBandsInPlace(side, sideGains, sampleRate);

  // Decode back to L/R
  for (let i = 0; i < length; i++) {
    left[i] = mid[i] + side[i];
    right[i] = mid[i] - side[i];
  }

  return buffer;
}
