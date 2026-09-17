import { describe, it, expect } from 'vitest';
import { applyMidSideEQ, msEqIsActive } from './ms-eq.js';
import { applyMultiband4, splitBands4 } from './multiband4.js';
import { computeTonalCurve, computeMatchEQ, applyMatchEQ } from './reference-match.js';

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

function stereoSine(freq, sampleRate, seconds, { midAmp = 0.4, sideAmp = 0 } = {}) {
  const buf = new FakeBuffer(2, Math.floor(sampleRate * seconds), sampleRate);
  const l = buf.getChannelData(0);
  const r = buf.getChannelData(1);
  for (let i = 0; i < l.length; i++) {
    const mid = Math.sin(2 * Math.PI * freq * i / sampleRate) * midAmp;
    const side = Math.sin(2 * Math.PI * freq * 1.5 * i / sampleRate) * sideAmp;
    l[i] = mid + side;
    r[i] = mid - side;
  }
  return buf;
}

function rms(data, skip = 4800) {
  let sum = 0, n = 0;
  for (let i = skip; i < data.length; i++) { sum += data[i] * data[i]; n++; }
  return Math.sqrt(sum / n);
}

describe('applyMidSideEQ', () => {
  it('reports inactive for all-zero settings', () => {
    expect(msEqIsActive({ midLow: 0, sideHigh: 0 })).toBe(false);
    expect(msEqIsActive({ midLow: 2 })).toBe(true);
  });

  it('boosting mid low raises a centered low sine without touching side', () => {
    const buf = stereoSine(80, 48000, 1, { midAmp: 0.4, sideAmp: 0.1 });
    // side content is at 120Hz (1.5x)
    const sideBefore = new Float32Array(buf.length);
    for (let i = 0; i < buf.length; i++) {
      sideBefore[i] = (buf.getChannelData(0)[i] - buf.getChannelData(1)[i]) * 0.5;
    }
    applyMidSideEQ(buf, { midLow: 6, midMid: 0, midHigh: 0, sideLow: 0, sideMid: 0, sideHigh: 0 });
    const mid = new Float32Array(buf.length);
    const side = new Float32Array(buf.length);
    for (let i = 0; i < buf.length; i++) {
      mid[i] = (buf.getChannelData(0)[i] + buf.getChannelData(1)[i]) * 0.5;
      side[i] = (buf.getChannelData(0)[i] - buf.getChannelData(1)[i]) * 0.5;
    }
    const midGainDb = 20 * Math.log10(rms(mid) / 0.4 * Math.SQRT2); // sine rms = amp/sqrt2
    expect(midGainDb).toBeGreaterThan(4.5); // ~6dB shelf boost at 80Hz below 120Hz corner
    // Side signal untouched (within numeric noise)
    const sideDelta = 20 * Math.log10(rms(side) / rms(sideBefore));
    expect(Math.abs(sideDelta)).toBeLessThan(0.2);
  });

  it('cutting side lows narrows low-frequency stereo content', () => {
    const buf = stereoSine(60, 48000, 1, { midAmp: 0.2, sideAmp: 0.2 });
    const sideBefore = 0.2 / Math.SQRT2;
    applyMidSideEQ(buf, { midLow: 0, midMid: 0, midHigh: 0, sideLow: -12, sideMid: 0, sideHigh: 0 });
    const side = new Float32Array(buf.length);
    for (let i = 0; i < buf.length; i++) {
      side[i] = (buf.getChannelData(0)[i] - buf.getChannelData(1)[i]) * 0.5;
    }
    // side content at 90Hz cut by low shelf -12dB
    const sideDelta = 20 * Math.log10(rms(side) / sideBefore);
    expect(sideDelta).toBeLessThan(-8);
  });
});

describe('multiband4', () => {
  it('splits bands that sum approximately back to the input', () => {
    const sr = 48000;
    const n = sr;
    const input = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      input[i] =
        Math.sin(2 * Math.PI * 60 * i / sr) * 0.2 +
        Math.sin(2 * Math.PI * 400 * i / sr) * 0.2 +
        Math.sin(2 * Math.PI * 2000 * i / sr) * 0.2 +
        Math.sin(2 * Math.PI * 9000 * i / sr) * 0.2;
    }
    const bands = splitBands4(input, sr);
    const sum = new Float32Array(n);
    for (const b of bands) for (let i = 0; i < n; i++) sum[i] += b[i];
    // LR4 crossovers are allpass-summing: magnitude preserved within ~1 dB
    const delta = 20 * Math.log10(rms(sum) / rms(input));
    expect(Math.abs(delta)).toBeLessThan(1);
  });

  it('compresses a hot band and leaves quiet bands alone', () => {
    const sr = 48000;
    const buf = new FakeBuffer(2, sr, sr);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < d.length; i++) {
        d[i] = Math.sin(2 * Math.PI * 60 * i / sr) * 0.8 +      // loud low band
          Math.sin(2 * Math.PI * 2000 * i / sr) * 0.02;    // quiet high-mid
      }
    }
    const lowBefore = rms(buf.getChannelData(0));
    applyMultiband4(buf, {
      bands: {
        low: { threshold: -20, ratio: 4, attack: 5, release: 80, makeup: 0 },
        lowMid: { threshold: 0, ratio: 1, attack: 20, release: 100, makeup: 0 },
        highMid: { threshold: 0, ratio: 1, attack: 20, release: 100, makeup: 0 },
        high: { threshold: 0, ratio: 1, attack: 20, release: 100, makeup: 0 }
      }
    });
    const after = rms(buf.getChannelData(0));
    const deltaDb = 20 * Math.log10(after / lowBefore);
    // 0.8 sine ≈ -4.9dBFS env; ~15dB over threshold at 4:1 → ~11dB reduction expected on the low band
    expect(deltaDb).toBeLessThan(-6);
  });
});

describe('reference matching', () => {
  it('derives corrective EQ pulling a dark source toward a bright reference', () => {
    const sr = 44100;
    const seconds = 3;
    const make = (brightAmp) => {
      const buf = new FakeBuffer(2, sr * seconds, sr);
      for (let ch = 0; ch < 2; ch++) {
        const d = buf.getChannelData(ch);
        for (let i = 0; i < d.length; i++) {
          d[i] = Math.sin(2 * Math.PI * 100 * i / sr) * 0.3 +
            Math.sin(2 * Math.PI * 8000 * i / sr) * brightAmp;
        }
      }
      return buf;
    };
    const dark = make(0.02);
    const bright = make(0.3);

    const sourceCurve = computeTonalCurve(dark);
    const refCurve = computeTonalCurve(bright);
    const bands = computeMatchEQ(sourceCurve, refCurve);

    expect(bands.length).toBeGreaterThan(0);
    const band8k = bands.find(b => b.freq === 6300 || b.freq === 10000);
    const band100 = bands.find(b => b.freq === 100);
    // Should boost highs and (relatively) cut lows
    expect(band8k.gain).toBeGreaterThan(1);
    expect(band100.gain).toBeLessThan(0);

    // Applying the match EQ raises high-frequency content of the dark track
    const highBandBefore = computeTonalCurve(dark).find(b => b.freq === 10000).db;
    applyMatchEQ(dark, bands, 100);
    const highBandAfter = computeTonalCurve(dark).find(b => b.freq === 10000).db;
    expect(highBandAfter).toBeGreaterThan(highBandBefore + 1);
  });

  it('returns empty corrections for mismatched curves', () => {
    expect(computeMatchEQ(null, null)).toEqual([]);
    expect(computeMatchEQ([{ freq: 100, db: 0 }], [])).toEqual([]);
  });
});
