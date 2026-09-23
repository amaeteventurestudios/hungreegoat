import unittest
from email.message import Message
from unittest.mock import patch

from studio_worker.music import request_music
from studio_worker.runtime import WorkerFailure


class Response:
    def __init__(self, body=b"audio", content_type="audio/mpeg", request_id="song-1"):
        self.body = body
        self.headers = Message()
        self.headers["Content-Type"] = content_type
        self.headers["song-id"] = request_id

    def read(self, size):
        return self.body

    def __enter__(self):
        return self

    def __exit__(self, *args):
        return False


class MusicTests(unittest.TestCase):
    def test_elevenlabs_request_is_bounded_and_tracks_song_id(self):
        with patch("studio_worker.music.urllib.request.urlopen", return_value=Response()) as request:
            audio, media_type, request_id = request_music(
                "private-key",
                {
                    "model": "music_v2",
                    "prompt": "warm instrumental",
                    "duration_seconds": 90,
                    "force_instrumental": True,
                },
            )
        self.assertEqual((audio, media_type, request_id), (b"audio", "audio/mpeg", "song-1"))
        outbound = request.call_args.args[0]
        self.assertEqual(outbound.full_url, "https://api.elevenlabs.io/v1/music")
        self.assertEqual(outbound.get_header("Xi-api-key"), "private-key")
        self.assertIn(b'"music_length_ms":90000', outbound.data)
        self.assertIn(b'"force_instrumental":true', outbound.data)

    def test_invalid_provider_audio_is_sanitized(self):
        with (
            patch(
                "studio_worker.music.urllib.request.urlopen",
                return_value=Response(b"", "text/plain"),
            ),
            self.assertRaises(WorkerFailure) as failure,
        ):
            request_music("private-key", {"model": "music_v2", "prompt": "x", "duration_seconds": 3})
        self.assertEqual(failure.exception.code, "provider_invalid_response")


if __name__ == "__main__":
    unittest.main()
