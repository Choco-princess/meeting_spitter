// Local evaluation helper: exercise the same bounded container parser as the UI.
// Browser resampling is tested separately through the actual upload workflow.
import { readFileSync, writeFileSync } from "node:fs";
import { basename } from "node:path";
import { excerptSource } from "../src/excerpt";
const input = process.argv[2], output = process.argv[3];
if (!input || !output) throw new Error("Usage: tsx scripts/prepare-test-excerpt.ts INPUT OUTPUT");
const source = new File([readFileSync(input)], basename(input));
const clip = await excerptSource(source, new AbortController().signal);
writeFileSync(output, new Uint8Array(await clip.arrayBuffer()));
console.log(JSON.stringify({ original: source.name, originalBytes: source.size, excerptBytes: clip.size }));
