# Tuition Fee Tracker

Fee collection and attendance for a tuition center (classes 8–10, divisions A–D).
Node.js + Express + SQLite, server-rendered pages, mobile-first.

## Features
- **Dashboard** – collected this month / today, pending dues, today's attendance, 6-month trend, pending by class
- **Quick collect** – search a student, amount pre-filled with dues, pick Cash/UPI/Bank, save → receipt
- **PDF receipts** – downloadable from the receipt page and the student profile; share summary on WhatsApp
- **Student profiles** – pending amount, month-by-month fee status, all receipts, attendance %
- **Attendance** – per class per day, everyone present by default, tap to mark absent
- **Reports** – collections (date range / class / mode), pending dues, monthly attendance; all exportable to CSV

## How fees work
- Each class has a monthly fee (Settings). A student can have a custom fee (discount).
- A due is added for every month from the student's joining month. Months already billed keep their amount if fees change later.
- Payments are applied to the oldest unpaid month first, so partial and advance payments just work.
- A single month can be waived from the student profile. Marking a student inactive stops new dues; reactivating resumes from the current month.

## Run locally
```bash
npm install
npm start            # http://127.0.0.1:4000  (login: admin / admin123)
```
Set `ADMIN_USER` / `ADMIN_PASSWORD` before the first start to choose the initial login. Change the password from Settings.

## Configuration (environment variables)
| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `4000` | Port to listen on |
| `HOST` | `127.0.0.1` | Interface to listen on |
| `DB_PATH` | `./data/tuition.db` | SQLite database file (folder is created if missing) |
| `ADMIN_USER` / `ADMIN_PASSWORD` | `admin` / `admin123` | Initial login, used only when the database has no users |
| `COOKIE_SECURE` | off | Set to `1` when the app is served over HTTPS |
| `TZ` | `Asia/Kolkata` | Timezone for dates |

## Deployment
Runs as a `systemctl --user` service behind an HTTPS proxy, with the database kept outside the code folder. Update an existing deployment with:
```bash
cd ~/apps/tuition && git pull && npm ci && systemctl --user restart tuition
```

## Project layout
```
server.js            app setup, auth guard
db.js                schema + seed (12 batches, admin user)
lib/fees.js          dues generation, payment allocation, balances
lib/receipt.js       PDF receipt
routes/              dashboard, students, collect, attendance, reports, settings, auth
views/               EJS templates
public/              style.css, app.js
```
