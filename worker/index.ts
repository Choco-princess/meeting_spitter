import { z } from "zod";
import {
  MODELS,
  PROMPT_VERSION,
  MAX_AUDIO_BYTES,
  MAX_TRANSCRIPT_CHARS,
  SegmentSchema,
  RefinementSchema,
  RecordDraftSchema,
  finalizeRecord,
  cleanReferences,
  type Transcript,
  MinutesDetailSchema,
  RecordSchema,
  RecordReviewSchema,
  applyRecordReview,
  FALLBACK_RECORD_MODEL,
} from "../shared/schema";
import { REFINE_PROMPT, RECORD_PROMPT, REVIEW_PROMPT, DETAIL_PROMPTS } from "./prompts";

interface Env {
  GROQ_API_KEY: string;
  GROQ_API_KEY_FALLBACK?: string;
  ALLOWED_ORIGINS: string;
  SERVICE_ENABLED: string;
  RATE_LIMITER?: {
    limit(options: { key: string }): Promise<{ success: boolean }>;
  };
}
class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public retryAfter?: string,
    public reduceTokensBy?: number,
    public outputCap?: number,
  ) {
    super(message);
  }
}
const InputSchema = z.object({
  segments: z.array(SegmentSchema).min(1).max(2000),
  glossary: z.string().max(2000).optional(),
  detail: MinutesDetailSchema.optional(),
  candidate: RecordSchema.optional(),
});
const json = (
  body: unknown,
  status = 200,
  headers: Record<string, string> = {},
) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      ...headers,
    },
  });

