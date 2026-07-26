import { spawn } from "child_process";
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

/** Run an external command and reject on non-zero exit. Streams no stdio. */
function run(cmd: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: "ignore" });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`"${cmd} ${args.join(" ")}" exited with code ${code}`));
    });
  });
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

  // Step 1 — Extract audio as 16kHz mono WAV (optimal for Whisper / under API limit)
  onProgress("extracting", "Extracting audio from video...");
  const wavPath = path.join(dir, "audio.wav");
  await run("ffmpeg", [
    "-y", "-i", inputPath,
    "-vn", "-acodec", "pcm_s16le",
    "-ar", "16000", "-ac", "1",
    wavPath,
  ]);
  console.log("Audio extracted");

  // Step 2 — Transcribe with Groq Whisper API
  onProgress("transcribing", "Transcribing audio with Whisper...");
  const segments = await transcribe(wavPath);
  console.log(`Transcribed ${segments.length} segments`);

  // Step 3 — Romanize non-Latin text with transliteration LLM
  onProgress("romanizing", "Romanizing Hindi text...");
  const romanized = await romanize(segments);
  console.log(`Romanized ${romanized.length} segments`);

  // Step 4 — Generate ASS subtitle file
  onProgress("generating", "Generating subtitles...");
  const assPath = path.join(dir, "captions.ass");
  await generateASS(romanized, assPath);

  // Step 5 — Burn subtitles into video
  onProgress("burning", "Burning subtitles into video...");
  await run("ffmpeg", [
    "-y", "-i", inputPath,
    "-vf", `ass=${assPath}`,
    "-c:a", "copy",
    outputPath,
  ]);
  console.log("Subtitles burned");

  onProgress("complete", "Done!");
}
