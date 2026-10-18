const router = require('express').Router();
const db = require('../db');
const fees = require('../lib/fees');
const { today, currentMonth, isDate, isMonth, MODES, dateLabel, monthLabel, sendCsv, addMonths } = require('../lib/util');

const getBatches = () => db.prepare('SELECT * FROM batches ORDER BY class, division').all();

router.get('/reports', (req, res) => res.redirect('/reports/collections'));

router.get('/reports/collections', (req, res) => {
  const month = currentMonth();
  const from = isDate(req.query.from) ? req.query.from : `${month}-01`;
  const to = isDate(req.query.to) ? req.query.to : today();
  const batchId = Number(req.query.batch) || null;
  const mode = MODES[req.query.mode] ? req.query.mode : null;

  const where = ['p.paid_on BETWEEN ? AND ?'];
  const params = [from, to];
  if (batchId) { where.push('s.batch_id = ?'); params.push(batchId); }
  if (mode) { where.push('p.mode = ?'); params.push(mode); }

  const rows = db.prepare(`
    SELECT p.*, s.name, s.roll_no, b.class, b.division FROM payments p
    JOIN students s ON s.id = p.student_id JOIN batches b ON b.id = s.batch_id
    WHERE ${where.join(' AND ')} ORDER BY p.paid_on DESC, p.id DESC
  `).all(...params);

  if (req.query.format === 'csv') {
    return sendCsv(res, `collections-${from}-to-${to}.csv`, rows, [
      { label: 'Receipt No', value: (r) => r.receipt_no },
      { label: 'Date', value: (r) => r.paid_on },
      { label: 'Student', value: (r) => r.name },
      { label: 'Class', value: (r) => `${r.class}${r.division}` },
      { label: 'Roll No', value: (r) => r.roll_no },
      { label: 'Amount', value: (r) => r.amount },
      { label: 'Mode', value: (r) => MODES[r.mode] },
      { label: 'Note', value: (r) => r.note },
    ]);
  }

  const total = rows.reduce((s, r) => s + r.amount, 0);
  const modeTotals = Object.keys(MODES).map((m) => ({
    mode: m, total: rows.filter((r) => r.mode === m).reduce((s, r) => s + r.amount, 0),
  })).filter((m) => m.total > 0);

  const presets = [
    { label: 'Today', from: today(), to: today() },
    { label: 'This month', from: `${month}-01`, to: today() },
    { label: 'Last month', from: `${addMonths(month, -1)}-01`, to: `${addMonths(month, -1)}-31` },
  ];

  res.render('reports/collections', {
    title: 'Collections report', rows, total, modeTotals, from, to, batchId, mode, batches: getBatches(), presets,
  });
});

router.get('/reports/dues', (req, res) => {
  const batchId = Number(req.query.batch) || null;
  const rows = fees.balances({ batchId }).filter((r) => r.balance > 0).sort((a, b) => b.balance - a.balance);

  if (req.query.format === 'csv') {
    return sendCsv(res, `pending-dues-${today()}.csv`, rows, [
      { label: 'Student', value: (r) => r.name },
      { label: 'Class', value: (r) => `${r.class}${r.division}` },
      { label: 'Roll No', value: (r) => r.roll_no },
      { label: 'Parent', value: (r) => r.parent_name },
      { label: 'Phone', value: (r) => r.phone },
      { label: 'Monthly Fee', value: (r) => r.fee },
      { label: 'Pending', value: (r) => r.balance },
    ]);
  }

  const total = rows.reduce((s, r) => s + r.balance, 0);
  res.render('reports/dues', { title: 'Pending dues', rows, total, batchId, batches: getBatches() });
});

router.get('/reports/attendance', (req, res) => {
  const batches = getBatches();
  const batchId = Number(req.query.batch) || batches[0].id;
  const month = isMonth(req.query.month) ? req.query.month : currentMonth();
  const batch = batches.find((b) => b.id === batchId) || batches[0];

  const rows = db.prepare(`
    SELECT s.id, s.name, s.roll_no,
      COUNT(a.status) AS total, COALESCE(SUM(a.status = 'P'), 0) AS present,
      GROUP_CONCAT(CASE WHEN a.status = 'A' THEN a.date END) AS absent_dates
    FROM students s
    LEFT JOIN attendance a ON a.student_id = s.id AND a.date LIKE ?
    WHERE s.batch_id = ? AND s.active = 1
    GROUP BY s.id ORDER BY CAST(s.roll_no AS INTEGER), s.roll_no, s.name
  `).all(`${month}-%`, batch.id);
  for (const r of rows) {
    r.absent = r.total - r.present;
    r.pct = r.total ? Math.round((r.present / r.total) * 100) : null;
    r.absentDates = r.absent_dates ? r.absent_dates.split(',').sort() : [];
  }

  const days = db.prepare(`
    SELECT COUNT(DISTINCT a.date) AS n FROM attendance a JOIN students s ON s.id = a.student_id
    WHERE s.batch_id = ? AND a.date LIKE ?
  `).get(batch.id, `${month}-%`).n;

  if (req.query.format === 'csv') {
    return sendCsv(res, `attendance-${batch.class}${batch.division}-${month}.csv`, rows, [
      { label: 'Roll No', value: (r) => r.roll_no },
      { label: 'Student', value: (r) => r.name },
      { label: 'Present', value: (r) => r.present },
      { label: 'Absent', value: (r) => r.absent },
      { label: 'Attendance %', value: (r) => (r.pct == null ? '' : r.pct) },
      { label: 'Absent Dates', value: (r) => r.absentDates.join(' ') },
    ]);
  }

  res.render('reports/attendance', {
    title: 'Attendance report', rows, batch, batches, month, days, monthName: monthLabel(month), dateLabel,
  });
});

module.exports = router;
