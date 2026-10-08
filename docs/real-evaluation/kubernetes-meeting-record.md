# Kubernetes Control Manager Tuning and Azure API Rate Limiting Discussion

Source: kubernetes-azure.mp3
Generated: 2026-10-08T16:17:34.886Z

> AI-generated draft. Review important details against the recording.

## Summary

- Reviewed impact of extending node status check interval to one minute on reconciliation latency and pod rescheduling.
- Explored pod eviction timeout alignment with other control manager intervals to avoid permanent race conditions.
- Discussed backoff and rate‑limiting knobs to handle burst traffic to Azure APIs and prevent throttling.
- Considered balancing de‑optimization of the cluster with performance during real‑world usage.
- Clarified that QPS enforcement is a single aggregate pipe in the controller manager.
- Time ran short; agreed to continue discussion and demo a large‑cluster scenario in two weeks.

## Minutes

### Node readiness thresholds and control manager intervals

- Increasing the node status check interval from 10 s to 1 min adds ~50 s latency before a node is marked not‑ready (s1‑s8).
- Control manager marks a node not‑ready after five missed intervals (s9‑s10).

### Pod eviction timeout and reconciliation loop stability

- Pod eviction timeout must align with other intervals to avoid permanent race conditions (s11‑s15).

### Backoff and rate limiting for Azure API burst traffic

- Backoff helps control failed requests during large cluster deployments that generate high Azure API traffic (s16‑s20).
- Properly tuned backoff prevents request stacking, failures, and throttling events (s21‑s27).

### Rate limiting as last line of defense

- Rate limiting provides an additional safeguard when backoff is insufficient (s28‑s36).

### Balancing de‑optimization with cluster performance

- Finding a balance lets real‑world usage remain performant while slowing burst events to keep Azure API happy (s37‑s41).

### QPS enforcement on controller manager

- QPS is enforced on the controller manager and each queue via a single aggregate enforcement pipe (s46‑s50).

### Time constraints and next steps

- Meeting ran out of time; participants agreed to reconvene in two weeks for a demo of building a large cluster (s42‑s45).

## Decisions

No confirmed decisions identified.

## Action items

- Demo building a large cluster
  - Owner: Unspecified
  - Deadline: in two weeks
  - Sources: s44, s45

## Model pipeline

- transcription: whisper-large-v3
- refinement: openai/gpt-oss-20b
- record: openai/gpt-oss-120b
- Prompt version: 1.3