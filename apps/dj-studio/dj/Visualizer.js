// Visualizer.js — Audio-reactive canvas visualizer driven by master analyser
// Multiple modes: bars, circular, particles, waveform

export class Visualizer {
    constructor(audioRouter) {
        this.router = audioRouter;
        this.canvas = document.getElementById('visualizer');
        this.ctx = this.canvas ? this.canvas.getContext('2d') : null;
        this.mode = 'bars'; // bars, circular, particles, wave
        this.running = false;
        this.particles = [];
        this.hueOffset = 0;

        this._initUI();
        this._resize();
        window.addEventListener('resize', () => this._resize());
    }

    _initUI() {
        const toggleBtn = document.getElementById('viz-toggle');
        const modeBtn = document.getElementById('viz-mode');

        if (toggleBtn) {
            toggleBtn.addEventListener('click', () => {
                if (this.running) {
                    this.stop();
                    toggleBtn.textContent = 'VIZ';
                    toggleBtn.classList.remove('active');
                } else {
                    this.start();
                    toggleBtn.textContent = 'VIZ ON';
                    toggleBtn.classList.add('active');
                }
            });
        }

        if (modeBtn) {
            modeBtn.addEventListener('click', () => {
                const modes = ['bars', 'circular', 'particles', 'wave'];
                const idx = modes.indexOf(this.mode);
                this.mode = modes[(idx + 1) % modes.length];
                modeBtn.textContent = this.mode.toUpperCase();
            });
        }
    }

    _resize() {
        if (!this.canvas) return;
        this.canvas.width = this.canvas.offsetWidth * window.devicePixelRatio;
        this.canvas.height = this.canvas.offsetHeight * window.devicePixelRatio;
    }

    start() {
        if (this.running) return;
        this.running = true;
        if (this.canvas) this.canvas.classList.remove('hidden');
        this._draw();
    }

    stop() {
        this.running = false;
        if (this.canvas) this.canvas.classList.add('hidden');
    }

    _draw() {
        if (!this.running || !this.ctx) return;
        if (document.hidden) { requestAnimationFrame(() => this._draw()); return; }

        const analyser = this.router.masterAnalyser;
        const bufferLength = analyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);
        analyser.getByteFrequencyData(dataArray);

        const timeData = new Uint8Array(bufferLength);
        analyser.getByteTimeDomainData(timeData);

        const w = this.canvas.width;
        const h = this.canvas.height;

        // Fade background
        this.ctx.fillStyle = 'rgba(13, 13, 26, 0.15)';
        this.ctx.fillRect(0, 0, w, h);

        this.hueOffset = (this.hueOffset + 0.3) % 360;

        switch (this.mode) {
            case 'bars': this._drawBars(dataArray, w, h); break;
            case 'circular': this._drawCircular(dataArray, w, h); break;
            case 'particles': this._drawParticles(dataArray, w, h); break;
            case 'wave': this._drawWave(timeData, w, h); break;
        }

