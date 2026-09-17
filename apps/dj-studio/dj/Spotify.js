// Spotify.js — Spotify Web API integration with PKCE OAuth
// Uses 30-second preview URLs (free, no premium needed)
// Provides search, audio features, recommendations, and user playlists

export class Spotify {
    constructor() {
        this.clientId = null; // Must be set by user in settings
        this.accessToken = null;
        this.refreshToken = null;
        this.tokenExpiry = 0;
        this.baseUrl = 'https://api.spotify.com/v1';
        this.redirectUri = window.location.origin + window.location.pathname;
        this._codeVerifier = null;

        // Check for stored token
        this._loadToken();
        // Check for auth callback
        this._handleAuthCallback();
    }

    get isAuthenticated() {
        return !!this.accessToken && Date.now() < this.tokenExpiry;
    }

    setClientId(id) {
        this.clientId = id;
        localStorage.setItem('aurdour_spotify_client_id', id);
    }

    // OAuth2 PKCE flow — no backend needed
    async login() {
        if (!this.clientId) {
            console.warn('[Spotify] No client ID set. Get one from developer.spotify.com');
            return;
        }

        this._codeVerifier = this._generateCodeVerifier();
        const codeChallenge = await this._generateCodeChallenge(this._codeVerifier);
        sessionStorage.setItem('spotify_code_verifier', this._codeVerifier);

        const scopes = [
            'user-read-private',
            'playlist-read-private',
            'playlist-read-collaborative',
        ].join(' ');

        const params = new URLSearchParams({
            client_id: this.clientId,
            response_type: 'code',
            redirect_uri: this.redirectUri,
            scope: scopes,
            code_challenge_method: 'S256',
            code_challenge: codeChallenge,
        });

        window.location.href = `https://accounts.spotify.com/authorize?${params}`;
    }

    logout() {
        this.accessToken = null;
        this.refreshToken = null;
        this.tokenExpiry = 0;
        localStorage.removeItem('aurdour_spotify_token');
        localStorage.removeItem('aurdour_spotify_refresh');
        localStorage.removeItem('aurdour_spotify_expiry');
    }

    async search(query) {
        if (!query || query.trim().length < 2) return [];
        if (!this.isAuthenticated) return [];

        try {
            const data = await this._apiGet(`/search?q=${encodeURIComponent(query)}&type=track&limit=30`);
            const tracks = data.tracks?.items || [];
            // Fetch audio features in batch
            const ids = tracks.map(t => t.id).join(',');
            let features = {};
            if (ids) {
                try {
                    const featData = await this._apiGet(`/audio-features?ids=${ids}`);
                    (featData.audio_features || []).forEach(f => {
                        if (f) features[f.id] = f;
                    });
                } catch (_) {}
            }
            return tracks.map(t => this._normalizeTrack(t, features[t.id]));
        } catch (e) {
            console.error('[Spotify] Search failed:', e);
            return [];
        }
    }

    async getRecommendations(seedTrackIds = []) {
        if (!this.isAuthenticated || seedTrackIds.length === 0) return [];
        try {
            const seeds = seedTrackIds.slice(0, 5).join(',');
            const data = await this._apiGet(`/recommendations?seed_tracks=${seeds}&limit=20`);
            return (data.tracks || []).map(t => this._normalizeTrack(t));
        } catch (e) {
            console.error('[Spotify] Recommendations failed:', e);
            return [];
        }
    }

    async getUserPlaylists() {
        if (!this.isAuthenticated) return [];
        try {
            const data = await this._apiGet('/me/playlists?limit=50');
            return (data.items || []).map(p => ({
                id: p.id,
                name: p.name,
                trackCount: p.tracks?.total || 0,
                image: p.images?.[0]?.url || null,
            }));
        } catch (e) {
            console.error('[Spotify] Playlists failed:', e);
            return [];
        }
    }

    async getPlaylistTracks(playlistId) {
        if (!this.isAuthenticated) return [];
        try {
            const data = await this._apiGet(`/playlists/${playlistId}/tracks?limit=100`);
            return (data.items || [])
                .filter(i => i.track)
                .map(i => this._normalizeTrack(i.track));
        } catch (e) {
            console.error('[Spotify] Playlist tracks failed:', e);
            return [];
        }
    }

