const router = require('express').Router();
const db = require('../db');
const { today, isDate } = require('../lib/util');

router.get('/attendance', (req, res, next) => {
  const date = isDate(req.query.date) && req.query.date <= today() ? req.query.date : today();
  const batchId = Number(req.query.batch) || null;

  if (!batchId) {
    const batches = db.prepare(`
      SELECT b.*, COUNT(s.id) AS students,
        COUNT(a.status) AS marked, COALESCE(SUM(a.status = 'P'), 0) AS present
      FROM batches b
      LEFT JOIN students s ON s.batch_id = b.id AND s.active = 1
      LEFT JOIN attendance a ON a.student_id = s.id AND a.date = ?
      GROUP BY b.id ORDER BY b.class, b.division
    `).all(date);
    return res.render('attendance', { title: 'Attendance', date, batches, batch: null });
  }

  const batch = db.prepare('SELECT * FROM batches WHERE id = ?').get(batchId);
  if (!batch) return next();
  const students = db.prepare(`
    SELECT s.id, s.name, s.roll_no, a.status FROM students s
    LEFT JOIN attendance a ON a.student_id = s.id AND a.date = ?
    WHERE s.batch_id = ? AND s.active = 1 AND s.join_date <= ?
    ORDER BY CAST(s.roll_no AS INTEGER), s.roll_no, s.name
  `).all(date, batchId, date);
  const marked = students.some((s) => s.status);
  res.render('attendance', { title: 'Attendance', date, batch, students, marked });
});

router.post('/attendance', (req, res) => {
  const date = req.body.date;
  const batchId = Number(req.body.batch_id);
  if (!isDate(date) || date > today()) {
    req.flash('error', 'Invalid date.');
    return res.redirect('/attendance');
  }
  const ids = [].concat(req.body.student_ids || []).map(Number);
  const absent = new Set([].concat(req.body.absent || []).map(Number));
  const valid = new Set(db.prepare('SELECT id FROM students WHERE batch_id = ?').all(batchId).map((r) => r.id));

  const upsert = db.prepare(`
    INSERT INTO attendance (student_id, date, status) VALUES (?, ?, ?)
    ON CONFLICT (student_id, date) DO UPDATE SET status = excluded.status
  `);
  db.transaction(() => {
    for (const id of ids) if (valid.has(id)) upsert.run(id, date, absent.has(id) ? 'A' : 'P');
  })();

  const presentCount = ids.filter((id) => valid.has(id) && !absent.has(id)).length;
  req.flash('ok', `Attendance saved: ${presentCount} present, ${ids.length - presentCount} absent.`);
  res.redirect(`/attendance?date=${date}`);
});

module.exports = router;
