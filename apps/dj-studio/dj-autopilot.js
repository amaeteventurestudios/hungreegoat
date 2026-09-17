// dj-autopilot.js — HUNGREE Goat, new file (not upstream Aurdour).
//
// Bridge that lets dj_orchestrator.py drive a real FlowMode Auto-DJ session headlessly,
// instead of simulating mouse clicks through the full console. Completely inert unless the
// page is loaded with ?autopilot=1 — the normal interactive app (and every upstream module)
// behaves exactly as authored otherwise.
//
// Reads from the URL: duration (seconds, target mix length), transitionSec, transitionType,
// tempoMode ('original'|'boost'|'target_bpm' — already resolved server-side, see
// dj_orchestrator.py _resolve_tempo; 'automatic'/'custom' never reach this file),
// tempoBoostPct, targetBpm, keyLock ('1'|'0').
// Writes to window.__hgcAutopilot: { phase, elapsed, targetDurationSec, recipe[], error }
// which dj_orchestrator.py polls via Playwright's page.evaluate().
(function () {
    const params = new URLSearchParams(location.search);
    if (params.get('autopilot') !== '1') return;

    const targetDurationSec = parseFloat(params.get('duration') || '300');
    const fadeOutSec = Math.min(4, targetDurationSec / 10);
    const tempoMode = params.get('tempoMode') || 'original';
    const tempoBoostPct = parseFloat(params.get('tempoBoostPct') || '0');
    const targetBpm = parseFloat(params.get('targetBpm') || '0') || null;
    const keyLockOn = params.get('keyLock') !== '0';

    // The one real DSP decision this file makes: how fast a track's source BPM maps to its
    // actual playback rate — everything else (the time-stretch/key-lock itself) is Deck.js's
    // own existing Deck.setPlaybackRate()/setKeyLock(), which is exactly the same code path
    // the owner used manually in the full console to get the result they liked at +50%. This
    // is deliberately NOT "double-time interpretation" (relabeling a slow track without
    // touching its audio) — Deck.setPlaybackRate() genuinely changes playback speed.
    function computeMultiplier(sourceBpm) {
        if (!sourceBpm || tempoMode === 'original') return 1;
        if (tempoMode === 'target_bpm' && targetBpm) return targetBpm / sourceBpm;
        return 1 + (tempoBoostPct / 100);
    }
    function applyTempo(deck, sourceBpm) {
        const multiplier = computeMultiplier(sourceBpm);
        deck.setKeyLock(keyLockOn);
        deck.setPlaybackRate(multiplier);   // Deck.js itself clamps to [0.5, 2.0]
        return { multiplier: deck.currentRate, effectiveBpm: sourceBpm ? sourceBpm * deck.currentRate : null };
    }

    window.__hgcAutopilot = { phase: 'waiting-for-app', elapsed: 0, targetDurationSec, error: null, recipe: [],
        tempo: { mode: tempoMode, boostPct: tempoBoostPct, targetBpm, keyLock: keyLockOn } };

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
        // FlowMode.start() loads deck A directly (see the ordering note below on why this
        // can't go through the wrapped _loadTrackToDeck for the first track) — apply tempo
        // to it here, once, the same way every later transition applies it to its own deck.
        const firstTempo = applyTempo(dj.decks.A, first.bpm);
        window.__hgcAutopilot.recipe.push({ id: first.id, title: first.title, artist: first.artist,
            bpm: first.bpm, key: first.key, deck: 'A', startedAtSec: 0,
            effectiveBpm: firstTempo.effectiveBpm, tempoMultiplier: firstTempo.multiplier, keyLock: keyLockOn });

        // FlowMode's own _loadTrackToDeck is called for every subsequent transition (not the
        // first track — start() above calls it directly, before this wrapper is installed) —
        // wrap it to apply tempo to the newly-loading deck and log the recipe. AutoTransition
        // itself (not this file) is what then calls targetDeck.play() and crossfades, so the
        // accelerated rate is already set by the time that happens — the mix never drops back
        // to a track's original speed mid-transition.
        const origLoad = dj.flowMode._loadTrackToDeck.bind(dj.flowMode);
        dj.flowMode._loadTrackToDeck = function (deck, track) {
            const ok = origLoad(deck, track);
            if (ok && track !== first) {
                const t = applyTempo(deck, track.bpm);
                window.__hgcAutopilot.recipe.push({ id: track.id, title: track.title, artist: track.artist,
                    bpm: track.bpm, key: track.key, deck: deck.id, startedAtSec: (Date.now() - t0) / 1000,
                    effectiveBpm: t.effectiveBpm, tempoMultiplier: t.multiplier, keyLock: keyLockOn });
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
