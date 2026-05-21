import { Router } from 'express';
import jwt from 'jsonwebtoken';
import * as fileStore from '../services/fileStore.js';
import * as emailNotifier from '../services/emailNotifier.js';
import * as teamsNotifier from '../services/teamsNotifier.js';
import { requireJwt } from '../middleware/auth.js';
import { approveSuggestion, rejectSuggestion } from '../services/commandHandler.js';

const router = Router();

// Used tokens registry (in-memory — restart resets, acceptable for 7-day tokens)
const usedTokens = new Set();

// POST /api/suggestions — public (called by bot)
router.post('/suggestions', async (req, res) => {
  const suggestion = req.body;
  if (!suggestion.type || !suggestion.submitted_by?.teams_user_id) {
    return res.status(400).json({ error: 'type and submitted_by.teams_user_id are required' });
  }
  try {
    const { admins } = fileStore.read('admins');
    await fileStore.update('suggestions', data => {
      suggestion.id = `S-${String(data.next_id).padStart(3, '0')}`;
      suggestion.created_at = new Date().toISOString();
      suggestion.status = 'pending';
      suggestion.reviewed_by = null;
      suggestion.reviewed_at = null;
      suggestion.review_reason = null;
      suggestion.applied = false;
      data.suggestions.push(suggestion);
      data.next_id++;
    });
    emailNotifier.sendSuggestionAlert(suggestion, admins).catch(console.error);
    teamsNotifier.notifyAdminsOfSuggestion(suggestion, admins).catch(console.error);
    return res.json({ ok: true, id: suggestion.id });
  } catch (err) {
    console.error('POST /suggestions error:', err);
    return res.status(500).json({ error: 'Failed to save suggestion' });
  }
});

// GET /api/suggestions — JWT required
router.get('/suggestions', requireJwt, (req, res) => {
  const { status, type, submitter } = req.query;
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const limit = Math.min(100, parseInt(req.query.limit) || 20);

  let { suggestions } = fileStore.read('suggestions');
  suggestions = [...suggestions].reverse();
  if (status) suggestions = suggestions.filter(s => s.status === status);
  if (type) suggestions = suggestions.filter(s => s.type === type);
  if (submitter) suggestions = suggestions.filter(s =>
    (s.submitted_by?.name ?? '').toLowerCase().includes(submitter.toLowerCase()) ||
    (s.submitted_by?.email ?? '').toLowerCase().includes(submitter.toLowerCase())
  );

  const total = suggestions.length;
  const items = suggestions.slice((page - 1) * limit, page * limit);
  return res.json({ suggestions: items, total, page, pages: Math.ceil(total / limit) || 1 });
});

// GET /api/suggestions/count — JWT required
router.get('/suggestions/count', requireJwt, (req, res) => {
  const { status } = req.query;
  let { suggestions } = fileStore.read('suggestions');
  if (status) suggestions = suggestions.filter(s => s.status === status);
  return res.json({ count: suggestions.length });
});

// GET /api/suggestions/quick/:token — public one-click email action
router.get('/suggestions/quick/:token', async (req, res) => {
  const { token } = req.params;
  if (usedTokens.has(token)) {
    return res.send(htmlPage('Already processed', 'This action has already been taken. No changes were made.'));
  }
  let payload;
  try {
    payload = jwt.verify(token, process.env.JWT_SECRET || 'replace-me');
  } catch {
    return res.status(400).send(htmlPage('Link expired', 'This link has expired or is invalid.'));
  }
  const { suggestionId, action, adminEmail } = payload;
  const reviewerAdmin = fileStore.read('admins').admins.find(a => a.email === adminEmail);
  if (!reviewerAdmin) return res.status(403).send(htmlPage('Not authorised', 'Admin account not found.'));

  usedTokens.add(token); // mark single-use before executing
  const reviewer = { email: reviewerAdmin.email, name: reviewerAdmin.name };
  let result;
  if (action === 'approve') result = await approveSuggestion(suggestionId, reviewer);
  else if (action === 'reject') result = await rejectSuggestion(suggestionId, reviewer, 'Rejected via email link');
  else return res.status(400).send(htmlPage('Invalid action', 'Unknown action in link.'));

  if (!result.ok) {
    usedTokens.delete(token); // allow retry if already-approved etc.
    return res.send(htmlPage('Nothing to do', result.message));
  }
  return res.send(htmlPage(
    action === 'approve' ? '✅ Approved' : '❌ Rejected',
    `Suggestion **${suggestionId}** has been ${action}d. The submitter has been notified.`
  ));
});

// GET /api/suggestions/:id — JWT required
router.get('/suggestions/:id', requireJwt, (req, res) => {
  const { suggestions } = fileStore.read('suggestions');
  const s = suggestions.find(s => s.id === req.params.id);
  if (!s) return res.status(404).json({ error: 'Not found' });
  return res.json(s);
});

// POST /api/suggestions/:id/approve — JWT required
router.post('/suggestions/:id/approve', requireJwt, async (req, res) => {
  const reviewer = { email: req.admin.email, name: req.admin.name ?? req.admin.email };
  const result = await approveSuggestion(req.params.id, reviewer);
  return res.status(result.ok ? 200 : 400).json(result);
});

// POST /api/suggestions/:id/reject — JWT required
router.post('/suggestions/:id/reject', requireJwt, async (req, res) => {
  const { reason = '' } = req.body;
  const reviewer = { email: req.admin.email, name: req.admin.name ?? req.admin.email };
  const result = await rejectSuggestion(req.params.id, reviewer, reason);
  return res.status(result.ok ? 200 : 400).json(result);
});

function htmlPage(title, body) {
  return `<!doctype html><html><head><title>${title}</title>
  <style>body{font-family:sans-serif;max-width:500px;margin:80px auto;color:#1F1F1F}
  h1{color:#0F6E56}</style></head><body>
  <h1>${title}</h1><p>${body}</p>
  <p><a href="${process.env.ADMIN_PANEL_URL || 'http://localhost:5173'}/suggestions">Open admin panel</a></p>
  </body></html>`;
}

export default router;
