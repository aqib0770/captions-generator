# Single-stage: no TypeScript build step anymore (pure JS).
# NOTE: whisper runs in its own docker service (see compose `whisper`)
# and ollama is expected on the host (or OLLAMA_HOST) — neither is
# baked in here. Only ffmpeg (audio extract + subtitle burn) is local.
FROM node:20-slim

RUN apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

RUN corepack enable

COPY package.json pnpm-workspace.yaml ./
COPY packages/core/package.json ./packages/core/
COPY packages/server-kit/package.json ./packages/server-kit/
COPY packages/providers-ollama/package.json ./packages/providers-ollama/
COPY apps/local-server/package.json ./apps/local-server/
RUN pnpm install --filter @caption/local-server --prod --frozen-lockfile || pnpm install --filter @caption/local-server --prod

COPY packages/core/src ./packages/core/src
COPY packages/server-kit/src ./packages/server-kit/src
COPY packages/providers-ollama/src ./packages/providers-ollama/src
COPY apps/local-server/src ./apps/local-server/src

RUN useradd -m appuser && chown -R appuser:appuser /app
USER appuser

ENV NODE_ENV=production
ENV PORT=3001
EXPOSE 3001

CMD ["node", "apps/local-server/src/index.js"]
