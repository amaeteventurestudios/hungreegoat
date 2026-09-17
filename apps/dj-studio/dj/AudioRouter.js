// AudioRouter.js — Web Audio API graph for DJ mixing (2 or 4 decks)
// Routes: Deck Source → EQ (3-band) → Channel Gain → Crossfade Gain → Analyser → Master → Limiter → Destination
// Cue bus: Pre-fader tap from each channel → cue gain → headphone output (split cue: L=cue, R=master)
// Booth: Master → booth gain → booth output
// Also: Mic → EQ → Gain → Analyser → Master
//       System Audio → Gain → Analyser → Master
// 4-deck: Crossfader assignment — each deck assigned to A-side or B-side

export class AudioRouter {
    constructor() {
        this.ctx = new AudioContext();
        this.channels = {};
        this._sourceNodes = {};

        // ===== EQ KILL STATE =====
        this._eqKillState = { A: { high: false, mid: false, low: false }, B: { high: false, mid: false, low: false } };
        this._eqSavedGain = { A: { high: 0, mid: 0, low: 0 }, B: { high: 0, mid: 0, low: 0 } };

        // ===== FADER CURVE =====
        this.faderCurve = 'linear'; // 'linear' or 'logarithmic'

        // ===== AUTO-GAIN =====
        this.autoGainEnabled = false;

        // ===== 4-DECK MODE =====
        this.fourDeckMode = false;
        // Crossfader assignment: which side of crossfader each deck belongs to
        // Default: A,C = A-side; B,D = B-side
        this.crossfaderAssignment = { A: 'A', B: 'B', C: 'A', D: 'B' };

        ['A', 'B'].forEach(id => {
            this._createChannel(id);
        });

        // Master chain with limiter
        this._lastCrossfadePosition = 0.5;
        this.masterGain = this.ctx.createGain();
        this.masterAnalyser = this._createAnalyser();

        // ===== MASTER LIMITER =====
        this.limiter = this.ctx.createDynamicsCompressor();
        this.limiter.threshold.value = -3;   // Start limiting at -3 dB
        this.limiter.knee.value = 0;          // Hard knee for aggressive limiting
        this.limiter.ratio.value = 20;        // Near-infinite ratio = brick wall
        this.limiter.attack.value = 0.001;    // 1ms attack — catch transients
        this.limiter.release.value = 0.05;    // 50ms release — quick recovery
        this.limiterEnabled = false;
        this._limiterBypass = this.ctx.createGain(); // bypass path

        // Route: masterGain → masterAnalyser → bypass → destination
        // When limiter enabled: masterGain → masterAnalyser → limiter → destination
        this.masterGain.connect(this.masterAnalyser);
        this._limiterBypass.connect(this.ctx.destination);
        this.masterAnalyser.connect(this._limiterBypass); // default: bypass (no limiter)

        // Both channels → master
        this.channels.A.analyser.connect(this.masterGain);
        this.channels.B.analyser.connect(this.masterGain);

        // ===== BOOTH OUTPUT =====
        this.boothGain = this.ctx.createGain();
        this.boothGain.gain.value = 0.8;
        this.masterAnalyser.connect(this.boothGain);
        // boothGain connects to a separate destination if available (via setSinkId on an audio element)

        // ===== CUE / HEADPHONE BUS =====
        // Pre-fader listen: taps from before the crossfade gain
        this.cueGain = this.ctx.createGain();
        this.cueGain.gain.value = 0.8;
        this.cueMix = 0; // 0 = full cue, 1 = full master
        this.splitCue = false;

        // Cue mix: blend between cue bus and master
        this.cueMasterGain = this.ctx.createGain(); // master signal for headphones
        this.cueMasterGain.gain.value = 0;
        this.masterAnalyser.connect(this.cueMasterGain);

        // Cue output merger — combines cue + master for headphones
        this.cueOutput = this.ctx.createGain();
        this.cueGain.connect(this.cueOutput);
        this.cueMasterGain.connect(this.cueOutput);

        // Split cue: uses ChannelSplitter + ChannelMerger for true L/R split
        // Cue (mono) → left ear, Master (mono) → right ear
        this.splitMerger = this.ctx.createChannelMerger(2);
        // Mono splitters to take channel 0 from each signal
        this._cueSplitter = this.ctx.createChannelSplitter(2);
        this._masterSplitter = this.ctx.createChannelSplitter(2);
        // Mono gain nodes for clean mono-sum before split
        this._cueMonoGain = this.ctx.createGain();
        this._masterMonoGain = this.ctx.createGain();

        // Headphone output element (for setSinkId routing)
        this._headphoneAudioEl = null;
        this._headphoneStream = null;
        this._headphoneDest = this.ctx.createMediaStreamDestination();
        this.cueOutput.connect(this._headphoneDest);

        // Default: crossfader center
        this.setCrossfade(0.5);
        this.masterGain.gain.value = 0.8;

        // ===== MIC CHANNEL =====
        this.mic = {
            stream: null,
            source: null,
            eqLow: this._createEQ('lowshelf', 320),
            eqMid: this._createEQ('peaking', 1000),
            eqHigh: this._createEQ('highshelf', 3200),
            gain: this.ctx.createGain(),
            analyser: this._createAnalyser(),
            muted: true,
        };
        this.mic.eqLow.connect(this.mic.eqMid);
        this.mic.eqMid.connect(this.mic.eqHigh);
        this.mic.eqHigh.connect(this.mic.gain);
        this.mic.gain.connect(this.mic.analyser);
        this.mic.analyser.connect(this.masterGain);
        this.mic.gain.gain.value = 0;

        // ===== SYSTEM AUDIO CHANNEL =====
        this.system = {
            stream: null,
            source: null,
            gain: this.ctx.createGain(),
            analyser: this._createAnalyser(),
            active: false,
        };
        this.system.gain.connect(this.system.analyser);
        this.system.analyser.connect(this.masterGain);
        this.system.gain.gain.value = 0.8;

        // ===== CROSSFADER CURVE =====
        this.crossfaderCurve = 'equal-power'; // equal-power, linear, cut
    }

