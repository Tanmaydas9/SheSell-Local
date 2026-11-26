/* ------------------------------------------------------------------
   REST API (JSON over HTTP). Route table:

   Public       GET  /api/health | /api/bootstrap | /api/products | /api/products/:id | /api/sellers | /api/settings | /api/console-info
                POST /api/events | /api/orders | /api/orders/track | /api/orders/:id/claim
                GET  /api/orders/:id?t=TOKEN | /api/stream (Server-Sent Events)
   Accounts     POST /api/auth/login | /api/auth/logout | /api/auth/register | /api/auth/password ; GET /api/auth/me
   Seller+admin POST /api/listings (AI Catalogue) ; GET /api/ml/training-data (Seller Studio)
                /api/my/...    overview, orders (status, pack, note), products (CRUD), profile, lessons
   Admin only   GET /api/stats ; /api/admin/... payment verification, sellers, settings, training data, audit log, exports, backup, reset

   Who may call what is declared on each route ({ auth: 'user' | 'seller' | 'admin' }) and checked
   in one place, the dispatcher at the bottom: no session → 401, wrong role → 403.
------------------------------------------------------------------- */
'use strict';
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createRouter, readJson, fail, sendJson, send } = require('./http');
const auth = require('./auth');
const live = require('./events');
const csv = require('./lib/csv');
const { getSettings, setupIssues, now, newId } = require('./db');
const { resetDemo, demoHint } = require('./seed');

const KB = 1024;

