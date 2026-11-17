const express = require('express');
const multer = require('multer');
const db = require('../db');
const cloudinary = require('../cloudinary');
const { requireAuth, requireAdmin, verifyCsrf } = require('../auth');

const router = express.Router();

const PAGE_SIZE = 8;
const CONNECTION_TYPES = ['Có dây', 'Bluetooth', 'Có dây + Bluetooth', 'Không dây 2.4GHz'];
const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
const MESSAGES = {
  created: 'Đã thêm sản phẩm mới.',
  updated: 'Đã cập nhật sản phẩm.',
  deleted: 'Đã xóa sản phẩm.',
};

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter(req, file, cb) {
    if (!ALLOWED_MIME.has(file.mimetype)) {
      return cb(new Error('Chỉ hỗ trợ file ảnh JPG, PNG, WebP hoặc GIF.'));
    }
    return cb(null, true);
  },
});

// Parse multipart/form-data trước khi verifyCsrf để có req.body._csrf
function parseProductUpload(req, res, next) {
  upload.single('image_file')(req, res, (err) => {
    if (err) {
      req.uploadError =
        err.code === 'LIMIT_FILE_SIZE'
          ? 'File ảnh vượt quá giới hạn 5MB.'
          : err.message || 'Không thể đọc file ảnh tải lên.';
    }
    next();
  });
}

const BASE_SELECT = `
  SELECT p.*, c.name AS category_name, b.name AS brand_name
  FROM products p
  JOIN categories c ON c.id = p.category_id
  JOIN brands b     ON b.id = p.brand_id
`;

// ---------- Hàm dùng chung ----------

async function loadLookups() {
  const [categories, brands] = await Promise.all([
    db.query('SELECT id, name FROM categories ORDER BY name'),
    db.query('SELECT id, name FROM brands ORDER BY name'),
  ]);
  return { categories: categories.rows, brands: brands.rows };
}

function withSelected(rows, selectedId) {
  return rows.map((r) => ({ ...r, selected: String(r.id) === String(selectedId) }));
}

function connectionOptions(selected) {
  return CONNECTION_TYPES.map((name) => ({ name, selected: name === selected }));
}

function parseId(raw) {
  return /^\d+$/.test(raw) ? Number(raw) : null;
}

function validateProduct(body) {
  const str = (v) => (typeof v === 'string' ? v.trim() : '');
  const values = {
    sku: str(body.sku).toUpperCase(),
    name: str(body.name),
    category_id: str(body.category_id),
    brand_id: str(body.brand_id),
    price: str(body.price),
    stock: str(body.stock),
    connection_type: str(body.connection_type) || CONNECTION_TYPES[0],
    impedance_ohm: str(body.impedance_ohm),
    driver_size_mm: str(body.driver_size_mm),
    frequency_response: str(body.frequency_response),
    image_url: str(body.image_url),
    description: str(body.description),
  };
  const errors = [];

  if (!values.sku) errors.push('Mã SKU không được để trống.');
  else if (values.sku.length > 40) errors.push('Mã SKU tối đa 40 ký tự.');

  if (!values.name) errors.push('Tên sản phẩm không được để trống.');
  else if (values.name.length > 200) errors.push('Tên sản phẩm tối đa 200 ký tự.');

  if (!parseId(values.category_id)) errors.push('Vui lòng chọn danh mục.');
  if (!parseId(values.brand_id)) errors.push('Vui lòng chọn thương hiệu.');

  if (!/^\d+$/.test(values.price)) errors.push('Giá phải là số nguyên không âm (VND).');
  if (!/^\d+$/.test(values.stock)) errors.push('Tồn kho phải là số nguyên không âm.');

  for (const [field, label] of [['impedance_ohm', 'Trở kháng'], ['driver_size_mm', 'Kích thước driver']]) {
    if (values[field] && !/^[1-9]\d*$/.test(values[field])) {
      errors.push(`${label} phải là số nguyên dương hoặc để trống.`);
    }
  }
  if (!CONNECTION_TYPES.includes(values.connection_type)) {
    errors.push('Kiểu kết nối không hợp lệ.');
  }
  if (values.image_url && !/^https?:\/\//i.test(values.image_url)) {
    errors.push('Link ảnh phải bắt đầu bằng http:// hoặc https://.');
  }
  return { values, errors };
}

