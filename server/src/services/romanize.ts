import type { Segment } from "../types/index.js";

const TRANSLITERATION_SERVICE_URL =
  process.env.TRANSLITERATION_SERVICE_URL || "http://localhost:5000/transliterate";

interface TransliterationResponse {
  words: string[];
}

/**
 * Transliterate an array of Hindi (Devanagari) words into Roman script
 * by calling the external transliteration service.
 */
export async function transliterateWords(
  words: string[],
  lang = "hi",
): Promise<string[]> {
  if (words.length === 0) return [];

  const response = await fetch(TRANSLITERATION_SERVICE_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      lang,
      words,
    }),
  });

  if (!response.ok) {
    throw new Error(
      `Transliteration service request failed with status ${response.status}: ${response.statusText}`,
    );
  }

  const data = (await response.json()) as TransliterationResponse;

  if (!data || !Array.isArray(data.words)) {
    throw new Error("Invalid response format received from transliteration service");
  }

  return data.words;
}

/**
 * Romanize Hindi words in all segments using the transliteration HTTP service.
 * English words and segments without Hindi are passed through unchanged.
 */
export async function romanize(segments: Segment[]): Promise<Segment[]> {
  console.log(
    `Romanizing ${segments.length} segments using transliteration service (${TRANSLITERATION_SERVICE_URL})...`,
  );

  const output: Segment[] = [];

  for (const segment of segments) {
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
          return {
            ...word,
            text: romanizedWords[hindiIndex++],
          };
        }
        return word;
      });

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
