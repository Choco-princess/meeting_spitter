# Engineering Planning Meeting Summary

Source: planning-meeting.wav
Generated: 2026-10-08T12:31:47.790Z

> AI-generated draft. Review important details against the recording.

## Summary

- Pilot API remains internal pending security review.
- Leo to update Kubernetes deployment guide by Friday.
- Priya to review retry logic (no deadline).
- Error‑message documentation needed, owner not assigned.
- Timeout stays at 30 seconds; budget fixed at $500.
- Announcement cancelled until security review.
- Database migration to PostgreSQL is only a proposal.

## Minutes

### API Pilot Status

- The API pilot is working but not approved for public launch.
- Agreement to keep the pilot internal until the security review is complete.

### Documentation and Review Tasks

- Leo will update the Kubernetes deployment guide by Friday.
- Priya will review the retry logic; no fixed deadline was set.
- The team needs to document error messages; no one has been assigned.

### Infrastructure Proposals

- A suggestion to migrate the database to PostgreSQL next month was raised.
- The team decided to investigate first and has not committed to migration.

### Operational Settings

- Current timeout remains at 30 seconds, not 13 seconds.
- Budget remains at $500.

### Communications

- An earlier plan to send an announcement tomorrow was cancelled.
- There will be no announcement until after the security review.

### Performance Monitoring

- Priya reported p95 latency is 200 ms; the team will continue to monitor it.

## Decisions

- Keep the API pilot internal until the security review is complete. (Sources: s3, s20)
- Maintain the timeout at 30 seconds. (Sources: s14)
- Keep the budget at $500. (Sources: s15)
- Cancel the announcement; it will not be sent until after the security review. (Sources: s16, s17)
- No decision to migrate the database; it remains a proposal. (Sources: s10, s11, s12, s24)

## Action items

- Update the Kubernetes deployment guide
  - Owner: Leo
  - Deadline: Friday
  - Sources: s4, s21

- Review the retry logic
  - Owner: Priya
  - Deadline: Unspecified
  - Sources: s6, s7, s22

- Document error messages
  - Owner: Unspecified
  - Deadline: Unspecified
  - Sources: s8, s9, s23

## Open questions / needs confirmation

- What investigation steps are needed before deciding on the PostgreSQL migration?

## Model pipeline

- transcription: whisper-large-v3
- refinement: openai/gpt-oss-20b
- record: openai/gpt-oss-120b
- Prompt version: 1.0