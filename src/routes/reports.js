const express = require('express');
const db = require('../db');
const { requireAuth } = require('../auth');

const router = express.Router();

// Bảo vệ khỏi CSV formula injection khi mở bằng Excel
function csvCell(value) {
  let str = value === null || value === undefined ? '' : String(value);
  if (/^[=+\-@\t\r]/.test(str)) str = `'${str}`;
  return `"${str.replace(/"/g, '""')}"`;
}

function toCsv(headers, rows) {
  const lines = [headers.map(csvCell).join(',')];
  for (const row of rows) lines.push(row.map(csvCell).join(','));
  return `\uFEFF${lines.join('\r\n')}`;
}

router.get('/', requireAuth, async (req, res, next) => {
  try {
    const [summaryRes, topProductsRes, dailyRes, moveSummaryRes] = await Promise.all([
      db.query(`
        SELECT COUNT(*) FILTER (WHERE status = 'COMPLETED')::int AS completed_orders,
               COUNT(*) FILTER (WHERE status = 'CANCELLED')::int AS cancelled_orders,
               COALESCE(SUM(total_amount) FILTER (WHERE status = 'COMPLETED'), 0) AS total_revenue,
               COALESCE(SUM(total_amount) FILTER (
                 WHERE status = 'COMPLETED' AND created_at >= NOW() - INTERVAL '7 days'
               ), 0) AS revenue_7d
        FROM orders
      `),
      db.query(`
        SELECT oi.product_id, oi.product_name,
               SUM(oi.quantity)::int AS qty_sold,
               SUM(oi.line_total) AS revenue
        FROM order_items oi
        JOIN orders o ON o.id = oi.order_id
        WHERE o.status = 'COMPLETED'
        GROUP BY oi.product_id, oi.product_name
        ORDER BY qty_sold DESC, revenue DESC
        LIMIT 8
      `),
      db.query(`
        SELECT TO_CHAR(created_at AT TIME ZONE 'Asia/Ho_Chi_Minh', 'DD/MM/YYYY') AS day,
               DATE(created_at AT TIME ZONE 'Asia/Ho_Chi_Minh') AS sort_day,
               COUNT(*)::int AS orders_count,
               COALESCE(SUM(total_amount), 0) AS revenue
        FROM orders
        WHERE status = 'COMPLETED'
          AND created_at >= NOW() - INTERVAL '14 days'
        GROUP BY sort_day, day
        ORDER BY sort_day DESC
      `),
      db.query(`
        SELECT COUNT(*) FILTER (WHERE type = 'IN')::int AS total_in,
               COUNT(*) FILTER (WHERE type = 'OUT')::int AS total_out
        FROM stock_movements
      `),
    ]);

    res.render('reports/index', {
      title: 'Báo cáo & Xuất dữ liệu',
      summary: summaryRes.rows[0],
      moves: moveSummaryRes.rows[0],
      topProducts: topProductsRes.rows,
      daily: dailyRes.rows,
    });
  } catch (err) {
    next(err);
  }
});

router.get('/orders.csv', requireAuth, async (req, res, next) => {
  try {
    const { rows } = await db.query(`
      SELECT o.order_code, o.customer_name, o.customer_phone, o.total_amount,
             o.status, o.created_at, COALESCE(u.full_name, '') AS creator_name
      FROM orders o
      LEFT JOIN users u ON u.id = o.created_by
      ORDER BY o.created_at DESC, o.id DESC
    `);
    const csv = toCsv(
      ['Mã đơn', 'Khách hàng', 'Số điện thoại', 'Tổng tiền (VND)', 'Trạng thái', 'Người tạo', 'Ngày tạo'],
      rows.map((r) => [
        r.order_code,
        r.customer_name,
        r.customer_phone || '',
        r.total_amount,
        r.status,
        r.creator_name,
        new Date(r.created_at).toISOString(),
      ])
    );
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="audiohub-orders.csv"');
    res.send(csv);
  } catch (err) {
    next(err);
  }
});

router.get('/inventory.csv', requireAuth, async (req, res, next) => {
  try {
    const { rows } = await db.query(`
      SELECT p.sku, p.name, c.name AS category_name, b.name AS brand_name,
             p.price, p.stock, (p.price * p.stock) AS stock_value
      FROM products p
      JOIN categories c ON c.id = p.category_id
      JOIN brands b ON b.id = p.brand_id
      ORDER BY p.stock ASC, p.name ASC
    `);
    const csv = toCsv(
      ['SKU', 'Tên sản phẩm', 'Danh mục', 'Thương hiệu', 'Đơn giá (VND)', 'Tồn kho', 'Giá trị tồn (VND)'],
      rows.map((r) => [r.sku, r.name, r.category_name, r.brand_name, r.price, r.stock, r.stock_value])
    );
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="audiohub-inventory.csv"');
    res.send(csv);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