async function groq(
  env: Env,
  route: string,
  body: BodyInit,
  contentType?: string,
) {
  const keys = [...new Set([env.GROQ_API_KEY, env.GROQ_API_KEY_FALLBACK].filter((key): key is string => !!key))];
  let r: Response | undefined;
  let fallbackCredentialUsed = false;
  for (const [index, key] of keys.entries()) {
    r = await fetch(`https://api.groq.com/openai/v1/${route}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      ...(contentType ? { "Content-Type": contentType } : {}),
    },
    body,
    signal: AbortSignal.timeout(120000),
  });
    fallbackCredentialUsed = index > 0 || key !== env.GROQ_API_KEY;
    if (r.ok || index === keys.length - 1) break;
    if (![401, 403, 429].includes(r.status)) break;
    // An intrinsically oversized request needs a smaller budget, not another key.
    if (r.status === 429) {
      const failure = await r.clone().json().catch(() => ({})) as { error?: { message?: string } };
      if (/request too large/i.test(failure.error?.message || "")) break;
    }
  }
  if (!r) throw new ApiError(503, "The AI service is not configured.");
  if (!r.ok) {
    const payload = (await r.json().catch(() => ({}))) as {
      error?: { message?: string };
    };
    const message = payload.error?.message ?? "";
    if (r.status === 429 && /request too large.*output tokens per minute/i.test(message)) {
      const limit = Number(message.match(/Limit[:\s]+(\d+)/i)?.[1]);
      throw new ApiError(413, "The free model's output allowance is too small for this request. Use a shorter excerpt or lower detail level.", undefined, undefined, limit > 0 ? Math.floor(limit * .9) : undefined);
    }
    if (r.status === 429)
      throw new ApiError(
        429,
        /per day|daily|tokens per day|TPD|ASD/i.test(message)
          ? "The shared free daily quota is exhausted. Please try again after it resets."
          : "The shared free service is busy. Please wait and retry this stage.",
        r.headers.get("retry-after") || "60",
      );
    if (r.status === 401 || r.status === 403)
      throw new ApiError(
        503,
        "The AI service credential needs attention. Please contact the project owner.",
      );
    if (r.status === 413 && route.startsWith("chat")) {
      const limit = Number(message.match(/Limit[:\s]+(\d+)/i)?.[1]);
      const requested = Number(message.match(/Requested[:\s]+(\d+)/i)?.[1]);
      throw new ApiError(413, "This transcript and draft exceed the free model's request budget. Use a shorter excerpt or a lower minutes detail level.", undefined,
        limit > 0 && requested > limit ? requested - limit + 256 : undefined);
    }
    if (r.status === 413)
      throw new ApiError(
        413,
        "This input exceeds the free service limit. Please use a smaller recording.",
      );
    if (route.startsWith("audio") && r.status === 400)
      throw new ApiError(
        422,
        "The audio could not be read. Try a valid WAV, MP3 or M4A recording.",
      );
    throw new ApiError(
      r.status >= 500 ? 503 : 502,
      "The AI service could not complete this stage. Please retry.",
    );
  }
  const output = await r.json() as any;
  return { ...output, fallbackCredentialUsed };
}

async function structured<T>(
  env: Env,
  model: string,
  prompt: string,
  input: unknown,
  schema: z.ZodType<T>,
  name: string,
  maxCompletionTokens = 3000,
): Promise<{ value: T; model: string; warnings: string[] }> {
  const messages = [
    { role: "system", content: prompt },
    { role: "user", content: JSON.stringify(input) },
  ];
  let budget = maxCompletionTokens;
  let adjusted = false;
  let activeModel = model;
  let compactOutput = false;
  const warnings: string[] = [];
  for (let attempt = 0; attempt < 2; attempt++) {
    let response: any;
    try { response = await groq(
      env,
      "chat/completions",
      JSON.stringify({
        model: activeModel,
        messages,
        temperature: 0.1,
        reasoning_effort: compactOutput && activeModel === FALLBACK_RECORD_MODEL ? "none" : model === MODELS.record ? "medium" : "low",
        max_completion_tokens: budget,
        response_format: {
          type: "json_schema",
          json_schema: {
            name,
            strict: true,
            schema: z.toJSONSchema(schema, { target: "draft-7" }),
          },
        },
      }),
      "application/json",
    ); } catch (error) {
      if (error instanceof ApiError && error.outputCap && !compactOutput && error.outputCap >= 256) {
        budget = Math.min(budget, error.outputCap); compactOutput = true;
        warnings.push("The free model imposed a smaller output allowance. This run may be more compact than the selected detail level; shorter excerpts can yield fuller notes.");
        messages.push({ role: "system", content: "A free-provider output cap applies. Return concise valid JSON within the token allowance. For review, use null for sound fields and change only clear factual errors. Never invent padding or discard supported decisions/tasks." });
        attempt--; continue;
      }
      if (error instanceof ApiError && error.status === 429 && /daily quota/i.test(error.message) && activeModel === MODELS.record) {
        activeModel = FALLBACK_RECORD_MODEL;
        warnings.push(`The primary minutes model's free daily quota was unavailable. Used ${FALLBACK_RECORD_MODEL} for this request; review the AI draft.`);
        budget = maxCompletionTokens; adjusted = false; compactOutput = false; attempt--; continue;
      }
      // A free-plan per-request token reservation can exceed its minute cap.
      // Reduce only the output allowance; never truncate transcript content.
      if (error instanceof ApiError && error.reduceTokensBy && !adjusted && budget - error.reduceTokensBy >= 1200) {
        budget -= error.reduceTokensBy; adjusted = true; attempt--; continue;
      }
      throw error;
    }
    const choice = response.choices?.[0];
    if (response.fallbackCredentialUsed && !warnings.includes("Used the backup Groq credential for this stage. Shared organization quotas may still apply."))
      warnings.push("Used the backup Groq credential for this stage. Shared organization quotas may still apply.");
    try {
      if (choice?.finish_reason !== "stop")
        throw new Error("Incomplete output");
      return { value: schema.parse(JSON.parse(choice.message.content)), model: activeModel, warnings };
    } catch {
      if (attempt === 1)
        throw new ApiError(
          502,
          "The model returned an incomplete result. Your earlier stages are preserved; retry this stage.",
        );
      messages.push({
        role: "user",
        content:
          "Your previous response was incomplete or invalid. Return a more concise complete JSON object matching the schema.",
      });
    }
  }
  throw new ApiError(502, "No result received.");
}

