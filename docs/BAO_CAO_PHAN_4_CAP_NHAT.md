# Nội dung cập nhật cho Báo cáo Phần 4 (AudioHub Store)

> Tài liệu này tổng hợp đầy đủ các hạng mục đã triển khai để bạn dán/cập nhật vào Phần 4 trên Google Docs.

---

## 4.1 Kiến trúc tổng thể & Hạ tầng đám mây

Ứng dụng **AudioHub Store** được phát triển theo mô hình Node.js (Express + Handlebars) kết nối đa dịch vụ đám mây:

- **Web Service (PaaS):** Render (`node server.js`), bật `trust proxy` sau HTTPS proxy của Render, tự động triển khai theo trạng thái **After CI Checks Pass**.
- **Cơ sở dữ liệu (DBaaS):** Render Managed PostgreSQL **18.6** (lưu dữ liệu sản phẩm, người dùng, phiên đăng nhập `user_sessions`, lịch sử kho `stock_movements`, đơn hàng `orders` & `order_items`).
- **Lưu trữ đa phương tiện (Media Cloud):** **Cloudinary** — ảnh sản phẩm upload từ form được đọc vào RAM qua `multer.memoryStorage()` và stream thẳng lên Cloudinary (`res.cloudinary.com`), giải quyết triệt để vấn đề **ephemeral filesystem** (ổ đĩa tạm bị xóa khi Render restart/redeploy).
- **CI/CD & Backup (GitHub Actions):**
  - Pipeline kiểm thử tự động (`.github/workflows/ci.yml`) chạy trên container `postgres:18-alpine` trước khi Render deploy.
  - Pipeline sao lưu tự động hằng ngày (`.github/workflows/backup-db.yml`) dùng `pg_dump` 18 lưu cả `.dump` và `.sql.gz` lên GitHub Actions Artifacts (lưu giữ 30 ngày).
- **Container hóa (Docker):** `Dockerfile` (non-root `node:20-alpine`) và `docker-compose.yml` (`app` + `postgres:18-alpine` kèm healthcheck) phục vụ chạy đồng nhất trên mọi môi trường.

---

## 4.2 Mở rộng lược đồ cơ sở dữ liệu (PostgreSQL)

Ngoài 3 bảng danh mục cốt lõi (`categories`, `brands`, `products`), hệ thống bổ sung 5 bảng nghiệp vụ và vận hành:

1. `users`: lưu tài khoản, mật khẩu băm `scrypt` (kèm salt ngẫu nhiên 16 byte), họ tên, vai trò (`admin` / `staff`), trạng thái hoạt động (`is_active`).
2. `user_sessions`: lưu session của `express-session` thông qua `connect-pg-simple`, giúp duy trì đăng nhập ngay cả khi Render khởi động lại hoặc mở rộng nhiều instance.
3. `stock_movements`: ghi nhật ký mọi biến động nhập (`IN`) / xuất (`OUT`), số lượng, tồn kho sau giao dịch (`stock_after`), người thực hiện và ghi chú.
4. `orders` & `order_items`: quản lý đơn hàng bán lẻ và chi tiết từng mặt hàng tại thời điểm bán (`unit_price`, `line_total`).

---

## 4.3 Nghiệp vụ cửa hàng & Tính toàn vẹn dữ liệu (Transaction)

- **Nhập / Xuất kho (`/inventory`):** Thực hiện trong giao dịch `BEGIN ... COMMIT`, sử dụng `SELECT ... FOR UPDATE` để khóa dòng sản phẩm tránh race condition; tự động `ROLLBACK` nếu số lượng xuất lớn hơn tồn kho.
- **Tạo đơn hàng (`/orders/new`):** Hỗ trợ chọn nhiều mặt hàng trong một đơn; khóa các sản phẩm theo thứ tự `product_id` tăng dần (tránh deadlock), kiểm tra tồn kho, tạo `orders` + `order_items`, trừ `products.stock` và ghi log `stock_movements` trong **cùng một transaction**.
- **Hủy đơn hàng (`/orders/:id/cancel`):** Chỉ dành cho `admin`, chuyển trạng thái `CANCELLED`, cộng hoàn lại tồn kho và ghi phiếu nhập hoàn kho trong một transaction.
- **Báo cáo & Xuất CSV (`/reports`):** Thống kê tổng doanh thu, doanh thu 7 ngày, top sản phẩm bán chạy; xuất file CSV có **UTF-8 BOM** (`EF BB BF`) để mở trực tiếp trên Excel không lỗi font tiếng Việt, kèm xử lý chống **CSV Formula Injection**.

