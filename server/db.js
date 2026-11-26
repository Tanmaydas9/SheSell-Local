/* ------------------------------------------------------------------
   SQLite database (node:sqlite, built into Node 22+): schema,
   migrations, small query helpers and the demo seed.
------------------------------------------------------------------- */
'use strict';
const crypto = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');
const { CATALOG, DATAGEN } = require('./lib/shared');

const now = () => Date.now();
const newId = (prefix) => prefix + '_' + crypto.randomBytes(6).toString('base64url');
const sha256 = (s) => crypto.createHash('sha256').update(String(s)).digest('base64url');

// Placeholders shipped with the demo. The console's Settings page warns until the owner replaces both.
// The WhatsApp placeholder is not a real number, so a link to it opens WhatsApp's "invalid number"
// notice instead of a stranger's chat.
const PLACEHOLDER_WHATSAPP = '910000000000';
const DEMO_UPI = 'shesell.demo@upi';
const DEFAULT_SETTINGS = {
  upiId: DEMO_UPI,                       // demo payee: replace with the collective's real UPI ID
  upiName: 'SheSell Local Collective',
  whatsappNumber: PLACEHOLDER_WHATSAPP,  // the official WhatsApp Business number, country code first, no +
  deliveryFee: 20,
  freeDeliveryAbove: 499,
  fairWage: 60,
  storeOpen: true,
  announcement: { en: '', mr: '' },
  autoApproveVerified: true,             // listings from verified sellers go live without review
  synthetic: { enabled: true, n: 240, seed: 2026 }  // synthetic rows the Seller Studio trains on
};

/** What the owner still has to set before going live: 'whatsapp' and/or 'upi'. */
function setupIssues(s) {
  const out = [];
  if (!s.whatsappNumber || s.whatsappNumber === PLACEHOLDER_WHATSAPP) out.push('whatsapp');
  if (!s.upiId || s.upiId === DEMO_UPI || /demo/i.test(s.upiId)) out.push('upi');
  return out;
}

const { LEADS, DEFAULT_LEAD } = CATALOG;

/* Demo catalogue v1 placed some sellers across the whole state; v2 keeps every seller in the
   pilot area (rural Pune and its neighbouring districts). On upgrade, seeded sellers and
   products the admin has not edited are moved to the v2 values. [id, v1 seller, v1 place, v1 product] */
const V1_SEED = [
  ['p03', 'Rukmini Jadhav', 'Lanja, Ratnagiri', 'Raw Mango Pickle'], ['p05', 'Jijau Mahila Bachat Gat', 'Gaganbawda, Kolhapur', 'Nachni Papad'],
  ['p06', 'Meena Shinde', 'Yeola, Nashik', 'Tailored Blouse, Paithani Border'], ['p07', 'Savitribai Phule Mahila Bachat Gat', 'Dindori, Nashik', 'Block-Print Cotton Kurti'],
  ['p11', 'Rangoli Handloom Bachat Gat', 'Ichalkaranji, Kolhapur', 'Handloom Tote Bag'], ['p12', 'Kamal Wangad', 'Dahanu, Palghar', 'Warli Painting, A3'],
  ['p14', 'Melghat Bamboo Craft Bachat Gat', 'Chikhaldara, Amravati', 'Bamboo Basket'], ['p17', 'Shobha Thakre', 'Katol, Nagpur', 'Nagpur Oranges'],
  ['p18', 'Panchganga Mahila Shetkari Gat', 'Shirol, Kolhapur', 'Organic Jaggery'], ['p19', 'Sarala Patil', 'Raver, Jalgaon', 'Jalgaon Bananas']
];
function upgradeSeedCatalog(db) {
  V1_SEED.forEach(([pid, sellerV1, placeV1, nameV1]) => {
    const item = CATALOG.items.find(p => p.id === pid);
    const sid = 's' + pid.slice(1);   // seedCatalog gives the n-th item's seller the id sNN
    db.run('UPDATE sellers SET name = ?, name_mr = ?, place = ?, place_mr = ? WHERE id = ? AND name = ? AND place = ?',
      item.seller.en, item.seller.mr, item.place.en, item.place.mr, sid, sellerV1, placeV1);
    db.run(`UPDATE products SET name_en = ?, name_mr = ?, unit_en = ?, unit_mr = ?, desc_en = ?, desc_mr = ?, art = CASE WHEN photo IS NULL THEN ? ELSE art END,
              price = CASE WHEN ? THEN ? ELSE price END, perish = ?, pop = ?, fest = ?
            WHERE id = ? AND source = 'seed' AND name_en = ?`,
      item.name.en, item.name.mr, item.unit.en, item.unit.mr, item.desc.en, item.desc.mr, item.art,
      pid === 'p17' ? 1 : 0, item.price, item.perish, item.pop, item.fest, pid, nameV1);
  });
  CATALOG.items.forEach(item => {
    db.run("UPDATE products SET lead = ?, lead_text = ?, lead_text_mr = ? WHERE id = ? AND source = 'seed'",
      item.lead, item.leadText ? item.leadText.en : null, item.leadText ? item.leadText.mr : null, item.id);
  });
}

