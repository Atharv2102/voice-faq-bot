import { Router } from 'express';
import * as fileStore from '../services/fileStore.js';

const router = Router();

router.get('/health', (req, res) => {
  try {
    const { questions } = fileStore.read('faqs');
    const { admins } = fileStore.read('admins');
    const { suggestions } = fileStore.read('suggestions');
    return res.json({
      ok: true,
      faqCount: questions.filter(q => q.active).length,
      adminCount: admins.filter(a => a.active).length,
      pendingSuggestions: suggestions.filter(s => s.status === 'pending').length,
    });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
});

export default router;
