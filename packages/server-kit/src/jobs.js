import fs from "fs";
import path from "path";

// In-memory job store: jobId -> { outputPath, expiresAt }.
// Single-instance only (same limitation as the original server).
const jobs = new Map();

const SWEEP_MS = 5 * 60 * 1000;
const TTL_MS = 10 * 60 * 1000;

setInterval(() => {
  const now = Date.now();
  for (const [id, job] of jobs) {
    if (now > job.expiresAt) {
      try {
        fs.rmSync(path.dirname(job.outputPath), { recursive: true, force: true });
      } catch {
        /* ignore cleanup errors */
      }
      jobs.delete(id);
    }
  }
}, SWEEP_MS).unref();

export function saveJob(jobId, outputPath) {
  jobs.set(jobId, { outputPath, expiresAt: Date.now() + TTL_MS });
}

export function getJob(jobId) {
  return jobs.get(jobId);
}
