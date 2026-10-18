const router = require('express').Router();
const db = require('../db');
const fees = require('../lib/fees');
const { today, currentMonth, addMonths, monthLabel } = require('../lib/util');

const sumPayments = db.prepare('SELECT COALESCE(SUM(amount), 0) AS total, COUNT(*) AS count FROM payments WHERE paid_on BETWEEN ? AND ?');

router.get('/', (req, res) => {
  const t = today();
  const month = currentMonth();

  const todayStats = sumPayments.get(t, t);
  const monthStats = sumPayments.get(`${month}-01`, `${month}-31`);
  const expected = db.prepare(`
    SELECT COALESCE(SUM(d.amount), 0) AS total FROM fee_dues d
    JOIN students s ON s.id = d.student_id WHERE d.month = ? AND s.active = 1
  `).get(month).total;

  const all = fees.balances();
  const owing = all.filter((s) => s.balance > 0).sort((a, b) => b.balance - a.balance);
  const pendingTotal = owing.reduce((s, r) => s + r.balance, 0);

  const trend = [];
  for (let i = 5; i >= 0; i--) {
    const m = addMonths(month, -i);
    trend.push({ month: m, label: monthLabel(m).slice(0, 3), full: monthLabel(m), total: sumPayments.get(`${m}-01`, `${m}-31`).total });
  }

  const byMode = db.prepare(`
    SELECT mode, SUM(amount) AS total, COUNT(*) AS count FROM payments
    WHERE paid_on BETWEEN ? AND ? GROUP BY mode ORDER BY total DESC
  `).all(`${month}-01`, `${month}-31`);

  const byBatch = db.prepare('SELECT * FROM batches ORDER BY class, division').all().map((b) => {
    const rows = all.filter((s) => s.batch_id === b.id);
    return {
      ...b,
      students: rows.length,
      pending: rows.reduce((s, r) => s + Math.max(r.balance, 0), 0),
      owing: rows.filter((r) => r.balance > 0).length,
    };
  });

  const recent = db.prepare(`
    SELECT p.*, s.name, b.class, b.division FROM payments p
    JOIN students s ON s.id = p.student_id JOIN batches b ON b.id = s.batch_id
    ORDER BY p.id DESC LIMIT 6
  `).all();

  const att = db.prepare(`
    SELECT COUNT(*) AS marked, COALESCE(SUM(status = 'P'), 0) AS present FROM attendance a
    JOIN students s ON s.id = a.student_id WHERE a.date = ? AND s.active = 1
  `).get(t);

  res.render('dashboard', {
    title: 'Dashboard',
    todayStats, monthStats, expected, pendingTotal, owing, trend, byMode, byBatch, recent,
    att, activeCount: all.length, monthName: monthLabel(month),
  });
});

module.exports = router;
