// StreamBroadcast.js — Broadcast audio and track info for streaming
// Uses BroadcastChannel for local inter-tab communication (overlay page)
// Provides stream URL for WebRTC-based audio broadcast

export class StreamBroadcast {
    constructor(audioRouter, recorder) {
        this.router = audioRouter;
        this.recorder = recorder;
        this.channel = new BroadcastChannel('aurdour-dj');
        this.isLive = false;
        this.currentTrackInfo = { A: null, B: null };
        this.reactions = [];

        // Listen for messages from overlay/audience pages
        this.channel.onmessage = (e) => this._onMessage(e.data);

        this._initUI();
    }

    _initUI() {
        const liveBtn = document.getElementById('live-toggle');
        if (liveBtn) {
            liveBtn.addEventListener('click', () => {
                this.isLive = !this.isLive;
                liveBtn.classList.toggle('live', this.isLive);
                liveBtn.textContent = this.isLive ? 'ON AIR' : 'GO LIVE';
                this._broadcast({ type: 'live_status', isLive: this.isLive });
            });
        }
    }

    // Called by DJPlayer when tracks change or play state changes
    updateTrackInfo(deckId, metadata) {
        this.currentTrackInfo[deckId] = metadata;
        this._broadcast({
            type: 'track_update',
            deck: deckId,
            metadata: metadata?.metadata || null,
        });
    }

    updatePlayState(deckId, isPlaying, currentTime) {
        this._broadcast({
            type: 'play_state',
            deck: deckId,
            isPlaying,
            currentTime,
        });
    }

    // Send now-playing info
    sendNowPlaying(title, artist) {
        this._broadcast({
            type: 'now_playing',
            title,
            artist,
            timestamp: Date.now(),
        });
    }

    // Broadcast crossfader position (0..1, where 0 = full A, 1 = full B)
    updateCrossfaderPosition(position) {
        this._broadcast({
            type: 'crossfader_position',
            position,
        });
    }

    // Broadcast transition state (active auto-crossfade in progress)
    updateTransitionState(active, direction) {
        this._broadcast({
            type: 'transition_state',
            active,
            direction: direction || null,
        });
    }

    // Send full state snapshot to newly connected overlays
    _sendFullState() {
        // Re-send current track info for both decks
        for (const deckId of ['A', 'B']) {
            const info = this.currentTrackInfo[deckId];
            if (info) {
                try {
                    this.channel.postMessage({
                        type: 'track_update',
                        deck: deckId,
                        metadata: info?.metadata || null,
                    });
                } catch (e) { /* ignore */ }
            }
        }

        // Re-send crossfader position
        const cf = document.getElementById('crossfader');
        if (cf) {
            try {
                this.channel.postMessage({
                    type: 'crossfader_position',
                    position: parseInt(cf.value) / 100,
                });
            } catch (e) { /* ignore */ }
        }

        // Re-send live status
        try {
            this.channel.postMessage({ type: 'live_status', isLive: this.isLive });
        } catch (e) { /* ignore */ }
    }

    _broadcast(data) {
        if (!this.isLive) return;
        try {
            this.channel.postMessage(data);
        } catch (e) {
            console.warn('Broadcast failed:', e);
        }
    }

    _onMessage(data) {
        switch (data.type) {
            case 'reaction':
                this._showReaction(data.emoji);
                break;
            case 'song_request':
                this._showSongRequest(data.track);
                break;
            case 'chat':
                this._showChatMessage(data.user, data.message);
                break;
            case 'obs_overlay_connect':
                // New OBS overlay connected — send it the current state
                this._sendFullState();
                break;
        }
    }

    _showReaction(emoji) {
        const container = document.getElementById('reactions-container');
        if (!container) return;

        const el = document.createElement('div');
        el.className = 'reaction-float';
        el.textContent = emoji;
        el.style.left = `${20 + Math.random() * 60}%`;
        container.appendChild(el);

        setTimeout(() => el.remove(), 2500);
    }

    _showSongRequest(track) {
        const list = document.getElementById('requests-list');
        if (!list) return;

        const el = document.createElement('div');
        el.className = 'request-item';
        el.textContent = track;
        list.prepend(el);

        // Keep max 10
        while (list.children.length > 10) {
            list.lastChild.remove();
        }
    }

    _showChatMessage(user, message) {
        const list = document.getElementById('chat-messages');
        if (!list) return;

        const el = document.createElement('div');
        el.className = 'chat-msg';
        const userSpan = document.createElement('span');
        userSpan.className = 'chat-user';
        userSpan.textContent = user;
        el.appendChild(userSpan);
        el.appendChild(document.createTextNode(' ' + message));
        list.appendChild(el);
        list.scrollTop = list.scrollHeight;

        // Keep max 50
        while (list.children.length > 50) {
            list.firstChild.remove();
        }
    }

    getOutputStream() {
        return this.recorder?.getOutputStream() || null;
    }
}
