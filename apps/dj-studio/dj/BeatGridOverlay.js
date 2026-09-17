// BeatGridOverlay.js — Visual beat grid, hot cue markers, loop highlights, and phase meter
// Overlays DOM elements on top of WaveSurfer waveform canvases

export class BeatGridOverlay {
    constructor(deckA, deckB) {
        this.decks = { A: deckA, B: deckB };
        this.overlays = {};
        this.gridVisible = { A: true, B: true };
        this._animFrameId = null;

        this._createOverlays('A');
        this._createOverlays('B');
        this._startRenderLoop();
    }

    _createOverlays(deckId) {
        const ch = deckId.toLowerCase();
        const waveformContainer = document.getElementById(`deck-${ch}-waveform`);
        if (!waveformContainer) return;

        // Ensure the waveform container is positioned for absolute children
        waveformContainer.style.position = 'relative';

        // Beat grid overlay container
        const gridLayer = document.createElement('div');
        gridLayer.className = `beat-grid-overlay beat-grid-overlay-${ch}`;
        gridLayer.id = `beat-grid-${ch}`;
        waveformContainer.appendChild(gridLayer);

        // Hot cue markers layer
        const cueLayer = document.createElement('div');
        cueLayer.className = `hotcue-overlay hotcue-overlay-${ch}`;
        cueLayer.id = `hotcue-overlay-${ch}`;
        waveformContainer.appendChild(cueLayer);

        // Loop region overlay (separate from WaveSurfer regions for custom styling)
        const loopLayer = document.createElement('div');
        loopLayer.className = `loop-overlay loop-overlay-${ch}`;
        loopLayer.id = `loop-overlay-${ch}`;
        waveformContainer.appendChild(loopLayer);

        this.overlays[deckId] = { gridLayer, cueLayer, loopLayer, container: waveformContainer };
    }

    // Toggle beat grid visibility for a specific deck
    toggleGrid(deckId) {
        this.gridVisible[deckId] = !this.gridVisible[deckId];
        const overlay = this.overlays[deckId];
        if (overlay) {
            overlay.gridLayer.style.display = this.gridVisible[deckId] ? '' : 'none';
        }
        return this.gridVisible[deckId];
    }

    setGridVisible(deckId, visible) {
        this.gridVisible[deckId] = visible;
        const overlay = this.overlays[deckId];
        if (overlay) {
            overlay.gridLayer.style.display = visible ? '' : 'none';
        }
    }

    _startRenderLoop() {
        const render = () => {
            this._renderDeck('A');
            this._renderDeck('B');
            this._renderPhaseMeter();
            this._animFrameId = requestAnimationFrame(render);
        };
        this._animFrameId = requestAnimationFrame(render);
    }

    _renderDeck(deckId) {
        const deck = this.decks[deckId];
        const overlay = this.overlays[deckId];
        if (!deck || !overlay || !deck.isLoaded) return;

        if (this.gridVisible[deckId]) {
            this._renderBeatGrid(deck, overlay);
        }
        this._renderHotCueMarkers(deck, overlay);
        this._renderLoopHighlight(deck, overlay);
    }

