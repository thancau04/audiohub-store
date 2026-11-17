-- AudioHub: dữ liệu mẫu (thông số và giá mang tính minh họa cho đồ án)
-- Có thể chạy nhiều lần: ON CONFLICT DO NOTHING giúp không bị trùng dữ liệu.

INSERT INTO categories (name, description) VALUES
  ('Tai nghe chụp tai',  'Tai nghe over-ear / on-ear, nghe nhạc và chơi game'),
  ('Tai nghe in-ear',    'Tai nghe nhét tai (IEM), nhỏ gọn, âm thanh chi tiết'),
  ('Tai nghe true wireless', 'Tai nghe không dây hoàn toàn, có hộp sạc'),
  ('Loa Bluetooth',      'Loa di động kết nối không dây'),
  ('Loa để bàn',         'Loa vi tính / bookshelf cho góc làm việc và giải trí'),
  ('Micro',              'Micro thu âm, livestream, họp trực tuyến'),
  ('DAC / Amp',          'Bộ giải mã và khuếch đại tai nghe'),
  ('Phụ kiện',           'Dây cáp, đệm tai, giá treo, túi đựng')
ON CONFLICT (name) DO NOTHING;

INSERT INTO brands (name, country) VALUES
  ('Sony', 'Nhật Bản'),
  ('Sennheiser', 'Đức'),
  ('Audio-Technica', 'Nhật Bản'),
  ('JBL', 'Mỹ'),
  ('Bose', 'Mỹ'),
  ('HyperX', 'Mỹ'),
  ('Moondrop', 'Trung Quốc'),
  ('FiiO', 'Trung Quốc'),
  ('Shure', 'Mỹ'),
  ('Edifier', 'Trung Quốc')
ON CONFLICT (name) DO NOTHING;

INSERT INTO products
  (sku, name, category_id, brand_id, price, stock, connection_type,
   impedance_ohm, driver_size_mm, frequency_response, description, image_url)
SELECT v.sku, v.name, c.id, b.id, v.price::numeric, v.stock::int, v.conn,
       v.imp::int, v.drv::int, v.freq, v.descr, v.img
FROM (VALUES
  ('SNY-WH1000XM5', 'Sony WH-1000XM5', 'Tai nghe chụp tai', 'Sony', 7490000, 12, 'Bluetooth', 48, 30, '4 Hz - 40 kHz',
   'Tai nghe chống ồn chủ động, pin dài, đàm thoại rõ.', NULL),
  ('SEN-HD600', 'Sennheiser HD 600', 'Tai nghe chụp tai', 'Sennheiser', 7990000, 5, 'Có dây', 300, 42, '12 Hz - 40.5 kHz',
   'Tai nghe open-back cho phòng thu và nghe nhạc audiophile.', NULL),
  ('ATH-M50X', 'Audio-Technica ATH-M50x', 'Tai nghe chụp tai', 'Audio-Technica', 3490000, 18, 'Có dây', 38, 45, '15 Hz - 28 kHz',
   'Tai nghe kiểm âm phổ biến, gập gọn, kèm 3 dây rời.', NULL),
  ('HPX-CLOUD2', 'HyperX Cloud II', 'Tai nghe chụp tai', 'HyperX', 1990000, 25, 'Có dây', 60, 53, '15 Hz - 25 kHz',
   'Tai nghe gaming, âm thanh vòm 7.1 giả lập, mic tháo rời.', NULL),
  ('BOS-QC45', 'Bose QuietComfort 45', 'Tai nghe chụp tai', 'Bose', 6490000, 3, 'Bluetooth', NULL, NULL, NULL,
   'Chống ồn thoải mái khi đeo lâu, 2 chế độ Quiet và Aware.', NULL),
  ('MDP-ARIA2', 'Moondrop Aria 2', 'Tai nghe in-ear', 'Moondrop', 2390000, 14, 'Có dây', 32, 10, '5 Hz - 36 kHz',
   'IEM driver động, tuning gần chuẩn Harman, cáp tháo rời.', NULL),
  ('SHR-SE215', 'Shure SE215', 'Tai nghe in-ear', 'Shure', 2590000, 9, 'Có dây', 17, 9, '22 Hz - 17.5 kHz',
   'IEM cách âm tốt, phổ biến cho biểu diễn sân khấu.', NULL),
  ('SNY-WF1000XM5', 'Sony WF-1000XM5', 'Tai nghe true wireless', 'Sony', 6490000, 10, 'Bluetooth', NULL, 8, '20 Hz - 20 kHz',
   'True wireless chống ồn, nhỏ gọn, hộp sạc không dây.', NULL),
  ('JBL-TUNE230NC', 'JBL Tune 230NC TWS', 'Tai nghe true wireless', 'JBL', 1790000, 30, 'Bluetooth', NULL, 11, '20 Hz - 20 kHz',
   'True wireless giá phổ thông, chống ồn chủ động, 40 giờ pin kèm hộp.', NULL),
  ('JBL-FLIP6', 'JBL Flip 6', 'Loa Bluetooth', 'JBL', 2790000, 20, 'Bluetooth', NULL, NULL, '63 Hz - 20 kHz',
   'Loa di động chống nước bụi IP67, âm bass mạnh.', NULL),
  ('JBL-CHARGE5', 'JBL Charge 5', 'Loa Bluetooth', 'JBL', 3990000, 4, 'Bluetooth', NULL, NULL, '65 Hz - 20 kHz',
   'Loa Bluetooth pin lớn, có thể sạc ngược cho điện thoại.', NULL),
  ('EDF-R1280DB', 'Edifier R1280DB', 'Loa để bàn', 'Edifier', 3290000, 15, 'Có dây + Bluetooth', NULL, NULL, '55 Hz - 20 kHz',
   'Loa bookshelf 2.0 có Bluetooth, cổng quang và coaxial.', NULL),
  ('EDF-MR4', 'Edifier MR4', 'Loa để bàn', 'Edifier', 3990000, 2, 'Có dây', NULL, NULL, '60 Hz - 40 kHz',
   'Loa kiểm âm monitor cho làm nhạc tại nhà.', NULL),
  ('SHR-MV7', 'Shure MV7', 'Micro', 'Shure', 6990000, 6, 'Có dây', NULL, NULL, '50 Hz - 16 kHz',
   'Micro dynamic USB và XLR cho podcast và livestream.', NULL),
  ('HPX-QUADCAST', 'HyperX QuadCast S', 'Micro', 'HyperX', 3190000, 11, 'Có dây', NULL, NULL, '20 Hz - 20 kHz',
   'Micro condenser USB có đèn RGB, 4 chế độ thu âm.', NULL),
  ('FII-KA3', 'FiiO KA3', 'DAC / Amp', 'FiiO', 2490000, 8, 'Có dây', NULL, NULL, NULL,
   'DAC/Amp di động USB-C, cổng 3.5mm và 4.4mm balanced.', NULL),
  ('FII-K5PRO', 'FiiO K5 Pro', 'DAC / Amp', 'FiiO', 3290000, 1, 'Có dây', NULL, NULL, NULL,
   'DAC/Amp để bàn, đầu ra 6.35mm, 4.4mm và XLR.', NULL),
  ('MDP-CABLE-44', 'Dây nâng cấp 4.4mm Moondrop', 'Phụ kiện', 'Moondrop', 590000, 40, 'Có dây', NULL, NULL, NULL,
   'Dây bạc mạ đồng, jack 4.4mm balanced, chân 2-pin 0.78mm.', NULL)
) AS v(sku, name, cat, brand, price, stock, conn, imp, drv, freq, descr, img)
JOIN categories c ON c.name = v.cat
JOIN brands b     ON b.name = v.brand
ON CONFLICT (sku) DO NOTHING;

