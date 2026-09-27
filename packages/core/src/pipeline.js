import path from "path";
import { extractAudio, burnSubtitles } from "./ffmpeg.js";
import { generateASS } from "./subtitle.js";
import { romanizeWithProvider } from "./romanize-core.js";

/**
 * Run the full captioning pipeline:
 *   video → audio → transcript → romanize → ASS → burn subtitles
 *
 * Providers are injected — core never imports groq/ollama/express.
 *
 * @param {import("./types.js").PipelineOptions} opts
 */
export async function runPipeline({
  inputPath,
  outputPath,
  onProgress = () => {},
  transcribe,
  transliterate,
}) {
  if (typeof transcribe !== "function")
    throw new Error("runPipeline: transcribe provider is required.");
  if (typeof transliterate !== "function")
    throw new Error("runPipeline: transliterate provider is required.");

  const dir = path.dirname(outputPath);

  onProgress("extracting", "Extracting audio from video...");
  const wavPath = path.join(dir, "audio.wav");
  await extractAudio(inputPath, wavPath);
  console.log("Audio extracted");

  onProgress("transcribing", "Transcribing audio with Whisper...");
  const segments = await transcribe(wavPath);
  console.log(`Transcribed ${segments.length} segments`);

  onProgress("romanizing", "Romanizing Hindi text...");
  const romanized = await romanizeWithProvider(segments, transliterate);
  console.log(`Romanized ${romanized.length} segments`);

  onProgress("generating", "Generating subtitles...");
  const assPath = path.join(dir, "captions.ass");
  await generateASS(romanized, assPath);

  onProgress("burning", "Burning subtitles into video...");
  await burnSubtitles(inputPath, assPath, outputPath);
  console.log("Subtitles burned");

  onProgress("complete", "Done!");
}
