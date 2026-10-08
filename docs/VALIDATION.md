# Validation - 8 October 2026

Version 0.4.0; final prompt/schema version 1.10. These are development checks, not a benchmark or a guarantee of zero hallucinations.

## Completed

- 41 deterministic tests passed, covering safe corrections, exports, audio-prefix handling, staged recovery, review merging, ownership/classification, cancellation and provider quota behavior. Production typecheck/build passed.
- Nine live semantic regression cases passed at prompt version 1.9: terminology/negation, proposals, cancellation, unassigned work, questions, ambiguous attribution, later named recaps, passed votes versus pending motions, and date/answer continuity.
- A new randomly selected, pre-downloaded real YouTube clip completed all stages on the public app at version 1.10, including review and the restrictive-output fallback. It retained distinct deployment figures and correctly returned no confirmed decisions/tasks. The independent reference was written from Whisper before inspecting generated notes.
- All four completed MP3s in the supplied tests_anay folder passed strict full-file decoding and first-three-minute Whisper transcription. Earlier postprocessing rounds completed on all four; targeted fixes addressed answered questions, pending votes and ambiguous attribution. The latest round completed three; one review was blocked by free quota before the final cap fix.
- Two WAVs were skipped for unfinished/corrupt headers, as requested. The incomplete download was replaced by its subsequently completed MP3.
- Browser processing of a valid 55 MiB WAV excerpt completed the pipeline and scope-labeled exports. A 157 MiB MP3 completed excerpt preparation/transcription/refinement; final generation hit shared quota in that earlier run.
- Empty, unsupported, oversized unsupported-format, corrupt and silent input handling checked. Cancellation retained a paused state without stale results. 390px layout had no horizontal overflow.
- Four detail controls and reuse of transcripts are implemented. A ten-minute real transcript produced a Quick recap, but the full four-level live comparison was interrupted by quota/provider errors. It is not claimed complete.

## Practical conclusions

The pipeline is usable and source-grounded, but paraphrase, attribution and coverage can still fail. Review reduces some errors and can also miss them. Free daily and per-minute limits remain material demo constraints; shorter excerpts help. The final output-cap code passed deterministic checks and the fresh browser holdout, while the nine-case semantic suite was run immediately before that quota-only change.

Private recordings, detailed outputs, references and historical evidence are preserved locally outside the public repository. The bundled demo video records an earlier baseline; it demonstrates the workflow, not every new control.
