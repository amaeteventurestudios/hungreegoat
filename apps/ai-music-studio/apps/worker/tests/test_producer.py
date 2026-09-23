import json
import unittest
from unittest.mock import patch

from studio_worker.producer import create_plan
from studio_worker.runtime import WorkerFailure


def plan():
    return {
        "style": "warm electronic",
        "bpm": 118,
        "musical_key": "A minor",
        "instrumentation": ["sub bass"],
        "structure": ["intro", "chorus"],
        "energy_curve": ["gentle", "bright"],
        "vocal_direction": "Close and breathy",
        "arrangement_guidance": "Build slowly",
        "negative_instructions": ["No distortion"],
        "production_notes": "Keep the low end focused",
        "provider_request_id": None,
    }


class ProducerTests(unittest.TestCase):
    def test_openai_structured_output_and_request_id(self):
        with patch(
            "studio_worker.producer.request_json",
            return_value=({"output_text": json.dumps(plan()), "id": "response-id"}, "header-id"),
        ) as request:
            result = create_plan("openai", "gpt-test", "private", {"title": "Idea"})
        self.assertEqual(result["provider_request_id"], "header-id")
        url, headers, payload = request.call_args.args
        self.assertEqual(url, "https://api.openai.com/v1/responses")
        self.assertEqual(headers["Authorization"], "Bearer private")
        self.assertEqual(payload["text"]["format"]["type"], "json_schema")

    def test_openrouter_and_anthropic_response_shapes(self):
        for provider, response in [
            ("openrouter", {"choices": [{"message": {"content": json.dumps(plan())}}], "id": "router"}),
            ("anthropic", {"content": [{"text": json.dumps(plan())}], "id": "claude"}),
        ]:
            with self.subTest(provider=provider), patch(
                "studio_worker.producer.request_json", return_value=(response, None)
            ) as request:
                result = create_plan(provider, "model", "private", {"title": "Idea"})
            self.assertEqual(result["provider_request_id"], response["id"])
            self.assertEqual(request.call_args.args[2]["model"], "model")

    def test_invalid_response_and_unknown_provider_are_sanitized(self):
        with patch(
            "studio_worker.producer.request_json", return_value=({"output_text": "not json"}, None)
        ):
            with self.assertRaises(WorkerFailure) as failure:
                create_plan("openai", "model", "private", {"title": "Idea"})
        self.assertEqual(failure.exception.code, "provider_invalid_response")
        with self.assertRaises(WorkerFailure) as failure:
            create_plan("unavailable", "model", "private", {"title": "Idea"})
        self.assertEqual(failure.exception.code, "provider_unsupported")
