const TTL = 30 * 1000; // 30 seconds
const store = new Map(); // teamsUserId → { action, payload, expiresAt }

export function set(userId, action, payload) {
  store.set(userId, { action, payload, expiresAt: Date.now() + TTL });
}

export function get(userId) {
  const entry = store.get(userId);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) { store.delete(userId); return null; }
  return entry;
}

export function clear(userId) {
  store.delete(userId);
}

// Sweep expired entries every 60s
setInterval(() => {
  const now = Date.now();
  for (const [id, entry] of store.entries()) {
    if (now > entry.expiresAt) store.delete(id);
  }
}, 60_000);
