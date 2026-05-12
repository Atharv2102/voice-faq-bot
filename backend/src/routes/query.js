import { Router } from 'express';
import * as fileStore from '../services/fileStore.js';
import * as excelLogger from '../services/excelLogger.js';
import * as conversationStore from '../services/conversationStore.js';
import { findBestMatch } from '../services/matcher.js';

const router = Router();

router.post('/query', async (req, res) => {
  const { text, teamsUserId, userEmail, userName, conversationReference } = req.body;
  if (!text) return res.status(400).json({ error: 'text is required' });

  if (conversationReference && teamsUserId) conversationStore.store(teamsUserId, conversationReference);

  const { questions } = fileStore.read('faqs');
  const match = findBestMatch(questions, text);

  excelLogger.appendQueryLog({
    user_email: userEmail ?? '',
    user_name: userName ?? '',
    query: text,
    matched_faq_id: match?.faq.id ?? null,
    confidence: match ? Math.round(match.score * 100) / 100 : null,
    answered: !!match,
  }).catch(console.error);

  if (!match) {
    return res.json({ answered: false, message: "Sorry, I couldn't find an answer to that question. You can suggest a new FAQ by saying \"suggest adding <question> with answer <answer>\"." });
  }

  return res.json({ answered: true, answer: match.faq.answer, question: match.faq.question, confidence: match.score });
});

export default router;
