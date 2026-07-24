import fs from "fs/promises";
import path from "path";

interface Word {
  text: string;
  start: number;
  end: number;
}

interface Segment {
  id: number;
  sentence: string;
  words: Word[];
}

const INPUT: string = process.argv[2] || "transcript-roman.json";
const OUTPUT: string = process.argv[3] || "captions.ass";
const MAX_WORDS_PER_CUE = 3;
const MAX_CHARS_PER_CUE = 20;

// ASS colors are in &HAABBGGRR format
const NORMAL_COLOR = "\\1c&H00FFFFFF&";  // white
const HIGHLIGHT_COLOR = "\\1c&H0000FFFF&"; // yellow

if (!INPUT || !OUTPUT) {
  console.error("Usage: node jsontoass.js <input.json> <output.ass>");
  process.exit(1);
}

// ---------- Time formatting (ASS: H:MM:SS.CC) ----------

function formatASSTime(seconds: number): string {
  let cs = Math.round(seconds * 100);
  const centis = cs % 100;
  cs = Math.floor(cs / 100);
  const secs = cs % 60;
  cs = Math.floor(cs / 60);
  const mins = cs % 60;
  const hrs = Math.floor(cs / 60);
  const pad2 = (n: number): string => String(n).padStart(2, "0");
  return `${hrs}:${pad2(mins)}:${pad2(secs)}.${pad2(centis)}`;
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

// ---------- ASS generation ----------

/**
 * For each word in a cue, generates a separate dialogue line spanning
 * that word's duration. The full cue text is shown every time, but only
 * the active word is highlighted — all others stay normal.
 *
 * Result: only the currently spoken word is highlighted at any moment.
 */
function cuesToASS(cues: Word[][], title: string): string {
  const lines: string[] = [];

  // Script Info
  lines.push("[Script Info]");
  lines.push(`Title: ${title}`);
  lines.push("ScriptType: v4.00+");
  lines.push("PlayResX: 1920");
  lines.push("PlayResY: 1080");
  lines.push("WrapStyle: 0");
  lines.push("");

  // V4+ Styles
  lines.push("[V4+ Styles]");
  lines.push(
    "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding"
  );
  lines.push(
    "Style: Default,Arial,48,&H00FFFFFF,&H0000FFFF,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,2,1,2,10,10,40,1"
  );
  lines.push("");

  // Events
  lines.push("[Events]");
  lines.push(
    "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text"
  );

  for (const cue of cues) {
    // One dialogue line per word in the cue
    for (let active = 0; active < cue.length; active++) {
      const start = formatASSTime(cue[active].start);
      const end = formatASSTime(cue[active].end);

      // Build the full cue text, highlighting only the active word
      const text = cue
        .map((w, i) => {
          const color = i === active ? HIGHLIGHT_COLOR : NORMAL_COLOR;
          return `{${color}}${w.text}`;
        })
        .join(" ");

      lines.push(
        `Dialogue: 0,${start},${end},Default,,0,0,0,,${text}`
      );
    }
  }

  return lines.join("\n") + "\n";
}

// ---------- Main ----------

async function main(): Promise<void> {
  console.log(`Reading ${INPUT}...`);
  const raw = await fs.readFile(INPUT, "utf8");
  const segments: Segment[] = JSON.parse(raw);
  console.log(`Loaded ${segments.length} segments`);

  const cues = groupWordsIntoCues(segments);
  const title = path.basename(OUTPUT, path.extname(OUTPUT));
  const ass = cuesToASS(cues, title);

  await fs.mkdir(path.dirname(path.resolve(OUTPUT)), { recursive: true });
  await fs.writeFile(OUTPUT, ass, "utf8");
  console.log(`Wrote ${cues.length} cues to ${OUTPUT}`);
}

main().catch((err: Error) => {
  console.error("Failed:", err);
  process.exit(1);
});
