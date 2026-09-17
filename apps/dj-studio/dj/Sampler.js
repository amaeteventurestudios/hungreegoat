// Sampler.js — Soundboard/sample pad bank
// 4 banks (A/B/C/D) of 8 pads = 32 samples
// Per-pad: loop mode, pitch control, volume control

export class Sampler {
    constructor(audioRouter) {
        this.router = audioRouter;
        this.ctx = audioRouter.getAudioContext();

        // 4 banks, each with 8 pads
        this.bankCount = 4;
        this.padCount = 8;
        this.banks = {};
        this.bankLabels = ['A', 'B', 'C', 'D'];
        this.bankColors = {
            A: ['#ff0000', '#ff3333', '#ff5555', '#ff7777', '#ff2200', '#ff4400', '#ff6600', '#ff1100'],
            B: ['#00ccff', '#00aaff', '#0088ff', '#0066ff', '#00ddff', '#0099ff', '#0077ff', '#0055ff'],
            C: ['#00ff66', '#00ff44', '#00ff88', '#00ffaa', '#00ff55', '#00ff77', '#00ff99', '#00ffbb'],
            D: ['#ff44ff', '#ff66ff', '#ff88ff', '#ffaaff', '#ff55ff', '#ff77ff', '#ff99ff', '#ffbbff'],
        };

        this.bankLabels.forEach(bank => {
            this.banks[bank] = new Array(this.padCount).fill(null).map(() => ({
                buffer: null,
                name: '',
                color: '',
                loopMode: false, // false = one-shot, true = loop
                pitch: 0,        // semitones offset (-12 to +12)
                volume: 1.0,     // 0.0 to 1.0
            }));
        });

        this.activeBank = 'A';
        this.activeSources = new Array(this.padCount).fill(null);

        // Sampler output chain: gain -> master
        this.gain = this.ctx.createGain();
        this.gain.gain.value = 0.8;
        this.gain.connect(audioRouter.masterGain);

        this._initUI();
    }

    _initUI() {
        this._initPadListeners();
        this._initBankSwitcher();
        this._initPadControls();
    }

