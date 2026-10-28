require('dotenv').config();
const { Pool } = require('pg');

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.error('[DB] Thiếu biến môi trường DATABASE_URL. Hãy tạo file .env (xem .env.example) hoặc khai báo trong mục Environment của Render.');
  process.exit(1);
}

/**
 * Quyết định có bật SSL hay không.
 * - DB_SSL=true/false: ép theo cấu hình.
 * - Mặc định tự nhận diện theo hostname trong DATABASE_URL:
 *     + localhost / 127.0.0.1           -> không SSL
 *     + Internal URL của Render (dpg-xxxx-a, không có dấu chấm) -> không SSL
 *     + External URL (dpg-xxxx-a.<region>-postgres.render.com)  -> SSL
 */
function shouldUseSSL(url) {
  if (process.env.DB_SSL === 'true') return true;
  if (process.env.DB_SSL === 'false') return false;
  try {
    const { hostname } = new URL(url);
    const isLocal = ['localhost', '127.0.0.1', '::1'].includes(hostname);
    return !isLocal && hostname.includes('.');
  } catch (err) {
    return false;
  }
}

const useSSL = shouldUseSSL(connectionString);

const pool = new Pool({
  connectionString,
  ssl: useSSL ? { rejectUnauthorized: false } : false,
  max: 5,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});

pool.on('error', (err) => {
  console.error('[DB] Lỗi kết nối không mong muốn trên pool:', err.message);
});

module.exports = {
  pool,
  useSSL,
  query: (text, params) => pool.query(text, params),
};
