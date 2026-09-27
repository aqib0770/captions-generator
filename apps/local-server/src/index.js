import "dotenv/config";
import { createCaptionServer } from "@caption/server-kit";
import { transcribe, transliterate } from "@caption/providers-ollama";

const PORT = parseInt(process.env.PORT || "3001", 10);
const app = createCaptionServer({ transcribe, transliterate, label: "ollama-local" });

const server = app.listen(PORT, () => {
  console.log(`\n  Caption Generator API (ollama/local)`);
  console.log(`  → http://localhost:${PORT}`);
  console.log(`  OLLAMA_HOST=${process.env.OLLAMA_HOST || "http://127.0.0.1:11434"}\n`);
});

function shutdown(signal) {
  console.log(`\n${signal} received, shutting down...`);
  server.close((err) => {
    if (err) {
      console.error("Error closing server:", err);
      process.exit(1);
    }
    console.log("Server closed.");
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
