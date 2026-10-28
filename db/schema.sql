-- AudioHub: lược đồ cơ sở dữ liệu PostgreSQL
-- Quan hệ: categories 1-N products, brands 1-N products

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

CREATE INDEX IF NOT EXISTS idx_products_category   ON products (category_id);
CREATE INDEX IF NOT EXISTS idx_products_brand      ON products (brand_id);
CREATE INDEX IF NOT EXISTS idx_products_name_lower ON products (LOWER(name));
