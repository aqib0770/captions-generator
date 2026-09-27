# Pure JS — no build step. Multi-stage: reproducible install + pnpm deploy,
# then a slim runtime with only ffmpeg and prod files.
# ---- Stage 1: install + deploy ----
FROM node:20-slim AS deployer

ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable

WORKDIR /app

# Workspace manifests first: cached layer + reproducible frozen install.
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/core/package.json ./packages/core/
COPY packages/server-kit/package.json ./packages/server-kit/
COPY packages/providers-groq/package.json ./packages/providers-groq/
COPY packages/providers-ollama/package.json ./packages/providers-ollama/
COPY apps/cli/package.json ./apps/cli/
COPY apps/cloud-server/package.json ./apps/cloud-server/
COPY apps/local-server/package.json ./apps/local-server/
COPY apps/web/package.json ./apps/web/
RUN pnpm install --frozen-lockfile

# Sources needed for deploy (deploy copies the package's own files).
COPY packages/core/src ./packages/core/src
COPY packages/server-kit/src ./packages/server-kit/src
COPY packages/providers-groq/src ./packages/providers-groq/src
COPY apps/cloud-server/src ./apps/cloud-server/src

# Self-contained prod dir: real node_modules, workspace deps materialized.
# --legacy: copy (not inject) workspace deps; no inject-workspace-packages needed.
RUN pnpm --filter @caption/cloud-server --prod deploy --legacy /prod/app

# ---- Stage 2: runtime ----
FROM node:20-slim

# ffmpeg is the only system dependency (audio extract + subtitle burn).
RUN apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY --from=deployer /prod/app ./

RUN useradd -m appuser && chown -R appuser:appuser /app
USER appuser

ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000

CMD ["node", "src/index.js"]
