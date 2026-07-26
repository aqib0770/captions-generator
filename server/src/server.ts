import "dotenv/config";
import express from "express";
import apiRoutes from "./routes/index.js";

const app = express();
const PORT = parseInt(process.env.PORT || "3000", 10);
const IS_PROD = process.env.NODE_ENV === "production";

// Trust proxy for correct client IP behind reverse proxy / load balancer
app.set("trust proxy", true);

// CORS headers
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "*");
  res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  if (req.method === "OPTIONS") {
    res.sendStatus(204);
    return;
  }
  next();
});

// Health check endpoints (for Docker, monitoring, load balancer)
app.get(["/health", "/healthz"], (_req, res) => {
  res.json({
    status: "ok",
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

// API routes
app.use("/api", apiRoutes);

// Global error handler
app.use(
  (
    err: any,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction,
  ) => {
    console.error("Unhandled server error:", err);
    if (res.headersSent) return;
    res
      .status(500)
      .json({ error: IS_PROD ? "Internal server error" : err.message });
  },
);

// ---------- Start & graceful shutdown ----------

const server = app.listen(PORT, () => {
  console.log(`\n  Caption Generator API`);
  console.log(`  → http://localhost:${PORT}\n`);
});

function shutdown(signal: string) {
  console.log(`\n${signal} received, shutting down...`);
  server.close((err) => {
    if (err) {
      console.error("Error closing server:", err);
      process.exit(1);
    }
    console.log("Server closed.");
    process.exit(0);
  });
  // Force exit if something hangs
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
