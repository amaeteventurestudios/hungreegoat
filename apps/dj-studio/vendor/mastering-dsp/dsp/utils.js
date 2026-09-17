/**
 * DSP Utility Functions
 * Biquad filter implementations and coefficient calculators
 */

/**
 * Apply biquad filter to audio samples
 * @param {Float32Array} samples - Input samples
 * @param {Object} coeffs - Filter coefficients {b0, b1, b2, a1, a2}
 * @returns {Float32Array} Filtered output samples
 */
export function applyBiquadFilter(samples, coeffs) {
  const output = new Float32Array(samples.length);
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  const { b0, b1, b2, a1, a2 } = coeffs;

  for (let i = 0; i < samples.length; i++) {
    const x0 = samples[i];
    const y0 = b0 * x0 + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
    output[i] = y0;
    x2 = x1; x1 = x0;
    y2 = y1; y1 = y0;
  }
  return output;
}

/**
 * Calculate biquad coefficients for high shelf filter (K-weighting)
 * @param {number} sampleRate - Sample rate in Hz
 * @param {number} frequency - Center frequency in Hz
 * @param {number} gainDB - Gain in dB
 * @param {number} Q - Q factor
 * @returns {Object} Biquad coefficients {b0, b1, b2, a1, a2}
 */
export function calcHighShelfCoeffs(sampleRate, frequency, gainDB, Q) {
  const A = Math.pow(10, gainDB / 40);
  const w0 = 2 * Math.PI * frequency / sampleRate;
  const cosW0 = Math.cos(w0);
  const sinW0 = Math.sin(w0);
  const alpha = sinW0 / (2 * Q);

  const b0 = A * ((A + 1) + (A - 1) * cosW0 + 2 * Math.sqrt(A) * alpha);
  const b1 = -2 * A * ((A - 1) + (A + 1) * cosW0);
  const b2 = A * ((A + 1) + (A - 1) * cosW0 - 2 * Math.sqrt(A) * alpha);
  const a0 = (A + 1) - (A - 1) * cosW0 + 2 * Math.sqrt(A) * alpha;
  const a1 = 2 * ((A - 1) - (A + 1) * cosW0);
  const a2 = (A + 1) - (A - 1) * cosW0 - 2 * Math.sqrt(A) * alpha;

  return { b0: b0 / a0, b1: b1 / a0, b2: b2 / a0, a1: a1 / a0, a2: a2 / a0 };
}

/**
 * Calculate biquad coefficients for high pass filter (K-weighting)
 * @param {number} sampleRate - Sample rate in Hz
 * @param {number} frequency - Cutoff frequency in Hz
 * @param {number} Q - Q factor
 * @returns {Object} Biquad coefficients {b0, b1, b2, a1, a2}
 */
export function calcHighPassCoeffs(sampleRate, frequency, Q) {
  const w0 = 2 * Math.PI * frequency / sampleRate;
  const cosW0 = Math.cos(w0);
  const sinW0 = Math.sin(w0);
  const alpha = sinW0 / (2 * Q);

  const b0 = (1 + cosW0) / 2;
  const b1 = -(1 + cosW0);
  const b2 = (1 + cosW0) / 2;
  const a0 = 1 + alpha;
  const a1 = -2 * cosW0;
  const a2 = 1 - alpha;

  return { b0: b0 / a0, b1: b1 / a0, b2: b2 / a0, a1: a1 / a0, a2: a2 / a0 };
}

/**
 * Calculate biquad coefficients for a peaking (bell) filter
 * @param {number} sampleRate - Sample rate in Hz
 * @param {number} frequency - Center frequency in Hz
 * @param {number} gainDB - Gain in dB
 * @param {number} Q - Q factor
 * @returns {Object} Biquad coefficients {b0, b1, b2, a1, a2}
 */
