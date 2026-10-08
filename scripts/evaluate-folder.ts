// Split live evaluation into phases so a reviewer can write an independent
// reference from Whisper's text before inspecting the model's post-processing.
import { readFileSync, writeFileSync, mkdirSync, statSync } from "node:fs";
import { join, basename } from "node:path";
import { excerptSource } from "../src/excerpt";
import { applyCorrections, TranscriptSchema, RefinementSchema, RecordSchema, MODELS, PROMPT_VERSION, markdown, transcriptText, excerptNotice, MinutesDetailSchema, type Result } from "../shared/schema";

const phase = process.argv[2];
const folder = process.argv[3];
const output = process.argv[4];
if (!folder || !output || !["transcribe", "process"].includes(phase)) throw new Error("Usage: tsx scripts/evaluate-folder.ts transcribe|process INPUT_FOLDER OUTPUT_FOLDER");
const entries = JSON.parse(readFileSync(join(output, "file-inspection.json"), "utf8")) as { file: string; bytes: number; status: string }[];
const api = process.env.API_BASE || "https://meeting-spitter-api.pages.dev";
const detail = MinutesDetailSchema.parse(process.env.DETAIL || "detailed");
async function post(route: string, body: object | FormData) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const response = await fetch(`${api}/api/${route}`, { method: "POST", headers: body instanceof FormData ? {} : { "Content-Type": "application/json" }, body: body instanceof FormData ? body : JSON.stringify(body), signal: AbortSignal.timeout(150000) });
    const data = await response.json();
    if (response.ok) return data;
    const seconds = Number(response.headers.get("Retry-After") || 60);
    if ((response.status === 429 || response.status >= 500) && attempt < 4 && seconds <= 120 && !/daily|credential|paused/i.test(data.error || "")) {
      console.log(`${route}: busy, retry in ${seconds}s`);
      await new Promise(resolve => setTimeout(resolve, Math.max(2, Math.ceil(seconds) + 1) * 1000));
    } else throw new Error(`${route}: ${response.status} ${data.error}`);
  }
  throw new Error("Retry limit reached");
}
for (const entry of entries.filter(e => e.status === "valid")) {
  const index = entries.indexOf(entry), destination = join(output, `sample-${index + 1}`);
  mkdirSync(destination, { recursive: true });
  try {
    if (phase === "transcribe") {
      if (process.env.RESUME === "true") {
        try { readFileSync(join(destination, "raw.json")); console.log(`${entry.file}: existing raw transcript retained`); continue; } catch { /* new sample */ }
      }
      const path = join(folder, entry.file);
      if (statSync(path).size !== entry.bytes) throw new Error("Source changed since validation; skipped.");
      const file = new File([readFileSync(path)], basename(path));
      const clip = await excerptSource(file, new AbortController().signal);
      writeFileSync(join(destination, "excerpt.mp3"), new Uint8Array(await clip.arrayBuffer()));
      const form = new FormData(); form.set("file", new File([clip], "excerpt.mp3", { type: clip.type }));
      const raw = TranscriptSchema.parse(await post("transcribe", form));
      writeFileSync(join(destination, "raw.json"), JSON.stringify(raw, null, 2));
      writeFileSync(join(destination, "raw-transcript.txt"), transcriptText(raw));
      console.log(JSON.stringify({ file: entry.file, duration: raw.duration, segments: raw.segments.length, characters: raw.text.length, warnings: raw.warnings }));
    } else {
      const raw = TranscriptSchema.parse(JSON.parse(readFileSync(join(destination, "raw.json"), "utf8")));
      const refinement = RefinementSchema.parse(await post("refine", { segments: raw.segments, glossary: "" }));
      const applied = applyCorrections(raw, refinement.corrections);
      writeFileSync(join(destination, "refinement.json"), JSON.stringify(applied, null, 2));
      const candidate = await post("record", { segments: applied.transcript.segments, detail });
      writeFileSync(join(destination, "draft-record.json"), JSON.stringify(candidate, null, 2));
      const response = process.env.SKIP_REVIEW === "true" ? candidate : await post("review", { segments: applied.transcript.segments, candidate: candidate.record, detail });
      const excerpt = { originalFilename: entry.file, originalBytes: entry.bytes, startSeconds: 0, endSeconds: Math.min(180, raw.duration), requestedSeconds: 180 };
      const result: Result = { schemaVersion: "1.0", filename: entry.file, createdAt: new Date().toISOString(), models: { ...MODELS, record: candidate.model || MODELS.record, review: response.model || MODELS.record }, promptVersion: response.promptVersion || PROMPT_VERSION, raw, refined: applied.transcript, corrections: applied.corrections, record: RecordSchema.parse(response.record), warnings: [...new Set([...raw.warnings, ...candidate.warnings, ...response.warnings, excerptNotice(excerpt)])], excerpt, minutesDetail: detail, correctnessReview: process.env.SKIP_REVIEW !== "true", draftRecord: RecordSchema.parse(candidate.record) };
      writeFileSync(join(destination, "meeting-record.json"), JSON.stringify(result, null, 2));
      writeFileSync(join(destination, "meeting-record.md"), markdown(result));
      writeFileSync(join(destination, "refined-transcript.txt"), transcriptText(applied.transcript, excerpt));
      console.log(JSON.stringify({ file: entry.file, corrections: applied.corrections.length, applied: applied.corrections.filter(c => c.applied).length, title: result.record?.title, decisions: result.record?.decisions.length, tasks: result.record?.tasks.length }));
    }
  } catch (error) {
    writeFileSync(join(destination, `${phase}-error.txt`), String(error));
    console.log(`${entry.file}: ${String(error)}`);
  }
}
