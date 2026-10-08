# Validation record

Date: 8 October 2026 (IST). Scope: initial hackathon submission.

Latest checkpoint: v0.3, prompt 1.3. The repaired public API, seven separate live stage checks and a randomly selected real YouTube browser holdout completed. Detailed results and remaining omissions are in `REAL_TESTS.md`; saved outputs and screenshots are included. Earlier video/checks below remain the baseline history, with their matching sample outputs retained.

## Completed checks

- TypeScript typecheck and Vite production build: passed.
- 19 deterministic Vitest tests: passed. They cover ordered stages, raw preservation, exact-span patch application, overlap/ambiguity/no-op handling, reference cleanup, ownership/candidate classification, null field exports, CORS/input handling, partial-result recovery, cancellation, Retry-After handling and daily-quota behavior.
- Dependency audit: no reported vulnerabilities after updating development dependencies.
- Deployed Cloudflare API: actual Whisper transcription and both language-model stages returned successful results.
- Browser end-to-end run: sample audio loaded and processed; all result tabs rendered; TXT, Markdown, JSON and ZIP downloads succeeded; no uncaught page errors.
- Responsive layout: 390px viewport checked; no horizontal overflow.
- Browser empty file, unsupported extension and silent WAV: clear errors before sending audio upstream.
- Deployed corrupt-WAV request: HTTP 422 with a readable explanation.
- GitHub Actions: baseline test/build/Pages deployment completed successfully; public app returned HTTP 200.
- Final production-site browser run (prompt version 1.1): passed all three stages and every download, with zero uncaught page errors. Database migration stayed out of confirmed decisions; the three expected tasks and nullable fields were retained. Its captured video and actual exports are included.
- A second, freshly generated synthetic design-retrospective recording passed the complete CLI pipeline without a glossary. Both confirmed decisions and tasks were correctly empty. It was not supplied as text to the transcription stage.

## Live language-model regression cases

Full inputs and outputs are in `live-evaluation.json` (these are real API responses, separate from deterministic unit fixtures).

| Case | Expected | Observed |
|---|---|---|
| Proposal only; no agreement or tasks | Empty confirmed decisions and tasks | Passed |
| Task explicitly cancelled later | No surviving task | Passed |
| Agreed work with no owner or deadline | Task retained, both fields null | Passed |

The synthetic audio includes 30 versus 13 seconds, a $500 budget, a postponed public launch, a cancelled announcement, assigned and unassigned work, and a database proposal. The first live run retained the proposal in the decisions section while wording it as not agreed. Prompt/schema version 1.1 adds agreed/unresolved classification; the final production run put the migration proposal under open questions and retained the expected assignments. This is a targeted usability correction, not a guarantee of factual accuracy. Agreed assignments can appear in both decisions and tasks.

## Practical limits

No claim of zero hallucinations, benchmark-level accuracy, correct speaker diarization, unlimited recording length or unlimited concurrent usage. A small real-meeting evaluation is recorded in `REAL_TESTS.md`; it includes remaining errors and omissions and is not a benchmark. The app relies on free shared quotas, and completed progress is in-memory only. Maximum audio file size is 24 MiB; maximum transcript input to the language stages is 14,000 characters.

See `demo.webm` for the captured end-to-end workflow and `samples/` for its downloadable outputs. Generated content can differ between runs even at low temperature.
