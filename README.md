# Caption Test

Word-level caption generator: give it a video, get the same video back with burned-in karaoke-style captions (Hindi/Urdu → romanized on-the-fly).

**Pipeline:** ffmpeg → Whisper (transcribe) → LLM (romanize non-Latin words) → ASS subtitles → ffmpeg (burn).

pnpm monorepo (`pnpm-workspace.yaml`: `apps/*` + `packages/*`). Same pipeline reused by every entry point — only `transcribe` / `transliterate` are swapped.

## Contents

| Path                        | Type  | What it is                                                                                              |
| --------------------------- | ----- | ------------------------------------------------------------------------------------------------------- |
| `apps/cli`                  | app   | Direct pipeline, no server. `--provider groq\|ollama`. Reads env **from command line only, no `.env`**. |
| `apps/cloud-server`         | app   | HTTP API on `:3000` wired to Groq. Reads `.env` (`dotenv`).                                             |
| `apps/local-server`         | app   | HTTP API on `:3001` wired to Ollama + whisper docker. Reads `.env`.                                     |
| `apps/web`                  | app   | React + Vite UI on `:5173`. Uploads to `/api/caption`, streams progress, downloads result.              |
| `packages/core`             | lib   | `runPipeline`, ffmpeg, subtitles, limits. No provider code.                                             |
| `packages/providers-groq`   | lib   | `transcribe` + `transliterate` via Groq API.                                                            |
| `packages/providers-ollama` | lib   | `transcribe` via whisper docker HTTP + `transliterate` via Ollama.                                      |
| `packages/server-kit`       | lib   | `createCaptionServer({transcribe, transliterate})`: Express + multer + SSE + jobs + rate-limit.         |
| `docker-compose.yml`        | infra | `cloud-server` (default) + `whisper` + `local-server` (`local` profile).                                |
| `apps/*/Dockerfile`         | infra | Multi-stage `node:20-slim` + `ffmpeg`, `pnpm deploy --prod`.                                            |

Root shortcuts: `pnpm dev:cloud`, `pnpm dev:local`, `pnpm dev:web`, `pnpm start:cloud`, `pnpm start:local`.

## Prerequisites

```bash
docker --version
node --version   # v22 on host (containers use node:20-slim + ffmpeg)
pnpm --version   # v10
ffmpeg -version  # only for host runs (CLI / pnpm dev); Docker images already include it
ffprobe -version # same as above
ollama --version # only for the local stack
```

Get a Groq key for the cloud path: https://console.groq.com/keys

## Setup (once)

```bash
pnpm install
cp .env.example .env  # then set GROQ_API_KEY for cloud
```

`compose` reads `.env` (`${VAR}` / `${VAR:-default}`). Servers load it via `dotenv`. The CLI does **not** — pass its env on the command line.

## 1. Run with Docker (recommended)

### 1A. Cloud (Groq) — default service

`docker-compose.yml`: only `cloud-server` has no `profile`, so plain `up` starts just it (`caption-cloud-server`, `3000:3000`, `tmpfs: /tmp`).

```bash
# .env must contain:
# GROQ_API_KEY=your_key_here
docker compose up -d --build
docker ps --filter name=caption-cloud-server
curl http://localhost:3000/health
# {"status":"ok","engine":"groq-cloud",...}
docker logs caption-cloud-server
```

Caption a video with curl (field name must be `video`, max 30 MB, one of `mp4, mkv, webm, avi, mov`):

```bash
# -N disables curl buffering so you see SSE progress live
curl -N -F "video=@rec.mp4" http://localhost:3000/api/caption
```

Expected SSE stream:

```
event: progress
data: {"stage":"extracting","message":"Extracting audio from video..."}

event: progress
data: {"stage":"transcribing","message":"Transcribing audio with Whisper..."}

event: progress
data: {"stage":"romanizing","message":"..."}
...
event: done
data: {"downloadUrl":"/api/download/<jobId>"}
```

Download (job expires after 10 min, in-memory store):

```bash
curl -OJ http://localhost:3000/api/download/<jobId>
# -> captioned.mp4
```

