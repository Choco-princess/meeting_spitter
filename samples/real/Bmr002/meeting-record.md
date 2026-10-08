# Discussion on Transcript Data Formats and Tool Integration

Source: Bmr002-1260-1500.wav
Generated: 2026-10-08T16:18:54.213Z

> AI-generated draft. Review important details against the recording.

## Summary

- Uncertainty about feasibility of automated alignment with overlapping speakers
- No consensus reached on preferred data format – STM, XML, or custom Perl format are all mentioned
- Open question whether the Alembic workbench is free to use
- Unresolved interest in Stuttgart phonetics query language and related tools

## Minutes

### Automated alignment and speaker overlap

- Concern expressed about ability to perform automated alignment given overlapping speaker changes
- No decision made on pursuing automated alignment

### Data format options

- Existing hand‑rolled Perl format used for digit work
- Suggestion to adopt STM format for full system as it aligns with existing tools
- Discussion of converting Mississippi State tool outputs (WAV + timestamps) to STM
- Mention of XML as a possible format and its relation to TEI
- No agreement on which format to standardize on

### Tool compatibility and conversion

- Mississippi State tools do not output STM directly but conversion is feasible
- Speaker demonstrated having already created STM files from Mississippi State data
- Idea to use whatever format tools provide rather than designing a new one

### European project tools (Alembic workbench)

- Reference to Alembic workbench from MITRE used in European projects with US contributions
- Question raised about whether Alembic is free; answer unknown

### Markup frameworks and coding schemes

- Review of a markup framework with various coding schemes but lacking sufficient visual documentation
- Participants noted it is under review and could be usable

### TEI and broader markup standards

- Discussion of TEI (Text Encoding Initiative) as a broad markup base included in some tools

### XML vs non‑XML translation

- Opinion that translation between XML and non‑XML versions should be possible, especially for discourse focus

### Stuttgart phonetics query language

- Mention of Uli Heid's query language for phonetics research, integration of Tobii tags, and German linguistic nuances
- Question about familiarity with Stuttgart group

## Decisions

No confirmed decisions identified.

## Action items

No confirmed action items identified.
## Open questions / needs confirmation

- Is the Alembic workbench free?
- Can we achieve automated alignment with overlapping speakers?
- Do you know about the Stuttgart people and their phonetics query language?

## Model pipeline

- transcription: whisper-large-v3
- refinement: openai/gpt-oss-20b
- record: openai/gpt-oss-120b
- Prompt version: 1.3