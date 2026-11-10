# DeerFlow components integrated into HezTech

Upstream: https://github.com/bytedance/deer-flow
Pinned commit: `44e372dd7f8a511e6223f548f55f7b4c939ca226`
License: MIT; full copyright and license retained in LICENSE alongside this file.

## Copied modules and adaptations

- `backend/app/gateway/sse_headers.py` -> HezTech gateway `deerflow_sse.py`.
  Original logic retained, source/license header added. Actual chat SSE responses
  now set no-cache/no-transform and X-Accel-Buffering=no to prevent proxy buffering.
- `frontend/src/core/voice-input/speech-recognition.ts` -> desktop frontend
  `src/lib/deerflow/speech-recognition.ts`. Source/license header and explicit
  fa-IR handling added. VoiceOrb uses the transcript normalizer. This utility
  does not enable a recording engine or claim offline speech support.
- HezTech's existing Live event producer was repaired to emit whole-turn
  transcription snapshots. Previously each new fragment replaced the previous
  text in the panel; partial words are now preserved before normalization.

The desktop package includes `third_party/**/*` so redistributions retain the
MIT notice. Gateway distributions must retain their own third_party directory.
No DeerFlow server, panel, Docker stack, dependencies, credentials, or install
scripts were added. No external model route was silently changed.

## Remaining boundaries

DeerFlow is an agent harness; these two modules do not resolve Google's HTTP 403
or implement native bidirectional/offline speech. Existing local text inference
and the single HezTech desktop entry point are retained.

Potential future imports require separate inspection: provider adapters,
subagent lifecycle, durable task orchestration, and memory. Their integration
has not been implemented or claimed here.
