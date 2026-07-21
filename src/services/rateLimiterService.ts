const WINDOW_MS = 30_000;
const MAX_REQUESTS = 10;

const requestTimestamps = new Map<string, number[]>();

export function isRateLimited(userId: string): boolean {
  const now = Date.now();
  const timestamps = (requestTimestamps.get(userId) ?? []).filter((t) => now - t < WINDOW_MS);

  if (timestamps.length >= MAX_REQUESTS) {
    requestTimestamps.set(userId, timestamps);
    return true;
  }

  timestamps.push(now);
  requestTimestamps.set(userId, timestamps);
  return false;
}
