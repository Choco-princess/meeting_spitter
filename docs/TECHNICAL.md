# Technical notes

Prompt/schema version: **1.10**. The architecture and model decisions are explained in the technical report PDF and README.

Whisper produces timestamped English segments. GPT-OSS 20B proposes narrow terminology patches; exact-span, overlap and ambiguity rules preserve the raw transcript. GPT-OSS 120B generates structured minutes and classifications. An optional pass reviews the draft against the transcript and supplies only corrected fields. A free Qwen fallback is used on primary-model daily quota exhaustion, with actual model metadata and warnings.

The opt-in excerpt reads a bounded WAV/MP3 prefix and resamples locally to mono 16 kHz. It processes at most 180 seconds, labels this scope and preserves original playback. The upload cap remains 24 MiB.

Restrictive provider output reservations are reduced without truncating the transcript. The Qwen fallback can disable reasoning tokens and request concise JSON to fit its output cap; results warn that detail may be reduced. Retry-After governs temporary failures. No paid fallback is configured.

## Deployment

1. Set CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN locally. Adjust allowed origins in wrangler.jsonc.
2. Store the key using `npx wrangler secret put GROQ_API_KEY`, then run `npm run deploy:api`.
3. Create a Cloudflare Pages project named meeting-spitter-api. In gateway/, run `npx wrangler pages deploy public --project-name meeting-spitter-api --branch main`. Its service binding points to the Worker.
4. Set VITE_API_BASE to the public API hostname at build time; the current gateway is the default. Deploy dist/ through the supplied GitHub Pages workflow.
5. For another repository name, update the Vite base path. Set the Pages source to GitHub Actions.

SERVICE_ENABLED=false pauses the shared backend. Never commit credentials or put provider keys in frontend variables.
