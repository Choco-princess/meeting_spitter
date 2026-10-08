import { describe, expect, it } from "vitest";
import {
  applyCorrections,
  cleanReferences,
  markdown,
  MODELS,
  type Transcript,
  type MeetingRecord,
} from "../shared/schema";
import worker from "../worker/index";
const raw: Transcript = {
  text: "Use cube ernetes, not Docker. Timeout is 30 seconds.",
  duration: 10,
  warnings: [],
  segments: [
    {
      id: "s1",
      start: 0,
      end: 10,
      text: "Use cube ernetes, not Docker. Timeout is 30 seconds.",
    },
  ],
};
const record: MeetingRecord = {
  title: "Planning",
  summary: ["Keep the pilot internal."],
  minutes: [{ topic: "Pilot", points: ["Keep it internal."] }],
  decisions: [{ text: "Keep it internal.", sourceIds: ["s1", "fake"] }],
  tasks: [
    {
      description: "Review retries.",
      owner: null,
      deadline: null,
      sourceIds: ["s1"],
    },
  ],
  openQuestions: [],
};
describe("faithful results", () => {
  it("applies a terminology patch without modifying the raw transcript or negation/numbers", () => {
    const r = applyCorrections(raw, [
      {
        segmentId: "s1",
        original: "cube ernetes",
        replacement: "Kubernetes",
        reason: "Technical term",
      },
    ]);
    expect(r.transcript.text).toBe(
      "Use Kubernetes, not Docker. Timeout is 30 seconds.",
    );
    expect(raw.text).toContain("cube ernetes");
  });
  it("rejects missing, ambiguous and overlapping patches without corrupting text", () => {
    const base = { segmentId: "s1", reason: "test" };
    const r = applyCorrections(raw, [
      { ...base, original: "Use cube ernetes", replacement: "Use Kubernetes" },
      { ...base, original: "cube ernetes", replacement: "k8s" },
      { ...base, original: "missing", replacement: "new" },
    ]);
    expect(r.corrections.map((c) => c.applied)).toEqual([true, false, false]);
    const repeated = {
      ...raw,
      segments: [{ ...raw.segments[0], text: "test test" }],
    };
    expect(
      applyCorrections(repeated, [
        { ...base, original: "test", replacement: "x" },
      ]).corrections[0].applied,
    ).toBe(false);
  });
  it("applies multiple patches against the original offsets", () => {
    const r = applyCorrections(raw, [
      {
        segmentId: "s1",
        original: "cube ernetes",
        replacement: "Kubernetes",
        reason: "",
      },
      {
        segmentId: "s1",
        original: "Timeout",
        replacement: "Time-out",
        reason: "",
      },
    ]);
    expect(r.transcript.text).toBe(
      "Use Kubernetes, not Docker. Time-out is 30 seconds.",
    );
  });
  it("does not count unchanged wording as an applied correction", () => {
    const r = applyCorrections(raw, [{ segmentId: "s1", original: "Timeout", replacement: "Timeout", reason: "No change" }]);
    expect(r.corrections[0].applied).toBe(false);
    expect(r.transcript.text).toBe(raw.text);
  });
  it("removes invalid references but preserves useful content", () => {
    const r = cleanReferences(record, raw.segments);
    expect(r.record.decisions[0].sourceIds).toEqual(["s1"]);
    expect(r.warnings).toHaveLength(1);
    expect(r.record.tasks[0].owner).toBeNull();
  });
  it("exports null fields as Unspecified and decisions/tasks from the same record", () => {
    const text = markdown({
      schemaVersion: "1.0",
      filename: "meeting.wav",
      createdAt: "test",
      models: MODELS,
      promptVersion: "1.0",
      raw,
      corrections: [],
      record,
      warnings: [],
    });
    expect(text).toContain("Owner: Unspecified");
    expect(text).toContain("Deadline: Unspecified");
    expect(text).toContain(record.tasks[0].description);
    expect(text).toContain(record.decisions[0].text);
  });
});
describe("API input and origin checks", () => {
  const env = {
    GROQ_API_KEY: "test",
    ALLOWED_ORIGINS: "https://example.com",
    SERVICE_ENABLED: "true",
  };
  it("rejects unknown origins before upstream work", async () => {
    const r = await worker.fetch(
      new Request("https://api.test/api/record", {
        method: "POST",
        headers: { Origin: "https://evil.test" },
      }),
      env,
    );
    expect(r.status).toBe(403);
  });
  it("handles CORS preflight", async () => {
    const r = await worker.fetch(
      new Request("https://api.test/api/record", {
        method: "OPTIONS",
        headers: { Origin: "https://example.com" },
      }),
      env,
    );
    expect(r.status).toBe(204);
    expect(r.headers.get("Access-Control-Allow-Origin")).toBe(
      "https://example.com",
    );
  });
  it("rejects malformed JSON with a useful error", async () => {
    const r = await worker.fetch(
      new Request("https://api.test/api/record", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{oops",
      }),
      env,
    );
    expect(r.status).toBe(400);
  });
  it("rejects empty audio", async () => {
    const f = new FormData();
    f.set("file", new File([], "empty.wav"));
    const r = await worker.fetch(
      new Request("https://api.test/api/transcribe", {
        method: "POST",
        body: f,
      }),
      env,
    );
    expect(r.status).toBe(400);
  });
  it("rejects over-limit transcript without silent truncation", async () => {
    const r = await worker.fetch(
      new Request("https://api.test/api/record", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          segments: [{ id: "s1", start: 0, end: 1, text: "a".repeat(14001) }],
        }),
      }),
      env,
    );
    expect(r.status).toBe(413);
  });
});
