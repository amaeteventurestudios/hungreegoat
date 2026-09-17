// StemSeparator.js — Frequency-band based stem isolation per deck
// Uses cascaded BiquadFilters to approximate vocal/drum/bass/other separation
// For true AI stem separation, this architecture can be extended with ONNX runtime

export class StemSeparator {
    constructor(audioRouter) {
        this.router = audioRouter;
        this.ctx = audioRouter.getAudioContext();
        this.decks = {};
        this.enabled = { A: false, B: false };

        ['A', 'B'].forEach(id => {
            this.decks[id] = this._createStemChain(id);
        });

        this._initUI();
    }

    _createStemChain(deckId) {
        // Stem bands (approximate frequency ranges):
        // Bass: 20-250 Hz
        // Drums: 250-4000 Hz (transient-heavy, wide band)
        // Vocals: 300-4000 Hz (mid-focused, narrower)
        // Other: Full spectrum minus above

        const stems = {
            bass: {
                filter: this._createBandFilter('lowpass', 250),
                gain: this.ctx.createGain(),
            },
            drums: {
                low: this._createBandFilter('highpass', 200),
                high: this._createBandFilter('lowpass', 5000),
                gain: this.ctx.createGain(),
            },
            vocals: {
                low: this._createBandFilter('highpass', 300),
                high: this._createBandFilter('lowpass', 4000),
                gain: this.ctx.createGain(),
            },
            other: {
                filter: this._createBandFilter('highpass', 4000),
                gain: this.ctx.createGain(),
            },
        };

        // Set default gains
        Object.values(stems).forEach(s => s.gain.gain.value = 1.0);

        return { stems, insertNode: null, outputNode: null };
    }

    _createBandFilter(type, frequency) {
        const filter = this.ctx.createBiquadFilter();
        filter.type = type;
        filter.frequency.value = frequency;
        filter.Q.value = 0.707; // Butterworth
        return filter;
    }

    // Enable stem mode for a deck (inserts into audio chain)
    enable(deckId) {
        if (this.enabled[deckId]) return;

        const ch = this.router.channels[deckId];
        const deck = this.decks[deckId];
        const stems = deck.stems;

        // Create a splitter node from the EQ output
        const splitter = this.ctx.createGain();
        const merger = this.ctx.createGain();

        // Disconnect EQ → filter and insert stems between eqHigh and filter
        // Original chain: eqHigh -> filter -> channelGain -> crossfadeGain
        // New chain: eqHigh -> splitter -> [stems] -> merger -> filter -> channelGain
        ch.eqHigh.disconnect(ch.filter);

        // Route through stems
        ch.eqHigh.connect(splitter);

        // Bass path
        splitter.connect(stems.bass.filter);
        stems.bass.filter.connect(stems.bass.gain);
        stems.bass.gain.connect(merger);

        // Drums path (bandpass via HP+LP)
        splitter.connect(stems.drums.low);
        stems.drums.low.connect(stems.drums.high);
        stems.drums.high.connect(stems.drums.gain);
        stems.drums.gain.connect(merger);

        // Vocals path (bandpass)
        splitter.connect(stems.vocals.low);
        stems.vocals.low.connect(stems.vocals.high);
        stems.vocals.high.connect(stems.vocals.gain);
        stems.vocals.gain.connect(merger);

        // Other path
        splitter.connect(stems.other.filter);
        stems.other.filter.connect(stems.other.gain);
        stems.other.gain.connect(merger);

        merger.connect(ch.filter);

        deck.insertNode = splitter;
        deck.outputNode = merger;
        this.enabled[deckId] = true;

        this._updateUI(deckId);
    }

    disable(deckId) {
        if (!this.enabled[deckId]) return;

        const ch = this.router.channels[deckId];
        const deck = this.decks[deckId];

        // Disconnect everything
        try {
            ch.eqHigh.disconnect();
            deck.insertNode.disconnect();
            deck.outputNode.disconnect();
            Object.values(deck.stems).forEach(s => {
                if (s.filter) s.filter.disconnect();
                if (s.low) s.low.disconnect();
                if (s.high) s.high.disconnect();
                s.gain.disconnect();
            });
        } catch (e) {}

        // Restore direct connection: eqHigh → filter (original chain)
        ch.eqHigh.connect(ch.filter);

        this.enabled[deckId] = false;
        this._updateUI(deckId);
    }

    setStemVolume(deckId, stem, volume) {
        const deck = this.decks[deckId];
        if (!deck || !deck.stems[stem]) return;
        deck.stems[stem].gain.gain.value = volume;
    }

    _updateUI(deckId) {
        const ch = deckId.toLowerCase();
        const toggleBtn = document.getElementById(`stems-${ch}-toggle`);
        if (toggleBtn) {
            toggleBtn.classList.toggle('active', this.enabled[deckId]);
            toggleBtn.textContent = this.enabled[deckId] ? 'STEMS ON' : 'STEMS';
        }
    }

    _initUI() {
        ['a', 'b'].forEach(ch => {
            const deckId = ch.toUpperCase();

            const toggleBtn = document.getElementById(`stems-${ch}-toggle`);
            if (toggleBtn) {
                toggleBtn.addEventListener('click', () => {
                    if (this.enabled[deckId]) {
                        this.disable(deckId);
                    } else {
                        this.enable(deckId);
                    }
                });
            }

            ['bass', 'drums', 'vocals', 'other'].forEach(stem => {
                const slider = document.getElementById(`stem-${ch}-${stem}`);
                if (slider) {
                    slider.addEventListener('input', (e) => {
                        this.setStemVolume(deckId, stem, e.target.value / 100);
                    });
                }
            });
        });
    }
}
