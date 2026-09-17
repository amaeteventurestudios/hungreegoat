// dj-autopilot.js — HUNGREE Goat, new file (not upstream Aurdour).
//
// Bridge that lets dj_orchestrator.py drive a real FlowMode Auto-DJ session headlessly,
// instead of simulating mouse clicks through the full console. Completely inert unless the
// page is loaded with ?autopilot=1 — the normal interactive app (and every upstream module)
// behaves exactly as authored otherwise.
//
// Reads from the URL: duration (seconds, target mix length), transitionSec, transitionType.
// Writes to window.__hgcAutopilot: { phase, elapsed, targetDurationSec, recipe[], error }
// which dj_orchestrator.py polls via Playwright's page.evaluate().
(function () {
    const params = new URLSearchParams(location.search);
    if (params.get('autopilot') !== '1') return;

    const targetDurationSec = parseFloat(params.get('duration') || '300');
    const fadeOutSec = Math.min(4, targetDurationSec / 10);

    window.__hgcAutopilot = { phase: 'waiting-for-app', elapsed: 0, targetDurationSec, error: null, recipe: [] };

    function waitFor(cond, timeoutMs) {
        return new Promise((resolve, reject) => {
            const start = Date.now();
            const t = setInterval(() => {
                if (cond()) { clearInterval(t); resolve(); }
                else if (Date.now() - start > timeoutMs) { clearInterval(t); reject(new Error('timeout waiting for ' + cond)); }
            }, 200);
        });
    }

    async function run() {
        await waitFor(() => window._djPlayer, 20000);
        const dj = window._djPlayer;

        window.__hgcAutopilot.phase = 'waiting-for-library';
        if (!(dj.library.tracks && dj.library.tracks.length)) {
            await new Promise((resolve) => window.addEventListener('hgc:library-loaded', resolve, { once: true }));
        }
        if (!dj.library.tracks.length) {
            window.__hgcAutopilot.phase = 'error';
            window.__hgcAutopilot.error = 'no eligible tracks in playlist';
            return;
        }
        if (!dj.flowMode || !dj.recorder) {
            window.__hgcAutopilot.phase = 'error';
            window.__hgcAutopilot.error = 'FlowMode or Recorder failed to initialize';
            return;
        }

        window.__hgcAutopilot.phase = 'starting';
        dj.audioRouter.resume();
        dj.flowMode.transitionDuration = parseFloat(params.get('transitionSec') || '8');
        dj.flowMode.transitionType = params.get('transitionType') || 'blend';
        dj.recorder.preferredFormat = 'webm';

        const t0 = Date.now();
        const first = dj.library.tracks[0];
        dj.flowMode.enable();
        dj.flowMode.start(first);
        window.__hgcAutopilot.recipe.push({ id: first.id, title: first.title, artist: first.artist,
            bpm: first.bpm, key: first.key, startedAtSec: 0 });

        // FlowMode's own _loadTrackToDeck is called for the first track and every subsequent
        // transition — wrap it (don't replace its behavior) purely to log the recipe.
        const origLoad = dj.flowMode._loadTrackToDeck.bind(dj.flowMode);
        dj.flowMode._loadTrackToDeck = function (deck, track) {
            const ok = origLoad(deck, track);
            if (ok && track !== first) {
                window.__hgcAutopilot.recipe.push({ id: track.id, title: track.title, artist: track.artist,
                    bpm: track.bpm, key: track.key, startedAtSec: (Date.now() - t0) / 1000 });
            }
            return ok;
        };

        // FlowMode.start() only loads deck A — in the normal interactive app the operator's
        // own click on the deck's PLAY button is what actually starts audio; every later
        // transition after this one is handled by AutoTransition.js, which does call
        // targetDeck.play() itself. Headless autopilot has no operator, so deck A needs an
        // explicit kick once its track has actually finished loading (wavesurfer's 'ready'
        // event / isLoaded) — without this the whole session records real silence.
        await waitFor(() => dj.decks.A.isLoaded, 20000);
        dj.decks.A.play();
        window.__hgcAutopilot.phase = 'playing-check';
        await new Promise((r) => setTimeout(r, 300));
        if (!dj.decks.A.isPlaying) {
            window.__hgcAutopilot.phase = 'error';
            window.__hgcAutopilot.error = 'deck A did not start playing';
            return;
        }

        dj.recorder.start();
        window.__hgcAutopilot.phase = 'recording';

        const tick = setInterval(() => {
            const elapsed = (Date.now() - t0) / 1000;
            window.__hgcAutopilot.elapsed = elapsed;
            if (elapsed >= targetDurationSec - fadeOutSec && window.__hgcAutopilot.phase === 'recording') {
                window.__hgcAutopilot.phase = 'fading';
                // Graceful fade to the requested endpoint instead of an abrupt cut.
                try {
                    const g = dj.audioRouter.masterGain.gain;
                    const now = dj.audioRouter.ctx.currentTime;
                    g.cancelScheduledValues(now);
                    g.setValueAtTime(g.value, now);
                    g.linearRampToValueAtTime(0.0001, now + fadeOutSec);
                } catch (e) { /* non-fatal — recording still stops on time */ }
            }
            if (elapsed >= targetDurationSec) {
                clearInterval(tick);
                window.__hgcAutopilot.phase = 'stopping';
                dj.recorder.stop();
                window.__hgcAutopilot.phase = 'stopped';
                window.__hgcAutopilot.actualDurationSec = elapsed;
            }
        }, 250);
    }

    run().catch((e) => { window.__hgcAutopilot.phase = 'error'; window.__hgcAutopilot.error = String(e && e.message || e); });
})();
