const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');

const helpers = require('../src/helpers');
const { hashPassword, verifyPassword } = require('../src/auth');
const db = require('../src/db');
const { app } = require('../server');

// Cookie jar tối giản dùng cho kiểm thử session & CSRF
function createClient(baseUrl) {
  const cookies = new Map();

  async function request(path, { method = 'GET', form = null, body: rawBody = null, headers = {}, redirect = 'manual' } = {}) {
    const reqHeaders = { ...headers };
    if (cookies.size) {
      reqHeaders.cookie = [...cookies.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
    }
    let body = rawBody;
    if (form) {
      reqHeaders['content-type'] = 'application/x-www-form-urlencoded';
      body = new URLSearchParams(form).toString();
    }

    const res = await fetch(`${baseUrl}${path}`, { method, headers: reqHeaders, body, redirect });
    const setCookies = typeof res.headers.getSetCookie === 'function' ? res.headers.getSetCookie() : [];
    for (const line of setCookies) {
      const pair = line.split(';')[0];
      const eqIdx = pair.indexOf('=');
      if (eqIdx > 0) cookies.set(pair.slice(0, eqIdx).trim(), pair.slice(eqIdx + 1).trim());
    }
    const raw = Buffer.from(await res.arrayBuffer());
    const text = raw.toString('utf8');
    return { status: res.status, headers: res.headers, raw, text };
  }

  function extractCsrf(html) {
    const m = html.match(/name="_csrf"\s+value="([a-f0-9]+)"/);
    return m ? m[1] : '';
  }

  async function login(username, password) {
    const page = await request('/login');
    const csrf = extractCsrf(page.text);
    assert.ok(csrf, 'Trang login phải có CSRF token');
    return request('/login', {
      method: 'POST',
      form: { _csrf: csrf, username, password, next: '/' },
    });
  }

  return { request, extractCsrf, login, resetCookies: () => cookies.clear() };
}

test('Helpers và scrypt password hoạt động chính xác', () => {
  assert.match(helpers.formatPrice(7490000), /7\.490\.000/);
  assert.equal(helpers.isLowStock(5), true);
  assert.equal(helpers.isLowStock(6), false);
  assert.equal(helpers.orDash(''), '—');

  const hash = hashPassword('MatKhau@123');
  assert.equal(verifyPassword('MatKhau@123', hash), true);
  assert.equal(verifyPassword('SaiMatKhau', hash), false);
});

test('Luồng HTTP, phân quyền, CSRF, transaction và CSV', async (t) => {
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  const baseUrl = `http://127.0.0.1:${port}`;
  const client = createClient(baseUrl);

  const createdOrderIds = [];
  const createdProductIds = [];

  try {
    await t.test('Trang công khai và Helmet headers', async () => {
      for (const path of ['/', '/products', '/api/products', '/api/metrics', '/health', '/login']) {
        const res = await client.request(path);
        assert.equal(res.status, 200, `${path} phải trả về 200`);
      }
      const health = await client.request('/health');
      const data = JSON.parse(health.text);
      assert.equal(data.status, 'ok');
      assert.equal(data.database, 'connected');
      assert.equal(health.headers.get('x-content-type-options'), 'nosniff');

      const notFound = await client.request('/duong-dan-khong-ton-tai');
      assert.equal(notFound.status, 404);
    });

    await t.test('Chưa đăng nhập bị chặn ở route quản lý và CSRF bị chặn khi thiếu token', async () => {
      for (const path of ['/products/new', '/inventory', '/orders', '/reports', '/admin/users']) {
        const res = await client.request(path);
        assert.equal(res.status, 302, `${path} phải redirect về /login`);
        assert.match(res.headers.get('location') || '', /^\/login/);
      }
      const noCsrf = await client.request('/login', {
        method: 'POST',
        form: { username: 'admin', password: 'Admin@123' },
      });
      assert.equal(noCsrf.status, 403);
    });

    await t.test('Vai trò staff: dùng được kho/đơn/báo cáo nhưng bị chặn quyền admin', async () => {
      client.resetCookies();
      const loginRes = await client.login('staff', 'Staff@123');
      assert.equal(loginRes.status, 302);
      assert.equal(loginRes.headers.get('location'), '/');

      assert.equal((await client.request('/inventory')).status, 200);
      assert.equal((await client.request('/orders')).status, 200);
      assert.equal((await client.request('/reports')).status, 200);
      assert.equal((await client.request('/admin/users')).status, 403);

      const csvRes = await client.request('/reports/orders.csv');
      assert.equal(csvRes.status, 200);
      assert.match(csvRes.headers.get('content-type') || '', /text\/csv/);
      assert.deepEqual(
        [...csvRes.raw.subarray(0, 3)],
        [0xef, 0xbb, 0xbf],
        'CSV phải bắt đầu bằng UTF-8 BOM (EF BB BF)'
      );

      const invPage = await client.request('/inventory');
      const csrf = client.extractCsrf(invPage.text);
      const badDelete = await client.request('/products/1/delete', {
        method: 'POST',
        form: { _csrf: csrf },
      });
      assert.equal(badDelete.status, 403);
    });

    await t.test('Admin: tạo sản phẩm, nhập kho, tạo đơn, hủy đơn và rollback khi thiếu tồn', async () => {
      client.resetCookies();
      const loginRes = await client.login('admin', 'Admin@123');
      assert.equal(loginRes.status, 302);
      assert.equal((await client.request('/admin/users')).status, 200);

      // Tạo sản phẩm tạm
      const newPage = await client.request('/products/new');
      const formCsrf = client.extractCsrf(newPage.text);
      const sku = `TEST-${Date.now()}`;
      const cat = (await db.query('SELECT id FROM categories LIMIT 1')).rows[0].id;
      const brand = (await db.query('SELECT id FROM brands LIMIT 1')).rows[0].id;

      const formData = new FormData();
      formData.set('_csrf', formCsrf);
      formData.set('sku', sku);
      formData.set('name', 'Tai nghe Test Transaction');
      formData.set('category_id', String(cat));
      formData.set('brand_id', String(brand));
      formData.set('price', '1000000');
      formData.set('stock', '3');
      formData.set('connection_type', 'Có dây');

      const hasCloudinary = Boolean(
        process.env.CLOUDINARY_CLOUD_NAME &&
        process.env.CLOUDINARY_API_KEY &&
        process.env.CLOUDINARY_API_SECRET
      );
      if (hasCloudinary) {
        const png1x1 = Buffer.from(
          'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
          'base64'
        );
        formData.set('image_file', new Blob([png1x1], { type: 'image/png' }), 'test.png');
      }

      const createRes = await client.request('/products', {
        method: 'POST',
        body: formData,
      });
      assert.equal(createRes.status, 302);
      const prodMatch = (createRes.headers.get('location') || '').match(/\/products\/(\d+)/);
      assert.ok(prodMatch, 'Phải redirect tới trang chi tiết sản phẩm mới');
      const prodId = Number(prodMatch[1]);
      createdProductIds.push(prodId);
      if (hasCloudinary) {
        const createdProd = (await db.query('SELECT image_url FROM products WHERE id = $1', [prodId])).rows[0];
        assert.match(createdProd.image_url || '', /^https:\/\/res\.cloudinary\.com\//);
      }

      // Xuất kho vượt tồn -> phải báo lỗi 400 và giữ nguyên stock = 3
      const invPage = await client.request('/inventory');
      const invCsrf = client.extractCsrf(invPage.text);
      const overOut = await client.request('/inventory/adjust', {
        method: 'POST',
        form: { _csrf: invCsrf, product_id: String(prodId), type: 'OUT', quantity: '99', note: 'Test' },
      });
      assert.equal(overOut.status, 400);
      assert.equal((await db.query('SELECT stock FROM products WHERE id = $1', [prodId])).rows[0].stock, 3);

      // Nhập kho +5 -> stock = 8
      const inOk = await client.request('/inventory/adjust', {
        method: 'POST',
        form: { _csrf: invCsrf, product_id: String(prodId), type: 'IN', quantity: '5', note: 'Test IN' },
      });
      assert.equal(inOk.status, 302);
      assert.equal((await db.query('SELECT stock FROM products WHERE id = $1', [prodId])).rows[0].stock, 8);

      // Tạo đơn hàng SL = 2 -> stock = 6
      const orderPage = await client.request('/orders/new');
      const orderCsrf = client.extractCsrf(orderPage.text);
      const orderOk = await client.request('/orders', {
        method: 'POST',
        form: {
          _csrf: orderCsrf,
          customer_name: 'Khách Test',
          customer_phone: '0900000000',
          product_id: String(prodId),
          quantity: '2',
        },
      });
      assert.equal(orderOk.status, 302);
      const orderMatch = (orderOk.headers.get('location') || '').match(/\/orders\/(\d+)/);
      assert.ok(orderMatch, 'Phải redirect tới chi tiết đơn hàng');
      const orderId = Number(orderMatch[1]);
      createdOrderIds.push(orderId);
      assert.equal((await db.query('SELECT stock FROM products WHERE id = $1', [prodId])).rows[0].stock, 6);

      // Hủy đơn -> hoàn trả stock = 8
      const detailOrder = await client.request(`/orders/${orderId}`);
      const cancelCsrf = client.extractCsrf(detailOrder.text);
      const cancelRes = await client.request(`/orders/${orderId}/cancel`, {
        method: 'POST',
        form: { _csrf: cancelCsrf },
      });
      assert.equal(cancelRes.status, 302);
      assert.equal((await db.query('SELECT stock FROM products WHERE id = $1', [prodId])).rows[0].stock, 8);
    });
  } finally {
    if (createdOrderIds.length) {
      await db.query('DELETE FROM orders WHERE id = ANY($1::int[])', [createdOrderIds]).catch(() => {});
    }
    if (createdProductIds.length) {
      await db.query('DELETE FROM products WHERE id = ANY($1::int[])', [createdProductIds]).catch(() => {});
    }
    await new Promise((resolve) => server.close(resolve));
    await db.pool.end();
  }
});
