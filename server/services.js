/* ------------------------------------------------------------------
   Business logic shared by the API routes: products, orders,
   listings, sellers, stats, training data and live notifications.
   Prices, stock, delivery fees and permissions are decided here, on
   the server, never taken from the browser.
------------------------------------------------------------------- */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { fail } = require('./http');
const { getSettings, saveSettings, setupIssues, PLACEHOLDER_WHATSAPP, LEADS, DEFAULT_LEAD, newId, sha256, now } = require('./db');
const { normPhone } = require('./auth');
const { DATAGEN } = require('./lib/shared');
const live = require('./events');

const CATS = ['food', 'tailoring', 'craft', 'agri'];
const FLOW = ['confirmed', 'packed', 'out', 'delivered'];
const DEFAULT_ART = { food: 'ladoo', tailoring: 'blouse', craft: 'bag', agri: 'veg' };
const PERISH = { food: 0.45, tailoring: 0, craft: 0.02, agri: 0.85 };
const EVENT_TYPES = ['view', 'share', 'cart_add', 'lesson', 'train', 'scan'];
// a buyer's "I've paid" is only a claim: the admin checks the bank app before it becomes 'paid'
const verification = (payment) => (payment === 'claimed' ? 'pending' : payment === 'paid' ? 'verified' : null);

