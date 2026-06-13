const express = require('express');
const bcrypt = require('bcryptjs');
const { query } = require('../db');
const { validateAdminLogin } = require('../services/users');
const { reserveProduct, getProducts } = require('../services/catalog');
const { notifyUser } = require('../services/notifications');
const { logAudit } = require('../services/audit');

function requireAdmin(req, res, next) {
  if (!req.session.adminUser) return res.redirect('/admin/login');
  next();
}

function adminRouter() {
  const router = express.Router();

  router.get('/login', (req, res) => res.render('admin/login', { error: null, layout: 'admin' }));

  router.post('/login', express.urlencoded({ extended: true }), async (req, res) => {
    const { email, password } = req.body;
    const user = await validateAdminLogin(email, password);
    if (!user) {
      return res.status(401).render('admin/login', { error: 'Nieprawidłowy login lub hasło', layout: 'admin' });
    }
    req.session.adminUser = { id: user.id, email: user.email, username: user.username, role: user.role };
    await logAudit({ actorType: 'admin', actorId: user.id, action: 'admin_login', entityType: 'user', entityId: user.id, payload: { email } });
    res.redirect('/admin');
  });

  router.get('/', requireAdmin, async (req, res) => {
    const users = await query(`SELECT COUNT(*)::int AS c FROM users`);
    const orders = await query(`SELECT COUNT(*)::int AS c FROM orders`);
    const pending = await query(`SELECT COUNT(*)::int AS c FROM payment_intents WHERE status = 'pending'`);
    const reserved = await query(`SELECT COUNT(*)::int AS c FROM reservations WHERE status = 'reserved'`);
    res.render('admin/dashboard', {
      layout: 'admin',
      stats: {
        users: users.rows[0].c,
        orders: orders.rows[0].c,
        pending: pending.rows[0].c,
        reserved: reserved.rows[0].c
      },
      admin: req.session.adminUser
    });
  });

  router.get('/products', requireAdmin, async (req, res) => {
    const products = await getProducts({ includeHidden: true });
    res.render('admin/products', { layout: 'admin', products, admin: req.session.adminUser });
  });

  router.post('/products/create', requireAdmin, express.urlencoded({ extended: true }), async (req, res) => {
    const { title, description, price, tags } = req.body;
    await query(
      `INSERT INTO products (title, description, price, status, is_unique, tags)
       VALUES ($1,$2,$3,'available',true,$4)`,
      [title, description, price, String(tags || '').split(',').map(s => s.trim()).filter(Boolean)]
    );
    await logAudit({ actorType: 'admin', actorId: req.session.adminUser.id, action: 'product_created', entityType: 'product', payload: { title } });
    res.redirect('/admin/products');
  });

  router.get('/orders', requireAdmin, async (req, res) => {
    const { rows } = await query(
      `SELECT o.*, u.username, u.email, p.title
       FROM orders o
       JOIN users u ON u.id = o.user_id
       LEFT JOIN reservations r ON r.id = o.reservation_id
       LEFT JOIN products p ON p.id = r.product_id
       ORDER BY o.created_at DESC
       LIMIT 100`
    );
    res.render('admin/orders', { layout: 'admin', orders: rows, admin: req.session.adminUser });
  });

  router.post('/orders/:id/status', requireAdmin, express.urlencoded({ extended: true }), async (req, res) => {
    const { status } = req.body;
    await query(`UPDATE orders SET status = $2 WHERE id = $1`, [req.params.id, status]);
    await logAudit({ actorType: 'admin', actorId: req.session.adminUser.id, action: 'order_status_changed', entityType: 'order', entityId: req.params.id, payload: { status } });
    res.redirect('/admin/orders');
  });

  router.get('/users', requireAdmin, async (req, res) => {
    const { rows } = await query(`SELECT u.*, w.balance FROM users u LEFT JOIN wallets w ON w.user_id = u.id ORDER BY u.created_at DESC LIMIT 100`);
    res.render('admin/users', { layout: 'admin', users: rows, admin: req.session.adminUser });
  });

  router.post('/users/:id/reset-wallet', requireAdmin, express.urlencoded({ extended: true }), async (req, res) => {
    const amount = Number(req.body.amount || 0);
    await query(`UPDATE wallets SET balance = $2 WHERE user_id = $1`, [req.params.id, amount]);
    await query(`INSERT INTO wallet_transactions (user_id, kind, amount, reference, metadata) VALUES ($1,'admin_reset',$2,'admin', '{}'::jsonb)`, [req.params.id, amount]);
    await logAudit({ actorType: 'admin', actorId: req.session.adminUser.id, action: 'wallet_reset', entityType: 'user', entityId: req.params.id, payload: { amount } });
    res.redirect('/admin/users');
  });

  router.post('/logout', requireAdmin, (req, res) => {
    req.session.destroy(() => res.redirect('/admin/login'));
  });

  return router;
}

module.exports = { adminRouter, requireAdmin };
