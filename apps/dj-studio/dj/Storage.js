// Storage.js — Persist settings, cue points, MIDI mappings to localStorage

export class Storage {
    constructor() {
        this.prefix = 'aurdour_';
    }

    // ===== Generic get/set =====

    get(key, defaultValue = null) {
        try {
            const val = localStorage.getItem(this.prefix + key);
            return val !== null ? JSON.parse(val) : defaultValue;
        } catch (e) {
            return defaultValue;
        }
    }

    set(key, value) {
        try {
            localStorage.setItem(this.prefix + key, JSON.stringify(value));
        } catch (e) {
            console.warn('Storage save failed:', e);
        }
    }

    remove(key) {
        localStorage.removeItem(this.prefix + key);
    }

    // ===== Hot Cues per track =====

    saveCuePoints(trackId, hotCues) {
        const allCues = this.get('cuepoints', {});
        allCues[trackId] = hotCues.map(cue =>
            cue ? { time: cue.time, color: cue.color } : null
        );
        this.set('cuepoints', allCues);
    }

    loadCuePoints(trackId) {
        const allCues = this.get('cuepoints', {});
        return allCues[trackId] || null;
    }

    // ===== Loops per track =====

    saveLoops(trackId, loops) {
        const allLoops = this.get('loops', {});
        allLoops[trackId] = loops;
        this.set('loops', allLoops);
    }

    loadLoops(trackId) {
        const allLoops = this.get('loops', {});
        return allLoops[trackId] || null;
    }

    // ===== MIDI Mappings =====

    saveMidiMappings(mappings) {
        this.set('midi_mappings', mappings);
    }

    loadMidiMappings() {
        return this.get('midi_mappings', {});
    }

    // ===== Mixer/EQ Settings =====

    saveMixerSettings(settings) {
        this.set('mixer', settings);
    }

    loadMixerSettings() {
        return this.get('mixer', null);
    }

    // ===== User Preferences =====

    savePreferences(prefs) {
        this.set('prefs', prefs);
    }

    loadPreferences() {
        return this.get('prefs', {
            waveformMode: 'default', // default or rgb
            quantize: false,
            keyLock: true,
            vizMode: 'bars',
            recFormat: 'webm',
        });
    }

    // ===== Export/Import all settings =====

    exportAll() {
        const data = {};
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key.startsWith(this.prefix)) {
                data[key.slice(this.prefix.length)] = JSON.parse(localStorage.getItem(key));
            }
        }

        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `aurdour-settings-${new Date().toISOString().slice(0, 10)}.json`;
        a.click();
        URL.revokeObjectURL(url);
    }

    importAll(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const data = JSON.parse(e.target.result);
                    Object.entries(data).forEach(([key, value]) => {
                        this.set(key, value);
                    });
                    resolve();
                } catch (err) {
                    reject(err);
                }
            };
            reader.readAsText(file);
        });
    }
}
