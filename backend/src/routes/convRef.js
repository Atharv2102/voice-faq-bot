import { Router } from 'express';
import * as conversationStore from '../services/conversationStore.js';

const router = Router();

// Used by the bot's proactive endpoint to fetch conversation references
router.get('/conv-ref/:teamsUserId', (req, res) => {
  const ref = conversationStore.get(req.params.teamsUserId);
  if (!ref) return res.status(404).json({ error: 'Not found' });
  return res.json({ ref });
});

export default router;
