import Groq from "groq-sdk";
import fs from "fs";
import type { Segment } from "../types/index.js";

const WHISPER_MODEL = process.env.WHISPER_MODEL || "whisper-large-v3-turbo";

/**
 * Transcribe an audio file using the Groq Whisper API.
 * Returns segments in the same format the rest of the pipeline expects.
 */
export async function transcribe(audioPath: string): Promise<Segment[]> {
  const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
  const file = fs.createReadStream(audioPath);

  console.log(`Transcribing with ${WHISPER_MODEL}...`);

  const response = await groq.audio.transcriptions.create({
    file,
    model: WHISPER_MODEL,
    response_format: "verbose_json",
    timestamp_granularities: ["word", "segment"],
    language: "hi",
  });

  // Groq returns top-level `words` array and `segments` array
  // when using verbose_json + timestamp_granularities: ["word", "segment"]
  const groqWords: Array<{ word: string; start: number; end: number }> =
    (response as any).words || [];
  const groqSegments: Array<{
    id: number;
    text: string;
    start: number;
    end: number;
  }> = (response as any).segments || [];

  console.log(
    `Groq returned ${groqSegments.length} segments, ${groqWords.length} words`,
  );

  if (groqSegments.length === 0) {
    // Fallback: single segment from all words
    return [
      {
        id: 1,
        sentence: (response as any).text || "",
        words: groqWords.map((w) => ({
          text: w.word.trim(),
          start: w.start,
          end: w.end,
        })),
      },
    ];
  }

  // Map words to segments based on timing overlap
  return groqSegments.map((seg, i) => {
    const segWords = groqWords
      .filter((w) => w.start >= seg.start - 0.01 && w.end <= seg.end + 0.01)
      .map((w) => ({
        text: w.word.trim(),
        start: w.start,
        end: w.end,
      }));

    return {
      id: i + 1,
      sentence: seg.text.trim(),
      words: segWords,
    };
  });
}