async function handle(request: Request, env: Env) {
  const path = new URL(request.url).pathname;
  if (path === "/api/health" && request.method === "GET")
    return json({
      ready: !!(env.GROQ_API_KEY || env.GROQ_API_KEY_FALLBACK) && env.SERVICE_ENABLED !== "false",
      models: MODELS,
      promptVersion: PROMPT_VERSION,
      maxAudioBytes: MAX_AUDIO_BYTES,
      maxTranscriptChars: MAX_TRANSCRIPT_CHARS,
      fallbackRecordModel: FALLBACK_RECORD_MODEL,
      fallbackCredentialConfigured: !!env.GROQ_API_KEY_FALLBACK,
    });
  if (!["/api/transcribe", "/api/refine", "/api/record", "/api/review"].includes(path))
    throw new ApiError(404, "Endpoint not found.");
  if (request.method !== "POST")
    throw new ApiError(405, "Use POST for this endpoint.");
  if (env.SERVICE_ENABLED === "false")
    throw new ApiError(
      503,
      "The demo is temporarily paused. Please try later.",
    );
  if (!env.GROQ_API_KEY && !env.GROQ_API_KEY_FALLBACK)
    throw new ApiError(503, "The AI service is not configured.");
  if (
    env.RATE_LIMITER &&
    !(
      await env.RATE_LIMITER.limit({
        key: request.headers.get("CF-Connecting-IP") || "unknown",
      })
    ).success
  )
    throw new ApiError(429, "Too many requests. Please wait a minute.", "60");
  if (path === "/api/transcribe") {
    const type = request.headers.get("content-type") || "";
    if (!type.includes("multipart/form-data"))
      throw new ApiError(415, "Upload audio as multipart form data.");
    const length = Number(request.headers.get("content-length"));
    if (length > MAX_AUDIO_BYTES + 65536)
      throw new ApiError(413, "Choose an audio file smaller than 24 MB.");
    const data = await request.formData();
    const file = data.get("file");
    if (!(file instanceof File) || !file.size)
      throw new ApiError(400, "Choose a non-empty audio file.");
    if (file.size > MAX_AUDIO_BYTES)
      throw new ApiError(413, "Choose an audio file smaller than 24 MB.");
    if (!/\.(wav|mp3|m4a|ogg|webm|flac)$/i.test(file.name))
      throw new ApiError(
        415,
        "Supported audio formats: WAV, MP3, M4A, OGG, WebM and FLAC.",
      );
    const form = new FormData();
    form.set("file", file);
    form.set("model", MODELS.transcription);
    form.set("language", "en");
    form.set("response_format", "verbose_json");
    form.set("temperature", "0");
    form.append("timestamp_granularities[]", "segment");
    const output = await groq(env, "audio/transcriptions", form);
    if (!output.text?.trim())
      throw new ApiError(
        422,
        "No intelligible speech was found. Please choose a recording with clear English speech.",
      );
    const source = Array.isArray(output.segments) ? output.segments : [];
    if (source.length && source.every((s: any) => s.no_speech_prob > 0.8))
      throw new ApiError(
        422,
        "No reliable speech was detected. Please check the recording.",
      );
    const transcript: Transcript = {
      text: output.text,
      duration: output.duration || 0,
      segments: source.map((s: any, i: number) => ({
        id: `s${i + 1}`,
        start: s.start,
        end: s.end,
        text: s.text,
      })),
      warnings: source.some(
        (s: any) => s.avg_logprob < -1 || s.no_speech_prob > 0.6,
      )
        ? [
            "Some audio may be unclear. Review names, numbers and technical terms against the recording.",
          ]
        : [],
    };
    if (!transcript.segments.length)
      transcript.segments = [
        { id: "s1", start: 0, end: transcript.duration, text: transcript.text },
      ];
    if (output.fallbackCredentialUsed)
      transcript.warnings.push("Used the backup Groq credential for transcription. Shared organization quotas may still apply.");
    return json(transcript);
  }
  if (!request.headers.get("content-type")?.includes("application/json"))
    throw new ApiError(415, "Expected JSON input.");
  if (Number(request.headers.get("content-length")) > 160000)
    throw new ApiError(413, "Transcript request is too large.");
  const text = await request.text();
  if (text.length > 160000)
    throw new ApiError(413, "Transcript request is too large.");
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new ApiError(400, "Invalid JSON input.");
  }
  const input = InputSchema.safeParse(parsed);
  if (!input.success)
    throw new ApiError(400, "Invalid or empty transcript input.");
  if (
    input.data.segments.reduce((n, s) => n + s.text.length, 0) >
    MAX_TRANSCRIPT_CHARS
  )
    throw new ApiError(
      413,
      "This transcript exceeds the current 14,000-character demo limit. Your raw transcript is available; please use a shorter recording.",
    );
  // The language stages need stable IDs and words. Numeric audio offsets are
  // retained in the client and do not need to consume model input tokens.
  const segments = input.data.segments.map(({ id, text }) => ({ id, text }));
  if (path === "/api/refine") {
    const output = await structured(
        env,
        MODELS.refinement,
        REFINE_PROMPT,
        { segments, glossary: input.data.glossary || "" },
        RefinementSchema,
        "refinement",
      );
    return json({ ...output.value, warnings: output.warnings, model: output.model, promptVersion: PROMPT_VERSION });
  }
  if (path === "/api/review" && !input.data.candidate) throw new ApiError(400, "A draft meeting record is required for review.");
  const prompt = `${path === "/api/review" ? REVIEW_PROMPT + "\n\n" : ""}${RECORD_PROMPT}\n\n${DETAIL_PROMPTS[input.data.detail || "standard"]}`;
  const payload = { segments, ...(path === "/api/review" ? { candidate: input.data.candidate } : {}) };
  const budget = input.data.segments.reduce((n, s) => n + s.text.length, 0) < 1500 ? 3000 : input.data.detail === "full" ? 4500 : input.data.detail === "detailed" ? 3500 : 3000;
  if (path === "/api/review") {
    const review = await structured(env, MODELS.record, prompt, payload, RecordReviewSchema, "meeting_review", budget);
    const clean = cleanReferences(applyRecordReview(input.data.candidate!, review.value), input.data.segments);
    return json({ ...clean, warnings: [...clean.warnings, ...review.warnings], model: review.model, promptVersion: PROMPT_VERSION });
  }
  const draft = await structured(
    env,
    MODELS.record,
    prompt,
    payload,
    RecordDraftSchema,
    "meeting_record",
    budget,
  );
  const record = finalizeRecord(draft.value);
  const clean = cleanReferences(record, input.data.segments);
  return json({ ...clean, warnings: [...clean.warnings, ...draft.warnings], model: draft.model, promptVersion: PROMPT_VERSION });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const origin = request.headers.get("Origin");
    const allowed = (env.ALLOWED_ORIGINS || "").split(",");
    const cors: Record<string, string> = {
      Vary: "Origin",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Expose-Headers": "Retry-After",
    };
    if (origin && allowed.includes(origin))
      cors["Access-Control-Allow-Origin"] = origin;
    if (origin && !allowed.includes(origin))
      return json({ error: "This website origin is not permitted." }, 403);
    if (request.method === "OPTIONS")
      return new Response(null, { status: 204, headers: cors });
    try {
      const response = await handle(request, env);
      for (const [k, v] of Object.entries(cors)) response.headers.set(k, v);
      return response;
    } catch (error) {
      const known = error instanceof ApiError;
      const timed =
        error instanceof Error &&
        ["TimeoutError", "AbortError"].includes(error.name);
      return json(
        {
          error: known
            ? error.message
            : timed
              ? "The AI service timed out. Please retry this stage."
              : "This request could not be processed. Check the input and retry.",
        },
        known ? error.status : timed ? 504 : 500,
        {
          ...cors,
          ...(known && error.retryAfter
            ? { "Retry-After": error.retryAfter }
            : {}),
        },
      );
    }
  },
};
