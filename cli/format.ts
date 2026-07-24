import fs from "fs/promises";

const TRANSLITERATION_SERVICE_URL =
  process.env.TRANSLITERATION_SERVICE_URL || "http://localhost:5000/transliterate";

const INPUT = process.argv[2] || "transcript.json";
const OUTPUT = process.argv[3] || "transcript-roman.json";

// ---------------- Types ----------------

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

// ---------------- Transliterate ----------------

async function transliterateWords(words: string[], lang = "hi"): Promise<string[]> {
  if (words.length === 0) return [];

  const response = await fetch(TRANSLITERATION_SERVICE_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ lang, words }),
  });

  if (!response.ok) {
    throw new Error(
      `Transliteration service request failed with status ${response.status}: ${response.statusText}`,
    );
  }

  const data = (await response.json()) as { words: string[] };

  if (!data || !Array.isArray(data.words)) {
    throw new Error("Invalid response format received from transliteration service");
  }

  return data.words;
}

// ---------------- Main ----------------

console.log(`Reading ${INPUT}...`);
console.log(`Using transliteration service: ${TRANSLITERATION_SERVICE_URL}`);

const transcript: Segment[] = JSON.parse(await fs.readFile(INPUT, "utf8"));

console.log(`Loaded ${transcript.length} segments`);

const output: Segment[] = [];

for (const segment of transcript) {
  const hindiWords = segment.words.filter((word) =>
    /[\u0900-\u097F]/.test(word.text),
  );

  if (hindiWords.length === 0) {
    output.push(segment);
    continue;
  }

  try {
    const romanizedWords = await transliterateWords(
      hindiWords.map((w) => w.text),
    );

    if (romanizedWords.length !== hindiWords.length) {
      console.warn(
        `Word count mismatch in segment ${segment.id} ` +
          `(got ${romanizedWords.length}, expected ${hindiWords.length}). Keeping original.`,
      );
      output.push(segment);
      continue;
    }

    let hindiIndex = 0;
    const newWords = segment.words.map((word) => {
      if (/[\u0900-\u097F]/.test(word.text)) {
        return { ...word, text: romanizedWords[hindiIndex++] };
      }
      return word;
    });

    output.push({ ...segment, words: newWords });
  } catch (err) {
    console.error(
      `Failed to transliterate segment ${segment.id}:`,
      err instanceof Error ? err.message : err,
    );
    output.push(segment);
  }
}

await fs.writeFile(OUTPUT, JSON.stringify(output, null, 2));

console.log(`\nSaved ${OUTPUT}`);