    getAudioContext() {
        return this.ctx;
    }

    async resume() {
        if (this.ctx.state === 'suspended') {
            console.log(`[AUDIO:ROUTER] Resuming AudioContext (was: ${this.ctx.state})...`);
            await this.ctx.resume();
            console.log(`[AUDIO:ROUTER] AudioContext resumed → state: ${this.ctx.state}`);
        }
    }

    // ===== DECK ROUTING =====

    connectDeckSource(deckId, audioElement) {
        // If we already have a source for this deck, check if it's the same element
        if (this._sourceNodes[deckId]) {
            // Check if this is the same audio element — if so, it's already connected
            if (this._sourceElements?.[deckId] === audioElement) return;
            // Different element — disconnect old source
            try { this._sourceNodes[deckId].disconnect(); } catch (_) {}
            delete this._sourceNodes[deckId];
        }

        // Create new source for this element
        const source = this.ctx.createMediaElementSource(audioElement);
        this._sourceNodes[deckId] = source;
        if (!this._sourceElements) this._sourceElements = {};
        this._sourceElements[deckId] = audioElement;
        source.connect(this.channels[deckId].eqLow);
    }

    // ===== PFL / CUE =====

    setPFL(deckId, enabled) {
        const ch = this.channels[deckId];
        ch.pfl = enabled;

        if (enabled) {
            // Tap from after EQ but before crossfade (pre-fader listen)
            ch.channelGain.connect(this.cueGain);
        } else {
            try {
                ch.channelGain.disconnect(this.cueGain);
            } catch (e) {}
        }
    }

    setCueMix(value) {
        // 0 = full cue, 1 = full master
        this.cueMix = value;
        this.cueGain.gain.value = 0.8 * (1 - value);
        this.cueMasterGain.gain.value = 0.8 * value;
    }

    setCueVolume(level) {
        this.cueOutput.gain.value = level;
    }

