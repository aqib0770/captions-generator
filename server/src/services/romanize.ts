import Groq from "groq-sdk";
import { z } from "zod";
import type { Segment } from "../types/index.js";

const ROMANIZE_MODEL = "openai/gpt-oss-20b";

/**
 * Regex that matches words containing at least one non-Latin character.
 * This catches Hindi (Devanagari), Arabic, Cyrillic, CJK, etc.
 * Words that are purely ASCII/Latin (English) are left untouched.
 */
const NON_ENGLISH_RE = /[^\u0000-\u007F\u00C0-\u024F]/;

/**
 * Zod schema for the structured LLM response.
 * The model MUST return exactly this shape — an object with a single
 * `words` array of strings.
 */
const TransliterationSchema = z.object({
  words: z.array(z.string()),
});

/**
 * Transliterate an array of non-English words into Roman script
 * using Groq's openai/gpt-oss-20b model with strict structured output.
 *
 * The model is prompted to ONLY transliterate (phonetic conversion),
 * never translate or explain.
 */
async function transliterateWithLLM(words: string[]): Promise<string[]> {
  if (words.length === 0) return [];

  const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

  const response = await groq.chat.completions.create({
    model: ROMANIZE_MODEL,
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
      {
        role: "user",
        content: JSON.stringify(words),
      },
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "word_transliteration",
        schema: z.toJSONSchema(TransliterationSchema),
      },
    } as any,
    temperature: 0,
  });

  const content = response.choices[0]?.message?.content;
  if (!content) {
    throw new Error("Empty response from transliteration model");
  }

  const parsed = TransliterationSchema.parse(JSON.parse(content));
  return parsed.words;
}

/**
 * Romanize non-English words in all segments using Groq LLM.
 *
 * For each segment:
 * 1. Identify non-English words (anything with non-Latin characters).
 * 2. Send only those words to the LLM for transliteration.
 * 3. Compare the output array length with the input array length.
 *    - If they match → splice the romanized words back into position.
 *    - If they DON'T match → keep original words as-is (even if Hindi).
 * 4. English words are never sent to the LLM and always kept unchanged.
 */
export async function romanize(segments: Segment[]): Promise<Segment[]> {
  console.log(
    `Romanizing ${segments.length} segments using Groq ${ROMANIZE_MODEL}...`,
  );
  const output: Segment[] = [];

  for (const segment of segments) {
    // Identify non-English words and their indices
    const nonEnglishEntries: { index: number; text: string }[] = [];
    for (let i = 0; i < segment.words.length; i++) {
      if (NON_ENGLISH_RE.test(segment.words[i].text)) {
        nonEnglishEntries.push({ index: i, text: segment.words[i].text });
      }
    }

    // If no non-English words, pass through unchanged
    if (nonEnglishEntries.length === 0) {
      output.push(segment);
      continue;
    }

    try {
      const wordsToTransliterate = nonEnglishEntries.map((e) => e.text);
      const romanizedWords = await transliterateWithLLM(wordsToTransliterate);

      // Length safety check — if mismatch, keep ALL original words
      if (romanizedWords.length !== wordsToTransliterate.length) {
        console.warn(
          `Word count mismatch in segment ${segment.id} ` +
            `(sent ${wordsToTransliterate.length}, got ${romanizedWords.length}). ` +
            `Keeping original words.`,
        );
        output.push(segment);
        continue;
      }

      // Splice romanized words back into their correct positions
      const newWords = [...segment.words];
      for (let i = 0; i < nonEnglishEntries.length; i++) {
        newWords[nonEnglishEntries[i].index] = {
          ...newWords[nonEnglishEntries[i].index],
          text: romanizedWords[i],
        };
      }

      output.push({
        ...segment,
        words: newWords,
      });
    } catch (err) {
      console.error(
        `Failed to transliterate segment ${segment.id}:`,
        err instanceof Error ? err.message : err,
      );
      output.push(segment);
    }
  }

  return output;
}
