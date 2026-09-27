# Caption Test (pnpm JS monorepo)

Word-level caption generator: upload a short video, get the same video back with burned-in karaoke-style captions (Hindi → romanized on-the-fly).

**Pipeline:** ffmpeg → Whisper (transcribe) → LLM (romanize non-Latin words) → ASS subtitles → ffmpeg (burn).

Pure JavaScript (ESM), no TypeScript build step. `node --watch` / `vite` run sources directly.

## Layout

```
packages/core             # MAIN APP — types(JSDoc), config, ffmpeg, subtitle, pipeline. No cli/express/groq/ollama.
packages/providers-groq   # Groq Whisper (whisper-large-v3-turbo) + Groq LLM (openai/gpt-oss-20b)
packages/providers-ollama # Whisper docker HTTP + Ollama LLM (deepseek-r1:1.5b default)
packages/server-kit       # Shared express factory: multer 30MB, SSE progress|done|error, ratelimit, job store
apps/cli                  # Thin CLI: caption <in> [out] --provider groq|ollama
apps/cloud-server         # Groq wiring, :3000
apps/local-server         # Ollama wiring, :3001
apps/web                  # React+Vite frontend (JS/JSX)
```

## Env

See `.env.example`. Cloud needs `GROQ_API_KEY`. Local needs `OLLAMA_HOST` + whisper docker (no host install):

```bash
docker run -d -p 9000:9000 -e ASR_MODEL=base -e ASR_ENGINE=faster_whisper \
  -v $PWD/cache:/root/.cache --name whisper-asr \
  onerahmet/openai-whisper-asr-webservice:latest
# or: docker compose --profile local up -d whisper
```

## Run locally

```bash
pnpm install
# cloud
pnpm dev:cloud
# local (separate terminal)
pnpm dev:local
# web (separate terminal, VITE_API_URL optional — defaults to :3000 proxy)
pnpm dev:web

# CLI
node apps/cli/src/index.js rec.mp4 --provider groq
node apps/cli/src/index.js rec.mp4 out.mp4 --provider ollama
```

## Run in Docker

```bash
cp .env.example .env
docker compose up -d --build                    # cloud-server :3000
docker compose --profile local up -d --build    # + local-server :3001
```

Health: `GET http://localhost:3000/health`, `GET http://localhost:3001/health`.

## API

- `POST /api/caption` — `multipart/form-data` with a `video` file (`mp4/mkv/webm/avi/mov`, max 30MB). Streams SSE progress events (`progress`, `done`, `error`).
- `GET /api/download/:jobId` — download the captioned video (valid for ~10 minutes).
- `GET /health` — liveness probe.
