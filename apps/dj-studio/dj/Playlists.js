// Playlists.js — Crates, playlists, smart playlists, ratings, play counts
// Enhanced with full track object storage, reorder, and Library tab integration

export class Playlists {
    constructor(storage) {
        this.storage = storage;
        this.playlists = this.storage.get('playlists', []);
        this.ratings = this.storage.get('ratings', {}); // trackId -> 1-5
        this.playCounts = this.storage.get('playCounts', {});
        this.recentlyPlayed = this.storage.get('recentlyPlayed', []);
        this.likedTracks = this.storage.get('likedTracks', []); // array of track objects
        // Store full track objects per playlist for richer display
        this.playlistTrackData = this.storage.get('playlistTrackData', {}); // playlistId -> [track objects]
        this.activePlaylist = null;
        this.onFilterChange = null; // callback to re-render library

        this._initUI();
        this._migratePlaylistData();
    }

    _initUI() {
        const createBtn = document.getElementById('playlist-create');
        const listEl = document.getElementById('playlist-list');

        if (createBtn) {
            createBtn.addEventListener('click', () => {
                const name = prompt('Playlist name:');
                if (name) this.createPlaylist(name);
            });
        }
    }

    // Migrate old playlists that stored only track IDs to the new format
    _migratePlaylistData() {
        this.playlists.forEach(pl => {
            if (!this.playlistTrackData[pl.id]) {
                this.playlistTrackData[pl.id] = [];
            }
        });
    }

    // ===== Playlists (Crates) =====

    createPlaylist(name) {
        const id = Date.now().toString();
        this.playlists.push({ id, name, tracks: [] });
        this.playlistTrackData[id] = [];
        this._save('playlists');
        this._save('playlistTrackData');
        this._renderPlaylistList();
        return id;
    }

    deletePlaylist(id) {
        this.playlists = this.playlists.filter(p => p.id !== id);
        delete this.playlistTrackData[id];
        if (this.activePlaylist === id) this.activePlaylist = null;
        this._save('playlists');
        this._save('playlistTrackData');
        this._renderPlaylistList();
    }

    renamePlaylist(id, newName) {
        const p = this.playlists.find(p => p.id === id);
        if (p) { p.name = newName; this._save('playlists'); this._renderPlaylistList(); }
    }

    getPlaylists() {
        return [...this.playlists];
    }

    // Add a full track object to a playlist
    addTrackToPlaylist(playlistId, track) {
        const p = this.playlists.find(p => p.id === playlistId);
        if (!p) return;

        const trackKey = this._getTrackKey(track);
        if (!p.tracks.includes(trackKey)) {
            p.tracks.push(trackKey);
            if (!this.playlistTrackData[playlistId]) {
                this.playlistTrackData[playlistId] = [];
            }
            // Store a copy of track data (not the full object with circular refs)
            this.playlistTrackData[playlistId].push({
                id: track.id,
                title: track.title,
                artist: track.artist,
                bpm: track.bpm,
                key: track.key,
                duration: track.duration,
                genre: track.genre,
                artwork: track.artwork,
                source: track.source,
                sourceId: track.sourceId,
                streamUrl: track.streamUrl,
                dataFile: track.dataFile,
            });
            this._save('playlists');
            this._save('playlistTrackData');
        }
    }

    // Legacy addToPlaylist (by track ID string)
    addToPlaylist(playlistId, trackId) {
        const p = this.playlists.find(p => p.id === playlistId);
        if (p && !p.tracks.includes(trackId)) {
            p.tracks.push(trackId);
            this._save('playlists');
        }
    }

    removeFromPlaylist(playlistId, trackId) {
        const p = this.playlists.find(p => p.id === playlistId);
        if (p) {
            p.tracks = p.tracks.filter(t => t !== trackId);
            this._save('playlists');
        }
    }

    removeTrackFromPlaylist(playlistId, trackKey) {
        const p = this.playlists.find(p => p.id === playlistId);
        if (!p) return;

        const idx = p.tracks.indexOf(trackKey);
        if (idx >= 0) {
            p.tracks.splice(idx, 1);
        }
        if (this.playlistTrackData[playlistId]) {
            this.playlistTrackData[playlistId] = this.playlistTrackData[playlistId].filter(t => {
                return this._getTrackKey(t) !== trackKey;
            });
        }
        this._save('playlists');
        this._save('playlistTrackData');
    }

    reorderPlaylistTrack(playlistId, fromIndex, toIndex) {
        const data = this.playlistTrackData[playlistId];
        const p = this.playlists.find(p => p.id === playlistId);
        if (!data || !p) return;

        if (fromIndex < 0 || fromIndex >= data.length || toIndex < 0 || toIndex >= data.length) return;

        // Reorder track data
        const [movedTrack] = data.splice(fromIndex, 1);
        data.splice(toIndex, 0, movedTrack);

        // Reorder track IDs
        if (fromIndex < p.tracks.length && toIndex < p.tracks.length) {
            const [movedId] = p.tracks.splice(fromIndex, 1);
            p.tracks.splice(toIndex, 0, movedId);
        }

        this._save('playlists');
        this._save('playlistTrackData');
    }

    getPlaylistTracks(playlistId) {
        const p = this.playlists.find(p => p.id === playlistId);
        return p ? p.tracks : [];
    }

