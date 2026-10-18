#!/usr/bin/env bash
# Nightly SQLite backup, keeps the last 30 days.
# Cron (crontab -e):  30 2 * * * /home/ubuntu/tuition/deploy/backup.sh
set -euo pipefail
APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
BACKUP_DIR="$APP_DIR/backups"
mkdir -p "$BACKUP_DIR"
sqlite3 "$APP_DIR/data/tuition.db" ".backup '$BACKUP_DIR/tuition-$(date +%F).db'"
find "$BACKUP_DIR" -name 'tuition-*.db' -mtime +30 -delete
