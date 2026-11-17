const express = require('express');
const crypto = require('crypto');
const db = require('../db');
const { requireAuth, requireAdmin, verifyCsrf } = require('../auth');

const router = express.Router();

function generateOrderCode() {
  const now = new Date();
  const ymd = now.toISOString().slice(0, 10).replace(/-/g, '');
  const rand = crypto.randomBytes(2).toString('hex').toUpperCase();
  return `DH-${ymd}-${rand}`;
}

function parseOrderItems(body) {
  const rawIds = Array.isArray(body.product_id) ? body.product_id : [body.product_id];
  const rawQtys = Array.isArray(body.quantity) ? body.quantity : [body.quantity];
  const merged = new Map();

  for (let i = 0; i < rawIds.length; i += 1) {
    const pid = /^\d+$/.test(String(rawIds[i] || '')) ? Number(rawIds[i]) : null;
    const qty = /^\d+$/.test(String(rawQtys[i] || '')) ? Number(rawQtys[i]) : 0;
    if (!pid && !qty) continue;
    if (!pid || qty <= 0) return { items: [], invalid: true };
    merged.set(pid, (merged.get(pid) || 0) + qty);
  }

  const items = [...merged.entries()]
    .map(([productId, quantity]) => ({ productId, quantity }))
    .sort((a, b) => a.productId - b.productId);
  return { items, invalid: false };
}

router.get('/', requireAuth, async (req, res, next) => {
  try {
    const { rows } = await db.query(`
      SELECT o.id, o.order_code, o.customer_name, o.customer_phone,
             o.total_amount, o.status, o.created_at,
             u.full_name AS creator_name,
             COUNT(oi.id)::int AS item_lines,
             COALESCE(SUM(oi.quantity), 0)::int AS total_qty
      FROM orders o
      LEFT JOIN users u ON u.id = o.created_by
      LEFT JOIN order_items oi ON oi.order_id = o.id
      GROUP BY o.id, u.full_name
      ORDER BY o.created_at DESC, o.id DESC
      LIMIT 50
    `);
    res.render('orders/list', {
      title: 'Đơn hàng',
      orders: rows.map((o) => ({ ...o, isCancelled: o.status === 'CANCELLED' })),
    });
  } catch (err) {
    next(err);
  }
});

router.get('/new', requireAuth, async (req, res, next) => {
  try {
    const { rows } = await db.query(
      'SELECT id, sku, name, price, stock FROM products WHERE stock > 0 ORDER BY name ASC'
    );
    res.render('orders/new', {
      title: 'Tạo đơn hàng',
      products: rows,
    });
  } catch (err) {
    next(err);
  }
});

