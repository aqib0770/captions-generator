// Demo quota: protects the free Groq tier from burn.
// Safe to relax/disable for self-host (DISABLE_QUOTA=true) —
// concurrency.js stays always-on regardless.

const ipMap = new Map();
let dailyCount = 0;
let dailyResetAt = Date.now() + 86_400_000;

// Cleanup stale IP entries every 10 minutes to prevent memory leaks
setInterval(
  () => {
    const now = Date.now();
    for (const [ip, entry] of ipMap) {
      if (now > entry.resetAt) ipMap.delete(ip);
    }
  },
  10 * 60 * 1000,
).unref();

export function isQuotaDisabled() {
  return ["1", "true", "yes"].includes((process.env.DISABLE_QUOTA || "").toLowerCase());
}

export function getPerIpLimit() {
  const n = parseInt(process.env.RATE_PER_IP || "3", 10);
  if (!Number.isFinite(n) || n < 1) return 3;
  return n;
}

export function getPerIpWindowMs() {
  const n = parseInt(process.env.RATE_WINDOW_MS || "3600000", 10);
  if (!Number.isFinite(n) || n < 60_000) return 3_600_000;
  return n;
}

export function getDailyLimit() {
  const n = parseInt(process.env.RATE_DAILY_MAX || "20", 10);
  if (!Number.isFinite(n) || n < 1) return 20;
  return n;
}

export function checkQuota(ip) {
  if (isQuotaDisabled()) return { allowed: true, disabled: true };

  const now = Date.now();
  const perIpLimit = getPerIpLimit();
  const perIpWindowMs = getPerIpWindowMs();
  const dailyLimit = getDailyLimit();

  if (now > dailyResetAt) {
    dailyCount = 0;
    dailyResetAt = now + 86_400_000;
  }

  if (dailyCount >= dailyLimit) {
    return {
      allowed: false,
      kind: "daily",
      reason: "Daily demo limit reached. Please try again tomorrow.",
      retryAfterSeconds: Math.max(60, Math.ceil((dailyResetAt - now) / 1000)),
    };
  }

  let entry = ipMap.get(ip);
  if (!entry || now > entry.resetAt) {
    entry = { count: 0, resetAt: now + perIpWindowMs };
  }

  if (entry.count >= perIpLimit) {
    const retryAfterSeconds = Math.max(60, Math.ceil((entry.resetAt - now) / 1000));
    const minutesLeft = Math.ceil(retryAfterSeconds / 60);
    return {
      allowed: false,
      kind: "per-ip",
      reason: `Rate limit exceeded. Try again in ${minutesLeft} minute${minutesLeft > 1 ? "s" : ""}.`,
      retryAfterSeconds,
    };
  }

  entry.count++;
  ipMap.set(ip, entry);
  dailyCount++;

  return { allowed: true };
}
