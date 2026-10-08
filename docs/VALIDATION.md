# Validation record

Date: 8 October 2026 (IST). Scope: initial hackathon submission.

## Completed checks

- TypeScript typecheck and Vite production build: passed.
- 18 deterministic Vitest tests: passed. They cover ordered stages, raw preservation, exact-span patch application, overlap/ambiguity handling, reference cleanup, null field exports, CORS/input handling, partial-result recovery, cancellation, Retry-After handling and daily-quota behavior.
- Dependency audit: no reported vulnerabilities after updating development dependencies.
- Deployed Cloudflare API: actual Whisper transcription and both language-model stages returned successful results.
- Browser end-to-end run: sample audio loaded and processed; all result tabs rendered; TXT, Markdown, JSON and ZIP downloads succeeded; no uncaught page errors.
- Responsive layout: 390px viewport checked; no horizontal overflow.
- Browser empty file, unsupported extension and silent WAV: clear errors before sending audio upstream.
- Deployed corrupt-WAV request: HTTP 422 with a readable explanation.
- GitHub Actions: baseline test/build/Pages deployment completed successfully; public app returned HTTP 200.

## Live language-model regression cases

Full inputs and outputs are in `live-evaluation.json` (these are real API responses, separate from deterministic unit fixtures).

| Case | Expected | Observed |
|---|---|---|
| Proposal only; no agreement or tasks | Empty confirmed decisions and tasks | Passed |
| Task explicitly cancelled later | No surviving task | Passed |
| Agreed work with no owner or deadline | Task retained, both fields null | Passed |

The synthetic audio includes 30 versus 13 seconds, a $500 budget, a postponed public launch, a cancelled announcement, assigned and unassigned work, and a database proposal. The first live run retained the proposal in the decisions section while wording it as not agreed. Prompt/schema version 1.1 adds agreed/unresolved classification to separate those categories. This is a targeted usability correction, not a guarantee of factual accuracy.

## Practical limits

No claim of zero hallucinations, benchmark-level accuracy, correct speaker diarization, unlimited recording length or unlimited concurrent usage. The sample is synthetic and clear; real noisy/multi-speaker meetings have not been benchmarked. The app relies on free shared quotas, and completed progress is in-memory only. Maximum audio file size is 24 MiB; maximum transcript input to the language stages is 14,000 characters.

See `demo.webm` for the captured end-to-end workflow and `samples/` for its downloadable outputs. Generated content can differ between runs even at low temperature.