/* ---------- small validators (error codes like invalid_delivery_fee; the browser translates them) ---------- */
const code = (field) => 'invalid_' + field.replace(/\s+/g, '_');
const text = (v, max, { min = 0, field = 'value' } = {}) => {
  const s = String(v ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim();
  if (s.length < min) fail(400, code(field), `${field} must be at least ${min} characters`, { min });
  return s.slice(0, max);
};
const int = (v, lo, hi, field) => {
  const n = Number(v);
  if (!Number.isInteger(n) || n < lo || n > hi) fail(400, code(field), `${field} must be a whole number from ${lo} to ${hi}`, { min: lo, max: hi });
  return n;
};

function createServices(db, config) {
  /* ================= products ================= */
  const PRODUCT_SQL = `SELECT p.*, s.name AS s_name, s.name_mr AS s_name_mr, s.type AS s_type, s.place AS s_place,
                              s.place_mr AS s_place_mr, s.verified AS s_verified, s.active AS s_active
                       FROM products p JOIN sellers s ON s.id = p.seller_id`;

  function toClient(p, staff = false) {
    const o = {
      id: p.id, cat: p.cat, art: p.photo ? 'photo' : (p.art || DEFAULT_ART[p.cat]), price: p.price,
      name: { en: p.name_en, mr: p.name_mr || p.name_en },
      unit: { en: p.unit_en || '1 piece', mr: p.unit_mr || p.unit_en || '१ नग' },
      seller: { en: p.s_name, mr: p.s_name_mr || p.s_name },
      sellerId: p.seller_id, type: p.s_type,
      place: { en: p.s_place, mr: p.s_place_mr || p.s_place },
      desc: { en: p.desc_en || '', mr: p.desc_mr || p.desc_en || '' },
      perish: p.perish, pop: p.pop, fest: p.fest, stock: p.stock,
      lead: p.lead || DEFAULT_LEAD[p.cat],
      leadText: p.lead === 'custom' && p.lead_text ? { en: p.lead_text, mr: p.lead_text_mr || p.lead_text } : null,
      isNew: p.source !== 'seed' && now() - p.created_at < 14 * 864e5
    };
    if (p.photo) o.image = p.photo;
    if (staff) {
      let ai = null; try { ai = p.ai ? JSON.parse(p.ai) : null; } catch (e) { ai = null; }
      Object.assign(o, { status: p.status, source: p.source, createdAt: p.created_at, updatedAt: p.updated_at, ai, sellerVerified: !!p.s_verified });
    }
    return o;
  }
  const productRow = (id) => db.get(PRODUCT_SQL + ' WHERE p.id = ?', id);
  const publicProducts = () => db.all(PRODUCT_SQL + " WHERE p.status = 'active' AND s.active = 1 ORDER BY p.created_at DESC, p.id").map(p => toClient(p));
  function staffProducts(user, { status } = {}) {
    const where = [], args = [];
    if (user.role === 'seller') { where.push('p.seller_id = ?'); args.push(user.sellerId); }
    if (status) { where.push('p.status = ?'); args.push(status); }
    return db.all(PRODUCT_SQL + (where.length ? ' WHERE ' + where.join(' AND ') : '') + ' ORDER BY p.updated_at DESC', ...args).map(p => toClient(p, true));
  }
  function canEditProduct(user, p) {
    if (!p) fail(404, 'not_found', 'Product not found');
    if (user.role !== 'admin' && p.seller_id !== user.sellerId) fail(403, 'forbidden', 'You can only change your own products');
  }
  function announceProduct(id) {
    const p = productRow(id);
    if (!p) { live.publish('product', { action: 'remove', id }); return; }
    const visible = p.status === 'active' && p.s_active;
    const pub = visible ? { action: 'upsert', product: toClient(p) } : { action: 'remove', id };
    const staff = { action: 'upsert', product: toClient(p, true) };
    live.publish('product', (c) => (c.role === 'admin' || (c.role === 'seller' && c.sellerId === p.seller_id) ? staff : pub));
    scheduleStats();
  }

  function savePhoto(dataUrl, baseName) {
    const m = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/]+=*)$/.exec(String(dataUrl || ''));
    if (!m) fail(400, 'bad_photo', 'The photo must be a JPEG, PNG or WebP image');
    const buf = Buffer.from(m[2], 'base64');
    if (buf.length > config.maxUploadMB * 1048576) fail(413, 'photo_too_large', `The photo must be smaller than ${config.maxUploadMB} MB`);
    const magic = { jpeg: [0xFF, 0xD8, 0xFF], png: [0x89, 0x50, 0x4E, 0x47] }[m[1]];
    const okMagic = m[1] === 'webp' ? buf.slice(0, 4).toString() === 'RIFF' && buf.slice(8, 12).toString() === 'WEBP' : magic.every((b, i) => buf[i] === b);
    if (!okMagic) fail(400, 'bad_photo', 'The photo file is not a valid image');
    const file = `${baseName}-${crypto.randomBytes(4).toString('hex')}.${m[1] === 'jpeg' ? 'jpg' : m[1]}`;
    fs.mkdirSync(config.uploadsDir, { recursive: true });
    fs.writeFileSync(path.join(config.uploadsDir, file), buf);
    return '/uploads/' + file;
  }
  function removePhoto(url) {
    if (!url || !url.startsWith('/uploads/')) return;
    const file = path.join(config.uploadsDir, path.basename(url));
    fs.rm(file, { force: true }, () => {});
  }

  function productFields(body, { partial }) {
    const out = {};
    const has = (k) => body[k] !== undefined;
    if (!partial || has('name')) out.name_en = text(body.name, 80, { min: 2, field: 'name' });
    if (has('nameMr')) out.name_mr = text(body.nameMr, 80) || null;
    if (!partial || has('cat')) { if (!CATS.includes(body.cat)) fail(400, 'invalid_cat', 'Category must be food, tailoring, craft or agri'); out.cat = body.cat; }
    if (!partial || has('price')) out.price = int(body.price, 1, 500000, 'price');
    if (has('stock')) out.stock = body.stock === null || body.stock === '' ? null : int(body.stock, 0, 100000, 'stock');
    if (has('unit')) out.unit_en = text(body.unit, 40) || null;
    if (has('unitMr')) out.unit_mr = text(body.unitMr, 40) || null;
    if (has('desc')) out.desc_en = text(body.desc, 400) || null;
    if (has('descMr')) out.desc_mr = text(body.descMr, 400) || null;
    if (has('lead')) { if (!LEADS.includes(body.lead)) fail(400, 'invalid_lead', 'Choose one of the availability options'); out.lead = body.lead; }
    if (has('leadText')) out.lead_text = text(body.leadText, 60) || null;
    if (has('leadTextMr')) out.lead_text_mr = text(body.leadTextMr, 60) || null;
    return out;
  }
  // "custom" availability needs the seller's own words
  function checkLead(lead, leadText) {
    if (lead === 'custom' && !(leadText && leadText.length >= 3)) fail(400, 'lead_text_required', 'Write your own availability text, for example "Fresh every Sunday"');
  }

  /** Create a product: from the AI Catalogue (photo + CNN output) or the console's "Add product" form.
      Only signed-in accounts can list. A seller's listing always belongs to her own shop; the admin
      must say which seller a listing belongs to. */
  function createProduct(body, user, { source }) {
    if (!user) fail(401, 'signin_required', 'Please sign in');
    const f = productFields(body, { partial: false });
    let sellerId, status;
    const s = getSettings(db);
    if (user.role === 'seller') {
      sellerId = user.sellerId;   // whatever the request says
      const seller = db.get('SELECT verified FROM sellers WHERE id = ?', sellerId);
      status = seller && seller.verified && s.autoApproveVerified ? 'active' : 'pending';
    } else {
      if (!body.sellerId) fail(400, 'seller_required', 'Choose the seller this listing belongs to');
      if (!db.get('SELECT id FROM sellers WHERE id = ?', body.sellerId)) fail(400, 'invalid_seller', 'Unknown seller');
      sellerId = body.sellerId;
      status = 'active';
    }
    const lead = f.lead || DEFAULT_LEAD[f.cat];
    checkLead(lead, f.lead_text);
    const id = newId('p'), t = now();
    let ai = null;
    if (body.ai && typeof body.ai === 'object') {
      const top = Array.isArray(body.ai.top) ? body.ai.top.slice(0, 5).map(x => ({ className: text(x.className, 80), probability: Math.max(0, Math.min(1, Number(x.probability) || 0)) })) : [];
      ai = JSON.stringify({ top, readiness: Math.max(0, Math.min(100, Math.round(Number(body.ai.readiness) || 0))), model: text(body.ai.model, 40) });
    }
    const photo = body.photo ? savePhoto(body.photo, id) : null;
    try {
      db.run(`INSERT INTO products (id, seller_id, cat, name_en, name_mr, unit_en, unit_mr, desc_en, desc_mr, price, stock, perish, pop, fest, art, photo,
                                    lead, lead_text, lead_text_mr, status, source, ai, created_at, updated_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0.35, 0.5, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        id, sellerId, f.cat, f.name_en, f.name_mr || null, f.unit_en || null, f.unit_mr || null, f.desc_en || null, f.desc_mr || null,
        f.price, f.stock === undefined ? null : f.stock, PERISH[f.cat], photo ? 'photo' : DEFAULT_ART[f.cat], photo,
        lead, lead === 'custom' ? f.lead_text : null, lead === 'custom' ? (f.lead_text_mr || null) : null, status, source, ai, t, t);
    } catch (e) { removePhoto(photo); throw e; }
    audit(user, 'product.create', id, { name: f.name_en, status, source });
    announceProduct(id);
    if (status === 'pending') live.publish('notice', { kind: 'listing', id, name: f.name_en }, (c) => c.role === 'admin');
    return toClient(productRow(id), true);
  }

  function updateProduct(id, body, user) {
    const p = productRow(id);
    canEditProduct(user, p);
    const f = productFields(body, { partial: true });
    if (body.status !== undefined) {
      const allowed = user.role === 'admin' ? ['active', 'pending', 'hidden', 'rejected'] : ['active', 'hidden'];
      if (!allowed.includes(body.status)) fail(400, 'invalid_status', 'Status must be one of ' + allowed.join(', '));
      if (user.role === 'seller' && body.status === 'active' && (p.status === 'pending' || p.status === 'rejected')) fail(403, 'needs_review', 'The SheSell team reviews this listing before it goes live');
      f.status = body.status;
    }
    if (body.photo) f.photo = savePhoto(body.photo, id);
    if (user.role === 'admin' && body.sellerId !== undefined) {
      if (!db.get('SELECT id FROM sellers WHERE id = ?', body.sellerId)) fail(400, 'invalid_seller', 'Unknown seller');
      f.seller_id = body.sellerId;
    }
    if (f.lead !== undefined || f.lead_text !== undefined) checkLead(f.lead ?? p.lead, f.lead_text !== undefined ? f.lead_text : p.lead_text);
    const keys = Object.keys(f);
    if (!keys.length) return toClient(p, true);
    if (f.cat && f.cat !== p.cat) { f.perish = PERISH[f.cat]; if (!p.photo && !f.photo) f.art = DEFAULT_ART[f.cat]; }
    if (f.photo) f.art = 'photo';
    const cols = Object.keys(f);
    db.run(`UPDATE products SET ${cols.map(k => k + ' = ?').join(', ')}, updated_at = ? WHERE id = ?`, ...cols.map(k => f[k]), now(), id);
    if (f.photo && p.photo) removePhoto(p.photo);
    audit(user, 'product.update', id, f.photo ? Object.assign({}, f, { photo: 'new photo' }) : f);
    announceProduct(id);
    return toClient(productRow(id), true);
  }

  function deleteProduct(id, user) {
    const p = productRow(id);
    canEditProduct(user, p);
    const sold = db.get('SELECT COUNT(*) AS n FROM order_items WHERE product_id = ?', id).n;
    if (sold) {
      db.run("UPDATE products SET status = 'hidden', updated_at = ? WHERE id = ?", now(), id);
      audit(user, 'product.hide', id, { reason: 'has orders' });
      announceProduct(id);
      return { hidden: true };
    }
    db.run('DELETE FROM products WHERE id = ?', id);
    removePhoto(p.photo);
    audit(user, 'product.delete', id, { name: p.name_en });
    announceProduct(id);
    return { deleted: true };
  }

  /* ================= sellers ================= */
  function findOrCreateSeller(info, { verified }) {
    const name = text(info.name, 80, { min: 2, field: 'seller name' });
    const place = text(info.place, 80);
    const type = info.type === 'shg' ? 'shg' : 'individual';
    const existing = db.get('SELECT id FROM sellers WHERE lower(name) = lower(?)', name);
    if (existing) return existing.id;
    const id = newId('s');
    db.run('INSERT INTO sellers (id, name, type, place, members, verified, active, created_at) VALUES (?, ?, ?, ?, ?, ?, 1, ?)',
      id, name, type, place, type === 'shg' ? 10 : 1, verified, now());
    live.publish('notice', { kind: 'seller', id, name }, (c) => c.role === 'admin');
    return id;
  }
  const publicSellers = () => db.all(`SELECT s.id, s.name, s.name_mr, s.type, s.place, s.place_mr, s.members, s.verified,
        (SELECT COUNT(*) FROM products p WHERE p.seller_id = s.id AND p.status = 'active') AS products
      FROM sellers s WHERE s.active = 1 ORDER BY products DESC, s.name`)
    .filter(s => s.products > 0)
    .map(s => ({ id: s.id, name: { en: s.name, mr: s.name_mr || s.name }, type: s.type, place: { en: s.place, mr: s.place_mr || s.place }, members: s.members, products: s.products, verified: !!s.verified }));

  function adminSellers() {
    return db.all(`SELECT s.*,
        (SELECT COUNT(*) FROM products p WHERE p.seller_id = s.id AND p.status = 'active') AS products,
        (SELECT COUNT(*) FROM products p WHERE p.seller_id = s.id AND p.status = 'pending') AS pending,
        (SELECT COUNT(DISTINCT oi.order_id) FROM order_items oi JOIN orders o ON o.id = oi.order_id WHERE oi.seller_id = s.id AND o.status <> 'cancelled') AS orders,
        (SELECT COALESCE(SUM(oi.price * oi.qty), 0) FROM order_items oi JOIN orders o ON o.id = oi.order_id WHERE oi.seller_id = s.id AND o.status = 'delivered') AS revenue,
        (SELECT login FROM users u WHERE u.seller_id = s.id LIMIT 1) AS login,
        (SELECT COUNT(*) FROM lessons_done l WHERE l.seller_id = s.id) AS lessons
      FROM sellers s ORDER BY s.verified ASC, s.created_at DESC`).map(s => ({
      id: s.id, name: s.name, nameMr: s.name_mr, type: s.type, place: s.place, placeMr: s.place_mr, phone: s.phone, members: s.members,
      bio: s.bio, verified: !!s.verified, active: !!s.active, createdAt: s.created_at, products: s.products, pending: s.pending,
      orders: s.orders, revenue: s.revenue, login: s.login, lessons: s.lessons
    }));
  }
  function updateSeller(id, body, user) {
    const s = db.get('SELECT * FROM sellers WHERE id = ?', id);
    if (!s) fail(404, 'not_found', 'Seller not found');
    if (user.role === 'seller' && user.sellerId !== id) fail(403, 'forbidden', 'You can only change your own profile');
    const f = {};
    if (body.name !== undefined) f.name = text(body.name, 80, { min: 2, field: 'name' });
    if (body.nameMr !== undefined) f.name_mr = text(body.nameMr, 80) || null;
    if (body.place !== undefined) f.place = text(body.place, 80);
    if (body.placeMr !== undefined) f.place_mr = text(body.placeMr, 80) || null;
    if (body.members !== undefined) f.members = int(body.members, 1, 500, 'members');
    if (body.bio !== undefined) f.bio = text(body.bio, 300) || null;
    if (body.type !== undefined) { if (!['shg', 'individual'].includes(body.type)) fail(400, 'invalid_type', 'Type must be shg or individual'); f.type = body.type; }
    if (user.role === 'admin') {
      if (body.verified !== undefined) f.verified = body.verified ? 1 : 0;
      if (body.active !== undefined) f.active = body.active ? 1 : 0;
      if (body.phone !== undefined) f.phone = body.phone ? (normPhone(body.phone) || fail(400, 'bad_phone', 'Enter a 10-digit mobile number')) : null;
    }
    const cols = Object.keys(f);
    if (cols.length) db.run(`UPDATE sellers SET ${cols.map(k => k + ' = ?').join(', ')} WHERE id = ?`, ...cols.map(k => f[k]), id);
    if (f.verified === 1 && !s.verified) {
      // approving a seller also publishes her listings that were waiting for review
      const waiting = db.all("SELECT id FROM products WHERE seller_id = ? AND status = 'pending'", id);
      db.run("UPDATE products SET status = 'active', updated_at = ? WHERE seller_id = ? AND status = 'pending'", now(), id);
      waiting.forEach(p => announceProduct(p.id));
    }
    if (f.name || f.name_mr || f.place || f.place_mr || f.type || f.active !== undefined) {
      db.all('SELECT id FROM products WHERE seller_id = ?', id).forEach(p => announceProduct(p.id));
    }
    audit(user, 'seller.update', id, f);
    return adminSellers().find(x => x.id === id);
  }

  /* ================= orders ================= */
  const orderRow = (id) => db.get('SELECT * FROM orders WHERE id = ?', id);
  function fullOrder(id) {
    const o = orderRow(id);
    if (!o) return null;
    const items = db.all(`SELECT oi.*, s.name AS seller_name FROM order_items oi LEFT JOIN sellers s ON s.id = oi.seller_id
                          WHERE oi.order_id = ? ORDER BY oi.rowid`, id);
    const events = db.all('SELECT kind, value, at, by_user FROM order_events WHERE order_id = ? ORDER BY at, id', id);
    return {
      id: o.id, status: o.status, payment: o.payment, verification: verification(o.payment), mode: o.mode, subtotal: o.subtotal, fee: o.fee, total: o.total,
      createdAt: o.created_at, updatedAt: o.updated_at,
      items: items.map(i => ({ id: i.product_id, name: { en: i.name_en, mr: i.name_mr || i.name_en }, unit: { en: i.unit_en || '', mr: i.unit_mr || i.unit_en || '' },
        cat: i.cat, price: i.price, q: i.qty, sellerId: i.seller_id, sellerName: i.seller_name || '', packed: !!i.packed_at })),
      events: events.map(e => ({ kind: e.kind, value: e.value, at: e.at })),
      customer: { name: o.customer_name, phone: o.customer_phone, place: o.place },
      note: o.note || '', paymentRef: o.payment_ref || '', demo: !!o.demo, lang: o.lang || 'en'
    };
  }
  const customerView = (f) => ({
    id: f.id, status: f.status, payment: f.payment, verification: f.verification, mode: f.mode, subtotal: f.subtotal, fee: f.fee, total: f.total, createdAt: f.createdAt, updatedAt: f.updatedAt,
    items: f.items.map(i => ({ id: i.id, name: i.name, unit: i.unit, cat: i.cat, price: i.price, q: i.q })),
    events: f.events.filter(e => e.kind !== 'note')
  });
  const sellerView = (f, sellerId) => Object.assign({}, f, {
    items: f.items.map(i => Object.assign({}, i, { mine: i.sellerId === sellerId })),
    allMine: f.items.every(i => i.sellerId === sellerId)
  });
  function staffView(f, user) { return user.role === 'admin' ? f : sellerView(f, user.sellerId); }

  function announceOrder(id, kind) {
    const f = fullOrder(id);
    if (!f) return;
    const cust = customerView(f);
    live.publish('order', (c) => {
      if (c.role === 'admin') return { kind, order: f };
      if (c.role === 'seller' && f.items.some(i => i.sellerId === c.sellerId)) return { kind, order: sellerView(f, c.sellerId) };
      if (c.track.has(id)) return { kind, order: cust };
      return undefined;
    });
    scheduleStats();
  }

  function createOrder(body) {
    const s = getSettings(db);
    if (!s.storeOpen) fail(503, 'store_closed', 'The store is not taking orders right now');
    const c = body.customer || {};
    const name = text(c.name, 60, { min: 2, field: 'name' });
    const phone = normPhone(c.phone) || fail(400, 'bad_phone', 'Enter a 10-digit mobile number');
    const place = text(c.place, 120);
    const mode = body.mode === 'pickup' ? 'pickup' : 'delivery';
    if (mode === 'delivery' && place.length < 3) fail(400, 'place_required', 'Add your area or village for delivery');
    const raw = Array.isArray(body.items) ? body.items : [];
    if (!raw.length) fail(400, 'empty_order', 'The basket is empty');
    if (raw.length > 30) fail(400, 'too_many_items', 'At most 30 different products per order');
    const qty = new Map();
    for (const it of raw) {
      const id = String(it && it.id || '');
      qty.set(id, (qty.get(id) || 0) + int(it && it.q, 1, 20, 'quantity'));
    }
    const token = crypto.randomBytes(18).toString('base64url');
    const lang = body.lang === 'mr' ? 'mr' : 'en';
    const id = db.tx(() => {
      const lines = [];
      for (const [pid, q] of qty) {
        const p = productRow(pid);
        if (!p || p.status !== 'active' || !p.s_active) fail(409, 'unavailable', 'A product in your basket is no longer available', { productId: pid });
        if (q > 20) fail(400, 'invalid_quantity', 'At most 20 of one product per order');
        if (p.stock !== null && p.stock < q) fail(409, 'out_of_stock', `Only ${p.stock} left of ${p.name_en}`, { productId: pid, available: p.stock });
        lines.push({ p, q });
      }
      const subtotal = lines.reduce((a, x) => a + x.p.price * x.q, 0);
      const fee = mode === 'delivery' && subtotal < s.freeDeliveryAbove ? s.deliveryFee : 0;
      const seq = (db.get('SELECT COALESCE(MAX(seq), 0) AS m FROM orders').m || 0) + 1;
      const oid = 'SSL-' + (1000 + seq), t = now();
      db.run(`INSERT INTO orders (id, seq, track_hash, customer_name, customer_phone, place, mode, subtotal, fee, total, status, payment, lang, created_at, updated_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'confirmed', 'pending', ?, ?, ?)`,
        oid, seq, sha256(token), name, phone, place, mode, subtotal, fee, subtotal + fee, lang, t, t);
      for (const { p, q } of lines) {
        db.run(`INSERT INTO order_items (order_id, product_id, seller_id, name_en, name_mr, unit_en, unit_mr, cat, price, qty)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, oid, p.id, p.seller_id, p.name_en, p.name_mr, p.unit_en, p.unit_mr, p.cat, p.price, q);
        if (p.stock !== null) db.run('UPDATE products SET stock = stock - ?, updated_at = ? WHERE id = ?', q, t, p.id);
      }
      db.run('INSERT INTO order_events (order_id, kind, value, at) VALUES (?, ?, ?, ?)', oid, 'status', 'confirmed', t);
      return oid;
    });
    announceOrder(id, 'created');
    qty.forEach((_, pid) => { const p = productRow(pid); if (p && p.stock !== null) announceProduct(pid); });
    live.publish('notice', { kind: 'order', id }, (c) => live.isStaff(c));
    return Object.assign(customerView(fullOrder(id)), { token });
  }

  function customerOrder(id, token) {
    const o = orderRow(id);
    if (!o || !token || o.track_hash !== sha256(token)) fail(404, 'not_found', 'Order not found');
    return customerView(fullOrder(id));
  }
  const tokenMatches = (id, token) => { const o = orderRow(id); return !!(o && token && o.track_hash === sha256(token)); };

  function claimPayment(id, token, ref) {
    const o = orderRow(id);
    if (!o || !token || o.track_hash !== sha256(token)) fail(404, 'not_found', 'Order not found');
    if (o.status === 'cancelled') fail(409, 'cancelled', 'This order was cancelled');
    if (o.payment === 'pending') {
      db.run("UPDATE orders SET payment = 'claimed', payment_ref = ?, updated_at = ? WHERE id = ?", text(ref, 40) || null, now(), id);
      db.run('INSERT INTO order_events (order_id, kind, value, at) VALUES (?, ?, ?, ?)', id, 'payment', 'claimed', now());
      announceOrder(id, 'payment');
    }
    return customerView(fullOrder(id));
  }

  function staffOrders(user, { status, q, limit = 200 } = {}) {
    const where = [], args = [];
    if (user.role === 'seller') { where.push('o.id IN (SELECT order_id FROM order_items WHERE seller_id = ?)'); args.push(user.sellerId); }
    if (status === 'active') where.push("o.status IN ('confirmed','packed','out')");
    else if (status === 'claimed') where.push("o.payment = 'claimed' AND o.status <> 'cancelled'");
    else if (status === 'unpaid') where.push("o.payment = 'pending' AND o.status <> 'cancelled'");
    else if (status) { where.push('o.status = ?'); args.push(status); }
    if (q) { where.push('(o.id LIKE ? OR o.customer_name LIKE ? OR o.customer_phone LIKE ? OR o.place LIKE ?)'); const like = '%' + String(q).slice(0, 40) + '%'; args.push(like, like, like, like); }
    const ids = db.all(`SELECT o.id FROM orders o ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY o.created_at DESC LIMIT ?`, ...args, Math.min(500, Number(limit) || 200));
    return ids.map(r => staffView(fullOrder(r.id), user));
  }
  function staffOrder(id, user) {
    const f = fullOrder(id);
    if (!f) fail(404, 'not_found', 'Order not found');
    if (user.role === 'seller' && !f.items.some(i => i.sellerId === user.sellerId)) fail(404, 'not_found', 'Order not found');
    return staffView(f, user);
  }

  function setStatus(id, next, user) {
    const f = staffOrder(id, user);
    if (![...FLOW, 'cancelled'].includes(next)) fail(400, 'invalid_status', 'Unknown status');
    if (user.role === 'seller' && !f.items.every(i => i.sellerId === user.sellerId)) fail(403, 'shared_order', 'This order has items from other sellers, so the SheSell team updates it. You can mark your items as packed.');
    if (f.status === next) return staffView(fullOrder(id), user);
    if (f.status === 'delivered' || f.status === 'cancelled') fail(409, 'order_closed', `This order is already ${f.status}`);
    if (next !== 'cancelled' && FLOW.indexOf(next) < FLOW.indexOf(f.status)) fail(409, 'backwards', 'An order cannot move back to an earlier step');
    const t = now();
    db.tx(() => {
      db.run('UPDATE orders SET status = ?, updated_at = ? WHERE id = ?', next, t, id);
      if (next === 'cancelled') {
        for (const i of f.items) db.run('UPDATE products SET stock = stock + ? WHERE id = ? AND stock IS NOT NULL', i.q, i.id);
      } else if (next !== 'confirmed') {
        db.run('UPDATE order_items SET packed_at = ? WHERE order_id = ? AND packed_at IS NULL', t, id);
      }
      db.run('INSERT INTO order_events (order_id, kind, value, by_user, at) VALUES (?, ?, ?, ?, ?)', id, 'status', next, user.name, t);
    });
    audit(user, 'order.status', id, { from: f.status, to: next });
    announceOrder(id, 'status');
    if (next === 'cancelled') f.items.forEach(i => { const p = productRow(i.id); if (p && p.stock !== null) announceProduct(i.id); });
    return staffView(fullOrder(id), user);
  }

  function packItems(id, user) {
    const f = staffOrder(id, user);
    if (f.status !== 'confirmed') fail(409, 'not_confirmed', 'Only new orders can be packed');
    const t = now();
    db.tx(() => {
      if (user.role === 'admin') db.run('UPDATE order_items SET packed_at = ? WHERE order_id = ? AND packed_at IS NULL', t, id);
      else db.run('UPDATE order_items SET packed_at = ? WHERE order_id = ? AND seller_id = ? AND packed_at IS NULL', t, id, user.sellerId);
      db.run('INSERT INTO order_events (order_id, kind, value, by_user, at) VALUES (?, ?, ?, ?, ?)', id, 'packed_items', user.role === 'admin' ? 'all' : user.sellerId, user.name, t);
      const left = db.get('SELECT COUNT(*) AS n FROM order_items WHERE order_id = ? AND packed_at IS NULL', id).n;
      if (!left) {
        db.run("UPDATE orders SET status = 'packed', updated_at = ? WHERE id = ?", t, id);
        db.run('INSERT INTO order_events (order_id, kind, value, by_user, at) VALUES (?, ?, ?, ?, ?)', id, 'status', 'packed', user.name, t);
      } else db.run('UPDATE orders SET updated_at = ? WHERE id = ?', t, id);
    });
    audit(user, 'order.pack', id);
    announceOrder(id, 'status');
    return staffView(fullOrder(id), user);
  }

  /** Admin only (the route checks): confirms a UPI payment after seeing it in the bank app. */
  function setPayment(id, payment, ref, user) {
    if (!['pending', 'paid', 'refunded'].includes(payment)) fail(400, 'invalid_payment', 'Unknown payment state');
    const f = staffOrder(id, user);
    if (f.payment === payment) return f;
    db.run('UPDATE orders SET payment = ?, payment_ref = COALESCE(?, payment_ref), updated_at = ? WHERE id = ?', payment, ref ? text(ref, 40) : null, now(), id);
    db.run('INSERT INTO order_events (order_id, kind, value, by_user, at) VALUES (?, ?, ?, ?, ?)', id, 'payment', payment, user.name, now());
    audit(user, 'order.payment', id, { from: f.payment, to: payment });
    announceOrder(id, 'payment');
    return fullOrder(id);
  }
  function setNote(id, note, user) {
    staffOrder(id, user);
    db.run('UPDATE orders SET note = ?, updated_at = ? WHERE id = ?', text(note, 500) || null, now(), id);
    audit(user, 'order.note', id);
    announceOrder(id, 'note');
    return staffView(fullOrder(id), user);
  }

  /* ================= stats + overview ================= */
  function stats() {
    const one = (sql, ...a) => { const r = db.get(sql, ...a); return r ? Number(Object.values(r)[0]) || 0 : 0; };
    const ev = Object.fromEntries(db.all('SELECT type, COUNT(*) AS n FROM events GROUP BY type').map(r => [r.type, r.n]));
    const lessonsDone = one('SELECT COUNT(*) FROM lessons_done');
    return {
      sellers: one(`SELECT COUNT(DISTINCT p.seller_id) FROM products p JOIN sellers s ON s.id = p.seller_id WHERE p.status = 'active' AND s.active = 1`),
      shg: one(`SELECT COUNT(DISTINCT p.seller_id) FROM products p JOIN sellers s ON s.id = p.seller_id WHERE p.status = 'active' AND s.active = 1 AND s.type = 'shg'`),
      products: one(`SELECT COUNT(*) FROM products p JOIN sellers s ON s.id = p.seller_id WHERE p.status = 'active' AND s.active = 1`),
      published: one(`SELECT COUNT(*) FROM products WHERE source <> 'seed' AND status = 'active'`),
      pending: one(`SELECT COUNT(*) FROM products WHERE status = 'pending'`),
      orders: one(`SELECT COUNT(*) FROM orders WHERE status <> 'cancelled'`),
      delivered: one(`SELECT COUNT(*) FROM orders WHERE status = 'delivered'`),
      revenue: one(`SELECT COALESCE(SUM(total), 0) FROM orders WHERE status = 'delivered'`),
      views: ev.view || 0, shares: ev.share || 0, adds: ev.cart_add || 0,
      lessons: (ev.lesson || 0) + lessonsDone, trainings: ev.train || 0, scans: ev.scan || 0
    };
  }
  // what any shopper may see; orders, revenue and engagement counters stay with the admin
  const publicStats = () => { const s = stats(); return { sellers: s.sellers, shg: s.shg, products: s.products }; };
  let statsTimer = null;
  function scheduleStats() {
    if (statsTimer) return;
    statsTimer = setTimeout(() => { statsTimer = null; try { live.publish('stats', stats(), (c) => c.role === 'admin'); } catch (e) { /* db closed during shutdown */ } }, 1500);
    statsTimer.unref();
  }

  function overview(user) {
    const seller = user.role === 'seller' ? user.sellerId : null;
    const day = 864e5, midnight = new Date(); midnight.setHours(0, 0, 0, 0);
    const since = midnight.getTime() - 13 * day;
    // order-level rows for admin, item-level (her share) for a seller
    const rows = seller
      ? db.all(`SELECT o.id, o.created_at, o.status, SUM(oi.price * oi.qty) AS amount FROM orders o JOIN order_items oi ON oi.order_id = o.id
                WHERE oi.seller_id = ? AND o.created_at >= ? GROUP BY o.id`, seller, since)
      : db.all('SELECT id, created_at, status, total AS amount FROM orders WHERE created_at >= ?', since);
    const series = [];
    for (let i = 0; i < 14; i++) {
      const a = since + i * day, b = a + day;
      const inDay = rows.filter(r => r.created_at >= a && r.created_at < b && r.status !== 'cancelled');
      series.push({ day: a, orders: inDay.length, revenue: inDay.reduce((s, r) => s + r.amount, 0) });
    }
    const sum = (list) => list.reduce((a, r) => a + r.revenue, 0);
    const week = series.slice(7), prevWeek = series.slice(0, 7);
    const scope = seller ? 'AND o.id IN (SELECT order_id FROM order_items WHERE seller_id = ?)' : '';
    const sArgs = seller ? [seller] : [];
    const one = (sql, ...a) => { const r = db.get(sql, ...a); return r ? Number(Object.values(r)[0]) || 0 : 0; };
    const toPack = seller
      ? one(`SELECT COUNT(DISTINCT o.id) FROM orders o JOIN order_items oi ON oi.order_id = o.id WHERE o.status = 'confirmed' AND oi.seller_id = ? AND oi.packed_at IS NULL`, seller)
      : one(`SELECT COUNT(*) FROM orders WHERE status = 'confirmed'`);
    const catSql = `SELECT oi.cat, SUM(oi.price * oi.qty) AS revenue, SUM(oi.qty) AS qty FROM order_items oi JOIN orders o ON o.id = oi.order_id
                    WHERE o.status <> 'cancelled' AND o.created_at >= ? ${seller ? 'AND oi.seller_id = ?' : ''} GROUP BY oi.cat`;
    const topSql = `SELECT oi.product_id AS id, oi.name_en AS name, MAX(oi.name_mr) AS nameMr, SUM(oi.qty) AS qty, SUM(oi.price * oi.qty) AS revenue FROM order_items oi JOIN orders o ON o.id = oi.order_id
                    WHERE o.status <> 'cancelled' AND o.created_at >= ? ${seller ? 'AND oi.seller_id = ?' : ''} GROUP BY oi.product_id ORDER BY qty DESC, revenue DESC LIMIT 5`;
    const d30 = Date.now() - 30 * day;
    return {
      kpis: {
        ordersToday: rows.filter(r => r.created_at >= midnight.getTime() && r.status !== 'cancelled').length,
        revenue7d: sum(week), revenuePrev7d: sum(prevWeek),
        toPack,
        inTransit: one(`SELECT COUNT(*) FROM orders o WHERE o.status IN ('packed','out') ${scope}`, ...sArgs),
        claimed: seller ? 0 : one(`SELECT COUNT(*) FROM orders WHERE payment = 'claimed' AND status <> 'cancelled'`),
        unpaid: seller ? 0 : one(`SELECT COALESCE(SUM(total), 0) FROM orders WHERE payment IN ('pending','claimed') AND status <> 'cancelled'`),
        pendingListings: one(`SELECT COUNT(*) FROM products WHERE status = 'pending' ${seller ? 'AND seller_id = ?' : ''}`, ...sArgs),
        products: one(`SELECT COUNT(*) FROM products WHERE status = 'active' ${seller ? 'AND seller_id = ?' : ''}`, ...sArgs),
        sellers: seller ? 0 : one('SELECT COUNT(*) FROM sellers WHERE active = 1'),
        unverified: seller ? 0 : one('SELECT COUNT(*) FROM sellers WHERE verified = 0 AND active = 1'),
        lowStock: one(`SELECT COUNT(*) FROM products WHERE status = 'active' AND stock IS NOT NULL AND stock <= 5 ${seller ? 'AND seller_id = ?' : ''}`, ...sArgs)
      },
      series,
      byCategory: CATS.map(c => { const r = db.all(catSql, d30, ...sArgs).find(x => x.cat === c); return { cat: c, revenue: r ? r.revenue : 0, qty: r ? r.qty : 0 }; }),
      top: db.all(topSql, d30, ...sArgs),
      recent: staffOrders(user, { limit: 6 }),
      engagement: seller ? null : stats(),
      setup: seller ? [] : setupIssues(getSettings(db))
    };
  }

  /* ================= events (anonymous engagement counters) ================= */
  function recordEvent(type, productId, meta) {
    if (!EVENT_TYPES.includes(type)) fail(400, 'invalid_event', 'Unknown event type');
    db.run('INSERT INTO events (type, product_id, meta, at) VALUES (?, ?, ?, ?)', type, productId ? text(productId, 40) : null, meta ? text(meta, 60) : null, now());
    scheduleStats();
  }

  /* ================= training data for the Seller Studio MLP ================= */
  function trainingData() {
    const s = getSettings(db);
    const real = db.all('SELECT * FROM price_samples ORDER BY rowid LIMIT 5000').map(r => ({
      id: r.id, cat: r.cat, mat: r.mat, hrs: r.hrs, tier: r.tier, season: r.season, price: r.price, orders: r.orders,
      month: r.month, district: r.district || '', seller: r.seller || 'Individual', item: r.item || '', createdAt: r.created_at
    }));
    return { synthetic: s.synthetic, real };
  }
  function addSamples(records, user) {
    const added = [], skipped = [];
    db.tx(() => {
      records.forEach((r, i) => {
        const v = DATAGEN.check(r);
        if (v.error) { skipped.push({ row: r._line || i + 1, field: v.error, error: v.message }); return; }
        const id = newId('rx');
        db.run(`INSERT INTO price_samples (id, cat, mat, hrs, tier, season, price, orders, month, district, seller, item, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          id, v.cat, v.mat, v.hrs, v.tier, v.season, v.price, v.orders, v.month >= 0 ? v.month : null, v.district || null, v.seller, v.item || null, now());
        added.push(id);
      });
    });
    if (added.length) audit(user, 'training.add', null, { rows: added.length });
    if (added.length) live.publish('training', { changed: true });
    return { added: added.length, skipped };
  }
  function basketsFromOrders() {
    return db.all(`SELECT GROUP_CONCAT(oi.product_id) AS ids FROM order_items oi JOIN orders o ON o.id = oi.order_id
                   WHERE o.status <> 'cancelled' GROUP BY oi.order_id ORDER BY MAX(o.created_at) DESC LIMIT 1000`).map(r => String(r.ids).split(','));
  }

  /* ================= settings ================= */
  // every WhatsApp link in the shop and the console goes to this one official number (never a blank chat picker)
  const publicSettings = (s = getSettings(db)) => ({
    upiId: s.upiId, upiName: s.upiName, whatsappNumber: s.whatsappNumber || PLACEHOLDER_WHATSAPP, deliveryFee: s.deliveryFee,
    freeDeliveryAbove: s.freeDeliveryAbove, fairWage: s.fairWage, storeOpen: s.storeOpen, announcement: s.announcement,
    setupIssues: setupIssues(s)
  });
  function updateSettings(body, user) {
    const p = {};
    if (body.upiId !== undefined) { const v = String(body.upiId).trim(); if (!/^[a-zA-Z0-9.\-_]{2,256}@[a-zA-Z][a-zA-Z0-9]{1,63}$/.test(v)) fail(400, 'invalid_upi', 'UPI ID looks like name@bank'); p.upiId = v; }
    if (body.upiName !== undefined) p.upiName = text(body.upiName, 60, { min: 2, field: 'payee name' });
    if (body.whatsappNumber !== undefined) {
      let d = String(body.whatsappNumber).replace(/\D/g, '');
      if (d.length === 10) d = '91' + d;
      if (!d) fail(400, 'whatsapp_required', 'Enter the official WhatsApp Business number');
      if (!/^[1-9]\d{10,14}$/.test(d) || /^910+$/.test(d)) fail(400, 'invalid_whatsapp', 'WhatsApp number: 10-digit mobile, or country code + number');
      p.whatsappNumber = d;
    }
    if (body.deliveryFee !== undefined) p.deliveryFee = int(body.deliveryFee, 0, 1000, 'delivery fee');
    if (body.freeDeliveryAbove !== undefined) p.freeDeliveryAbove = int(body.freeDeliveryAbove, 0, 100000, 'free delivery threshold');
    if (body.fairWage !== undefined) p.fairWage = int(body.fairWage, 10, 5000, 'fair wage');
    if (body.storeOpen !== undefined) p.storeOpen = !!body.storeOpen;
    if (body.autoApproveVerified !== undefined) p.autoApproveVerified = !!body.autoApproveVerified;
    if (body.announcement !== undefined) {
      const a = body.announcement || {};
      p.announcement = { en: text(a.en, 160), mr: text(a.mr, 160) };
    }
    if (body.synthetic !== undefined) {
      const sy = body.synthetic || {};
      p.synthetic = { enabled: !!sy.enabled, n: int(sy.n, 0, 2000, 'synthetic rows'), seed: int(sy.seed, 1, 999999, 'seed') };
    }
    const s = saveSettings(db, p);
    audit(user, 'settings.update', null, Object.keys(p));
    live.publish('settings', publicSettings(s));
    if (p.synthetic) live.publish('training', { changed: true });
    return s;
  }

  /* ================= audit ================= */
  function audit(user, action, target, detail) {
    db.run('INSERT INTO audit (user_id, user_name, action, target, detail, at) VALUES (?, ?, ?, ?, ?, ?)',
      user ? user.id : null, user ? user.name : 'customer', action, target || null, detail ? JSON.stringify(detail).slice(0, 600) : null, now());
  }

  return {
    toClient, productRow, publicProducts, staffProducts, createProduct, updateProduct, deleteProduct,
    publicSellers, adminSellers, updateSeller, findOrCreateSeller,
    createOrder, customerOrder, tokenMatches, claimPayment, staffOrders, staffOrder, setStatus, packItems, setPayment, setNote, fullOrder,
    stats, publicStats, overview, recordEvent, trainingData, addSamples, basketsFromOrders,
    publicSettings, updateSettings, audit, announceProduct
  };
}

module.exports = { createServices, CATS, FLOW };
