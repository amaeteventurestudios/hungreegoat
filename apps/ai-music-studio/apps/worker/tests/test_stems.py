import hashlib
import subprocess
import tempfile
import unittest
from pathlib import Path

from studio_worker.stems import LABELS, mix_stems


class StemTests(unittest.TestCase):
    def test_mix_renders_flac_and_preserves_all_stems(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            paths = {}
            for index, label in enumerate(LABELS):
                path = root / f"{label}.flac"
                subprocess.run(["ffmpeg", "-nostdin", "-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i", f"sine=frequency={220 + index * 110}:duration=1", "-c:a", "flac", str(path)], check=True, timeout=20)
                paths[label] = path
            original = {label: hashlib.sha256(path.read_bytes()).digest() for label, path in paths.items()}
            rendered = mix_stems(paths, {label: 1.0 for label in LABELS}, lambda: None)
            self.assertTrue(rendered.startswith(b"fLaC"))
            self.assertTrue(all(hashlib.sha256(path.read_bytes()).digest() == original[label] for label, path in paths.items()))


if __name__ == "__main__":
    unittest.main()
