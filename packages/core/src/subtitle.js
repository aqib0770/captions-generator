import fs from "fs/promises";
import path from "path";
import { MAX_WORDS_PER_CUE, MAX_CHARS_PER_CUE } from "./config.js";

// ASS colors are in &HAABBGGRR format
const NORMAL_COLOR = "\\1c&H00FFFFFF&"; // white
const HIGHLIGHT_COLOR = "\\1c&H0000FFFF&"; // yellow

// ---------- Time formatting (ASS: H:MM:SS.CC) ----------

export function formatASSTime(seconds) {
  let cs = Math.round(seconds * 100);
  const centis = cs % 100;
  cs = Math.floor(cs / 100);
  const secs = cs % 60;
  cs = Math.floor(cs / 60);
  const mins = cs % 60;
  const hrs = Math.floor(cs / 60);
  const pad2 = (n) => String(n).padStart(2, "0");
  return `${hrs}:${pad2(mins)}:${pad2(secs)}.${pad2(centis)}`;
}

// ---------- Grouping ----------

export function groupWordsIntoCues(segments) {
  const cues = [];

  for (const segment of segments) {
    let current = [];

    for (const word of segment.words) {
      const textIfAdded = [...current, word].map((w) => w.text).join(" ");

      const exceedsWordLimit = current.length >= MAX_WORDS_PER_CUE;
      const exceedsCharLimit = current.length > 0 && textIfAdded.length > MAX_CHARS_PER_CUE;

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
 */
export function cuesToASS(cues, title) {
  const lines = [];

  lines.push("[Script Info]");
  lines.push(`Title: ${title}`);
  lines.push("ScriptType: v4.00+");
  lines.push("PlayResX: 1920");
  lines.push("PlayResY: 1080");
  lines.push("WrapStyle: 0");
  lines.push("");

  lines.push("[V4+ Styles]");
  lines.push(
    "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
  );
  lines.push(
    "Style: Default,Arial,48,&H00FFFFFF,&H0000FFFF,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,2,1,2,10,10,40,1",
  );
  lines.push("");

  lines.push("[Events]");
  lines.push("Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text");

  for (const cue of cues) {
    for (let active = 0; active < cue.length; active++) {
      const start = formatASSTime(cue[active].start);
      const end = formatASSTime(cue[active].end);

      const text = cue
        .map((w, i) => {
          const color = i === active ? HIGHLIGHT_COLOR : NORMAL_COLOR;
          return `{${color}}${w.text}`;
        })
        .join(" ");

      lines.push(`Dialogue: 0,${start},${end},Default,,0,0,0,,${text}`);
    }
  }

  return lines.join("\n") + "\n";
}

/** Generate an ASS subtitle file from romanized segments. */
export async function generateASS(segments, outputPath) {
  const cues = groupWordsIntoCues(segments);
  const title = path.basename(outputPath, path.extname(outputPath));
  const ass = cuesToASS(cues, title);

  await fs.mkdir(path.dirname(path.resolve(outputPath)), { recursive: true });
  await fs.writeFile(outputPath, ass, "utf8");

  console.log(`Generated ${cues.length} cues → ${outputPath}`);
}