-- Tài khoản mặc định (mật khẩu được băm bằng scrypt: Admin@123 và Staff@123)
INSERT INTO users (username, password_hash, full_name, role) VALUES
  ('admin', '7895d0bc3c3cd7fa17ee0a48989ccc0d:73070f138e4963df4b50a8e91234728fea6a045f44776f2d1aecba53bf118c040d5b791f6a03c83fce47bd4e0fb52792cfbd1fd72ae9b72efaae5a55e5d475f4', 'Quản trị viên', 'admin'),
  ('staff', '239cdce047bd2d77ce28516897dbee5c:5271a8cc6bb0a835cf4fd94cec9aa9e3a7899ec794f8f05ba4dea182fb3cb0a6e33a57add976edf4a78e23ff8978ef5fae3e095d8c81455ff6eb2e66bc8cb6a9', 'Nhân viên bán hàng', 'staff')
ON CONFLICT (username) DO NOTHING;

-- Phiếu nhập kho minh họa (chỉ nạp khi bảng còn trống)
INSERT INTO stock_movements (product_id, user_id, type, quantity, stock_after, note)
SELECT p.id, u.id, 'IN', 5, p.stock, 'Nhập lô hàng đầu kỳ'
FROM products p
CROSS JOIN (SELECT id FROM users WHERE username = 'admin' LIMIT 1) u
WHERE p.sku IN ('SNY-WH1000XM5', 'ATH-M50X', 'JBL-FLIP6')
  AND NOT EXISTS (SELECT 1 FROM stock_movements);

-- Đơn hàng minh họa (chỉ nạp khi bảng orders còn trống)
INSERT INTO orders (order_code, customer_name, customer_phone, total_amount, status, note, created_by)
SELECT 'DH-202611-001', 'Nguyễn Minh Tuấn', '0901234567', 9880000, 'COMPLETED', 'Khách mua trực tiếp tại quầy', u.id
FROM users u
WHERE u.username = 'staff'
  AND NOT EXISTS (SELECT 1 FROM orders WHERE order_code = 'DH-202611-001');

INSERT INTO order_items (order_id, product_id, product_name, unit_price, quantity, line_total)
SELECT o.id, p.id, p.name, p.price, v.qty, p.price * v.qty
FROM orders o
JOIN (VALUES ('SNY-WH1000XM5', 1), ('MDP-ARIA2', 1)) AS v(sku, qty) ON TRUE
JOIN products p ON p.sku = v.sku
WHERE o.order_code = 'DH-202611-001'
  AND NOT EXISTS (SELECT 1 FROM order_items WHERE order_id = o.id);

