FROM node:20-slim AS builder

WORKDIR /app

COPY cli/package.json ./cli/
RUN cd cli && npm install

COPY cli/tsconfig.json ./cli/
COPY cli/ ./cli/
RUN cd cli && npx tsc

FROM node:20-slim

WORKDIR /app

COPY --from=builder /app/cli/dist/ ./cli/

CMD ["node", "--help"]
