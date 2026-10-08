import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { basename, join } from "node:path";
import {
  applyCorrections,
  MODELS,
  PROMPT_VERSION,
  markdown,
  transcriptText,
  TranscriptSchema,
  RefinementSchema,
  RecordSchema,
  type Result,
} from "../shared/schema";
const base =
  process.env.API_BASE ||
  "https://meeting-spitter-api.pages.dev";
async function post(path: string, body: FormData | object) {
  const r = await fetch(`${base}/api/${path}`, {
    method: "POST",
    headers: body instanceof FormData ? {} : { "Content-Type": "application/json" },
    body: body instanceof FormData ? body : JSON.stringify(body),
  });
  const d = await r.json();
  if (!r.ok) throw new Error(`${path}: ${r.status} ${JSON.stringify(d)}`);
  return d;
}
const inputPath = process.argv[2] || "samples/planning-meeting.wav";
const outputDir = process.argv[3] || "samples";
mkdirSync(outputDir, { recursive: true });
const form = new FormData();
form.set("file", new File([readFileSync(inputPath)], basename(inputPath)));
const raw = TranscriptSchema.parse(await post("transcribe", form));
writeFileSync(join(outputDir,"raw.json"), JSON.stringify(raw,null,2));
console.log("Transcription complete:", raw.segments.length, "segments");
const refinement = RefinementSchema.parse(await post("refine", {
  segments: raw.segments,
  glossary: process.env.GLOSSARY || "",
}));
const applied = applyCorrections(raw, refinement.corrections);
writeFileSync(join(outputDir,"refinement.json"), JSON.stringify(applied, null, 2));
console.log("Refinement:", JSON.stringify(applied.corrections));
const output = await post("record", { segments: applied.transcript.segments });
const result: Result = {
  schemaVersion: "1.0",
  filename: basename(inputPath),
  createdAt: new Date().toISOString(),
  models: MODELS,
  promptVersion: PROMPT_VERSION,
  raw,
  refined: applied.transcript,
  corrections: applied.corrections,
  record: RecordSchema.parse(output.record),
  warnings: [...raw.warnings,...output.warnings],
};
writeFileSync(join(outputDir,"meeting-record.json"), JSON.stringify(result, null, 2));
writeFileSync(join(outputDir,"meeting-record.md"), markdown(result));
writeFileSync(join(outputDir,"raw-transcript.txt"), transcriptText(raw));
writeFileSync(
  join(outputDir,"refined-transcript.txt"),
  transcriptText(applied.transcript),
);
console.log("Record:", JSON.stringify(output));
