# Single-stage: no TypeScript build step anymore (pure JS).
FROM node:20-slim

RUN apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Enable pnpm via corepack
RUN corepack enable

COPY package.json pnpm-workspace.yaml ./
COPY packages/core/package.json ./packages/core/
COPY packages/server-kit/package.json ./packages/server-kit/
COPY packages/providers-groq/package.json ./packages/providers-groq/
COPY apps/cloud-server/package.json ./apps/cloud-server/
RUN pnpm install --filter @caption/cloud-server --prod --frozen-lockfile || pnpm install --filter @caption/cloud-server --prod

COPY packages/core/src ./packages/core/src
COPY packages/server-kit/src ./packages/server-kit/src
COPY packages/providers-groq/src ./packages/providers-groq/src
COPY apps/cloud-server/src ./apps/cloud-server/src

RUN useradd -m appuser && chown -R appuser:appuser /app
USER appuser

ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000

CMD ["node", "apps/cloud-server/src/index.js"]