---

## 4.4 Xác thực, phân quyền & Bảo mật ứng dụng

- **Mô hình phân quyền (Option A – Hybrid Public/Protected):**
  - *Khách (chưa đăng nhập):* Xem trang tổng quan (`/`), danh sách & chi tiết sản phẩm (`/products`, `/products/:id`), API JSON (`/api/products`, `/health`).
  - *Nhân viên (`staff`):* Thêm/sửa sản phẩm, upload ảnh Cloudinary, nhập/xuất kho, tạo đơn hàng, xem báo cáo và xuất CSV.
  - *Quản trị viên (`admin`):* Toàn quyền của `staff`, cộng thêm xóa sản phẩm, hủy đơn hàng và quản lý tài khoản nhân viên (`/admin/users`).
- **Các lớp bảo mật bổ sung:**
  - `helmet` thiết lập HTTP security headers và Content Security Policy (CSP) chặt chẽ (`script-src 'self'`, tách toàn bộ JS xác nhận ra file `public/js/app.js`).
  - `express-rate-limit` giới hạn tần suất request chung (300 req/phút, miễn `/health`) và giới hạn đăng nhập (20 lần/15 phút) chống brute-force.
  - Chống **CSRF** (Synchronizer Token Pattern lưu trong session, kiểm tra bằng `crypto.timingSafeEqual` trên mọi `POST` form, bao gồm cả `multipart/form-data` sau bước `multer`).

---

## 4.5 CI/CD, Sao lưu & Đóng gói Docker

- **CI Pipeline (`.github/workflows/ci.yml`):** Tự động kích hoạt khi push/PR vào nhánh `main`; cài đặt Node 20, khởi tạo dịch vụ `postgres:18-alpine`, kiểm tra cú pháp toàn bộ file `.js`, chạy `npm run db:init` và bộ kiểm thử tích hợp `npm test` (6 test case kiểm tra phân quyền, CSRF, transaction rollback, upload ảnh, CSV BOM). Khi CI pass, Render tự động deploy nhờ cấu hình **After CI Checks Pass**.
- **Sao lưu & Khôi phục DB:** Khắc phục giới hạn hết hạn sau 30 ngày của gói PostgreSQL Free trên Render bằng lịch chạy `pg_dump` hằng ngày trên GitHub Actions, kèm script khôi phục `scripts/restore-db.sh` (Linux/macOS) và `scripts/restore-db.ps1` (Windows).
- **Docker:** Có `Dockerfile` và `docker-compose.yml` cho phép chạy toàn bộ hệ thống cục bộ bằng một lệnh `docker compose up --build`.

---

## 4.6 Đo lường hiệu năng & Vận hành (Monitoring / Keep-alive)

- **Telemetry tích hợp:** Middleware `src/metrics.js` ghi nhận thời gian xử lý từng request (ms), cung cấp chỉ số `avg`, `p95`, `max`, `uptime` và RAM tại `GET /health` và `GET /api/metrics`.
- **Kết quả đo thực tế trên Render (`https://audiohub-store.onrender.com`)** bằng `node scripts/benchmark.js https://audiohub-store.onrender.com 5 20`:
  - Request đầu tiên (`/health`, trạng thái đang ấm): `353.0 ms` (HTTP 200).
  - Tải 20 request với 5 luồng đồng thời: **20 thành công / 0 lỗi**, tổng thời gian **0.65 s** (**30.7 req/s**), độ trễ `min = 74.0 ms`, `avg = 131.8 ms`, `p50 = 85.3 ms`, `p95 = 304.5 ms`.
- **Giảm thiểu Cold Start (Spin-down):** Gói Free của Render tự ngủ sau ~15 phút không có truy cập. Hệ thống hỗ trợ gắn dịch vụ giám sát ngoài (như **UptimeRobot**) ping định kỳ `GET /health` (endpoint nhẹ, được miễn rate-limit) để duy trì trạng thái sẵn sàng khi demo.
