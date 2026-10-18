const db = require('../db');
const { currentMonth, addMonths, monthLabel } = require('./util');

const insertDue = db.prepare('INSERT OR IGNORE INTO fee_dues (student_id, month, amount) VALUES (?, ?, ?)');

// Creates a due for every month from the student's fees_from up to the current
// month. Safe to call repeatedly: existing months are left untouched.
function ensureDues(studentId) {
  const students = db.prepare(`
    SELECT s.id, s.fees_from, COALESCE(s.monthly_fee, b.monthly_fee) AS fee
    FROM students s JOIN batches b ON b.id = s.batch_id
    WHERE s.active = 1 ${studentId ? 'AND s.id = ?' : ''}
  `).all(...(studentId ? [studentId] : []));
  const cur = currentMonth();
  db.transaction(() => {
    for (const s of students) {
      for (let m = s.fees_from; m <= cur; m = addMonths(m, 1)) insertDue.run(s.id, m, s.fee);
    }
  })();
}

let lastGeneratedFor = null;
function ensureDuesThisMonth() {
  const cur = currentMonth();
  if (lastGeneratedFor !== cur) {
    ensureDues();
    lastGeneratedFor = cur;
  }
}

// Full fee picture for one student. Payments are applied to the oldest unpaid
// month first, which gives each due a status and each payment the months it covered.
function studentLedger(studentId) {
  const dues = db.prepare('SELECT * FROM fee_dues WHERE student_id = ? ORDER BY month').all(studentId);
  const payments = db.prepare('SELECT * FROM payments WHERE student_id = ? ORDER BY paid_on, id').all(studentId);

  for (const d of dues) d.paid = 0;
  let i = 0;
  for (const p of payments) {
    let left = p.amount;
    p.covers = [];
    while (left > 0 && i < dues.length) {
      const d = dues[i];
      const take = Math.min(left, d.amount - d.paid);
      if (take > 0) {
        p.covers.push({ month: d.month, amount: take, partial: take < d.amount });
        d.paid += take;
        left -= take;
      }
      if (d.paid >= d.amount) i++;
    }
    p.advance = left;
  }

  for (const d of dues) {
    d.status = d.waived ? 'waived' : d.paid >= d.amount ? 'paid' : d.paid > 0 ? 'partial' : 'due';
  }

  const totalDue = dues.reduce((s, d) => s + d.amount, 0);
  const totalPaid = payments.reduce((s, p) => s + p.amount, 0);
  return { dues, payments, totalDue, totalPaid, balance: totalDue - totalPaid };
}

function coversLabel(p) {
  const parts = p.covers.map((c) => monthLabel(c.month) + (c.partial ? ' (part)' : ''));
  if (p.advance > 0) parts.push('Advance');
  return parts.join(', ') || 'Advance';
}

// Balance per student (positive = owes money, negative = advance credit).
function balances({ batchId, activeOnly = true } = {}) {
  const where = [];
  const params = [];
  if (activeOnly) where.push('s.active = 1');
  if (batchId) { where.push('s.batch_id = ?'); params.push(batchId); }
  return db.prepare(`
    SELECT s.id, s.name, s.roll_no, s.phone, s.parent_name, s.active, s.batch_id,
           b.class, b.division, COALESCE(s.monthly_fee, b.monthly_fee) AS fee,
           COALESCE(d.total, 0) - COALESCE(p.total, 0) AS balance
    FROM students s
    JOIN batches b ON b.id = s.batch_id
    LEFT JOIN (SELECT student_id, SUM(amount) AS total FROM fee_dues GROUP BY student_id) d ON d.student_id = s.id
    LEFT JOIN (SELECT student_id, SUM(amount) AS total FROM payments GROUP BY student_id) p ON p.student_id = s.id
    ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
    ORDER BY b.class, b.division, s.name
  `).all(...params);
}

function createPayment({ studentId, amount, mode, paidOn, note }) {
  return db.transaction(() => {
    const { lastInsertRowid: id } = db.prepare(
      'INSERT INTO payments (student_id, amount, mode, paid_on, note) VALUES (?, ?, ?, ?, ?)'
    ).run(studentId, amount, mode, paidOn, note || null);
    const receiptNo = `R${paidOn.slice(2, 4)}-${String(id).padStart(5, '0')}`;
    db.prepare('UPDATE payments SET receipt_no = ? WHERE id = ?').run(receiptNo, id);
    return id;
  })();
}

module.exports = { ensureDues, ensureDuesThisMonth, studentLedger, coversLabel, balances, createPayment };
