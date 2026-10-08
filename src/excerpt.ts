import { MAX_AUDIO_BYTES, type Excerpt } from "../shared/schema";

export const EXCERPT_SECONDS = 180;
const MAX_DECODE_BYTES = 64 * 1024 * 1024;
const invalid = () => new Error("This recording is incomplete, corrupt, or has an unsupported audio header. Choose a fully downloaded WAV or MP3.");
const tag = (b: Uint8Array, p = 0) => String.fromCharCode(...b.subarray(p, p + 4));
export const supportsExcerpt = (file: File) => /\.(wav|mp3)$/i.test(file.name);

// Read only the prefix needed for the excerpt, never decode the whole large file.
export async function excerptSource(file: File, signal: AbortSignal): Promise<Blob> {
  signal.throwIfAborted();
  if (/\.wav$/i.test(file.name)) {
    const head = new Uint8Array(await file.slice(0, 12).arrayBuffer());
    if (head.length !== 12 || tag(head) !== "RIFF" || tag(head, 8) !== "WAVE") throw invalid();
    const declared = new DataView(head.buffer).getUint32(4, true) + 8;
    if (declared > file.size || declared < 44) throw invalid();
    let format: Uint8Array | undefined;
    for (let offset = 12, count = 0; offset + 8 <= declared && count < 128; count++) {
      signal.throwIfAborted();
      const bytes = new Uint8Array(await file.slice(offset, offset + 8).arrayBuffer());
      const size = new DataView(bytes.buffer).getUint32(4, true);
      const name = tag(bytes);
      const start = offset + 8;
      if (start + size > declared) throw invalid();
      if (name === "fmt ") {
        if (size < 16 || size > 4096) throw invalid();
        format = new Uint8Array(await file.slice(start, start + 16).arrayBuffer());
      }
      if (name === "data") {
        if (!format) throw invalid();
        const v = new DataView(format.buffer);
        const encoding = v.getUint16(0, true), channels = v.getUint16(2, true);
        const rate = v.getUint32(4, true), align = v.getUint16(12, true), bits = v.getUint16(14, true);
        if (!((encoding === 1 && [8, 16, 24, 32].includes(bits)) || (encoding === 3 && bits === 32)) ||
            channels < 1 || channels > 8 || rate < 8000 || rate > 192000 ||
            align !== channels * bits / 8 || v.getUint32(8, true) !== rate * align || !size || size % align) throw invalid();
        const length = Math.min(size, EXCERPT_SECONDS * rate * align);
        if (length > MAX_DECODE_BYTES) throw new Error("This WAV's channel count or sample rate is too large for browser excerpt mode. Export a stereo WAV or MP3 first.");
        const header = new Uint8Array(44);
        const view = new DataView(header.buffer);
        header.set(new TextEncoder().encode("RIFF")); view.setUint32(4, 36 + length, true);
        header.set(new TextEncoder().encode("WAVEfmt "), 8); view.setUint32(16, 16, true);
        header.set(format, 20); header.set(new TextEncoder().encode("data"), 36); view.setUint32(40, length, true);
        return new Blob([header, file.slice(start, start + length)], { type: "audio/wav" });
      }
      offset = start + size + (size % 2);
    }
    throw invalid();
  }
  if (!/\.mp3$/i.test(file.name)) throw new Error("First-3-minutes mode supports WAV and MP3. For other formats, export a shorter recording under 24 MB.");
  // Standard Layer III at its highest bitrate needs <8 MB for three minutes.
  const bytes = new Uint8Array(await file.slice(0, 10 * 1024 * 1024).arrayBuffer());
  let offset = 0;
  if (tag(bytes).slice(0, 3) === "ID3") {
    if (bytes.length < 10 || bytes.subarray(6, 10).some(b => b > 127)) throw invalid();
    offset = 10 + ((bytes[6] << 21) | (bytes[7] << 14) | (bytes[8] << 7) | bytes[9]);
    if (bytes[5] & 16) offset += 10;
    if (offset > 1024 * 1024) throw new Error("This MP3 has unusually large metadata. Export a WAV or an MP3 without artwork first.");
  }
  const beginning = offset;
  let duration = 0, frames = 0, firstFrameLength = 0;
  while (offset + 4 <= bytes.length) {
    const a = bytes[offset], b = bytes[offset + 1], c = bytes[offset + 2];
    if (a !== 255 || (b & 224) !== 224 || ((b >> 1) & 3) !== 1 || ((b >> 3) & 3) === 1) {
      if (frames && file.size === bytes.length && (tag(bytes, offset).slice(0, 3) === "TAG" || bytes.subarray(offset).every(b => b === 0))) break;
      throw invalid();
    }
    const version = (b >> 3) & 3, index = c >> 4, srIndex = (c >> 2) & 3;
    if (index === 0 || index === 15 || srIndex === 3) throw invalid();
    const bitrate = (version === 3 ? [0,32,40,48,56,64,80,96,112,128,160,192,224,256,320] : [0,8,16,24,32,40,48,56,64,80,96,112,128,144,160])[index] * 1000;
    const rate = [44100,48000,32000][srIndex] / (version === 3 ? 1 : version === 2 ? 2 : 4);
    const seconds = (version === 3 ? 1152 : 576) / rate;
    const length = Math.floor((version === 3 ? 144 : 72) * bitrate / rate) + ((c >> 1) & 1);
    if (duration + seconds > EXCERPT_SECONDS) break;
    if (offset + length > bytes.length) throw invalid();
    if (!frames) firstFrameLength = length;
    duration += seconds; offset += length; frames++;
  }
  signal.throwIfAborted();
  if (!frames || (offset === bytes.length && file.size > bytes.length && duration < 179)) throw invalid();
  // Remove tags/artwork; complete MPEG frames remain, with no cut mid-frame.
  const clip = bytes.slice(beginning, offset);
  // Xing/Info may advertise the duration of the full recording; remove only
  // that metadata signature in the first frame's ancillary region.
  const version = (clip[1] >> 3) & 3, mono = (clip[3] >> 6) === 3;
  const infoOffset = 4 + ((clip[1] & 1) ? 0 : 2) + (version === 3 ? (mono ? 17 : 32) : (mono ? 9 : 17));
  if (infoOffset + 4 < firstFrameLength && ["Xing", "Info"].includes(tag(clip, infoOffset))) clip.fill(0, infoOffset, infoOffset + 4);
  return new Blob([clip], { type: "audio/mpeg" });
}

