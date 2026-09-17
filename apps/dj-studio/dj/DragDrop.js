// DragDrop.js — Drag & drop audio files from desktop onto decks + file picker buttons
// Includes: improved drop zone visuals, library-to-deck drag, audio validation, recently loaded tracks

export class DragDrop {
    constructor(decks, audioRouter) {
        this.decks = decks;
        this.router = audioRouter;
        this._dragEnterCount = { a: 0, b: 0 }; // track nested dragenter/dragleave

        this._initDropZones();
        this._initLoadButtons();
        this._initLibraryDrag();
    }

    // ===== LOAD BUTTONS =====

    _initLoadButtons() {
        ['a', 'b'].forEach(ch => {
            const deckId = ch.toUpperCase();
            const deckEl = document.getElementById(`deck-${ch}`);
            if (!deckEl) return;

            // Find the deck header to insert the load button
            const header = deckEl.querySelector('.deck-header');
            if (!header) return;

            const loadBtn = document.createElement('button');
            loadBtn.className = 'btn-mini load-file-btn';
            loadBtn.id = `load-file-${ch}`;
            loadBtn.textContent = 'LOAD';
            loadBtn.title = 'Load audio file from disk (.mp3, .wav, .ogg, .m4a, .flac)';
            header.appendChild(loadBtn);

            // Hidden file input
            const fileInput = document.createElement('input');
            fileInput.type = 'file';
            fileInput.accept = '.mp3,.wav,.ogg,.flac,.m4a,.aac,.opus,audio/*';
            fileInput.style.display = 'none';
            fileInput.id = `file-input-${ch}`;
            deckEl.appendChild(fileInput);

            loadBtn.addEventListener('click', () => {
                console.log(`[AUDIO:LOAD] Load button clicked for Deck ${deckId}`);
                fileInput.click();
            });

            fileInput.addEventListener('change', (e) => {
                const file = e.target.files[0];
                if (file) {
                    this._validateAndLoad(deckId, file);
                }
                fileInput.value = ''; // reset so same file can be re-selected
            });
        });
    }

    // ===== DROP ZONES =====

    _initDropZones() {
        ['a', 'b'].forEach(ch => {
            const deckId = ch.toUpperCase();
            const deckEl = document.getElementById(`deck-${ch}`);
            if (!deckEl) return;

            // Use dragenter/dragleave counter to handle nested elements
            deckEl.addEventListener('dragenter', (e) => {
                e.preventDefault();
                this._dragEnterCount[ch]++;
                if (this._dragEnterCount[ch] === 1) {
                    // Check if it's a file drag (from desktop) or library drag
                    const hasFiles = e.dataTransfer.types.includes('Files');
                    const hasLibTrack = e.dataTransfer.types.includes('application/x-aurdour-track');
                    if (hasFiles || hasLibTrack) {
                        deckEl.classList.add('deck-drop-active');
                        deckEl.classList.add('drag-over');
                    }
                }
            });

            deckEl.addEventListener('dragover', (e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'copy';
            });

            deckEl.addEventListener('dragleave', (e) => {
                this._dragEnterCount[ch]--;
                if (this._dragEnterCount[ch] <= 0) {
                    this._dragEnterCount[ch] = 0;
                    deckEl.classList.remove('deck-drop-active');
                    deckEl.classList.remove('drag-over');
                }
            });

            deckEl.addEventListener('drop', (e) => {
                e.preventDefault();
                this._dragEnterCount[ch] = 0;
                deckEl.classList.remove('deck-drop-active');
                deckEl.classList.remove('drag-over');

                // Check for library track drag first
                const trackDataStr = e.dataTransfer.getData('application/x-aurdour-track');
                if (trackDataStr) {
                    try {
                        const trackData = JSON.parse(trackDataStr);
                        console.log(`[AUDIO:DROP] Library track dropped on Deck ${deckId}: "${trackData.title}"`);
                        this._onLibraryTrackDrop(deckId, trackData);
                    } catch (err) {
                        console.error('[AUDIO:DROP] Failed to parse library track data:', err);
                    }
                    return;
                }

                // File drop from desktop
                const files = Array.from(e.dataTransfer.files);
                if (files.length > 0) {
                    const audioFile = files.find(f => this._isAudioFile(f));
                    if (audioFile) {
                        console.log(`[AUDIO:DROP] File dropped on Deck ${deckId}: "${audioFile.name}" (${(audioFile.size / 1024 / 1024).toFixed(1)}MB)`);
                        this.router.resume();
                        this._validateAndLoad(deckId, audioFile);
                    } else {
                        this._showToast(`"${files[0].name}" is not a supported audio file`, 'error');
                    }
                }
            });
        });

        // Global drop zone as fallback (loads to first available deck)
        document.body.addEventListener('dragover', (e) => {
            if (e.target.closest('.deck')) return; // handled by deck zones
            e.preventDefault();
        });

        document.body.addEventListener('drop', (e) => {
            if (e.target.closest('.deck')) return;
            e.preventDefault();
            const files = Array.from(e.dataTransfer.files);
            const audioFile = files.find(f => this._isAudioFile(f));
            if (audioFile) {
                const deckId = !this.decks.A.isLoaded ? 'A' : (!this.decks.B.isLoaded ? 'B' : 'A');
                this._validateAndLoad(deckId, audioFile);
            }
        });
    }

