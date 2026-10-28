# AudioHub – Quản lý cửa hàng tai nghe và thiết bị âm thanh

Ứng dụng web Node.js (Express + Handlebars) kết nối PostgreSQL, triển khai trên Render.
Đồ án môn Điện toán đám mây (IS2023).

## Chức năng

- Thêm / sửa / xóa sản phẩm
- Tìm kiếm theo tên, thương hiệu, SKU; lọc theo danh mục; phân trang
- Trang tổng quan: số sản phẩm, tồn kho, giá trị tồn kho, hàng sắp hết
- API JSON: `GET /api/products?q=sony`
- Kiểm tra sức khỏe: `GET /health`

## Chạy trên máy cá nhân

```bash
npm install
cp .env.example .env        # Windows: copy .env.example .env
# mở .env và sửa DATABASE_URL
npm run db:init             # tạo bảng + nạp dữ liệu mẫu
npm start                   # mở http://localhost:3000
```

`DATABASE_URL` có thể trỏ tới PostgreSQL cài trên máy (`localhost`) hoặc tới database
trên Render (dán **External Database URL**). SSL được tự bật khi host là tên miền.

## Biến môi trường

| Biến | Bắt buộc | Ý nghĩa |
| --- | --- | --- |
| `DATABASE_URL` | Có | Chuỗi kết nối PostgreSQL |
| `PORT` | Không | Cổng chạy (Render tự cấp, local mặc định 3000) |
| `DB_SSL` | Không | `true` / `false` để ép bật/tắt SSL; bỏ trống = tự nhận diện |
| `AUTO_DB_INIT` | Không | `true` = tự tạo bảng và nạp dữ liệu mẫu khi server khởi động |

## Lệnh npm

| Lệnh | Tác dụng |
| --- | --- |
| `npm start` | Chạy server (dùng khi deploy) |
| `npm run dev` | Chạy server, tự khởi động lại khi sửa code |
| `npm run db:init` | Tạo bảng, nạp dữ liệu mẫu (không trùng) |
| `npm run db:reset` | Xóa toàn bộ bảng rồi tạo lại (mất dữ liệu) |

## Cấu trúc thư mục

```
audiohub-store/
├── server.js            # điểm vào: cấu hình Express, route tổng quan, 404/500
├── src/
│   ├── db.js            # pool kết nối PostgreSQL, tự xử lý SSL
│   ├── helpers.js       # helper Handlebars (định dạng giá, ngày)
│   └── routes/
│       ├── products.js  # CRUD + tìm kiếm sản phẩm
│       └── api.js       # /health và /api/products
├── db/
│   ├── schema.sql       # bảng categories, brands, products
│   ├── seed.sql         # dữ liệu mẫu
│   └── init.js          # chạy schema + seed (npm run db:init)
├── views/               # giao diện Handlebars
├── public/css/style.css
├── render.yaml          # (tùy chọn) Render Blueprint
└── .env.example
```

## Triển khai lên Render (tóm tắt)

1. Đẩy mã nguồn lên GitHub.
2. Render → New → PostgreSQL (Free) → lấy Internal và External Database URL.
3. Chạy `npm run db:init` từ máy cá nhân với `DATABASE_URL` = External URL.
4. Render → New → Web Service → chọn repo, Build `npm install`, Start `npm start`.
5. Mục Environment: `DATABASE_URL` = Internal URL, `NODE_ENV` = `production`.

Hướng dẫn chi tiết từng bước có trong báo cáo (Phần 4).
