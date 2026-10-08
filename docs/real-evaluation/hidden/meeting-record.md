# Discussion on CRI Feature Complexity and Feasibility

Source: sig-network.mp3
Generated: 2026-10-08T16:24:30.378Z

> AI-generated draft. Review important details against the recording.

## Summary

- Reviewed documentation; all describe similar approach as previously discussed (s9‑s13).
- Major concern about added complexity across many Kubernetes resources, potentially conflicting with service‑mesh direction (s17‑s21).
- Uncertainty on implementation on GCP and integration with DNS, ingress, network policy (s22‑s23).
- Acknowledged significant community interest over 18 months, but no decision on moving forward (s31‑s33).
- No decisions made; forward path remains unresolved (s36‑s38).

## Minutes

### Document Review

- Tim reviewed all relevant documents, noting they largely describe the same concept as expected from the previous call (s9‑s13).

### Complexity Concerns

- Multiple participants expressed concern about the extensive complexity the proposal adds to pods, services, endpoints, ingress, DNS, and network policy (s17‑s21).
- Concern that this complexity conflicts with trends toward service‑mesh solutions like Istio (s21).
- Question raised whether many users would want this feature (s29).

### Implementation Feasibility

- Uncertainty expressed about how the proposal would work on platforms such as GCP (s22‑s23).
- Lack of clarity on integrating with existing networking components like DNS, ingress, and network policy (s21‑s23).

### Community Interest

- Acknowledgment of significant community interest over 18 months (s31‑s33).
- Recognition that similar complexity has been added elsewhere to address use cases (s30‑s31).

## Decisions

No confirmed decisions identified.

## Action items

No confirmed action items identified.
## Open questions / needs confirmation

- How could the proposed CRI changes be implemented on GCP? (s22‑s23)
- How can DNS, ingress, and network policy integration be achieved given current service‑mesh direction? (s21‑s23)
- Is there a way to reduce the added complexity across pods, services, endpoints, etc.? (s25‑s30)
- What is the forward path if the proposal is not feasible? (s36‑s38)

## Model pipeline

- transcription: whisper-large-v3
- refinement: openai/gpt-oss-20b
- record: openai/gpt-oss-120b
- Prompt version: 1.3