const MIGRATIONS = [
  // v1: initial schema
  `CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);

   CREATE TABLE sellers (
     id TEXT PRIMARY KEY,
     name TEXT NOT NULL, name_mr TEXT,
     type TEXT NOT NULL CHECK (type IN ('shg','individual')),
     place TEXT NOT NULL DEFAULT '', place_mr TEXT,
     phone TEXT, members INTEGER, bio TEXT,
     verified INTEGER NOT NULL DEFAULT 0,
     active INTEGER NOT NULL DEFAULT 1,
     created_at INTEGER NOT NULL
   );

   CREATE TABLE users (
     id TEXT PRIMARY KEY,
     role TEXT NOT NULL CHECK (role IN ('admin','seller')),
     login TEXT NOT NULL UNIQUE,
     name TEXT NOT NULL,
     pass_hash TEXT NOT NULL,
     seller_id TEXT REFERENCES sellers(id) ON DELETE CASCADE,
     active INTEGER NOT NULL DEFAULT 1,
     created_at INTEGER NOT NULL,
     last_login INTEGER
   );

   CREATE TABLE sessions (
     token_hash TEXT PRIMARY KEY,
     user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
     created_at INTEGER NOT NULL,
     expires_at INTEGER NOT NULL,
     agent TEXT
   );

   CREATE TABLE products (
     id TEXT PRIMARY KEY,
     seller_id TEXT NOT NULL REFERENCES sellers(id) ON DELETE CASCADE,
     cat TEXT NOT NULL CHECK (cat IN ('food','tailoring','craft','agri')),
     name_en TEXT NOT NULL, name_mr TEXT,
     unit_en TEXT, unit_mr TEXT,
     desc_en TEXT, desc_mr TEXT,
     price INTEGER NOT NULL CHECK (price > 0),
     stock INTEGER CHECK (stock IS NULL OR stock >= 0),
     perish REAL NOT NULL DEFAULT 0.3,
     pop REAL NOT NULL DEFAULT 0.35,
     fest REAL NOT NULL DEFAULT 0.5,
     art TEXT, photo TEXT,
     status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','pending','hidden','rejected')),
     source TEXT NOT NULL DEFAULT 'seed',
     ai TEXT,
     created_at INTEGER NOT NULL,
     updated_at INTEGER NOT NULL
   );
   CREATE INDEX products_seller ON products(seller_id);
   CREATE INDEX products_status ON products(status);

   CREATE TABLE orders (
     id TEXT PRIMARY KEY,
     seq INTEGER NOT NULL UNIQUE,
     track_hash TEXT NOT NULL,
     customer_name TEXT NOT NULL,
     customer_phone TEXT NOT NULL,
     place TEXT NOT NULL DEFAULT '',
     mode TEXT NOT NULL CHECK (mode IN ('delivery','pickup')),
     subtotal INTEGER NOT NULL, fee INTEGER NOT NULL, total INTEGER NOT NULL,
     status TEXT NOT NULL DEFAULT 'confirmed' CHECK (status IN ('confirmed','packed','out','delivered','cancelled')),
     payment TEXT NOT NULL DEFAULT 'pending' CHECK (payment IN ('pending','claimed','paid','refunded')),
     payment_ref TEXT, note TEXT, lang TEXT,
     demo INTEGER NOT NULL DEFAULT 0,
     created_at INTEGER NOT NULL,
     updated_at INTEGER NOT NULL
   );
   CREATE INDEX orders_created ON orders(created_at);

   CREATE TABLE order_items (
     order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
     product_id TEXT NOT NULL,
     seller_id TEXT NOT NULL,
     name_en TEXT NOT NULL, name_mr TEXT, unit_en TEXT, unit_mr TEXT,
     cat TEXT NOT NULL,
     price INTEGER NOT NULL,
     qty INTEGER NOT NULL CHECK (qty BETWEEN 1 AND 99),
     packed_at INTEGER,
     PRIMARY KEY (order_id, product_id)
   );
   CREATE INDEX order_items_seller ON order_items(seller_id);

   CREATE TABLE order_events (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
     kind TEXT NOT NULL,
     value TEXT NOT NULL,
     by_user TEXT,
     at INTEGER NOT NULL
   );
   CREATE INDEX order_events_order ON order_events(order_id);

   CREATE TABLE events (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     type TEXT NOT NULL,
     product_id TEXT,
     meta TEXT,
     at INTEGER NOT NULL
   );
   CREATE INDEX events_type ON events(type);

   CREATE TABLE price_samples (
     id TEXT PRIMARY KEY,
     cat TEXT NOT NULL, mat REAL NOT NULL, hrs REAL NOT NULL, tier INTEGER NOT NULL,
     season REAL NOT NULL, price REAL NOT NULL, orders INTEGER NOT NULL,
     month INTEGER, district TEXT, seller TEXT, item TEXT,
     created_at INTEGER NOT NULL
   );

   CREATE TABLE lessons_done (
     seller_id TEXT NOT NULL REFERENCES sellers(id) ON DELETE CASCADE,
     module TEXT NOT NULL,
     at INTEGER NOT NULL,
     PRIMARY KEY (seller_id, module)
   );

   CREATE TABLE audit (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     user_id TEXT, user_name TEXT,
     action TEXT NOT NULL, target TEXT, detail TEXT,
     at INTEGER NOT NULL
   );`,

  // v2: seller-set availability / lead time on every product ("Fresh batch today", "Made to order · 2–3 days" or her own words)
  (db) => {
    db.exec('ALTER TABLE products ADD COLUMN lead TEXT; ALTER TABLE products ADD COLUMN lead_text TEXT; ALTER TABLE products ADD COLUMN lead_text_mr TEXT;');
    Object.entries(DEFAULT_LEAD).forEach(([cat, key]) => db.run('UPDATE products SET lead = ? WHERE lead IS NULL AND cat = ?', key, cat));
    upgradeSeedCatalog(db);
  }
];