export function pcmWav(samples: Float32Array, rate = 16000): ArrayBuffer {
  const buffer = new ArrayBuffer(44 + samples.length * 2), view = new DataView(buffer);
  const write = (s: string, p: number) => [...s].forEach((c, i) => view.setUint8(p + i, c.charCodeAt(0)));
  write("RIFF", 0); view.setUint32(4, buffer.byteLength - 8, true); write("WAVEfmt ", 8);
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
  view.setUint32(24, rate, true); view.setUint32(28, rate * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true);
  write("data", 36); view.setUint32(40, samples.length * 2, true);
  samples.forEach((sample, i) => {
    const clamped = Math.max(-1, Math.min(1, sample));
    view.setInt16(44 + i * 2, Math.round(clamped * (clamped < 0 ? 32768 : 32767)), true);
  });
  return buffer;
}

export async function prepareExcerpt(file: File, signal: AbortSignal): Promise<{ file: File; excerpt: Excerpt }> {
  const source = await excerptSource(file, signal);
  const context = new AudioContext();
  try {
    const decoded = await context.decodeAudioData(await source.arrayBuffer());
    signal.throwIfAborted();
    const seconds = Math.min(EXCERPT_SECONDS, decoded.duration);
    if (!seconds) throw invalid();
    const render = new OfflineAudioContext(1, Math.floor(seconds * 16000), 16000);
    const node = render.createBufferSource(); node.buffer = decoded; node.connect(render.destination); node.start();
    const mono = await render.startRendering();
    signal.throwIfAborted();
    const upload = new File([pcmWav(mono.getChannelData(0))], file.name.replace(/\.(wav|mp3)$/i, "-first-3-minutes.wav"), { type: "audio/wav" });
    if (upload.size > MAX_AUDIO_BYTES) throw new Error("The excerpt still exceeds the 24 MB upload limit.");
    return { file: upload, excerpt: { originalFilename: file.name, originalBytes: file.size, startSeconds: 0, endSeconds: mono.duration, requestedSeconds: EXCERPT_SECONDS } };
  } catch (e) {
    if (signal.aborted) throw e;
    if (e instanceof DOMException) throw invalid();
    throw e;
  } finally { await context.close(); }
}
