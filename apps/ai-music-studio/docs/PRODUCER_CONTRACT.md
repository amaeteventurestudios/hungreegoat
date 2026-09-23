# AI Producer contract (Phase 07)

`POST /api/v1/songs/{song_id}/production-plans` creates a durable `producer.plan`
job from the selected enabled producer in workspace Settings. The request accepts a
UUID idempotency key and optional bounded refinement instructions. The browser sees
only public job state; it never receives the provider key or raw provider body.

The job contains typed song context, provider, model, instructions and the previous
active plan. Its lease-bound worker may retrieve only the selected credential through
the internal attempt route. OpenAI, OpenRouter and Anthropic adapters normalize each
structured response to style, BPM, key, instrumentation, structure, energy curve,
vocal direction, arrangement guidance, negative instructions and production notes.

Completion validates the plan, deactivates the previous active plan and writes the
next immutable version atomically. Fixtures exercise every adapter without a paid
provider request.
