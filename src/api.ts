import { z } from "zod";
import {
  MODELS,
  PROMPT_VERSION,
  MAX_AUDIO_BYTES,
  MAX_TRANSCRIPT_CHARS,
  TranscriptSchema,
  RefinementSchema,
  RecordSchema,
  applyCorrections,
  type Result,
  type Excerpt,
  excerptNotice,
  type MinutesDetail,
  retainTranscripts,
} from "../shared/schema";
const API =
  import.meta.env.VITE_API_BASE ||
  (import.meta.env.DEV
    ? ""
    : "https://meeting-spitter-api.pages.dev");
export type Stage = "transcription" | "refinement" | "record";
export class ServiceError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}
function pause(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const stop = () => {
      clearTimeout(timer);
      reject(new DOMException("Cancelled", "AbortError"));
    };
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", stop);
      resolve();
    }, ms);
    signal.addEventListener("abort", stop, { once: true });
    if (signal.aborted) stop();
  });
}
export async function call(
  path: string,
  body: FormData | object,
  signal: AbortSignal,
  status: (message: string) => void,
): Promise<unknown> {
  for (let attempt = 0; attempt < 3; attempt++) {
    signal.throwIfAborted();
    let response: Response;
    try {
      response = await fetch(`${API}/api/${path}`, {
        method: "POST",
        headers:
          body instanceof FormData
            ? {}
            : { "Content-Type": "application/json" },
        body: body instanceof FormData ? body : JSON.stringify(body),
        signal,
      });
    } catch (e) {
      if (signal.aborted) throw e;
      throw new ServiceError(
        "Could not connect to the service. Check your connection and retry this stage.",
        0,
      );
    }
    const data = await response
      .json()
      .catch(() => ({ error: "The service returned an unreadable response." }));
    if (response.ok) return data;
    if (
      (response.status === 429 || response.status >= 500) &&
      attempt < 2 &&
      !/daily|credential|configured|paused/i.test(data.error || "")
    ) {
      const value = response.headers.get("Retry-After");
      const delay = value
        ? Number.isFinite(Number(value))
          ? Number(value)
          : Math.max(1, (Date.parse(value) - Date.now()) / 1000)
        : response.status === 429
          ? 60
          : 3;
      if (delay > 120)
        throw new ServiceError(
          data.error || "Please try again later.",
          response.status,
        );
      const seconds = Math.max(1, Number.isFinite(delay) ? Math.ceil(delay) : 60);
      status(
        `Service busy. Retrying in ${Math.ceil(seconds)} seconds (${attempt + 1}/2)…`,
      );
      await pause(seconds * 1000, signal);
      continue;
    }
    throw new ServiceError(
      data.error || "This stage failed. Please retry.",
      response.status,
    );
  }
  throw new ServiceError("Please retry this stage.", 503);
}
export function validateFile(file: File, allowOversized = false) {
  if (!file.size)
    throw new Error(
      "This file is empty. Choose a recording with English speech.",
    );
  if (file.size > MAX_AUDIO_BYTES && !allowOversized)
    throw new Error(
      "This file is larger than 24 MB. Choose a smaller recording.",
    );
  if (!/\.(wav|mp3|m4a|ogg|webm|flac)$/i.test(file.name))
    throw new Error("Choose a WAV, MP3, M4A, OGG, WebM or FLAC audio file.");
}
export async function runPipeline(
  file: File,
  glossary: string,
  previous: Result | undefined,
  signal: AbortSignal,
  update: (result: Result) => void,
  progress: (stage: Stage, message: string) => void,
  excerpt?: Excerpt,
  minutesDetail: MinutesDetail = "standard",
  review = false,
): Promise<Result> {
  validateFile(file);
  let result = previous;
  if (result && (result.record || result.draftRecord) && ((result.minutesDetail || "standard") !== minutesDetail || (result.record && review && !result.correctnessReview))) result = retainTranscripts(result);
  if (!result) {
    progress("transcription", "Listening to your recording…");
    const form = new FormData();
    form.set("file", file);
    const raw = TranscriptSchema.parse(
      await call("transcribe", form, signal, (m) =>
        progress("transcription", m),
      ),
    );
    signal.throwIfAborted();
    result = {
      schemaVersion: "1.0",
      filename: excerpt?.originalFilename || file.name,
      createdAt: new Date().toISOString(),
      models: MODELS,
      promptVersion: PROMPT_VERSION,
      raw,
      corrections: [],
      warnings: [...raw.warnings, ...(excerpt ? [excerptNotice(excerpt)] : [])],
      ...(excerpt ? { excerpt } : {}),
    };
    update(result);
  }
  if (
    result.raw.segments.reduce((n, s) => n + s.text.length, 0) >
    MAX_TRANSCRIPT_CHARS
  )
    throw new Error(
      "The transcript exceeds this demo’s 14,000-character processing limit. Download the raw transcript below and use a shorter recording.",
    );
  if (!result.refined) {
    progress("refinement", "Checking terminology and preserving context…");
    const refined = RefinementSchema.extend({ model: z.string().optional(), warnings: z.array(z.string()).optional() }).parse(
      await call(
        "refine",
        { segments: result.raw.segments, glossary },
        signal,
        (m) => progress("refinement", m),
      ),
    );
    signal.throwIfAborted();
    const applied = applyCorrections(result.raw, refined.corrections);
    result = {
      ...result,
      refined: applied.transcript,
      corrections: applied.corrections,
      models: { ...result.models, refinement: refined.model || result.models.refinement },
      warnings: [
        ...result.warnings,
        ...(refined.warnings || []),
        ...(applied.corrections.some((c) => !c.applied)
          ? [
              "Some suggested edits were skipped. Expand Terminology changes to see why.",
            ]
          : []),
      ],
    };
    update(result);
  }
  if (!result.record && !result.draftRecord) {
    progress("record", "Writing minutes, decisions and next steps…");
    const data = z
      .object({ record: RecordSchema, warnings: z.array(z.string()), model: z.string().optional(), promptVersion: z.string().optional() })
      .parse(
        await call(
          "record",
          { segments: result.refined!.segments, detail: minutesDetail },
          signal,
          (m) => progress("record", m),
        ),
      );
    signal.throwIfAborted();
    result = {
      ...result,
      ...(review ? { draftRecord: data.record } : { record: data.record }),
      correctnessReview: false,
      minutesDetail,
      promptVersion: data.promptVersion || PROMPT_VERSION,
      models: { ...result.models, record: data.model || result.models.record },
      recordWarnings: data.warnings,
      warnings: [...result.warnings, ...data.warnings],
    };
    update(result);
  }
  if (review && result.draftRecord && !result.record) {
    progress("record", "Reviewing the draft against the transcript—checking facts, coverage and commitments…");
    const data = z.object({ record: RecordSchema, warnings: z.array(z.string()), model: z.string().optional(), promptVersion: z.string().optional() }).parse(
      await call("review", { segments: result.refined!.segments, candidate: result.draftRecord, detail: minutesDetail }, signal, (m) => progress("record", m)),
    );
    signal.throwIfAborted();
    result = { ...result, record: data.record, correctnessReview: true,
      models: { ...result.models, review: data.model || result.models.record },
      promptVersion: data.promptVersion || PROMPT_VERSION,
      recordWarnings: [...(result.recordWarnings || []), ...data.warnings],
      warnings: [...new Set([...result.warnings, ...data.warnings])] };
    update(result);
  }
  // If a user opts out after a failed review, the preserved draft remains usable.
  if (!review && result.draftRecord && !result.record) {
    result = { ...result, record: result.draftRecord, correctnessReview: false };
    update(result);
  }
  return result;
}
