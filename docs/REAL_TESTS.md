# Real recording evaluation — 8 October 2026

## Source and method

Tested two natural ICSI research meetings and a public [Kubernetes SIG Azure meeting](https://www.youtube.com/watch?v=yQLeUKi_dwg), approximately minutes 10–14. The Kubernetes video is listed in CNCF's [KubeWeekly 99](https://www.cncf.io/kubeweekly/kubeweekly-99/). Clips were actually downloaded and sent as audio to Whisper, then through refinement and minutes generation. No saved transcript was substituted for transcription.

ICSI outputs were inspected against independent human transcripts supplied with the corpus. YouTube postprocessing was inspected against the generated raw transcript, so that portion is not an independent test of transcription accuracy. The YouTube recordings remain in the local test directory; the submission includes links and derived evaluation outputs, not a copy of the video audio.

## Findings and repairs

| Finding | Change / observed result |
|---|---|
| Production browser could not reach the workers.dev API | Added a Pages hostname forwarding internally through a Cloudflare service binding. Browser completed the whole pipeline through the repaired address. |
| Questions about licensing and alignment became invented confirmed tasks | Added explicit task classification and targeted prompt examples. Final Bmr002 output has no confirmed tasks, preserving questions in the record. |
| An adjacent named participant was assigned an unidentified speaker's demo commitment | Added named/unidentified ownership classification and review of later named recaps. Final visible Kubernetes task has unspecified owner, with the stated relative deadline. |
| Unchanged text counted as terminology corrections | No-op changes are now skipped. Wrong, missing, ambiguous and overlapping spans remain unchanged. |
| Useful domain correction | Kubernetes refinement changed “engaging backup” to “engaging backoff”; numbers and technical discussion remained available. |

## Remaining limits

- Clear synthetic planning audio retains Leo/Friday, Priya without a deadline, the unassigned documentation task, 30 seconds, $500, and the cancelled announcement. Migration remains unresolved in the final visible regression output.
- Natural-meeting extraction is less reliable. Across reruns, the cabinet requirement in Bmr001 and the existing-format preference in Bmr002 sometimes appeared only in minutes/proposals rather than confirmed tasks/decisions. The final saved natural-meeting outputs are conservative and under-extract these items.
- The human reference includes `ToBI`; raw recognition said `Tobii`. Without that terminology glossary, refinement left it unchanged. Proper names, specialized terms, disfluencies and overlapping speech still need review.
- Some generated minutes include inline source IDs despite an instruction to keep these in structured reference fields. This is a presentation issue rather than verified evidence.
- Free minute quotas were reached during repeated live tests. Retrying after the supplied delay succeeded; shared quota delays remain a real limitation for concurrent judges.

The tests demonstrate a functioning, useful draft workflow, not zero hallucinations or stable benchmark accuracy. Timestamp playback, raw/refined comparison and explicit open items remain important parts of review.

## Separate stage checks

`npx tsx scripts/evaluate-stages.ts` runs live refinement plus six documentation cases. All seven passed at the checkpoint; inputs, outputs and pass criteria are saved in `stage-evaluation.json`. This includes proposal-only, cancellation, unassigned work, question versus task, nearby name versus owner, and a later recap naming owners.

See `TEST_PLAN.md` for deterministic, browser and hidden-test coverage. The two hidden-pool clips were downloaded before checkpoint selection and were not transcribed or inspected during prompt tuning.
