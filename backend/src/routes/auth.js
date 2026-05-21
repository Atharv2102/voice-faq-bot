import { Router } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import * as fileStore from '../services/fileStore.js';
import * as linkCodes from '../services/linkCodes.js';
import { requireJwt } from '../middleware/auth.js';

const router = Router();

router.post('/register', async (req, res) => {
  const { email, password, name, register_code } = req.body ?? {};
  if (!email || !password || !name) {
    return res.status(400).json({ error: 'email, password, and name are required' });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'Invalid email format' });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters' });
  }

  // Optional invite-code gate
  if (process.env.REGISTER_CODE && register_code !== process.env.REGISTER_CODE) {
    return res.status(403).json({ error: 'Invalid or missing registration code' });
  }

  // Optional email-domain whitelist (comma-separated, e.g. "inmobi.com,inmobi.net")
  if (process.env.ALLOWED_EMAIL_DOMAINS) {
    const allowed = process.env.ALLOWED_EMAIL_DOMAINS.split(',').map(d => d.trim().toLowerCase());
    const domain = email.toLowerCase().split('@')[1];
    if (!allowed.includes(domain)) {
      return res.status(403).json({ error: `Email domain not allowed. Must be one of: ${allowed.join(', ')}` });
    }
  }

  const hash = await bcrypt.hash(password, 10);
  const newAdmin = {
    teams_user_id: '',                // user can link their Teams ID later
    email: email.toLowerCase(),
    name,
    role: 'lt',                       // new self-registrations default to LT; admins promote via panel
    web_password_hash: hash,
    notifications_enabled: true,
    active: true,
    created_at: new Date().toISOString(),
  };

  let duplicate = false;
  await fileStore.update('admins', (data) => {
    const admins = data.admins ?? [];
    if (admins.find(a => a.email?.toLowerCase() === email.toLowerCase())) {
      duplicate = true;
      return data;
    }
    data.admins = [...admins, newAdmin];
    return data;
  });
  if (duplicate) return res.status(409).json({ error: 'An admin with this email already exists' });

  const token = jwt.sign(
    { id: newAdmin.email, email: newAdmin.email, name: newAdmin.name },
    process.env.JWT_SECRET || 'replace-me',
    { expiresIn: '8h' }
  );
  return res.status(201).json({ token });
});

router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'email and password are required' });

  const { admins } = fileStore.read('admins');
  const admin = admins.find(a => a.email === email && a.active);
  if (!admin?.web_password_hash) return res.status(401).json({ error: 'Invalid credentials' });

  const ok = await bcrypt.compare(password, admin.web_password_hash);
  if (!ok) return res.status(401).json({ error: 'Invalid credentials' });

  const token = jwt.sign(
    { id: admin.teams_user_id, email: admin.email, name: admin.name },
    process.env.JWT_SECRET || 'replace-me',
    { expiresIn: '8h' }
  );
  return res.json({ token });
});

// ── Current-user info (used by the panel to show link status) ───────────────
router.get('/me', requireJwt, (req, res) => {
  const { admins } = fileStore.read('admins');
  const admin = admins.find(a => a.email?.toLowerCase() === req.admin.email?.toLowerCase());
  if (!admin) return res.status(404).json({ error: 'Admin not found' });
  return res.json({
    email: admin.email,
    name: admin.name,
    teams_user_id: admin.teams_user_id || '',
    teams_linked: !!admin.teams_user_id,
    notifications_enabled: !!admin.notifications_enabled,
  });
});

// ── Issue a one-time code to link a Teams account to this admin ─────────────
router.post('/link-code', requireJwt, (req, res) => {
  const { admins } = fileStore.read('admins');
  const admin = admins.find(a => a.email?.toLowerCase() === req.admin.email?.toLowerCase());
  if (!admin) return res.status(404).json({ error: 'Admin not found' });
  const { code, expiresAt } = linkCodes.issue(admin.email);
  res.json({ code, expires_at: new Date(expiresAt).toISOString() });
});

// ── Unlink the Teams ID from the current admin ──────────────────────────────
router.post('/unlink-teams', requireJwt, async (req, res) => {
  await fileStore.update('admins', (data) => {
    const a = (data.admins ?? []).find(x => x.email?.toLowerCase() === req.admin.email?.toLowerCase());
    if (a) a.teams_user_id = '';
    return data;
  });
  res.json({ ok: true });
});

// ── Claim a code (called by the bot when user types "link XXXXXX") ──────────
// This is an internal route — protected by BOT_PROACTIVE_SECRET.
router.post('/link-claim', async (req, res) => {
  const { code, teamsUserId, secret } = req.body ?? {};
  if (secret !== process.env.BOT_PROACTIVE_SECRET) return res.status(403).json({ error: 'Forbidden' });
  if (!code || !teamsUserId) return res.status(400).json({ error: 'code and teamsUserId are required' });

  const adminEmail = linkCodes.claim(String(code).trim());
  if (!adminEmail) return res.status(404).json({ error: 'Invalid or expired code' });

  let result = null;
  await fileStore.update('admins', (data) => {
    // Clear teams_user_id from any other admin that has it (avoid collisions)
    for (const a of data.admins ?? []) {
      if (a.teams_user_id === teamsUserId && a.email?.toLowerCase() !== adminEmail.toLowerCase()) {
        a.teams_user_id = '';
      }
    }
    const a = (data.admins ?? []).find(x => x.email?.toLowerCase() === adminEmail.toLowerCase());
    if (a) { a.teams_user_id = teamsUserId; result = a; }
    return data;
  });
  if (!result) return res.status(404).json({ error: 'Admin no longer exists' });
  return res.json({ ok: true, email: result.email, name: result.name });
});

export default router;
