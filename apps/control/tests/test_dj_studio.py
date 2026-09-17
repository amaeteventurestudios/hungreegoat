"""Regression tests for the DJ Studio / Workout Mix Factory correction pass.

Run against the real deployed app and its real database/media paths (there is no separate
test fixture environment on this Pi) — every test that creates state cleans it up itself,
using names/ids prefixed "TEST_" or a dedicated tmp file so nothing here can be confused
with real operator data. Tests that would need a browser (real-time recording, FlowMode's
own track-selection logic) are out of scope for this file — those are covered by the manual
5-minute acceptance test in docs/dj-studio.md; this file covers everything reachable without
one: the data-layer invariants (Library/Mixes separation, path safety, math, persistence).

Run: cd apps/control && python -m unittest tests.test_dj_studio -v
(uses the real production venv's interpreter, e.g. ~/hungree-goat/venv/bin/python)
"""
from __future__ import annotations
import http.client
import io
import json
import os
import sys
import time
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
os.environ.setdefault("HGC_HOME", str(Path.home() / "hungree-goat"))
os.environ.setdefault("HGC_MEDIA", "/media/hungree-goat")

from hgc import auth, config, db, dj, skins  # noqa: E402

HOST, PORT = "127.0.0.1", config.API_PORT


def real_png_bytes() -> bytes:
    """A genuinely valid, freshly-encoded PNG (via the same Pillow the app itself uses to
    validate uploads) — not a hand-typed byte sequence that can silently bit-rot."""
    from PIL import Image
    import io
    buf = io.BytesIO()
    Image.new("RGB", (4, 4), (255, 0, 0)).save(buf, "PNG")
    return buf.getvalue()


def http_get(path, headers=None, station_ok=True):
    conn = http.client.HTTPConnection(HOST, PORT, timeout=10)
    conn.request("GET", path, headers=headers or {})
    r = conn.getresponse()
    body = r.read()
    conn.close()
    return r.status, dict(r.getheaders()), body


class TestLibraryMixSeparation(unittest.TestCase):
    """A. Mix save does not create a Library track. B. Library count unchanged.
    C. Deleting a Mix cannot delete source tracks/files."""

    def setUp(self):
        db.connect()
        self.track_count_before = db.q1("SELECT COUNT(*) n FROM tracks")["n"]

    def test_mix_create_does_not_touch_library(self):
        n_before = db.q1("SELECT COUNT(*) n FROM mixes")["n"]
        m = dj.mix_create(station="lofi", title="TEST_mix_no_library_row", playlist_id=None, profile_id=None,
                           workout_type="general", intensity="moderate", target_duration_sec=300, mastering_preset="workout_streaming")
        try:
            self.assertEqual(db.q1("SELECT COUNT(*) n FROM tracks")["n"], self.track_count_before,
                              "creating a mix must never change the Library track count")
            self.assertEqual(db.q1("SELECT COUNT(*) n FROM mixes")["n"], n_before + 1)
            # And the mix's own title must never appear as a track.
            self.assertIsNone(db.q1("SELECT id FROM tracks WHERE title=?", (m["title"],)))
        finally:
            dj.mix_delete(m["id"])

    def test_mix_delete_never_touches_tracks_table(self):
        # Use a real, currently-analyzed track id so this exercises the real join path.
        row = db.q1("SELECT id FROM tracks LIMIT 1")
        self.assertIsNotNone(row, "expected at least one Library track to exist")
        track_id = row["id"]
        before_hash_row = db.q1("SELECT sha256, path FROM tracks WHERE id=?", (track_id,))
        m = dj.mix_create(station="lofi", title="TEST_mix_delete_safety", playlist_id=None, profile_id=None,
                           workout_type="general", intensity="moderate", target_duration_sec=300, mastering_preset="workout_streaming")
        dj.mix_set_recipe(m["id"], [{"track_id": track_id, "deck": "A", "source_bpm": 90, "effective_bpm": 90,
                                      "tempo_adjust_pct": 0, "key_lock": True, "source_key": "Am",
                                      "start_offset_sec": 0, "transition_in_sec": 0, "transition_duration_sec": 8}])
        dj.mix_delete(m["id"])
        after_hash_row = db.q1("SELECT sha256, path FROM tracks WHERE id=?", (track_id,))
        self.assertEqual(dict(before_hash_row), dict(after_hash_row),
                          "deleting a mix must not alter the source track's row at all")
        self.assertTrue(Path(after_hash_row["path"]).is_file(), "source file must still exist on disk")
        self.assertEqual(db.q1("SELECT COUNT(*) n FROM mixes WHERE id=?", (m["id"],))["n"], 0)


