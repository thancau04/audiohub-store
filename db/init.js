/**
 * Khởi tạo cơ sở dữ liệu: tạo bảng (schema.sql) và nạp dữ liệu mẫu (seed.sql).
 *
 * Cách dùng:
 *   npm run db:init     -> tạo bảng nếu chưa có, nạp dữ liệu mẫu (không trùng)
 *   npm run db:reset    -> XÓA toàn bộ bảng rồi tạo lại (mất hết dữ liệu!)
 *
 * Script dùng DATABASE_URL trong file .env, nên có thể chạy từ máy cá nhân
 * và trỏ tới PostgreSQL trên Render bằng "External Database URL".
 */
const fs = require('fs');
const path = require('path');

async function initDatabase(pool, { reset = false } = {}) {
  const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  const seed = fs.readFileSync(path.join(__dirname, 'seed.sql'), 'utf8');

  if (reset) {
    await pool.query('DROP TABLE IF EXISTS products, brands, categories CASCADE;');
    console.log('[DB] Đã xóa các bảng cũ.');
  }

  await pool.query(schema);
  console.log('[DB] Đã tạo bảng (nếu chưa có).');

  await pool.query(seed);
  const { rows } = await pool.query('SELECT COUNT(*)::int AS n FROM products');
  console.log(`[DB] Đã nạp dữ liệu mẫu. Hiện có ${rows[0].n} sản phẩm.`);
}

module.exports = { initDatabase };

// Chạy trực tiếp: node db/init.js [--reset]
if (require.main === module) {
  const { pool, useSSL } = require('../src/db');
  const reset = process.argv.includes('--reset');
  console.log(`[DB] Đang kết nối... (SSL: ${useSSL ? 'bật' : 'tắt'})`);
  initDatabase(pool, { reset })
    .then(() => pool.end())
    .catch(async (err) => {
      console.error('[DB] Khởi tạo thất bại:', err.message);
      await pool.end().catch(() => {});
      process.exit(1);
    });
}
