process.env.TZ = process.env.TZ || 'Asia/Kolkata';

const path = require('path');
const express = require('express');
const cookieSession = require('cookie-session');
const db = require('./db');
const fees = require('./lib/fees');
const util = require('./lib/util');

const app = express();
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.set('trust proxy', 1);
app.disable('x-powered-by');

app.use(express.static(path.join(__dirname, 'public'), { maxAge: '1d' }));
app.use(express.urlencoded({ extended: false }));
app.use(cookieSession({
  name: 'tft',
  keys: [process.env.SESSION_SECRET || db.getSettings().session_secret],
  maxAge: 30 * 24 * 60 * 60 * 1000,
  httpOnly: true,
  sameSite: 'lax',
  secure: process.env.COOKIE_SECURE === '1',
}));

app.use((req, res, next) => {
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'same-origin');
  // Reject cross-site form posts.
  if (req.method === 'POST' && req.headers.origin && req.headers.origin !== 'null') {
    let host = null;
    try { host = new URL(req.headers.origin).host; } catch {}
    if (host !== req.headers.host) return res.status(403).send('Forbidden');
  }
  next();
});

app.use((req, res, next) => {
  res.locals.u = util;
  res.locals.user = req.session.user || null;
  res.locals.path = req.path;
  res.locals.flash = req.session.flash || null;
  res.locals.settings = db.getSettings();
  delete req.session.flash;
  req.flash = (type, text) => { req.session.flash = { type, text }; };
  next();
});

app.use(require('./routes/auth'));

app.use((req, res, next) => {
  if (!req.session.user) return res.redirect('/login');
  fees.ensureDuesThisMonth();
  next();
});

app.use(require('./routes/dashboard'));
app.use(require('./routes/students'));
app.use(require('./routes/collect'));
app.use(require('./routes/attendance'));
app.use(require('./routes/reports'));
app.use(require('./routes/settings'));

app.use((req, res) => res.status(404).render('error', { title: 'Not found', message: 'That page does not exist.' }));
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).render('error', { title: 'Error', message: 'Something went wrong. Please try again.' });
});

const port = process.env.PORT || 3000;
const host = process.env.HOST || '127.0.0.1';
app.listen(port, host, () => console.log(`Tuition Fee Tracker running on http://${host}:${port}`));
