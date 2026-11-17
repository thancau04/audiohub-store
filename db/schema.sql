-- AudioHub: lược đồ cơ sở dữ liệu PostgreSQL
-- Quan hệ: categories 1-N products, brands 1-N products,
--          users 1-N stock_movements / orders, orders 1-N order_items

CREATE TABLE IF NOT EXISTS categories (
  id          SERIAL PRIMARY KEY,
  name        VARCHAR(100) NOT NULL UNIQUE,
  description TEXT
);

CREATE TABLE IF NOT EXISTS brands (
  id      SERIAL PRIMARY KEY,
  name    VARCHAR(100) NOT NULL UNIQUE,
  country VARCHAR(60)
);

CREATE TABLE IF NOT EXISTS products (
  id                 SERIAL PRIMARY KEY,
  sku                VARCHAR(40)  NOT NULL UNIQUE,
  name               VARCHAR(200) NOT NULL,
  category_id        INTEGER      NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
  brand_id           INTEGER      NOT NULL REFERENCES brands(id)     ON DELETE RESTRICT,
  price              NUMERIC(12,0) NOT NULL CHECK (price >= 0),   -- đơn vị: VND
  stock              INTEGER      NOT NULL DEFAULT 0 CHECK (stock >= 0),
  connection_type    VARCHAR(40)  NOT NULL DEFAULT 'Có dây',
  impedance_ohm      INTEGER      CHECK (impedance_ohm IS NULL OR impedance_ohm > 0),
  driver_size_mm     INTEGER      CHECK (driver_size_mm IS NULL OR driver_size_mm > 0),
  frequency_response VARCHAR(60),
  description        TEXT,
  image_url          TEXT,
  created_at         TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS users (
  id            SERIAL PRIMARY KEY,
  username      VARCHAR(50)  NOT NULL UNIQUE,
  password_hash TEXT         NOT NULL,
  full_name     VARCHAR(100) NOT NULL,
  role          VARCHAR(20)  NOT NULL DEFAULT 'staff' CHECK (role IN ('admin', 'staff')),
  is_active     BOOLEAN      NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Bảng lưu session cho express-session (connect-pg-simple)
CREATE TABLE IF NOT EXISTS user_sessions (
  sid    VARCHAR     NOT NULL PRIMARY KEY,
  sess   JSON        NOT NULL,
  expire TIMESTAMPTZ NOT NULL
);

-- Lịch sử nhập / xuất kho
CREATE TABLE IF NOT EXISTS stock_movements (
  id          SERIAL PRIMARY KEY,
  product_id  INTEGER     NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  user_id     INTEGER     REFERENCES users(id) ON DELETE SET NULL,
  type        VARCHAR(10) NOT NULL CHECK (type IN ('IN', 'OUT')),
  quantity    INTEGER     NOT NULL CHECK (quantity > 0),
  stock_after INTEGER     NOT NULL CHECK (stock_after >= 0),
  note        VARCHAR(255),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Đơn hàng bán lẻ
CREATE TABLE IF NOT EXISTS orders (
  id             SERIAL PRIMARY KEY,
  order_code     VARCHAR(30)   NOT NULL UNIQUE,
  customer_name  VARCHAR(120)  NOT NULL,
  customer_phone VARCHAR(25),
  total_amount   NUMERIC(12,0) NOT NULL CHECK (total_amount >= 0),
  status         VARCHAR(20)   NOT NULL DEFAULT 'COMPLETED' CHECK (status IN ('COMPLETED', 'CANCELLED')),
  note           TEXT,
  created_by     INTEGER       REFERENCES users(id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS order_items (
  id           SERIAL PRIMARY KEY,
  order_id     INTEGER       NOT NULL REFERENCES orders(id)   ON DELETE CASCADE,
  product_id   INTEGER       NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  product_name VARCHAR(200)  NOT NULL,
  unit_price   NUMERIC(12,0) NOT NULL CHECK (unit_price >= 0),
  quantity     INTEGER       NOT NULL CHECK (quantity > 0),
  line_total   NUMERIC(12,0) NOT NULL CHECK (line_total >= 0)
);

CREATE INDEX IF NOT EXISTS idx_products_category       ON products (category_id);
CREATE INDEX IF NOT EXISTS idx_products_brand          ON products (brand_id);
CREATE INDEX IF NOT EXISTS idx_products_name_lower     ON products (LOWER(name));
CREATE INDEX IF NOT EXISTS idx_user_sessions_expire    ON user_sessions (expire);
CREATE INDEX IF NOT EXISTS idx_stock_movements_created ON stock_movements (created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_orders_created          ON orders (created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_order_items_order       ON order_items (order_id);
