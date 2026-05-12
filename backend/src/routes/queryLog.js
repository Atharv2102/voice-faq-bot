import { Router } from 'express';
import * as excelLogger from '../services/excelLogger.js';
import { requireJwt } from '../middleware/auth.js';

const router = Router();

router.get('/query-log', requireJwt, async (req, res) => {
  const { answered, from, to, limit } = req.query;
  const answeredBool = answered === undefined ? undefined : answered === 'true';
  const rows = await excelLogger.readQueryLog({ answered: answeredBool, from, to, limit: limit ? parseInt(limit) : 100 });
  return res.json({ logs: rows, total: rows.length });
});

export default router;
