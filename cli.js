import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const COMPOSE = `docker compose -f ${path.join(__dirname, "docker-compose.yml")}`;
const DATA_DIR = path.join(__dirname, "data");
const MODEL = process.env.OLLAMA_MODEL || "qwen2.5:7b-instruct";

function run(cmd) {
  execSync(cmd, { stdio: "inherit" });
}

function main() {
  const inputArg = process.argv[2];
  if (!inputArg) {
    console.log("Usage: node cli.js <input.mp4> [output.mp4]");
    process.exit(1);
  }

  const inputVideo = path.resolve(inputArg);
  const name = path.basename(inputVideo, ".mp4");
  const outputVideo = process.argv[3]
    ? path.resolve(process.argv[3])
    : path.join(path.dirname(inputVideo), `${name}-captioned.mp4`);

  if (!fs.existsSync(inputVideo)) {
    console.error(`Error: file not found — ${inputVideo}`);
    process.exit(1);
  }

  fs.mkdirSync(DATA_DIR, { recursive: true });

  const wav = `/data/${name}.wav`;
  const transcript = `/data/${name}.transcript.json`;
  const roman = `/data/${name}.roman.json`;
  const srt = `/data/${name}.srt`;

  const hostWav = path.join(DATA_DIR, `${name}.wav`);
  const hostTranscript = path.join(DATA_DIR, `${name}.transcript.json`);
  const hostRoman = path.join(DATA_DIR, `${name}.roman.json`);
  const hostSrt = path.join(DATA_DIR, `${name}.srt`);

  console.log(`Input:  ${inputVideo}`);
  console.log(`Output: ${outputVideo}`);

  fs.copyFileSync(inputVideo, path.join(DATA_DIR, `${name}.mp4`));


  console.log("Extracting audio...");
  run(
    `${COMPOSE} run --rm ffmpeg -y -i /data/${name}.mp4 -vn -acodec pcm_s16le -ar 44100 -ac 2 ${wav}`
  );
  if (!fs.existsSync(hostWav)) {
    console.error("Error: audio extraction failed");
    process.exit(1);
  }
  console.log("Audio extracted");

  console.log("Transcribing...");
  run(`${COMPOSE} run --rm whisper ${wav} ${transcript}`);
  if (!fs.existsSync(hostTranscript)) {
    console.error("Error: transcription failed");
    process.exit(1);
  }
  console.log("Transcription done");

  run(`${COMPOSE} up -d ollama`);
  console.log("Waiting for Ollama...");
  for (let i = 0; i < 60; i++) {
    try {
      execSync(
        `${COMPOSE} exec -T ollama ollama list`,
        { stdio: "ignore" }
      );
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

  console.log("Romanizing...");
  run(`${COMPOSE} run --rm formatter node format.js ${transcript} ${roman}`);
  if (!fs.existsSync(hostRoman)) {
    console.error("Error: romanization failed");
    process.exit(1);
  }
  console.log("Romanization done");

  console.log("Generating SRT...");
  run(`${COMPOSE} run --rm formatter node jsontosrt.js ${roman} ${srt}`);
  if (!fs.existsSync(hostSrt)) {
    console.error("Error: SRT generation failed");
    process.exit(1);
  }
  console.log("SRT generated");

  run(`${COMPOSE} stop ollama`);


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
