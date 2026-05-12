const DEFAULT_TTL = 5 * 60 * 1000; // 5 minutes
const locks = new Map(); // faqId → { userId, userEmail, expiresAt }

export function acquire(faqId, userId, userEmail, ttl = DEFAULT_TTL) {
  const existing = locks.get(faqId);
  if (existing && Date.now() < existing.expiresAt && existing.userId !== userId) {
    return { ok: false, heldBy: existing.userEmail, expiresAt: existing.expiresAt };
  }
  locks.set(faqId, { userId, userEmail, expiresAt: Date.now() + ttl });
  return { ok: true };
}

export function release(faqId, userId) {
  const existing = locks.get(faqId);
  if (existing && existing.userId === userId) { locks.delete(faqId); return true; }
  return false;
}

export function refresh(faqId, userId, ttl = DEFAULT_TTL) {
  const existing = locks.get(faqId);
  if (!existing || existing.userId !== userId) return false;
  existing.expiresAt = Date.now() + ttl;
  return true;
}

export function check(faqId) {
  const entry = locks.get(faqId);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) { locks.delete(faqId); return null; }
  return entry;
}

export function releaseAll(userId) {
  for (const [id, entry] of locks.entries()) {
    if (entry.userId === userId) locks.delete(id);
  }
}

// Sweep expired locks every 60s
setInterval(() => {
  const now = Date.now();
  for (const [id, entry] of locks.entries()) {
    if (now > entry.expiresAt) locks.delete(id);
  }
}, 60_000);
