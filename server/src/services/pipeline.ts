import { execSync } from "child_process";
import path from "path";
import { transcribe } from "./transcribe.js";
import { romanize } from "./romanize.js";
import { generateASS } from "./subtitle.js";

export type PipelineStage =
  | "extracting"
  | "transcribing"
  | "romanizing"
  | "generating"
  | "burning"
  | "complete";

export interface PipelineOptions {
  inputPath: string;
  outputPath: string;
  onProgress: (stage: PipelineStage, message: string) => void;
}

/**
 * Run the full captioning pipeline:
 *   video → audio → transcript → romanize → ASS → burn subtitles
 *
 * Each step reports progress via the onProgress callback (used for SSE).
 */
export async function runPipeline({
  inputPath,
  outputPath,
  onProgress,
}: PipelineOptions): Promise<void> {
  const dir = path.dirname(outputPath);

  // Step 1 — Extract audio as 16kHz mono WAV
  // 16kHz mono is optimal for Whisper and keeps file size small for the API (25MB limit)
  onProgress("extracting", "Extracting audio from video...");
  const wavPath = path.join(dir, "audio.wav");
  execSync(
    `ffmpeg -y -i "${inputPath}" -vn -acodec pcm_s16le -ar 16000 -ac 1 "${wavPath}"`,
    { stdio: "pipe" },
  );
  console.log("Audio extracted");

  // Step 2 — Transcribe with Groq Whisper API
  onProgress("transcribing", "Transcribing audio with Whisper...");
  const segments = await transcribe(wavPath);
  console.log(`Transcribed ${segments.length} segments`);

  // Step 3 — Romanize Hindi text with transliteration service
  onProgress("romanizing", "Romanizing Hindi text...");
  const romanized = await romanize(segments);
  console.log(`Romanized ${romanized.length} segments`);

  // Step 4 — Generate ASS subtitle file
  onProgress("generating", "Generating subtitles...");
  const assPath = path.join(dir, "captions.ass");
  await generateASS(romanized, assPath);

  // Step 5 — Burn subtitles into video
  onProgress("burning", "Burning subtitles into video...");
  execSync(
    `ffmpeg -y -i "${inputPath}" -vf "ass=${assPath}" -c:a copy "${outputPath}"`,
    { stdio: "pipe" },
  );
  console.log("Subtitles burned");

  onProgress("complete", "Done!");
}
