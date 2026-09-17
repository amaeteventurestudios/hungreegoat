// FX.js — Audio effects engine per deck
// Effects: Echo, Reverb, Flanger, Filter, Delay, Phaser, Bitcrusher, Distortion, Gate, Ping-pong Delay, Tape Stop
// Each deck has a dry/wet send routed through the AudioRouter

export class FX {
    constructor(audioRouter) {
        this.router = audioRouter;
        this.ctx = audioRouter.getAudioContext();
        this.decks = {};

        ['A', 'B'].forEach(id => {
            this.decks[id] = this._createFXChain(id);
        });

        this._initUI();
    }

    _createFXChain(deckId) {
        const ch = this.router.channels[deckId];

        // Insert FX between channelGain and crossfadeGain
        // channelGain -> dryGain -> crossfadeGain (original path)
        // channelGain -> fxSend -> [effect] -> fxReturn -> wetGain -> crossfadeGain
        ch.channelGain.disconnect(ch.crossfadeGain);

        const dry = this.ctx.createGain();
        const wet = this.ctx.createGain();
        const fxSend = this.ctx.createGain();
        const fxReturn = this.ctx.createGain();

        dry.gain.value = 1;
        wet.gain.value = 0;
        fxSend.gain.value = 1;
        fxReturn.gain.value = 1;

        ch.channelGain.connect(dry);
        ch.channelGain.connect(fxSend);
        dry.connect(ch.crossfadeGain);
        fxReturn.connect(wet);
        wet.connect(ch.crossfadeGain);

        // Create all effects
        const echo = this._createEcho();
        const reverb = this._createReverb();
        const flanger = this._createFlanger();
        const filter = this._createFilter();
        const delay = this._createDelay();
        const phaser = this._createPhaser();
        const bitcrusher = this._createBitcrusher();
        const distortion = this._createDistortion();
        const gate = this._createGate();
        const pingpong = this._createPingPongDelay();
        const tapestop = this._createTapeStop(deckId);

        // Default: echo is connected
        const effects = { echo, reverb, flanger, filter, delay, phaser, bitcrusher, distortion, gate, pingpong, tapestop };
        const activeEffect = 'echo';

        // Connect active effect
        fxSend.connect(echo.input);
        echo.output.connect(fxReturn);

        return { dry, wet, fxSend, fxReturn, effects, activeEffect, connected: { input: echo.input, output: echo.output } };
    }

    _createEcho() {
        const delay = this.ctx.createDelay(2.0);
        delay.delayTime.value = 0.375;
        const feedback = this.ctx.createGain();
        feedback.gain.value = 0.4;
        const input = this.ctx.createGain();
        const output = this.ctx.createGain();

        input.connect(delay);
        delay.connect(feedback);
        feedback.connect(delay);
        delay.connect(output);
        input.connect(output); // pass-through

        return { input, output, delay, feedback, params: { time: 0.375, feedback: 0.4 } };
    }

    _createReverb() {
        const convolver = this.ctx.createConvolver();
        const input = this.ctx.createGain();
        const output = this.ctx.createGain();

        // Generate impulse response
        this._generateImpulseResponse(convolver, 2.0, 2.0);

        input.connect(convolver);
        convolver.connect(output);
        input.connect(output);

        return { input, output, convolver, params: { decay: 2.0, size: 2.0 } };
    }

    _generateImpulseResponse(convolver, duration, decay) {
        const rate = this.ctx.sampleRate;
        const length = rate * duration;
        const buffer = this.ctx.createBuffer(2, length, rate);

        for (let ch = 0; ch < 2; ch++) {
            const data = buffer.getChannelData(ch);
            for (let i = 0; i < length; i++) {
                data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, decay);
            }
        }

