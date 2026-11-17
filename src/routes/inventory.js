const express = require('express');
const db = require('../db');
const { requireAuth, verifyCsrf } = require('../auth');

const router = express.Router();

async function loadInventoryPageData() {
  const [productsRes, movementsRes] = await Promise.all([
    db.query('SELECT id, sku, name, stock FROM products ORDER BY name ASC'),
    db.query(`
      SELECT m.id, m.type, m.quantity, m.stock_after, m.note, m.created_at,
             p.id AS product_id, p.sku, p.name AS product_name,
             u.full_name AS actor_name
      FROM stock_movements m
      JOIN products p ON p.id = m.product_id
      LEFT JOIN users u ON u.id = m.user_id
      ORDER BY m.created_at DESC, m.id DESC
      LIMIT 40
    `),
  ]);
  return { products: productsRes.rows, movements: movementsRes.rows };
}

router.get('/', requireAuth, async (req, res, next) => {
  try {
    const data = await loadInventoryPageData();
    const messages = {
      in: 'Đã ghi nhận phiếu nhập kho.',
      out: 'Đã ghi nhận phiếu xuất kho.',
    };
    res.render('inventory/index', {
      title: 'Nhập / Xuất kho',
      ...data,
      flash: messages[req.query.msg] || null,
    });
  } catch (err) {
    next(err);
  }
});

router.post('/adjust', requireAuth, verifyCsrf, async (req, res, next) => {
  const productId = /^\d+$/.test(req.body.product_id || '') ? Number(req.body.product_id) : null;
  const type = req.body.type === 'OUT' ? 'OUT' : req.body.type === 'IN' ? 'IN' : null;
  const quantity = /^\d+$/.test(req.body.quantity || '') ? Number(req.body.quantity) : 0;
  const note = (req.body.note || '').toString().trim().slice(0, 255);

  const errors = [];
  if (!productId) errors.push('Vui lòng chọn sản phẩm.');
  if (!type) errors.push('Loại phiếu phải là Nhập kho hoặc Xuất kho.');
  if (quantity <= 0) errors.push('Số lượng phải là số nguyên dương.');

  if (errors.length) {
    const data = await loadInventoryPageData().catch(() => ({ products: [], movements: [] }));
    return res.status(400).render('inventory/index', {
      title: 'Nhập / Xuất kho',
      ...data,
      errors,
      form: { product_id: productId, type: type || 'IN', quantity: req.body.quantity, note },
    });
  }

  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    const prodRes = await client.query(
      'SELECT id, name, stock FROM products WHERE id = $1 FOR UPDATE',
      [productId]
    );
    if (!prodRes.rows.length) {
      await client.query('ROLLBACK');
      const data = await loadInventoryPageData();
      return res.status(404).render('inventory/index', {
        title: 'Nhập / Xuất kho',
        ...data,
        errors: ['Sản phẩm không tồn tại.'],
      });
    }

    const currentStock = prodRes.rows[0].stock;
    if (type === 'OUT' && currentStock < quantity) {
      await client.query('ROLLBACK');
      const data = await loadInventoryPageData();
      return res.status(400).render('inventory/index', {
        title: 'Nhập / Xuất kho',
        ...data,
        errors: [`"${prodRes.rows[0].name}" chỉ còn ${currentStock} sản phẩm trong kho, không đủ để xuất ${quantity}.`],
        form: { product_id: productId, type, quantity, note },
      });
    }

    const nextStock = type === 'IN' ? currentStock + quantity : currentStock - quantity;
    await client.query('UPDATE products SET stock = $1, updated_at = NOW() WHERE id = $2', [
      nextStock,
      productId,
    ]);
    await client.query(
      `INSERT INTO stock_movements (product_id, user_id, type, quantity, stock_after, note)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        productId,
        req.session.user.id,
        type,
        quantity,
        nextStock,
        note || (type === 'IN' ? 'Nhập kho thủ công' : 'Xuất kho thủ công'),
      ]
    );
    await client.query('COMMIT');
    return res.redirect(`/inventory?msg=${type === 'IN' ? 'in' : 'out'}`);
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    return next(err);
  } finally {
    client.release();
  }
});

module.exports = router;
