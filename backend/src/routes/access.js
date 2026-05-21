/**
 * Unified access management — one endpoint per CRUD op covering all three roles
 * (admin, lt, user). Behind the scenes:
 *   - role = 'admin' or 'lt' → stored in admins.json (web login possible)
 *   - role = 'user'          → stored in users.json (chat read-only)
 *
 * Promoting/demoting across the admin↔user boundary moves the entry between
 * files transparently to the caller.
 *
 * All endpoints require role='admin'.
 */

import { Router } from 'express';
import bcrypt from 'bcrypt';
import * as fileStore from '../services/fileStore.js';
import { requireJwt } from '../middleware/auth.js';

const router = Router();

function requireAdmin(req, res, next) {
  const { admins = [] } = fileStore.read('admins');
  const a = admins.find(x => x.email?.toLowerCase() === req.admin.email?.toLowerCase() && x.active);
  if (!a || (a.role || 'admin').toLowerCase() !== 'admin') {
    return res.status(403).json({ error: 'Admin role required' });
  }
  next();
}

function norm(s) { return (s || '').toLowerCase().trim(); }

// ── GET /api/access — full roster ────────────────────────────────────────────
router.get('/access', requireJwt, requireAdmin, (req, res) => {
  const { admins = [] } = fileStore.read('admins');
  const { users = [] } = fileStore.read('users');

  const rows = [
    ...admins.map(a => ({
      email: a.email,
      name: a.name,
      role: (a.role || 'admin').toLowerCase(),
      teams_user_id: a.teams_user_id || '',
      active: !!a.active,
      has_web_login: !!a.web_password_hash,
      created_at: a.created_at || null,
    })),
    ...users.map(u => ({
      email: u.email,
      name: u.name,
      role: 'user',
      teams_user_id: u.teams_user_id || '',
      active: !!u.active,
      has_web_login: false,
      created_at: u.created_at || null,
    })),
  ];

  rows.sort((a, b) => {
    const order = { admin: 0, lt: 1, user: 2 };
    if (order[a.role] !== order[b.role]) return order[a.role] - order[b.role];
    return a.name.localeCompare(b.name);
  });

  res.json({ users: rows });
});

// ── POST /api/access — add a new person ──────────────────────────────────────
router.post('/access', requireJwt, requireAdmin, async (req, res) => {
  const { email, name, role = 'user', password } = req.body ?? {};
  if (!email || !name) return res.status(400).json({ error: 'email and name are required' });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'Invalid email format' });
  if (!['admin', 'lt', 'user'].includes(role)) return res.status(400).json({ error: 'role must be admin, lt, or user' });
  if (role === 'admin' && (!password || password.length < 8)) {
    return res.status(400).json({ error: 'A password (8+ chars) is required when creating an admin' });
  }

  const em = norm(email);
  // Reject duplicates anywhere
  const { admins = [] } = fileStore.read('admins');
  const { users = [] }  = fileStore.read('users');
  if (admins.some(a => norm(a.email) === em) || users.some(u => norm(u.email) === em)) {
    return res.status(409).json({ error: 'A user with this email already exists' });
  }

  if (role === 'admin' || role === 'lt') {
    const hash = role === 'admin' ? await bcrypt.hash(password, 10) : '';
    await fileStore.update('admins', (data) => {
      data.admins = [...(data.admins ?? []), {
        email: em, name, role,
        teams_user_id: '',
        web_password_hash: hash,
        notifications_enabled: true,
        active: true,
        created_at: new Date().toISOString(),
        created_by: req.admin.email,
      }];
      return data;
    });
  } else {
    await fileStore.update('users', (data) => {
      data.users = [...(data.users ?? []), {
        email: em, name,
        teams_user_id: '',
        active: true,
        created_at: new Date().toISOString(),
        created_by: req.admin.email,
      }];
      return data;
    });
  }

  res.status(201).json({ ok: true });
});

