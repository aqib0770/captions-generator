#!/usr/bin/env node
// Thin CLI — arg parsing only. All pipeline logic lives in @caption/core.
import fs from "fs";
import path from "path";
import { runPipeline, SUPPORTED_EXTENSIONS, assertFfmpeg, hasAudioTrack } from "@caption/core";

function printUsageAndExit(code = 1) {
  console.log(`Usage: caption <input.mp4> [output.mp4] [--provider groq|ollama]`);
  console.log(`  provider default: groq ( prevenv CAPTION_PROVIDER )`);
  process.exit(code);
}

async function main() {
  let inputVideo;
  let outputVideo;
  let provider = process.env.CAPTION_PROVIDER || "groq";

  for (let i = 2; i < process.argv.length; i++) {
    const arg = process.argv[i];
    if (arg === "--help" || arg === "-h") printUsageAndExit(0);
    else if (arg === "--provider") provider = process.argv[++i] || provider;
    else if (arg.startsWith("--provider=")) provider = arg.split("=")[1];
    else if (!inputVideo) inputVideo = path.resolve(arg);
    else if (!outputVideo) outputVideo = path.resolve(arg);
  }

  if (!inputVideo) printUsageAndExit();
  if (!["groq", "ollama"].includes(provider)) {
    console.error(`Error: unknown provider "${provider}" — use groq or ollama.`);
    process.exit(1);
  }

  const ext = path.extname(inputVideo).toLowerCase();
  if (!SUPPORTED_EXTENSIONS.includes(ext)) {
    console.error(
      `Error: unsupported format "${ext}" — supported: ${SUPPORTED_EXTENSIONS.join(", ")}`,
    );
    process.exit(1);
  }

  const name = path.basename(inputVideo, ext);
  outputVideo = outputVideo || path.join(path.dirname(inputVideo), `${name}-captioned.mp4`);

  if (!fs.existsSync(inputVideo)) {
    console.error(`Error: file not found — ${inputVideo}`);
    process.exit(1);
  }

  try {
    assertFfmpeg();
  } catch (err) {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  }

  if (!hasAudioTrack(inputVideo)) {
    console.error("Error: input file has no audio track");
    process.exit(1);
  }

  const { transcribe, transliterate } =
    provider === "groq"
      ? await import("@caption/providers-groq")
      : await import("@caption/providers-ollama");

  // Isolated workdir next to output so CLI never pollutes cwd
  const workDir = fs.mkdtempSync(path.join(`${path.dirname(outputVideo)}/`, `.caption-${name}-`));
  const workInput = path.join(workDir, `input${ext}`);
  const workOutput = path.join(workDir, "output.mp4");
  fs.copyFileSync(inputVideo, workInput);

  console.log(`Input:    ${inputVideo}`);
  console.log(`Output:   ${outputVideo}`);
  console.log(`Provider: ${provider}`);

  try {
    await runPipeline({
      inputPath: workInput,
      outputPath: workOutput,
      transcribe,
      transliterate,
      onProgress: (stage, message) => console.log(`[${stage}] ${message}`),
    });
    fs.copyFileSync(workOutput, outputVideo);
    console.log(`Done: ${outputVideo}`);
  } finally {
    try {
      fs.rmSync(workDir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }
}

main().catch((err) => {
  console.error("Failed:", err.message || err);
  process.exit(1);
});