    _renderBeatGrid(deck, overlay) {
        const { gridLayer, container } = overlay;
        const beats = deck.beatPositions;
        if (!beats || beats.length === 0) {
            gridLayer.innerHTML = '';
            return;
        }

        const ws = deck.wavesurfer;
        if (!ws) return;

        const duration = ws.getDuration();
        if (duration <= 0) return;

        const containerWidth = container.clientWidth;
        const containerHeight = container.clientHeight;
        const currentTime = ws.getCurrentTime();

        // WaveSurfer v7 renders the full waveform in the container
        // The scroll position is determined by the cursor progress
        // We need to figure out how many seconds are visible
        // WaveSurfer uses the full width for the entire track (scrollable)

        // Get the wrapper that WaveSurfer uses for scrolling
        const wrapper = container.querySelector('div[data-testid="waveform"]') || container.firstElementChild;
        let scrollLeft = 0;
        let totalWidth = containerWidth;

        if (wrapper) {
            // WaveSurfer v7 uses a shadow DOM or a scrollable wrapper
            const scrollContainer = wrapper.closest('[style*="overflow"]') || wrapper.parentElement;
            if (scrollContainer && scrollContainer !== container) {
                scrollLeft = scrollContainer.scrollLeft || 0;
                totalWidth = wrapper.scrollWidth || wrapper.clientWidth || containerWidth;
            } else {
                // Try getting the scroll from the WaveSurfer wrapper directly
                const wsWrapper = container.querySelector('[part="wrapper"]') || container.children[0];
                if (wsWrapper) {
                    scrollLeft = wsWrapper.scrollLeft || 0;
                    totalWidth = wsWrapper.scrollWidth || containerWidth;
                }
            }
        }

        const pixelsPerSecond = totalWidth / duration;
        const viewStart = scrollLeft / pixelsPerSecond;
        const viewEnd = (scrollLeft + containerWidth) / pixelsPerSecond;

        const deckColor = deck.id === 'A' ? 'cyan' : 'orange';

        // Find visible beats using binary search
        let startIdx = this._binarySearchLeft(beats, viewStart - 1);
        let endIdx = this._binarySearchRight(beats, viewEnd + 1);

        // Build beat markers using document fragment for performance
        const fragment = document.createDocumentFragment();
        const existingCount = gridLayer.children.length;
        let markerIdx = 0;

        for (let i = startIdx; i <= endIdx && i < beats.length; i++) {
            const beatTime = beats[i];
            const xPos = (beatTime * pixelsPerSecond) - scrollLeft;

            // Skip off-screen markers
            if (xPos < -2 || xPos > containerWidth + 2) continue;

            const beatNumber = i + 1; // 1-indexed

            // Determine beat type
            let type = 'beat'; // every beat
            if (beatNumber % 16 === 1) type = 'phrase';      // every 16th beat (phrase)
            else if (beatNumber % 4 === 1) type = 'bar';     // every 4th beat (bar)

            let marker;
            if (markerIdx < existingCount) {
                marker = gridLayer.children[markerIdx];
            } else {
                marker = document.createElement('div');
                marker.className = 'beat-marker';
                fragment.appendChild(marker);
            }

            marker.className = `beat-marker beat-marker-${type} beat-marker-${deckColor}`;
            marker.style.left = `${xPos}px`;
            marker.style.height = `${containerHeight}px`;
            markerIdx++;
        }

        // Append new markers
        if (fragment.children.length > 0) {
            gridLayer.appendChild(fragment);
        }

        // Remove excess markers
        while (gridLayer.children.length > markerIdx) {
            gridLayer.lastChild.remove();
        }
    }

    _renderHotCueMarkers(deck, overlay) {
        const { cueLayer, container } = overlay;
        const ws = deck.wavesurfer;
        if (!ws) return;

        const duration = ws.getDuration();
        if (duration <= 0) return;

        const containerWidth = container.clientWidth;

        // Get scroll info
        const wrapper = container.querySelector('[part="wrapper"]') || container.children[0];
        let scrollLeft = 0;
        let totalWidth = containerWidth;
        if (wrapper) {
            scrollLeft = wrapper.scrollLeft || 0;
            totalWidth = wrapper.scrollWidth || containerWidth;
        }

        const pixelsPerSecond = totalWidth / duration;

        // Collect only visible cues first
        const visibleCues = [];
        for (let i = 0; i < deck.hotCues.length; i++) {
            const cue = deck.hotCues[i];
            if (!cue) continue;

            const xPos = (cue.time * pixelsPerSecond) - scrollLeft;
            if (xPos >= -20 && xPos <= containerWidth + 20) {
                visibleCues.push({ index: i, cue, xPos });
            }
        }

        // Reuse or create marker elements
        for (let j = 0; j < visibleCues.length; j++) {
            const { index, cue, xPos } = visibleCues[j];
            let marker;

            if (j < cueLayer.children.length) {
                marker = cueLayer.children[j];
            } else {
                marker = document.createElement('div');
                cueLayer.appendChild(marker);
            }

            marker.className = 'hotcue-marker';
            marker.style.left = `${xPos}px`;
            marker.style.setProperty('--cue-color', cue.color);
            marker.style.borderBottomColor = cue.color;
            marker.dataset.pad = index + 1;
            marker.textContent = index + 1;
        }

        // Remove excess
        while (cueLayer.children.length > visibleCues.length) {
            cueLayer.lastChild.remove();
        }
    }

    _renderLoopHighlight(deck, overlay) {
        const { loopLayer, container } = overlay;
        const ws = deck.wavesurfer;
        if (!ws) return;

        if (!deck.loop.active || deck.loop.inPoint === null || deck.loop.outPoint === null) {
            loopLayer.style.display = 'none';
            return;
        }

        const duration = ws.getDuration();
        if (duration <= 0) return;

        const containerWidth = container.clientWidth;
        const containerHeight = container.clientHeight;

        // Get scroll info
        const wrapper = container.querySelector('[part="wrapper"]') || container.children[0];
        let scrollLeft = 0;
        let totalWidth = containerWidth;
        if (wrapper) {
            scrollLeft = wrapper.scrollLeft || 0;
            totalWidth = wrapper.scrollWidth || containerWidth;
        }

        const pixelsPerSecond = totalWidth / duration;

        const loopStartX = (deck.loop.inPoint * pixelsPerSecond) - scrollLeft;
        const loopEndX = (deck.loop.outPoint * pixelsPerSecond) - scrollLeft;
        const loopWidth = loopEndX - loopStartX;

        if (loopEndX < 0 || loopStartX > containerWidth) {
            loopLayer.style.display = 'none';
            return;
        }

        const color = deck.id === 'A'
            ? 'rgba(0, 212, 255, 0.12)'
            : 'rgba(255, 107, 53, 0.12)';
        const borderColor = deck.id === 'A'
            ? 'rgba(0, 212, 255, 0.5)'
            : 'rgba(255, 107, 53, 0.5)';

        loopLayer.style.display = '';
        loopLayer.style.left = `${Math.max(0, loopStartX)}px`;
        loopLayer.style.width = `${Math.min(loopWidth, containerWidth - Math.max(0, loopStartX))}px`;
        loopLayer.style.height = `${containerHeight}px`;
        loopLayer.style.backgroundColor = color;
        loopLayer.style.borderLeftColor = borderColor;
        loopLayer.style.borderRightColor = borderColor;
    }