    getPlaylistTrackObjects(playlistId) {
        return this.playlistTrackData[playlistId] || [];
    }

    setActivePlaylist(id) {
        this.activePlaylist = id;
        this._renderPlaylistList();
        if (this.onFilterChange) this.onFilterChange();
    }

    // ===== Smart Playlists =====

    getSmartPlaylist(type, allTracks, params = {}) {
        switch (type) {
            case 'bpm-range':
                return allTracks.filter(t => t.bpm >= (params.min || 0) && t.bpm <= (params.max || 999));
            case 'key':
                return allTracks.filter(t => t.key === params.key);
            case 'genre':
                return allTracks.filter(t => (t.genre || '').toLowerCase() === (params.genre || '').toLowerCase());
            case 'top-rated':
                return allTracks.filter(t => (this.ratings[t.id] || 0) >= 4).sort((a, b) => (this.ratings[b.id] || 0) - (this.ratings[a.id] || 0));
            case 'most-played':
                return allTracks.sort((a, b) => (this.playCounts[b.id] || 0) - (this.playCounts[a.id] || 0)).slice(0, 50);
            case 'recently-played':
                return this.recentlyPlayed.slice(0, 30);
            default:
                return allTracks;
        }
    }

    // ===== Ratings =====

    setRating(trackId, rating) {
        this.ratings[trackId] = Math.max(0, Math.min(5, rating));
        this._save('ratings');
    }

    getRating(trackId) {
        return this.ratings[trackId] || 0;
    }

    // ===== Play Counts =====

    incrementPlayCount(trackId) {
        this.playCounts[trackId] = (this.playCounts[trackId] || 0) + 1;
        this._save('playCounts');

        // Update recently played
        this.recentlyPlayed = this.recentlyPlayed.filter(id => id !== trackId);
        this.recentlyPlayed.unshift(trackId);
        if (this.recentlyPlayed.length > 100) this.recentlyPlayed = this.recentlyPlayed.slice(0, 100);
        this._save('recentlyPlayed');
    }

    // ===== Related Tracks =====

    getRelatedTracks(currentTrack, allTracks, harmonicMixer) {
        if (!currentTrack) return [];

        return allTracks
            .filter(t => t.id !== currentTrack.id)
            .map(t => {
                let score = 0;

                // BPM compatibility (within +/-5%)
                if (currentTrack.bpm && t.bpm) {
                    const bpmRatio = t.bpm / currentTrack.bpm;
                    if (bpmRatio >= 0.95 && bpmRatio <= 1.05) score += 3;
                    else if (bpmRatio >= 0.9 && bpmRatio <= 1.1) score += 1;
                }

                // Key compatibility
                if (harmonicMixer && currentTrack.key && t.key) {
                    if (harmonicMixer.isCompatible(currentTrack.key, t.key)) score += 4;
                }

                // Same genre
                if (currentTrack.genre && t.genre && currentTrack.genre === t.genre) score += 1;

                return { track: t, score };
            })
            .filter(r => r.score > 0)
            .sort((a, b) => b.score - a.score)
            .slice(0, 10)
            .map(r => r.track);
    }

    // ===== Liked Tracks =====

    toggleLike(track) {
        const trackKey = this._getTrackKey(track);
        const idx = this.likedTracks.findIndex(t => this._getTrackKey(t) === trackKey);
        if (idx >= 0) {
            this.likedTracks.splice(idx, 1);
        } else {
            this.likedTracks.unshift({ ...track, likedAt: Date.now() });
        }
        this._save('likedTracks');
        return idx < 0; // returns true if now liked
    }

    isLiked(track) {
        const trackKey = this._getTrackKey(track);
        return this.likedTracks.some(t => this._getTrackKey(t) === trackKey);
    }

    getLikedTracks() {
        return [...this.likedTracks];
    }

    _getTrackKey(track) {
        if (track.source === 'audius') return `audius:${track.id}`;
        if (track.source === 'soundcloud') return `soundcloud:${track.id}`;
        if (track.source === 'spotify') return `spotify:${track.id}`;
        return track.dataFile || track.id || track.title;
    }

    _save(key) {
        this.storage.set(key, this[key]);
    }

    _renderPlaylistList() {
        const listEl = document.getElementById('playlist-list');
        if (!listEl) return;
        listEl.textContent = '';

        // "All tracks" option
        const allItem = document.createElement('div');
        allItem.className = `playlist-item${!this.activePlaylist ? ' active' : ''}`;
        allItem.textContent = 'All Tracks';
        allItem.addEventListener('click', () => this.setActivePlaylist(null));
        listEl.appendChild(allItem);

        this.playlists.forEach(p => {
            const item = document.createElement('div');
            item.className = `playlist-item${this.activePlaylist === p.id ? ' active' : ''}`;
            item.textContent = `${p.name} (${p.tracks.length})`;
            item.addEventListener('click', () => this.setActivePlaylist(p.id));

            item.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                const action = prompt(`${p.name}: rename, delete, or cancel?`);
                if (action === 'rename') {
                    const newName = prompt('New name:', p.name);
                    if (newName) this.renamePlaylist(p.id, newName);
                } else if (action === 'delete') {
                    this.deletePlaylist(p.id);
                }
            });

            listEl.appendChild(item);
        });
    }
}
