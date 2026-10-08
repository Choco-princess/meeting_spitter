**[Open the live app →](https://choco-princess.github.io/meeting_spitter/)** · No installation or API key required for the demo.

# meeting_spitter

**Spill the meeting. Keep the receipts.**

Turn English audio into transcripts, readable minutes, decisions and action items. Built by **Banana_Shake** for the IITG Techboard problem statement, prioritizing correctness and a smooth, free demo.

## Features

- Timestamped raw transcripts with playback links to original audio.
- Separate terminology refinement, visible corrections and preserved original text.
- Topic-organized minutes, decisions, action items and unresolved questions.
- Four detail levels: **Quick recap**, **Standard**, **Detailed**, **Full notes**.
- Optional extra accuracy review, enabled by default, checking the draft against the transcript.
- Unknown owners/deadlines stay unspecified; proposals are separated from agreed decisions.
- **First 3 minutes** mode for large WAV/MP3 files, with explicit scope notices.
- Copy minutes or download TXT, Markdown, JSON and ZIP.
- Cancel, retry completed stages and change detail without repeating transcription.
- A clearly labeled synthetic sample to try the workflow.

## How to use it

1. Upload audio or choose **Try a sample meeting**.
2. Optionally supply names and technical terms as context.
3. For a large WAV/MP3, enable **Process only the first 3 minutes**. Later discussion is excluded.
4. Choose detail. **Detailed** and **Extra accuracy review** are the defaults.
5. Click **Spit the minutes** and follow the three stages.
6. Review notes and decisions/tasks. Use timestamps to check audio and inspect both transcripts.
7. Download results. Change detail and click **Update minutes** to reuse transcription.

If the service is busy, wait for the displayed retry time and retry the unfinished stage. If only extra review fails, the draft is retained: turn off extra review and choose **Update minutes** to use it without that additional check.

## Architecture

```mermaid
flowchart LR
    A[Browser: upload or local excerpt] --> B[Cloudflare Pages API gateway]
    B --> C[Cloudflare Worker: validation and secret]
    C --> D[Groq Whisper: timestamped transcript]
    D --> E[Groq GPT-OSS 20B: terminology refinement]
    E --> F[Groq GPT-OSS 120B: documentation]
    F --> G[Optional accuracy review]
    G --> H[Browser: inspect and export]
```

React and TypeScript run on GitHub Pages. The Worker keeps the shared Groq key out of the browser and validates requests and structured responses. The Pages gateway supplies the public API address. The developer's laptop does not need to stay on.

Refinement proposes narrow patches rather than replacing the raw transcript. Documentation generates notes and classifications; review repairs only fields needing changes. Schemas enforce structure, but factual accuracy still needs human review.

If the primary minutes model exhausts its free daily quota, a separate free `qwen/qwen3.8-27b` fallback is available. Actual model IDs and fallback warnings appear in results. No paid fallback is configured.

| Folder | Purpose |
|---|---|
| `src/` | Interface, audio excerpts and staged workflow |
| `worker/` | Backend endpoints, provider calls and prompts |
| `shared/` | Schemas, correction rules and exports |
| `gateway/` | Pages gateway and service binding |
| `public/` | Synthetic demo audio |
| `samples/` | Original demo script |
| `tests/` | Maintainable regression tests |
| `scripts/` | Developer checks |
| `docs/` | Technical report, validation and demo video |
| `.github/` | Automated testing and deployment |

Generated test records and user recordings are excluded from the current tree. Build configuration and dependency files stay at the root where tools expect them.

## Limitations

- AI drafts can contain recognition errors, incorrect names or attribution, and omissions. Source references help checking; they do not prove correctness.
- English only. WAV, MP3, M4A, OGG, WebM and FLAC uploads up to **24 MiB**. Language stages accept at most **14,000 transcript characters**.
- Excerpt mode supports standard PCM/float WAV and MPEG Layer III MP3. Corrupt files, unusual encodings and other oversized formats need a valid shorter export.
- No automatic speaker diarization or Google Meet integration. Named attribution depends on the transcript.
- Shared free quotas can delay or block requests. Daily replenishment does not remove per-minute limits. Restrictive output caps may make notes more compact than the selected tier; a warning explains this.
- **Known Full notes issue:** in a ten-minute real-recording test, the Qwen fallback returned only a title, with empty summary and minutes, after a rate-limit retry. Full notes is therefore unreliable under the fallback's restrictive output allowance. If this occurs, try Standard or Detailed, or process a shorter excerpt.
- In the same comparison, some generated drafts incorrectly kept answered questions under unresolved questions. Those drafts did not receive the extra accuracy review pass; keeping review enabled may help, but does not guarantee a correction.
- Detail levels and corrective review do not guarantee exhaustive coverage or zero hallucinations.
- Progress stays in the open page; reloading loses the run. Cancellation cannot always stop provider work already accepted.
- Audio/text pass through Cloudflare to Groq. This app does not persist them on its own backend.
- The shared API is rate limited. CORS is not authentication; public access can exhaust quota.

See [validation](docs/VALIDATION.md), [technical notes](docs/TECHNICAL.md) and the [technical report](docs/meeting-spitter-technical-report.pdf).

## Future scope

- Longer recordings through chunking and careful document merging.
- Speaker-labeled Google Meet transcript import and optional diarization.
- Stronger detail-level coverage checks and larger real-meeting evaluations.
- User-supplied keys, abuse protection and clearer quota status.
- Local/browser inference for privacy and less shared-quota dependence.
- Editable minutes, persistent sessions and richer exports.

These are planned improvements, not current features.

## Run locally

Requires Node.js 22.12+, npm and a Groq account with free quota.

```sh
npm ci
```

Create an ignored `.dev.vars` containing `GROQ_API_KEY=your_groq_key`. Run these in separate terminals:

```sh
npm run dev:api
npm run dev
```

Open the Vite URL ending in `/meeting_spitter/`. Never put keys in `VITE_` variables; frontend variables are public.

```sh
npm test
npm run build
```

Deployment instructions are in [technical notes](docs/TECHNICAL.md).

## Team and acknowledgements

**Team Banana_Shake**

- Anay Gupta
- Ajay Meena

Thank you to **IITG Techboard** for the problem statement and the opportunity to build meeting_spitter.
