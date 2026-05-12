import { Router } from 'express';
import { confirm } from '../services/commandHandler.js';

const router = Router();

router.post('/admin-confirm', async (req, res) => {
  const { teamsUserId, response } = req.body;
  if (!teamsUserId || !response) return res.status(400).json({ error: 'teamsUserId and response are required' });
  try {
    const result = await confirm({ teamsUserId, response });
    return res.json(result);
  } catch (err) {
    console.error('admin-confirm error:', err);
    return res.status(500).json({ type: 'error', message: 'Internal error processing confirmation.' });
  }
});

export default router;
