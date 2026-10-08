import { z } from 'zod';

export const MODELS = { transcription: 'whisper-large-v3', refinement: 'openai/gpt-oss-20b', record: 'openai/gpt-oss-120b' } as const;
export const PROMPT_VERSION = '1.0';
export const MAX_AUDIO_BYTES = 24 * 1024 * 1024;
export const MAX_TRANSCRIPT_CHARS = 14000;
export const SegmentSchema = z.object({ id: z.string(), start: z.number().nonnegative(), end: z.number().nonnegative(), text: z.string() });
export type Segment = z.infer<typeof SegmentSchema>;
export const TranscriptSchema = z.object({ text: z.string(), segments: z.array(SegmentSchema), duration: z.number().nonnegative(), warnings: z.array(z.string()) });
export type Transcript = z.infer<typeof TranscriptSchema>;
export const CorrectionSchema = z.object({ segmentId: z.string(), original: z.string(), replacement: z.string(), reason: z.string() });
export const RefinementSchema = z.object({ corrections: z.array(CorrectionSchema) });
export type Correction = z.infer<typeof CorrectionSchema>;
export type AppliedCorrection = Correction & { applied: boolean; note?: string };
export const RecordSchema = z.object({
  title: z.string(), summary: z.array(z.string()),
  minutes: z.array(z.object({ topic: z.string(), points: z.array(z.string()) })),
  decisions: z.array(z.object({ text: z.string(), sourceIds: z.array(z.string()) })),
  tasks: z.array(z.object({ description: z.string(), owner: z.string().nullable(), deadline: z.string().nullable(), sourceIds: z.array(z.string()) })),
  openQuestions: z.array(z.string()),
});
export type MeetingRecord = z.infer<typeof RecordSchema>;
export interface Result {
  schemaVersion: '1.0'; filename: string; createdAt: string;
  models: typeof MODELS; promptVersion: string;
  raw: Transcript; refined?: Transcript; corrections: AppliedCorrection[];
  record?: MeetingRecord; warnings: string[];
}

export function applyCorrections(raw: Transcript, corrections: Correction[]): { transcript: Transcript; corrections: AppliedCorrection[] } {
  const segments = raw.segments.map(s => ({ ...s }));
  const accepted: AppliedCorrection[] = [];
  // Resolve all spans against the immutable original, then apply right-to-left.
  const spans = new Map<string, { start: number; end: number; correction: Correction }[]>();
  for (const c of corrections) {
    const segment = raw.segments.find(s => s.id === c.segmentId);
    const start = segment?.text.indexOf(c.original) ?? -1;
    let note = '';
    if (!c.original.trim() || !c.replacement.trim() || !segment || start < 0) note = 'Original wording could not be located.';
    else if (segment.text.indexOf(c.original, start + 1) !== -1) note = 'Original wording occurs more than once; left unchanged.';
    else if ((spans.get(c.segmentId) ?? []).some(p => start < p.end && start + c.original.length > p.start)) note = 'Overlapping correction; left unchanged.';
    if (note) { accepted.push({ ...c, applied: false, note }); continue; }
    spans.set(c.segmentId, [...(spans.get(c.segmentId) ?? []), { start, end: start + c.original.length, correction: c }]);
    accepted.push({ ...c, applied: true });
  }
  for (const segment of segments) for (const p of (spans.get(segment.id) ?? []).sort((a,b) => b.start - a.start)) segment.text = segment.text.slice(0,p.start) + p.correction.replacement + segment.text.slice(p.end);
  return { transcript: { ...raw, segments, text: segments.map(s => s.text).join(' ') }, corrections: accepted };
}

export function cleanReferences(record: MeetingRecord, segments: Segment[]) {
  const ids = new Set(segments.map(s => s.id)); let removed = false;
  const clean = (refs: string[]) => [...new Set(refs)].filter(id => { if (ids.has(id)) return true; removed = true; return false; });
  return {
    record: { ...record, decisions: record.decisions.map(d => ({...d, sourceIds: clean(d.sourceIds)})), tasks: record.tasks.map(t => ({...t, owner: t.owner?.trim() || null, deadline: t.deadline?.trim() || null, sourceIds: clean(t.sourceIds)})) },
    warnings: removed ? ['Some source references could not be matched. Review those items against the transcript.'] : [],
  };
}

export function timeLabel(seconds: number) { const s = Math.max(0, Math.floor(seconds)); return `${Math.floor(s/60).toString().padStart(2,'0')}:${(s%60).toString().padStart(2,'0')}`; }
export function transcriptText(t: Transcript) { return t.segments.map(s => `[${timeLabel(s.start)}] ${s.text}`).join('\n\n'); }
export function markdown(result: Result): string {
  const r = result.record;
  const lines = [`# ${r?.title || 'Meeting record'}`, '', `Source: ${result.filename}`, `Generated: ${result.createdAt}`, '', '> AI-generated draft. Review important details against the recording.', ''];
  if (!r) lines.push('Processing is incomplete. Available transcripts are included in the other downloads.');
  else {
    lines.push('## Summary', '', ...r.summary.map(s=>`- ${s}`), '', '## Minutes', '');
    for (const m of r.minutes) lines.push(`### ${m.topic}`, '', ...m.points.map(p=>`- ${p}`), '');
    lines.push('## Decisions', '', ...(r.decisions.length ? r.decisions.map(d=>`- ${d.text}${d.sourceIds.length ? ` (Sources: ${d.sourceIds.join(', ')})` : ''}`) : ['No confirmed decisions identified.']), '', '## Action items', '');
    if (!r.tasks.length) lines.push('No confirmed action items identified.');
    for (const t of r.tasks) lines.push(`- ${t.description}`, `  - Owner: ${t.owner ?? 'Unspecified'}`, `  - Deadline: ${t.deadline ?? 'Unspecified'}`, `  - Sources: ${t.sourceIds.join(', ') || 'Not linked'}`, '');
    if (r.openQuestions.length) lines.push('## Open questions / needs confirmation', '', ...r.openQuestions.map(q=>`- ${q}`), '');
  }
  if (result.warnings.length) lines.push('## Review notes', '', ...result.warnings.map(w=>`- ${w}`), '');
  lines.push('## Model pipeline', '', ...Object.entries(result.models).map(([role,model])=>`- ${role}: ${model}`), `- Prompt version: ${result.promptVersion}`);
  return lines.join('\n');
}
