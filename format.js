import fs from "fs/promises";
import { Ollama } from "ollama";
import { z } from "zod";

const INPUT = process.argv[2] || "transcript.json";
const OUTPUT = process.argv[3] || "transcript-roman.json";
const OLLAMA_HOST = process.env.OLLAMA_HOST || "http://localhost:11434";
const MODEL = process.env.OLLAMA_MODEL || "qwen2.5:7b-instruct";

if (!INPUT || !OUTPUT) {
  console.error("Usage: node format.js <input.json> <output.json>");
  process.exit(1);
}

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

console.log(`Reading ${INPUT}...`);

const transcript = JSON.parse(await fs.readFile(INPUT, "utf8"));

console.log(`Loaded ${transcript.length} segments`);

const llmInput = transcript.map((segment) => ({
  id: segment.id,
  sentence: segment.sentence,
  words: segment.words.map(({ text }) => ({ text })),
}));

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

let content = "";

console.log("\nResponse:\n");

for await (const chunk of stream) {
  process.stdout.write(chunk.message.content);
  content += chunk.message.content;
}

console.log("\n\nResponse complete");

console.log("Validating JSON...");

const romanized = RomanizedTranscriptSchema.parse(JSON.parse(content));

console.log("JSON valid");

console.log("Merging with original transcript...");

const output = transcript.map((segment, i) => ({
  ...segment,
  words: segment.words.map((word, j) => ({
    ...word,
    text: romanized[i].words[j].text,
  })),
}));

await fs.writeFile(OUTPUT, JSON.stringify(output, null, 2));

console.log(`Saved ${OUTPUT}`);
console.log("Done!");
