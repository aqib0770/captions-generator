import fs from "fs/promises";
import path from "path";
import type { Segment, Word } from "./types.js";

const INPUT: string = process.argv[2] || "transcript-roman.json";
const OUTPUT: string = process.argv[3] || "captions.srt";
const MAX_WORDS_PER_CUE = 3;
const MAX_CHARS_PER_CUE = 20;

if (!INPUT || !OUTPUT) {
  console.error("Usage: node jsontosrt.js <input.json> <output.srt>");
  process.exit(1);
}

// ---------- Time formatting ----------

function formatSRTTime(seconds: number): string {
  let ms = Math.round(seconds * 1000);
  const millis = ms % 1000;
  ms = Math.floor(ms / 1000);
  const secs = ms % 60;
  ms = Math.floor(ms / 60);
  const mins = ms % 60;
  const hrs = Math.floor(ms / 60);
  const pad = (n: number, len = 2): string => String(n).padStart(len, "0");
  return `${pad(hrs)}:${pad(mins)}:${pad(secs)},${pad(millis, 3)}`;
}

// ---------- Grouping ----------

function groupWordsIntoCues(segments: Segment[]): Word[][] {
  const cues: Word[][] = [];

  for (const segment of segments) {
    let current: Word[] = [];

    for (const word of segment.words) {
      const textIfAdded = [...current, word].map((w) => w.text).join(" ");

      const exceedsWordLimit = current.length >= MAX_WORDS_PER_CUE;
      const exceedsCharLimit =
        current.length > 0 && textIfAdded.length > MAX_CHARS_PER_CUE;

      if (current.length > 0 && (exceedsWordLimit || exceedsCharLimit)) {
        cues.push(current);
        current = [];
      }

      current.push(word);
    }

    if (current.length > 0) {
      cues.push(current);
    }
  }

  return cues;
}

// ---------- SRT generation ----------

function cuesToSRT(cues: Word[][]): string {
  return cues
    .map((cue, index) => {
      const start = formatSRTTime(cue[0].start);
      const end = formatSRTTime(cue[cue.length - 1].end);
      const text = cue.map((w) => w.text).join(" ");
      return `${index + 1}\n${start} --> ${end}\n${text}\n`;
    })
    .join("\n");
}

// ---------- Main ----------

async function main(): Promise<void> {
  console.log(`Reading ${INPUT}...`);
  const raw = await fs.readFile(INPUT, "utf8");
  const segments: Segment[] = JSON.parse(raw);
  console.log(`Loaded ${segments.length} segments`);

  const cues = groupWordsIntoCues(segments);
  const srt = cuesToSRT(cues);

  await fs.mkdir(path.dirname(path.resolve(OUTPUT)), { recursive: true });
  await fs.writeFile(OUTPUT, srt, "utf8");
  console.log(`Wrote ${cues.length} cues to ${OUTPUT}`);
}

main().catch((err: Error) => {
  console.error("Failed:", err);
  process.exit(1);
});
