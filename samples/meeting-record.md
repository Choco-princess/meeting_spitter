# Engineering Planning Meeting – Pilot, Deployment Guide, and Review Items

Source: sample-meeting.wav
Generated: 2026-10-08T12:36:34.942Z

> AI-generated draft. Review important details against the recording.

## Summary

- Pilot remains internal pending security review.
- Leo will update the Kubernetes deployment guide by Friday.
- Priya will review retry logic; documentation of error messages is needed but unassigned.
- Timeout stays at 30 seconds and budget remains $500.
- Announcement cancelled until security review is completed.
- Database migration to PostgreSQL is only a proposal; investigation required.

## Minutes

### Pilot Status

- The API pilot is working but not approved for public launch.
- Agreement to keep the pilot internal until the security review is complete.

### Deployment Guide Update

- Leo will update the Kubernetes deployment guide by Friday.

### Code Review and Documentation

- Priya will review the retry logic.
- Need to document error messages; no one assigned yet.

### Database Migration Proposal

- Suggestion to migrate the database to PostgreSQL next month.
- Decision to investigate first; migration not decided.

### Configuration and Budget

- Timeout remains at 30 seconds, not 13 seconds.
- Budget remains $500.

### Announcement

- Initial plan to send announcement tomorrow was cancelled.
- No announcement will be made until the security review.

### Performance Monitoring

- Priya reports p95 latency is 200 ms; continue monitoring.

## Decisions

- Keep the API pilot internal until the security review is complete. (Sources: s3, s20)
- Maintain current timeout at 30 seconds. (Sources: s14)
- Budget remains $500. (Sources: s15)
- Cancel the announcement; no announcement until the security review. (Sources: s16, s17)
- Database migration to PostgreSQL is only a proposal; not decided. (Sources: s10, s12, s24)

## Action items

- Update the Kubernetes deployment guide
  - Owner: Leo
  - Deadline: Friday
  - Sources: s4, s21

- Review retry logic
  - Owner: Priya
  - Deadline: Unspecified
  - Sources: s6, s7, s22

- Document error messages
  - Owner: Unspecified
  - Deadline: Unspecified
  - Sources: s8, s9, s23

## Open questions / needs confirmation

- How should the investigation of the PostgreSQL migration be conducted and who will lead it?

## Model pipeline

- transcription: whisper-large-v3
- refinement: openai/gpt-oss-20b
- record: openai/gpt-oss-120b
- Prompt version: 1.0