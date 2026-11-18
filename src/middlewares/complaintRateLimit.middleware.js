const ApiError = require('../utils/ApiError');

const WINDOW_MS = 10 * 60 * 1000;
const MAX_SUBMISSIONS = 8;
const hits = new Map();

// Small in-memory guard for the public QR form. It is intentionally lightweight; the
// endpoint is still validated and rate limiting is per server instance.
function complaintRateLimit(req, res, next) {
  const key = req.ip || req.socket?.remoteAddress || 'unknown';
  const now = Date.now();

  if (hits.size > 5000) {
    for (const [entryKey, entry] of hits) {
      if (entry.resetAt < now) hits.delete(entryKey);
    }
  }

  let entry = hits.get(key);
  if (!entry || entry.resetAt < now) {
    entry = { count: 0, resetAt: now + WINDOW_MS };
    hits.set(key, entry);
  }

  entry.count += 1;
  if (entry.count > MAX_SUBMISSIONS) {
    return next(new ApiError(429, 'Too many complaints from this device. Please try again later.'));
  }

  return next();
}

module.exports = complaintRateLimit;
