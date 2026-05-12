import { Router } from 'express';
import multer from 'multer';
import { parse } from 'csv-parse/sync';
import * as fileStore from '../services/fileStore.js';
import * as excelLogger from '../services/excelLogger.js';
import { requireJwt } from '../middleware/auth.js';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

router.post('/bulk-import', requireJwt, upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  const mode = req.body.mode === 'replace' ? 'replace' : 'merge'; // merge (default) or replace

  const content = req.file.buffer.toString('utf-8');
  let rows = [];
  try {
    if (req.file.originalname.endsWith('.json') || req.file.mimetype === 'application/json') {
      const parsed = JSON.parse(content);
      rows = Array.isArray(parsed) ? parsed : [parsed];
    } else {
      rows = parse(content, { columns: true, skip_empty_lines: true, trim: true });
    }
  } catch (err) {
    return res.status(400).json({ error: `Parse error: ${err.message}` });
  }

  const existing = fileStore.read('faqs');
  const existingQuestions = mode === 'replace' ? [] : [...existing.questions];
  let added = 0, skipped = 0;
  const errors = [];

  for (const [i, row] of rows.entries()) {
    const question = row.question || row.question_text;
    const answer = row.answer || row.answer_text;
    const category = row.category || 'General';
    const alternates = row.alternates ? String(row.alternates).split('|').map(s => s.trim()) : [];
    if (!question || !answer) { errors.push(`Row ${i + 1}: missing question or answer`); skipped++; continue; }
    if (mode === 'merge' && existingQuestions.find(q => q.question.toLowerCase() === question.toLowerCase())) { skipped++; continue; }

    const nums = existingQuestions.map(q => parseInt(q.id.replace('q_', ''))).filter(n => !isNaN(n));
    const id = `q_${String((nums.length ? Math.max(...nums) : 0) + 1).padStart(3, '0')}`;
    existingQuestions.push({ id, question, alternates, answer, category, active: true, created_by: req.admin.email, created_at: new Date().toISOString(), updated_by: req.admin.email, updated_at: new Date().toISOString() });
    added++;
  }

  await fileStore.update('faqs', data => { data.questions = existingQuestions; data.last_updated = new Date().toISOString(); });
  await excelLogger.appendAudit({ actor_name: req.admin.name ?? req.admin.email, actor_email: req.admin.email, action: 'bulk_import', source: 'bulk', notes: `${mode}: added ${added}, skipped ${skipped}` });
  return res.json({ added, skipped, errors, mode });
});

export default router;
