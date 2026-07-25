import express from "express";
import multer from "multer";
import crypto from "crypto";
import path from "path";
import fs from "fs";
import { runPipeline } from "../services/pipeline.js";
import { checkRateLimit, trackJob, releaseJob } from "../middleware/ratelimit.js";

const SUPPORTED_EXTENSIONS = [".mp4", ".mkv", ".webm", ".avi", ".mov"];
const MAX_FILE_SIZE = 30 * 1024 * 1024; // 30 MB

// ---------- Job storage ----------

interface Job {
  outputPath: string;
  expiresAt: number;
}

const jobs = new Map<string, Job>();

// Cleanup expired jobs every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [id, job] of jobs) {
    if (now > job.expiresAt) {
      try {
        fs.rmSync(path.dirname(job.outputPath), {
          recursive: true,
          force: true,
        });
      } catch {
        /* ignore cleanup errors */
      }
      jobs.delete(id);
    }
  }
}, 5 * 60 * 1000).unref();

// ---------- Multer ----------

export const upload = multer({
  dest: "/tmp/uploads/",
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!SUPPORTED_EXTENSIONS.includes(ext)) {
      cb(
        new Error(
          `Unsupported format: ${ext}. Supported: ${SUPPORTED_EXTENSIONS.join(", ")}`,
        ),
      );
      return;
    }
    cb(null, true);
  },
});

// ---------- Handlers ----------

export async function handleCaption(
  req: express.Request,
  res: express.Response,
): Promise<void> {
  const ip = req.ip || req.socket.remoteAddress || "unknown";

  // Rate limit check
  const limit = checkRateLimit(ip);
  if (!limit.allowed) {
    // Cleanup uploaded file if rate limited
    if (req.file) {
      try { fs.unlinkSync(req.file.path); } catch { /* ignore */ }
    }
    res.status(429).json({ error: limit.reason });
    return;
  }

  if (!req.file) {
    res.status(400).json({ error: "No video file provided." });
    return;
  }

  // Set up job directory
  const jobId = crypto.randomUUID();
  const jobDir = `/tmp/jobs/${jobId}`;
  fs.mkdirSync(jobDir, { recursive: true });

  const ext = path.extname(req.file.originalname).toLowerCase();
  const inputPath = path.join(jobDir, `input${ext}`);
  fs.copyFileSync(req.file.path, inputPath);
  try { fs.unlinkSync(req.file.path); } catch { /* ignore */ }

  // Switch to SSE mode
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no"); // Disable nginx/proxy buffering
  res.flushHeaders();

  const sendEvent = (event: string, data: Record<string, unknown>) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  trackJob();

  try {
    const outputPath = path.join(jobDir, "output.mp4");

    await runPipeline({
      inputPath,
      outputPath,
      onProgress: (stage, message) => {
        sendEvent("progress", { stage, message });
      },
    });

    // Store result for download (expires in 10 minutes)
    jobs.set(jobId, {
      outputPath,
      expiresAt: Date.now() + 10 * 60 * 1000,
    });

    sendEvent("done", { downloadUrl: `/api/download/${jobId}` });
  } catch (err: any) {
    console.error("Pipeline error:", err);
    sendEvent("error", {
      message: err.message || "Something went wrong during processing.",
    });

    // Cleanup failed job directory
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

export function handleDownload(req: express.Request, res: express.Response): void {
  const job = jobs.get(req.params.jobId);
  if (!job || !fs.existsSync(job.outputPath)) {
    res.status(404).json({ error: "Job not found or expired." });
    return;
  }
  res.download(job.outputPath, "captioned.mp4");
}
