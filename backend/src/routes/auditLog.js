import { Router } from 'express';
import * as excelLogger from '../services/excelLogger.js';
import { requireJwt } from '../middleware/auth.js';

const router = Router();

router.get('/audit-log', requireJwt, async (req, res) => {
  const { from, to, actor, action, source, faqId, limit } = req.query;
  const rows = await excelLogger.readAuditLog({ from, to, actor, action, source, faqId, limit: limit ? parseInt(limit) : 100 });
  return res.json({ logs: rows, total: rows.length });
});

router.get('/audit-log/export', requireJwt, async (req, res) => {
  const file = await excelLogger.exportAuditLog();
  res.download(file, 'audit-log.xlsx');
});

export default router;