    // ===== LIBRARY-TO-DECK DRAG =====

    _initLibraryDrag() {
        // We set up a MutationObserver on the library body to make new rows draggable
        const libraryBody = document.getElementById('library-body');
        if (!libraryBody) return;

        const makeRowsDraggable = () => {
            const rows = libraryBody.querySelectorAll('tr');
            rows.forEach(row => {
                // Skip rows that are already set up or placeholder rows
                if (row.dataset.dragInit || row.querySelector('td[colspan]')) return;
                row.dataset.dragInit = 'true';
                row.draggable = true;

                row.addEventListener('dragstart', (e) => {
                    // Build track info from the row's cells
                    const cells = row.querySelectorAll('td');
                    if (cells.length < 5) return;

                    const titleCell = cells[0];
                    const artistCell = cells[1];
                    const bpmCell = cells[2];
                    const keyCell = cells[3];

                    const trackData = {
                        title: titleCell?.textContent?.trim() || 'Unknown',
                        artist: artistCell?.textContent?.trim() || '',
                        bpm: bpmCell?.textContent?.trim() || '-',
                        key: keyCell?.textContent?.trim() || '-',
                    };

                    // Check if row has a data-file attribute or load buttons with data
                    const btnA = row.querySelector('.btn-load-a');
                    const btnB = row.querySelector('.btn-load-b');

                    // Store track info including a way to trigger the load
                    // We'll use a custom MIME type to pass the data
                    row._trackButtons = { btnA, btnB };

                    e.dataTransfer.setData('application/x-aurdour-track', JSON.stringify(trackData));
                    e.dataTransfer.setData('text/plain', `${trackData.artist} - ${trackData.title}`);
                    e.dataTransfer.effectAllowed = 'copy';

                    row.classList.add('lib-row-dragging');

                    // Store the row reference so drop handlers can trigger its button
                    this._draggedLibRow = row;
                });

                row.addEventListener('dragend', () => {
                    row.classList.remove('lib-row-dragging');
                    this._draggedLibRow = null;
                });
            });
        };

        // Initial setup
        makeRowsDraggable();

        // Watch for changes (library re-renders, search, tab changes)
        const observer = new MutationObserver(() => {
            makeRowsDraggable();
        });
        observer.observe(libraryBody, { childList: true, subtree: true });
    }

    _onLibraryTrackDrop(deckId, trackData) {
        // Try to use the button click approach from the dragged row
        if (this._draggedLibRow) {
            const btn = deckId === 'A'
                ? this._draggedLibRow.querySelector('.btn-load-a')
                : this._draggedLibRow.querySelector('.btn-load-b');
            if (btn) {
                this.router.resume();
                btn.click();
                this._showToast(`Loaded "${trackData.title}" to Deck ${deckId}`, 'success');
                return;
            }
        }
        // Fallback: double-click the row (which loads to next available deck)
        console.warn('[AUDIO:DROP] Could not find load button on dragged row — trying double-click');
    }

    // ===== AUDIO VALIDATION =====

    _isAudioFile(file) {
        const audioTypes = ['audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/flac', 'audio/mp4', 'audio/x-m4a', 'audio/aac', 'audio/webm', 'audio/opus'];
        const audioExts = ['.mp3', '.wav', '.ogg', '.flac', '.m4a', '.aac', '.wma', '.opus'];
        return audioTypes.includes(file.type) || audioExts.some(ext => file.name.toLowerCase().endsWith(ext));
    }

    _validateAndLoad(deckId, file) {
        // Step 1: Quick check on extension/MIME type
        if (!this._isAudioFile(file)) {
            const ext = file.name.split('.').pop()?.toLowerCase() || '(none)';
            this._showToast(`Cannot load "${file.name}" — .${ext} is not a supported audio format. Use .mp3, .wav, .ogg, .m4a, or .flac`, 'error');
            console.warn(`[AUDIO:LOAD] Rejected file: "${file.name}" (type=${file.type}) — not a recognized audio format`);
            return;
        }

        // Step 2: Probe the file with an Audio element to verify it's actually playable
        const testUrl = URL.createObjectURL(file);
        const testAudio = new Audio();
        let validated = false;

        const cleanup = () => {
            testAudio.removeEventListener('canplaythrough', onCanPlay);
            testAudio.removeEventListener('error', onError);
            testAudio.src = '';
            // Don't revoke testUrl — we'll use it as the actual audio URL if valid
        };

        const onCanPlay = () => {
            if (validated) return;
            validated = true;
            cleanup();
            console.log(`[AUDIO:LOAD] File validated: "${file.name}" — audio is playable`);
            this.router.resume();
            this._loadFile(deckId, file, testUrl);
        };

        const onError = () => {
            if (validated) return;
            validated = true;
            cleanup();
            URL.revokeObjectURL(testUrl);
            this._showToast(`"${file.name}" could not be decoded — the file may be corrupted or in an unsupported format`, 'error');
            console.error(`[AUDIO:LOAD] Validation failed for "${file.name}": audio element reported error`);
        };

        testAudio.addEventListener('canplaythrough', onCanPlay);
        testAudio.addEventListener('error', onError);
        testAudio.preload = 'auto';
        testAudio.src = testUrl;

        // Timeout: if validation takes too long, proceed anyway (large files on slow systems)
        setTimeout(() => {
            if (!validated) {
                validated = true;
                cleanup();
                console.log(`[AUDIO:LOAD] Validation timed out for "${file.name}" — loading anyway`);
                this.router.resume();
                this._loadFile(deckId, file, testUrl);
            }
        }, 5000);
    }