### 1B. Local (Ollama + whisper docker) — `local` profile

`whisper` (`caption-whisper`, `9000:9000`, `whisper-cache:/root/.cache`) + `local-server` (`caption-local-server`, `3001:3001`) both have `profiles: [local]`. `local-server` has `depends_on: whisper` and hard-codes `LOCAL_WHISPER_API_URL=http://whisper:9000` (compose DNS). `OLLAMA_HOST` defaults to `http://host.docker.internal:11434` so the container reaches Ollama on your host.

One-time on host:

```bash
ollama pull qwen2.5:1.5b
ollama serve &
curl http://127.0.0.1:11434/api/tags  # sanity check
```

Start (starts cloud + whisper + local together):

```bash
docker compose --profile local up -d --build
curl http://localhost:3001/health
# {"status":"ok","engine":"ollama-local",...}
curl http://localhost:3000/health  # cloud still up alongside
```

Use it — same API, different port:

```bash
curl -N -F "video=@rec.mp4" http://localhost:3001/api/caption
# event: done -> {"downloadUrl":"/api/download/<jobId>"}
curl -OJ http://localhost:3001/api/download/<jobId>
```

Notes:

- To run **only** local (skip cloud): `docker compose --profile local up -d --build whisper local-server`.
- `ASR_MODEL=base`, `ASR_ENGINE=faster_whisper` in `.env` control whisper quality. Larger models are slower but more accurate.
- If Ollama runs elsewhere (another host/container), set `OLLAMA_HOST` in `.env` — compose passes it through.
- Manual `docker run ... onerahmet/openai-whisper-asr-webservice` also works for CLI-only use (see §3), but compose is canonical: named volume + fixed container names + `depends_on`.

## 2. Web UI

Not containerized. Run on host, point at whichever server is up.

```bash
pnpm --filter @caption/web dev  # or: pnpm dev:web
# -> http://localhost:5173
```

How it connects (`apps/web/src/App.jsx:34`, `apps/web/vite.config.js:9-14`):

- Request: `fetch((VITE_API_URL || "") + "/api/caption", {method:"POST", body: FormData with "video"})`, then parses SSE `progress` / `done {downloadUrl}` / `error`.
- Dev default: `VITE_API_URL` empty → Vite proxy `/api -> http://127.0.0.1:3000` (cloud).
- To use local-server:

```bash
VITE_API_URL=http://127.0.0.1:3001 pnpm --filter @caption/web dev
```

- `downloadUrl` from the server is relative (`/api/download/:jobId`). The UI uses it as `href` directly, so same-origin works; cross-origin builds need `VITE_API_URL` prefix.

## 3. CLI (host, no server)

Needs `node + pnpm + ffmpeg/ffprobe` on host. No `.env` loaded — prefix every run with env vars. Good for scripting / debugging providers directly.

```bash
node apps/cli/src/index.js <input.mp4> [output.mp4] [--provider groq|ollama]
```

- `<input.mp4>` required, one of `mp4, mkv, webm, avi, mov`. Must have an audio track.
- `[output.mp4]` optional, defaults to `<name>-captioned.mp4` next to input.
- `--provider groq|ollama` (also `--provider=groq`). Default `groq`, or `CAPTION_PROVIDER` env.
- `--help` / `-h` prints usage.

Groq:

```bash
GROQ_API_KEY=your_key_here \
  node apps/cli/src/index.js rec.mp4 --provider groq

# all optionals:
GROQ_API_KEY=your_key_here \
WHISPER_MODEL=whisper-large-v3-turbo \
ROMANIZE_MODEL=openai/gpt-oss-20b \
  node apps/cli/src/index.js rec.mp4 /tmp/cli-groq.mp4 --provider groq

# via env instead of flag:
GROQ_API_KEY=your_key_here CAPTION_PROVIDER=groq \
  node apps/cli/src/index.js rec.mp4 /tmp/cli-groq.mp4
```

Ollama (whisper in Docker, LLM in Ollama — no PyTorch on host):