class TestPlaylistMembership(unittest.TestCase):
    """D. Playlist membership does not copy/delete source files. S. Add Tracks dedup (#5)."""

    def test_membership_insert_is_idempotent_and_no_file_copy(self):
        row = db.q1("SELECT id FROM tracks LIMIT 1")
        track_id = row["id"]
        pl = db.q1("SELECT id FROM playlists WHERE station='lofi' AND kind='workout' LIMIT 1")
        if not pl:
            self.skipTest("no workout playlist present to test against")
        pid = pl["id"]
        had_before = bool(db.q1("SELECT 1 FROM playlist_tracks WHERE playlist_id=? AND track_id=?", (pid, track_id)))
        with db.tx() as c:
            c.execute("INSERT OR IGNORE INTO playlist_tracks(playlist_id,track_id,position) VALUES(?,?,"
                      "(SELECT COALESCE(MAX(position),-1)+1 FROM playlist_tracks WHERE playlist_id=?))", (pid, track_id, pid))
            c.execute("INSERT OR IGNORE INTO playlist_tracks(playlist_id,track_id,position) VALUES(?,?,"
                      "(SELECT COALESCE(MAX(position),-1)+1 FROM playlist_tracks WHERE playlist_id=?))", (pid, track_id, pid))
        n = db.q1("SELECT COUNT(*) n FROM playlist_tracks WHERE playlist_id=? AND track_id=?", (pid, track_id))["n"]
        self.assertEqual(n, 1, "the same track added twice must only ever produce one membership row")
        if not had_before:
            with db.tx() as c:
                c.execute("DELETE FROM playlist_tracks WHERE playlist_id=? AND track_id=?", (pid, track_id))


class TestProfileCRUD(unittest.TestCase):
    """E. Profile CRUD."""

    def test_create_read_update_delete(self):
        p = dj.profile_upsert({"name": "TEST_profile", "workout_type": "hiit", "default_intensity": "intense",
                                "tempo_mode": "boost", "tempo_boost_pct": 60})
        try:
            self.assertEqual(p["name"], "TEST_profile")
            got = dj.profile_get(p["id"])
            self.assertEqual(got["tempo_boost_pct"], 60)
            updated = dj.profile_upsert({"name": "TEST_profile_renamed", "enabled": False}, p["id"])
            self.assertEqual(updated["name"], "TEST_profile_renamed")
            self.assertEqual(updated["enabled"], 0)
        finally:
            dj.profile_delete(p["id"])
        self.assertIsNone(dj.profile_get(p["id"]))


