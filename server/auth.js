import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { User } from './models.js';

// Wraps async handlers so any error becomes a clean JSON message.
export const h = fn => (req, res) => fn(req, res).catch(e =>
  res.status(400).json({ error: e.code === 11000 ? 'That value already exists.' : e.message }));

export const login = h(async (req, res) => {
  const { email = '', password = '' } = req.body;
  const u = await User.findOne({ email: email.toLowerCase() });
  if (!u || !(await bcrypt.compare(password, u.password)))
    return res.status(401).json({ error: 'Wrong email or password.' });
  const token = jwt.sign({ id: u._id, name: u.name }, process.env.JWT_SECRET, { expiresIn: '12h' });
  res.json({ token, name: u.name });
});

export function auth(req, res, next) {
  try {
    req.user = jwt.verify((req.headers.authorization || '').replace('Bearer ', ''), process.env.JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Please log in.' });
  }
}