function open(file) {
  const raw = new DatabaseSync(file);
  raw.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 4000; PRAGMA synchronous = NORMAL;');
  const cache = new Map();
  const stmt = (sql) => { let s = cache.get(sql); if (!s) { s = raw.prepare(sql); cache.set(sql, s); } return s; };
  const clean = (p) => p.map(v => (v === undefined ? null : typeof v === 'boolean' ? (v ? 1 : 0) : v));
  let depth = 0;
  const db = {
    raw,
    get: (sql, ...p) => stmt(sql).get(...clean(p)),
    all: (sql, ...p) => stmt(sql).all(...clean(p)),
    run: (sql, ...p) => stmt(sql).run(...clean(p)),
    exec: (sql) => raw.exec(sql),
    // nested calls join the outer transaction
    tx(fn) {
      if (depth > 0) return fn();
      raw.exec('BEGIN IMMEDIATE'); depth++;
      try { const r = fn(); depth--; raw.exec('COMMIT'); return r; }
      catch (e) { depth--; try { raw.exec('ROLLBACK'); } catch (err) { /* already rolled back */ } throw e; }
    },
    close() { cache.clear(); raw.close(); }
  };
  migrate(db);
  return db;
}

function migrate(db) {
  db.exec('CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)');
  const row = db.get("SELECT value FROM meta WHERE key = 'schema_version'");
  const v = row ? Number(row.value) : 0;
  for (let i = v; i < MIGRATIONS.length; i++) {
    db.tx(() => {
      if (typeof MIGRATIONS[i] === 'function') MIGRATIONS[i](db); else db.exec(MIGRATIONS[i]);
      db.run("INSERT OR REPLACE INTO meta (key, value) VALUES ('schema_version', ?)", String(i + 1));
    });
  }
}