        convolver.buffer = buffer;
    }

    _createFlanger() {
        const delay = this.ctx.createDelay(0.02);
        delay.delayTime.value = 0.005;
        const lfo = this.ctx.createOscillator();
        const lfoGain = this.ctx.createGain();
        const feedback = this.ctx.createGain();
        const input = this.ctx.createGain();
        const output = this.ctx.createGain();

        lfo.type = 'sine';
        lfo.frequency.value = 0.5;
        lfoGain.gain.value = 0.003;

        lfo.connect(lfoGain);
        lfoGain.connect(delay.delayTime);
        lfo.start();

        input.connect(delay);
        delay.connect(feedback);
        feedback.gain.value = 0.5;
        feedback.connect(delay);
        delay.connect(output);
        input.connect(output);

        return { input, output, delay, lfo, lfoGain, feedback, params: { rate: 0.5, depth: 0.003, feedback: 0.5 } };
    }

    _createFilter() {
        const biquad = this.ctx.createBiquadFilter();
        biquad.type = 'lowpass';
        biquad.frequency.value = 1000;
        biquad.Q.value = 5;
        const input = this.ctx.createGain();
        const output = this.ctx.createGain();

        input.connect(biquad);
        biquad.connect(output);

        return { input, output, biquad, params: { type: 'lowpass', frequency: 1000, resonance: 5 } };
    }

    _createDelay() {
        const delayNode = this.ctx.createDelay(5.0);
        delayNode.delayTime.value = 0.5;
        const feedback = this.ctx.createGain();
        feedback.gain.value = 0.35;
        const input = this.ctx.createGain();
        const output = this.ctx.createGain();

        input.connect(delayNode);
        delayNode.connect(feedback);
        feedback.connect(delayNode);
        delayNode.connect(output);
        input.connect(output);

        return { input, output, delayNode, feedback, params: { time: 0.5, feedback: 0.35 } };
    }

    // ===== NEW EFFECTS =====

    _createPhaser() {
        const input = this.ctx.createGain();
        const output = this.ctx.createGain();

        // Phaser uses multiple allpass filters modulated by an LFO
        const stages = 6;
        const allpassFilters = [];
        const lfo = this.ctx.createOscillator();
        const lfoGain = this.ctx.createGain();

        lfo.type = 'sine';
        lfo.frequency.value = 0.4; // rate
        lfoGain.gain.value = 1500; // depth — frequency sweep range

        lfo.connect(lfoGain);
        lfo.start();

        let prev = input;
        for (let i = 0; i < stages; i++) {
            const ap = this.ctx.createBiquadFilter();
            ap.type = 'allpass';
            ap.frequency.value = 1000;
            ap.Q.value = 0.5;
            lfoGain.connect(ap.frequency); // modulate frequency
            prev.connect(ap);
            prev = ap;
            allpassFilters.push(ap);
        }
        prev.connect(output);

        // Dry pass-through
        input.connect(output);

        // Feedback path from last allpass back to first
        const feedback = this.ctx.createGain();
        feedback.gain.value = 0.4;
        prev.connect(feedback);
        feedback.connect(allpassFilters[0]);

        return { input, output, lfo, lfoGain, allpassFilters, feedback, params: { rate: 0.4, depth: 1500 } };
    }

    _createBitcrusher() {
        const input = this.ctx.createGain();
        const output = this.ctx.createGain();

        // Bitcrusher via ScriptProcessorNode (AudioWorklet would be better but
        // requires a separate file). We use a small buffer size for low latency.
        const bufferSize = 4096;
        let bits = 8;
        let downsample = 4;

        // Use AudioWorkletNode if available, otherwise ScriptProcessor fallback
        let processorNode;
        try {
            // ScriptProcessorNode fallback (deprecated but widely supported)
            processorNode = this.ctx.createScriptProcessor(bufferSize, 1, 1);
            let lastSample = 0;
            let counter = 0;

            processorNode.onaudioprocess = (e) => {
                const inputData = e.inputBuffer.getChannelData(0);
                const outputData = e.outputBuffer.getChannelData(0);
                const step = Math.pow(0.5, bits);

                for (let i = 0; i < inputData.length; i++) {
                    counter++;
                    if (counter >= downsample) {
                        counter = 0;
                        lastSample = step * Math.floor(inputData[i] / step + 0.5);
                    }
                    outputData[i] = lastSample;
                }
            };
        } catch (e) {
            // Fallback: passthrough
            processorNode = this.ctx.createGain();
        }

        input.connect(processorNode);
        processorNode.connect(output);

        return {
            input, output, processorNode,
            get bits() { return bits; },
            set bits(v) { bits = Math.max(1, Math.min(16, v)); },
            get downsample() { return downsample; },
            set downsample(v) { downsample = Math.max(1, Math.min(32, v)); },
            params: { bits: 8, downsample: 4 }
        };
    }

    _createDistortion() {
        const input = this.ctx.createGain();
        const output = this.ctx.createGain();

        const waveshaper = this.ctx.createWaveShaper();
        waveshaper.oversample = '4x';

        // Generate distortion curve
        const makeDistortionCurve = (amount) => {
            const samples = 44100;
            const curve = new Float32Array(samples);
            const deg = Math.PI / 180;
            for (let i = 0; i < samples; i++) {
                const x = (i * 2) / samples - 1;
                curve[i] = ((3 + amount) * x * 20 * deg) / (Math.PI + amount * Math.abs(x));
            }
            return curve;
        };

        waveshaper.curve = makeDistortionCurve(50);

        // Pre-filter to tame harsh high-end
        const toneFilter = this.ctx.createBiquadFilter();
        toneFilter.type = 'lowpass';
        toneFilter.frequency.value = 8000;
        toneFilter.Q.value = 0.7;

        input.connect(waveshaper);
        waveshaper.connect(toneFilter);
        toneFilter.connect(output);
        input.connect(output); // dry pass-through

        return {
            input, output, waveshaper, toneFilter, makeDistortionCurve,
            params: { drive: 50, tone: 8000 }
        };
    }

    _createGate() {
        const input = this.ctx.createGain();
        const output = this.ctx.createGain();
        const gateGain = this.ctx.createGain();
        gateGain.gain.value = 1;

        // Analyser to detect level
        const analyser = this.ctx.createAnalyser();
        analyser.fftSize = 256;
        analyser.smoothingTimeConstant = 0.3;

        input.connect(analyser);
        input.connect(gateGain);
        gateGain.connect(output);

        // Gate state
        let threshold = -30; // dB
        let isOpen = true;

        // Periodically check level and gate
        const dataArray = new Uint8Array(analyser.frequencyBinCount);
        const checkInterval = setInterval(() => {
            analyser.getByteFrequencyData(dataArray);
            let sum = 0;
            for (let i = 0; i < dataArray.length; i++) sum += dataArray[i];
            const avg = sum / dataArray.length;
            // Convert byte (0-255) to approximate dB: 20*log10(avg/255)
            const dbLevel = avg > 0 ? 20 * Math.log10(avg / 255) : -100;

            const shouldOpen = dbLevel >= threshold;
            if (shouldOpen !== isOpen) {
                isOpen = shouldOpen;
                const now = this.ctx.currentTime;
                gateGain.gain.cancelScheduledValues(now);
                gateGain.gain.setTargetAtTime(isOpen ? 1 : 0, now, 0.005);
            }
        }, 10);

        return {
            input, output, gateGain, analyser,
            get threshold() { return threshold; },
            set threshold(v) { threshold = v; },
            _interval: checkInterval,
            params: { threshold: -30, attack: 0.005 }
        };
    }

    _createPingPongDelay() {
        const input = this.ctx.createGain();
        const output = this.ctx.createGain();

        // Left delay and right delay alternating
        const delayL = this.ctx.createDelay(2.0);
        const delayR = this.ctx.createDelay(2.0);
        delayL.delayTime.value = 0.375;
        delayR.delayTime.value = 0.375;

        const feedbackL = this.ctx.createGain();
        const feedbackR = this.ctx.createGain();
        feedbackL.gain.value = 0.35;
        feedbackR.gain.value = 0.35;

        // Stereo panning
        const panL = this.ctx.createStereoPanner();
        const panR = this.ctx.createStereoPanner();
        panL.pan.value = -0.8;
        panR.pan.value = 0.8;

        // Signal flow: input -> delayL -> panL -> output
        //              delayL -> feedbackL -> delayR -> panR -> output
        //              delayR -> feedbackR -> delayL (ping-pong)
        input.connect(delayL);
        delayL.connect(panL);
        panL.connect(output);
        delayL.connect(feedbackL);
        feedbackL.connect(delayR);
        delayR.connect(panR);
        panR.connect(output);
        delayR.connect(feedbackR);
        feedbackR.connect(delayL);

        // Dry pass-through
        input.connect(output);

        return {
            input, output, delayL, delayR, feedbackL, feedbackR, panL, panR,
            params: { time: 0.375, feedback: 0.35 }
        };
    }

    _createTapeStop(deckId) {
        const input = this.ctx.createGain();
        const output = this.ctx.createGain();

        // Tape stop simulates slowing down playback.
        // We pass audio through normally; the "stop" effect is triggered
        // by ramping playbackRate on the deck down to 0 then back up.
        input.connect(output);

        let isActive = false;
        let stopDuration = 1.0; // seconds for tape to stop

        const trigger = () => {
            if (isActive) return;
            isActive = true;

            // Dispatch event that the player can listen to for tape stop
            const event = new CustomEvent('tapestop', {
                detail: { deckId, duration: stopDuration, action: 'stop' }
            });
            document.dispatchEvent(event);

            // Auto-resume after stop
            setTimeout(() => {
                isActive = false;
                const resumeEvent = new CustomEvent('tapestop', {
                    detail: { deckId, duration: stopDuration * 0.5, action: 'resume' }
                });
                document.dispatchEvent(resumeEvent);
            }, stopDuration * 1000 + 200);
        };

        return {
            input, output, trigger,
            get stopDuration() { return stopDuration; },
            set stopDuration(v) { stopDuration = Math.max(0.1, Math.min(5, v)); },
            get isActive() { return isActive; },
            params: { speed: 1.0, duration: 1.0 }
        };
    }

    // Switch which effect is active on a deck
    switchEffect(deckId, effectName) {
        const deck = this.decks[deckId];
        if (!deck || !deck.effects[effectName]) return;

        // Disconnect old
        try {
            deck.fxSend.disconnect(deck.connected.input);
            deck.connected.output.disconnect(deck.fxReturn);
        } catch (e) {}

        // Connect new
        const fx = deck.effects[effectName];
        deck.fxSend.connect(fx.input);
        fx.output.connect(deck.fxReturn);
        deck.connected = { input: fx.input, output: fx.output };
        deck.activeEffect = effectName;
    }

    // Set dry/wet mix (0 = full dry, 1 = full wet)
    setWetDry(deckId, wetAmount) {
        const deck = this.decks[deckId];
        if (!deck) return;
        deck.wet.gain.value = wetAmount;
        deck.dry.gain.value = 1 - wetAmount * 0.5; // keep some dry signal
    }

    // Set effect-specific parameter
    setParam(deckId, param, value) {
        const deck = this.decks[deckId];
        if (!deck) return;
        const effect = deck.effects[deck.activeEffect];

        switch (deck.activeEffect) {
            case 'echo':
                if (param === 'time') effect.delay.delayTime.value = value;
                if (param === 'feedback') effect.feedback.gain.value = Math.min(0.9, value);
                break;
            case 'reverb':
                if (param === 'decay') this._generateImpulseResponse(effect.convolver, value, value);
                break;
            case 'flanger':
                if (param === 'rate') effect.lfo.frequency.value = value;
                if (param === 'depth') effect.lfoGain.gain.value = value;
                if (param === 'feedback') effect.feedback.gain.value = Math.min(0.9, value);
                break;
            case 'filter':
                if (param === 'frequency') effect.biquad.frequency.value = value;
                if (param === 'resonance') effect.biquad.Q.value = value;
                if (param === 'type') effect.biquad.type = value;
                break;
            case 'delay':
                if (param === 'time') effect.delayNode.delayTime.value = value;
                if (param === 'feedback') effect.feedback.gain.value = Math.min(0.9, value);
                break;
            case 'phaser':
                if (param === 'rate') effect.lfo.frequency.value = value;
                if (param === 'depth') effect.lfoGain.gain.value = value;
                break;
            case 'bitcrusher':
                if (param === 'bits') effect.bits = value;
                if (param === 'downsample') effect.downsample = value;
                break;
            case 'distortion':
                if (param === 'drive') {
                    effect.waveshaper.curve = effect.makeDistortionCurve(value);
                    effect.params.drive = value;
                }
                if (param === 'tone') {
                    effect.toneFilter.frequency.value = value;
                    effect.params.tone = value;
                }
                break;
            case 'gate':
                if (param === 'threshold') effect.threshold = value;
                break;
            case 'pingpong':
                if (param === 'time') {
                    effect.delayL.delayTime.value = value;
                    effect.delayR.delayTime.value = value;
                }
                if (param === 'feedback') {
                    effect.feedbackL.gain.value = Math.min(0.9, value);
                    effect.feedbackR.gain.value = Math.min(0.9, value);
                }
                break;
            case 'tapestop':
                if (param === 'speed') effect.stopDuration = value;
                if (param === 'trigger') effect.trigger();
                break;
        }
    }

    _initUI() {
        ['a', 'b'].forEach(ch => {
            const deckId = ch.toUpperCase();

            // FX select
            const fxSelect = document.getElementById(`fx-${ch}-select`);
            if (fxSelect) {
                fxSelect.addEventListener('change', (e) => {
                    this.switchEffect(deckId, e.target.value);
                    this._updateParamLabels(ch);
                });
            }

            // Wet/dry
            const wetDry = document.getElementById(`fx-${ch}-wetdry`);
            if (wetDry) {
                wetDry.addEventListener('input', (e) => {
                    this.setWetDry(deckId, e.target.value / 100);
                });
            }

            // Param 1 & 2
            const param1 = document.getElementById(`fx-${ch}-param1`);
            const param2 = document.getElementById(`fx-${ch}-param2`);

            if (param1) {
                param1.addEventListener('input', (e) => {
                    const p = this._getParamMapping(deckId, 0);
                    if (p) this.setParam(deckId, p.name, p.scale(e.target.value / 100));
                });
            }
            if (param2) {
                param2.addEventListener('input', (e) => {
                    const p = this._getParamMapping(deckId, 1);
                    if (p) this.setParam(deckId, p.name, p.scale(e.target.value / 100));
                });
            }

            // FX on/off
            const fxToggle = document.getElementById(`fx-${ch}-toggle`);
            if (fxToggle) {
                fxToggle.addEventListener('click', () => {
                    const deck = this.decks[deckId];
                    const isOn = deck.wet.gain.value > 0;
                    if (isOn) {
                        deck.wet.gain.value = 0;
                        deck.dry.gain.value = 1;
                        fxToggle.classList.remove('active');
                    } else {
                        const wetDryEl = document.getElementById(`fx-${ch}-wetdry`);
                        const wetVal = wetDryEl ? wetDryEl.value / 100 : 0.5;
                        deck.wet.gain.value = wetVal;
                        deck.dry.gain.value = 1 - wetVal * 0.5;
                        fxToggle.classList.add('active');
                    }
                });
            }

            // Tape stop trigger button
            const tapeStopBtn = document.getElementById(`fx-${ch}-tapestop-trigger`);
            if (tapeStopBtn) {
                tapeStopBtn.addEventListener('click', () => {
                    this.setParam(deckId, 'trigger', true);
                });
            }
        });
    }

    _getParamMapping(deckId, paramIndex) {
        const deck = this.decks[deckId];
        const mappings = {
            echo: [
                { name: 'time', label: 'TIME', scale: v => v * 1.5 + 0.05 },
                { name: 'feedback', label: 'FDBK', scale: v => v * 0.85 },
            ],
            reverb: [
                { name: 'decay', label: 'DECAY', scale: v => v * 5 + 0.5 },
                { name: 'decay', label: 'SIZE', scale: v => v * 5 + 0.5 },
            ],
            flanger: [
                { name: 'rate', label: 'RATE', scale: v => v * 5 + 0.1 },
                { name: 'depth', label: 'DEPTH', scale: v => v * 0.01 },
            ],
            filter: [
                { name: 'frequency', label: 'FREQ', scale: v => 20 + v * v * 19980 },
                { name: 'resonance', label: 'RESO', scale: v => v * 20 + 0.5 },
            ],
            delay: [
                { name: 'time', label: 'TIME', scale: v => v * 2 + 0.05 },
                { name: 'feedback', label: 'FDBK', scale: v => v * 0.85 },
            ],
            phaser: [
                { name: 'rate', label: 'RATE', scale: v => v * 4 + 0.05 },
                { name: 'depth', label: 'DEPTH', scale: v => v * 3000 + 100 },
            ],
            bitcrusher: [
                { name: 'bits', label: 'BITS', scale: v => Math.round(1 + (1 - v) * 15) },
                { name: 'downsample', label: 'CRSH', scale: v => Math.round(1 + v * 31) },
            ],
            distortion: [
                { name: 'drive', label: 'DRIVE', scale: v => v * 200 },
                { name: 'tone', label: 'TONE', scale: v => 200 + v * v * 19800 },
            ],
            gate: [
                { name: 'threshold', label: 'THRS', scale: v => -60 + v * 60 },
                { name: 'threshold', label: 'GATE', scale: v => -60 + v * 60 },
            ],
            pingpong: [
                { name: 'time', label: 'TIME', scale: v => v * 1.5 + 0.05 },
                { name: 'feedback', label: 'FDBK', scale: v => v * 0.85 },
            ],
            tapestop: [
                { name: 'speed', label: 'SPEED', scale: v => v * 4 + 0.1 },
                { name: 'speed', label: 'DUR', scale: v => v * 4 + 0.1 },
            ],
        };

        return mappings[deck.activeEffect]?.[paramIndex] || null;
    }

    _updateParamLabels(ch) {
        const deckId = ch.toUpperCase();
        const p1Label = document.getElementById(`fx-${ch}-p1-label`);
        const p2Label = document.getElementById(`fx-${ch}-p2-label`);
        const m1 = this._getParamMapping(deckId, 0);
        const m2 = this._getParamMapping(deckId, 1);
        if (p1Label && m1) p1Label.textContent = m1.label;
        if (p2Label && m2) p2Label.textContent = m2.label;

        // Show/hide tape stop trigger button
        const triggerBtn = document.getElementById(`fx-${ch}-tapestop-trigger`);
        if (triggerBtn) {
            triggerBtn.style.display = this.decks[deckId].activeEffect === 'tapestop' ? '' : 'none';
        }
    }
}
