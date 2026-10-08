import { afterEach, describe, expect, it, vi } from "vitest";
import worker from "../worker/index";
const env = { GROQ_API_KEY: "test", ALLOWED_ORIGINS: "", SERVICE_ENABLED: "true" };
const segments = [{ id: "s1", start: 1.234, end: 5.678, text: "The agenda was approved unanimously." }];
const draft = { title: "Council", summary: ["Agenda approved."], minutes: [{ topic: "Agenda", points: ["Approved unanimously."] }], decisionCandidates: [{ status: "agreed", text: "Approve agenda", sourceIds: ["s1"] }], taskCandidates: [], openQuestions: [] };
const completion = () => new Response(JSON.stringify({ choices: [{ finish_reason: "stop", message: { content: JSON.stringify(draft) } }] }), { status: 200 });
const request = (path: string, body: object) => new Request(`https://api.test/api/${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
afterEach(() => vi.unstubAllGlobals());
describe("model request budget and review boundary", () => {
  it("tries the backup credential before changing models on a quota failure", async () => {
    const upstream = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ error: { message: "Rate limit on tokens per day (TPD)" } }), { status: 429 })).mockResolvedValueOnce(completion());
    vi.stubGlobal("fetch", upstream);
    const response = await worker.fetch(request("record", { segments }), { ...env, GROQ_API_KEY_FALLBACK: "backup-test" });
    const data = await response.json();
    expect(response.status).toBe(200);
    expect(upstream).toHaveBeenCalledTimes(2);
    expect(upstream.mock.calls.map(call => call[1].headers.Authorization)).toEqual(["Bearer test", "Bearer backup-test"]);
    expect(JSON.parse(upstream.mock.calls[0][1].body)).toEqual(JSON.parse(upstream.mock.calls[1][1].body));
    expect(data.model).toBe("openai/gpt-oss-120b");
    expect(data.warnings.join()).toContain("backup Groq credential");
    expect(JSON.stringify(data)).not.toContain("backup-test");
  });
  it("reuses multipart audio with the backup after an authentication failure", async () => {
    const upstream = vi.fn().mockResolvedValueOnce(new Response("{}", { status: 401 })).mockResolvedValueOnce(new Response(JSON.stringify({ text: "Agenda approved.", duration: 5, segments: [{ start: 0, end: 5, text: "Agenda approved." }] }), { status: 200 }));
    vi.stubGlobal("fetch", upstream);
    const form = new FormData(); form.set("file", new File(["audio-fixture"], "meeting.wav"));
    const response = await worker.fetch(new Request("https://api.test/api/transcribe", { method: "POST", body: form }), { ...env, GROQ_API_KEY_FALLBACK: "backup-test" });
    expect(response.status).toBe(200);
    expect(upstream).toHaveBeenCalledTimes(2);
    expect(upstream.mock.calls[0][1].body).toBe(upstream.mock.calls[1][1].body);
    expect((await response.json()).warnings.join()).toContain("backup Groq credential");
  });
  it("does not switch credentials for an intrinsically oversized output reservation", async () => {
    const upstream = vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: { message: "Request too large on output tokens per minute: Limit 200, Requested 2020" } }), { status: 429 }));
    vi.stubGlobal("fetch", upstream);
    const response = await worker.fetch(request("record", { segments }), { ...env, GROQ_API_KEY_FALLBACK: "backup-test" });
    expect(response.status).toBe(413);
    expect(upstream).toHaveBeenCalledTimes(1);
  });
  it("keeps invalid input and duplicate keys from triggering credential rotation", async () => {
    const upstream = vi.fn().mockResolvedValue(new Response("{}", { status: 401 }));
    vi.stubGlobal("fetch", upstream);
    const response = await worker.fetch(request("refine", { segments }), { ...env, GROQ_API_KEY_FALLBACK: "test" });
    expect(response.status).toBe(503);
    expect(upstream).toHaveBeenCalledTimes(1);
    const invalid = await worker.fetch(request("record", { segments: [] }), { ...env, GROQ_API_KEY_FALLBACK: "backup-test" });
    expect(invalid.status).toBe(400);
    expect(upstream).toHaveBeenCalledTimes(1);
  });
  it("surfaces the backup key failure without indefinite retries or secret exposure", async () => {
    const upstream = vi.fn().mockResolvedValue(new Response("{}", { status: 403 }));
    vi.stubGlobal("fetch", upstream);
    const response = await worker.fetch(request("refine", { segments }), { ...env, GROQ_API_KEY_FALLBACK: "backup-test" });
    expect(response.status).toBe(503);
    expect(upstream).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(await response.json())).not.toContain("backup-test");
  });
  it("handles an impossible output-minute reservation as a budget problem rather than an endless busy retry", async () => {
    const upstream = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: { message: "Rate limit on tokens per day (TPD)" } }), { status: 429 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: { message: "Request too large on output tokens per minute (OTPM): Limit 1000, Requested 2020." } }), { status: 429 }))
      .mockResolvedValueOnce(completion());
    vi.stubGlobal("fetch", upstream);
    const response = await worker.fetch(request("record", { segments, detail: "detailed" }), env);
    expect(response.status).toBe(200);
    const retry = JSON.parse(upstream.mock.calls[2][1].body);
    expect(retry.max_completion_tokens).toBeLessThan(1000);
    expect(retry.reasoning_effort).toBe("none");
    expect((await response.json()).warnings.join()).toContain("more compact");
  });
  it("uses a distinct free fallback on daily quota exhaustion and reports its actual model", async () => {
    const upstream = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ error: { message: "Rate limit on tokens per day (TPD)" } }), { status: 429 })).mockResolvedValueOnce(completion());
    vi.stubGlobal("fetch", upstream);
    const response = await worker.fetch(request("record", { segments, detail: "detailed" }), env);
    const data = await response.json();
    expect(response.status).toBe(200);
    expect(data.model).toBe("qwen/qwen3.8-27b");
    expect(data.warnings.join()).toContain("daily quota");
    expect(JSON.parse(upstream.mock.calls[1][1].body).model).toBe(data.model);
  });
  it("reduces an over-reserved output budget without dropping transcript words or IDs", async () => {
    const upstream = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ error: { message: "Request too large on tokens per minute (TPM): Limit 8000, Requested 9000." } }), { status: 413 })).mockResolvedValueOnce(completion());
    vi.stubGlobal("fetch", upstream);
    const response = await worker.fetch(request("record", { segments, detail: "detailed" }), env);
    expect(response.status).toBe(200);
    const first = JSON.parse(upstream.mock.calls[0][1].body), second = JSON.parse(upstream.mock.calls[1][1].body);
    expect(second.max_completion_tokens).toBeLessThan(first.max_completion_tokens);
    expect(second.messages).toEqual(first.messages);
    const input = JSON.parse(second.messages[1].content);
    expect(input.segments).toEqual([{ id: "s1", text: segments[0].text }]);
    expect(segments[0].start).toBe(1.234);
    expect((await response.json()).record.decisions).toHaveLength(1);
  });
  it("returns a clear limit error when too little output budget remains", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: { message: "Limit 8000, Requested 12000" } }), { status: 413 })));
    const response = await worker.fetch(request("record", { segments, detail: "full" }), env);
    expect(response.status).toBe(413);
    expect((await response.json()).error).toContain("shorter excerpt");
  });
  it("treats a review candidate as unverified data and returns a fresh classified record", async () => {
    const candidate = { title: "Wrong draft", summary: ["Plan approved."], minutes: [], decisions: [], tasks: [], openQuestions: [] };
    const upstream = vi.fn().mockResolvedValue(completion()); vi.stubGlobal("fetch", upstream);
    const response = await worker.fetch(request("review", { segments, candidate, detail: "detailed" }), env);
    expect(response.status).toBe(200);
    const payload = JSON.parse(upstream.mock.calls[0][1].body);
    expect(payload.messages[0].content).toContain("UNVERIFIED draft");
    expect(JSON.parse(payload.messages[1].content).candidate).toEqual(candidate);
    expect((await response.json()).record.decisions[0].text).toBe("Approve agenda");
  });
});
