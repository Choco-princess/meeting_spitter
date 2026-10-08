import { writeFileSync } from "node:fs";
import { applyCorrections, PROMPT_VERSION, RefinementSchema, type Transcript } from "../shared/schema";

const base = process.env.API_BASE || "https://meeting-spitter-api.pages.dev";
async function post(route: string, body: object): Promise<any> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const response = await fetch(`${base}/api/${route}`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
    const data = await response.json();
    if (response.status === 429 && attempt < 4 && !/daily/i.test(data.error || "")) {
      const delay = Number(response.headers.get("Retry-After") || 60);
      if (!Number.isFinite(delay) || delay > 120) throw new Error(data.error);
      console.log(`Waiting ${delay}s for shared quota`);
      await new Promise(resolve => setTimeout(resolve, Math.max(2, Math.ceil(delay) + 1) * 1000));
      continue;
    }
    if (!response.ok) throw new Error(`${route}: ${response.status}: ${data.error}`);
    return data;
  }
}
const outputs: object[] = [];
let failures = 0;
const raw: Transcript = { text: "Use cube ernetes. Timeout is 30 seconds, not 13. Maya has not approved release.", duration: 15, warnings: [], segments: [] };
raw.segments = [{ id: "s1", start: 0, end: 15, text: raw.text }];
const refinement = RefinementSchema.parse(await post("refine", { segments: raw.segments, glossary: "Kubernetes, Maya" }));
const applied = applyCorrections(raw, refinement.corrections);
const refinementPass = /Kubernetes/.test(applied.transcript.text) && /30 seconds, not 13/.test(applied.transcript.text) && /Maya has not approved/.test(applied.transcript.text) && /cube ernetes/.test(raw.text);
outputs.push({ name: "terminology-with-negation-and-numbers", stage: "refinement", input: raw, output: applied, pass: refinementPass });
if (!refinementPass) failures++;
console.log("refinement", refinementPass ? "PASS" : "FAIL");
const cases = [
  { name: "proposal-only", text: "Maybe we should migrate to PostgreSQL. We have not decided to migrate. No action items were agreed.", check: (r: any) => r.decisions.length === 0 && r.tasks.length === 0 },
  { name: "cancelled-task", text: "Nora says: I will send the report by Monday. Later Nora says: Cancel my report task; we no longer need it. Everyone agrees to cancel it.", check: (r: any) => r.tasks.length === 0 },
  { name: "unassigned-agreed-work", text: "We agree to update the installation guide. We have not chosen who will do it or when.", check: (r: any) => r.tasks.length >= 1 && r.tasks.every((t: any) => t.owner === null && t.deadline === null) },
  { name: "question-is-not-task", text: "Is the Alembic tool free? I don't know. Can we align overlapping speech? We are not sure. Nobody proposed any follow-up work.", check: (r: any) => r.tasks.length === 0 && r.openQuestions.length >= 1 },
  { name: "nearby-name-is-not-owner", text: "Jason has a question. I will demo the large cluster in two weeks. This audio has no speaker labels and the person making the commitment is unidentified.", check: (r: any) => r.tasks.length >= 1 && r.tasks.every((t: any) => t.owner === null) },
  { name: "later-recap-resolves-owner", text: "I will update the guide by Friday. I will review the retry logic. Recap: Leo owns the deployment guide due Friday. Priya will review the retry logic without a fixed deadline.", check: (r: any) => r.tasks.some((t: any) => t.owner === "Leo" && /Friday/i.test(t.deadline || "")) && r.tasks.some((t: any) => t.owner === "Priya" && t.deadline === null) },
  { name: "motion-is-not-yet-approved", text: "The agenda was approved unanimously. Next, Mark moves and Glenn seconds the concept plan. Be it resolved that Council adopts the concept plan attached as Schedule A. Does anyone wish to speak before the vote? The recording ends here before the vote.", check: (r: any) => r.decisions.some((d: any) => /agenda/i.test(d.text)) && !r.decisions.some((d: any) => /concept plan/i.test(d.text)) && r.tasks.length === 0 },
  { name: "later-answers-are-not-unanswered", text: "When was the notice posted, and why was this hearing date chosen? The notice and four-item agenda were posted Friday. These items were left from June 6. The hearing required 21 days notice, and this date was chosen for that hearing. Who specifically called the meeting? That last question remains unanswered.", check: (r: any) => { const notes = JSON.stringify(r.minutes).replace(/\s/g, " "); return /Friday/.test(notes) && /21/.test(notes) && /June 6/.test(notes) && !/no answers|all.*unanswered/i.test(JSON.stringify(r.summary)) && !/posting date.*(?:chosen|selected)/i.test(notes); } },
];
for (const c of cases) {
  const segments = [{ id: "s1", start: 0, end: 20, text: c.text }];
  const output = await post("record", { segments, detail: "detailed" });
  const review = await post("review", { segments, detail: "detailed", candidate: output.record });
  const pass = c.check(output.record) && c.check(review.record);
  outputs.push({ name: c.name, stage: "record", input: c.text, output, review, pass });
  if (!pass) failures++;
  console.log(c.name, pass ? "PASS" : "FAIL");
  writeFileSync("docs/stage-evaluation.json", JSON.stringify({ date: new Date().toISOString(), promptVersion: PROMPT_VERSION, outputs }, null, 2));
}
if (failures) process.exitCode = 1;
