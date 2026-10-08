# meeting_spitter

A meeting assistant that turns English audio into a raw transcript, a refined transcript, organized minutes, decisions and action items. Built incrementally for the IIT Guwahati ML bootcamp problem statement.

**Live app:** https://choco-princess.github.io/meeting_spitter/

## Use it

1. Upload audio or choose **Try a sample meeting**. The bundled sample is clearly synthetic, generated with Windows speech synthesis from an original fictional meeting script.
2. Optionally enter spellings of names and technical terms.
3. Select **Make my meeting useful**. All three stages run in order.
4. Inspect minutes, decisions/tasks and both transcripts. Source timestamps play the corresponding audio.
5. Download the result ZIP, individual transcripts, Markdown minutes or structured JSON.

Judges do not need an API key. The shared Groq key is stored as a Cloudflare Worker secret, never in the frontend. The developer's laptop does not need to be running.

## Models and workflow

| Stage | Model (via Groq) | Responsibility |
|---|---|---|
| Speech recognition | `whisper-large-v3` | English transcript with segment timestamps |
| Terminology refinement | `openai/gpt-oss-20b` | Narrow, contextual correction proposals applied to original segments |
| Meeting documentation | `openai/gpt-oss-120b` | Summary, topic-organized minutes, decisions, tasks and unresolved questions |

The two language models are separate processing stages. Results are generated from the uploaded audio; the app does not return canned sample outputs. Groq's free plan and Cloudflare Workers Free are used. Shared quotas can cause delays or temporary unavailability; the app never switches to paid inference.

The browser orchestrates three API requests to a small Cloudflare Worker. The Worker fixes the model IDs and prompts, holds the credential, and validates requests. JSON Schema constrains the language-model output shape. This does **not** guarantee factual accuracy. Prompts live in `worker/prompts.ts`; schemas and correction/export logic live in `shared/schema.ts`.

## Accuracy and limitations

- The raw transcript is preserved. Refinement applies short, non-overlapping patches with a visible change log.
- Summaries may paraphrase. Missing owners/deadlines remain `null` in JSON and **Unspecified** in the interface/Markdown.
- Prompts distinguish proposals from decisions and consider cancelled commitments. Supporting segment references aid review, not proof.
- This is an AI-generated draft: unclear speech, speaker identity, names and contextual meaning can still be wrong. Review important details against the audio.
- English audio: WAV, MP3, M4A, OGG, WebM, FLAC, up to **24 MiB**. Current whole-transcript processing limit is **14,000 characters**; longer transcripts are explicitly rejected after transcription, which remains downloadable. File size alone does not indicate meeting length.
- There is no speaker diarization. Named attribution depends on what was actually stated and recognized.
- Relative dates are kept verbatim, not resolved against the upload date.
- Cancel/retry preserves completed stages in the open page. Reloading loses the current in-memory run. A provider request already accepted may finish after cancellation.
- The app does not persist recordings or transcripts on its own servers. Audio/text pass through Cloudflare to Groq and are subject to those providers' policies.
- The public shared API has per-IP rate limiting and fixed endpoints. CORS is not authentication; shared free quotas can still be exhausted.
- The bundled demonstration is synthetic and does not establish accuracy on real multi-speaker/noisy meetings.

## Local setup

Requires Node.js 22.12+ (tested on Node 24), npm, and a free Groq account.

```sh
npm ci
```

Create an ignored `.dev.vars` file:

```dotenv
GROQ_API_KEY=your_groq_key
```

In two terminals:

```sh
npm run dev:api
npm run dev
```

Open the Vite address ending in `/meeting_spitter/`. The development frontend proxies `/api` to Wrangler on port 8787. No OpenAI API key is needed. Never add provider credentials to a `VITE_` variable: those variables are public.

## Checks

```sh
npm test
npm run build
npm audit
```

The deterministic tests exercise patch safety, reference cleanup, export consistency, input validation and CORS. Live API and browser results are documented separately in `docs/VALIDATION.md`.

## Deploy

1. Use a free Cloudflare account, set `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN` locally, and edit allowed frontend origins in `wrangler.jsonc`.
2. Run `npx wrangler secret put GROQ_API_KEY`, then `npm run deploy:api`.
3. Set `VITE_API_BASE` to the resulting Worker URL at frontend build time (the current deployment URL is the default). Build and deploy `dist` to GitHub Pages using the supplied workflow.
4. For another repository name, update the Vite `base` path. Set GitHub Pages source to GitHub Actions.

`SERVICE_ENABLED=false` in the Worker configuration pauses the shared service. There is no automatic paid fallback.

## Submission contents

- Source, prompts, schemas, dependency lockfile and tests.
- `samples/planning-meeting.wav`: original synthetic meeting audio; provenance in `samples/README.md`.
- `samples/meeting-record.json`, Markdown and both transcripts: actual pipeline outputs.
- `docs/TECHNICAL.md`: design and model roles.
- `docs/VALIDATION.md`: completed checks and known limits.
- `docs/demo.webm`: recorded end-to-end run, once captured.

The unrelated ArUco/QR text in the supplied brief is treated as an editing artifact; this project implements the meeting-assistant requirements.
