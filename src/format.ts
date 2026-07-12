import fs from "fs/promises";
import { Ollama } from "ollama";
import { z } from "zod";
import type { Segment, RomanizedSegment } from "./types.js";

const INPUT: string = process.argv[2] || "transcript.json";
const OUTPUT: string = process.argv[3] || "transcript-roman.json";
const OLLAMA_HOST: string = process.env.OLLAMA_HOST || "http://localhost:11434";
const MODEL: string = process.env.OLLAMA_MODEL || "qwen2.5:7b-instruct";

if (!INPUT || !OUTPUT) {
  console.error("Usage: node format.js <input.json> <output.json>");
  process.exit(1);
}

// ---------- Zod Schemas ----------

const RomanizedWordSchema = z
  .object({
    text: z.string(),
  })
  .strict();

const RomanizedSegmentSchema = z
  .object({
    id: z.number(),
    words: z.array(RomanizedWordSchema),
  })
  .strict();

const RomanizedTranscriptSchema = z.array(RomanizedSegmentSchema);

// ---------- Read transcript ----------

console.log(`Reading ${INPUT}...`);

const transcript: Segment[] = JSON.parse(await fs.readFile(INPUT, "utf8"));

console.log(`Loaded ${transcript.length} segments`);

// ---------- Build LLM input ----------

const llmInput = transcript.map((segment) => ({
  id: segment.id,
  sentence: segment.sentence,
  words: segment.words.map(({ text }) => ({ text })),
}));

// ---------- Call Ollama ----------

console.log(`Sending to Ollama at ${OLLAMA_HOST} (model: ${MODEL})...`);

const client = new Ollama({ host: OLLAMA_HOST });

const stream = await client.chat({
  model: MODEL,
  stream: true,
  think: false,
  messages: [
    {
      role: "system",
      content: `
You are a Hindi Romanization engine.

Rules:

- Transliterate ONLY Devanagari Hindi words into natural Roman Hindi.
- Do NOT translate.
- Preserve English words exactly.
- Preserve punctuation exactly.
- Preserve the order of words.
- Preserve ids.
- Each segment MUST have exactly the same number of words as the input.
- Ignore the sentence field except as context.
- Return ONLY valid JSON matching the provided schema.
`,
    },
    {
      role: "user",
      content: JSON.stringify(llmInput),
    },
  ],
  format: z.toJSONSchema(RomanizedTranscriptSchema),
  options: {
    temperature: 0,
  },
});

// ---------- Read streamed response ----------

let content = "";

console.log("\nResponse:\n");

for await (const chunk of stream) {
  process.stdout.write(chunk.message.content);
  content += chunk.message.content;
}

console.log("\n\nResponse complete");

// ---------- Parse & validate ----------

console.log("Validating JSON...");

const romanized: RomanizedSegment[] = RomanizedTranscriptSchema.parse(
  JSON.parse(content)
);

console.log("JSON valid");

// ---------- Merge with word count validation ----------

console.log("Merging with original transcript...");

let mismatchCount = 0;

const output: Segment[] = transcript.map((segment, i) => {
  const romanSeg = romanized[i];

  if (!romanSeg) {
    console.error(
      `Error: LLM returned ${romanized.length} segments, expected ${transcript.length}. Segment ${i + 1} missing.`
    );
    return segment;
  }

  if (romanSeg.words.length !== segment.words.length) {
    mismatchCount++;
    console.error(
      `Warning: Segment ${segment.id} word count mismatch — expected ${segment.words.length}, got ${romanSeg.words.length}. Keeping original text for missing words.`
    );
  }

  return {
    ...segment,
    words: segment.words.map((word, j) => ({
      ...word,
      text: romanSeg.words[j]?.text ?? word.text,
    })),
  };
});

if (mismatchCount > 0) {
  console.error(
    `Warning: ${mismatchCount} segment(s) had word count mismatches`
  );
}

// ---------- Save ----------

await fs.writeFile(OUTPUT, JSON.stringify(output, null, 2));

console.log(`Saved ${OUTPUT}`);
console.log("Done!");