class TestTempoMath(unittest.TestCase):
    """G. Actual tempo multiplier math."""

    def test_boost_percentages(self):
        sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "hgc"))
        from hgc.dj_orchestrator import _resolve_tempo
        for source_bpm, pct, expected in [(90, 50, 135.0), (90, 75, 157.5), (90, 100, 180.0), (80, 50, 120.0), (80, 100, 160.0)]:
            mode, boost, target = _resolve_tempo("boost", "moderate", pct, None)
            self.assertEqual(mode, "boost")
            self.assertAlmostEqual(source_bpm * (1 + boost / 100), expected, places=2)

    def test_automatic_maps_intensity(self):
        from hgc.dj_orchestrator import _resolve_tempo, INTENSITY_BOOST_PCT
        for intensity, expected_pct in INTENSITY_BOOST_PCT.items():
            mode, boost, target = _resolve_tempo("automatic", intensity, None, None)
            self.assertEqual(mode, "boost")
            self.assertEqual(boost, float(expected_pct))

    def test_original_mode_is_zero_boost(self):
        from hgc.dj_orchestrator import _resolve_tempo
        mode, boost, target = _resolve_tempo("original", "intense", 999, None)
        self.assertEqual(mode, "original")
        self.assertEqual(boost, 0.0)

    def test_target_bpm_requires_positive_value(self):
        from hgc.dj_orchestrator import _resolve_tempo
        with self.assertRaises(ValueError):
            _resolve_tempo("target_bpm", "moderate", None, None)
        mode, boost, target = _resolve_tempo("target_bpm", "moderate", None, 140)
        self.assertEqual(mode, "target_bpm")
        self.assertEqual(target, 140.0)


class TestManifestPlaylistFilter(unittest.TestCase):
    """H. Library/DJ adapter filters by selected playlist."""

    def test_manifest_only_returns_playlist_members(self):
        pl = db.q1("SELECT id, slug FROM playlists WHERE station='lofi' AND kind='workout' LIMIT 1")
        if not pl:
            self.skipTest("no workout playlist present")
        m = dj.manifest("lofi", pl["slug"])
        member_ids = {r["track_id"] for r in db.q("SELECT track_id FROM playlist_tracks WHERE playlist_id=?", (pl["id"],))}
        manifest_ids = {int(t["id"]) for t in m["tracks"]}
        self.assertTrue(manifest_ids.issubset(member_ids), "manifest must never include a track outside the requested playlist")

    def test_manifest_unknown_playlist_raises(self):
        with self.assertRaises(KeyError):
            dj.manifest("lofi", "TEST_definitely_not_a_real_playlist_slug")


class TestDurationPersistence(unittest.TestCase):
    """K. Duration API accepts the full range. L. target_duration survives a DB round trip."""

    def test_durations_round_trip(self):
        for minutes in (5, 60, 75, 90, 120):
            m = dj.mix_create(station="lofi", title=f"TEST_duration_{minutes}", playlist_id=None, profile_id=None,
                               workout_type="general", intensity="moderate", target_duration_sec=minutes * 60,
                               mastering_preset="workout_streaming")
            try:
                fetched = dj.mix_get(m["id"])
                self.assertEqual(fetched["target_duration_sec"], float(minutes * 60))
            finally:
                dj.mix_delete(m["id"])


class TestHttpAuthAndPathSafety(unittest.TestCase):
    """I. Mix file endpoint authorization/path handling. J. Path traversal rejected."""

    def test_mix_audio_requires_auth(self):
        status, _, _ = http_get("/api/dj/mixes/1/audio.wav")
        self.assertEqual(status, 401)

    def test_dj_profiles_requires_auth(self):
        status, _, _ = http_get("/api/dj/profiles")
        self.assertEqual(status, 401)

    def test_skin_asset_path_traversal_rejected(self):
        # A real client (curl, a browser, http.client itself) normalizes ../ segments in the
        # URL path before the request is even sent, and Starlette's {name} path parameter
        # doesn't match across a literal (post-decode) "/" at all — so a traversal attempt
        # can land on a 200 (falling through to the SPA's own catch-all shell route) just as
        # safely as a 404/400 from this endpoint's own explicit check. What actually matters,
        # and what would constitute a real failure, is the response body never containing
        # real file content it has no business serving.
        for attempt in ("../../etc/passwd", "..%2f..%2fetc%2fpasswd", "/etc/passwd", "..\\..\\etc\\passwd"):
            status, _, body = http_get(f"/v1/skins/assets/{attempt}")
            self.assertNotIn(b"root:", body, f"traversal attempt {attempt!r} must never leak real file content (status was {status})")
        # A single-segment, no-slash attempt that DOES reach skin_asset() must be rejected by
        # its own explicit check (name.startswith(".")) — this is the one case a client can't
        # normalize away for us, so verify it directly rather than only via the fallback above.
        status, _, body = http_get("/v1/skins/assets/..%5c..%5cetc%5cpasswd")
        self.assertEqual(status, 404)
        self.assertNotIn(b"root:", body)

    def test_track_audio_disabled_track_is_404(self):
        row = db.q1("SELECT id, enabled FROM tracks LIMIT 1")
        track_id, was_enabled = row["id"], row["enabled"]
        with db.tx() as c:
            c.execute("UPDATE tracks SET enabled=0 WHERE id=?", (track_id,))
        try:
            status, _, _ = http_get(f"/v1/tracks/{track_id}/audio.mp3")
            self.assertEqual(status, 404, "a disabled track's audio must not be servable by ID")
        finally:
            with db.tx() as c:
                c.execute("UPDATE tracks SET enabled=? WHERE id=?", (was_enabled, track_id))

    def test_robots_and_noindex_header_present(self):
        status, headers, body = http_get("/robots.txt")
        self.assertEqual(status, 200)
        self.assertIn(b"Disallow: /", body)
        self.assertIn("noindex", headers.get("x-robots-tag", ""))