```bash
# if you are NOT using compose, start whisper once manually:
docker run -d -p 9000:9000 \
  -e ASR_MODEL=base -e ASR_ENGINE=faster_whisper \
  -v whisper-cache:/root/.cache --name whisper-asr \
  onerahmet/openai-whisper-asr-webservice:latest
ollama pull qwen2.5:1.5b
ollama serve &

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

## 4. Servers without Docker (host dev)

Same code as the images, without `ffmpeg`-in-container guarantee:

```bash
pnpm dev:cloud   # cloud-server with --watch -> :3000 (needs GROQ_API_KEY in .env)
pnpm dev:local   # local-server with --watch -> :3001 (needs Ollama + whisper reachable)
pnpm start:cloud # prod-style, no watch
pnpm start:local
```

`PORT` env overrides the port in both.

## 5. API reference

All paths served by `packages/server-kit/src/factory.js`, provider injected by `apps/cloud-server/src/index.js` (`groq-cloud`) or `apps/local-server/src/index.js` (`ollama-local`).

| Method | Path                   | Description                                                                                               |
| ------ | ---------------------- | --------------------------------------------------------------------------------------------------------- |
| `GET`  | `/health`, `/healthz`  | `{"status":"ok","engine":...,"uptime":...}`. Use for compose checks.                                      |
| `POST` | `/api/caption`         | `multipart/form-data`, field `video`. Streams SSE, ends with `done`. Errors before streaming return JSON. |
| `GET`  | `/api/download/:jobId` | File download `captioned.mp4`. `404` if missing/expired.                                                  |

curl cheat-sheet:

```bash
# health
curl http://localhost:3000/health | jq .
curl http://localhost:3001/health | jq .

# caption (cloud) — live SSE
curl -N -F "video=@rec.mp4" http://localhost:3000/api/caption

# caption (local)
curl -N -F "video=@rec.mp4" http://localhost:3001/api/caption

# save SSE to file to extract job id later
curl -N -F "video=@rec.mp4" http://localhost:3000/api/caption | tee /tmp/sse.txt
grep -o '/api/download/[^"]*' /tmp/sse.txt | tail -1

# download
curl -OJ http://localhost:3000/api/download/<jobId>
curl -OJ http://localhost:3001/api/download/<jobId>

# typical error (JSON, not SSE)
curl -s -X POST http://localhost:3000/api/caption | jq .
# {"error":"No video file provided."}
```

SSE event shapes:

```
event: progress  data: {"stage":"extracting|transcribing|romanizing|generating|burning","message":"..."}
event: done      data: {"downloadUrl":"/api/download/<jobId>"}
event: error     data: {"message":"..."}
```

## Env vars

| Var                      | Used by             | Required        | Default (host / compose)                                                                  | Description                             |
| ------------------------ | ------------------- | --------------- | ----------------------------------------------------------------------------------------- | --------------------------------------- |
| `GROQ_API_KEY`           | groq server + CLI   | **yes (cloud)** | —                                                                                         | Groq API key                            |
| `WHISPER_MODEL`          | groq                | no              | `whisper-large-v3-turbo`                                                                  | Groq Whisper model                      |
| `ROMANIZE_MODEL`         | groq                | no              | `openai/gpt-oss-20b`                                                                      | Groq LLM for transliteration            |
| `CAPTION_PROVIDER`       | CLI only            | no              | `groq`                                                                                    | Default when `--provider` omitted       |
| `OLLAMA_HOST`            | ollama server + CLI | no              | host: `http://127.0.0.1:11434` / compose: `http://host.docker.internal:11434`             | Ollama daemon URL                       |
| `OLLAMA_LLM_MODEL`       | ollama              | no              | `qwen2.5:1.5b`                                                                            | Ollama LLM for transliteration          |
| `LOCAL_WHISPER_API_URL`  | ollama              | no              | CLI/host: `http://127.0.0.1:9000` / compose `local-server`: `http://whisper:9000` (fixed) | Whisper docker API URL                  |
| `LOCAL_WHISPER_LANGUAGE` | ollama              | no              | `hi`                                                                                      | Source language (`hi`, `ur`, …)         |
| `LOCAL_WHISPER_MODE`     | ollama              | no              | `http`                                                                                    | `http` (docker) or `cli` (local binary) |
| `LOCAL_WHISPER_CMD`      | ollama/cli-mode     | no              | `whisper`                                                                                 | Local whisper binary (cli mode only)    |
| `LOCAL_WHISPER_MODEL`    | ollama/cli-mode     | no              | `base`                                                                                    | Local whisper model (cli mode only)     |
| `ASR_MODEL`              | whisper container   | no              | `base`                                                                                    | Compose `whisper` model                 |
| `ASR_ENGINE`             | whisper container   | no              | `faster_whisper`                                                                          | Compose `whisper` engine                |
| `PORT`                   | servers             | no              | cloud `3000`, local `3001`                                                                | Listen port                             |
| `VITE_API_URL`           | web                 | no              | empty (proxy to `:3000`)                                                                  | e.g. `http://127.0.0.1:3001` for local  |