function toParams(v) {
  return [
    v.sku, v.name, Number(v.category_id), Number(v.brand_id), Number(v.price), Number(v.stock),
    v.connection_type,
    v.impedance_ohm ? Number(v.impedance_ohm) : null,
    v.driver_size_mm ? Number(v.driver_size_mm) : null,
    v.frequency_response || null,
    v.description || null,
    v.image_url || null,
  ];
}

function dbErrorMessage(err) {
  if (err.code === '23505') return 'Mã SKU đã tồn tại, vui lòng dùng mã khác.';
  if (err.code === '23503') return 'Danh mục hoặc thương hiệu không tồn tại.';
  if (err.code === '23514') return 'Dữ liệu vi phạm ràng buộc của cơ sở dữ liệu (giá, tồn kho hoặc thông số).';
  return null;
}

async function renderForm(res, { status = 200, title, action, submitLabel, values, errors = [] }) {
  const { categories, brands } = await loadLookups();
  res.status(status).render('products/form', {
    title,
    action,
    submitLabel,
    errors,
    p: values,
    cloudinaryReady: cloudinary.isConfigured(),
    categories: withSelected(categories, values.category_id),
    brands: withSelected(brands, values.brand_id),
    connectionTypes: connectionOptions(values.connection_type),
  });
}

const EMPTY_PRODUCT = {
  sku: '', name: '', category_id: '', brand_id: '', price: '', stock: '0',
  connection_type: CONNECTION_TYPES[0], impedance_ohm: '', driver_size_mm: '',
  frequency_response: '', image_url: '', description: '',
};

async function searchProducts({ q = '', category = '', page = 1, pageSize = PAGE_SIZE }) {
  const where = [];
  const params = [];

  if (q) {
    params.push(`%${q}%`);
    const i = params.length;
    where.push(`(p.name ILIKE $${i} OR p.sku ILIKE $${i} OR b.name ILIKE $${i})`);
  }
  if (category) {
    params.push(Number(category));
    where.push(`p.category_id = $${params.length}`);
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const countRes = await db.query(
    `SELECT COUNT(*)::int AS total
     FROM products p JOIN brands b ON b.id = p.brand_id ${whereSql}`,
    params
  );
  const total = countRes.rows[0].total;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const current = Math.min(Math.max(1, page), totalPages);

  const listParams = [...params, pageSize, (current - 1) * pageSize];
  const listRes = await db.query(
    `${BASE_SELECT} ${whereSql}
     ORDER BY p.id DESC
     LIMIT $${listParams.length - 1} OFFSET $${listParams.length}`,
    listParams
  );
  return { rows: listRes.rows, total, totalPages, page: current };
}

// ---------- Các route ----------

router.get('/', async (req, res, next) => {
  try {
    const q = (req.query.q || '').toString().trim().slice(0, 100);
    const category = parseId((req.query.category || '').toString()) || '';
    const page = parseId((req.query.page || '1').toString()) || 1;

    const [result, lookups] = await Promise.all([
      searchProducts({ q, category, page }),
      loadLookups(),
    ]);

    const buildUrl = (p) => {
      const sp = new URLSearchParams();
      if (q) sp.set('q', q);
      if (category) sp.set('category', String(category));
      sp.set('page', String(p));
      return `/products?${sp.toString()}`;
    };

    res.render('products/list', {
      title: 'Sản phẩm',
      products: result.rows,
      total: result.total,
      q,
      hasFilter: Boolean(q || category),
      categories: withSelected(lookups.categories, category),
      page: result.page,
      totalPages: result.totalPages,
      hasPrev: result.page > 1,
      hasNext: result.page < result.totalPages,
      prevUrl: buildUrl(result.page - 1),
      nextUrl: buildUrl(result.page + 1),
      flash: MESSAGES[req.query.msg] || null,
    });
  } catch (err) {
    next(err);
  }
});

router.get('/new', requireAuth, async (req, res, next) => {
  try {
    await renderForm(res, {
      title: 'Thêm sản phẩm',
      action: '/products',
      submitLabel: 'Thêm sản phẩm',
      values: EMPTY_PRODUCT,
    });
  } catch (err) {
    next(err);
  }
});

router.post('/', requireAuth, parseProductUpload, verifyCsrf, async (req, res, next) => {
  const { values, errors } = validateProduct(req.body || {});
  if (req.uploadError) errors.unshift(req.uploadError);
  const form = { title: 'Thêm sản phẩm', action: '/products', submitLabel: 'Thêm sản phẩm', values };

  try {
    if (errors.length) return await renderForm(res, { ...form, status: 400, errors });

    if (req.file) {
      if (!cloudinary.isConfigured()) {
        return await renderForm(res, {
          ...form,
          status: 400,
          errors: ['Server chưa cấu hình Cloudinary để tải ảnh lên. Vui lòng dán link ảnh hoặc cấu hình biến môi trường Cloudinary.'],
        });
      }
      const uploaded = await cloudinary.uploadBuffer(req.file.buffer);
      values.image_url = uploaded.url;
    }

    const { rows } = await db.query(
      `INSERT INTO products
         (sku, name, category_id, brand_id, price, stock, connection_type,
          impedance_ohm, driver_size_mm, frequency_response, description, image_url)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       RETURNING id`,
      toParams(values)
    );
    return res.redirect(`/products/${rows[0].id}?msg=created`);
  } catch (err) {
    const message = dbErrorMessage(err);
    if (message) return renderForm(res, { ...form, status: 400, errors: [message] }).catch(next);
    return next(err);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return next();
    const { rows } = await db.query(`${BASE_SELECT} WHERE p.id = $1`, [id]);
    if (!rows.length) return next();
    res.render('products/detail', {
      title: rows[0].name,
      p: rows[0],
      flash: MESSAGES[req.query.msg] || null,
    });
  } catch (err) {
    next(err);
  }
});

router.get('/:id/edit', requireAuth, async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return next();
    const { rows } = await db.query('SELECT * FROM products WHERE id = $1', [id]);
    if (!rows.length) return next();
    const p = rows[0];
    const values = {
      ...EMPTY_PRODUCT,
      ...Object.fromEntries(Object.entries(p).map(([k, v]) => [k, v === null ? '' : String(v)])),
    };
    await renderForm(res, {
      title: `Sửa: ${p.name}`,
      action: `/products/${id}`,
      submitLabel: 'Lưu thay đổi',
      values,
    });
  } catch (err) {
    next(err);
  }
});

