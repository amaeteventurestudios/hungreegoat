import tempfile
import unittest
import wave
from pathlib import Path
from unittest.mock import patch
from uuid import uuid4

from studio_worker.audio import analyze_audio, render_tempo, source_path
from studio_worker.runtime import WorkerFailure


class AudioTests(unittest.TestCase):
    def test_source_path_accepts_only_a_bounded_regular_uuid_object(self):
        with tempfile.TemporaryDirectory() as directory:
            key = str(uuid4())
            path = Path(directory) / key
            path.write_bytes(b"safe fixture")
            with patch("studio_worker.audio.OBJECTS", Path(directory)):
                self.assertEqual(source_path(key), path)
                with self.assertRaises(WorkerFailure):
                    source_path("../outside")
                path.unlink()
                path.symlink_to(Path(directory) / "outside")
                with self.assertRaises(WorkerFailure):
                    source_path(key)

    def test_silent_wav_is_measured_without_fabricating_tempo_or_key(self):
        try:
            import librosa  # noqa: F401
            import soundfile  # noqa: F401
        except ImportError:
            self.skipTest("Audio dependencies are verified in the Studio worker image")
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "silence.wav"
            with wave.open(str(path), "wb") as output:
                output.setnchannels(1)
                output.setsampwidth(2)
                output.setframerate(22050)
                output.writeframes(b"\x00\x00" * 22050)
            result = analyze_audio(path, str(uuid4()))
            self.assertEqual(result["sample_rate"], 22050)
            self.assertEqual(result["channels"], 1)
            self.assertIsNone(result["detected_bpm"])
            self.assertIsNone(result["musical_key"])
            self.assertEqual(result["peaks"], [0.0] * 256)

    def test_rubberband_renders_new_flac_without_mutating_source(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "source.wav"
            with wave.open(str(path), "wb") as output:
                output.setnchannels(1)
                output.setsampwidth(2)
                output.setframerate(22050)
                output.writeframes(b"\x00\x00" * 22050)
            original = path.read_bytes()
            result = render_tempo(
                path,
                {
                    "ratio": 1.25,
                    "pitch_semitones": 0,
                    "preserve_pitch": True,
                    "preserve_formants": True,
                    "transients": "mixed",
                },
                lambda: None,
            )
            self.assertTrue(result.startswith(b"fLaC"))
            self.assertEqual(path.read_bytes(), original)


if __name__ == "__main__":
    unittest.main()