    _initPadListeners() {
        const container = document.getElementById('sampler-pads');
        if (!container) return;

        container.querySelectorAll('.sample-pad').forEach(pad => {
            const index = parseInt(pad.dataset.pad);

            // Click to trigger
            pad.addEventListener('click', (e) => {
                // Don't trigger if clicking on controls inside the pad
                if (e.target.closest('.pad-controls')) return;
                const bankPad = this.banks[this.activeBank][index];
                if (bankPad && bankPad.buffer) {
                    this.triggerPad(index);
                }
            });

            // Allow loading audio files via file input
            pad.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                this._promptLoadSample(index);
            });
        });

        // Load sample buttons
        document.querySelectorAll('.sample-load-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const index = parseInt(btn.dataset.pad);
                this._promptLoadSample(index);
            });
        });

        // Master sampler volume
        const volSlider = document.getElementById('sampler-volume');
        if (volSlider) {
            volSlider.addEventListener('input', (e) => {
                this.gain.gain.value = e.target.value / 100;
            });
        }
    }

    _initBankSwitcher() {
        const bankBtns = document.querySelectorAll('.sampler-bank-btn');
        bankBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                this.switchBank(btn.dataset.bank);
            });
        });
    }

    _initPadControls() {
        // Loop mode toggles
        document.querySelectorAll('.pad-loop-toggle').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const index = parseInt(btn.dataset.pad);
                const pad = this.banks[this.activeBank][index];
                if (pad) {
                    pad.loopMode = !pad.loopMode;
                    btn.classList.toggle('active', pad.loopMode);
                    btn.textContent = pad.loopMode ? 'LOOP' : '1-SHOT';
                }
            });
        });

        // Pitch controls
        document.querySelectorAll('.pad-pitch').forEach(slider => {
            slider.addEventListener('input', (e) => {
                e.stopPropagation();
                const index = parseInt(slider.dataset.pad);
                const pad = this.banks[this.activeBank][index];
                if (pad) {
                    pad.pitch = parseInt(e.target.value);
                    const label = slider.parentElement.querySelector('.pad-pitch-display');
                    if (label) label.textContent = `${pad.pitch >= 0 ? '+' : ''}${pad.pitch}`;
                }
            });
        });

        // Volume controls
        document.querySelectorAll('.pad-volume').forEach(slider => {
            slider.addEventListener('input', (e) => {
                e.stopPropagation();
                const index = parseInt(slider.dataset.pad);
                const pad = this.banks[this.activeBank][index];
                if (pad) {
                    pad.volume = e.target.value / 100;
                }
            });
        });
    }

    switchBank(bankLabel) {
        if (!this.bankLabels.includes(bankLabel)) return;

        // Stop all playing pads before switching
        this.stopAll();

        this.activeBank = bankLabel;

        // Update bank button UI
        document.querySelectorAll('.sampler-bank-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.bank === bankLabel);
        });

        // Update display label
        const bankDisplay = document.getElementById('sampler-bank-display');
        if (bankDisplay) bankDisplay.textContent = `BANK ${bankLabel}`;

        // Refresh pad UI for new bank
        for (let i = 0; i < this.padCount; i++) {
            this._updatePadUI(i);
        }
    }

    _promptLoadSample(padIndex) {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'audio/*';
        input.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (!file) return;
            await this.loadSampleFromFile(padIndex, file);
        });
        input.click();
    }

    async loadSampleFromFile(padIndex, file) {
        try {
            const arrayBuffer = await file.arrayBuffer();
            const audioBuffer = await this.ctx.decodeAudioData(arrayBuffer);

            const colors = this.bankColors[this.activeBank];
            const pad = this.banks[this.activeBank][padIndex];
            pad.buffer = audioBuffer;
            pad.name = file.name.replace(/\.[^/.]+$/, '');
            pad.color = colors[padIndex];

            this._updatePadUI(padIndex);
        } catch (err) {
            console.error(`Failed to load sample for pad ${padIndex}:`, err);
        }
    }

    async loadSampleFromURL(padIndex, url, name, bankLabel) {
        const bank = bankLabel || this.activeBank;
        try {
            const response = await fetch(url);
            const arrayBuffer = await response.arrayBuffer();
            const audioBuffer = await this.ctx.decodeAudioData(arrayBuffer);

            const colors = this.bankColors[bank];
            const pad = this.banks[bank][padIndex];
            pad.buffer = audioBuffer;
            pad.name = name || `Sample ${padIndex + 1}`;
            pad.color = colors[padIndex];

            if (bank === this.activeBank) {
                this._updatePadUI(padIndex);
            }
        } catch (err) {
            console.error(`Failed to load sample from URL for pad ${padIndex}:`, err);
        }
    }

    triggerPad(padIndex) {
        const pad = this.banks[this.activeBank][padIndex];
        if (!pad || !pad.buffer) return;

        this.router.resume();

        // Stop any currently playing instance on this pad
        if (this.activeSources[padIndex]) {
            try {
                this.activeSources[padIndex].stop();
            } catch (e) { /* already stopped */ }
        }

        const source = this.ctx.createBufferSource();
        source.buffer = pad.buffer;

        // Apply pitch shift via detune (100 cents per semitone)
        source.detune.value = pad.pitch * 100;

        // Apply loop mode
        source.loop = pad.loopMode;

        // Per-pad volume via gain node
        const padGain = this.ctx.createGain();
        padGain.gain.value = pad.volume;

        source.connect(padGain);
        padGain.connect(this.gain);
        source.start();
        this.activeSources[padIndex] = source;

        // Visual feedback
        this._flashPad(padIndex);

        source.onended = () => {
            if (this.activeSources[padIndex] === source) {
                this.activeSources[padIndex] = null;
            }
        };
    }

    stopPad(padIndex) {
        if (this.activeSources[padIndex]) {
            try {
                this.activeSources[padIndex].stop();
            } catch (e) { /* already stopped */ }
            this.activeSources[padIndex] = null;
        }
    }

    stopAll() {
        for (let i = 0; i < this.padCount; i++) {
            this.stopPad(i);
        }
    }

    _updatePadUI(padIndex) {
        const container = document.getElementById('sampler-pads');
        if (!container) return;

        const padEl = container.children[padIndex];
        if (!padEl) return;

        const pad = this.banks[this.activeBank][padIndex];
        if (pad && pad.buffer) {
            padEl.classList.add('loaded');
            padEl.style.borderColor = pad.color;
            padEl.style.color = pad.color;
            const nameEl = padEl.querySelector('.sample-name');
            if (nameEl) nameEl.textContent = pad.name;

            // Update loop mode button
            const loopBtn = padEl.querySelector('.pad-loop-toggle');
            if (loopBtn) {
                loopBtn.classList.toggle('active', pad.loopMode);
                loopBtn.textContent = pad.loopMode ? 'LOOP' : '1-SHOT';
            }

            // Update pitch display
            const pitchSlider = padEl.querySelector('.pad-pitch');
            const pitchDisplay = padEl.querySelector('.pad-pitch-display');
            if (pitchSlider) pitchSlider.value = pad.pitch;
            if (pitchDisplay) pitchDisplay.textContent = `${pad.pitch >= 0 ? '+' : ''}${pad.pitch}`;

            // Update volume
            const volSlider = padEl.querySelector('.pad-volume');
            if (volSlider) volSlider.value = pad.volume * 100;
        } else {
            padEl.classList.remove('loaded');
            padEl.style.borderColor = '';
            padEl.style.color = '';
            const nameEl = padEl.querySelector('.sample-name');
            if (nameEl) nameEl.textContent = '';
        }
    }

    _flashPad(padIndex) {
        const container = document.getElementById('sampler-pads');
        if (!container) return;
        const padEl = container.children[padIndex];
        if (!padEl) return;

        padEl.classList.add('triggered');
        setTimeout(() => padEl.classList.remove('triggered'), 150);
    }
}