    _normalizeTrack(raw, features = null) {
        const preview = raw.preview_url;
        const artwork = raw.album?.images?.find(i => i.width <= 300)?.url
            || raw.album?.images?.[0]?.url || null;

        return {
            id: raw.id,
            title: raw.name || 'Unknown',
            artist: raw.artists?.map(a => a.name).join(', ') || 'Unknown Artist',
            duration: Math.round((raw.duration_ms || 0) / 1000),
            bpm: features?.tempo ? Math.round(features.tempo) : null,
            key: features ? this._pitchClassToKey(features.key, features.mode) : null,
            genre: '',
            artwork,
            energy: features?.energy || null,
            danceability: features?.danceability || null,
            valence: features?.valence || null,
            source: 'spotify',
            sourceId: raw.id,
            streamUrl: preview,
            hasPreview: !!preview,
        };
    }

    _pitchClassToKey(pitchClass, mode) {
        if (pitchClass === null || pitchClass === undefined || pitchClass < 0) return null;
        const keys = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
        const key = keys[pitchClass];
        return mode === 1 ? key : key + 'm';
    }

    async _apiGet(path) {
        if (!this.isAuthenticated) throw new Error('Not authenticated');
        const resp = await fetch(`${this.baseUrl}${path}`, {
            headers: { 'Authorization': `Bearer ${this.accessToken}` },
        });
        if (resp.status === 401) {
            await this._refreshAccessToken();
            const retry = await fetch(`${this.baseUrl}${path}`, {
                headers: { 'Authorization': `Bearer ${this.accessToken}` },
            });
            if (!retry.ok) throw new Error(`Spotify API error: ${retry.status}`);
            return retry.json();
        }
        if (!resp.ok) throw new Error(`Spotify API error: ${resp.status}`);
        return resp.json();
    }

    _loadToken() {
        this.clientId = localStorage.getItem('aurdour_spotify_client_id') || null;
        this.accessToken = localStorage.getItem('aurdour_spotify_token') || null;
        this.refreshToken = localStorage.getItem('aurdour_spotify_refresh') || null;
        this.tokenExpiry = parseInt(localStorage.getItem('aurdour_spotify_expiry') || '0', 10);
    }

    _saveToken(accessToken, refreshToken, expiresIn) {
        this.accessToken = accessToken;
        if (refreshToken) this.refreshToken = refreshToken;
        this.tokenExpiry = Date.now() + (expiresIn * 1000) - 60000; // 1 min buffer
        localStorage.setItem('aurdour_spotify_token', this.accessToken);
        if (this.refreshToken) localStorage.setItem('aurdour_spotify_refresh', this.refreshToken);
        localStorage.setItem('aurdour_spotify_expiry', String(this.tokenExpiry));
    }

    async _handleAuthCallback() {
        const params = new URLSearchParams(window.location.search);
        const code = params.get('code');
        if (!code) return;

        const verifier = sessionStorage.getItem('spotify_code_verifier');
        if (!verifier || !this.clientId) return;

        // Clean URL
        window.history.replaceState({}, '', window.location.pathname);
        sessionStorage.removeItem('spotify_code_verifier');

        try {
            const resp = await fetch('https://accounts.spotify.com/api/token', {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: new URLSearchParams({
                    grant_type: 'authorization_code',
                    code,
                    redirect_uri: this.redirectUri,
                    client_id: this.clientId,
                    code_verifier: verifier,
                }),
            });

            if (resp.ok) {
                const data = await resp.json();
                this._saveToken(data.access_token, data.refresh_token, data.expires_in);
            }
        } catch (e) {
            console.error('[Spotify] Token exchange failed:', e);
        }
    }

    async _refreshAccessToken() {
        if (!this.refreshToken || !this.clientId) return;
        try {
            const resp = await fetch('https://accounts.spotify.com/api/token', {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: new URLSearchParams({
                    grant_type: 'refresh_token',
                    refresh_token: this.refreshToken,
                    client_id: this.clientId,
                }),
            });
            if (resp.ok) {
                const data = await resp.json();
                this._saveToken(data.access_token, data.refresh_token, data.expires_in);
            }
        } catch (e) {
            console.error('[Spotify] Token refresh failed:', e);
        }
    }

    _generateCodeVerifier() {
        const arr = new Uint8Array(64);
        crypto.getRandomValues(arr);
        return btoa(String.fromCharCode(...arr))
            .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
    }

    async _generateCodeChallenge(verifier) {
        const data = new TextEncoder().encode(verifier);
        const digest = await crypto.subtle.digest('SHA-256', data);
        return btoa(String.fromCharCode(...new Uint8Array(digest)))
            .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
    }
}
