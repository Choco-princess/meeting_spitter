# Incremental test plan

Keep a working submission archive at every checkpoint. Avoid feature expansion until required stages pass. Test requests consume shared free quota; visible waits are expected when many live evaluations run back to back.

| Part | Cases | Evidence |
|---|---|---|
| Input/API | Empty file, unsupported extension, corrupt WAV, silence, oversized file, empty transcript, invalid JSON, permitted/unknown origin | Deterministic tests and deployed/browser checks |
| Transcription | Synthetic known script; two natural ICSI research-meeting clips compared with human transcripts; real Kubernetes YouTube clip | Raw outputs and source attribution |
| Refinement | Misrecognized domain term; original unchanged; negation/numbers preserved; missing/overlapping/ambiguous/no-op patches skipped | Unit tests and live stage evaluation |
| Minutes | Proposal-only, cancelled task, unassigned work, unresolved question, nearby name, later recap assigning owner | `stage-evaluation.json` with real API outputs |
| Recovery | Cancellation, completed-stage reuse, temporary quota wait, daily quota error | Pipeline tests and actual free-quota retry during live tests |
| Large-file excerpts | Valid large WAV and MP3; explicit opt-in; malformed/incomplete headers; bounded frame cuts; cancellation; every export discloses scope | Parser tests and real browser uploads |
| Detail/review | Four levels on a fixed ten-minute transcript; targeted corrective review; cached draft on failure; actual fallback model metadata | Live outputs compared with an independent text reference |
| Presentation/export | All tabs, source timestamp seek, TXT/Markdown/JSON/ZIP consistent, narrow viewport | Browser checks and exported canonical record |
| Hidden checkpoint | Pre-download two unseen YouTube meeting clips, freeze commit/Worker version, randomly choose one, run once before inspecting its transcript | Selection manifest and full output; no prompt tuning on the selected clip before evaluation |

Hidden tests are small usability checks, not a benchmark or a guarantee of factual accuracy. Keep the clip sources and draw unchanged if a result is disappointing. Report failures and limitations alongside successes. A later repair requires another checkpoint and a fresh holdout.

Nice-to-have additions should be small and independently checked. Speaker identification requires a separate reliable system; the current Groq Whisper API provides timestamps but no speaker-label option. It remains outside this deadline scope. A future named transcript import can preserve names supplied by a meeting platform.
