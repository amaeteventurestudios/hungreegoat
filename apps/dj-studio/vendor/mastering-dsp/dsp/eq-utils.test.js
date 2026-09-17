import { describe, it, expect } from 'vitest';
import { applyEqBandToBuffer, calcEqBandCoeffs } from './utils.js';

// Minimal AudioBuffer stand-in (same shape as the worker polyfill)
class FakeBuffer {
  constructor(numberOfChannels, length, sampleRate) {
    this.numberOfChannels = numberOfChannels;
    this.length = length;
    this.sampleRate = sampleRate;
    this.duration = length / sampleRate;
    this._ch = Array.from({ length: numberOfChannels }, () => new Float32Array(length));
  }
  getChannelData(i) { return this._ch[i]; }
}

function makeSine(freq, sampleRate, seconds) {
  const buf = new FakeBuffer(2, Math.floor(sampleRate * seconds), sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < d.length; i++) {
      d[i] = Math.sin(2 * Math.PI * freq * i / sampleRate) * 0.5;
    }
  }
  return buf;
}

function rms(data, skip = 4800) {
  let sum = 0;
  let n = 0;
  for (let i = skip; i < data.length; i++) { sum += data[i] * data[i]; n++; }
  return Math.sqrt(sum / n);
}

describe('applyEqBandToBuffer', () => {
  it('boosts a peaking band at its center frequency', () => {
    const buf = makeSine(1000, 48000, 1);
    const before = rms(buf.getChannelData(0));
    applyEqBandToBuffer(buf, 'peaking', 1000, 6, 1.0);
    const after = rms(buf.getChannelData(0));
    const gainDb = 20 * Math.log10(after / before);
    expect(gainDb).toBeGreaterThan(5.5);
    expect(gainDb).toBeLessThan(6.5);
  });

  it('leaves far-away frequencies mostly untouched', () => {
    const buf = makeSine(100, 48000, 1);
    const before = rms(buf.getChannelData(0));
    applyEqBandToBuffer(buf, 'peaking', 8000, 12, 2.0);
    const after = rms(buf.getChannelData(0));
    const gainDb = 20 * Math.log10(after / before);
    expect(Math.abs(gainDb)).toBeLessThan(0.5);
  });

  it('cuts with a low shelf below the corner', () => {
    const buf = makeSine(60, 48000, 1);
    const before = rms(buf.getChannelData(0));
    applyEqBandToBuffer(buf, 'lowshelf', 200, -9, 0.707);
    const after = rms(buf.getChannelData(0));
    const gainDb = 20 * Math.log10(after / before);
    expect(gainDb).toBeLessThan(-7);
  });

  it('produces stable, finite coefficients for all band types', () => {
    for (const type of ['lowshelf', 'highshelf', 'peaking', 'highpass', 'lowpass']) {
      const c = calcEqBandCoeffs(type, 48000, 1000, 3, 1.0);
      for (const v of Object.values(c)) expect(Number.isFinite(v)).toBe(true);
    }
  });
});