// ── PATCH /api/access/:email — change role / toggle active / set password ────
router.patch('/access/:email', requireJwt, requireAdmin, async (req, res) => {
  const target = norm(decodeURIComponent(req.params.email));
  const { role, active, password } = req.body ?? {};

  if (role && !['admin', 'lt', 'user'].includes(role)) {
    return res.status(400).json({ error: 'role must be admin, lt, or user' });
  }

  // Find where the entry currently lives
  const { admins = [] } = fileStore.read('admins');
  const { users = [] } = fileStore.read('users');
  const inAdmins = admins.find(a => norm(a.email) === target);
  const inUsers  = users.find(u => norm(u.email) === target);
  if (!inAdmins && !inUsers) return res.status(404).json({ error: 'User not found' });

  const currentRole = inAdmins ? (inAdmins.role || 'admin').toLowerCase() : 'user';
  const nextRole = role ? role.toLowerCase() : currentRole;

  // Promotion to admin from a user (no existing password) requires one
  const needsPassword = nextRole === 'admin' && !inAdmins?.web_password_hash && !password;
  if (needsPassword) {
    return res.status(400).json({ error: 'A password (8+ chars) is required when promoting to admin for the first time' });
  }
  if (password && password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters' });
  }

  // Case 1: same side of the admin↔user boundary
  const wasAdminSide = currentRole !== 'user';
  const isAdminSide  = nextRole !== 'user';

  if (wasAdminSide && isAdminSide) {
    await fileStore.update('admins', (data) => {
      const a = (data.admins ?? []).find(x => norm(x.email) === target);
      if (!a) return data;
      if (role) a.role = nextRole;
      if (typeof active === 'boolean') a.active = active;
      if (password) a.web_password_hash = bcrypt.hashSync(password, 10);
      return data;
    });
    return res.json({ ok: true });
  }

  if (!wasAdminSide && !isAdminSide) {
    await fileStore.update('users', (data) => {
      const u = (data.users ?? []).find(x => norm(x.email) === target);
      if (u && typeof active === 'boolean') u.active = active;
      return data;
    });
    return res.json({ ok: true });
  }

  // Case 2: crossing the boundary — move the entry
  if (wasAdminSide && !isAdminSide) {
    // admin/lt → user
    const moved = { ...inAdmins };
    await fileStore.update('admins', (data) => {
      data.admins = (data.admins ?? []).filter(x => norm(x.email) !== target);
      return data;
    });
    await fileStore.update('users', (data) => {
      data.users = [...(data.users ?? []), {
        email: moved.email,
        name: moved.name,
        teams_user_id: moved.teams_user_id || '',
        active: typeof active === 'boolean' ? active : !!moved.active,
        created_at: moved.created_at || new Date().toISOString(),
        created_by: req.admin.email,
      }];
      return data;
    });
    return res.json({ ok: true });
  }

  // user → admin/lt
  const moved = { ...inUsers };
  const hash = nextRole === 'admin' ? bcrypt.hashSync(password, 10) : '';
  await fileStore.update('users', (data) => {
    data.users = (data.users ?? []).filter(x => norm(x.email) !== target);
    return data;
  });
  await fileStore.update('admins', (data) => {
    data.admins = [...(data.admins ?? []), {
      email: moved.email,
      name: moved.name,
      role: nextRole,
      teams_user_id: moved.teams_user_id || '',
      web_password_hash: hash,
      notifications_enabled: true,
      active: typeof active === 'boolean' ? active : !!moved.active,
      created_at: moved.created_at || new Date().toISOString(),
      created_by: req.admin.email,
    }];
    return data;
  });
  return res.json({ ok: true });
});

// ── DELETE /api/access/:email ─────────────────────────────────────────────────
router.delete('/access/:email', requireJwt, requireAdmin, async (req, res) => {
  const target = norm(decodeURIComponent(req.params.email));
  let removed = false;
  await fileStore.update('admins', (data) => {
    const before = (data.admins ?? []).length;
    data.admins = (data.admins ?? []).filter(x => norm(x.email) !== target);
    if (data.admins.length < before) removed = true;
    return data;
  });
  await fileStore.update('users', (data) => {
    const before = (data.users ?? []).length;
    data.users = (data.users ?? []).filter(x => norm(x.email) !== target);
    if (data.users.length < before) removed = true;
    return data;
  });
  if (!removed) return res.status(404).json({ error: 'User not found' });
  res.json({ ok: true });
});

export default router;
