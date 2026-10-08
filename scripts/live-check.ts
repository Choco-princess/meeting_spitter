import { readFileSync, writeFileSync } from 'node:fs';
import { applyCorrections, MODELS, PROMPT_VERSION, markdown, transcriptText, type Transcript, type Result } from '../shared/schema';
const base=process.env.API_BASE || 'https://meeting-spitter-api.ajaymeena69031.workers.dev';
async function post(path:string,body:unknown){const r=await fetch(`${base}/api/${path}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const d=await r.json();if(!r.ok)throw new Error(`${path}: ${r.status} ${JSON.stringify(d)}`);return d;}
const raw=JSON.parse(readFileSync('samples/raw.json','utf8')) as Transcript;
const refinement=await post('refine',{segments:raw.segments,glossary:'Kubernetes, PostgreSQL, p95 latency; participants: Maya, Leo, Priya'});
const applied=applyCorrections(raw,refinement.corrections);
writeFileSync('samples/refinement.json',JSON.stringify(applied,null,2));
console.log('Refinement:',JSON.stringify(applied.corrections));
const output=await post('record',{segments:applied.transcript.segments});
const result:Result={schemaVersion:'1.0',filename:'planning-meeting.wav',createdAt:new Date().toISOString(),models:MODELS,promptVersion:PROMPT_VERSION,raw,refined:applied.transcript,corrections:applied.corrections,record:output.record,warnings:output.warnings};
writeFileSync('samples/meeting-record.json',JSON.stringify(result,null,2));writeFileSync('samples/meeting-record.md',markdown(result));writeFileSync('samples/raw-transcript.txt',transcriptText(raw));writeFileSync('samples/refined-transcript.txt',transcriptText(applied.transcript));
console.log('Record:',JSON.stringify(output));
