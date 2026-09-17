// HarmonicMixer.js — Camelot wheel harmonic mixing helper
// Maps musical keys to Camelot codes and suggests compatible transitions

export class HarmonicMixer {
    constructor() {
        // Camelot wheel: maps key names to Camelot codes
        this.camelotMap = {
            'Ab minor': '1A', 'B major': '1B',
            'Eb minor': '2A', 'F# major': '2B', 'Gb major': '2B',
            'Bb minor': '3A', 'Db major': '3B', 'C# major': '3B',
            'F minor': '4A', 'Ab major': '4B', 'G# major': '4B',
            'C minor': '5A', 'Eb major': '5B', 'D# major': '5B',
            'G minor': '6A', 'Bb major': '6B', 'A# major': '6B',
            'D minor': '7A', 'F major': '7B',
            'A minor': '8A', 'C major': '8B',
            'E minor': '9A', 'G major': '9B',
            'B minor': '10A', 'D major': '10B',
            'F# minor': '11A', 'Gb minor': '11A', 'A major': '11B',
            'Db minor': '12A', 'C# minor': '12A', 'E major': '12B',
            // Short key names
            'Abm': '1A', 'G#m': '1A', 'B': '1B',
            'Ebm': '2A', 'D#m': '2A', 'F#': '2B', 'Gb': '2B',
            'Bbm': '3A', 'A#m': '3A', 'Db': '3B', 'C#': '3B',
            'Fm': '4A', 'Ab': '4B', 'G#': '4B',
            'Cm': '5A', 'Eb': '5B', 'D#': '5B',
            'Gm': '6A', 'Bb': '6B', 'A#': '6B',
            'Dm': '7A', 'F': '7B',
            'Am': '8A', 'C': '8B',
            'Em': '9A', 'G': '9B',
            'Bm': '10A', 'D': '10B',
            'F#m': '11A', 'Gbm': '11A', 'A': '11B',
            'Dbm': '12A', 'C#m': '12A', 'E': '12B',
        };

        // Reverse map for display
        this.camelotToKey = {};
        Object.entries(this.camelotMap).forEach(([key, code]) => {
            if (!this.camelotToKey[code] || key.length < this.camelotToKey[code].length) {
                this.camelotToKey[code] = key;
            }
        });

        this._initUI();
    }

    _initUI() {
        // Camelot displays are updated when tracks load (called from player.js)
    }

    // Get Camelot code for a key string
    getCamelot(keyStr) {
        if (!keyStr) return null;
        return this.camelotMap[keyStr] || this.camelotMap[keyStr.trim()] || null;
    }

    // Get compatible keys (same, ±1 on wheel, parallel major/minor)
    getCompatible(camelotCode) {
        if (!camelotCode) return [];
        const num = parseInt(camelotCode);
        const letter = camelotCode.slice(-1);
        const otherLetter = letter === 'A' ? 'B' : 'A';

        const compatible = [
            camelotCode,                                          // same key
            `${((num - 2 + 12) % 12) + 1}${letter}`,           // -1 on wheel
            `${(num % 12) + 1}${letter}`,                        // +1 on wheel
            `${num}${otherLetter}`,                               // parallel major/minor
        ];

        return compatible;
    }

    // Check if two keys are harmonically compatible
    isCompatible(key1, key2) {
        const c1 = this.getCamelot(key1);
        const c2 = this.getCamelot(key2);
        if (!c1 || !c2) return null; // unknown
        return this.getCompatible(c1).includes(c2);
    }

    // Update deck UI with Camelot info and compatibility
    updateDeckDisplay(deckId, keyStr, otherKeyStr) {
        const ch = deckId.toLowerCase();
        const camelotEl = document.getElementById(`deck-${ch}-camelot`);
        const compatEl = document.getElementById(`deck-${ch}-compat`);

        const camelot = this.getCamelot(keyStr);
        if (camelotEl) {
            camelotEl.textContent = camelot || '';
            camelotEl.style.display = camelot ? '' : 'none';
        }

        if (compatEl && otherKeyStr) {
            const compat = this.isCompatible(keyStr, otherKeyStr);
            if (compat === null) {
                compatEl.textContent = '';
                compatEl.style.display = 'none';
            } else if (compat) {
                compatEl.textContent = 'MATCH';
                compatEl.className = 'compat-badge compat-match';
                compatEl.style.display = '';
            } else {
                compatEl.textContent = 'CLASH';
                compatEl.className = 'compat-badge compat-clash';
                compatEl.style.display = '';
            }
        }
    }
}