/* ---------- settings ---------- */
function getSettings(db) {
  const out = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
  for (const r of db.all('SELECT key, value FROM settings')) {
    try { out[r.key] = JSON.parse(r.value); } catch (e) { /* ignore corrupt value, keep default */ }
  }
  return out;
}
function saveSettings(db, patch) {
  db.tx(() => {
    for (const [k, v] of Object.entries(patch)) db.run('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', k, JSON.stringify(v));
  });
  return getSettings(db);
}

/* ---------- demo seed ---------- */
const memberCount = (name) => { let h = 0; for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return 8 + (h % 13); };

function seedCatalog(db) {
  const t = now();
  const sellerIds = new Map();
  CATALOG.items.forEach((p, i) => {
    let sid = sellerIds.get(p.seller.en);
    if (!sid) {
      sid = 's' + String(i + 1).padStart(2, '0');
      sellerIds.set(p.seller.en, sid);
      db.run(`INSERT INTO sellers (id, name, name_mr, type, place, place_mr, members, verified, active, created_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, 1, 1, ?)`,
        sid, p.seller.en, p.seller.mr, p.type, p.place.en, p.place.mr, p.type === 'shg' ? memberCount(p.seller.en) : 1, t - 120 * 864e5);
    }
    const stock = p.cat === 'tailoring' ? null : 40;   // tailoring is made to order
    db.run(`INSERT INTO products (id, seller_id, cat, name_en, name_mr, unit_en, unit_mr, desc_en, desc_mr, price, stock,
              perish, pop, fest, art, lead, lead_text, lead_text_mr, status, source, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', 'seed', ?, ?)`,
      p.id, sid, p.cat, p.name.en, p.name.mr, p.unit.en, p.unit.mr, p.desc.en, p.desc.mr, p.price, stock,
      p.perish, p.pop, p.fest, p.art, p.lead || DEFAULT_LEAD[p.cat], p.leadText ? p.leadText.en : null, p.leadText ? p.leadText.mr : null,
      t - 90 * 864e5, t - 90 * 864e5);
  });
  return sellerIds;
}

const CUSTOMERS = ['Priya Kulkarni', 'Snehal Deshmukh', 'Anjali Patil', 'Kavita Joshi', 'Meera Shah', 'Rohit Gokhale', 'Vaishali Shinde',
  'Neha Bhosale', 'Amit Kale', 'Pallavi Sawant', 'Swati Naik', 'Rahul Pawar', 'Deepa Chavan', 'Manisha Gaikwad', 'Suresh Jagtap', 'Rupali More'];
// Pilot buyers: Pune city housing societies plus the towns around the sellers
const PLACES = ['Kothrud, Pune', 'Baner, Pune', 'Hadapsar, Pune', 'Wakad, Pune', 'Aundh, Pune', 'Talegaon Dabhade', 'Saswad', 'Shirur',
  'Baramati', 'Narayangaon', 'Wai, Satara', 'Chakan'];