export function calcPeakingCoeffs(sampleRate, frequency, gainDB, Q) {
  const A = Math.pow(10, gainDB / 40);
  const w0 = 2 * Math.PI * frequency / sampleRate;
  const cosW0 = Math.cos(w0);
  const sinW0 = Math.sin(w0);
  const alpha = sinW0 / (2 * Q);

  const b0 = 1 + alpha * A;
  const b1 = -2 * cosW0;
  const b2 = 1 - alpha * A;
  const a0 = 1 + alpha / A;
  const a1 = -2 * cosW0;
  const a2 = 1 - alpha / A;

  return { b0: b0 / a0, b1: b1 / a0, b2: b2 / a0, a1: a1 / a0, a2: a2 / a0 };
}

/**
 * Calculate biquad coefficients for a low shelf filter
 * @param {number} sampleRate - Sample rate in Hz
 * @param {number} frequency - Corner frequency in Hz
 * @param {number} gainDB - Gain in dB
 * @param {number} Q - Q factor
 * @returns {Object} Biquad coefficients {b0, b1, b2, a1, a2}
 */
export function calcLowShelfCoeffs(sampleRate, frequency, gainDB, Q) {
  const A = Math.pow(10, gainDB / 40);
  const w0 = 2 * Math.PI * frequency / sampleRate;
  const cosW0 = Math.cos(w0);
  const sinW0 = Math.sin(w0);
  const alpha = sinW0 / (2 * Q);
  const twoSqrtAAlpha = 2 * Math.sqrt(A) * alpha;

  const b0 = A * ((A + 1) - (A - 1) * cosW0 + twoSqrtAAlpha);
  const b1 = 2 * A * ((A - 1) - (A + 1) * cosW0);
  const b2 = A * ((A + 1) - (A - 1) * cosW0 - twoSqrtAAlpha);
  const a0 = (A + 1) + (A - 1) * cosW0 + twoSqrtAAlpha;
  const a1 = -2 * ((A - 1) + (A + 1) * cosW0);
  const a2 = (A + 1) + (A - 1) * cosW0 - twoSqrtAAlpha;

  return { b0: b0 / a0, b1: b1 / a0, b2: b2 / a0, a1: a1 / a0, a2: a2 / a0 };
}

/**
 * Calculate biquad coefficients for a lowpass filter
 * @param {number} sampleRate - Sample rate in Hz
 * @param {number} frequency - Cutoff frequency in Hz
 * @param {number} Q - Q factor
 * @returns {Object} Biquad coefficients {b0, b1, b2, a1, a2}
 */
export function calcLowPassCoeffs(sampleRate, frequency, Q) {
  const w0 = 2 * Math.PI * frequency / sampleRate;
  const cosW0 = Math.cos(w0);
  const sinW0 = Math.sin(w0);
  const alpha = sinW0 / (2 * Q);

  const b0 = (1 - cosW0) / 2;
  const b1 = 1 - cosW0;
  const b2 = (1 - cosW0) / 2;
  const a0 = 1 + alpha;
  const a1 = -2 * cosW0;
  const a2 = 1 - alpha;

  return { b0: b0 / a0, b1: b1 / a0, b2: b2 / a0, a1: a1 / a0, a2: a2 / a0 };
}

/**
 * Get biquad coefficients for a named EQ band type
 * @param {'lowshelf'|'highshelf'|'peaking'|'highpass'|'lowpass'} type
 * @param {number} sampleRate - Sample rate in Hz
 * @param {number} frequency - Frequency in Hz
 * @param {number} gainDB - Gain in dB (ignored for pass filters)
 * @param {number} Q - Q factor
 * @returns {Object} Biquad coefficients {b0, b1, b2, a1, a2}
 */
export function calcEqBandCoeffs(type, sampleRate, frequency, gainDB = 0, Q = 0.707) {
  switch (type) {
    case 'lowshelf': return calcLowShelfCoeffs(sampleRate, frequency, gainDB, Q);
    case 'highshelf': return calcHighShelfCoeffs(sampleRate, frequency, gainDB, Q);
    case 'peaking': return calcPeakingCoeffs(sampleRate, frequency, gainDB, Q);
    case 'highpass': return calcHighPassCoeffs(sampleRate, frequency, Q);
    case 'lowpass': return calcLowPassCoeffs(sampleRate, frequency, Q);
    default: throw new Error(`Unknown EQ band type: ${type}`);
  }
}

