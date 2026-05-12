import { Router } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import * as fileStore from '../services/fileStore.js';

const router = Router();

router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'email and password are required' });

  const { admins } = fileStore.read('admins');
  const admin = admins.find(a => a.email === email && a.active);
  if (!admin?.web_password_hash) return res.status(401).json({ error: 'Invalid credentials' });

  const ok = await bcrypt.compare(password, admin.web_password_hash);
  if (!ok) return res.status(401).json({ error: 'Invalid credentials' });

  const token = jwt.sign(
    { id: admin.teams_user_id, email: admin.email, name: admin.name },
    process.env.JWT_SECRET || 'replace-me',
    { expiresIn: '8h' }
  );
  return res.json({ token });
});

export default router;