CLI: prefix vars on the command line (no `.env`). Servers/compose: set them in `.env` (see `.env.example`).

## Limits

From `packages/core/src/config.js`, `packages/server-kit/src/ratelimit.js`, `jobs.js` (also shown in web footer):

- Max upload: **30 MB** (`413 File too large`).
- Formats: `mp4, mkv, webm, avi, mov` (else `400 Unsupported format`).
- Rate: **3 uploads/hour per IP**, **20/day globally**, **max 2 concurrent** (`429` + reason).
- Downloads expire after **10 min** (`404 Job not found or expired`).

## Troubleshooting

| Output                                                        | Meaning / fix                                                                                                           |
| ------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `Usage: caption ...` + exit 1                                 | Missing input file argument                                                                                             |
| `Error: unknown provider "x"`                                 | Use `groq` or `ollama`                                                                                                  |
| `Error: unsupported format ".txt"`                            | Extension not in `mp4, mkv, webm, avi, mov`                                                                             |
| `Error: file not found`                                       | Input path is wrong                                                                                                     |
| `Error: ffmpeg is not installed`                              | Install ffmpeg + ffprobe (host runs only)                                                                               |
| `Error: input file has no audio track`                        | Video has no audio stream                                                                                               |
| `GROQ_API_KEY is not set.`                                    | Cloud: set in `.env` (compose/servers) or `GROQ_API_KEY=...` prefix (CLI)                                               |
| `Failed to transliterate segment N: 400 ...`                  | LLM rejected that batch — segment keeps original script, output still completes                                         |
| `Whisper docker API unreachable at ...`                       | Whisper container not running — `docker compose --profile local up -d whisper` (compose) or `docker run ...` (CLI-only) |
| `Whisper docker API 500 ...`                                  | Whisper container errored — check `docker logs caption-whisper` / `whisper-asr`                                         |
| `Local whisper failed ("whisper")`                            | No local binary and mode is `cli` — use docker (default) instead                                                        |
| `Invalid JSON response from Ollama`                           | Small LLM didn’t obey JSON format — retry, or use a bigger model                                                        |
| `curl: (7) Failed to connect :3000/3001`                      | Server not up — `docker ps`, `docker logs caption-cloud-server/caption-local-server`                                    |
| `429 Server is busy / Rate limit exceeded / Daily demo limit` | `ratelimit.js` limits — wait or restart server to reset in-memory counters                                              |
| `413 File too large`                                          | Over 30 MB — compress or trim video                                                                                     |
| `404 Job not found or expired`                                | Download after 10 min TTL or wrong base URL (`:3000` vs `:3001`)                                                        |
| Web `Backend server is unreachable`                           | No server on expected port — start compose or set `VITE_API_URL`                                                        |
| `OLLAMA_HOST` `127.0.0.1` fails from container                | Inside compose use `http://host.docker.internal:11434` (default); `127.0.0.1` is only for host CLI/dev                  |

## Stop / clean

```bash
docker compose down            # stop cloud (and local if running)
docker compose --profile local down
docker compose logs -f cloud-server        # follow logs
docker compose logs -f local-server whisper
```
