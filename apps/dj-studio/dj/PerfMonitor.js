// PerfMonitor.js — Performance monitoring: CPU, audio buffer health, latency

export class PerfMonitor {
    constructor(audioRouter) {
        this.router = audioRouter;
        this.ctx = audioRouter.getAudioContext();
        this._running = false;
        this._frameCount = 0;
        this._lastFrameTime = 0;
        this._fps = 0;
        this._cpuEstimate = 0;
    }

    start() {
        if (this._running) return;
        this._running = true;
        this._lastFrameTime = performance.now();
        this._frameCount = 0;
        this._tick();
        this._updateLoop();
    }

    stop() {
        this._running = false;
    }

    _tick() {
        if (!this._running) return;
        this._frameCount++;
        requestAnimationFrame(() => this._tick());
    }

    _updateLoop() {
        if (!this._running) return;

        setInterval(() => {
            const now = performance.now();
            const elapsed = (now - this._lastFrameTime) / 1000;
            this._fps = Math.round(this._frameCount / elapsed);
            this._frameCount = 0;
            this._lastFrameTime = now;

            // Estimate CPU from FPS drop (60fps = 0%, 30fps = ~50%)
            this._cpuEstimate = Math.max(0, Math.round((1 - this._fps / 60) * 100));

            this._updateUI();
        }, 2000);
    }

    _updateUI() {
        const latencyEl = document.getElementById('perf-latency');
        const cpuEl = document.getElementById('perf-cpu');
        const bufferEl = document.getElementById('perf-buffer');

        if (latencyEl) {
            const latency = this.ctx.baseLatency ? Math.round(this.ctx.baseLatency * 1000) : '--';
            latencyEl.textContent = `${latency}ms`;
        }

        if (cpuEl) {
            cpuEl.textContent = `${this._cpuEstimate}%`;
            cpuEl.style.color = this._cpuEstimate > 60 ? '#ff2200' : (this._cpuEstimate > 30 ? '#ffdd00' : '#00ff44');
        }

        if (bufferEl) {
            const state = this.ctx.state;
            bufferEl.textContent = state === 'running' ? 'OK' : state;
            bufferEl.style.color = state === 'running' ? '#00ff44' : '#ff2200';
        }
    }
}
