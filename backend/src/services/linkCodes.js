/**
 * In-memory short-lived link codes used to associate an admin's web account
 * with their Teams identity. Codes are 6 digits, single-use, 5-minute TTL.
 */

const codes = new Map(); // code → { adminEmail, expiresAt }
const TTL_MS = 5 * 60 * 1000;

function generateCode() {
  return String(Math.floor(100000 + Math.random() * 900000)); // 6 digits
}

export function issue(adminEmail) {
  // Invalidate any previous codes for this admin
  for (const [code, entry] of codes.entries()) {
    if (entry.adminEmail === adminEmail) codes.delete(code);
  }
  // Generate a code that isn't already in use
  let code;
  do { code = generateCode(); } while (codes.has(code));
  codes.set(code, { adminEmail, expiresAt: Date.now() + TTL_MS });
  return { code, expiresAt: Date.now() + TTL_MS };
}

export function claim(code) {
  const entry = codes.get(code);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    codes.delete(code);
    return null;
  }
  codes.delete(code);
  return entry.adminEmail;
}

// Periodic cleanup
setInterval(() => {
  const now = Date.now();
  for (const [code, entry] of codes.entries()) {
    if (now > entry.expiresAt) codes.delete(code);
  }
}, 60 * 1000);