router.post('/:id', requireAuth, parseProductUpload, verifyCsrf, async (req, res, next) => {
  const id = parseId(req.params.id);
  if (!id) return next();
  const { values, errors } = validateProduct(req.body || {});
  if (req.uploadError) errors.unshift(req.uploadError);
  const form = { title: 'Sửa sản phẩm', action: `/products/${id}`, submitLabel: 'Lưu thay đổi', values };

  try {
    if (errors.length) return await renderForm(res, { ...form, status: 400, errors });

    if (req.file) {
      if (!cloudinary.isConfigured()) {
        return await renderForm(res, {
          ...form,
          status: 400,
          errors: ['Server chưa cấu hình Cloudinary để tải ảnh lên.'],
        });
      }
      const uploaded = await cloudinary.uploadBuffer(req.file.buffer);
      values.image_url = uploaded.url;
    }

    const result = await db.query(
      `UPDATE products SET
         sku=$1, name=$2, category_id=$3, brand_id=$4, price=$5, stock=$6, connection_type=$7,
         impedance_ohm=$8, driver_size_mm=$9, frequency_response=$10, description=$11, image_url=$12,
         updated_at = NOW()
       WHERE id = $13`,
      [...toParams(values), id]
    );
    if (!result.rowCount) return next();
    return res.redirect(`/products/${id}?msg=updated`);
  } catch (err) {
    const message = dbErrorMessage(err);
    if (message) return renderForm(res, { ...form, status: 400, errors: [message] }).catch(next);
    return next(err);
  }
});

// Chỉ Admin được xóa sản phẩm
router.post('/:id/delete', requireAdmin, verifyCsrf, async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return next();
    const result = await db.query('DELETE FROM products WHERE id = $1', [id]);
    if (!result.rowCount) return next();
    return res.redirect('/products?msg=deleted');
  } catch (err) {
    if (err.code === '23503') {
      return res.status(400).render('error', {
        title: 'Không thể xóa sản phẩm',
        code: 400,
        message: 'Sản phẩm này đã xuất hiện trong đơn hàng nên không thể xóa để giữ lịch sử giao dịch.',
      });
    }
    return next(err);
  }
});

module.exports = { router, searchProducts };
