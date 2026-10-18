const router = require('express').Router();
const bcrypt = require('bcryptjs');
const db = require('../db');

// Simple in-memory brute-force guard: 10 failed attempts locks the IP for 15 minutes.
const attempts = new Map();
const MAX_ATTEMPTS = 10;
const LOCK_MS = 15 * 60 * 1000;

router.get('/login', (req, res) => {
  if (req.session.user) return res.redirect('/');
  res.render('login', { title: 'Login', error: null });
});

router.post('/login', (req, res) => {
  const key = req.ip;
  const entry = attempts.get(key);
  if (entry && entry.count >= MAX_ATTEMPTS && Date.now() - entry.last < LOCK_MS) {
    return res.status(429).render('login', { title: 'Login', error: 'Too many attempts. Try again in 15 minutes.' });
  }

  const { username = '', password = '' } = req.body;
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username.trim());
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    const count = entry && Date.now() - entry.last < LOCK_MS ? entry.count + 1 : 1;
    attempts.set(key, { count, last: Date.now() });
    return res.status(401).render('login', { title: 'Login', error: 'Wrong username or password.' });
  }

  attempts.delete(key);
  req.session.user = { id: user.id, username: user.username };
  res.redirect('/');
});

router.post('/logout', (req, res) => {
  req.session = null;
  res.redirect('/login');
});

module.exports = router;
