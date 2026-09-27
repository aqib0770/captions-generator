import { Ollama } from "ollama";

function client() {
  return new Ollama({ host: process.env.OLLAMA_HOST || "http://127.0.0.1:11434" });
}

function llmModel() {
  return process.env.OLLAMA_LLM_MODEL || "qwen2.5:1.5b";
}

const SYSTEM_PROMPT = [
  "You are a transliteration engine.",
  "You receive a JSON array of words in non-Latin scripts (e.g. Devanagari, Arabic, etc.).",
  "For each word, output its phonetic transliteration in the Roman/Latin alphabet.",
  "",
  "STRICT RULES:",
  "- ONLY transliterate (phonetic conversion to Roman script). Do NOT translate meaning.",
  "- Do NOT explain, comment, or add any extra text.",
  "- Preserve the exact order of words.",
  "- Output EXACTLY the same number of words as the input array.",
  "- Each output word must be the romanized pronunciation of the corresponding input word.",
  "",
  'Reply with JSON only: {"words": ["..."]}',
].join("\n");

/** Transliterate via local Ollama LLM. Same contract as the Groq provider. */
export async function transliterate(words) {
  if (words.length === 0) return [];

  const res = await client().chat({
    model: llmModel(),
    format: "json",
    options: { temperature: 0 },
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: JSON.stringify(words) },
    ],
  });

  const parsed = JSON.parse(res.message.content);
  if (!parsed || !Array.isArray(parsed.words)) {
    throw new Error("Invalid JSON response from Ollama transliteration model");
  }
  return parsed.words;
}
