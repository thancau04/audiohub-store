require('dotenv').config();
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const { engine } = require('express-handlebars');
const session = require('express-session');
const PgSession = require('connect-pg-simple')(session);
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const db = require('./src/db');
const helpers = require('./src/helpers');
const { attachLocals } = require('./src/auth');
const { metricsMiddleware } = require('./src/metrics');
const authRouter = require('./src/routes/auth');
const { router: productRouter } = require('./src/routes/products');
const inventoryRouter = require('./src/routes/inventory');
const ordersRouter = require('./src/routes/orders');
const reportsRouter = require('./src/routes/reports');
const apiRouter = require('./src/routes/api');
const { initDatabase } = require('./db/init');

const app = express();
const PORT = process.env.PORT || 3000; // Render cấp PORT tự động

if (process.env.NODE_ENV === 'production') {
  app.set('trust proxy', 1);
}

// Handlebars
app.engine('hbs', engine({ extname: '.hbs', defaultLayout: 'main', helpers }));
app.set('view engine', 'hbs');
app.set('views', path.join(__dirname, 'views'));

// Bảo mật HTTP headers (cho phép Google Fonts và ảnh từ Cloudinary/HTTPS)
app.disable('x-powered-by');
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        fontSrc: ["'self'", 'https://fonts.gstatic.com'],
        imgSrc: ["'self'", 'data:', 'https:'],
        connectSrc: ["'self'"],
      },
    },
  })
);

// Middleware cơ bản & đo thời gian xử lý request
app.use(metricsMiddleware);
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Giới hạn tần suất request chung (bỏ qua /health để UptimeRobot không bị chặn)
app.use(
  rateLimit({
    windowMs: 60 * 1000,
    max: 300,
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => req.path === '/health',
  })
);

// Session lưu trong PostgreSQL
let sessionSecret = process.env.SESSION_SECRET;
if (!sessionSecret) {
  sessionSecret = crypto.randomBytes(32).toString('hex');
  if (process.env.NODE_ENV === 'production') {
    console.warn('[WARN] Thiếu SESSION_SECRET trên môi trường production – đang dùng khóa tạm thời.');
  }
}

app.use(
  session({
    name: 'audiohub.sid',
    store: new PgSession({
      pool: db.pool,
      tableName: 'user_sessions',
      createTableIfMissing: true,
    }),
    secret: sessionSecret,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    },
  })
);

app.use(attachLocals);

// Đánh dấu mục menu đang mở
app.use((req, res, next) => {
  if (req.path === '/') res.locals.navActive = 'home';
  else if (req.path === '/products/new') res.locals.navActive = 'new';
  else if (req.path.startsWith('/products')) res.locals.navActive = 'products';
  else if (req.path.startsWith('/inventory')) res.locals.navActive = 'inventory';
  else if (req.path.startsWith('/orders')) res.locals.navActive = 'orders';
  else if (req.path.startsWith('/reports')) res.locals.navActive = 'reports';
  else if (req.path.startsWith('/admin')) res.locals.navActive = 'admin';
  next();
});

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

app.use('/', authRouter);
app.use('/products', productRouter);
app.use('/inventory', inventoryRouter);
app.use('/orders', ordersRouter);
app.use('/reports', reportsRouter);
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

  const shutdown = () => {
    console.log('Đang tắt server...');
    server.close(() => db.pool.end().then(() => process.exit(0)));
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

if (require.main === module) {
  start();
}

module.exports = { app, start };
