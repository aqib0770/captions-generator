import Groq from "groq-sdk";
import { createReadStream } from "fs";

function whisperModel() {
  return process.env.WHISPER_MODEL || "whisper-large-v3-turbo";
}

/** Transcribe an audio file using the Groq Whisper API. Returns segments with word timestamps. */
export async function transcribe(audioPath) {
  if (!process.env.GROQ_API_KEY) {
    throw new Error("GROQ_API_KEY is not set.");
  }

  const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
  const file = createReadStream(audioPath);
  const model = whisperModel();

  console.log(`Transcribing with Groq (${model})...`);

  const response = await groq.audio.transcriptions.create({
    file,
    model,
    response_format: "verbose_json",
    timestamp_granularities: ["word", "segment"],
    language: "hi",
  });

  const groqWords = response.words || [];
  const groqSegments = response.segments || [];

  console.log(`Groq returned ${groqSegments.length} segments, ${groqWords.length} words`);

  if (groqSegments.length === 0) {
    return [
      {
        id: 1,
        sentence: response.text || "",
        words: groqWords.map((w) => ({
          text: String(w.word || "").trim(),
          start: w.start,
          end: w.end,
        })),
      },
    ];
  }

  return groqSegments.map((seg, i) => {
    const segWords = groqWords
      .filter((w) => w.start >= seg.start - 0.01 && w.end <= seg.end + 0.01)
      .map((w) => ({
        text: String(w.word || "").trim(),
        start: w.start,
        end: w.end,
      }));

    return {
      id: i + 1,
      sentence: String(seg.text || "").trim(),
      words: segWords,
    };
  });
}
