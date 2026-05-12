import { Router } from 'express';
import axios from 'axios';
import * as conversationStore from '../services/conversationStore.js';

const router = Router();

// Called by backend internally to ask the bot to proactively message a user.
router.post('/bot/notify', async (req, res) => {
  const { teamsUserId, message, secret } = req.body;
  if (secret !== process.env.BOT_PROACTIVE_SECRET) return res.status(403).json({ error: 'Forbidden' });
  if (!teamsUserId || !message) return res.status(400).json({ error: 'teamsUserId and message are required' });

  const botUrl = process.env.BOT_URL || 'http://localhost:3978';
  try {
    await axios.post(`${botUrl}/api/proactive`, { teamsUserId, message, secret });
    return res.json({ ok: true });
  } catch (err) {
    console.error('Bot proactive relay failed:', err.message);
    return res.status(502).json({ ok: false, error: err.message });
  }
});

export default router;