router.post('/', requireAuth, verifyCsrf, async (req, res, next) => {
  const customerName = (req.body.customer_name || '').toString().trim();
  const customerPhone = (req.body.customer_phone || '').toString().trim().slice(0, 25);
  const note = (req.body.note || '').toString().trim().slice(0, 500);
  const { items, invalid } = parseOrderItems(req.body);

  const errors = [];
  if (!customerName || customerName.length > 120) errors.push('Tên khách hàng không được để trống (tối đa 120 ký tự).');
  if (invalid || !items.length) errors.push('Vui lòng chọn ít nhất 1 sản phẩm với số lượng hợp lệ (> 0).');

  const renderWithError = async (status, errs) => {
    const { rows } = await db.query(
      'SELECT id, sku, name, price, stock FROM products WHERE stock > 0 ORDER BY name ASC'
    );
    return res.status(status).render('orders/new', {
      title: 'Tạo đơn hàng',
      products: rows,
      errors: errs,
      form: { customer_name: customerName, customer_phone: customerPhone, note },
    });
  };

  if (errors.length) return renderWithError(400, errors);

  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');

    const lockedProducts = [];
    for (const item of items) {
      const pRes = await client.query(
        'SELECT id, name, price, stock FROM products WHERE id = $1 FOR UPDATE',
        [item.productId]
      );
      if (!pRes.rows.length) {
        await client.query('ROLLBACK');
        return renderWithError(400, ['Có sản phẩm không tồn tại trong hệ thống.']);
      }
      const prod = pRes.rows[0];
      if (prod.stock < item.quantity) {
        await client.query('ROLLBACK');
        return renderWithError(400, [
          `"${prod.name}" chỉ còn ${prod.stock} chiếc, không đủ số lượng ${item.quantity}.`,
        ]);
      }
      lockedProducts.push({ ...prod, quantity: item.quantity });
    }

    const totalAmount = lockedProducts.reduce(
      (sum, p) => sum + Number(p.price) * p.quantity,
      0
    );
    const orderCode = generateOrderCode();

    const orderRes = await client.query(
      `INSERT INTO orders (order_code, customer_name, customer_phone, total_amount, status, note, created_by)
       VALUES ($1, $2, $3, $4, 'COMPLETED', $5, $6)
       RETURNING id`,
      [orderCode, customerName, customerPhone || null, totalAmount, note || null, req.session.user.id]
    );
    const orderId = orderRes.rows[0].id;

    for (const p of lockedProducts) {
      const nextStock = p.stock - p.quantity;
      const lineTotal = Number(p.price) * p.quantity;
      await client.query('UPDATE products SET stock = $1, updated_at = NOW() WHERE id = $2', [
        nextStock,
        p.id,
      ]);
      await client.query(
        `INSERT INTO order_items (order_id, product_id, product_name, unit_price, quantity, line_total)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [orderId, p.id, p.name, p.price, p.quantity, lineTotal]
      );
      await client.query(
        `INSERT INTO stock_movements (product_id, user_id, type, quantity, stock_after, note)
         VALUES ($1, $2, 'OUT', $3, $4, $5)`,
        [p.id, req.session.user.id, p.quantity, nextStock, `Xuất bán đơn ${orderCode}`]
      );
    }

    await client.query('COMMIT');
    return res.redirect(`/orders/${orderId}?msg=created`);
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    return next(err);
  } finally {
    client.release();
  }
});

router.get('/:id', requireAuth, async (req, res, next) => {
  try {
    const id = /^\d+$/.test(req.params.id) ? Number(req.params.id) : null;
    if (!id) return next();

    const [orderRes, itemsRes] = await Promise.all([
      db.query(
        `SELECT o.*, u.full_name AS creator_name
         FROM orders o LEFT JOIN users u ON u.id = o.created_by
         WHERE o.id = $1`,
        [id]
      ),
      db.query(
        `SELECT oi.*, p.sku
         FROM order_items oi LEFT JOIN products p ON p.id = oi.product_id
         WHERE oi.order_id = $1 ORDER BY oi.id ASC`,
        [id]
      ),
    ]);
    if (!orderRes.rows.length) return next();

    const messages = {
      created: 'Đã tạo đơn hàng và trừ tồn kho thành công.',
      cancelled: 'Đã hủy đơn hàng và hoàn trả tồn kho.',
    };
    const order = orderRes.rows[0];
    res.render('orders/detail', {
      title: `Đơn ${order.order_code}`,
      order: { ...order, isCancelled: order.status === 'CANCELLED' },
      items: itemsRes.rows,
      flash: messages[req.query.msg] || null,
    });
  } catch (err) {
    next(err);
  }
});

router.post('/:id/cancel', requireAdmin, verifyCsrf, async (req, res, next) => {
  const id = /^\d+$/.test(req.params.id) ? Number(req.params.id) : null;
  if (!id) return next();

  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    const orderRes = await client.query(
      'SELECT id, order_code, status FROM orders WHERE id = $1 FOR UPDATE',
      [id]
    );
    if (!orderRes.rows.length) {
      await client.query('ROLLBACK');
      return next();
    }
    const order = orderRes.rows[0];
    if (order.status === 'CANCELLED') {
      await client.query('ROLLBACK');
      return res.redirect(`/orders/${id}`);
    }

    const itemsRes = await client.query(
      'SELECT product_id, quantity FROM order_items WHERE order_id = $1 ORDER BY product_id ASC',
      [id]
    );
    for (const item of itemsRes.rows) {
      const pRes = await client.query('SELECT stock FROM products WHERE id = $1 FOR UPDATE', [
        item.product_id,
      ]);
      if (pRes.rows.length) {
        const nextStock = pRes.rows[0].stock + item.quantity;
        await client.query('UPDATE products SET stock = $1, updated_at = NOW() WHERE id = $2', [
          nextStock,
          item.product_id,
        ]);
        await client.query(
          `INSERT INTO stock_movements (product_id, user_id, type, quantity, stock_after, note)
           VALUES ($1, $2, 'IN', $3, $4, $5)`,
          [item.product_id, req.session.user.id, item.quantity, nextStock, `Hoàn kho hủy đơn ${order.order_code}`]
        );
      }
    }

    await client.query("UPDATE orders SET status = 'CANCELLED' WHERE id = $1", [id]);
    await client.query('COMMIT');
    return res.redirect(`/orders/${id}?msg=cancelled`);
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    return next(err);
  } finally {
    client.release();
  }
});

module.exports = router;
