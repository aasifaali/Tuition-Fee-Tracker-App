const router = require('express').Router();
const bcrypt = require('bcryptjs');
const db = require('../db');

router.get('/settings', (req, res) => {
  const batches = db.prepare('SELECT * FROM batches ORDER BY class, division').all();
  res.render('settings', { title: 'Settings', batches });
});

router.post('/settings/center', (req, res) => {
  const set = db.prepare('UPDATE settings SET value = ? WHERE key = ?');
  for (const key of ['center_name', 'center_address', 'center_phone']) set.run((req.body[key] || '').trim(), key);
  req.flash('ok', 'Center details saved.');
  res.redirect('/settings');
});

// New fees apply from the next month generated; already billed months keep their amount.
router.post('/settings/fees', (req, res) => {
  const update = db.prepare('UPDATE batches SET monthly_fee = ? WHERE id = ?');
  db.transaction(() => {
    for (const b of db.prepare('SELECT id FROM batches').all()) {
      const fee = Number(req.body[`fee_${b.id}`]);
      if (Number.isInteger(fee) && fee >= 0) update.run(fee, b.id);
    }
  })();
  req.flash('ok', 'Fees updated. New amounts apply from the next billing month.');
  res.redirect('/settings');
});

router.post('/settings/password', (req, res) => {
  const { current = '', next: newPassword = '', confirm = '' } = req.body;
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.session.user.id);
  if (!bcrypt.compareSync(current, user.password_hash)) {
    req.flash('error', 'Current password is wrong.');
  } else if (newPassword.length < 8) {
    req.flash('error', 'New password must be at least 8 characters.');
  } else if (newPassword !== confirm) {
    req.flash('error', 'New passwords do not match.');
  } else {
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(bcrypt.hashSync(newPassword, 10), user.id);
    req.flash('ok', 'Password changed.');
  }
  res.redirect('/settings');
});

module.exports = router;
