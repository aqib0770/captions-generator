const ipMap = new Map();
let dailyCount = 0;
let dailyResetAt = Date.now() + 86_400_000;
let activeJobs = 0;

const PER_IP_LIMIT = 3;
const PER_IP_WINDOW_MS = 3_600_000; // 1 hour
const DAILY_LIMIT = 20;
const MAX_CONCURRENT = 2;

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

export function checkRateLimit(ip) {
  const now = Date.now();

  if (now > dailyResetAt) {
    dailyCount = 0;
    dailyResetAt = now + 86_400_000;
  }

  if (activeJobs >= MAX_CONCURRENT) {
    return {
      allowed: false,
      reason: "Server is busy processing other videos. Please try again in a few minutes.",
    };
  }

  if (dailyCount >= DAILY_LIMIT) {
    return { allowed: false, reason: "Daily demo limit reached. Please try again tomorrow." };
  }

  let entry = ipMap.get(ip);
  if (!entry || now > entry.resetAt) {
    entry = { count: 0, resetAt: now + PER_IP_WINDOW_MS };
  }

  if (entry.count >= PER_IP_LIMIT) {
    const minutesLeft = Math.ceil((entry.resetAt - now) / 60_000);
    return {
      allowed: false,
      reason: `Rate limit exceeded. Try again in ${minutesLeft} minute${minutesLeft > 1 ? "s" : ""}.`,
    };
  }

  entry.count++;
  ipMap.set(ip, entry);
  dailyCount++;

  return { allowed: true };
}

export function trackJob() {
  activeJobs++;
}

export function releaseJob() {
  activeJobs = Math.max(0, activeJobs - 1);
}