    setSplitCue(enabled) {
        this.splitCue = enabled;

        // Disconnect all cue routing
        try { this.cueOutput.disconnect(); } catch (e) {}
        try { this.cueGain.disconnect(); } catch (e) {}
        try { this.cueMasterGain.disconnect(); } catch (e) {}
        try { this.splitMerger.disconnect(); } catch (e) {}
        try { this._cueMonoGain.disconnect(); } catch (e) {}
        try { this._masterMonoGain.disconnect(); } catch (e) {}
        try { this._cueSplitter.disconnect(); } catch (e) {}
        try { this._masterSplitter.disconnect(); } catch (e) {}

        if (enabled) {
            // True split cue: left ear = cue (pre-fader), right ear = master
            // Route cue signal to mono, then to left channel of merger
            this.cueGain.connect(this._cueMonoGain);
            this._cueMonoGain.connect(this.splitMerger, 0, 0);     // cue → left ear

            // Route master signal to mono, then to right channel of merger
            this.cueMasterGain.connect(this._masterMonoGain);
            this._masterMonoGain.connect(this.splitMerger, 0, 1);  // master → right ear

            // Force cue/master mix to 50/50 in split mode so both are audible
            this.cueGain.gain.value = 0.8;
            this.cueMasterGain.gain.value = 0.8;

            this.splitMerger.connect(this._headphoneDest);
            console.log('[AUDIO:ROUTER] Split cue ENABLED — L=Cue, R=Master');
        } else {
            // Normal: cue + master mixed together in both ears
            this.cueGain.connect(this.cueOutput);
            this.cueMasterGain.connect(this.cueOutput);
            this.cueOutput.connect(this._headphoneDest);

            // Restore cue mix setting
            this.setCueMix(this.cueMix);
            console.log('[AUDIO:ROUTER] Split cue DISABLED — normal stereo mix');
        }
    }

    // Route headphone output to a specific audio device
    async setHeadphoneDevice(deviceId) {
        if (!this._headphoneAudioEl) {
            this._headphoneAudioEl = new Audio();
            this._headphoneAudioEl.srcObject = this._headphoneDest.stream;
        }

        try {
            if (this._headphoneAudioEl.setSinkId) {
                await this._headphoneAudioEl.setSinkId(deviceId);
                await this._headphoneAudioEl.play();
                return true;
            }
        } catch (e) {
            console.warn('Failed to set headphone device:', e);
        }
        return false;
    }

    // Get available audio output devices
    async getOutputDevices() {
        try {
            const devices = await navigator.mediaDevices.enumerateDevices();
            return devices.filter(d => d.kind === 'audiooutput');
        } catch (e) {
            return [];
        }
    }

    // ===== BOOTH =====

    setBoothVolume(level) {
        this.boothGain.gain.value = level;
    }

    // ===== MIC =====

