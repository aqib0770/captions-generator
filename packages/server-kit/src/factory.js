import express from "express";
import multer from "multer";
import crypto from "crypto";
import path from "path";
import fs from "fs";
import { runPipeline, SUPPORTED_EXTENSIONS, MAX_FILE_SIZE } from "@caption/core";
import { checkRateLimit, trackJob, releaseJob } from "./ratelimit.js";
import { saveJob, getJob } from "./jobs.js";

function sendEvent(res, event, data) {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

/**
 * Build an express app wired to injected providers.
 * @param {{ transcribe: (wav: string) => Promise<any[]>, transliterate: (words: string[]) => Promise<string[]>, label?: string }} providers
 */
export function createCaptionServer(providers) {
  const { transcribe, transliterate, label = "caption" } = providers;
  if (typeof transcribe !== "function")
    throw new Error("createCaptionServer: transcribe() provider required.");
  if (typeof transliterate !== "function")
    throw new Error("createCaptionServer: transliterate() provider required.");

  const app = express();
  app.set("trust proxy", true);

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

  app.get(["/health", "/healthz"], (_req, res) => {
    res.json({
      status: "ok",
      engine: label,
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    });
  });

  const upload = multer({
    dest: "/tmp/uploads/",
    limits: { fileSize: MAX_FILE_SIZE },
    fileFilter: (_req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      if (!SUPPORTED_EXTENSIONS.includes(ext)) {
        cb(new Error(`Unsupported format: ${ext}. Supported: ${SUPPORTED_EXTENSIONS.join(", ")}`));
        return;
      }
      cb(null, true);
    },
  });

  app.post("/api/caption", (req, res, next) => {
    upload.single("video")(req, res, (err) => {
      if (err) {
        if (err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE") {
          res.status(413).json({ error: "File too large. Maximum size is 30 MB." });
          return;
        }
        res.status(400).json({ error: err.message });
        return;
      }
      handleCaption(req, res).catch(next);
    });
  });

  app.get("/api/download/:jobId", (req, res) => {
    const job = getJob(req.params.jobId);
    if (!job || !fs.existsSync(job.outputPath)) {
      res.status(404).json({ error: "Job not found or expired." });
      return;
    }
    res.download(job.outputPath, "captioned.mp4");
  });

  async function handleCaption(req, res) {
    const ip = req.ip || req.socket.remoteAddress || "unknown";

    const limit = checkRateLimit(ip);
    if (!limit.allowed) {
      if (req.file) {
        try {
          fs.unlinkSync(req.file.path);
        } catch {
          /* ignore */
        }
      }
      res.status(429).json({ error: limit.reason });
      return;
    }

    if (!req.file) {
      res.status(400).json({ error: "No video file provided." });
      return;
    }

    const jobId = crypto.randomUUID();
    const jobDir = `/tmp/jobs/${jobId}`;
    fs.mkdirSync(jobDir, { recursive: true });

    const ext = path.extname(req.file.originalname).toLowerCase();
    const inputPath = path.join(jobDir, `input${ext}`);
    fs.copyFileSync(req.file.path, inputPath);
    try {
      fs.unlinkSync(req.file.path);
    } catch {
      /* ignore */
    }

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders();

    trackJob();

    try {
      const outputPath = path.join(jobDir, "output.mp4");
      await runPipeline({
        inputPath,
        outputPath,
        transcribe,
        transliterate,
        onProgress: (stage, message) => sendEvent(res, "progress", { stage, message }),
      });

      saveJob(jobId, outputPath);
      sendEvent(res, "done", { downloadUrl: `/api/download/${jobId}` });
    } catch (err) {
      console.error("Pipeline error:", err);
      sendEvent(res, "error", {
        message: err.message || "Something went wrong during processing.",
      });
      try {
        fs.rmSync(jobDir, { recursive: true, force: true });
      } catch {
        /* ignore */
      }
    } finally {
      releaseJob();
      res.end();
    }
  }

  // Global error handler — hides internals in production
  // eslint-disable-next-line no-unused-vars
  app.use((err, _req, res, _next) => {
    console.error("Unhandled server error:", err);
    if (res.headersSent) return;
    res.status(500).json({
      error: process.env.NODE_ENV === "production" ? "Internal server error" : err.message,
    });
  });

  return app;
}
