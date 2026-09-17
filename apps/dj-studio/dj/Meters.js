// Meters.js — Canvas-based VU meter rendering using AnalyserNode data

export class Meters {
    constructor(audioRouter) {
        this.router = audioRouter;
        this.canvases = {
            A: document.getElementById('meter-a'),
            B: document.getElementById('meter-b'),
            master: document.getElementById('master-meter'),
            mic: document.getElementById('meter-mic'),
            system: document.getElementById('meter-system'),
            phase: document.getElementById('meter-phase'),
        };
        this._running = false;
    }

    start() {
        if (this._running) return;
        this._running = true;
        this._draw();
    }

    stop() {
        this._running = false;
    }

    _draw() {
        if (!this._running) return;

        this._drawChannelMeter('A');
        this._drawChannelMeter('B');
        this._drawMasterMeter();
        this._drawMicMeter();
        this._drawSystemMeter();
        this._drawPhaseMeter();

        requestAnimationFrame(() => this._draw());
    }

    _drawChannelMeter(deckId) {
        const canvas = this.canvases[deckId];
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        const data = this.router.getAnalyserData(deckId);
        const level = this._rmsLevel(data);

        this._drawVerticalMeter(ctx, canvas.width, canvas.height, level);
    }

    _drawMasterMeter() {
        const canvas = this.canvases.master;
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        const data = this.router.getMasterAnalyserData();
        const level = this._rmsLevel(data);

        this._drawHorizontalMeter(ctx, canvas.width, canvas.height, level);
    }

    _drawMicMeter() {
        const canvas = this.canvases.mic;
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        const data = this.router.getMicAnalyserData();
        const level = this._rmsLevel(data);

        this._drawHorizontalMeter(ctx, canvas.width, canvas.height, level);
    }

    _drawSystemMeter() {
        const canvas = this.canvases.system;
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        const data = this.router.getSystemAnalyserData();
        const level = this._rmsLevel(data);

        this._drawHorizontalMeter(ctx, canvas.width, canvas.height, level);
    }

    _drawVerticalMeter(ctx, w, h, level) {
        ctx.clearRect(0, 0, w, h);
        ctx.fillStyle = '#0a0a14';
        ctx.fillRect(0, 0, w, h);

        const barHeight = h * level;
        const barY = h - barHeight;

        const gradient = ctx.createLinearGradient(0, h, 0, 0);
        gradient.addColorStop(0, '#00ff44');
        gradient.addColorStop(0.6, '#00ff44');
        gradient.addColorStop(0.75, '#ffdd00');
        gradient.addColorStop(0.9, '#ff4400');
        gradient.addColorStop(1, '#ff0000');

        ctx.fillStyle = gradient;
        ctx.fillRect(2, barY, w - 4, barHeight);

        // Segmented look
        const segH = 4, gap = 2;
        for (let y = 0; y < h; y += segH + gap) {
            ctx.fillStyle = '#0a0a14';
            ctx.fillRect(0, y, w, gap);
        }
    }

    _drawHorizontalMeter(ctx, w, h, level) {
        ctx.clearRect(0, 0, w, h);
        ctx.fillStyle = '#0a0a14';
        ctx.fillRect(0, 0, w, h);

        const barWidth = w * level;

        const gradient = ctx.createLinearGradient(0, 0, w, 0);
        gradient.addColorStop(0, '#00ff44');
        gradient.addColorStop(0.6, '#00ff44');
        gradient.addColorStop(0.75, '#ffdd00');
        gradient.addColorStop(0.9, '#ff4400');
        gradient.addColorStop(1, '#ff0000');

        ctx.fillStyle = gradient;
        ctx.fillRect(0, 2, barWidth, h - 4);

        const segW = 4, gap = 2;
        for (let x = 0; x < w; x += segW + gap) {
            ctx.fillStyle = '#0a0a14';
            ctx.fillRect(x, 0, gap, h);
        }
    }

    _drawPhaseMeter() {
        const canvas = this.canvases.phase;
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        const w = canvas.width;
        const h = canvas.height;

        // Get time-domain data from both channels
        const analyserA = this.router.channels.A.analyser;
        const analyserB = this.router.channels.B.analyser;
        const bufLen = analyserA.fftSize;
        const dataA = new Float32Array(bufLen);
        const dataB = new Float32Array(bufLen);
        analyserA.getFloatTimeDomainData(dataA);
        analyserB.getFloatTimeDomainData(dataB);

        // Cross-correlation at zero lag to estimate phase alignment
        let sumAB = 0, sumAA = 0, sumBB = 0;
        for (let i = 0; i < bufLen; i++) {
            sumAB += dataA[i] * dataB[i];
            sumAA += dataA[i] * dataA[i];
            sumBB += dataB[i] * dataB[i];
        }
        const denom = Math.sqrt(sumAA * sumBB);
        const correlation = denom > 0 ? sumAB / denom : 0; // -1 to +1

        ctx.clearRect(0, 0, w, h);
        ctx.fillStyle = '#0a0a14';
        ctx.fillRect(0, 0, w, h);

        // Draw center line
        const mid = w / 2;
        ctx.strokeStyle = '#333355';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(mid, 0);
        ctx.lineTo(mid, h);
        ctx.stroke();

        // Draw phase indicator
        const barX = mid + correlation * mid;
        const color = Math.abs(correlation) > 0.7 ? '#00ff44' : (Math.abs(correlation) > 0.3 ? '#ffdd00' : '#ff4400');
        ctx.fillStyle = color;
        ctx.fillRect(Math.min(mid, barX), 2, Math.abs(barX - mid), h - 4);

        // Labels
        ctx.font = '7px JetBrains Mono, monospace';
        ctx.fillStyle = '#555577';
        ctx.textAlign = 'left';
        ctx.fillText('-', 2, h / 2 + 3);
        ctx.textAlign = 'right';
        ctx.fillText('+', w - 2, h / 2 + 3);
    }

    _rmsLevel(data) {
        let sum = 0;
        for (let i = 0; i < data.length; i++) {
            const normalized = data[i] / 255;
            sum += normalized * normalized;
        }
        return Math.min(1, Math.sqrt(sum / data.length) * 1.5);
    }
}
