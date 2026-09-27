import { spawn, execSync } from "child_process";
import { AUDIO_SAMPLE_RATE, AUDIO_CHANNELS } from "./config.js";

/** Run an external command and reject on non-zero exit. Streams no stdio. */
export function run(cmd, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: "ignore" });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`"${cmd} ${args.join(" ")}" exited with code ${code}`));
    });
  });
}

export function assertFfmpeg() {
  try {
    execSync("ffmpeg -version", { stdio: "ignore" });
  } catch {
    throw new Error("ffmpeg is not installed or not on PATH.");
  }
}

/** Returns true if the file has at least one audio stream. */
export function hasAudioTrack(inputPath) {
  try {
    const out = execSync(
      `ffprobe -v error -select_streams a -show_entries stream=codec_type -of csv=p=0 "${inputPath}"`,
      { stdio: "pipe" },
    )
      .toString()
      .trim();
    return out.includes("audio");
  } catch {
    return false;
  }
}

export function extractAudio(inputPath, wavPath) {
  return run("ffmpeg", [
    "-y",
    "-i",
    inputPath,
    "-vn",
    "-acodec",
    "pcm_s16le",
    "-ar",
    String(AUDIO_SAMPLE_RATE),
    "-ac",
    String(AUDIO_CHANNELS),
    wavPath,
  ]);
}

export function burnSubtitles(inputPath, assPath, outputPath) {
  return run("ffmpeg", [
    "-y",
    "-i",
    inputPath,
    "-vf",
    `ass=${assPath}`,
    "-c:a",
    "copy",
    outputPath,
  ]);
}
