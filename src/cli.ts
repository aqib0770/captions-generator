import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname: string = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_DIR: string = path.resolve(__dirname, "..");
const COMPOSE: string = `docker compose -f ${path.join(PROJECT_DIR, "docker-compose.yml")}`;
const DATA_DIR: string = path.join(PROJECT_DIR, "data");
const MODEL: string = process.env.OLLAMA_MODEL || "qwen2.5:7b-instruct";

function run(cmd: string): void {
  execSync(cmd, { stdio: "inherit" });
}

function main(): void {
  let inputVideo: string | undefined;
  let outputVideo: string | undefined;
  let whisperModel = "large";

  for (let i = 2; i < process.argv.length; i++) {
    const arg = process.argv[i];
    if (arg === "--whisper-model") {
      whisperModel = process.argv[++i] || whisperModel;
    } else if (!inputVideo) {
      inputVideo = path.resolve(arg);
    } else if (!outputVideo) {
      outputVideo = path.resolve(arg);
    }
  }

  if (!inputVideo) {
    console.log("Usage: node cli.js <input.mp4> [output.mp4] [--whisper-model <size>]");
    process.exit(1);
  }

  const name: string = path.basename(inputVideo, ".mp4");
  outputVideo = outputVideo || path.join(path.dirname(inputVideo), `${name}-captioned.mp4`);

  if (!fs.existsSync(inputVideo)) {
    console.error(`Error: file not found — ${inputVideo}`);
    process.exit(1);
  }

  fs.mkdirSync(DATA_DIR, { recursive: true });

  // Container paths
  const wav: string = `/data/${name}.wav`;
  const transcript: string = `/data/${name}.transcript.json`;
  const roman: string = `/data/${name}.roman.json`;
  const srt: string = `/data/${name}.srt`;

  // Host paths for verification
  const hostWav: string = path.join(DATA_DIR, `${name}.wav`);
  const hostTranscript: string = path.join(DATA_DIR, `${name}.transcript.json`);
  const hostRoman: string = path.join(DATA_DIR, `${name}.roman.json`);
  const hostSrt: string = path.join(DATA_DIR, `${name}.srt`);

  console.log(`Input:  ${inputVideo}`);
  console.log(`Output: ${outputVideo}`);

  // Copy input to data dir so containers can access it
  fs.copyFileSync(inputVideo, path.join(DATA_DIR, `${name}.mp4`));

  // Step 1: Extract audio
  console.log("Extracting audio...");
  run(
    `${COMPOSE} run --rm ffmpeg -y -i /data/${name}.mp4 -vn -acodec pcm_s16le -ar 44100 -ac 2 ${wav}`
  );
  if (!fs.existsSync(hostWav)) {
    console.error("Error: audio extraction failed");
    process.exit(1);
  }
  console.log("Audio extracted");

  // Step 2: Transcribe (runs before Ollama to avoid memory contention)
  console.log(`Transcribing (model: ${whisperModel})...`);
  run(`${COMPOSE} run --rm -e WHISPER_MODEL=${whisperModel} whisper ${wav} ${transcript}`);
  if (!fs.existsSync(hostTranscript)) {
    console.error("Error: transcription failed");
    process.exit(1);
  }
  console.log("Transcription done");

  // Start Ollama now that Whisper is done and freed its memory
  run(`${COMPOSE} up -d ollama`);
  console.log("Waiting for Ollama...");
  for (let i = 0; i < 60; i++) {
    try {
      execSync(`${COMPOSE} exec -T ollama ollama list`, { stdio: "ignore" });
      break;
    } catch {
      if (i === 59) {
        console.error("Error: Ollama did not start in time");
        process.exit(1);
      }
      execSync("sleep 1");
    }
  }
  console.log("Ollama ready");

  console.log(`Pulling model ${MODEL}...`);
  run(`${COMPOSE} exec -T ollama ollama pull ${MODEL}`);

  // Step 3: Romanize
  console.log("Romanizing...");
  run(`${COMPOSE} run --rm formatter node format.js ${transcript} ${roman}`);
  if (!fs.existsSync(hostRoman)) {
    console.error("Error: romanization failed");
    process.exit(1);
  }
  console.log("Romanization done");

  // Step 4: Generate SRT
  console.log("Generating SRT...");
  run(`${COMPOSE} run --rm formatter node jsontosrt.js ${roman} ${srt}`);
  if (!fs.existsSync(hostSrt)) {
    console.error("Error: SRT generation failed");
    process.exit(1);
  }
  console.log("SRT generated");

  // Stop Ollama before ffmpeg to free memory
  run(`${COMPOSE} stop ollama`);

  // Step 5: Burn subtitles
  console.log("Burning subtitles...");
  run(
    `${COMPOSE} run --rm ffmpeg -y -i /data/${name}.mp4 -vf "subtitles=${srt}:force_style='FontSize=24'" -c:a copy /data/${name}-captioned.mp4`
  );
  fs.copyFileSync(path.join(DATA_DIR, `${name}-captioned.mp4`), outputVideo);
  if (!fs.existsSync(outputVideo)) {
    console.error("Error: subtitle burn failed");
    process.exit(1);
  }
  console.log("Subtitles burned");

  console.log(`Done: ${outputVideo}`);
}

main();
