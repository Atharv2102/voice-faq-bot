import { Router } from 'express';
import { randomUUID } from 'crypto';
import * as fileStore from '../services/fileStore.js';
import * as excelLogger from '../services/excelLogger.js';
import * as lockManager from '../services/lockManager.js';
import { requireJwt } from '../middleware/auth.js';

const router = Router();

router.get('/questions', requireJwt, (req, res) => {
  const { search, category, active } = req.query;
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const limit = Math.min(200, parseInt(req.query.limit) || 50);

  let { questions } = fileStore.read('faqs');
  if (search) questions = questions.filter(q => q.question.toLowerCase().includes(search.toLowerCase()) || q.answer.toLowerCase().includes(search.toLowerCase()));
  if (category) questions = questions.filter(q => q.category === category);
  if (active !== undefined) questions = questions.filter(q => q.active === (active === 'true'));

  const total = questions.length;
  const items = questions.slice((page - 1) * limit, page * limit).map(q => ({
    ...q, lock: lockManager.check(q.id),
  }));
  return res.json({ questions: items, total, page, pages: Math.ceil(total / limit) || 1 });
});

router.post('/questions', requireJwt, async (req, res) => {
  const { question, answer, category = 'General', alternates = [] } = req.body;
  if (!question || !answer) return res.status(400).json({ error: 'question and answer are required' });

  const nums = fileStore.read('faqs').questions.map(q => parseInt(q.id.replace('q_', ''))).filter(n => !isNaN(n));
  const id = `q_${String((nums.length ? Math.max(...nums) : 0) + 1).padStart(3, '0')}`;

  const newFaq = { id, question, alternates, answer, category, active: true, created_by: req.admin.email, created_at: new Date().toISOString(), updated_by: req.admin.email, updated_at: new Date().toISOString() };
  await fileStore.update('faqs', data => { data.questions.push(newFaq); data.last_updated = new Date().toISOString(); });

  await excelLogger.appendAudit({ actor_name: req.admin.name ?? req.admin.email, actor_email: req.admin.email, action: 'add', source: 'web', faq_id: id, question_snippet: question, after_answer: answer });
  return res.status(201).json(newFaq);
});

router.put('/questions/:id', requireJwt, async (req, res) => {
  const { id } = req.params;
  const lock = lockManager.check(id);
  if (lock && lock.userId !== req.admin.id) {
    return res.status(409).json({ error: `Locked by ${lock.userEmail}` });
  }

  let before, after;
  await fileStore.update('faqs', data => {
    const faq = data.questions.find(f => f.id === id);
    if (!faq) return;
    before = faq.answer;
    if (req.body.question !== undefined) faq.question = req.body.question;
    if (req.body.answer !== undefined) faq.answer = req.body.answer;
    if (req.body.category !== undefined) faq.category = req.body.category;
    if (req.body.alternates !== undefined) faq.alternates = req.body.alternates;
    if (req.body.active !== undefined) faq.active = req.body.active;
    faq.updated_by = req.admin.email;
    faq.updated_at = new Date().toISOString();
    after = faq.answer;
    data.last_updated = new Date().toISOString();
  });

  const updated = fileStore.read('faqs').questions.find(f => f.id === id);
  if (!updated) return res.status(404).json({ error: 'FAQ not found' });

  await excelLogger.appendAudit({ actor_name: req.admin.name ?? req.admin.email, actor_email: req.admin.email, action: 'update', source: 'web', faq_id: id, question_snippet: updated.question, before_answer: before, after_answer: after });
  lockManager.release(id, req.admin.id);
  return res.json(updated);
});

router.delete('/questions/:id', requireJwt, async (req, res) => {
  const { id } = req.params;
  const hard = req.query.hard === 'true';

  const lock = lockManager.check(id);
  if (lock && lock.userId !== req.admin.id) return res.status(409).json({ error: `Locked by ${lock.userEmail}` });

  let deleted;
  await fileStore.update('faqs', data => {
    const idx = data.questions.findIndex(f => f.id === id);
    if (idx === -1) return;
    if (hard) { [deleted] = data.questions.splice(idx, 1); }
    else { data.questions[idx].active = false; data.questions[idx].updated_by = req.admin.email; data.questions[idx].updated_at = new Date().toISOString(); deleted = data.questions[idx]; }
    data.last_updated = new Date().toISOString();
  });

  if (!deleted) return res.status(404).json({ error: 'FAQ not found' });
  await excelLogger.appendAudit({ actor_name: req.admin.name ?? req.admin.email, actor_email: req.admin.email, action: hard ? 'delete' : 'disable', source: 'web', faq_id: id, question_snippet: deleted.question });
  lockManager.release(id, req.admin.id);
  return res.json({ ok: true });
});

export default router;
