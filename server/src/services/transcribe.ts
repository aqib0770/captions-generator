import Groq from "groq-sdk";
import fs from "fs/promises";
import { createReadStream } from "fs";
import { execSync } from "child_process";
import path from "path";
import type { Segment } from "../types/index.js";
import { getDockerComposePath } from "../utils/path.js";

const WHISPER_MODEL = process.env.WHISPER_MODEL || "whisper-large-v3-turbo";

/**
 * Transcribe an audio file using the Groq Whisper API.
 */
async function transcribeGroq(audioPath: string): Promise<Segment[]> {
  const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
  const file = createReadStream(audioPath);

  console.log(`Transcribing with Groq (${WHISPER_MODEL})...`);

  const response = await groq.audio.transcriptions.create({
    file,
    model: WHISPER_MODEL,
    response_format: "verbose_json",
    timestamp_granularities: ["word", "segment"],
    language: "hi",
  });

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

/**
 * Transcribe an audio file using the local Docker Whisper service container.
 */
async function transcribeDocker(audioPath: string): Promise<Segment[]> {
  const absAudioPath = path.resolve(audioPath);
  const dir = path.dirname(absAudioPath);
  const filename = path.basename(absAudioPath);
  const jsonFilename = `${path.parse(filename).name}.transcript.json`;
  const jsonPath = path.join(dir, jsonFilename);

  const composePath = getDockerComposePath();
  const model = process.env.WHISPER_MODEL || "large";

  console.log(`Transcribing with Docker Whisper (${model})...`);

  const cmd = `docker compose -f "${composePath}" run --rm -v "${dir}:/data" -e WHISPER_MODEL=${model} whisper /data/${filename} /data/${jsonFilename}`;
  execSync(cmd, { stdio: "inherit" });

  const raw = await fs.readFile(jsonPath, "utf8");
  const segments: Segment[] = JSON.parse(raw);

  // Clean up temporary transcript file
  try {
    await fs.unlink(jsonPath);
  } catch {
    /* ignore */
  }

  return segments;
}

/**
 * Primary transcription dispatcher function.
 * Selects provider based on process.env.TRANSCRIPTION_PROVIDER ("groq" or "docker").
 */
export async function transcribe(audioPath: string): Promise<Segment[]> {
  const provider = process.env.TRANSCRIPTION_PROVIDER || "groq";

  switch (provider.toLowerCase()) {
    case "groq":
      return transcribeGroq(audioPath);

    case "docker":
      return transcribeDocker(audioPath);

    default:
      throw new Error(
        `Unknown TRANSCRIPTION_PROVIDER: "${provider}". Supported options are "groq" and "docker".`,
      );
  }
}