function createApi(db, svc, config) {
  const r = createRouter();
  const ip = (req) => (config.trustProxy && req.headers['x-forwarded-for'] ? String(req.headers['x-forwarded-for']).split(',')[0].trim() : req.socket.remoteAddress) || '?';
  const secure = (req) => !!req.socket.encrypted || (config.trustProxy && req.headers['x-forwarded-proto'] === 'https');

  /* ================= public ================= */
  r.get('/api/health', () => ({ ok: true, app: 'shesell-local', version: config.version, uptime: Math.round(process.uptime()), live: live.count() }));

  r.get('/api/bootstrap', ({ user }) => ({
    app: 'shesell-local', version: config.version, serverTime: now(),
    settings: svc.publicSettings(),
    products: svc.publicProducts(),
    sellers: svc.publicSellers(),
    stats: svc.publicStats(),
    ml: { baskets: svc.basketsFromOrders() },   // anonymous co-purchase baskets for the shop's recommender
    me: auth.publicUser(db, user)
  }));
  r.get('/api/settings', () => ({ settings: svc.publicSettings() }));
  // sign-in page help: demo logins (only while the demo PIN still works) and where the first admin password is
  r.get('/api/console-info', async () => ({ demo: await demoHint(db, config) }));
  r.get('/api/products', () => ({ products: svc.publicProducts() }));
  r.get('/api/products/:id', ({ params }) => {
    const p = svc.productRow(params.id);
    if (!p || p.status !== 'active' || !p.s_active) fail(404, 'not_found', 'Product not found');
    return { product: svc.toClient(p) };
  });
  r.get('/api/sellers', () => ({ sellers: svc.publicSellers() }));
  r.get('/api/stats', () => ({ stats: svc.stats() }), { auth: 'admin' });
  r.get('/api/ml/training-data', () => svc.trainingData(), { auth: 'user' });

  r.post('/api/events', ({ body, req }) => {
    auth.limit('ev:' + ip(req), 300, 60e3);
    const list = Array.isArray(body.events) ? body.events.slice(0, 50) : [body];
    list.forEach(e => svc.recordEvent(String(e.type || ''), e.productId, e.meta));
    return { ok: true, recorded: list.length };
  });

  r.post('/api/orders', ({ body, req }) => {
    auth.limit('order:' + ip(req), config.orderLimit, 10 * 60e3, 'Too many orders from this network. Please wait a few minutes.');
    return { order: svc.createOrder(body) };
  });
  r.post('/api/orders/track', ({ body }) => {
    const list = Array.isArray(body.orders) ? body.orders.slice(0, 30) : [];
    const out = [];
    for (const o of list) { try { out.push(svc.customerOrder(String(o.id || ''), String(o.token || ''))); } catch (e) { /* unknown or wrong token: skip */ } }
    return { orders: out };
  });
  r.get('/api/orders/:id', ({ params, query }) => ({ order: svc.customerOrder(params.id, String(query.get('t') || '')) }));
  r.post('/api/orders/:id/claim', ({ params, body }) => ({ order: svc.claimPayment(params.id, String(body.token || ''), body.ref) }));

  // AI Catalogue publish: signed-in sellers (bound to their own shop) and the admin (who picks the seller)
  r.post('/api/listings', ({ body, user }) => {
    auth.limit('listing:' + user.id, 60, 60 * 60e3, 'Too many listings in one hour. Please wait a little.');
    const product = svc.createProduct(body, user, { source: 'catalogue' });
    return { product, status: product.status };
  }, { auth: 'user', limit: (config.maxUploadMB * 1.4 + 0.1) * 1024 * KB });

  r.get('/api/stream', ({ req, res, user, query }) => {
    const client = { role: user ? user.role : 'public', sellerId: user ? user.sellerId : null };
    const c = live.attach(req, res, client);
    String(query.get('track') || '').split(',').slice(0, 30).forEach(pair => {
      const [id, token] = pair.split('.');
      if (id && token && svc.tokenMatches(id, token)) c.track.add(id);
    });
    return live.STREAMING;
  });

  /* ================= accounts ================= */
  r.post('/api/auth/login', async ({ body, req, setCookie }) => {
    const login = String(body.login || '').trim().toLowerCase();
    const key = login === 'admin' ? 'admin' : (auth.normPhone(login) || login.slice(0, 20));
    auth.limit('login-ip:' + ip(req), config.loginLimit, 10 * 60e3, 'Too many sign-in attempts. Try again in a few minutes.');
    auth.limit('login:' + key, 8, 10 * 60e3, 'Too many wrong attempts for this account. Try again in 10 minutes.');
    const u = db.get('SELECT * FROM users WHERE login = ?', key);
    const ok = await auth.verifyPassword(String(body.password || ''), u ? u.pass_hash : auth.DUMMY_HASH);
    if (!u || !ok || !u.active) fail(401, 'bad_login', 'Wrong mobile number / login or PIN / password');
    if (u.role === 'seller') { const s = db.get('SELECT active FROM sellers WHERE id = ?', u.seller_id); if (!s || !s.active) fail(403, 'account_paused', 'This seller account is paused. Contact the SheSell team.'); }
    auth.resetLimit('login:' + key);
    const token = auth.createSession(db, u.id, req, config.sessionDays);
    setCookie(auth.sessionCookie(token, config.sessionDays, secure(req)));
    svc.audit({ id: u.id, name: u.name }, 'auth.login', u.login);
    return { user: auth.publicUser(db, { id: u.id, role: u.role, login: u.login, name: u.name, sellerId: u.seller_id }) };
  });
  r.post('/api/auth/logout', ({ user, req, setCookie }) => {
    if (user) db.run('DELETE FROM sessions WHERE token_hash = ?', user.tokenHash);
    setCookie(auth.clearCookie(secure(req)));
    return { ok: true };
  });
  r.get('/api/auth/me', ({ user }) => ({ user: auth.publicUser(db, user) }));

  r.post('/api/auth/register', async ({ body, req, setCookie }) => {
    auth.limit('register:' + ip(req), 6, 60 * 60e3, 'Too many new accounts from this network. Try again later.');
    const phone = auth.normPhone(body.phone) || fail(400, 'bad_phone', 'Enter a 10-digit mobile number');
    if (!auth.validPin(body.pin)) fail(400, 'bad_pin', 'PIN must be 4 to 6 digits');
    if (db.get('SELECT id FROM users WHERE login = ?', phone)) fail(409, 'phone_taken', 'This mobile number already has an account. Sign in instead.');
    const name = String(body.name || '').trim();
    if (name.length < 2) fail(400, 'invalid_name', 'Enter your name or your SHG’s name');
    const type = body.type === 'shg' ? 'shg' : 'individual';
    const sellerId = newId('s');
    const place = String(body.place || '').trim().slice(0, 80);
    if (place.length < 2) fail(400, 'invalid_place', 'Enter your village or town');
    db.run('INSERT INTO sellers (id, name, type, place, phone, members, verified, active, created_at) VALUES (?, ?, ?, ?, ?, ?, 0, 1, ?)',
      sellerId, name.slice(0, 80), type, place, phone, type === 'shg' ? Math.max(2, Math.min(500, Number(body.members) || 10)) : 1, now());
    const uid = await auth.createUser(db, { role: 'seller', login: phone, name: name.slice(0, 80), password: String(body.pin), sellerId });
    const token = auth.createSession(db, uid, req, config.sessionDays);
    setCookie(auth.sessionCookie(token, config.sessionDays, secure(req)));
    svc.audit({ id: uid, name }, 'seller.register', sellerId, { phone: phone.slice(0, 2) + '******' + phone.slice(-2), type });
    live.publish('notice', { kind: 'seller', id: sellerId, name }, (c) => c.role === 'admin');
    return { user: auth.publicUser(db, { id: uid, role: 'seller', login: phone, name, sellerId }) };
  });
  r.post('/api/auth/password', async ({ body, user }) => {
    const u = db.get('SELECT * FROM users WHERE id = ?', user.id);
    if (!(await auth.verifyPassword(String(body.current || ''), u.pass_hash))) fail(400, 'bad_current', 'Your current PIN / password is not right');
    const next = String(body.next || '');
    if (u.role === 'admin' ? !auth.validAdminPassword(next) : !auth.validPin(next)) fail(400, 'weak_password', u.role === 'admin' ? 'Use at least 8 characters' : 'PIN must be 4 to 6 digits');
    db.run('UPDATE users SET pass_hash = ? WHERE id = ?', await auth.hashPassword(next), u.id);
    db.run('DELETE FROM sessions WHERE user_id = ? AND token_hash <> ?', u.id, user.tokenHash);   // sign out other devices
    if (u.role === 'admin') fs.rmSync(path.join(config.dataDir, 'ADMIN-LOGIN.txt'), { force: true });   // the first password is no longer valid
    svc.audit(user, 'auth.password', u.login);
    return { ok: true };
  }, { auth: 'user' });

  /* ================= seller + admin ================= */
  r.get('/api/my/overview', ({ user }) => svc.overview(user), { auth: 'user' });
  r.get('/api/my/orders', ({ user, query }) => ({ orders: svc.staffOrders(user, { status: query.get('status') || '', q: query.get('q') || '', limit: query.get('limit') }) }), { auth: 'user' });
  r.get('/api/my/orders/:id', ({ user, params }) => ({ order: svc.staffOrder(params.id, user) }), { auth: 'user' });
  r.post('/api/my/orders/:id/status', ({ user, params, body }) => ({ order: svc.setStatus(params.id, String(body.status || ''), user) }), { auth: 'user' });
  r.post('/api/my/orders/:id/pack', ({ user, params }) => ({ order: svc.packItems(params.id, user) }), { auth: 'user' });
  r.post('/api/my/orders/:id/note', ({ user, params, body }) => ({ order: svc.setNote(params.id, body.note, user) }), { auth: 'user' });

  r.get('/api/my/products', ({ user, query }) => ({ products: svc.staffProducts(user, { status: query.get('status') || '' }) }), { auth: 'user' });
  r.post('/api/my/products', ({ user, body }) => ({ product: svc.createProduct(body, user, { source: 'console' }) }), { auth: 'user', limit: (config.maxUploadMB * 1.4 + 0.1) * 1024 * KB });
  r.patch('/api/my/products/:id', ({ user, params, body }) => ({ product: svc.updateProduct(params.id, body, user) }), { auth: 'user', limit: (config.maxUploadMB * 1.4 + 0.1) * 1024 * KB });
  r.del('/api/my/products/:id', ({ user, params }) => svc.deleteProduct(params.id, user), { auth: 'user' });

  r.get('/api/my/profile', ({ user }) => {
    if (user.role !== 'seller') return { seller: null };
    const s = svc.adminSellers().find(x => x.id === user.sellerId);
    s.lessonsDone = db.all('SELECT module, at FROM lessons_done WHERE seller_id = ?', user.sellerId);
    return { seller: s };
  }, { auth: 'user' });
  r.patch('/api/my/profile', ({ user, body }) => {
    if (user.role !== 'seller') fail(400, 'not_seller', 'Only seller accounts have a shop profile');
    const allowed = {}; ['name', 'nameMr', 'place', 'placeMr', 'members', 'bio', 'type'].forEach(k => { if (body[k] !== undefined) allowed[k] = body[k]; });
    const s = svc.updateSeller(user.sellerId, allowed, user);
    if (allowed.name) db.run('UPDATE users SET name = ? WHERE id = ?', s.name, user.id);
    return { seller: s };
  }, { auth: 'seller' });
  r.post('/api/my/lessons/:module', ({ user, params }) => {
    if (!['catalogue', 'price', 'upi'].includes(params.module)) fail(400, 'invalid_module', 'Unknown lesson');
    db.run('INSERT OR IGNORE INTO lessons_done (seller_id, module, at) VALUES (?, ?, ?)', user.sellerId, params.module, now());
    return { ok: true };
  }, { auth: 'seller' });

  /* ================= admin ================= */
  r.post('/api/admin/orders/:id/payment', ({ user, params, body }) => ({ order: svc.setPayment(params.id, String(body.payment || ''), body.ref, user) }), { auth: 'admin' });

  r.get('/api/admin/sellers', () => ({ sellers: svc.adminSellers() }), { auth: 'admin' });
  r.post('/api/admin/sellers', ({ user, body }) => {
    const id = svc.findOrCreateSeller({ name: body.name, place: body.place, type: body.type }, { verified: 1 });
    const extra = {}; ['nameMr', 'placeMr', 'members', 'phone', 'bio'].forEach(k => { if (body[k] !== undefined && body[k] !== '') extra[k] = body[k]; });
    return { seller: svc.updateSeller(id, Object.assign(extra, { verified: true }), user) };
  }, { auth: 'admin' });
  r.patch('/api/admin/sellers/:id', ({ user, params, body }) => {
    const s = svc.updateSeller(params.id, body, user);
    if (body.active === false) db.run("DELETE FROM sessions WHERE user_id IN (SELECT id FROM users WHERE seller_id = ?)", params.id);
    return { seller: s };
  }, { auth: 'admin' });
  r.post('/api/admin/sellers/:id/login', async ({ user, params, body }) => {
    const s = db.get('SELECT * FROM sellers WHERE id = ?', params.id);
    if (!s) fail(404, 'not_found', 'Seller not found');
    const pin = auth.randomPin();
    const existing = db.get('SELECT id, login FROM users WHERE seller_id = ?', s.id);
    if (existing) {
      db.run('UPDATE users SET pass_hash = ?, active = 1 WHERE id = ?', await auth.hashPassword(pin), existing.id);
      db.run('DELETE FROM sessions WHERE user_id = ?', existing.id);
      svc.audit(user, 'seller.reset_pin', s.id);
      return { login: existing.login, pin };
    }
    const phone = auth.normPhone(body.phone || s.phone) || fail(400, 'bad_phone', 'Add the seller’s 10-digit mobile number first');
    if (db.get('SELECT id FROM users WHERE login = ?', phone)) fail(409, 'phone_taken', 'Another account already uses this mobile number');
    db.run('UPDATE sellers SET phone = ? WHERE id = ?', phone, s.id);
    await auth.createUser(db, { role: 'seller', login: phone, name: s.name, password: pin, sellerId: s.id });
    svc.audit(user, 'seller.create_login', s.id);
    return { login: phone, pin };
  }, { auth: 'admin' });

  r.get('/api/admin/settings', () => { const s = getSettings(db); return { settings: s, setupIssues: setupIssues(s) }; }, { auth: 'admin' });
  r.put('/api/admin/settings', ({ user, body }) => ({ settings: svc.updateSettings(body, user) }), { auth: 'admin' });

  r.get('/api/admin/training', () => svc.trainingData(), { auth: 'admin' });
  r.post('/api/admin/training/import', ({ user, body }) => {
    const rows = csv.parse(String(body.csv || '').slice(0, 2e6));
    if (rows.length < 2) fail(400, 'empty_csv', 'Paste a header row and at least one data row');
    const head = rows[0].map(h => h.trim().toLowerCase());
    const col = (...names) => head.findIndex(h => names.includes(h));
    const ix = {
      cat: col('category', 'cat'), mat: col('material_cost_inr', 'material', 'mat'), hrs: col('labour_hours', 'labor_hours', 'hours', 'hrs'),
      tier: col('packaging_tier', 'packaging', 'tier'), season: col('seasonal_demand', 'season', 'demand'), price: col('price_inr', 'price'),
      orders: col('weekly_orders', 'orders'), month: col('month'), district: col('district'), seller: col('seller_type', 'seller'), item: col('item', 'product')
    };
    const missing = ['cat', 'mat', 'hrs', 'tier', 'season', 'price', 'orders'].filter(k => ix[k] < 0);
    if (missing.length) fail(400, 'missing_columns', 'Missing columns: ' + missing.join(', '), { columns: missing.join(', ') });
    if (rows.length > 5001) fail(400, 'too_many_rows', 'Import at most 5000 rows at a time');
    const records = rows.slice(1).map((cells, i) => {
      const o = { _line: i + 2 };
      for (const [k, j] of Object.entries(ix)) if (j >= 0) o[k] = (cells[j] ?? '').trim().replace(/^'/, '');
      return o;
    });
    return svc.addSamples(records, user);
  }, { auth: 'admin', limit: 2.5 * 1024 * KB });
  r.post('/api/admin/training/rows', ({ user, body }) => {
    const res = svc.addSamples([Object.assign({ _line: 1 }, body)], user);
    if (!res.added) fail(400, 'invalid_row', res.skipped[0] ? res.skipped[0].error : 'Invalid row', { field: res.skipped[0] && res.skipped[0].field });
    return res;
  }, { auth: 'admin' });
  r.del('/api/admin/training/rows/:id', ({ user, params }) => {
    const n = db.run('DELETE FROM price_samples WHERE id = ?', params.id).changes;
    if (!n) fail(404, 'not_found', 'Row not found');
    svc.audit(user, 'training.delete', params.id);
    live.publish('training', { changed: true });
    return { ok: true };
  }, { auth: 'admin' });
  r.del('/api/admin/training/rows', ({ user }) => {
    const n = db.run('DELETE FROM price_samples').changes;
    svc.audit(user, 'training.clear', null, { rows: n });
    live.publish('training', { changed: true });
    return { deleted: n };
  }, { auth: 'admin' });

  r.get('/api/admin/audit', ({ query }) => ({
    entries: db.all('SELECT id, user_name AS user, action, target, detail, at FROM audit ORDER BY id DESC LIMIT ?', Math.min(500, Number(query.get('limit')) || 200))
  }), { auth: 'admin' });

  r.get('/api/admin/export/:name', ({ params, req, res }) => {
    const day = new Date().toLocaleDateString('en-CA');   // local YYYY-MM-DD
    let body;
    if (params.name === 'orders.csv') {
      const rows = db.all(`SELECT o.id, o.created_at, o.customer_name, o.customer_phone, o.place, o.mode, o.status, o.payment, o.payment_ref, o.subtotal, o.fee, o.total, o.demo,
                                  GROUP_CONCAT(oi.name_en || ' x' || oi.qty, '; ') AS items
                           FROM orders o JOIN order_items oi ON oi.order_id = o.id GROUP BY o.id ORDER BY o.created_at DESC`);
      body = csv.write(['order_id', 'created_at', 'customer', 'phone', 'place', 'mode', 'status', 'payment', 'payment_ref', 'subtotal', 'delivery_fee', 'total', 'demo', 'items'],
        rows.map(o => [o.id, new Date(o.created_at).toISOString(), o.customer_name, o.customer_phone, o.place, o.mode, o.status, o.payment, o.payment_ref, o.subtotal, o.fee, o.total, o.demo ? 'yes' : '', o.items]));
    } else if (params.name === 'products.csv') {
      body = csv.write(['id', 'name', 'name_mr', 'category', 'price', 'stock', 'status', 'seller', 'source', 'created_at'],
        db.all('SELECT p.*, s.name AS seller FROM products p JOIN sellers s ON s.id = p.seller_id ORDER BY p.created_at DESC')
          .map(p => [p.id, p.name_en, p.name_mr, p.cat, p.price, p.stock ?? '', p.status, p.seller, p.source, new Date(p.created_at).toISOString()]));
    } else if (params.name === 'sellers.csv') {
      body = csv.write(['id', 'name', 'type', 'place', 'phone', 'members', 'verified', 'active', 'products', 'orders', 'revenue_delivered'],
        svc.adminSellers().map(s => [s.id, s.name, s.type, s.place, s.phone, s.members, s.verified ? 'yes' : 'no', s.active ? 'yes' : 'no', s.products, s.orders, s.revenue]));
    } else if (params.name === 'training.csv') {
      body = csv.write(['id', 'month', 'district', 'seller_type', 'category', 'item', 'material_cost_inr', 'labour_hours', 'packaging_tier', 'seasonal_demand', 'price_inr', 'weekly_orders'],
        svc.trainingData().real.map(x => [x.id, x.month === null || x.month === undefined ? '' : ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][x.month], x.district, x.seller, x.cat, x.item, x.mat, x.hrs, ['basic', 'standard', 'premium'][x.tier], x.season, x.price, x.orders]));
    } else fail(404, 'not_found', 'Unknown export');
    send(req, res, 200, '﻿' + body, { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="shesell-${params.name.replace('.csv', '')}-${day}.csv"`, 'Cache-Control': 'no-store' });
    return live.STREAMING;
  }, { auth: 'admin' });

  r.get('/api/admin/backup', ({ req, res, user }) => {
    const tmp = path.join(os.tmpdir(), `shesell-backup-${process.pid}-${Date.now()}.db`);
    db.exec(`VACUUM INTO '${tmp.replace(/'/g, "''")}'`);
    const buf = fs.readFileSync(tmp); fs.rmSync(tmp, { force: true });
    svc.audit(user, 'backup.download');
    send(req, res, 200, buf, { 'Content-Type': 'application/vnd.sqlite3', 'Content-Disposition': `attachment; filename="shesell-backup-${new Date().toLocaleDateString('en-CA')}.db"`, 'Cache-Control': 'no-store' });
    return live.STREAMING;
  }, { auth: 'admin' });

  r.post('/api/admin/orders/clear-demo', ({ user }) => {
    const n = db.tx(() => db.run('DELETE FROM orders WHERE demo = 1').changes);
    svc.audit(user, 'orders.clear_demo', null, { orders: n });
    live.publish('reload', { reason: 'orders' }, (c) => live.isStaff(c));
    return { deleted: n };
  }, { auth: 'admin' });
  r.post('/api/admin/reset', async ({ user, body }) => {
    if (body.confirm !== 'RESET') fail(400, 'confirm', 'Type RESET to confirm');
    await resetDemo(db, config);
    svc.audit(user, 'data.reset');
    live.publish('reload', { reason: 'reset' });
    return { ok: true };
  }, { auth: 'admin' });

  /* ================= dispatcher ================= */
  return async function handleApi(req, res, url) {
    const m = r.match(req.method, url.pathname);
    if (!m) fail(404, 'not_found', 'No such API endpoint');
    if (m.methodNotAllowed) fail(405, 'method_not_allowed', 'Method not allowed');
    const { route, params } = m;
    const user = auth.userFromRequest(db, req);
    const need = route.opts.auth;   // the role guard for every route
    if (need && !user) fail(401, 'signin_required', 'Please sign in');
    if (need === 'admin' && user.role !== 'admin') fail(403, 'admin_only', 'Only the admin can do this');
    if (need === 'seller' && user.role !== 'seller') fail(403, 'seller_only', 'Only seller accounts can do this');
    const body = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method) ? await readJson(req, route.opts.limit || 64 * KB) : {};
    const cookies = [];
    const result = await route.handler({ req, res, params, query: url.searchParams, body, user, setCookie: (c) => cookies.push(c) });
    if (result === live.STREAMING) return;
    sendJson(req, res, 200, result === undefined ? { ok: true } : result, cookies.length ? { 'Set-Cookie': cookies } : {});
  };
}

module.exports = { createApi };
