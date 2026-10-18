const router = require('express').Router();
const db = require('../db');
const fees = require('../lib/fees');
const { today, currentMonth, isDate, monthLabel } = require('../lib/util');

const getBatches = () => db.prepare('SELECT * FROM batches ORDER BY class, division').all();
const getStudent = (id) => db.prepare(`
  SELECT s.*, b.class, b.division, b.monthly_fee AS batch_fee FROM students s
  JOIN batches b ON b.id = s.batch_id WHERE s.id = ?
`).get(id);

function readForm(body) {
  const data = {
    name: (body.name || '').trim(),
    roll_no: (body.roll_no || '').trim() || null,
    batch_id: Number(body.batch_id),
    parent_name: (body.parent_name || '').trim() || null,
    phone: (body.phone || '').replace(/[^\d+]/g, '') || null,
    address: (body.address || '').trim() || null,
    join_date: body.join_date,
    monthly_fee: body.monthly_fee === '' || body.monthly_fee == null ? null : Number(body.monthly_fee),
    notes: (body.notes || '').trim() || null,
  };
  const errors = [];
  if (!data.name) errors.push('Name is required.');
  if (!db.prepare('SELECT 1 FROM batches WHERE id = ?').get(data.batch_id)) errors.push('Choose a class.');
  if (!isDate(data.join_date)) errors.push('Joining date is invalid.');
  else if (data.join_date > today()) errors.push('Joining date cannot be in the future.');
  if (data.monthly_fee !== null && !(Number.isInteger(data.monthly_fee) && data.monthly_fee >= 0)) errors.push('Custom fee must be a whole number.');
  return { data, errors };
}

router.get('/students', (req, res) => {
  const batchId = Number(req.query.batch) || null;
  const showInactive = req.query.status === 'inactive';
  let rows = fees.balances({ batchId, activeOnly: !showInactive });
  if (showInactive) rows = rows.filter((r) => !r.active);
  res.render('students/index', { title: 'Students', rows, batches: getBatches(), batchId, showInactive });
});

router.get('/students/new', (req, res) => {
  const batchId = Number(req.query.batch) || '';
  res.render('students/form', {
    title: 'Add student', student: { batch_id: batchId, join_date: today() }, batches: getBatches(), errors: [],
  });
});

router.post('/students', (req, res) => {
  const { data, errors } = readForm(req.body);
  if (errors.length) {
    return res.status(400).render('students/form', { title: 'Add student', student: data, batches: getBatches(), errors });
  }
  const { lastInsertRowid: id } = db.prepare(`
    INSERT INTO students (name, roll_no, batch_id, parent_name, phone, address, join_date, fees_from, monthly_fee, notes)
    VALUES (@name, @roll_no, @batch_id, @parent_name, @phone, @address, @join_date, @fees_from, @monthly_fee, @notes)
  `).run({ ...data, fees_from: data.join_date.slice(0, 7) });
  fees.ensureDues(id);
  req.flash('ok', `${data.name} added.`);
  res.redirect(`/students/${id}`);
});

router.get('/students/:id', (req, res, next) => {
  const student = getStudent(req.params.id);
  if (!student) return next();
  const ledger = fees.studentLedger(student.id);
  ledger.payments.reverse();
  ledger.dues.reverse();

  const month = currentMonth();
  const att = db.prepare(`
    SELECT COUNT(*) AS total, COALESCE(SUM(status = 'P'), 0) AS present FROM attendance
    WHERE student_id = ? AND date LIKE ?
  `).get(student.id, `${month}-%`);
  const attAll = db.prepare(`
    SELECT COUNT(*) AS total, COALESCE(SUM(status = 'P'), 0) AS present FROM attendance WHERE student_id = ?
  `).get(student.id);
  const absences = db.prepare(`
    SELECT date FROM attendance WHERE student_id = ? AND status = 'A' ORDER BY date DESC LIMIT 10
  `).all(student.id);

  res.render('students/show', {
    title: student.name, student, ledger, coversLabel: fees.coversLabel, att, attAll, absences, monthName: monthLabel(month),
  });
});

