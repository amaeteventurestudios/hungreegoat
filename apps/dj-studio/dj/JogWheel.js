// JogWheel.js — Circular jog wheel for nudging, scratching, and beat jumping
// Enhanced: fractional beat jumps, beat position indicator

export class JogWheel {
    constructor(decks) {
        this.decks = decks;
        this.wheels = {};

        ['a', 'b'].forEach(ch => {
            const canvas = document.getElementById(`jog-${ch}`);
            if (!canvas) return;

            const deckId = ch.toUpperCase();
            this.wheels[deckId] = {
                canvas,
                ctx: canvas.getContext('2d'),
                dragging: false,
                lastAngle: 0,
                rotation: 0,
                nudgeTimeout: null,
            };

            this._initWheel(deckId, canvas);
            this._initBeatJumps(ch, deckId);
            this._initNudge(ch, deckId);
        });

        this._drawLoop();
        this._startBeatPositionUpdater();
    }

    // MIDI controller jog wheel: scratch (vinyl surface)
    scratch(deckId, delta) {
        const deck = this.decks[deckId];
        if (!deck || !deck.isLoaded) return;
        const scrubSpeed = 0.05; // seconds per unit delta
        const currentTime = deck.getCurrentTime();
        const dur = deck.getDuration();
        const newTime = Math.max(0, Math.min(dur, currentTime + delta * scrubSpeed));
        if (dur > 0) deck.wavesurfer.seekTo(newTime / dur);

        // Update visual rotation
        const state = this.wheels[deckId];
        if (state) state.rotation += delta * 0.5;
    }

    // MIDI controller jog wheel: nudge (outer ring pitch bend)
    nudge(deckId, amount) {
        const deck = this.decks[deckId];
        if (!deck || !deck.isLoaded) return;
        const baseRate = deck.currentRate;
        deck.wavesurfer.setPlaybackRate(baseRate + amount);

        // Return to base rate after brief moment
        const state = this.wheels[deckId];
        if (state) {
            clearTimeout(state.nudgeTimeout);
            state.nudgeTimeout = setTimeout(() => {
                deck.wavesurfer.setPlaybackRate(deck.currentRate);
            }, 150);
        }
    }

    _initWheel(deckId, canvas) {
        const state = this.wheels[deckId];
        const rect = () => canvas.getBoundingClientRect();

        const getAngle = (x, y) => {
            const r = rect();
            const cx = r.width / 2;
            const cy = r.height / 2;
            return Math.atan2(y - r.top - cy, x - r.left - cx);
        };

        const onStart = (x, y) => {
            state.dragging = true;
            state.lastAngle = getAngle(x, y);
            canvas.classList.add('active');
        };

        const onMove = (x, y) => {
            if (!state.dragging) return;
            const angle = getAngle(x, y);
            let delta = angle - state.lastAngle;

            // Handle angle wrapping
            if (delta > Math.PI) delta -= 2 * Math.PI;
            if (delta < -Math.PI) delta += 2 * Math.PI;

            state.lastAngle = angle;
            state.rotation += delta;

            // Scrub: delta maps to time offset
            const deck = this.decks[deckId];
            if (deck && deck.isLoaded) {
                const scrubSpeed = 0.15; // seconds per radian
                const currentTime = deck.getCurrentTime();
                const dur = deck.getDuration();
                const newTime = Math.max(0, Math.min(dur, currentTime + delta * scrubSpeed));
                if (dur > 0) deck.wavesurfer.seekTo(newTime / dur);
            }
        };

        const onEnd = () => {
            state.dragging = false;
            canvas.classList.remove('active');
        };

        // Mouse events
        canvas.addEventListener('mousedown', (e) => onStart(e.clientX, e.clientY));
        window.addEventListener('mousemove', (e) => onMove(e.clientX, e.clientY));
        window.addEventListener('mouseup', onEnd);

        // Touch events
        canvas.addEventListener('touchstart', (e) => {
            e.preventDefault();
            const t = e.touches[0];
            onStart(t.clientX, t.clientY);
        }, { passive: false });

        canvas.addEventListener('touchmove', (e) => {
            e.preventDefault();
            const t = e.touches[0];
            onMove(t.clientX, t.clientY);
        }, { passive: false });

        canvas.addEventListener('touchend', onEnd);
    }

    _initBeatJumps(ch, deckId) {
        const section = document.getElementById(`deck-${ch}`);
        if (!section) return;

        section.querySelectorAll('.beat-jump-btn').forEach(btn => {
            const beats = parseFloat(btn.dataset.beats); // parseFloat supports fractional beats
            const dir = btn.dataset.dir === 'fwd' ? 1 : -1;

            btn.addEventListener('click', () => {
                const deck = this.decks[deckId];
                const bpm = deck.getBPM();
                if (!bpm || !deck.isLoaded) return;

                const beatDuration = 60 / bpm;
                const jumpTime = beats * beatDuration * dir;
                const currentTime = deck.getCurrentTime();
                const dur = deck.getDuration();
                const newTime = Math.max(0, Math.min(dur, currentTime + jumpTime));
                if (dur > 0) deck.wavesurfer.seekTo(newTime / dur);

                // Flash the button
                btn.classList.add('active');
                setTimeout(() => btn.classList.remove('active'), 150);
            });
        });
    }

