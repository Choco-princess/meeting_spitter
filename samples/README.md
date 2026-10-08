# Sample provenance

`planning-meeting.wav` is synthetic speech generated locally using Windows `System.Speech.Synthesis.SpeechSynthesizer` from an original fictional engineering-meeting script. It is not a recording of real people or a claim of real multi-speaker performance. The names and project details are fictional. The user authorized this synthetic sample for the initial submission/demo.

The same audio is served as `public/sample-meeting.wav` for the interactive demo. The sample button loads the audio; all transcription, refinement and documentation are then generated live. It does not load prewritten results.

The generated outputs in this directory came from the application's deployed API. See their metadata for model IDs and processing time. `script.txt` is ground truth for evaluation, not pipeline input. The pipeline only receives the WAV plus any optional user-entered terminology glossary.

Expected facts to check:

- Pilot stays internal until the security review.
- Leo updates the Kubernetes deployment guide by Friday.
- Priya reviews retry logic; no deadline is specified.
- Error-message documentation is needed; owner and deadline are unspecified.
- Database migration is a proposal, not an agreed migration.
- The announcement task is cancelled; do not keep it as a task.
- Timeout is 30 seconds, not 13; budget is $500; p95 latency is 200 ms.

These checks measure behavior on this sample only. A real meeting recording is recommended for further evaluation.
