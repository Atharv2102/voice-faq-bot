import { Router } from 'express';
import { handle } from '../services/commandHandler.js';

const router = Router();

router.post('/admin-command', async (req, res) => {
  const { text, teamsUserId, userEmail, userName, conversationReference } = req.body;
  if (!text || !teamsUserId) return res.status(400).json({ error: 'text and teamsUserId are required' });
  try {
    const result = await handle({ text, teamsUserId, userEmail, userName, conversationReference });
    return res.json(result);
  } catch (err) {
    console.error('admin-command error:', err);
    return res.status(500).json({ type: 'error', message: 'Internal error processing command.' });
  }
});

export default router;