    _renderPhaseMeter() {
        const canvas = document.getElementById('phase-meter-canvas');
        if (!canvas) return;

        const deckA = this.decks.A;
        const deckB = this.decks.B;
        if (!deckA || !deckB || !deckA.isLoaded || !deckB.isLoaded) {
            // Clear the canvas when not applicable
            const ctx = canvas.getContext('2d');
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            return;
        }

        const bpmA = deckA.getBPM();
        const bpmB = deckB.getBPM();
        if (!bpmA || !bpmB) return;

        const timeA = deckA.getCurrentTime();
        const timeB = deckB.getCurrentTime();

        // Calculate beat phase (0..1) for each deck
        const beatIntervalA = 60 / (bpmA * (deckA.currentRate || 1));
        const beatIntervalB = 60 / (bpmB * (deckB.currentRate || 1));

        const phaseA = (timeA % beatIntervalA) / beatIntervalA;
        const phaseB = (timeB % beatIntervalB) / beatIntervalB;

        // Phase difference: -0.5 to +0.5
        let phaseDiff = phaseA - phaseB;
        if (phaseDiff > 0.5) phaseDiff -= 1;
        if (phaseDiff < -0.5) phaseDiff += 1;

        const ctx = canvas.getContext('2d');
        const w = canvas.width;
        const h = canvas.height;

        ctx.clearRect(0, 0, w, h);

        // Background track
        ctx.fillStyle = 'rgba(30, 30, 60, 0.6)';
        ctx.fillRect(0, 0, w, h);

        // Center line
        const cx = w / 2;
        ctx.fillStyle = 'rgba(100, 100, 180, 0.4)';
        ctx.fillRect(cx - 0.5, 0, 1, h);

        // Phase indicator dot
        const dotX = cx + phaseDiff * w;
        const dotRadius = Math.max(3, h / 2 - 1);

        // Color: green when synced (close to center), red/yellow when off
        const absDiff = Math.abs(phaseDiff);
        let dotColor;
        if (absDiff < 0.05) {
            dotColor = '#00ff88'; // synced
        } else if (absDiff < 0.15) {
            dotColor = '#ffcc00'; // slightly off
        } else {
            dotColor = '#ff4444'; // out of sync
        }

        ctx.beginPath();
        ctx.arc(dotX, h / 2, dotRadius, 0, Math.PI * 2);
        ctx.fillStyle = dotColor;
        ctx.fill();

        // Glow effect using shadow
        ctx.save();
        ctx.beginPath();
        ctx.arc(dotX, h / 2, dotRadius, 0, Math.PI * 2);
        ctx.shadowColor = dotColor;
        ctx.shadowBlur = 8;
        ctx.fillStyle = dotColor;
        ctx.fill();
        ctx.restore();

        // Labels
        ctx.font = '8px sans-serif';
        ctx.fillStyle = 'rgba(150, 150, 200, 0.6)';
        ctx.textAlign = 'left';
        ctx.fillText('A', 2, h - 2);
        ctx.textAlign = 'right';
        ctx.fillText('B', w - 2, h - 2);
    }

    _binarySearchLeft(arr, target) {
        let lo = 0, hi = arr.length - 1;
        while (lo < hi) {
            const mid = (lo + hi) >>> 1;
            if (arr[mid] < target) lo = mid + 1;
            else hi = mid;
        }
        return Math.max(0, lo - 1);
    }

    _binarySearchRight(arr, target) {
        let lo = 0, hi = arr.length - 1;
        while (lo < hi) {
            const mid = (lo + hi + 1) >>> 1;
            if (arr[mid] > target) hi = mid - 1;
            else lo = mid;
        }
        return Math.min(arr.length - 1, lo + 1);
    }

    destroy() {
        if (this._animFrameId) {
            cancelAnimationFrame(this._animFrameId);
        }
        Object.values(this.overlays).forEach(o => {
            o.gridLayer?.remove();
            o.cueLayer?.remove();
            o.loopLayer?.remove();
        });
    }
}