        requestAnimationFrame(() => this._draw());
    }

    _drawBars(data, w, h) {
        const barCount = 64;
        const barWidth = w / barCount;
        const step = Math.floor(data.length / barCount);

        for (let i = 0; i < barCount; i++) {
            const val = data[i * step] / 255;
            const barH = val * h * 0.85;
            const hue = (this.hueOffset + i * 4) % 360;

            this.ctx.fillStyle = `hsla(${hue}, 80%, 60%, 0.9)`;
            this.ctx.fillRect(i * barWidth + 1, h - barH, barWidth - 2, barH);

            // Mirror reflection
            this.ctx.fillStyle = `hsla(${hue}, 80%, 60%, 0.15)`;
            this.ctx.fillRect(i * barWidth + 1, h - barH - 2, barWidth - 2, -barH * 0.3);
        }
    }

    _drawCircular(data, w, h) {
        const cx = w / 2;
        const cy = h / 2;
        const baseR = Math.min(w, h) * 0.2;
        const count = 128;
        const step = Math.floor(data.length / count);

        for (let i = 0; i < count; i++) {
            const val = data[i * step] / 255;
            const angle = (i / count) * Math.PI * 2;
            const r = baseR + val * baseR * 1.5;
            const hue = (this.hueOffset + i * 3) % 360;

            const x1 = cx + Math.cos(angle) * baseR;
            const y1 = cy + Math.sin(angle) * baseR;
            const x2 = cx + Math.cos(angle) * r;
            const y2 = cy + Math.sin(angle) * r;

            this.ctx.beginPath();
            this.ctx.moveTo(x1, y1);
            this.ctx.lineTo(x2, y2);
            this.ctx.strokeStyle = `hsla(${hue}, 80%, 60%, 0.8)`;
            this.ctx.lineWidth = 2;
            this.ctx.stroke();
        }

        // Center glow
        const avgLevel = data.reduce((a, b) => a + b, 0) / data.length / 255;
        const gradient = this.ctx.createRadialGradient(cx, cy, 0, cx, cy, baseR);
        gradient.addColorStop(0, `hsla(${this.hueOffset}, 70%, 60%, ${avgLevel * 0.4})`);
        gradient.addColorStop(1, 'transparent');
        this.ctx.fillStyle = gradient;
        this.ctx.fillRect(0, 0, w, h);
    }

    _drawParticles(data, w, h) {
        const avgLevel = data.reduce((a, b) => a + b, 0) / data.length / 255;

        // Spawn particles on beats
        if (avgLevel > 0.35 && this.particles.length < 200) {
            for (let i = 0; i < Math.floor(avgLevel * 8); i++) {
                this.particles.push({
                    x: Math.random() * w,
                    y: h + 10,
                    vx: (Math.random() - 0.5) * 4,
                    vy: -(1 + Math.random() * avgLevel * 8),
                    size: 2 + Math.random() * 4,
                    hue: (this.hueOffset + Math.random() * 60) % 360,
                    life: 1,
                    decay: 0.005 + Math.random() * 0.015,
                });
            }
        }

        // Update and draw particles
        this.particles = this.particles.filter(p => p.life > 0);
        for (const p of this.particles) {
            p.x += p.vx;
            p.y += p.vy;
            p.vy += 0.02; // slight gravity
            p.life -= p.decay;

            this.ctx.beginPath();
            this.ctx.arc(p.x, p.y, p.size * p.life, 0, Math.PI * 2);
            this.ctx.fillStyle = `hsla(${p.hue}, 80%, 60%, ${p.life * 0.8})`;
            this.ctx.fill();
        }
    }

    _drawWave(timeData, w, h) {
        this.ctx.beginPath();
        const sliceWidth = w / timeData.length;

        for (let i = 0; i < timeData.length; i++) {
            const v = timeData[i] / 128;
            const y = (v * h) / 2;
            const x = i * sliceWidth;

            if (i === 0) {
                this.ctx.moveTo(x, y);
            } else {
                this.ctx.lineTo(x, y);
            }
        }

        const hue = this.hueOffset % 360;
        this.ctx.strokeStyle = `hsla(${hue}, 80%, 60%, 0.8)`;
        this.ctx.lineWidth = 2;
        this.ctx.stroke();

        // Second offset wave
        this.ctx.beginPath();
        for (let i = 0; i < timeData.length; i++) {
            const v = timeData[i] / 128;
            const y = (v * h) / 2 + 4;
            const x = i * sliceWidth;
            if (i === 0) this.ctx.moveTo(x, y);
            else this.ctx.lineTo(x, y);
        }
        this.ctx.strokeStyle = `hsla(${(hue + 40) % 360}, 70%, 50%, 0.4)`;
        this.ctx.lineWidth = 1;
        this.ctx.stroke();
    }
}
