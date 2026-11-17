#!/usr/bin/env bash
set -euo pipefail

# Khôi phục database PostgreSQL từ file .dump hoặc .sql.gz
# Cách dùng: ./scripts/restore-db.sh <duong_dan_file_backup> [DATABASE_URL]

BACKUP_FILE="${1:-}"
TARGET_URL="${2:-${DATABASE_URL:-}}"

if [[ -z "$BACKUP_FILE" || ! -f "$BACKUP_FILE" ]]; then
  echo "Cách dùng: $0 <file.dump | file.sql.gz> [DATABASE_URL]"
  exit 1
fi

if [[ -z "$TARGET_URL" ]]; then
  echo "Thiếu DATABASE_URL (truyền ở tham số thứ 2 hoặc biến môi trường)."
  exit 1
fi

ABS_FILE="$(cd "$(dirname "$BACKUP_FILE")" && pwd)/$(basename "$BACKUP_FILE")"
NAME="$(basename "$BACKUP_FILE")"

if [[ "$NAME" == *.dump ]]; then
  docker run --rm -v "$ABS_FILE:/backup.dump:ro" -e DATABASE_URL="$TARGET_URL" postgres:18-alpine \
    pg_restore --clean --if-exists --no-owner --no-acl -d "$TARGET_URL" /backup.dump
elif [[ "$NAME" == *.sql.gz ]]; then
  docker run --rm -i -e DATABASE_URL="$TARGET_URL" postgres:18-alpine \
    sh -c 'gunzip -c | psql "$DATABASE_URL"' < "$ABS_FILE"
else
  echo "Chỉ hỗ trợ file .dump hoặc .sql.gz"
  exit 1
fi

echo "Đã khôi phục database thành công từ $BACKUP_FILE"