    _initNudge(ch, deckId) {
        const nudgeFwd = document.getElementById(`nudge-${ch}-fwd`);
        const nudgeBack = document.getElementById(`nudge-${ch}-back`);

        [nudgeFwd, nudgeBack].forEach((btn, i) => {
            if (!btn) return;
            const direction = i === 0 ? 1 : -1;

            const startNudge = () => {
                const deck = this.decks[deckId];
                if (!deck || !deck.isLoaded) return;
                const baseRate = deck.currentRate;
                deck.wavesurfer.setPlaybackRate(baseRate + direction * 0.04);
                btn.classList.add('active');
            };

            const stopNudge = () => {
                const deck = this.decks[deckId];
                if (!deck) return;
                deck.wavesurfer.setPlaybackRate(deck.currentRate);
                btn.classList.remove('active');
            };

            btn.addEventListener('mousedown', startNudge);
            btn.addEventListener('mouseup', stopNudge);
            btn.addEventListener('mouseleave', stopNudge);
            btn.addEventListener('touchstart', (e) => { e.preventDefault(); startNudge(); }, { passive: false });
            btn.addEventListener('touchend', stopNudge);
        });
    }

    // ===== BEAT POSITION INDICATOR =====

    _startBeatPositionUpdater() {
        setInterval(() => {
            ['a', 'b'].forEach(ch => {
                const deckId = ch.toUpperCase();
                const indicator = document.getElementById(`beat-pos-${ch}`);
                if (!indicator) return;

                const deck = this.decks[deckId];
                if (!deck || !deck.isLoaded) {
                    indicator.textContent = '--';
                    return;
                }

                const bpm = deck.getBPM();
                if (!bpm) {
                    indicator.textContent = '--';
                    return;
                }

                const currentTime = deck.getCurrentTime();
                const beatDuration = 60 / bpm;
                const currentBeat = currentTime / beatDuration;
                const bar = Math.floor(currentBeat / 4) + 1;
                const beatInBar = Math.floor(currentBeat % 4) + 1;

                indicator.textContent = `${bar}.${beatInBar}`;

                // Color the beat position based on beat in bar
                const colors = ['#ff4444', '#ffcc00', '#ffcc00', '#ffcc00'];
                indicator.style.color = colors[beatInBar - 1] || '#ffcc00';
            });
        }, 50); // Update ~20fps
    }

    _drawLoop() {
        Object.entries(this.wheels).forEach(([deckId, state]) => {
            this._drawWheel(deckId, state);
        });
        requestAnimationFrame(() => this._drawLoop());
    }

    _drawWheel(deckId, state) {
        const { canvas, ctx, rotation, dragging } = state;
        if (!canvas) return;

        const w = canvas.width;
        const h = canvas.height;
        const cx = w / 2;
        const cy = h / 2;
        const r = Math.min(cx, cy) - 4;

        ctx.clearRect(0, 0, w, h);

        // Outer ring
        const color = deckId === 'A' ? '#00d4ff' : '#ff6b35';
        const dimColor = deckId === 'A' ? 'rgba(0, 212, 255, 0.15)' : 'rgba(255, 107, 53, 0.15)';
        const activeColor = deckId === 'A' ? 'rgba(0, 212, 255, 0.3)' : 'rgba(255, 107, 53, 0.3)';

        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.strokeStyle = dragging ? activeColor : dimColor;
        ctx.lineWidth = 3;
        ctx.stroke();

        // Rotation indicator line
        const deck = this.decks[deckId];
        const isPlaying = deck?.isPlaying;
        if (isPlaying) {
            const time = deck.getCurrentTime();
            state.rotation = time * 2; // continuous rotation based on playback
        }

        const lineAngle = state.rotation;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(cx + Math.cos(lineAngle) * (r - 8), cy + Math.sin(lineAngle) * (r - 8));
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.stroke();

        // Beat indicator dots around the wheel
        if (deck?.isLoaded) {
            const bpm = deck.getBPM();
            if (bpm && isPlaying) {
                const currentTime = deck.getCurrentTime();
                const beatDuration = 60 / bpm;
                const beatPhase = (currentTime % beatDuration) / beatDuration;

                // Draw 4 beat marker dots around the wheel
                for (let i = 0; i < 4; i++) {
                    const angle = (i / 4) * Math.PI * 2 - Math.PI / 2;
                    const dotX = cx + Math.cos(angle) * (r + 1);
                    const dotY = cy + Math.sin(angle) * (r + 1);
                    const isCurrent = Math.abs(beatPhase - i / 4) < 0.15 || Math.abs(beatPhase - i / 4 + 1) < 0.15;

                    ctx.beginPath();
                    ctx.arc(dotX, dotY, isCurrent ? 3 : 1.5, 0, Math.PI * 2);
                    ctx.fillStyle = isCurrent ? color : dimColor;
                    ctx.fill();
                }
            }
        }

        // Center dot
        ctx.beginPath();
        ctx.arc(cx, cy, 4, 0, Math.PI * 2);
        ctx.fillStyle = dragging ? color : dimColor;
        ctx.fill();

        // Label
        ctx.font = '9px JetBrains Mono, monospace';
        ctx.fillStyle = '#555577';
        ctx.textAlign = 'center';
        ctx.fillText('JOG', cx, cy + r + 12);
    }
}
