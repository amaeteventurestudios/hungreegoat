// WaveformCache.js — Cache waveform peak data and analysis in IndexedDB

export class WaveformCache {
    constructor() {
        this._db = null;
        this._dbReady = false;
        this._openDB();
    }

    async _openDB() {
        return new Promise((resolve) => {
            const req = indexedDB.open('aurdour-waveforms', 1);
            req.onupgradeneeded = (e) => {
                const db = e.target.result;
                if (!db.objectStoreNames.contains('peaks')) {
                    db.createObjectStore('peaks', { keyPath: 'id' });
                }
            };
            req.onsuccess = (e) => {
                this._db = e.target.result;
                this._dbReady = true;
                resolve();
            };
            req.onerror = () => resolve();
        });
    }

    async getPeaks(trackId) {
        if (!this._db) return null;
        return new Promise((resolve) => {
            const tx = this._db.transaction('peaks', 'readonly');
            const store = tx.objectStore('peaks');
            const req = store.get(trackId);
            req.onsuccess = () => resolve(req.result?.peaks || null);
            req.onerror = () => resolve(null);
        });
    }

    async savePeaks(trackId, peaks) {
        if (!this._db) return;
        const tx = this._db.transaction('peaks', 'readwrite');
        const store = tx.objectStore('peaks');
        store.put({ id: trackId, peaks, timestamp: Date.now() });
    }

    async clearAll() {
        if (!this._db) return;
        const tx = this._db.transaction('peaks', 'readwrite');
        const store = tx.objectStore('peaks');
        store.clear();
    }
}
