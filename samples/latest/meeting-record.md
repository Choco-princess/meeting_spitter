# Engineering Planning Meeting

Source: sample-meeting.wav
Generated: 2026-10-08T16:17:31.607Z

> AI-generated draft. Review important details against the recording.

## Summary

- Pilot will remain internal until security review is complete (agreed).
- Timeout remains at 30 seconds (agreed).
- Budget stays at $500 (agreed).
- No announcement will be made until security review (agreed).
- Database migration to PostgreSQL is only a proposal and no decision has been made (unresolved).

## Minutes

### Pilot status

- API pilot is working but public launch not approved.
- Decision: keep pilot internal until security review is complete.

### Deployment guide

- Leo will update the Kubernetes deployment guide by Friday.

### Retry logic review

- Priya will review the retry logic; no fixed deadline.

### Error messages documentation

- Need to document error messages; currently unassigned.

### Database migration

- Proposal to migrate database to PostgreSQL next month.
- Decision to investigate first; no decision to migrate yet.

### Timeout setting

- Current timeout stays at 30 seconds, not 13.

### Budget

- Budget remains $500.

### Announcement

- Previous plan to send announcement tomorrow cancelled.
- There will be no announcement until the security review.

### Latency monitoring

- p95 latency is 200 ms; continue monitoring.

## Decisions

- Keep pilot internal until security review is complete (Sources: s3)
- Timeout stays at 30 seconds, not 13 (Sources: s14)
- Budget remains $500 (Sources: s15)
- No announcement until security review (Sources: s17)

## Action items

- Update Kubernetes deployment guide
  - Owner: Leo
  - Deadline: Friday
  - Sources: s4, s21

- Review retry logic
  - Owner: Priya
  - Deadline: Unspecified
  - Sources: s7, s22

- Document error messages
  - Owner: Unspecified
  - Deadline: Unspecified
  - Sources: s8, s9, s23

## Open questions / needs confirmation

- We have not decided to migrate the database

## Model pipeline

- transcription: whisper-large-v3
- refinement: openai/gpt-oss-20b
- record: openai/gpt-oss-120b
- Prompt version: 1.3