router.get('/students/:id/edit', (req, res, next) => {
  const student = getStudent(req.params.id);
  if (!student) return next();
  const hasPayments = !!db.prepare('SELECT 1 FROM payments WHERE student_id = ?').get(student.id);
  res.render('students/form', { title: 'Edit student', student, batches: getBatches(), errors: [], hasPayments });
});

router.post('/students/:id', (req, res, next) => {
  const existing = getStudent(req.params.id);
  if (!existing) return next();
  const { data, errors } = readForm(req.body);
  if (errors.length) {
    return res.status(400).render('students/form', { title: 'Edit student', student: { ...data, id: existing.id }, batches: getBatches(), errors });
  }

  db.transaction(() => {
    let feesFrom = existing.fees_from;
    // Moving the joining month changes which months are billed.
    if (data.join_date.slice(0, 7) !== existing.join_date.slice(0, 7)) {
      feesFrom = data.join_date.slice(0, 7);
      db.prepare('DELETE FROM fee_dues WHERE student_id = ? AND month < ?').run(existing.id, feesFrom);
    }
    db.prepare(`
      UPDATE students SET name = @name, roll_no = @roll_no, batch_id = @batch_id, parent_name = @parent_name,
        phone = @phone, address = @address, join_date = @join_date, fees_from = @fees_from,
        monthly_fee = @monthly_fee, notes = @notes
      WHERE id = @id
    `).run({ ...data, fees_from: feesFrom, id: existing.id });
  })();
  fees.ensureDues(existing.id);
  req.flash('ok', 'Student updated.');
  res.redirect(`/students/${existing.id}`);
});

router.post('/students/:id/toggle-active', (req, res, next) => {
  const s = getStudent(req.params.id);
  if (!s) return next();
  if (s.active) {
    db.prepare('UPDATE students SET active = 0 WHERE id = ?').run(s.id);
    req.flash('ok', `${s.name} marked inactive. No new monthly fees will be added.`);
  } else {
    // Don't bill the months the student was away.
    const month = currentMonth();
    db.prepare('UPDATE students SET active = 1, fees_from = MAX(fees_from, ?) WHERE id = ?').run(month, s.id);
    fees.ensureDues(s.id);
    req.flash('ok', `${s.name} is active again. Fees resume from ${monthLabel(month)}.`);
  }
  res.redirect(`/students/${s.id}`);
});

router.post('/students/:id/delete', (req, res, next) => {
  const s = getStudent(req.params.id);
  if (!s) return next();
  if (db.prepare('SELECT 1 FROM payments WHERE student_id = ?').get(s.id)) {
    req.flash('error', 'This student has payments recorded. Mark them inactive instead.');
    return res.redirect(`/students/${s.id}`);
  }
  db.prepare('DELETE FROM students WHERE id = ?').run(s.id);
  req.flash('ok', `${s.name} deleted.`);
  res.redirect('/students');
});

router.post('/students/:id/dues/:dueId/waive', (req, res, next) => {
  const s = getStudent(req.params.id);
  const due = s && db.prepare('SELECT * FROM fee_dues WHERE id = ? AND student_id = ?').get(req.params.dueId, s.id);
  if (!due) return next();
  if (due.waived) {
    db.prepare('UPDATE fee_dues SET waived = 0, amount = ? WHERE id = ?').run(s.monthly_fee ?? s.batch_fee, due.id);
    req.flash('ok', `${monthLabel(due.month)} fee restored.`);
  } else {
    db.prepare('UPDATE fee_dues SET waived = 1, amount = 0 WHERE id = ?').run(due.id);
    req.flash('ok', `${monthLabel(due.month)} fee waived.`);
  }
  res.redirect(`/students/${s.id}#fees`);
});

module.exports = router;
