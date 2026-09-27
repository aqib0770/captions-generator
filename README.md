# Caption Test — CLI

Word-level caption generator: give it a video, get the same video back with burned-in karaoke-style captions (Hindi/Urdu → romanized on-the-fly).

**Pipeline:** ffmpeg → Whisper (transcribe) → LLM (romanize non-Latin words) → ASS subtitles → ffmpeg (burn).

Pure JavaScript (ESM), pnpm monorepo. The CLI reads env vars **from the command line only** — no `.env` file is loaded.

## Prerequisites

```bash
node --version   # v22
pnpm --version   # v10
ffmpeg -version
ffprobe -version
```

## Setup (once)

```bash
pnpm install
```

## Usage

```bash
node apps/cli/src/index.js <input.mp4> [output.mp4] [--provider groq|ollama]
```

- `<input.mp4>` — required. One of `mp4, mkv, webm, avi, mov`. Must have an audio track.
- `[output.mp4]` — optional. Defaults to `<name>-captioned.mp4` next to the input.
- `--provider groq|ollama` — optional. Defaults to `groq` (or `CAPTION_PROVIDER` env). Also accepts `--provider=groq`.
- `node apps/cli/src/index.js --help` — prints usage.

## Run with Groq (cloud)

Needs a key from https://console.groq.com/keys. Pass it on the command line:

```bash
GROQ_API_KEY=your_key_here \
  node apps/cli/src/index.js rec.mp4 --provider groq
```

With all optional vars:

```bash
GROQ_API_KEY=your_key_here \
WHISPER_MODEL=whisper-large-v3-turbo \
ROMANIZE_MODEL=openai/gpt-oss-20b \
  node apps/cli/src/index.js rec.mp4 /tmp/cli-groq.mp4 --provider groq
```

Or skip the flag via env:

```bash
GROQ_API_KEY=your_key_here CAPTION_PROVIDER=groq \
  node apps/cli/src/index.js rec.mp4 /tmp/cli-groq.mp4
```

Expected output:

```
Input:    .../rec.mp4
Output:   /tmp/cli-groq.mp4
Provider: groq
[extracting] Extracting audio from video...
[transcribing] Transcribing audio with Whisper...
[romanizing] Romanizing Hindi text...
[generating] Generating subtitles...
[burning] Burning subtitles into video...
[complete] Done!
Done: /tmp/cli-groq.mp4
```

Verify: `ls -lh /tmp/cli-groq.mp4`, play it — the currently spoken word highlights yellow.

## Run with Ollama (local) + whisper docker

No PyTorch install needed — whisper runs in Docker, LLM runs in Ollama.

One-time services:

```bash
# whisper (transcription, base quality)
docker run -d -p 9000:9000 \
  -e ASR_MODEL=base -e ASR_ENGINE=faster_whisper \
  -v $PWD/cache:/root/.cache --name whisper-asr \
  onerahmet/openai-whisper-asr-webservice:latest

# LLM (romanization)
ollama pull qwen2.5:1.5b
ollama serve &
```

Run (all envs on the command line):

```bash
OLLAMA_HOST=http://127.0.0.1:11434 \
OLLAMA_LLM_MODEL=qwen2.5:1.5b \
LOCAL_WHISPER_API_URL=http://127.0.0.1:9000 \
LOCAL_WHISPER_LANGUAGE=hi \
  node apps/cli/src/index.js rec.mp4 /tmp/cli-ollama.mp4 --provider ollama
```

Legacy path (local `whisper` binary instead of Docker):

```bash
OLLAMA_HOST=http://127.0.0.1:11434 \
OLLAMA_LLM_MODEL=qwen2.5:1.5b \
LOCAL_WHISPER_MODE=cli \
LOCAL_WHISPER_CMD=whisper \
LOCAL_WHISPER_MODEL=base \
  node apps/cli/src/index.js rec.mp4 /tmp/cli-ollama.mp4 --provider ollama
```

## Env vars (CLI only, passed on the command line)

| Var                      | Used by         | Required | Default                  | Description                               |
| ------------------------ | --------------- | -------- | ------------------------ | ----------------------------------------- |
| `GROQ_API_KEY`           | groq            | **yes**  | —                        | Groq API key                              |
| `WHISPER_MODEL`          | groq            | no       | `whisper-large-v3-turbo` | Groq Whisper model                        |
| `ROMANIZE_MODEL`         | groq            | no       | `openai/gpt-oss-20b`     | Groq LLM for transliteration              |
| `CAPTION_PROVIDER`       | cli             | no       | `groq`                   | Default when `--provider` flag is omitted |
| `OLLAMA_HOST`            | ollama          | no       | `http://127.0.0.1:11434` | Ollama daemon URL                         |
| `OLLAMA_LLM_MODEL`       | ollama          | no       | `qwen2.5:1.5b`           | Ollama LLM for transliteration            |
| `LOCAL_WHISPER_API_URL`  | ollama          | no       | `http://127.0.0.1:9000`  | Whisper docker API URL                    |
| `LOCAL_WHISPER_LANGUAGE` | ollama          | no       | `hi`                     | Source language code (`hi`, `ur`, …)      |
| `LOCAL_WHISPER_MODE`     | ollama          | no       | `http`                   | `http` (docker) or `cli` (local binary)   |
| `LOCAL_WHISPER_CMD`      | ollama/cli-mode | no       | `whisper`                | Local whisper binary (cli mode only)      |
| `LOCAL_WHISPER_MODEL`    | ollama/cli-mode | no       | `base`                   | Local whisper model (cli mode only)       |

## Troubleshooting

| Output                                       | Meaning / fix                                                                   |
| -------------------------------------------- | ------------------------------------------------------------------------------- |
| `Usage: caption ...` + exit 1                | Missing input file argument                                                     |
| `Error: unknown provider "x"`                | Use `groq` or `ollama`                                                          |
| `Error: unsupported format ".txt"`           | Extension not in `mp4, mkv, webm, avi, mov`                                     |
| `Error: file not found`                      | Input path is wrong                                                             |
| `Error: ffmpeg is not installed`             | Install ffmpeg + ffprobe                                                        |
| `Error: input file has no audio track`       | Video has no audio stream                                                       |
| `GROQ_API_KEY is not set.`                   | You forgot the `GROQ_API_KEY=...` prefix                                        |
| `Failed to transliterate segment N: 400 ...` | LLM rejected that batch — segment keeps original script, output still completes |
| `Whisper docker API unreachable at ...`      | Whisper container not running — see docker run above                            |
| `Local whisper failed ("whisper")`           | No local binary and mode is `cli` — use docker (default) instead                |
| `Invalid JSON response from Ollama`          | Small LLM didn’t obey JSON format — retry, or use a bigger model                |
