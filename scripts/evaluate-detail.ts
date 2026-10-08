import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { TranscriptSchema, RefinementSchema, applyCorrections, MINUTES_DETAILS, RecordSchema, PROMPT_VERSION, MODELS, markdown, type MinutesDetail, type Result } from "../shared/schema";
const input = process.argv[2], output = process.argv[3];
if (!input || !output) throw new Error("Usage: tsx scripts/evaluate-detail.ts RAW_JSON OUTPUT_FOLDER");
const raw = TranscriptSchema.parse(JSON.parse(readFileSync(input, "utf8")));
const base = process.env.API_BASE || "https://meeting-spitter-api.pages.dev";
mkdirSync(output, { recursive: true });
async function post(route: string, body: object) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const response = await fetch(`${base}/api/${route}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(150000) });
    const data = await response.json();
    if (response.ok) return data;
    const seconds = Number(response.headers.get("Retry-After") || 60);
    if ((response.status === 429 || response.status >= 500) && attempt < 4 && seconds <= 120 && !/daily|credential/i.test(data.error || "")) {
      console.log(`${route}: wait ${seconds}s`); await new Promise(resolve => setTimeout(resolve, Math.max(2, Math.ceil(seconds) + 1) * 1000));
    } else throw new Error(`${route}: ${response.status} ${data.error}`);
  }
  throw new Error("Retry limit reached");
}
const applied = applyCorrections(raw, RefinementSchema.parse(await post("refine", { segments: raw.segments, glossary: "" })).corrections);
writeFileSync(join(output, "refinement.json"), JSON.stringify(applied, null, 2));
const metrics: object[] = [];
for (const detail of Object.keys(MINUTES_DETAILS) as MinutesDetail[]) {
  const candidate = await post("record", { segments: applied.transcript.segments, detail });
  writeFileSync(join(output, `${detail}-draft.json`), JSON.stringify(candidate, null, 2));
  const reviewed = await post("review", { segments: applied.transcript.segments, detail, candidate: candidate.record });
  const result: Result = { schemaVersion: "1.0", filename: "council-first-10-minutes.mp3", createdAt: new Date().toISOString(), models: { ...MODELS, record: candidate.model || MODELS.record, review: reviewed.model || MODELS.record }, promptVersion: reviewed.promptVersion || PROMPT_VERSION, raw, refined: applied.transcript, corrections: applied.corrections, minutesDetail: detail, draftRecord: candidate.record, record: RecordSchema.parse(reviewed.record), correctnessReview: true, warnings: [...new Set([...raw.warnings, ...candidate.warnings, ...reviewed.warnings, "Evaluation uses only the first ten minutes of the source recording; later discussion is excluded."])] };
  writeFileSync(join(output, `${detail}-record.json`), JSON.stringify(result, null, 2));
  writeFileSync(join(output, `${detail}-minutes.md`), markdown(result));
  const metric = { detail, topics: result.record!.minutes.length, points: result.record!.minutes.reduce((n, m) => n + m.points.length, 0), minutesWords: result.record!.minutes.flatMap(m => [m.topic, ...m.points]).join(" ").split(/\s+/).length, decisions: result.record!.decisions.length, tasks: result.record!.tasks.length };
  metrics.push(metric); writeFileSync(join(output, "metrics.json"), JSON.stringify(metrics, null, 2)); console.log(JSON.stringify(metric));
}