/**
 * Apply one EQ band to every channel of an AudioBuffer (in-place)
 * Works in both the main thread (real AudioBuffer) and the DSP worker
 * (WorkerAudioBuffer polyfill), since both expose getChannelData().
 *
 * @param {AudioBuffer} buffer - Audio buffer (mutated in-place)
 * @param {'lowshelf'|'highshelf'|'peaking'|'highpass'|'lowpass'} type
 * @param {number} frequency - Frequency in Hz
 * @param {number} gainDB - Gain in dB
 * @param {number} Q - Q factor
 * @returns {AudioBuffer} The same buffer, filtered
 */
export function applyEqBandToBuffer(buffer, type, frequency, gainDB = 0, Q = 0.707) {
  const coeffs = calcEqBandCoeffs(type, buffer.sampleRate, frequency, gainDB, Q);
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    const data = buffer.getChannelData(ch);
    const { b0, b1, b2, a1, a2 } = coeffs;
    let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
    for (let i = 0; i < data.length; i++) {
      const x0 = data[i];
      const y0 = b0 * x0 + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
      x2 = x1; x1 = x0;
      y2 = y1; y1 = y0;
      data[i] = y0;
    }
  }
  return buffer;
}

/**
 * Convert dB to linear gain
 * @param {number} db - Value in dB
 * @returns {number} Linear gain
 */
export function dbToLinear(db) {
  return Math.pow(10, db / 20);
}

/**
 * Convert linear gain to dB
 * @param {number} linear - Linear gain
 * @returns {number} Value in dB
 */
export function linearToDb(linear) {
  return linear > 0 ? 20 * Math.log10(linear) : -Infinity;
}

/**
 * Create a Hann window of specified size
 * @param {number} size - Window size
 * @returns {Float32Array} Hann window coefficients
 */
export function createHannWindow(size) {
  const window = new Float32Array(size);
  for (let i = 0; i < size; i++) {
    window[i] = 0.5 * (1 - Math.cos(2 * Math.PI * i / (size - 1)));
  }
  return window;
}

/**
 * Calculate RMS of a sample array
 * @param {Float32Array} samples - Input samples
 * @returns {number} RMS value
 */
export function calculateRMS(samples) {
  let sum = 0;
  for (let i = 0; i < samples.length; i++) {
    sum += samples[i] * samples[i];
  }
  return Math.sqrt(sum / samples.length);
}

/**
 * Find peak value in a sample array
 * @param {Float32Array} samples - Input samples
 * @returns {number} Peak absolute value
 */
export function findPeak(samples) {
  let peak = 0;
  for (let i = 0; i < samples.length; i++) {
    const abs = Math.abs(samples[i]);
    if (abs > peak) peak = abs;
  }
  return peak;
}
/**
 * Catmull-Rom interpolation
 * Useful for oversampling and true-peak detection
 *
 * @param {number} y0 - Sample at t-1
 * @param {number} y1 - Sample at t=0
 * @param {number} y2 - Sample at t=1
 * @param {number} y3 - Sample at t=2
 * @param {number} t - Interpolation factor (0 to 1)
 * @returns {number} Interpolated value
 */
export function interpolateCatmullRom(y0, y1, y2, y3, t) {
  const a0 = -0.5 * y0 + 1.5 * y1 - 1.5 * y2 + 0.5 * y3;
  const a1 = y0 - 2.5 * y1 + 2 * y2 - 0.5 * y3;
  const a2 = -0.5 * y0 + 0.5 * y2;
  const a3 = y1;

  const t2 = t * t;
  const t3 = t2 * t;

  return a0 * t3 + a1 * t2 + a2 * t + a3;
}