function seedOrders(db, count = 36) {
  const r = DATAGEN.rng(4242);
  const baskets = CATALOG.baskets(count * 2, 99).filter(b => b.length >= 1);
  const products = new Map(db.all('SELECT * FROM products').map(p => [p.id, p]));
  const settings = getSettings(db);
  const day = 864e5, t = now(), today = new Date(); today.setHours(0, 0, 0, 0);
  for (let i = 0; i < count; i++) {
    const seq = i + 1, id = 'SSL-' + (1000 + seq);
    const daysAgo = Math.max(0, 13 - Math.floor(i * 14 / count));
    let at = today.getTime() - daysAgo * day + Math.round((9 + r() * 11) * 3600e3);
    if (at > t - 5 * 60e3) at = t - Math.round((10 + r() * 80) * 60e3);
    const ids = [...new Set(baskets[i])].filter(x => products.has(x));
    if (!ids.length) ids.push('p16');
    const lines = ids.map(pid => ({ p: products.get(pid), q: r() < 0.25 ? 2 : 1 }));
    const mode = r() < 0.7 ? 'delivery' : 'pickup';
    const subtotal = lines.reduce((s, x) => s + x.p.price * x.q, 0);
    const fee = mode === 'delivery' && subtotal < settings.freeDeliveryAbove ? settings.deliveryFee : 0;
    let status = 'delivered', payment = 'paid';
    if (daysAgo === 1) { status = r() < 0.5 ? 'out' : 'delivered'; }
    if (daysAgo === 0) { status = ['confirmed', 'confirmed', 'packed'][i % 3]; payment = ['pending', 'claimed', 'paid'][i % 3]; }
    if (i === 9) { status = 'cancelled'; payment = 'refunded'; }
    const name = CUSTOMERS[i % CUSTOMERS.length];
    const phone = '9' + String(800000000 + Math.floor(r() * 99999999)).slice(0, 9);
    db.run(`INSERT INTO orders (id, seq, track_hash, customer_name, customer_phone, place, mode, subtotal, fee, total, status, payment, lang, demo, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'en', 1, ?, ?)`,
      id, seq, sha256(crypto.randomBytes(16).toString('hex')), name, phone, PLACES[Math.floor(r() * PLACES.length)], mode,
      subtotal, fee, subtotal + fee, status, payment, at, at);
    const steps = ['confirmed', 'packed', 'out', 'delivered'];
    const stepAt = (k) => Math.min(t - 60e3, at + k * 3 * 3600e3);
    const reached = status === 'cancelled' ? 1 : steps.indexOf(status) + 1;
    for (const x of lines) {
      db.run(`INSERT INTO order_items (order_id, product_id, seller_id, name_en, name_mr, unit_en, unit_mr, cat, price, qty, packed_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        id, x.p.id, x.p.seller_id, x.p.name_en, x.p.name_mr, x.p.unit_en, x.p.unit_mr, x.p.cat, x.p.price, x.q, reached >= 2 ? stepAt(1) : null);
    }
    for (let s = 0; s < reached; s++) db.run('INSERT INTO order_events (order_id, kind, value, at) VALUES (?, ?, ?, ?)', id, 'status', steps[s], stepAt(s));
    if (status === 'cancelled') db.run('INSERT INTO order_events (order_id, kind, value, at) VALUES (?, ?, ?, ?)', id, 'status', 'cancelled', Math.min(t - 60e3, at + 3600e3));
    if (payment !== 'pending') db.run('INSERT INTO order_events (order_id, kind, value, at) VALUES (?, ?, ?, ?)', id, 'payment', payment, Math.min(t - 60e3, at + 1800e3));
  }
}

module.exports = { open, getSettings, saveSettings, seedCatalog, seedOrders, setupIssues, DEFAULT_SETTINGS, PLACEHOLDER_WHATSAPP, DEMO_UPI, LEADS, DEFAULT_LEAD, newId, sha256, now };