class TestSkinMediaAndStaging(unittest.TestCase):
    """N. Skin media URL generation. O/P. Upload validation. Q. Thumbnail persistence.
    R. New Skin staging cleanup."""

    def test_asset_url_generation(self):
        self.assertEqual(skins._asset_url("foo.mp4"), "/v1/skins/assets/foo.mp4")
        self.assertEqual(skins._asset_url("https://player.hungreegoat.com/x.mp4"), "https://player.hungreegoat.com/x.mp4")
        self.assertIsNone(skins._asset_url(None))

    def test_image_upload_rejects_non_image_bytes(self):
        with self.assertRaises(ValueError):
            skins._validate_image_bytes(b"this is not an image, just text pretending to be one" * 10)

    def test_image_upload_accepts_real_png(self):
        skins._validate_image_bytes(real_png_bytes())  # must not raise

    def test_draft_create_and_cleanup_removes_row_and_files(self):
        draft = skins.create_draft()
        try:
            self.assertTrue(draft["draft"])
            self.assertNotIn(draft["id"], [s["id"] for s in skins.public_list(include_disabled=True)],
                              "a draft must never appear in any listing, even the operator's include_disabled one")
            png = real_png_bytes()
            name = skins.store_asset(draft["id"], "image", "test.png", png)
            asset_path = skins.SKINS_DIR / name
            self.assertTrue(asset_path.is_file())
        finally:
            skins.delete(draft["id"])
        self.assertIsNone(skins.get(draft["id"]))
        self.assertFalse(asset_path.is_file(), "the draft's uploaded asset must be removed along with the row")

    def test_incidental_upsert_does_not_finalize_draft(self):
        """Regression test for the exact bug found while building this: an auto-thumbnail
        upsert() call (no finalize_draft=True) must never clear the draft flag or rename it."""
        draft = skins.create_draft()
        try:
            skins.upsert({"thumbnail": "not-a-real-file.webp"}, draft["id"])  # incidental call
            still = skins.get(draft["id"])
            self.assertTrue(still["draft"], "an incidental upsert() must never finalize a draft")
            self.assertEqual(still["id"], draft["id"], "an incidental upsert() must never rename a draft's id")
        finally:
            skins.delete(draft["id"])

    def test_finalize_draft_renames_id_from_name(self):
        draft = skins.create_draft()
        real = None
        try:
            real = skins.upsert({"name": "TEST_finalize_profile_skin"}, draft["id"], finalize_draft=True)
            self.assertFalse(real["draft"])
            self.assertEqual(real["id"], "test-finalize-profile-skin")
            self.assertIsNone(skins.get(draft["id"]), "the old draft id must no longer resolve")
        finally:
            if real:
                skins.delete(real["id"])
            elif skins.get(draft["id"]):
                skins.delete(draft["id"])


if __name__ == "__main__":
    unittest.main(verbosity=2)
