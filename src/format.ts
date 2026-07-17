import fs from "fs/promises";
import { Ollama } from "ollama";
import { z } from "zod";
import type { Segment } from "./types.js";

const INPUT = process.argv[2] || "transcript.json";
const OUTPUT = process.argv[3] || "transcript-roman.json";

const OLLAMA_HOST = process.env.OLLAMA_HOST || "http://localhost:11434";

let MODEL = process.env.OLLAMA_MODEL || "qwen3.5:9b";

for (let i = 4; i < process.argv.length; i++) {
  if (process.argv[i] === "--model") {
    MODEL = process.argv[++i] || MODEL;
  }
}

// ---------------- Schemas ----------------

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

const client = new Ollama({
  host: OLLAMA_HOST,
});

// ---------------- Prompt ----------------
const SYSTEM_PROMPT = `
You are a deterministic Hindi Romanization engine.

You are NOT allowed to think about meaning.
You are NOT allowed to rewrite sentences.

Your only task is to replace Devanagari words with their Roman Hindi equivalents.

Rules:

1. Copy every English word EXACTLY as received.
2. Copy every number EXACTLY.
3. Copy punctuation EXACTLY.
4. Transliterate ONLY words written in Devanagari.
5. Never translate.
6. Never correct grammar.
7. Never improve spelling.
8. Never merge words.
9. Never split words.
10. Never add words.
11. Never remove words.
12. Every input word produces exactly one output word.
13. Preserve capitalization of English words.
14. Return ONLY valid JSON.

The context field is read-only.

Never copy from it.

Never rewrite it.

Never use it to replace input words.

Only use it when deciding the Roman spelling of a Devanagari word.

Examples

Input:

{
"context":"Let's say आपका एक server है",
"words":[
{"text":"Let's"},
{"text":"say"},
{"text":"आपका"},
{"text":"एक"},
{"text":"server"},
{"text":"है"}
]}

Output:

[
{"text":"Let's"},
{"text":"say"},
{"text":"aapka"},
{"text":"ek"},
{"text":"server"},
{"text":"hai"}
]

Input

{
"context":"So, the flow is कि user आएगा",
"words":[
"So,",
"the",
"flow",
"is",
"कि",
"user",
"आएगा"
]}

Output:

[
{"text":"So,"},
{"text":"the"},
{"text":"flow"},
{"text":"is"},
{"text":"ki"},
{"text":"user"},
{"text":"aayega"}
]
`;

// ---------------- Romanize ----------------

async function romanizeSegment(
  segment: Segment,
): Promise<z.infer<typeof RomanizedSegmentSchema>> {
  const payload = {
    id: segment.id,
    context: segment.sentence,
    words: segment.words.map((w) => ({
      text: w.text,
    })),
  };

  const stream = await client.chat({
    model: MODEL,
    stream: true,
    think: false,
    messages: [
      {
        role: "system",
        content: SYSTEM_PROMPT,
      },
      {
        role: "user",
        content: JSON.stringify(payload),
      },
    ],
    format: z.toJSONSchema(RomanizedSegmentSchema),
    options: {
      temperature: 0,
    },
  });

  let content = "";

  for await (const chunk of stream) {
    process.stdout.write(chunk.message.content);
    content += chunk.message.content;
  }

  console.log();

  return RomanizedSegmentSchema.parse(JSON.parse(content));
}

// ---------------- Main ----------------
console.log(`Using ${MODEL}...`);
console.log(`Reading ${INPUT}...`);

const transcript: Segment[] = JSON.parse(await fs.readFile(INPUT, "utf8"));

console.log(`Loaded ${transcript.length} segments`);

const output: Segment[] = [];

for (const segment of transcript) {
  const hasHindi = segment.words.some((word) =>
    /[\u0900-\u097F]/.test(word.text),
  );
  if (!hasHindi) {
    output.push(segment);
    continue;
  }

  let romanized;

  try {
    romanized = await romanizeSegment(segment);
  } catch (err) {
    console.log("\nRetrying...\n");
    romanized = await romanizeSegment(segment);
  }

  if (romanized.words.length !== segment.words.length) {
    console.warn(
      `Word count mismatch in segment ${segment.id}. Keeping original words.`,
    );

    output.push(segment);
    continue;
  }

  output.push({
    ...segment,
    words: segment.words.map((word, i) => ({
      ...word,
      text: romanized.words[i].text,
    })),
  });
}

await fs.writeFile(OUTPUT, JSON.stringify(output, null, 2));

console.log(`\nSaved ${OUTPUT}`);
