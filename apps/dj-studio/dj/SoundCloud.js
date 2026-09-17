// SoundCloud.js — SoundCloud music platform integration
// Uses the SoundCloud public API to search, browse trending, and stream tracks

export class SoundCloud {
    constructor() {
        this.clientId = null;
        this.baseUrl = 'https://api-v2.soundcloud.com';
        this._initPromise = this._resolveClientId();
    }

    async _resolveClientId() {
        // SoundCloud client IDs can be extracted from their public page scripts
        // Use a well-known public client_id pattern
        try {
            // Try fetching SoundCloud's main page to extract client_id
            const resp = await fetch('https://soundcloud.com', { mode: 'cors' }).catch(() => null);
            if (resp && resp.ok) {
                const html = await resp.text();
                const scripts = html.match(/https:\/\/a-v2\.sndcdn\.com\/assets\/[^\s"]+\.js/g);
                if (scripts) {
                    for (const scriptUrl of scripts.slice(-3)) {
                        try {
                            const scriptResp = await fetch(scriptUrl);
                            const scriptText = await scriptResp.text();
                            const match = scriptText.match(/client_id:"([a-zA-Z0-9]+)"/);
                            if (match) {
                                this.clientId = match[1];
                                return;
                            }
                        } catch (_) { /* continue */ }
                    }
                }
            }
        } catch (e) {
            console.warn('[SoundCloud] Could not auto-resolve client_id:', e);
        }
        // Fallback — users can set their own client_id in settings
        this.clientId = null;
        console.warn('[SoundCloud] No client_id resolved. SoundCloud features may be limited.');
    }

    async _ensureReady() {
        await this._initPromise;
        return !!this.clientId;
    }

    async _apiGet(path) {
        if (!await this._ensureReady()) {
            throw new Error('SoundCloud client_id not available');
        }
        const separator = path.includes('?') ? '&' : '?';
        const url = `${this.baseUrl}${path}${separator}client_id=${this.clientId}`;
        const resp = await fetch(url);
        if (!resp.ok) throw new Error(`SoundCloud API error: ${resp.status}`);
        return resp.json();
    }

    async search(query) {
        if (!query || query.trim().length < 2) return [];
        const data = await this._apiGet(`/search/tracks?q=${encodeURIComponent(query)}&limit=30`);
        return (data.collection || []).map(t => this._normalizeTrack(t));
    }

    async getTrending(limit = 30) {
        try {
            const data = await this._apiGet(`/charts?kind=trending&genre=soundcloud:genres:all-music&limit=${limit}`);
            return (data.collection || []).map(item => this._normalizeTrack(item.track || item));
        } catch (e) {
            // Fallback: try discover endpoint
            try {
                const data = await this._apiGet(`/search/tracks?q=trending&limit=${limit}`);
                return (data.collection || []).map(t => this._normalizeTrack(t));
            } catch (_) {
                throw e;
            }
        }
    }

    async getStreamUrl(trackId) {
        if (!await this._ensureReady()) return null;
        try {
            const data = await this._apiGet(`/tracks/${trackId}`);
            if (data.media && data.media.transcodings) {
                // Prefer progressive (direct URL) over HLS
                const progressive = data.media.transcodings.find(t => t.format?.protocol === 'progressive');
                const hls = data.media.transcodings.find(t => t.format?.protocol === 'hls');
                const transcoding = progressive || hls;
                if (transcoding) {
                    const streamResp = await fetch(`${transcoding.url}?client_id=${this.clientId}`);
                    const streamData = await streamResp.json();
                    return streamData.url;
                }
            }
            // Fallback to direct stream
            return `https://api-v2.soundcloud.com/tracks/${trackId}/stream?client_id=${this.clientId}`;
        } catch (e) {
            console.warn('[SoundCloud] Failed to resolve stream URL:', e);
            return null;
        }
    }

    _normalizeTrack(raw) {
        if (!raw) return null;
        const artworkUrl = raw.artwork_url || raw.user?.avatar_url || null;
        return {
            id: raw.id,
            title: raw.title || 'Unknown',
            artist: raw.user?.username || 'Unknown Artist',
            duration: Math.round((raw.duration || 0) / 1000), // SoundCloud returns ms
            bpm: raw.bpm || null,
            key: raw.key_signature || null,
            genre: raw.genre || '',
            artwork: artworkUrl ? artworkUrl.replace('-large', '-t200x200') : null,
            playCount: raw.playback_count || 0,
            source: 'soundcloud',
            sourceId: raw.id,
            streamUrl: null, // Resolved lazily via getStreamUrl()
            permalink: raw.permalink_url || null,
        };
    }

    setClientId(id) {
        this.clientId = id;
    }
}
