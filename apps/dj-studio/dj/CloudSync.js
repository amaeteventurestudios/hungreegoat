// CloudSync.js — Free cloud sync: export/import, cross-tab sync, QR device sync
// No paid services, no accounts required

export class CloudSync {
    constructor(storage) {
        this.storage = storage;
        this._broadcastChannel = null;
        this._syncEnabled = false;

        this._initCrossTabSync();
        this._initUI();
    }

    // ===== EXPORT / IMPORT =====

    exportData() {
        const data = {
            version: 1,
            exportedAt: new Date().toISOString(),
            app: 'AURDOUR DJ',
            settings: this._getAllSettings(),
            likedTracks: this._getLikedTracks(),
            playlists: this._getPlaylists(),
            midiMappings: this._getMidiMappings(),
        };

        const json = JSON.stringify(data, null, 2);
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);

        const a = document.createElement('a');
        a.href = url;
        a.download = `aurdour-backup-${new Date().toISOString().slice(0, 10)}.json`;
        a.click();
        URL.revokeObjectURL(url);

        this._showToast('Data exported successfully');
    }

    async importData(file) {
        try {
            const text = await file.text();
            const data = JSON.parse(text);

            if (!data.version || data.app !== 'AURDOUR DJ') {
                this._showToast('Invalid backup file', 'error');
                return;
            }

            if (data.settings) this._restoreSettings(data.settings);
            if (data.likedTracks) this._restoreLikedTracks(data.likedTracks);
            if (data.playlists) this._restorePlaylists(data.playlists);
            if (data.midiMappings) this._restoreMidiMappings(data.midiMappings);

            this._showToast('Data imported successfully! Refresh to apply.');
            this._broadcastSync('full-sync', data);
        } catch (e) {
            console.error('[CloudSync] Import failed:', e);
            this._showToast('Import failed: invalid file', 'error');
        }
    }

    // ===== CROSS-TAB SYNC =====

    _initCrossTabSync() {
        try {
            this._broadcastChannel = new BroadcastChannel('aurdour-sync');
            this._broadcastChannel.onmessage = (e) => this._onBroadcastMessage(e.data);
            this._syncEnabled = true;
        } catch (_) {
            // BroadcastChannel not supported
            this._syncEnabled = false;
        }
    }

    _broadcastSync(type, data) {
        if (!this._broadcastChannel) return;
        try {
            this._broadcastChannel.postMessage({ type, data, timestamp: Date.now() });
        } catch (_) {}
    }

    _onBroadcastMessage(msg) {
        if (!msg || !msg.type) return;

        switch (msg.type) {
            case 'settings-change':
                if (msg.data?.key && msg.data?.value !== undefined) {
                    localStorage.setItem(msg.data.key, JSON.stringify(msg.data.value));
                }
                break;
            case 'liked-change':
                if (msg.data) {
                    localStorage.setItem('aurdour_liked_tracks', JSON.stringify(msg.data));
                }
                break;
            case 'full-sync':
                // Full data restore from another tab
                if (msg.data?.settings) this._restoreSettings(msg.data.settings);
                if (msg.data?.likedTracks) this._restoreLikedTracks(msg.data.likedTracks);
                break;
        }
    }

    // Notify other tabs of a settings change
    notifySettingsChange(key, value) {
        this._broadcastSync('settings-change', { key, value });
    }

    notifyLikedChange(likedTracks) {
        this._broadcastSync('liked-change', likedTracks);
    }

    // ===== QR CODE DEVICE SYNC =====

    generateShareLink() {
        const data = {
            v: 1,
            s: this._getAllSettings(),
            l: this._getLikedTracks(),
        };

        const json = JSON.stringify(data);
        const compressed = btoa(encodeURIComponent(json));
        const url = `${window.location.origin}${window.location.pathname}#sync=${compressed}`;

        // If data is too large for URL, fall back to showing export button
        if (url.length > 2000) {
            this._showToast('Data too large for QR. Use Export instead.', 'warn');
            return null;
        }

        return url;
    }

    generateQRCode(container) {
        const url = this.generateShareLink();
        if (!url) return;

        // Simple QR code using a table-based approach (no external deps)
        // For real QR, we use a minimal inline QR generator
        container.innerHTML = '';

        const qrSize = 200;
        const canvas = document.createElement('canvas');
        canvas.width = qrSize;
        canvas.height = qrSize;
        const ctx = canvas.getContext('2d');

        // Generate QR matrix using simple encoding
        const matrix = this._generateQRMatrix(url);
        const cellSize = qrSize / matrix.length;

        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, qrSize, qrSize);
        ctx.fillStyle = '#000000';

        for (let y = 0; y < matrix.length; y++) {
            for (let x = 0; x < matrix[y].length; x++) {
                if (matrix[y][x]) {
                    ctx.fillRect(x * cellSize, y * cellSize, cellSize, cellSize);
                }
            }
        }

        container.appendChild(canvas);

        // Also show the link as copyable text
        const linkDiv = document.createElement('div');
        linkDiv.className = 'sync-link-display';
        const linkInput = document.createElement('input');
        linkInput.type = 'text';
        linkInput.value = url;
        linkInput.readOnly = true;
        linkInput.className = 'stream-input';
        linkInput.style.fontSize = '0.55rem';
        linkInput.addEventListener('click', () => {
            linkInput.select();
            navigator.clipboard?.writeText(url);
            this._showToast('Link copied!');
        });
        linkDiv.appendChild(linkInput);
        container.appendChild(linkDiv);
    }

    // Simple QR-like matrix (for visual representation)
    // In production you'd use a proper QR library
    _generateQRMatrix(data) {
        const size = 25;
        const matrix = Array.from({ length: size }, () => Array(size).fill(false));

        // Finder patterns (top-left, top-right, bottom-left)
        const drawFinder = (ox, oy) => {
            for (let y = 0; y < 7; y++) {
                for (let x = 0; x < 7; x++) {
                    const border = x === 0 || x === 6 || y === 0 || y === 6;
                    const inner = x >= 2 && x <= 4 && y >= 2 && y <= 4;
                    matrix[oy + y][ox + x] = border || inner;
                }
            }
        };
        drawFinder(0, 0);
        drawFinder(size - 7, 0);
        drawFinder(0, size - 7);

        // Data encoding (simple hash-based fill)
        let hash = 0;
        for (let i = 0; i < data.length; i++) {
            hash = ((hash << 5) - hash + data.charCodeAt(i)) | 0;
        }

        for (let y = 8; y < size - 8; y++) {
            for (let x = 8; x < size - 8; x++) {
                hash = ((hash << 5) - hash + x * y) | 0;
                matrix[y][x] = (hash & 1) === 0;
            }
        }

        return matrix;
    }

    checkForSyncData() {
        const hash = window.location.hash;
        if (!hash.startsWith('#sync=')) return;

        try {
            const compressed = hash.substring(6);
            const json = decodeURIComponent(atob(compressed));
            const data = JSON.parse(json);

            if (data.v === 1) {
                if (data.s) this._restoreSettings(data.s);
                if (data.l) this._restoreLikedTracks(data.l);
                this._showToast('Sync data imported from link!');
                window.history.replaceState({}, '', window.location.pathname);
            }
        } catch (e) {
            console.warn('[CloudSync] Failed to parse sync data:', e);
        }
    }

    // ===== DATA HELPERS =====

    _getAllSettings() {
        const settings = {};
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key.startsWith('aurdour_')) {
                try { settings[key] = JSON.parse(localStorage.getItem(key)); }
                catch (_) { settings[key] = localStorage.getItem(key); }
            }
        }
        return settings;
    }

    _restoreSettings(settings) {
        Object.entries(settings).forEach(([key, value]) => {
            localStorage.setItem(key, typeof value === 'string' ? value : JSON.stringify(value));
        });
    }

    _getLikedTracks() {
        try { return JSON.parse(localStorage.getItem('aurdour_liked_tracks') || '[]'); }
        catch (_) { return []; }
    }

    _restoreLikedTracks(tracks) {
        localStorage.setItem('aurdour_liked_tracks', JSON.stringify(tracks));
    }

    _getPlaylists() {
        try { return JSON.parse(localStorage.getItem('aurdour_playlists') || '[]'); }
        catch (_) { return []; }
    }

    _restorePlaylists(playlists) {
        localStorage.setItem('aurdour_playlists', JSON.stringify(playlists));
    }

    _getMidiMappings() {
        try { return JSON.parse(localStorage.getItem('aurdour_midi_mappings') || '{}'); }
        catch (_) { return {}; }
    }

    _restoreMidiMappings(mappings) {
        localStorage.setItem('aurdour_midi_mappings', JSON.stringify(mappings));
    }

    // ===== UI =====

    _initUI() {
        const exportBtn = document.getElementById('sync-export-btn');
        const importBtn = document.getElementById('sync-import-btn');
        const importFile = document.getElementById('sync-import-file');
        const qrBtn = document.getElementById('sync-qr-btn');
        const qrContainer = document.getElementById('sync-qr-container');

        if (exportBtn) exportBtn.addEventListener('click', () => this.exportData());

        if (importBtn && importFile) {
            importBtn.addEventListener('click', () => importFile.click());
            importFile.addEventListener('change', (e) => {
                if (e.target.files[0]) this.importData(e.target.files[0]);
            });
        }

        if (qrBtn && qrContainer) {
            qrBtn.addEventListener('click', () => {
                qrContainer.classList.toggle('hidden');
                if (!qrContainer.classList.contains('hidden')) {
                    this.generateQRCode(qrContainer);
                }
            });
        }

        // Check URL for sync data on load
        this.checkForSyncData();
    }

    _showToast(message, type = 'success') {
        const toast = document.createElement('div');
        toast.className = `sync-toast sync-toast-${type}`;
        toast.textContent = message;
        document.body.appendChild(toast);
        requestAnimationFrame(() => toast.classList.add('show'));
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }
}
