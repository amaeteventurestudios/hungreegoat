// CrashRecovery.js — Auto-save and restore app state for crash recovery

export class CrashRecovery {
    constructor() {
        this._key = 'aurdour_session';
        this._saveInterval = null;
        this._hasRecoveryData = false;
    }

    // Check if there's a previous session to recover
    hasRecoveryData() {
        try {
            const data = localStorage.getItem(this._key);
            if (!data) return false;
            const session = JSON.parse(data);
            // Only recover if session is less than 24 hours old
            const age = Date.now() - (session.timestamp || 0);
            return age < 24 * 60 * 60 * 1000;
        } catch (e) {
            return false;
        }
    }

    getRecoveryData() {
        try {
            return JSON.parse(localStorage.getItem(this._key));
        } catch (e) {
            return null;
        }
    }

    clearRecoveryData() {
        localStorage.removeItem(this._key);
    }

    // Start auto-saving state every N seconds
    startAutoSave(getStateFn, intervalMs = 5000) {
        this._saveInterval = setInterval(() => {
            try {
                const state = getStateFn();
                state.timestamp = Date.now();
                localStorage.setItem(this._key, JSON.stringify(state));
            } catch (e) {
                console.warn('Auto-save failed:', e);
            }
        }, intervalMs);

        // Also save before page unload
        window.addEventListener('beforeunload', () => {
            try {
                const state = getStateFn();
                state.timestamp = Date.now();
                localStorage.setItem(this._key, JSON.stringify(state));
            } catch (e) {}
        });
    }

    stopAutoSave() {
        if (this._saveInterval) {
            clearInterval(this._saveInterval);
            this._saveInterval = null;
        }
    }
}