    // ===== FILE LOADING =====

    async _loadFile(deckId, file, audioUrl) {
        const deck = this.decks[deckId];
        if (!deck) {
            console.error(`[AUDIO:LOAD] Deck ${deckId} not found!`);
            return;
        }

        console.log(`[AUDIO:LOAD] Loading file to Deck ${deckId}...`);
        console.log(`[AUDIO:LOAD]   File: "${file.name}" | Size: ${(file.size / 1024 / 1024).toFixed(2)}MB | Type: ${file.type}`);
        console.log(`[AUDIO:LOAD]   AudioContext state: ${this.router.ctx.state} | Sample rate: ${this.router.ctx.sampleRate}Hz`);

        // Use provided URL or create new one
        if (!audioUrl) {
            audioUrl = URL.createObjectURL(file);
        }
        console.log(`[AUDIO:LOAD]   Blob URL: ${audioUrl}`);

        // Extract filename-based metadata
        const name = file.name.replace(/\.[^/.]+$/, '');
        const parts = name.split(' - ');
        const title = parts.length > 1 ? parts[1].trim() : name;
        const artist = parts.length > 1 ? parts[0].trim() : '';

        // Create minimal metadata object
        deck.metadata = {
            audio_files: { mp3: audioUrl },
            metadata: {
                title,
                artist,
                bpm: null,
                key: null,
            },
        };

        deck.hotCues = new Array(8).fill(null);
        deck.cuePoint = 0;
        deck.isLoaded = false;
        deck.isPlaying = false;
        deck.loop = { active: false, inPoint: null, outPoint: null, region: null };
        deck.currentRate = 1.0;
        deck.beatPositions = [];

        console.log(`[AUDIO:LOAD]   Calling wavesurfer.load()...`);
        deck.wavesurfer.load(audioUrl);
        deck._updateDeckUI();

        // Show loading indicator
        const prefix = `deck-${deckId.toLowerCase()}`;
        const titleEl = document.getElementById(`${prefix}-title`);
        if (titleEl) titleEl.textContent = `Loading: ${title}...`;

        // Save to recently loaded tracks
        this._addToRecentTracks({ title, artist, fileName: file.name, loadedAt: Date.now() });

        // Show success toast
        this._showToast(`Loaded "${title}" to Deck ${deckId}`, 'success');
    }

    // ===== RECENTLY LOADED TRACKS =====

    _addToRecentTracks(trackInfo) {
        try {
            const key = 'aurdour_recent_tracks';
            let recent = JSON.parse(localStorage.getItem(key) || '[]');

            // Remove duplicate if same filename already exists
            recent = recent.filter(t => t.fileName !== trackInfo.fileName);

            // Add to front
            recent.unshift(trackInfo);

            // Keep only last 10
            if (recent.length > 10) {
                recent = recent.slice(0, 10);
            }

            localStorage.setItem(key, JSON.stringify(recent));
            console.log(`[AUDIO:RECENT] Saved "${trackInfo.title}" to recent tracks (${recent.length} total)`);
        } catch (e) {
            console.warn('[AUDIO:RECENT] Failed to save recent track:', e);
        }
    }

    static getRecentTracks() {
        try {
            return JSON.parse(localStorage.getItem('aurdour_recent_tracks') || '[]');
        } catch {
            return [];
        }
    }

    static clearRecentTracks() {
        try {
            localStorage.removeItem('aurdour_recent_tracks');
        } catch {
            // ignore
        }
    }

    // ===== TOAST NOTIFICATIONS =====

    _showToast(message, type = 'info') {
        const container = document.getElementById('toast-container');
        if (!container) {
            console.log(`[TOAST:${type.toUpperCase()}] ${message}`);
            return;
        }

        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.textContent = message;
        container.appendChild(toast);

        // Trigger show animation
        requestAnimationFrame(() => {
            toast.classList.add('show');
        });

        // Auto-dismiss after 4 seconds
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => toast.remove(), 300);
        }, 4000);
    }
}
