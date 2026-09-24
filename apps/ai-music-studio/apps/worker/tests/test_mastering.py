import hashlib
import subprocess
import tempfile
import unittest
from pathlib import Path

from studio_worker.mastering import render_export, render_master
from studio_worker.runtime import WorkerFailure


class MasteringTests(unittest.TestCase):
    def fixture(self, root: Path, name: str, frequency: int) -> Path:
        path = root / name
        subprocess.run(
            ["ffmpeg", "-nostdin", "-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i", f"sine=frequency={frequency}:duration=2", "-ar", "44100", "-ac", "2", str(path)],
            check=True,
            timeout=20,
        )
        return path

    def test_matchering_and_loudnorm_create_new_flac_without_touching_inputs(self):
        try:
            import matchering  # noqa: F401
        except ImportError:
            self.skipTest("Matchering is verified in the Studio worker image")
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source = self.fixture(root, "source.wav", 440)
            reference = self.fixture(root, "reference.wav", 660)
            originals = {path: hashlib.sha256(path.read_bytes()).digest() for path in (source, reference)}
            for engine, guide in (("matchering", reference), ("ffmpeg-loudnorm", None)):
                output = render_master(source, guide, {"engine": engine, "target_lufs": -14, "true_peak_dbtp": -1}, lambda: None)
                self.assertTrue(output.startswith(b"fLaC"))
            self.assertTrue(all(hashlib.sha256(path.read_bytes()).digest() == digest for path, digest in originals.items()))

    def test_wav_and_mp3_exports_are_bounded(self):
        with tempfile.TemporaryDirectory() as directory:
            source = self.fixture(Path(directory), "source.wav", 440)
            wav = render_export(source, {"format": "wav", "bit_depth": 24}, lambda: None)
            mp3 = render_export(source, {"format": "mp3", "mp3_bitrate_kbps": 192}, lambda: None)
            self.assertTrue(wav.startswith(b"RIFF"))
            self.assertGreater(len(mp3), 1000)
            with self.assertRaises(WorkerFailure):
                render_export(source, {"format": "mp3", "mp3_bitrate_kbps": 999}, lambda: None)


if __name__ == "__main__":
    unittest.main()
