/**
 * Shared romanize skeleton. Providers only supply transliterate(words).
 * Matches Devanagari-only CLI behaviour + all-non-Latin server behaviour
 * via a single broad regex: anything with a non-Latin character.
 */

const NON_ENGLISH_RE = /[^\u0000-\u007F\u00C0-\u024F]/;

/**
 * @param {import("./types.js").Segment[]} segments
 * @param {(words: string[]) => Promise<string[]>} transliterate
 * @returns {Promise<import("./types.js").Segment[]>}
 */
export async function romanizeWithProvider(segments, transliterate) {
  const output = [];

  for (const segment of segments) {
    const nonEnglishEntries = [];
    for (let i = 0; i < segment.words.length; i++) {
      if (NON_ENGLISH_RE.test(segment.words[i].text)) {
        nonEnglishEntries.push({ index: i, text: segment.words[i].text });
      }
    }

    if (nonEnglishEntries.length === 0) {
      output.push(segment);
      continue;
    }

    try {
      const wordsToTransliterate = nonEnglishEntries.map((e) => e.text);
      const romanizedWords = await transliterate(wordsToTransliterate);

      if (!Array.isArray(romanizedWords) || romanizedWords.length !== wordsToTransliterate.length) {
        console.warn(
          `Word count mismatch in segment ${segment.id} ` +
            `(sent ${wordsToTransliterate.length}, got ${romanizedWords?.length}). Keeping original.`,
        );
        output.push(segment);
        continue;
      }

      const newWords = [...segment.words];
      for (let i = 0; i < nonEnglishEntries.length; i++) {
        newWords[nonEnglishEntries[i].index] = {
          ...newWords[nonEnglishEntries[i].index],
          text: romanizedWords[i],
        };
      }

      output.push({ ...segment, words: newWords });
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
