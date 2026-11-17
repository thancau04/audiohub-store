const express = require('express');
const rateLimit = require('express-rate-limit');
const db = require('../db');
const { hashPassword, verifyPassword, verifyCsrf, requireAdmin } = require('../auth');

const router = express.Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  handler(req, res) {
    res.status(429).render('auth/login', {
      title: 'Đăng nhập',
      error: 'Bạn đã thử đăng nhập quá nhiều lần. Vui lòng đợi vài phút rồi thử lại.',
      username: req.body?.username || '',
      nextUrl: req.body?.next || '/',
    });
  },
});

function safeRedirectPath(raw) {
  if (typeof raw !== 'string') return '/';
  if (!raw.startsWith('/') || raw.startsWith('//')) return '/';
  return raw;
}

router.get('/login', (req, res) => {
  if (req.session && req.session.user) return res.redirect('/');
  res.render('auth/login', {
    title: 'Đăng nhập',
    nextUrl: safeRedirectPath(req.query.next),
    flash: req.query.msg === 'logged_out' ? 'Đã đăng xuất khỏi hệ thống.' : null,
  });
});

router.post('/login', loginLimiter, verifyCsrf, async (req, res, next) => {
  const username = (req.body.username || '').toString().trim();
  const password = (req.body.password || '').toString();
  const nextUrl = safeRedirectPath(req.body.next);

  if (!username || !password) {
    return res.status(400).render('auth/login', {
      title: 'Đăng nhập',
      error: 'Vui lòng nhập đầy đủ tên đăng nhập và mật khẩu.',
      username,
      nextUrl,
    });
  }

  try {
    const { rows } = await db.query(
      'SELECT id, username, password_hash, full_name, role, is_active FROM users WHERE username = $1',
      [username]
    );
    const user = rows[0];
    if (!user || !user.is_active || !verifyPassword(password, user.password_hash)) {
      return res.status(401).render('auth/login', {
        title: 'Đăng nhập',
        error: 'Tên đăng nhập hoặc mật khẩu không đúng (hoặc tài khoản đã bị khóa).',
        username,
        nextUrl,
      });
    }

    req.session.regenerate((err) => {
      if (err) return next(err);
      req.session.user = {
        id: user.id,
        username: user.username,
        full_name: user.full_name,
        role: user.role,
      };
      req.session.save((saveErr) => {
        if (saveErr) return next(saveErr);
        return res.redirect(nextUrl);
      });
    });
  } catch (err) {
    return next(err);
  }
});

router.post('/logout', verifyCsrf, (req, res, next) => {
  req.session.destroy((err) => {
    if (err) return next(err);
    res.clearCookie('audiohub.sid');
    return res.redirect('/login?msg=logged_out');
  });
});

// Quản lý tài khoản (chỉ dành cho Admin)
router.get('/admin/users', requireAdmin, async (req, res, next) => {
  try {
    const { rows } = await db.query(
      'SELECT id, username, full_name, role, is_active, created_at FROM users ORDER BY id ASC'
    );
    const messages = {
      created: 'Đã tạo tài khoản mới.',
      toggled: 'Đã cập nhật trạng thái tài khoản.',
    };
    res.render('admin/users', {
      title: 'Quản lý nhân viên',
      users: rows.map((u) => ({
        ...u,
        isSelf: u.id === req.session.user.id,
      })),
      flash: messages[req.query.msg] || null,
      error: req.query.err === 'self' ? 'Không thể tự khóa tài khoản đang đăng nhập.' : null,
    });
  } catch (err) {
    next(err);
  }
});

router.post('/admin/users', requireAdmin, verifyCsrf, async (req, res, next) => {
  const username = (req.body.username || '').toString().trim().toLowerCase();
  const fullName = (req.body.full_name || '').toString().trim();
  const password = (req.body.password || '').toString();
  const role = req.body.role === 'admin' ? 'admin' : 'staff';

  const errors = [];
  if (!/^[a-z0-9_.-]{3,30}$/.test(username)) {
    errors.push('Tên đăng nhập gồm 3–30 ký tự chữ thường, số hoặc _ . -');
  }
  if (!fullName || fullName.length > 100) errors.push('Họ tên không được để trống (tối đa 100 ký tự).');
  if (password.length < 6) errors.push('Mật khẩu phải có ít nhất 6 ký tự.');

  try {
    if (errors.length) {
      const { rows } = await db.query(
        'SELECT id, username, full_name, role, is_active, created_at FROM users ORDER BY id ASC'
      );
      return res.status(400).render('admin/users', {
        title: 'Quản lý nhân viên',
        users: rows.map((u) => ({ ...u, isSelf: u.id === req.session.user.id })),
        errors,
        form: { username, full_name: fullName, role },
      });
    }

    await db.query(
      'INSERT INTO users (username, password_hash, full_name, role) VALUES ($1, $2, $3, $4)',
      [username, hashPassword(password), fullName, role]
    );
    return res.redirect('/admin/users?msg=created');
  } catch (err) {
    if (err.code === '23505') {
      const { rows } = await db.query(
        'SELECT id, username, full_name, role, is_active, created_at FROM users ORDER BY id ASC'
      );
      return res.status(400).render('admin/users', {
        title: 'Quản lý nhân viên',
        users: rows.map((u) => ({ ...u, isSelf: u.id === req.session.user.id })),
        errors: ['Tên đăng nhập đã tồn tại.'],
        form: { username, full_name: fullName, role },
      });
    }
    return next(err);
  }
});

router.post('/admin/users/:id/toggle', requireAdmin, verifyCsrf, async (req, res, next) => {
  try {
    const id = /^\d+$/.test(req.params.id) ? Number(req.params.id) : null;
    if (!id) return next();
    if (id === req.session.user.id) return res.redirect('/admin/users?err=self');
    await db.query('UPDATE users SET is_active = NOT is_active WHERE id = $1', [id]);
    return res.redirect('/admin/users?msg=toggled');
  } catch (err) {
    return next(err);
  }
});

module.exports = router;
