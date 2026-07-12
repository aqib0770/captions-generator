# Caption Test

Generate word-level captions for videos using Whisper + Ollama-based formatting.

## Prerequisites

- Docker & Docker Compose
- An Ollama server with a model (e.g. `qwen2.5:7b-instruct`)

## Usage

1. Place a `.wav` file in `data/`.

2. Transcribe with Whisper:
   ```bash
   docker compose run whisper data/input.wav data/input.transcript.json
   ```

3. Format transcript into SRT:
   ```bash
   docker compose run formatter node cli.js format data/input.transcript.json data/input.srt
   ```

4. (Optional) Burn captions into video using ffmpeg:
   ```bash
   docker compose run ffmpeg ...
   ```

## Project Structure

```
src/           — TypeScript source (cli, formatting, SRT generation)
docker/        — Dockerfiles for whisper (Python) and node (TS)
  whisper/     — Whisper transcription service
  node/        — Node formatter service
data/          — Runtime working directory (gitignored)
```
