// Always-on safety guard: caps parallel ffmpeg jobs so a 1GB host
// (and /tmp tmpfs) can't be OOM-killed by concurrent re-encodes.
// This is NOT quota — never disable it. Tune with MAX_CONCURRENT (default 2, use 1 on 1GB).

let activeJobs = 0;

export function getMaxConcurrent() {
  const n = parseInt(process.env.MAX_CONCURRENT || "2", 10);
  if (!Number.isFinite(n) || n < 1) return 2;
  return Math.min(n, 8);
}

export function getActiveJobs() {
  return activeJobs;
}

/**
 * Atomically check + reserve a slot. Must pair every allowed result
 * with exactly one releaseJob() (including quota-reject paths).
 */
export function tryAcquire() {
  const max = getMaxConcurrent();
  if (activeJobs >= max) {
    return {
      allowed: false,
      max,
      active: activeJobs,
      retryAfterSeconds: 120,
    };
  }
  activeJobs++;
  return { allowed: true, max, active: activeJobs };
}

export function releaseJob() {
  activeJobs = Math.max(0, activeJobs - 1);
}
