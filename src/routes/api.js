const express = require('express');
const db = require('../db');
const { searchProducts } = require('./products');
const { getMetrics } = require('../metrics');

const router = express.Router();

// GET /health - Render và UptimeRobot dùng đường dẫn này để kiểm tra dịch vụ còn sống
router.get('/health', async (req, res) => {
  try {
    const { rows } = await db.query('SELECT NOW() AS now');
    res.json({
      status: 'ok',
      database: 'connected',
      time: rows[0].now,
      metrics: getMetrics(),
    });
  } catch (err) {
    res.status(503).json({ status: 'error', database: 'unreachable', message: err.message });
  }
});

// GET /api/metrics - Thống kê hiệu năng xử lý request
router.get('/api/metrics', (req, res) => {
  res.json(getMetrics());
});

// GET /api/products?q=sony&category=1&page=1 - trả JSON, tiện kiểm thử bằng trình duyệt/Postman/curl
router.get('/api/products', async (req, res, next) => {
  try {
    const q = (req.query.q || '').toString().trim().slice(0, 100);
    const category = /^\d+$/.test(req.query.category || '') ? req.query.category : '';
    const page = /^\d+$/.test(req.query.page || '') ? Number(req.query.page) : 1;
    const result = await searchProducts({ q, category, page, pageSize: 20 });
    res.json({
      query: q,
      total: result.total,
      page: result.page,
      totalPages: result.totalPages,
      data: result.rows,
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
