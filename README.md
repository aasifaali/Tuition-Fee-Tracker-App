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
npm start            # http://127.0.0.1:3000  (login: admin / admin123)
```
Set `ADMIN_USER` / `ADMIN_PASSWORD` before the first start to choose the initial login. Change the password from Settings.

## Deploy on Ubuntu
```bash
# 1. Node 20+, build tools for better-sqlite3, nginx, sqlite3 CLI for backups
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs build-essential nginx sqlite3
sudo npm install -g pm2

# 2. App
cd ~ && git clone <your repo> tuition   # or scp the folder (without node_modules/data)
cd tuition && npm ci --omit=dev
ADMIN_PASSWORD='choose-a-strong-one' COOKIE_SECURE=0 node -e "require('./db')"   # creates DB + admin

# 3. Run with PM2 (restarts on crash and on reboot)
pm2 start ecosystem.config.js
pm2 save && pm2 startup     # run the command it prints

# 4. Nginx + HTTPS
sudo cp deploy/nginx.conf /etc/nginx/sites-available/tuition   # edit server_name
sudo ln -s /etc/nginx/sites-available/tuition /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo apt install -y certbot python3-certbot-nginx && sudo certbot --nginx -d fees.example.com

# 5. Nightly backups
crontab -e    # add: 30 2 * * * /home/ubuntu/tuition/deploy/backup.sh
```
`COOKIE_SECURE=1` (the default in `ecosystem.config.js`) requires HTTPS; set it to `0` if you test over plain HTTP first.

Data lives in `data/tuition.db`. Copy `backups/` off the server now and then (e.g. to Google Drive).

## Project layout
```
server.js            app setup, auth guard
db.js                schema + seed (12 batches, admin user)
lib/fees.js          dues generation, payment allocation, balances
lib/receipt.js       PDF receipt
routes/              dashboard, students, collect, attendance, reports, settings, auth
views/               EJS templates
public/              style.css, app.js
deploy/              nginx config, backup script
```
