# Licensing Notes

This is an engineering checklist, not legal advice.

Hungree Goat may remain open source, become partially closed source, or become part of a future commercial transaction. Third-party licensing must therefore be tracked deliberately from the beginning.

## Components Requiring Review
- Windmill: track the exact deployed license/version and obligations.
- Rubber Band: review open-source obligations and commercial-license options before closed-source distribution.
- Matchering: track GPL obligations and distribution implications.
- Demucs: track exact repo/fork/model licenses; do not hardwire the platform to one implementation.
- shadcn/ui, Base UI, Tailwind, wavesurfer.js: include in third-party inventory.
- ElevenLabs, OpenAI, Claude: provider terms are separate from OSS licenses.

## Engineering Requirements
- pin versions
- maintain third-party notices
- record licenses/source URLs
- keep engines replaceable behind adapters
- review obligations before changing distribution model

Do not assume the root Hungree Goat LICENSE automatically resolves third-party obligations.
