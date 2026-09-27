import Groq from "groq-sdk";
import { z } from "zod";

function romanizeModel() {
  return process.env.ROMANIZE_MODEL || "openai/gpt-oss-20b";
}

const TransliterationSchema = z.object({
  words: z.array(z.string()),
});

/**
 * Transliterate non-English words to Roman script via Groq LLM.
 * Strict: phonetic conversion only, same count, same order.
 */
export async function transliterate(words) {
  if (words.length === 0) return [];

  const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
  const model = romanizeModel();

  const response = await groq.chat.completions.create({
    model,
    messages: [
      {
        role: "system",
        content: [
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
        ].join("\n"),
      },
      { role: "user", content: JSON.stringify(words) },
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "word_transliteration",
        schema: z.toJSONSchema(TransliterationSchema),
      },
    },
    temperature: 0,
  });

  const content = response.choices[0]?.message?.content;
  if (!content) throw new Error("Empty response from transliteration model");

  return TransliterationSchema.parse(JSON.parse(content)).words;
}
