// BpmTap.js — Manual BPM tapping for tracks without metadata

export class BpmTap {
    constructor() {
        this.taps = [];
        this.maxTaps = 12;
        this.bpm = 0;
        this.targetDeck = null;

        this._initUI();
    }

    _initUI() {
        const tapBtn = document.getElementById('bpm-tap-btn');
        const resetBtn = document.getElementById('bpm-tap-reset');

        if (tapBtn) {
            tapBtn.addEventListener('click', () => this.tap());

            // Also respond to keypress
            document.addEventListener('keydown', (e) => {
                if (e.code === 'KeyT' && e.target.tagName !== 'INPUT') {
                    this.tap();
                }
            });
        }

        if (resetBtn) {
            resetBtn.addEventListener('click', () => this.reset());
        }
    }

    tap() {
        const now = performance.now();
        this.taps.push(now);

        // Keep only recent taps
        if (this.taps.length > this.maxTaps) {
            this.taps.shift();
        }

        if (this.taps.length >= 2) {
            this._calculate();
        }

        // Visual feedback
        const tapBtn = document.getElementById('bpm-tap-btn');
        if (tapBtn) {
            tapBtn.classList.add('tapped');
            setTimeout(() => tapBtn.classList.remove('tapped'), 100);
        }
    }

    _calculate() {
        let totalInterval = 0;
        for (let i = 1; i < this.taps.length; i++) {
            totalInterval += this.taps[i] - this.taps[i - 1];
        }

        const avgInterval = totalInterval / (this.taps.length - 1);
        this.bpm = Math.round(60000 / avgInterval * 10) / 10;

        const display = document.getElementById('bpm-tap-display');
        if (display) display.textContent = `${this.bpm} BPM`;
    }

    reset() {
        this.taps = [];
        this.bpm = 0;
        const display = document.getElementById('bpm-tap-display');
        if (display) display.textContent = '--- BPM';
    }

    getBPM() {
        return this.bpm;
    }
}
