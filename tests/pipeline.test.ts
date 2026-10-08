import { afterEach, describe, expect, it, vi } from "vitest";
import { runPipeline, call, validateFile } from "../src/api";
import {
  MODELS,
  PROMPT_VERSION,
  finalizeRecord,
  type Result,
  type Transcript,
} from "../shared/schema";
const raw: Transcript = {
  text: "We agreed to review the API.",
  duration: 5,
  warnings: [],
  segments: [
    { id: "s1", start: 0, end: 5, text: "We agreed to review the API." },
  ],
};
const record = {
  title: "API",
  summary: ["Review API"],
  minutes: [],
  decisions: [],
  tasks: [
    {
      description: "Review API",
      owner: null,
      deadline: null,
      sourceIds: ["s1"],
    },
  ],
  openQuestions: [],
};
const file = new File(["not used in mocked upstream"], "meeting.wav");
const respond = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
describe("pipeline resilience", () => {
  it("runs all three stages in order and preserves the raw transcript", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(respond(raw))
      .mockResolvedValueOnce(respond({ corrections: [] }))
      .mockResolvedValueOnce(respond({ record, warnings: [] }));
    vi.stubGlobal("fetch", fetcher);
    const stages: string[] = [];
    const r = await runPipeline(
      file,
      "",
      undefined,
      new AbortController().signal,
      () => {},
      (s) => stages.push(s),
    );
    expect(stages).toEqual(["transcription", "refinement", "record"]);
    expect(r.raw).toEqual(raw);
    expect(r.record?.tasks[0].owner).toBeNull();
  });
  it("preserves prior results on failure and resumes only the unfinished stage", async () => {
    let saved: Result | undefined;
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(respond(raw))
      .mockResolvedValueOnce(respond({ corrections: [] }))
      .mockResolvedValueOnce(respond({ error: "Invalid request" }, 400));
    vi.stubGlobal("fetch", fetcher);
    await expect(
      runPipeline(
        file,
        "",
        undefined,
        new AbortController().signal,
        (r) => {
          saved = r;
        },
        () => {},
      ),
    ).rejects.toThrow("Invalid request");
    expect(saved?.refined).toBeDefined();
    fetcher
      .mockClear()
      .mockResolvedValueOnce(respond({ record, warnings: [] }));
    await runPipeline(
      file,
      "",
      saved,
      new AbortController().signal,
      () => {},
      () => {},
    );
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0][0]).toContain("/api/record");
  });
  it("does not publish a late response after cancellation", async () => {
    const control = new AbortController();
    let resolve!: (r: Response) => void;
    vi.stubGlobal(
      "fetch",
      vi.fn(
        () =>
          new Promise((r) => {
            resolve = r;
          }),
      ),
    );
    const update = vi.fn();
    const run = runPipeline(
      file,
      "",
      undefined,
      control.signal,
      update,
      () => {},
    );
    control.abort();
    resolve(respond(raw));
    await expect(run).rejects.toThrow();
    expect(update).not.toHaveBeenCalled();
  });
  it("honors Retry-After and can succeed on the next attempt", async () => {
    vi.useFakeTimers();
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: "Busy" }), {
          status: 429,
          headers: { "Retry-After": "2" },
        }),
      )
      .mockResolvedValueOnce(respond({ ready: true }));
    vi.stubGlobal("fetch", fetcher);
    const status = vi.fn();
    const pending = call("record", {}, new AbortController().signal, status);
    await vi.advanceTimersByTimeAsync(2000);
    expect(await pending).toEqual({ ready: true });
    expect(status).toHaveBeenCalledWith(expect.stringContaining("2 seconds"));
  });
  it("does not loop on a daily quota exhaustion", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(
        respond({ error: "The free daily quota is exhausted." }, 429),
      );
    vi.stubGlobal("fetch", fetcher);
    await expect(
      call("record", {}, new AbortController().signal, () => {}),
    ).rejects.toThrow("daily");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("rejects empty and unsupported files before any request", () => {
    expect(() => validateFile(new File([], "empty.wav"))).toThrow("empty");
    expect(() => validateFile(new File(["hi"], "file.txt"))).toThrow(
      "Choose a WAV",
    );
  });
  it("keeps unresolved candidates available without calling them confirmed", () => {
    const { decisions: _, tasks, ...base } = record;
    const r = finalizeRecord({
      ...base,
      taskCandidates: [
        { ...tasks[0], status: "agreed" },
        { description: "Investigate tool licensing", owner: null, deadline: null, sourceIds: ["s2"], status: "proposed" },
      ],
      decisionCandidates: [
        { status: "agreed", text: "Keep pilot internal", sourceIds: ["s1"] },
        {
          status: "unresolved",
          text: "Vendor migration remains a proposal",
          sourceIds: ["s2"],
        },
      ],
    });
    expect(r.decisions).toHaveLength(1);
    expect(r.openQuestions).toContain("Vendor migration remains a proposal");
    expect(r.tasks).toEqual(tasks);
    expect(r.openQuestions).toContain("Proposed work (not agreed): Investigate tool licensing");
  });
  it("returns a complete cached result without spending another request", async () => {
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    const cached: Result = {
      schemaVersion: "1.0",
      filename: "meeting.wav",
      createdAt: "test",
      models: MODELS,
      promptVersion: PROMPT_VERSION,
      raw,
      refined: raw,
      corrections: [],
      record,
      warnings: [],
    };
    expect(
      await runPipeline(
        file,
        "",
        cached,
        new AbortController().signal,
        () => {},
        () => {},
      ),
    ).toEqual(cached);
    expect(fetcher).not.toHaveBeenCalled();
  });
});
