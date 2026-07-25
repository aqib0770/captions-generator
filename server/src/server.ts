import "dotenv/config";
import express from "express";
import apiRoutes from "./routes/index.js";

const app = express();
const PORT = parseInt(process.env.PORT || "3000", 10);

// Trust proxy for correct client IP behind Cloud Run's load balancer
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

// Health check endpoints (for Docker, Cloud Run, and monitoring)
app.get(["/health", "/healthz"], (_req, res) => {
  res.json({
    status: "ok",
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

// API routes
app.use("/api", apiRoutes);

// Global Error Handler
app.use(
  (
    err: any,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction,
  ) => {
    console.error("Unhandled server error:", err);
    if (!res.headersSent) {
      res.status(500).json({ error: err.message || "Internal server error" });
    }
  },
);

// ---------- Start ----------

app.listen(PORT, () => {
  console.log(`\n  Caption Generator API`);
  console.log(`  → http://localhost:${PORT}\n`);
});
