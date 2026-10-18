const router = require('express').Router();
const db = require('../db');
const fees = require('../lib/fees');
const { renderReceipt } = require('../lib/receipt');
const { today, isDate, MODES, monthLabel } = require('../lib/util');

const getStudent = (id) => db.prepare(`
  SELECT s.*, b.class, b.division FROM students s JOIN batches b ON b.id = s.batch_id WHERE s.id = ?
`).get(id);

const getPayment = (id) => db.prepare('SELECT * FROM payments WHERE id = ?').get(id);

// Recomputes the ledger and returns the payment as allocated, plus the
// balance right after it (counting only dues billed up to that month).
function paymentDetails(payment) {
  const ledger = fees.studentLedger(payment.student_id);
  const p = ledger.payments.find((x) => x.id === payment.id);
  const month = payment.paid_on.slice(0, 7);
  const duesUpTo = ledger.dues.filter((d) => d.month <= month).reduce((s, d) => s + d.amount, 0);
  const paidUpTo = ledger.payments
    .filter((x) => x.paid_on < payment.paid_on || (x.paid_on === payment.paid_on && x.id <= payment.id))
    .reduce((s, x) => s + x.amount, 0);
  return { payment: p, coversLabel: fees.coversLabel(p), balanceAfter: duesUpTo - paidUpTo };
}

router.get('/collect', (req, res) => {
  const rows = fees.balances().sort((a, b) => b.balance - a.balance || a.name.localeCompare(b.name));
  const batches = db.prepare('SELECT * FROM batches ORDER BY class, division').all();
  res.render('collect/index', { title: 'Collect fees', rows, batches });
});

router.get('/collect/:studentId', (req, res, next) => {
  const student = getStudent(req.params.studentId);
  if (!student) return next();
  const ledger = fees.studentLedger(student.id);
  const unpaid = ledger.dues.filter((d) => d.status === 'due' || d.status === 'partial');
  res.render('collect/form', { title: 'Collect fees', student, ledger, unpaid, errors: [], form: {} });
});

router.post('/collect/:studentId', (req, res, next) => {
  const student = getStudent(req.params.studentId);
  if (!student) return next();

  const form = {
    amount: Number(req.body.amount),
    mode: req.body.mode,
    paid_on: req.body.paid_on,
    note: (req.body.note || '').trim(),
  };
  const errors = [];
  if (!Number.isInteger(form.amount) || form.amount <= 0) errors.push('Enter a valid amount in whole rupees.');
  if (!MODES[form.mode]) errors.push('Choose a payment mode.');
  if (!isDate(form.paid_on) || form.paid_on > today()) errors.push('Payment date is invalid.');

  if (errors.length) {
    const ledger = fees.studentLedger(student.id);
    const unpaid = ledger.dues.filter((d) => d.status === 'due' || d.status === 'partial');
    return res.status(400).render('collect/form', { title: 'Collect fees', student, ledger, unpaid, errors, form });
  }

  const id = fees.createPayment({ studentId: student.id, amount: form.amount, mode: form.mode, paidOn: form.paid_on, note: form.note });
  res.redirect(`/payments/${id}?new=1`);
});

router.get('/payments/:id', (req, res, next) => {
  const payment = getPayment(req.params.id);
  if (!payment) return next();
  const student = getStudent(payment.student_id);
  const details = paymentDetails(payment);
  res.render('collect/receipt', { title: `Receipt ${payment.receipt_no}`, student, ...details, isNew: !!req.query.new });
});

router.get('/payments/:id/pdf', (req, res, next) => {
  const payment = getPayment(req.params.id);
  if (!payment) return next();
  const student = getStudent(payment.student_id);
  const details = paymentDetails(payment);
  renderReceipt(res, { settings: db.getSettings(), student, ...details });
});

router.post('/payments/:id/delete', (req, res, next) => {
  const payment = getPayment(req.params.id);
  if (!payment) return next();
  db.prepare('DELETE FROM payments WHERE id = ?').run(payment.id);
  req.flash('ok', `Receipt ${payment.receipt_no} deleted.`);
  res.redirect(`/students/${payment.student_id}`);
});

module.exports = router;
