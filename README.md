# AudioHub – Quản lý cửa hàng tai nghe và thiết bị âm thanh

Ứng dụng web Node.js (Express + Handlebars) kết nối PostgreSQL, triển khai trên Render.
Đồ án môn Điện toán đám mây (IS2023).

## Chức năng chính

1. **Quản lý sản phẩm & ảnh đám mây (Cloudinary):**
   - Xem tổng quan, tìm kiếm theo tên/thương hiệu/SKU, lọc danh mục, phân trang.
   - Thêm / sửa / xóa sản phẩm; hỗ trợ tải file ảnh trực tiếp lên **Cloudinary** (`multer` memory storage) hoặc dán URL ảnh.
2. **Nghiệp vụ cửa hàng (Transaction PostgreSQL):**
   - **Nhập / Xuất kho (`/inventory`):** ghi nhận phiếu nhập/xuất kèm lịch sử biến động, khóa dòng (`FOR UPDATE`) chống âm tồn kho.
   - **Đơn hàng (`/orders`):** tạo đơn nhiều sản phẩm, kiểm tra & trừ tồn kho + ghi lịch sử kho đồng thời trong 1 transaction; admin có thể hủy đơn hoàn kho.
   - **Báo cáo & Xuất CSV (`/reports`):** thống kê doanh thu tổng / 7 ngày, top sản phẩm bán chạy, doanh thu theo ngày, xuất file CSV chuẩn UTF-8 BOM cho Excel.
3. **Đăng nhập, phân quyền & bảo mật:**
   - Xác thực session lưu trên PostgreSQL (`connect-pg-simple`), mật khẩu băm `scrypt` (`crypto.scryptSync`).
   - Vai trò: khách xem được trang công khai; `staff` thao tác sản phẩm/kho/đơn/báo cáo; `admin` được xóa sản phẩm, hủy đơn và quản lý tài khoản (`/admin/users`).
   - Bảo mật: `helmet` (CSP), `express-rate-limit`, bảo vệ CSRF theo từng phiên, chống CSV formula injection.
4. **Đo lường & vận hành Cloud:**
   - `GET /health` và `GET /api/metrics`: theo dõi kết nối DB, uptime, RAM và độ trễ (avg/p95/max).
   - `npm run bench`: script đo cold start và chịu tải nhẹ.
5. **Docker, CI/CD & Sao lưu tự động:**
   - `Dockerfile` + `docker-compose.yml` chạy trọn bộ App + PostgreSQL 18.
   - GitHub Actions CI (`.github/workflows/ci.yml`): kiểm tra cú pháp + chạy test tích hợp trên Postgres 18 trước khi Render auto-deploy (`After CI Checks Pass`).
   - GitHub Actions Backup (`.github/workflows/backup-db.yml`): sao lưu tự động hằng ngày bằng `pg_dump` 18, lưu artifact 30 ngày, kèm script khôi phục `scripts/restore-db.sh` / `scripts/restore-db.ps1`.

## Tài khoản mặc định (dữ liệu mẫu)

| Vai trò | Tên đăng nhập | Mật khẩu | Quyền hạn |
|---|---|---|---|
| Quản trị viên | `admin` | `Admin@123` | Toàn quyền (gồm xóa sản phẩm, hủy đơn, quản lý nhân viên) |
| Nhân viên | `staff` | `Staff@123` | Thêm/sửa sản phẩm, nhập/xuất kho, tạo đơn hàng, xem báo cáo |

## Chạy bằng Docker Compose

```bash
docker compose up --build
# Mở http://localhost:3000
```

## Chạy trực tiếp trên máy cá nhân

```bash
npm install
cp .env.example .env        # Windows: copy .env.example .env
# mở .env và điền DATABASE_URL, SESSION_SECRET (và Cloudinary nếu dùng upload ảnh)
npm run db:init             # tạo bảng + nạp dữ liệu mẫu
npm test                    # chạy kiểm thử tích hợp
npm start                   # mở http://localhost:3000
```

## Biến môi trường

| Biến | Bắt buộc | Ý nghĩa |
|---|---|---|
| `DATABASE_URL` | Có | Chuỗi kết nối PostgreSQL |
| `SESSION_SECRET` | Khuyến nghị | Khóa bí mật ký cookie phiên đăng nhập |
| `PORT` | Không | Cổng chạy (Render tự cấp, local mặc định 3000) |
| `DB_SSL` | Không | `true` / `false` để ép bật/tắt SSL; bỏ trống = tự nhận diện |
| `AUTO_DB_INIT` | Không | `true` = tự tạo bảng và nạp dữ liệu mẫu khi server khởi động |
| `CLOUDINARY_CLOUD_NAME` | Không | Tên cloud Cloudinary (để upload ảnh từ form) |
| `CLOUDINARY_API_KEY` | Không | API Key Cloudinary |
| `CLOUDINARY_API_SECRET` | Không | API Secret Cloudinary |

## Lệnh npm

| Lệnh | Tác dụng |
|---|---|
| `npm start` | Chạy server (production) |
| `npm run dev` | Chạy server, tự khởi động lại khi sửa code |
| `npm test` | Chạy bộ kiểm thử tự động (`node --test`) |
| `npm run bench` | Đo cold start và thời gian phản hồi (`node scripts/benchmark.js <url>`) |
| `npm run db:init` | Tạo bảng, nạp dữ liệu mẫu (không trùng) |
| `npm run db:reset` | Xóa toàn bộ bảng rồi tạo lại (mất dữ liệu) |

## Sao lưu & Khôi phục Database

- Workflow `.github/workflows/backup-db.yml` chạy `pg_dump` (Postgres 18) hằng ngày lúc 02:00 UTC và lưu file `.dump` + `.sql.gz` tại GitHub Actions Artifacts (cần GitHub Secret `DATABASE_URL`).
- Khôi phục sang database mới (ví dụ khi Postgres Free trên Render hết hạn 30 ngày):
  - Linux/macOS: `./scripts/restore-db.sh backups/audiohub-xxxx.dump "postgresql://..."`
  - Windows PowerShell: `.\scripts\restore-db.ps1 -BackupFile .\backups\audiohub-xxxx.dump -DatabaseUrl "postgresql://..."`
