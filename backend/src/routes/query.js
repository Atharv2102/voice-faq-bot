import { Router } from 'express';
import * as fileStore from '../services/fileStore.js';
import * as excelLogger from '../services/excelLogger.js';
import * as conversationStore from '../services/conversationStore.js';
import { findBestMatchSemantic, getNearMatches } from '../services/semanticMatcher.js';
import * as access from '../services/access.js';

const router = Router();

router.post('/query', async (req, res) => {
  const { text, teamsUserId, userEmail, userName, conversationReference } = req.body;
  if (!text) return res.status(400).json({ error: 'text is required' });

  if (conversationReference && teamsUserId) conversationStore.store(teamsUserId, conversationReference);

  // Allowlist gate — same as the command dispatcher uses
  const role = access.getRole(teamsUserId, userEmail);
  if (role === null) {
    return res.json({
      answered: false,
      message: "You don't have access to this FAQ bot yet. Please ask your admin to add you to the allowed users list.",
    });
  }

  const { questions } = fileStore.read('faqs');
  const match = await findBestMatchSemantic(questions, text);

  excelLogger.appendQueryLog({
    user_email: userEmail ?? '',
    user_name: userName ?? '',
    query: text,
    matched_faq_id: match?.faq.id ?? null,
    confidence: match ? Math.round(match.score * 100) / 100 : null,
    answered: !!match,
  }).catch(console.error);

  if (!match) {
    // Show the closest near-misses (below the confidence cutoff) so the user knows
    // we *almost* matched something and can refine their question.
    const near = getNearMatches(questions, text, 3);
    let msg = "Sorry, I couldn't find a confident answer to that question.";
    if (near.length) {
      const lines = near.map((r, i) => `  ${i + 1}. "${r.faq.question}"  _(${Math.round(r.score * 100)}% match)_`);
      msg += `\n\nClosest matches in my knowledge base:\n${lines.join('\n')}\n\nIf one of those is what you meant, ask it that way. Otherwise you can suggest a new FAQ:\n\`suggest adding <question> with answer <answer>\``;
    } else {
      msg += `\n\nI couldn't find any related FAQs. You can suggest a new one:\n\`suggest adding <question> with answer <answer>\``;
    }
    return res.json({ answered: false, message: msg, near_matches: near.map(r => ({ id: r.faq.id, question: r.faq.question, score: r.score })) });
  }

  const pct = Math.round(match.score * 100);
  const answer = `${match.faq.answer}\n\n_(matched "${match.faq.question}" · ${pct}% confidence)_`;
  return res.json({ answered: true, answer, question: match.faq.question, confidence: match.score });
});

export default router;
