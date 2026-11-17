const crypto = require('crypto');

const SCRYPT_PARAMS = { N: 16384, r: 8, p: 1 };

// Băm mật khẩu bằng scrypt (có sẵn trong Node.js, không phụ thuộc thư viện native)
function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(String(password), salt, 64, SCRYPT_PARAMS).toString('hex');
  return `${salt}:${derived}`;
}

function verifyPassword(password, storedHash) {
  if (typeof storedHash !== 'string' || !storedHash.includes(':')) return false;
  const [salt, expectedHex] = storedHash.split(':');
  if (!salt || !expectedHex) return false;
  const derived = crypto.scryptSync(String(password), salt, 64, SCRYPT_PARAMS);
  const expected = Buffer.from(expectedHex, 'hex');
  if (derived.length !== expected.length) return false;
  return crypto.timingSafeEqual(derived, expected);
}

// Gắn thông tin user và CSRF token vào mọi template Handlebars
function attachLocals(req, res, next) {
  if (req.session && !req.session.csrfToken) {
    req.session.csrfToken = crypto.randomBytes(32).toString('hex');
  }
  const user = req.session ? req.session.user || null : null;
  res.locals.currentUser = user;
  res.locals.isAdmin = Boolean(user && user.role === 'admin');
  res.locals.csrfToken = req.session ? req.session.csrfToken : '';
  next();
}

function verifyCsrf(req, res, next) {
  const token = (req.body && req.body._csrf) || req.get('x-csrf-token') || '';
  const expected = req.session ? req.session.csrfToken : '';
  if (!token || !expected) {
    return res.status(403).render('error', {
      title: 'Phiên không hợp lệ',
      code: 403,
      message: 'Mã bảo vệ CSRF không hợp lệ hoặc phiên đã hết hạn. Vui lòng tải lại trang và thử lại.',
    });
  }
  const a = Buffer.from(String(token));
  const b = Buffer.from(String(expected));
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return res.status(403).render('error', {
      title: 'Phiên không hợp lệ',
      code: 403,
      message: 'Mã bảo vệ CSRF không khớp. Vui lòng tải lại trang và thử lại.',
    });
  }
  return next();
}

function requireAuth(req, res, next) {
  if (req.session && req.session.user) return next();
  const nextUrl = encodeURIComponent(req.originalUrl || '/');
  return res.redirect(`/login?next=${nextUrl}`);
}

function requireAdmin(req, res, next) {
  if (!req.session || !req.session.user) {
    const nextUrl = encodeURIComponent(req.originalUrl || '/');
    return res.redirect(`/login?next=${nextUrl}`);
  }
  if (req.session.user.role !== 'admin') {
    return res.status(403).render('error', {
      title: 'Không đủ quyền',
      code: 403,
      message: 'Thao tác này chỉ dành cho tài khoản Quản trị viên (admin).',
    });
  }
  return next();
}

module.exports = {
  hashPassword,
  verifyPassword,
  attachLocals,
  verifyCsrf,
  requireAuth,
  requireAdmin,
};
