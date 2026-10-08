# Real meeting samples

Source: [ICSI Meeting Corpus](https://groups.inf.ed.ac.uk/ami/icsi/), created by the International Computer Science Institute and distributed here by the University of Edinburgh. Audio and human transcription are released under [CC BY 4.0](https://groups.inf.ed.ac.uk/ami/icsi/license.shtml).

- `Bmr001-300-540.mp3`: meeting Bmr001, original seconds 300–540 (4 minutes), equipment cabinet, budget and amplification discussion.
- `Bmr002-1260-1500.mp3`: meeting Bmr002, original seconds 1260–1500 (4 minutes), transcription formats, alignment and tools.

Changes: excerpts from mixed headset WAV recordings, encoded as mono MP3 at 64 kbit/s. Their source WAV clips were submitted to the live pipeline. The MP3 versions contain the same excerpt for convenient sharing; rerunning compressed audio may produce different transcription.

Each meeting folder includes real generated outputs and an independently prepared human reference excerpt. Reference speaker IDs come from corpus annotations, not the app. Reference timestamps are relative to the excerpt. Human transcription retains disfluencies and overlapping turns; it is not a cleaned transcript or a model-generated answer key.

Original signals:
- https://groups.inf.ed.ac.uk/ami/ICSIsignals/NXT/Bmr001.interaction.wav
- https://groups.inf.ed.ac.uk/ami/ICSIsignals/NXT/Bmr002.interaction.wav

Original manual transcripts: https://groups.inf.ed.ac.uk/ami/ICSICorpusAnnotations/ICSI_original_transcripts.zip

This small evaluation is not a quantitative accuracy benchmark. See `docs/REAL_TESTS.md` for observed successes and limitations.
