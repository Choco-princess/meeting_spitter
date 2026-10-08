import { z } from "zod";
import {
  MODELS,
  MAX_AUDIO_BYTES,
  MAX_TRANSCRIPT_CHARS,
  SegmentSchema,
  RefinementSchema,
  RecordDraftSchema,
  finalizeRecord,
  cleanReferences,
  type Transcript,
} from "../shared/schema";
import { REFINE_PROMPT, RECORD_PROMPT } from "./prompts";

interface Env {
  GROQ_API_KEY: string;
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
  ) {
    super(message);
  }
}
const InputSchema = z.object({
  segments: z.array(SegmentSchema).min(1).max(2000),
  glossary: z.string().max(2000).optional(),
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
  const r = await fetch(`https://api.groq.com/openai/v1/${route}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.GROQ_API_KEY}`,
      ...(contentType ? { "Content-Type": contentType } : {}),
    },
    body,
    signal: AbortSignal.timeout(120000),
  });
  if (!r.ok) {
    const payload = (await r.json().catch(() => ({}))) as {
      error?: { message?: string };
    };
    const message = payload.error?.message ?? "";
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
  return r.json() as Promise<any>;
}

async function structured<T>(
  env: Env,
  model: string,
  prompt: string,
  input: unknown,
  schema: z.ZodType<T>,
  name: string,
): Promise<T> {
  const messages = [
    { role: "system", content: prompt },
    { role: "user", content: JSON.stringify(input) },
  ];
  for (let attempt = 0; attempt < 2; attempt++) {
    const response = await groq(
      env,
      "chat/completions",
      JSON.stringify({
        model,
        messages,
        temperature: 0.1,
        reasoning_effort: "low",
        max_completion_tokens: 3000,
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
    );
    const choice = response.choices?.[0];
    try {
      if (choice?.finish_reason !== "stop")
        throw new Error("Incomplete output");
      return schema.parse(JSON.parse(choice.message.content));
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
      ready: !!env.GROQ_API_KEY && env.SERVICE_ENABLED !== "false",
      models: MODELS,
      maxAudioBytes: MAX_AUDIO_BYTES,
      maxTranscriptChars: MAX_TRANSCRIPT_CHARS,
    });
  if (!["/api/transcribe", "/api/refine", "/api/record"].includes(path))
    throw new ApiError(404, "Endpoint not found.");
  if (request.method !== "POST")
    throw new ApiError(405, "Use POST for this endpoint.");
  if (env.SERVICE_ENABLED === "false")
    throw new ApiError(
      503,
      "The demo is temporarily paused. Please try later.",
    );
  if (!env.GROQ_API_KEY)
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
  if (path === "/api/refine")
    return json(
      await structured(
        env,
        MODELS.refinement,
        REFINE_PROMPT,
        input.data,
        RefinementSchema,
        "refinement",
      ),
    );
  const draft = await structured(
    env,
    MODELS.record,
    RECORD_PROMPT,
    { segments: input.data.segments },
    RecordDraftSchema,
    "meeting_record",
  );
  const record = finalizeRecord(draft);
  return json(cleanReferences(record, input.data.segments));
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
