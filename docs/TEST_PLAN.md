# Testing approach

Run npm test and npm run build for deterministic verification. Tests cover patch safety, classification and references, exports, excerpt boundaries, pipeline recovery and Worker quota/review handling.

For live evaluation, write expected content from the Whisper transcript before reading generated minutes. Check proposals versus agreements, unanswered questions, ownership, deadlines, numbers and omissions. Use an unseen real clip after a checkpoint; record partial results and provider failures honestly.

Browser checks cover upload errors, silence/corruption, large-file excerpt scope, cancellation, result tabs, source playback, downloads and a narrow viewport. Live inference is variable and consumes shared quota; it is not part of deterministic CI.

See VALIDATION.md for completed checks and remaining gaps. Detailed evaluation tools and records are preserved locally outside the public repository.
