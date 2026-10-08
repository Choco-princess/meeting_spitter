# Technical description

## Pipeline

The React client on GitHub Pages orchestrates three sequential requests to a Cloudflare Worker. Clicking Start runs all stages automatically. The Worker forwards bounded requests to Groq using a server-side secret. No developer laptop or persistent application database is needed.

1. **Transcription:** Whisper Large V3 (`whisper-large-v3`), English, temperature 0, verbose JSON with segment timestamps. The application retains the raw text unchanged and assigns stable segment IDs. Whisper may still misrecognize speech, especially names and unclear audio. There is no diarization.
2. **Refinement:** GPT OSS 20B (`openai/gpt-oss-20b`) receives the timestamped segments and optional terminology glossary. It returns exact-span correction proposals through a strict JSON schema. Patches are resolved against the original segment and applied right-to-left. Missing, overlapping or ambiguous spans are left unchanged and noted. This prevents text corruption without restricting the model to verbatim summaries.
3. **Documentation:** GPT OSS 120B (`openai/gpt-oss-120b`) receives the refined segments. It produces summary bullets, topic-organized minutes, decision candidates, tasks and open questions. Candidates are labeled agreed or unresolved in the same generation; unresolved items remain visible under open questions. There is no extra verification model or proof requirement. Owners/deadlines are nullable, and relative deadlines remain literal.

The language models run at temperature 0.1 with low reasoning effort and bounded completion tokens. Both stages use structured outputs, which constrain syntax, not truth. Prompts emphasize faithful interpretation, proposals versus commitments, later cancellations, and treating transcript text as data. Prompt version 1.1 adds explicit agreed/unresolved decision classification after a live check exposed a categorization issue.

## Contracts and presentation

The canonical result includes source metadata, actual configured model IDs, prompt version, raw/refined transcripts, corrections, meeting record and warnings. The UI and Markdown/JSON exports share this data. Null owners/deadlines display as Unspecified. Source segment references, where supplied, navigate to audio timestamps. Invalid references are removed with a warning rather than suppressing the complete result.

Endpoints: GET `/api/health`, POST `/api/transcribe`, POST `/api/refine`, POST `/api/record`. The Worker rejects unsupported methods, unknown paths, unsupported file extensions, empty files, excessive input and invalid transcript schemas. The frontend checks exact silence when the browser can decode the input; undecodable formats are left to the provider, which reports unreadable audio.

## Recovery and limits

One active run per browser. Completed stages stay in memory and can be downloaded if a later stage fails. Resuming skips completed stages; late cancelled responses cannot overwrite a newer run. The client retries temporary 429/5xx responses up to twice with visible waits, honoring Retry-After up to 120 seconds. Authentication, explicit daily quota exhaustion and invalid inputs are not automatically retried. Invalid model output gets one concise regeneration attempt server-side. A page reload clears the run.

The initial submission supports files up to 24 MiB and transcripts up to 14,000 characters. This deliberate whole-transcript implementation preserves context across the meeting without introducing an untested multi-chunk reconciliation process. Longer audio can yield a downloadable raw transcript but requires a shorter recording for the later stages. Limits are visible in the app; no input is silently truncated.

## Hosting and credentials

GitHub repository and Pages: `Choco-princess/meeting_spitter`. Cloudflare API gateway: `meeting-spitter-api.pages.dev`, forwarding through a service binding to the `meeting-spitter-api` Worker. Groq credentials exist only in an ignored local development file and a Cloudflare secret. The frontend contains the public API URL, not credentials. Fixed routes and model IDs prevent use as an arbitrary authenticated provider proxy. Per-IP limits are 30 requests/minute. CORS limits supported browser origins but is not authentication or a global quota safeguard. `SERVICE_ENABLED=false` pauses service.

No application-level audio or transcript persistence. The third-party providers process the submitted data, and their retention policies apply. Static sample audio and deliberately exported synthetic sample results are public submission artifacts.

## Reproducibility

`npm ci`, `npm test`, `npm run build` reproduce the deterministic checks/build. The lockfile fixes dependencies. An override updates the development-only Sharp dependency used by Wrangler's local emulator; npm audit was clear after installation.

`npm run check:live -- path/to/meeting.wav output-directory` exercises the complete deployed pipeline from new audio, consuming shared free quota. Set `API_BASE` to test a different endpoint and `GLOSSARY` to provide optional spelling context. The script saves outputs; it is not a mock or a replacement for the interactive interface.

The synthetic sample and its original script are documented in `samples/README.md`. It tests specific meaning-preservation cases but is not a benchmark for real-world multi-speaker meetings.
