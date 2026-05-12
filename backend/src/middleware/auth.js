import jwt from 'jsonwebtoken';

export function requireJwt(req, res, next) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return res.status(401).json({ error: 'Missing Authorization header' });
  try {
    req.admin = jwt.verify(header.slice(7), process.env.JWT_SECRET || 'replace-me');
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}
