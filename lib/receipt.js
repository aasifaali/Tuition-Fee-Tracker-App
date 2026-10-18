const PDFDocument = require('pdfkit');
const { dateLabel, num, MODES, amountInWords } = require('./util');

// The built-in PDF fonts have no ₹ glyph, so receipts use "Rs.".
const rs = (n) => `Rs. ${num(n)}`;

function renderReceipt(res, { settings, student, payment, coversLabel, balanceAfter }) {
  const doc = new PDFDocument({ size: 'A5', margin: 36 });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="receipt-${payment.receipt_no}.pdf"`);
  doc.pipe(res);

  const left = doc.page.margins.left;
  const width = doc.page.width - left - doc.page.margins.right;
  const ink = '#1f2430';
  const muted = '#6b7280';
  const accent = '#2f5bd3';

  // Header
  doc.fillColor(accent).font('Helvetica-Bold').fontSize(16).text(settings.center_name || 'Tuition Center', { align: 'center' });
  doc.fillColor(muted).font('Helvetica').fontSize(9);
  if (settings.center_address) doc.text(settings.center_address, { align: 'center' });
  if (settings.center_phone) doc.text(`Phone: ${settings.center_phone}`, { align: 'center' });
  doc.moveDown(0.6);
  doc.moveTo(left, doc.y).lineTo(left + width, doc.y).lineWidth(1).strokeColor('#d6dae3').stroke();
  doc.moveDown(0.6);
  doc.fillColor(ink).font('Helvetica-Bold').fontSize(12).text('FEE RECEIPT', { align: 'center', characterSpacing: 1 });
  doc.moveDown(0.8);

  // Details grid
  const rows = [
    ['Receipt No.', payment.receipt_no, 'Date', dateLabel(payment.paid_on)],
    ['Student', student.name, 'Class', `${student.class}${student.division}`],
    ['Parent', student.parent_name || '-', 'Roll No.', student.roll_no || '-'],
  ];
  const colW = width / 2;
  for (const [l1, v1, l2, v2] of rows) {
    const y = doc.y;
    doc.font('Helvetica').fontSize(8).fillColor(muted).text(l1.toUpperCase(), left, y);
    doc.text(l2.toUpperCase(), left + colW, y);
    doc.font('Helvetica-Bold').fontSize(10).fillColor(ink).text(v1, left, y + 11, { width: colW - 8 });
    doc.text(v2, left + colW, y + 11, { width: colW - 8 });
    doc.y = y + 32;
  }

  // Line item table
  doc.moveDown(0.4);
  const tableTop = doc.y;
  doc.rect(left, tableTop, width, 20).fill('#f1f4fa');
  doc.fillColor(muted).font('Helvetica-Bold').fontSize(8);
  doc.text('DESCRIPTION', left + 8, tableTop + 6);
  doc.text('AMOUNT', left, tableTop + 6, { width: width - 8, align: 'right' });

  const itemY = tableTop + 28;
  doc.fillColor(ink).font('Helvetica').fontSize(10);
  doc.text(`Tuition fee - ${coversLabel}`, left + 8, itemY, { width: width - 110 });
  doc.text(rs(payment.amount), left, itemY, { width: width - 8, align: 'right' });
  let y = Math.max(doc.y, itemY + 14) + 8;

  doc.moveTo(left, y).lineTo(left + width, y).lineWidth(0.5).strokeColor('#d6dae3').stroke();
  y += 8;
  doc.font('Helvetica-Bold').fontSize(12).text('Total Paid', left + 8, y);
  doc.text(rs(payment.amount), left, y, { width: width - 8, align: 'right' });
  y += 20;
  doc.font('Helvetica-Oblique').fontSize(9).fillColor(muted).text(amountInWords(payment.amount), left + 8, y, { width: width - 16 });

  doc.moveDown(1.2);
  doc.font('Helvetica').fontSize(9).fillColor(ink);
  doc.text(`Payment mode: ${MODES[payment.mode] || payment.mode}`, left + 8);
  if (payment.note) doc.text(`Note: ${payment.note}`, left + 8);
  doc.text(
    balanceAfter > 0 ? `Balance pending: ${rs(balanceAfter)}` : balanceAfter < 0 ? `Advance credit: ${rs(-balanceAfter)}` : 'No pending dues',
    left + 8
  );

  // Footer
  const footY = doc.page.height - doc.page.margins.bottom - 40;
  doc.moveTo(left + width - 140, footY).lineTo(left + width, footY).lineWidth(0.5).strokeColor(muted).stroke();
  doc.fontSize(8).fillColor(muted).text('Authorised signature', left + width - 140, footY + 4, { width: 140, align: 'center' });
  doc.text('This is a computer generated receipt.', left, footY + 24, { width, align: 'center' });

  doc.end();
}

module.exports = { renderReceipt };
