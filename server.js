require('dotenv').config();
const path = require('path');
const express = require('express');
const { engine } = require('express-handlebars');

const db = require('./src/db');
const helpers = require('./src/helpers');
const { router: productRouter } = require('./src/routes/products');
const apiRouter = require('./src/routes/api');
const { initDatabase } = require('./db/init');

const app = express();
const PORT = process.env.PORT || 3000; // Render cấp PORT tự động

// Handlebars
app.engine('hbs', engine({ extname: '.hbs', defaultLayout: 'main', helpers }));
app.set('view engine', 'hbs');
app.set('views', path.join(__dirname, 'views'));

// Middleware
app.disable('x-powered-by');
app.use(express.urlencoded({ extended: false }));
app.use(express.static(path.join(__dirname, 'public')));

// Trang tổng quan
app.get('/', async (req, res, next) => {
  try {
    const [stats, latest, lowStock, byCategory] = await Promise.all([
      db.query(`
        SELECT COUNT(*)::int AS total_products,
               COALESCE(SUM(stock), 0)::int AS total_stock,
               COALESCE(SUM(price * stock), 0) AS stock_value,
               COUNT(*) FILTER (WHERE stock <= 5)::int AS low_stock
        FROM products`),
      db.query(`
        SELECT p.id, p.name, p.price, p.stock, b.name AS brand_name
        FROM products p JOIN brands b ON b.id = p.brand_id
        ORDER BY p.created_at DESC, p.id DESC LIMIT 5`),
      db.query(`
        SELECT id, name, stock FROM products
        WHERE stock <= 5 ORDER BY stock ASC, name LIMIT 5`),
      db.query(`
        SELECT c.name, COUNT(p.id)::int AS n
        FROM categories c LEFT JOIN products p ON p.category_id = c.id
        GROUP BY c.id ORDER BY n DESC, c.name`),
    ]);
    res.render('home', {
      title: 'Tổng quan',
      stats: stats.rows[0],
      latest: latest.rows,
      lowStock: lowStock.rows,
      byCategory: byCategory.rows,
    });
  } catch (err) {
    next(err);
  }
});

app.use('/products', productRouter);
app.use('/', apiRouter);

// 404
app.use((req, res) => {
  res.status(404).render('error', {
    title: 'Không tìm thấy trang',
    code: 404,
    message: 'Trang bạn tìm không tồn tại hoặc sản phẩm đã bị xóa.',
  });
});

// Xử lý lỗi chung
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error('[ERROR]', err);
  res.status(500).render('error', {
    title: 'Lỗi máy chủ',
    code: 500,
    message: 'Đã có lỗi xảy ra. Vui lòng thử lại sau.',
  });
});

async function start() {
  if (process.env.AUTO_DB_INIT === 'true') {
    try {
      await initDatabase(db.pool);
    } catch (err) {
      console.error('[DB] AUTO_DB_INIT thất bại:', err.message);
    }
  }
  const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`AudioHub đang chạy ở cổng ${PORT} (SSL DB: ${db.useSSL ? 'bật' : 'tắt'})`);
  });

  // Render gửi SIGTERM khi redeploy hoặc tắt dịch vụ -> đóng gọn gàng
  const shutdown = () => {
    console.log('Đang tắt server...');
    server.close(() => db.pool.end().then(() => process.exit(0)));
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

start();
