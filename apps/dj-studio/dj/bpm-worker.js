// bpm-worker.js — Web Worker for BPM and key detection
// Offloads CPU-intensive audio analysis from the main thread

self.onmessage = function(e) {
    const { type, channelData, sampleRate } = e.data;
    if (type === 'analyze') {
        try {
            const bpm = detectBPM(channelData, sampleRate);
            const key = detectKey(channelData, sampleRate);
            self.postMessage({ type: 'result', bpm, key });
        } catch (err) {
            self.postMessage({ type: 'error', message: err.message });
        }
    }
};

function detectBPM(data, sampleRate) {
    const downsampleFactor = 4;
    const downsampled = new Float32Array(Math.floor(data.length / downsampleFactor));
    for (let i = 0; i < downsampled.length; i++) {
        downsampled[i] = data[i * downsampleFactor];
    }
    const effectiveRate = sampleRate / downsampleFactor;

    const filtered = lowPassFilter(downsampled, effectiveRate, 150);

    const windowSize = Math.floor(effectiveRate * 0.01);
    const energy = [];
    for (let i = 0; i < filtered.length - windowSize; i += windowSize) {
        let sum = 0;
        for (let j = 0; j < windowSize; j++) {
            sum += filtered[i + j] * filtered[i + j];
        }
        energy.push(sum / windowSize);
    }

    const onsets = [];
    for (let i = 1; i < energy.length; i++) {
        onsets.push(Math.max(0, energy[i] - energy[i - 1]));
    }

    const minBPM = 60;
    const maxBPM = 200;
    const energyRate = effectiveRate / windowSize;
    const minLag = Math.floor(energyRate * 60 / maxBPM);
    const maxLag = Math.floor(energyRate * 60 / minBPM);

    let bestLag = minLag;
    let bestCorr = -Infinity;

    for (let lag = minLag; lag <= maxLag && lag < onsets.length; lag++) {
        let corr = 0;
        const len = Math.min(onsets.length - lag, 1000);
        for (let i = 0; i < len; i++) {
            corr += onsets[i] * onsets[i + lag];
        }
        if (corr > bestCorr) {
            bestCorr = corr;
            bestLag = lag;
        }
    }

    let bpm = Math.round(energyRate * 60 / bestLag);
    while (bpm > 180) bpm /= 2;
    while (bpm < 60) bpm *= 2;
    return Math.round(bpm * 10) / 10;
}

function lowPassFilter(data, sampleRate, cutoff) {
    const rc = 1.0 / (cutoff * 2 * Math.PI);
    const dt = 1.0 / sampleRate;
    const alpha = dt / (rc + dt);
    const filtered = new Float32Array(data.length);
    filtered[0] = data[0];
    for (let i = 1; i < data.length; i++) {
        filtered[i] = filtered[i - 1] + alpha * (data[i] - filtered[i - 1]);
    }
    return filtered;
}

function detectKey(data, sampleRate) {
    const startSample = Math.floor(data.length * 0.3);
    const endSample = Math.min(startSample + sampleRate * 30, data.length);
    const segment = data.slice(startSample, endSample);

    const chromagram = new Float32Array(12);
    const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

    for (let note = 0; note < 12; note++) {
        let energy = 0;
        for (let octave = 2; octave <= 6; octave++) {
            const freq = 440 * Math.pow(2, (note - 9 + (octave - 4) * 12) / 12);
            energy += goertzel(segment, sampleRate, freq);
        }
        chromagram[note] = energy;
    }

    const maxEnergy = Math.max(...chromagram);
    if (maxEnergy > 0) {
        for (let i = 0; i < 12; i++) chromagram[i] /= maxEnergy;
    }

    const majorProfile = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
    const minorProfile = [6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];

    let bestKey = 'C';
    let bestCorr = -Infinity;

    for (let shift = 0; shift < 12; shift++) {
        let corrMajor = 0;
        let corrMinor = 0;
        for (let i = 0; i < 12; i++) {
            const ci = (i + shift) % 12;
            corrMajor += chromagram[ci] * majorProfile[i];
            corrMinor += chromagram[ci] * minorProfile[i];
        }
        if (corrMajor > bestCorr) {
            bestCorr = corrMajor;
            bestKey = noteNames[shift];
        }
        if (corrMinor > bestCorr) {
            bestCorr = corrMinor;
            bestKey = noteNames[shift] + 'm';
        }
    }

    return bestKey;
}

function goertzel(data, sampleRate, targetFreq) {
    const numSamples = Math.min(data.length, sampleRate * 2);
    const k = Math.round(numSamples * targetFreq / sampleRate);
    const w = 2 * Math.PI * k / numSamples;
    const coeff = 2 * Math.cos(w);
    let s0 = 0, s1 = 0, s2 = 0;

    for (let i = 0; i < numSamples; i++) {
        s0 = data[i] + coeff * s1 - s2;
        s2 = s1;
        s1 = s0;
    }

    return Math.sqrt(s1 * s1 + s2 * s2 - coeff * s1 * s2);
}
