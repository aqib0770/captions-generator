import { execFileSync } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";

// Local transcription for the ollama stack — Docker-only by default.
//
// Ollama has no native speech-to-text, so this talks HTTP to a
// whisper-asr-webservice container
// (onerahmet/openai-whisper-asr-webservice, faster_whisper engine).
// No PyTorch / whisper install needed on the host.
//
//   docker run -d -p 9000:9000 -e ASR_MODEL=base -e ASR_ENGINE=faster_whisper \
//     -v $PWD/cache:/root/.cache onerahmet/openai-whisper-asr-webservice:latest
//
// Env:
//   LOCAL_WHISPER_API_URL  default http://127.0.0.1:9000
//   LOCAL_WHISPER_LANGUAGE default hi
//   LOCAL_WHISPER_MODE=cli  opt-in legacy path: shell out to a local
//                           `whisper` binary (LOCAL_WHISPER_CMD/MODEL).

function apiUrl() {
  return (process.env.LOCAL_WHISPER_API_URL || "http://127.0.0.1:9000").replace(/\/$/, "");
}

function language() {
  return process.env.LOCAL_WHISPER_LANGUAGE || "hi";
}

/** POST wav to /asr and map the JSON response to Segment[]. */
async function transcribeViaHttp(audioPath) {
  const base = apiUrl();
  const lang = language();
  const url =
    `${base}/asr?task=transcribe&language=${encodeURIComponent(lang)}` +
    `&output=json&word_timestamps=true&encode=true`;

  const buf = fs.readFileSync(audioPath);
  const form = new FormData();
  form.append("audio_file", new Blob([buf], { type: "audio/wav" }), "audio.wav");

  let res;
  try {
    res = await fetch(url, { method: "POST", body: form });
  } catch (err) {
    throw new Error(
      `Whisper docker API unreachable at ${base}. Is the container running? ` +
        `(docker run -d -p 9000:9000 -e ASR_MODEL=base -e ASR_ENGINE=faster_whisper ` +
        `onerahmet/openai-whisper-asr-webservice:latest) Original: ${err.message}`,
    );
  }

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Whisper docker API ${res.status} at ${base}/asr: ${body.slice(0, 300)}`);
  }

  const raw = await res.json();
  return mapAsrJsonToSegments(raw);
}

/**
 * Map whisper-asr-webservice JSON (both faster_whisper and openai_whisper
 * engines) to Segment[]. Handles {text, segments:[{start,end,text|transcript,
 * words:[{start,end,word|text}]}]} shapes defensively.
 */
export function mapAsrJsonToSegments(raw) {
  const segments = Array.isArray(raw?.segments) ? raw.segments : [];

  if (segments.length > 0) {
    return segments.map((seg, i) => {
      const words = Array.isArray(seg.words)
        ? seg.words
            .filter((w) => w && (w.word !== undefined || w.text !== undefined))
            .map((w) => ({
              text: String(w.word ?? w.text ?? "").trim(),
              start: Number(w.start),
              end: Number(w.end),
            }))
            .filter((w) => w.text && Number.isFinite(w.start) && Number.isFinite(w.end))
        : [];

      return {
        id: i + 1,
        sentence: String(seg.text ?? seg.transcript ?? "").trim(),
        words,
      };
    });
  }

  return [
    {
      id: 1,
      sentence: String(raw?.text ?? ""),
      words: [],
    },
  ];
}

/** Legacy path: shell out to a local whisper CLI install. */
async function transcribeViaCli(audioPath) {
  const cmd = process.env.LOCAL_WHISPER_CMD || "whisper";
  const model = process.env.LOCAL_WHISPER_MODEL || "base";
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), "whisper-"));

  try {
    execFileSync(
      cmd,
      [
        audioPath,
        "--model",
        model,
        "--language",
        language(),
        "--word_timestamps",
        "True",
        "--output_format",
        "json",
        "--output_dir",
        outDir,
        "--fp16",
        "False",
      ],
      { stdio: "ignore" },
    );
  } catch (err) {
    throw new Error(
      `Local whisper failed ("${cmd}"). Install openai-whisper or set LOCAL_WHISPER_CMD. Original: ${err.message}`,
    );
  }

  const files = fs.readdirSync(outDir).filter((f) => f.endsWith(".json"));
  if (files.length === 0) throw new Error("Local whisper produced no JSON output.");
  const raw = JSON.parse(fs.readFileSync(path.join(outDir, files[0]), "utf8"));

  try {
    fs.rmSync(outDir, { recursive: true, force: true });
  } catch {
    /* ignore */
  }

  return mapAsrJsonToSegments(raw);
}

/**
 * Transcribe a wav file via whisper docker HTTP by default.
 * Set LOCAL_WHISPER_MODE=cli to use the legacy local binary instead.
 */
export async function transcribe(audioPath) {
  if ((process.env.LOCAL_WHISPER_MODE || "http").toLowerCase() === "cli") {
    return transcribeViaCli(audioPath);
  }
  return transcribeViaHttp(audioPath);
}