    async connectMic() {
        console.log('[AUDIO:MIC] Requesting microphone access...');
        try {
            await this.resume();
            this.mic.stream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: false,
                }
            });
            const tracks = this.mic.stream.getAudioTracks();
            console.log(`[AUDIO:MIC] Mic access GRANTED — ${tracks.length} audio track(s)`);
            tracks.forEach((t, i) => console.log(`[AUDIO:MIC]   Track ${i}: "${t.label}" enabled=${t.enabled} muted=${t.muted} settings=`, t.getSettings()));
            this.mic.source = this.ctx.createMediaStreamSource(this.mic.stream);
            this.mic.source.connect(this.mic.eqLow);
            console.log('[AUDIO:MIC] Mic chain: MicSource → EQ Low → EQ Mid → EQ High → Gain → Analyser → MasterGain');
            console.log('[AUDIO:MIC] NOTE: Mic starts MUTED. Click UNMUTE or press M to hear it.');
            return true;
        } catch (err) {
            console.error('[AUDIO:MIC] Mic access DENIED:', err.name, err.message);
            return false;
        }
    }

    disconnectMic() {
        if (this.mic.source) {
            try { this.mic.source.disconnect(); } catch (e) {}
            this.mic.source = null;
        }
        if (this.mic.stream) {
            this.mic.stream.getTracks().forEach(t => t.stop());
            this.mic.stream = null;
        }
        this.mic.gain.gain.value = 0;
        this.mic.muted = true;
    }

    setMicVolume(level) {
        if (!this.mic.muted) {
            this.mic.gain.gain.value = level;
        }
    }

    setMicMute(muted) {
        this.mic.muted = muted;
        this.mic.gain.gain.value = muted ? 0 : (parseFloat(document.getElementById('mic-volume')?.value || 80) / 100);
    }

    setMicEQ(band, gainDB) {
        const key = `eq${band.charAt(0).toUpperCase() + band.slice(1)}`;
        this.mic[key].gain.value = gainDB;
    }

    getMicAnalyserData() {
        const data = new Uint8Array(this.mic.analyser.frequencyBinCount);
        this.mic.analyser.getByteFrequencyData(data);
        return data;
    }

    // ===== SYSTEM AUDIO =====

    async connectSystemAudio() {
        console.log('[AUDIO:SYSTEM] Requesting system audio capture (screen share with audio)...');
        try {
            await this.resume();
            this.system.stream = await navigator.mediaDevices.getDisplayMedia({
                video: true,
                audio: true,
            });

            this.system.stream.getVideoTracks().forEach(t => {
                console.log(`[AUDIO:SYSTEM] Stopping video track: "${t.label}"`);
                t.stop();
            });

            const audioTracks = this.system.stream.getAudioTracks();
            if (audioTracks.length === 0) {
                console.warn('[AUDIO:SYSTEM] No audio track in screen share! Make sure to check "Share audio" in the dialog.');
                return false;
            }

            console.log(`[AUDIO:SYSTEM] Got ${audioTracks.length} audio track(s):`);
            audioTracks.forEach((t, i) => console.log(`[AUDIO:SYSTEM]   Track ${i}: "${t.label}" enabled=${t.enabled}`));

            const audioStream = new MediaStream(audioTracks);
            this.system.source = this.ctx.createMediaStreamSource(audioStream);
            this.system.source.connect(this.system.gain);
            this.system.active = true;
            console.log('[AUDIO:SYSTEM] System audio chain: SystemSource → Gain → Analyser → MasterGain → Destination');
            console.log('[AUDIO:SYSTEM] System audio capture ACTIVE');

            audioTracks[0].onended = () => {
                console.log('[AUDIO:SYSTEM] Audio track ended — disconnecting');
                this.disconnectSystemAudio();
            };

            return true;
        } catch (err) {
            console.error('[AUDIO:SYSTEM] System audio capture FAILED:', err.name, err.message);
            return false;
        }
    }

    disconnectSystemAudio() {
        if (this.system.source) {
            try { this.system.source.disconnect(); } catch (e) {}
            this.system.source = null;
        }
        if (this.system.stream) {
            this.system.stream.getTracks().forEach(t => t.stop());
            this.system.stream = null;
        }
        this.system.active = false;
    }

    setSystemVolume(level) {
        this.system.gain.gain.value = level;
    }

    getSystemAnalyserData() {
        const data = new Uint8Array(this.system.analyser.frequencyBinCount);
        this.system.analyser.getByteFrequencyData(data);
        return data;
    }

    // ===== CROSSFADER =====

    setCrossfade(position) {
        this._lastCrossfadePosition = position;
        let gainA, gainB;

        switch (this.crossfaderCurve) {
            case 'linear':
                gainA = 1 - position;
                gainB = position;
                break;
            case 'cut':
                // Hard cut: full volume until very end
                gainA = position < 0.95 ? 1 : (1 - position) * 20;
                gainB = position > 0.05 ? 1 : position * 20;
                break;
            case 'equal-power':
            default:
                gainA = Math.cos(position * Math.PI / 2);
                gainB = Math.sin(position * Math.PI / 2);
                break;
        }

        // Apply crossfade gain to all active channels based on their assignment
        const allDecks = this.fourDeckMode ? ['A', 'B', 'C', 'D'] : ['A', 'B'];
        allDecks.forEach(deckId => {
            if (!this.channels[deckId]) return;
            const side = this.crossfaderAssignment[deckId] || (deckId === 'B' || deckId === 'D' ? 'B' : 'A');
            this.channels[deckId].crossfadeGain.gain.value = (side === 'A') ? gainA : gainB;
        });
    }

    setCrossfaderCurve(curve) {
        this.crossfaderCurve = curve;
        // Re-apply current crossfader position
        const cf = document.getElementById('crossfader');
        if (cf) this.setCrossfade(cf.value / 100);
    }

    // ===== 4-DECK MODE =====

    _createChannel(id) {
        // DJ-style filter (low-pass / high-pass sweep)
        const filter = this.ctx.createBiquadFilter();
        filter.type = 'lowpass';
        const nyquist = this.ctx.sampleRate / 2;
        filter.frequency.value = Math.min(nyquist * 0.95, 22000); // fully open, clamped to Nyquist
        filter.Q.value = 0.707;

        this.channels[id] = {
            eqLow: this._createEQ('lowshelf', 320),
            eqMid: this._createEQ('peaking', 1000),
            eqHigh: this._createEQ('highshelf', 3200),
            filter: filter,
            channelGain: this.ctx.createGain(),
            crossfadeGain: this.ctx.createGain(),
            analyser: this._createAnalyser(),
            pfl: false, // pre-fader listen
        };

        // Chain: eqLow → eqMid → eqHigh → filter → channelGain → crossfadeGain → analyser
        const ch = this.channels[id];
        ch.eqLow.connect(ch.eqMid);
        ch.eqMid.connect(ch.eqHigh);
        ch.eqHigh.connect(ch.filter);
        ch.filter.connect(ch.channelGain);
        ch.channelGain.connect(ch.crossfadeGain);
        ch.crossfadeGain.connect(ch.analyser);

        // EQ kill state for this channel
        if (!this._eqKillState[id]) {
            this._eqKillState[id] = { high: false, mid: false, low: false };
            this._eqSavedGain[id] = { high: 0, mid: 0, low: 0 };
        }

        // Connect to master if it exists (channels C,D are created later)
        if (this.masterGain) {
            ch.analyser.connect(this.masterGain);
        }
    }

    enableFourDeckMode() {
        if (this.fourDeckMode) return;
        this.fourDeckMode = true;

        // Create channels C and D
        ['C', 'D'].forEach(id => {
            if (!this.channels[id]) {
                this._createChannel(id);
                this.channels[id].analyser.connect(this.masterGain);
            }
        });

        // Re-apply crossfader to pick up new channels
        this.setCrossfade(this._lastCrossfadePosition);
        console.log('[AUDIO:ROUTER] 4-deck mode ENABLED — channels C and D created');
    }

    disableFourDeckMode() {
        if (!this.fourDeckMode) return;
        this.fourDeckMode = false;

        // Disconnect and remove channels C and D
        ['C', 'D'].forEach(id => {
            if (this.channels[id]) {
                try { this.channels[id].analyser.disconnect(this.masterGain); } catch (e) {}
                // Disconnect source if any
                if (this._sourceNodes[id]) {
                    try { this._sourceNodes[id].disconnect(); } catch (e) {}
                    delete this._sourceNodes[id];
                }
            }
        });

        // Re-apply crossfader for 2-deck
        this.setCrossfade(this._lastCrossfadePosition);
        console.log('[AUDIO:ROUTER] 4-deck mode DISABLED');
    }

    setCrossfaderAssignment(deckId, side) {
        // side: 'A' or 'B'
        this.crossfaderAssignment[deckId] = side;
        // Re-apply crossfader gains
        this.setCrossfade(this._lastCrossfadePosition);
        console.log(`[AUDIO:ROUTER] Deck ${deckId} assigned to crossfader side ${side}`);
    }

    getCrossfaderAssignment(deckId) {
        return this.crossfaderAssignment[deckId] || (deckId === 'B' || deckId === 'D' ? 'B' : 'A');
    }

    // ===== COMMON =====

    _createEQ(type, frequency) {
        const filter = this.ctx.createBiquadFilter();
        filter.type = type;
        filter.frequency.value = frequency;
        filter.gain.value = 0;
        if (type === 'peaking') {
            filter.Q.value = 1.0;
        }
        return filter;
    }

    _createAnalyser() {
        const analyser = this.ctx.createAnalyser();
        analyser.fftSize = 256;
        analyser.smoothingTimeConstant = 0.8;
        return analyser;
    }

    setEQ(deckId, band, gainDB) {
        const key = `eq${band.charAt(0).toUpperCase() + band.slice(1)}`;
        // If the band is killed, store the value but don't apply it
        if (this._eqKillState[deckId]?.[band]) {
            this._eqSavedGain[deckId][band] = gainDB;
        } else {
            this.channels[deckId][key].gain.value = gainDB;
        }
    }

    setChannelVolume(deckId, level) {
        let gain;
        if (this.faderCurve === 'logarithmic') {
            // Logarithmic curve: more natural feel, gradual at low end
            // Maps 0-1 linear input to logarithmic output
            gain = level === 0 ? 0 : Math.pow(level, 3); // cubic approximation of log curve
        } else {
            // Linear curve: direct 1:1 mapping
            gain = level;
        }
        this.channels[deckId].channelGain.gain.value = gain;
    }

    setMasterVolume(level) {
        this.masterGain.gain.value = level;
    }

    // DJ-style filter knob: 0 = full low-pass, 0.5 = bypass, 1 = full high-pass
    setFilter(deckId, position) {
        const ch = this.channels[deckId];
        if (!ch) return;
        const filter = ch.filter;

        if (position < 0.48) {
            // Low-pass: sweep 200Hz – 22kHz
            filter.type = 'lowpass';
            const normalized = position / 0.48; // 0–1
            const maxFreq = Math.min(this.ctx.sampleRate / 2 * 0.95, 22000);
            filter.frequency.value = 200 * Math.pow(maxFreq / 200, normalized);
            filter.Q.value = 0.707 + (1 - normalized) * 4; // resonance peak near cutoff
        } else if (position > 0.52) {
            // High-pass: sweep 20Hz – 8kHz
            filter.type = 'highpass';
            const normalized = (position - 0.52) / 0.48; // 0–1
            filter.frequency.value = 20 * Math.pow(8000 / 20, normalized);
            filter.Q.value = 0.707 + normalized * 4;
        } else {
            // Center dead zone — bypass (fully open low-pass)
            filter.type = 'lowpass';
            filter.frequency.value = Math.min(this.ctx.sampleRate / 2 * 0.95, 22000);
            filter.Q.value = 0.707;
        }
    }

    // ===== EQ KILL SWITCHES =====

    toggleEQKill(deckId, band) {
        const killed = this._eqKillState[deckId][band];
        const key = `eq${band.charAt(0).toUpperCase() + band.slice(1)}`;
        const eqNode = this.channels[deckId][key];

        if (!killed) {
            // Kill: save current gain, set to -inf (use -96 dB as practical -inf)
            this._eqSavedGain[deckId][band] = eqNode.gain.value;
            eqNode.gain.setValueAtTime(-96, this.ctx.currentTime);
            this._eqKillState[deckId][band] = true;
            console.log(`[AUDIO:EQ] Deck ${deckId} ${band.toUpperCase()} KILLED`);
        } else {
            // Restore saved gain
            eqNode.gain.setValueAtTime(this._eqSavedGain[deckId][band], this.ctx.currentTime);
            this._eqKillState[deckId][band] = false;
            console.log(`[AUDIO:EQ] Deck ${deckId} ${band.toUpperCase()} restored to ${this._eqSavedGain[deckId][band]} dB`);
        }
        return this._eqKillState[deckId][band];
    }

    isEQKilled(deckId, band) {
        return this._eqKillState[deckId]?.[band] || false;
    }

    // ===== MASTER LIMITER =====

    setLimiterEnabled(enabled) {
        this.limiterEnabled = enabled;

        // Disconnect current path from analyser
        try { this.masterAnalyser.disconnect(); } catch (e) {}
        try { this._limiterBypass.disconnect(); } catch (e) {}
        try { this.limiter.disconnect(); } catch (e) {}

        // Re-connect booth and cue master (they tap from masterAnalyser)
        // Keep those connections stable

        if (enabled) {
            // masterAnalyser → limiter → destination
            this.masterAnalyser.connect(this.limiter);
            this.limiter.connect(this.ctx.destination);
            console.log('[AUDIO:LIMITER] Master limiter ENABLED (threshold: -3dB, ratio: 20:1)');
        } else {
            // masterAnalyser → bypass → destination
            this.masterAnalyser.connect(this._limiterBypass);
            this._limiterBypass.connect(this.ctx.destination);
            console.log('[AUDIO:LIMITER] Master limiter DISABLED');
        }

        // Re-connect booth output from masterAnalyser
        try { this.masterAnalyser.connect(this.boothGain); } catch (e) {}
        // Re-connect cue master gain from masterAnalyser
        try { this.masterAnalyser.connect(this.cueMasterGain); } catch (e) {}
    }

    getLimiterReduction() {
        // Returns current gain reduction in dB (negative value = limiting active)
        return this.limiter.reduction;
    }

    // ===== CHANNEL FADER CURVE =====

    setFaderCurve(curve) {
        this.faderCurve = curve; // 'linear' or 'logarithmic'
        console.log(`[AUDIO:FADER] Fader curve set to: ${curve}`);
        // Re-apply current fader positions with new curve
        const ids = this.fourDeckMode ? ['a', 'b', 'c', 'd'] : ['a', 'b'];
        ids.forEach(ch => {
            const fader = document.getElementById(`vol-${ch}`);
            if (fader) {
                const deckId = ch.toUpperCase();
                this.setChannelVolume(deckId, fader.value / 100);
            }
        });
    }

    // ===== AUTO-GAIN =====

    setAutoGain(enabled) {
        this.autoGainEnabled = enabled;
        console.log(`[AUDIO:AUTOGAIN] Auto-gain ${enabled ? 'ENABLED' : 'DISABLED'}`);
    }

    // Analyze loudness of an audio element and set channel gain to normalize
    async analyzeAndNormalize(deckId, audioElement) {
        if (!this.autoGainEnabled) return;
        if (!audioElement || !audioElement.src) return;

        console.log(`[AUDIO:AUTOGAIN] Analyzing loudness for Deck ${deckId}...`);

        try {
            // Use OfflineAudioContext to analyze a portion of the track
            const response = await fetch(audioElement.src);
            const arrayBuffer = await response.arrayBuffer();
            const audioBuffer = await this.ctx.decodeAudioData(arrayBuffer.slice(0)); // clone buffer

            // Analyze the first 30 seconds (or full track if shorter)
            const sampleRate = audioBuffer.sampleRate;
            const analyzeLength = Math.min(audioBuffer.length, sampleRate * 30);
            const channelData = audioBuffer.getChannelData(0);

            // Calculate RMS loudness
            let sumSquares = 0;
            for (let i = 0; i < analyzeLength; i++) {
                sumSquares += channelData[i] * channelData[i];
            }
            const rms = Math.sqrt(sumSquares / analyzeLength);
            const rmsDB = 20 * Math.log10(Math.max(rms, 1e-10));

            // Target loudness: -14 dB RMS (standard streaming loudness)
            const targetDB = -14;
            const gainAdjustDB = targetDB - rmsDB;
            // Clamp gain adjustment to reasonable range (-12 to +12 dB)
            const clampedGainDB = Math.max(-12, Math.min(12, gainAdjustDB));
            const gainLinear = Math.pow(10, clampedGainDB / 20);

            // Apply to channel gain
            this.channels[deckId].channelGain.gain.setValueAtTime(gainLinear, this.ctx.currentTime);

            // Update the volume fader UI to reflect the new gain
            const ch = deckId.toLowerCase();
            const fader = document.getElementById(`vol-${ch}`);
            if (fader) {
                fader.value = Math.round(gainLinear * 100);
            }

            console.log(`[AUDIO:AUTOGAIN] Deck ${deckId}: RMS=${rmsDB.toFixed(1)}dB → gain adjustment: ${clampedGainDB > 0 ? '+' : ''}${clampedGainDB.toFixed(1)}dB (linear: ${gainLinear.toFixed(3)})`);
        } catch (e) {
            console.warn(`[AUDIO:AUTOGAIN] Failed to analyze Deck ${deckId}:`, e.message);
        }
    }

    getAnalyserData(deckId) {
        const analyser = this.channels[deckId].analyser;
        const data = new Uint8Array(analyser.frequencyBinCount);
        analyser.getByteFrequencyData(data);
        return data;
    }

    getMasterAnalyserData() {
        const data = new Uint8Array(this.masterAnalyser.frequencyBinCount);
        this.masterAnalyser.getByteFrequencyData(data);
        return data;
    }
}
