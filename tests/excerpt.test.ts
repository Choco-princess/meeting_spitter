import { describe, expect, it, vi, afterEach } from "vitest";
import { excerptSource, pcmWav, supportsExcerpt } from "../src/excerpt";
import { validateFile, runPipeline } from "../src/api";
import { MAX_AUDIO_BYTES, markdown, transcriptText } from "../shared/schema";

const signal = () => new AbortController().signal;
function wav(seconds: number, rate = 8000) {
  const data = new Float32Array(seconds * rate);
  data.fill(0.2, 0, Math.min(data.length, 180 * rate));
  data.fill(-0.8, 180 * rate);
  return new File([pcmWav(data, rate)], "meeting.wav");
}
function mp3(count: number, low = false, vbr = false) {
  const chunks: Uint8Array<ArrayBuffer>[] = [];
  for (let i = 0; i < count; i++) {
    // MPEG1: 128/160k at 44.1k; MPEG2: 64k at 22.05k.
    const bitrate = low ? 64 : vbr && i % 2 ? 160 : 128;
    const length = Math.floor((low ? 72 : 144) * bitrate * 1000 / (low ? 22050 : 44100));
    const bytes = new Uint8Array(length);
    bytes.set([255, low ? 243 : 251, low ? 128 : bitrate === 160 ? 160 : 144, 0]);
    chunks.push(bytes);
  }
  return new File(chunks, "meeting.mp3");
}
afterEach(() => vi.unstubAllGlobals());
describe("bounded excerpt preparation", () => {
  it("cuts a WAV at 180 seconds, fixes its sizes and excludes later audio", async () => {
    const original = wav(181);
    const clip = await excerptSource(original, signal());
    const bytes = await clip.arrayBuffer(), v = new DataView(bytes);
    expect(clip.size).toBe(44 + 180 * 8000 * 2);
    expect(v.getUint32(4, true) + 8).toBe(clip.size);
    expect(v.getInt16(bytes.byteLength - 2, true)).toBeGreaterThan(0);
    expect(new DataView(await original.arrayBuffer()).getInt16(original.size - 2, true)).toBeLessThan(0);
  });
  it("keeps a shorter WAV complete", async () => {
    expect((await excerptSource(wav(2), signal())).size).toBe(32044);
  });
  it("rejects unfinished WAV headers instead of silently repairing a download", async () => {
    const bytes = await wav(1).arrayBuffer();
    new DataView(bytes).setUint32(4, 0xffffffff, true);
    await expect(excerptSource(new File([bytes], "stream.wav"), signal())).rejects.toThrow("incomplete");
  });
  it("rejects truncated WAV data and invalid block alignment", async () => {
    const original = wav(1);
    await expect(excerptSource(new File([original.slice(0, 100)], "bad.wav"), signal())).rejects.toThrow("incomplete");
    const bytes = await original.arrayBuffer(); new DataView(bytes).setUint16(32, 4, true);
    await expect(excerptSource(new File([bytes], "bad.wav"), signal())).rejects.toThrow("incomplete");
  });
  it.each([false, true])("cuts complete VBR/CBR MP3 frames at three minutes (VBR=%s)", async (vbr) => {
    const source = mp3(7200, false, vbr);
    const clip = await excerptSource(source, signal());
    const frames = Math.floor(180 * 44100 / 1152);
    expect(clip.size).toBe(mp3(frames, false, vbr).size);
    expect(clip.size).toBeLessThan(source.size);
  });
  it("supports MPEG2 frame timing and skips ID3 metadata", async () => {
    const source = mp3(7200, true);
    const id3 = new Uint8Array([73,68,51,4,0,0,0,0,0,2,0,0]);
    const clip = await excerptSource(new File([id3, source], "tags.mp3"), signal());
    expect(clip.size).toBe(mp3(Math.floor(180 * 22050 / 576), true).size);
  });
  it("removes the full-file duration signature from a trimmed MP3", async () => {
    const bytes = new Uint8Array(await mp3(2).arrayBuffer());
    bytes.set(new TextEncoder().encode("Xing"), 36);
    const clip = new Uint8Array(await (await excerptSource(new File([bytes], "vbr.mp3"), signal())).arrayBuffer());
    expect([...clip.slice(36, 40)]).toEqual([0,0,0,0]);
  });
  it("rejects a cut MP3 frame and unsupported excerpt format", async () => {
    await expect(excerptSource(new File([mp3(1).slice(0, 50)], "bad.mp3"), signal())).rejects.toThrow("incomplete");
    await expect(excerptSource(new File(["data"], "meeting.m4a"), signal())).rejects.toThrow("WAV and MP3");
    expect(supportsExcerpt(new File(["data"], "meeting.m4a"))).toBe(false);
  });
  it("honors cancellation before reading or publishing any clip", async () => {
    const control = new AbortController(); control.abort();
    await expect(excerptSource(wav(1), control.signal)).rejects.toThrow();
  });
  it("allows local oversized selection but preserves the real upload cap", () => {
    const file = new File([new Uint8Array(MAX_AUDIO_BYTES + 1)], "large.wav");
    expect(() => validateFile(file, true)).not.toThrow();
    expect(() => validateFile(file)).toThrow("24 MB");
  });
  it("keeps excerpt scope in pipeline results, Markdown and both transcript exports", async () => {
    const raw = { text: "Discuss the API.", segments: [{ id: "s1", start: 0, end: 1, text: "Discuss the API." }], duration: 1, warnings: [] };
    const bodies = [raw, { corrections: [] }, { record: { title: "API", summary: ["API discussion"], minutes: [], decisions: [], tasks: [], openQuestions: [] }, warnings: [] }];
    vi.stubGlobal("fetch", vi.fn().mockImplementation(async () => new Response(JSON.stringify(bodies.shift()), { status: 200 })));
    const excerpt = { originalFilename: "large.wav", originalBytes: 40000000, startSeconds: 0, endSeconds: 180, requestedSeconds: 180 };
    const result = await runPipeline(wav(1), "", undefined, signal(), () => {}, () => {}, excerpt);
    expect(result.filename).toBe("large.wav"); expect(result.excerpt).toEqual(excerpt);
    expect(result.warnings.join()).toContain("Later discussion");
    expect(markdown(result)).toContain("Excerpt only: 00:00–03:00");
    expect(transcriptText(result.raw, result.excerpt)).toContain("Excerpt only");
    expect(transcriptText(result.refined!, result.excerpt)).toContain("Excerpt only");
  });
});
