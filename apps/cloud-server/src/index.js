import "dotenv/config";
import { createCaptionServer } from "@caption/server-kit";
import { transcribe, transliterate } from "@caption/providers-groq";

const PORT = parseInt(process.env.PORT || "3000", 10);
const app = createCaptionServer({ transcribe, transliterate, label: "groq-cloud" });

const server = app.listen(PORT, () => {
  console.log(`\n  Caption Generator API (groq/cloud)`);
  console.log(`  → http://localhost:${PORT}\n`);
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
