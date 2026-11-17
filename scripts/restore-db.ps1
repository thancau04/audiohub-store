param(
  [Parameter(Mandatory=$true)][string]$BackupFile,
  [string]$DatabaseUrl = $env:DATABASE_URL
)

if (-not (Test-Path $BackupFile)) {
  Write-Error "Không tìm thấy file backup: $BackupFile"
  exit 1
}

if (-not $DatabaseUrl) {
  if (Test-Path ".env") {
    $line = Get-Content ".env" | Where-Object { $_ -match "^DATABASE_URL=" } | Select-Object -First 1
    if ($line) { $DatabaseUrl = $line.Substring("DATABASE_URL=".Length).Trim() }
  }
}

if (-not $DatabaseUrl) {
  Write-Error "Thiếu DATABASE_URL. Truyền -DatabaseUrl hoặc cấu hình trong .env."
  exit 1
}

$abs = (Resolve-Path $BackupFile).Path
if ($abs -like "*.dump") {
  docker run --rm -v "${abs}:/backup.dump:ro" -e DATABASE_URL="$DatabaseUrl" postgres:18-alpine `
    pg_restore --clean --if-exists --no-owner --no-acl -d "$DatabaseUrl" /backup.dump
} elseif ($abs -like "*.sql.gz") {
  Get-Content $abs -AsByteStream | docker run --rm -i -e DATABASE_URL="$DatabaseUrl" postgres:18-alpine `
    sh -c 'gunzip -c | psql "$DATABASE_URL"'
} else {
  Write-Error "Chỉ hỗ trợ file .dump hoặc .sql.gz"
  exit 1
}

Write-Host "Đã khôi phục database thành công từ $BackupFile"
