/**
 * Allowlist management for read-only FAQ users.
 * All routes here require admin JWT.
 */
import { Router } from 'express';
import * as fileStore from '../services/fileStore.js';
import * as access from '../services/access.js';
import { requireJwt } from '../middleware/auth.js';

const router = Router();

function requireAdmin(req, res, next) {
  // Look up role by email (since JWT.id may be empty for web-only admins)
  const { admins = [] } = fileStore.read('admins');
  const a = admins.find(x => x.email?.toLowerCase() === req.admin.email?.toLowerCase() && x.active);
  if (!a || (a.role && a.role.toLowerCase() !== 'admin')) {
    return res.status(403).json({ error: 'Admin role required' });
  }
  next();
}

// List all allowlisted users
router.get('/users', requireJwt, requireAdmin, (req, res) => {
  const { users = [] } = fileStore.read('users');
  res.json({ users });
});

// Add a new allowlisted user (email is the identifier; teams_user_id auto-populates on first message)
router.post('/users', requireJwt, requireAdmin, async (req, res) => {
  const { email, name, teams_user_id } = req.body ?? {};
  if (!email || !name) return res.status(400).json({ error: 'email and name are required' });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'Invalid email format' });

  let duplicate = false;
  await fileStore.update('users', (data) => {
    const users = data.users ?? [];
    if (users.find(u => u.email?.toLowerCase() === email.toLowerCase())) { duplicate = true; return data; }
    data.users = [...users, {
      email: email.toLowerCase(),
      name,
      teams_user_id: teams_user_id ?? '',  // optional; will be set automatically on first contact
      active: true,
      created_at: new Date().toISOString(),
      created_by: req.admin.email,
    }];
    return data;
  });
  if (duplicate) return res.status(409).json({ error: 'A user with this email already exists' });
  res.status(201).json({ ok: true });
});

// Toggle active / update fields — identified by email
router.patch('/users/:email', requireJwt, requireAdmin, async (req, res) => {
  const target = decodeURIComponent(req.params.email).toLowerCase();
  const updates = req.body ?? {};
  let found = false;
  await fileStore.update('users', (data) => {
    const u = (data.users ?? []).find(x => x.email?.toLowerCase() === target);
    if (!u) return data;
    found = true;
    if ('active' in updates) u.active = !!updates.active;
    if ('name' in updates) u.name = String(updates.name);
    if ('teams_user_id' in updates) u.teams_user_id = String(updates.teams_user_id);
    return data;
  });
  if (!found) return res.status(404).json({ error: 'User not found' });
  res.json({ ok: true });
});

router.delete('/users/:email', requireJwt, requireAdmin, async (req, res) => {
  const target = decodeURIComponent(req.params.email).toLowerCase();
  let removed = false;
  await fileStore.update('users', (data) => {
    const before = (data.users ?? []).length;
    data.users = (data.users ?? []).filter(u => u.email?.toLowerCase() !== target);
    removed = data.users.length < before;
    return data;
  });
  if (!removed) return res.status(404).json({ error: 'User not found' });
  res.json({ ok: true });
});

// ── Admin roster management (same admin-only auth) ───────────────────────────
// Used by the panel to list other admins/LT and toggle their role/active flag.

router.get('/roster', requireJwt, requireAdmin, (req, res) => {
  const { admins = [] } = fileStore.read('admins');
  res.json({
    admins: admins.map(a => ({
      email: a.email, name: a.name,
      role: (a.role || 'admin').toLowerCase(),
      teams_user_id: a.teams_user_id || '',
      active: !!a.active,
      created_at: a.created_at || null,
    })),
  });
});

router.patch('/roster/:email', requireJwt, requireAdmin, async (req, res) => {
  const target = req.params.email.toLowerCase();
  const updates = req.body ?? {};
  let found = false;
  await fileStore.update('admins', (data) => {
    const a = (data.admins ?? []).find(x => x.email?.toLowerCase() === target);
    if (!a) return data;
    found = true;
    if ('role' in updates) {
      const r = String(updates.role).toLowerCase();
      if (['admin', 'lt'].includes(r)) a.role = r;
    }
    if ('active' in updates) a.active = !!updates.active;
    return data;
  });
  if (!found) return res.status(404).json({ error: 'Admin not found' });
  res.json({ ok: true });
});

export default router;
