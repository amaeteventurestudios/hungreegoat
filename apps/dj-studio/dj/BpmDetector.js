// BpmDetector.js — Auto BPM and key detection from audio
// Uses onset detection + autocorrelation for BPM
// Uses chromagram analysis for key detection

export class BpmDetector {
    constructor(audioRouter) {
        this.ctx = audioRouter.getAudioContext();
        this._cache = {}; // trackId → { bpm, key }
        this._dbReady = false;
        this._db = null;
        this._worker = null;
        this._openDB();
        this._initWorker();
    }

    _initWorker() {
        try {
            this._worker = new Worker('dj/bpm-worker.js');
        } catch (e) {
            console.warn('[BpmDetector] Web Worker not available, using main thread fallback');
            this._worker = null;
        }
    }

    _analyzeInWorker(audioBuffer) {
        return new Promise((resolve, reject) => {
            if (!this._worker) { reject(new Error('No worker')); return; }
            const channelData = audioBuffer.getChannelData(0);
            const copy = new Float32Array(channelData);
            this._worker.onmessage = (e) => {
                if (e.data.type === 'result') resolve({ bpm: e.data.bpm, key: e.data.key });
                else if (e.data.type === 'error') reject(new Error(e.data.message));
            };
            this._worker.postMessage({ type: 'analyze', channelData: copy, sampleRate: audioBuffer.sampleRate }, [copy.buffer]);
        });
    }

    async _openDB() {
        return new Promise((resolve) => {
            const req = indexedDB.open('aurdour-analysis', 1);
            req.onupgradeneeded = (e) => {
                const db = e.target.result;
                if (!db.objectStoreNames.contains('analysis')) {
                    db.createObjectStore('analysis', { keyPath: 'id' });
                }
            };
            req.onsuccess = (e) => {
                this._db = e.target.result;
                this._dbReady = true;
                resolve();
            };
            req.onerror = () => resolve();
        });
    }

    async _getFromDB(trackId) {
        if (!this._db) return null;
        return new Promise((resolve) => {
            const tx = this._db.transaction('analysis', 'readonly');
            const store = tx.objectStore('analysis');
            const req = store.get(trackId);
            req.onsuccess = () => resolve(req.result || null);
            req.onerror = () => resolve(null);
        });
    }

    async _saveToDB(trackId, data) {
        if (!this._db) return;
        const tx = this._db.transaction('analysis', 'readwrite');
        const store = tx.objectStore('analysis');
        store.put({ id: trackId, ...data });
    }

    // Analyze an audio buffer for BPM and key
    async analyze(audioUrl, trackId) {
        // Check cache
        if (this._cache[trackId]) return this._cache[trackId];

        // Check IndexedDB
        const cached = await this._getFromDB(trackId);
        if (cached) {
            this._cache[trackId] = { bpm: cached.bpm, key: cached.key };
            return this._cache[trackId];
        }

        try {
            const response = await fetch(audioUrl);
            const arrayBuffer = await response.arrayBuffer();
            const audioBuffer = await this.ctx.decodeAudioData(arrayBuffer);

            let result;
            try {
                // Try Web Worker first (non-blocking)
                result = await this._analyzeInWorker(audioBuffer);
            } catch (_) {
                // Fallback to main thread
                const bpm = this._detectBPM(audioBuffer);
                const key = this._detectKey(audioBuffer);
                result = { bpm, key };
            }

            this._cache[trackId] = result;
            await this._saveToDB(trackId, result);

            return result;
        } catch (e) {
            console.warn('Audio analysis failed:', e);
            return { bpm: null, key: null };
        }
    }

    _detectBPM(audioBuffer) {
        const data = audioBuffer.getChannelData(0);
        const sampleRate = audioBuffer.sampleRate;

        // Downsample for efficiency
        const downsampleFactor = 4;
        const downsampled = new Float32Array(Math.floor(data.length / downsampleFactor));
        for (let i = 0; i < downsampled.length; i++) {
            downsampled[i] = data[i * downsampleFactor];
        }
        const effectiveRate = sampleRate / downsampleFactor;

        // Low-pass filter emphasis (energy in bass range)
        const filtered = this._lowPassFilter(downsampled, effectiveRate, 150);

        // Energy envelope
        const windowSize = Math.floor(effectiveRate * 0.01); // 10ms windows
        const energy = [];
        for (let i = 0; i < filtered.length - windowSize; i += windowSize) {
            let sum = 0;
            for (let j = 0; j < windowSize; j++) {
                sum += filtered[i + j] * filtered[i + j];
            }
            energy.push(sum / windowSize);
        }

        // Onset detection (difference of energy)
        const onsets = [];
        for (let i = 1; i < energy.length; i++) {
            onsets.push(Math.max(0, energy[i] - energy[i - 1]));
        }

        // Autocorrelation on onset signal
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

        // Normalize to 60-180 range
        while (bpm > 180) bpm /= 2;
        while (bpm < 60) bpm *= 2;

        return Math.round(bpm * 10) / 10;
    }

    _lowPassFilter(data, sampleRate, cutoff) {
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

    _detectKey(audioBuffer) {
        const data = audioBuffer.getChannelData(0);
        const sampleRate = audioBuffer.sampleRate;

        // Take 30 seconds from the middle of the track for analysis
        const startSample = Math.floor(data.length * 0.3);
        const endSample = Math.min(startSample + sampleRate * 30, data.length);
        const segment = data.slice(startSample, endSample);

        // Compute chromagram using DFT at each pitch frequency
        const chromagram = new Float32Array(12);
        const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

        for (let note = 0; note < 12; note++) {
            let energy = 0;
            // Sum energy across octaves (2-6)
            for (let octave = 2; octave <= 6; octave++) {
                const freq = 440 * Math.pow(2, (note - 9 + (octave - 4) * 12) / 12);
                energy += this._goertzel(segment, sampleRate, freq);
            }
            chromagram[note] = energy;
        }

        // Normalize
        const maxEnergy = Math.max(...chromagram);
        if (maxEnergy > 0) {
            for (let i = 0; i < 12; i++) chromagram[i] /= maxEnergy;
        }

        // Krumhansl-Kessler key profiles
        const majorProfile = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
        const minorProfile = [6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];

        let bestKey = 'C';
        let bestCorr = -Infinity;

        for (let shift = 0; shift < 12; shift++) {
            // Major correlation
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

    _goertzel(data, sampleRate, targetFreq) {
        const numSamples = Math.min(data.length, sampleRate * 2); // max 2 seconds
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
}
