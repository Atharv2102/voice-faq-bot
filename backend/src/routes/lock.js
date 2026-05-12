import { Router } from 'express';
import * as lockManager from '../services/lockManager.js';
import { requireJwt } from '../middleware/auth.js';

const router = Router();

router.post('/lock/:id', requireJwt, (req, res) => {
  const result = lockManager.acquire(req.params.id, req.admin.id, req.admin.email);
  if (!result.ok) return res.status(409).json({ error: `Locked by ${result.heldBy}`, expiresAt: result.expiresAt });
  return res.json({ ok: true });
});

router.post('/lock/:id/refresh', requireJwt, (req, res) => {
  const ok = lockManager.refresh(req.params.id, req.admin.id);
  return res.json({ ok });
});

router.delete('/lock/:id', requireJwt, (req, res) => {
  lockManager.release(req.params.id, req.admin.id);
  return res.json({ ok: true });
});

export default router;
