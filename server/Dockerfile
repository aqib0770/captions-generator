# ---- Stage 1: Build TypeScript ----
FROM node:20-slim AS builder

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci

COPY tsconfig.json ./
COPY src/ ./src/
RUN npx tsc

# ---- Stage 2: Production ----
FROM node:20-slim

# Install FFmpeg (the only system dependency)
RUN apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci --omit=dev

COPY --from=builder /app/dist/ ./dist/
COPY public/ ./public/

# Cloud Run expects port 8080
EXPOSE 8080
ENV PORT=8080

CMD ["node", "dist/server.js"]
