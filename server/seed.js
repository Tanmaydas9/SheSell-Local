/* ------------------------------------------------------------------
   First-run setup and "reset demo data": the 20-product catalogue,
   its 20 sellers, two demo seller logins, an admin account and two
   weeks of sample orders so the console has something to show.
------------------------------------------------------------------- */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { seedCatalog, seedOrders, saveSettings, DEFAULT_SETTINGS } = require('./db');
const { createUser, randomPassword, verifyPassword } = require('./auth');

const DEMO_SELLERS = [
  { login: '9800000001', sellerId: 's02', pin: '1234' },  // Annapurna Mahila Bachat Gat (SHG)
  { login: '9800000002', sellerId: 's01', pin: '1234' }   // Sunita Pawar (individual)
];

async function seedDemoSellers(db) {
  for (const d of DEMO_SELLERS) {
    const s = db.get('SELECT id, name FROM sellers WHERE id = ?', d.sellerId);
    if (!s || db.get('SELECT id FROM users WHERE login = ?', d.login)) continue;
    db.run('UPDATE sellers SET phone = ? WHERE id = ?', d.login, s.id);
    await createUser(db, { role: 'seller', login: d.login, name: s.name, password: d.pin, sellerId: s.id });
  }
}

/** Runs once, on an empty database. Returns the admin password if one was generated. */
async function firstRun(db, config) {
  if (db.get('SELECT id FROM users LIMIT 1')) return null;
  db.tx(() => {
    saveSettings(db, DEFAULT_SETTINGS);
    seedCatalog(db);
    if (config.seedDemo) seedOrders(db);
  });
  await seedDemoSellers(db);
  const generated = config.adminPassword ? null : randomPassword();
  await createUser(db, { role: 'admin', login: 'admin', name: 'Admin', password: config.adminPassword || generated });
  if (generated) {
    fs.mkdirSync(config.dataDir, { recursive: true });
    fs.writeFileSync(path.join(config.dataDir, 'ADMIN-LOGIN.txt'),
      `SheSell Local admin console\n\nURL:      http://localhost:${config.port}/admin\nLogin:    admin\nPassword: ${generated}\n\nChange it under Settings > Your password, then delete this file.\n`);
  }
  return generated;
}

/** Wipes shop data and reseeds the demo, keeping admin accounts and their sessions. */
async function resetDemo(db, config) {
  db.tx(() => {
    db.exec(`DELETE FROM order_events; DELETE FROM order_items; DELETE FROM orders; DELETE FROM events; DELETE FROM price_samples;
             DELETE FROM lessons_done; DELETE FROM sessions WHERE user_id IN (SELECT id FROM users WHERE role = 'seller');
             DELETE FROM users WHERE role = 'seller'; DELETE FROM products; DELETE FROM sellers; DELETE FROM settings;`);
    saveSettings(db, DEFAULT_SETTINGS);
    seedCatalog(db);
    if (config.seedDemo) seedOrders(db);
  });
  await seedDemoSellers(db);
  fs.rmSync(config.uploadsDir, { recursive: true, force: true });
}

/** For the console's sign-in page: the demo seller login while its demo PIN still works, and where the
    first admin password was saved. Null when DEMO_HINTS is off (it follows SEED_DEMO by default). */
let hintCache = { hash: null, ok: false };
async function demoHint(db, config) {
  if (!config.demoHints) return null;
  const d = DEMO_SELLERS[0];
  const u = db.get(`SELECT u.pass_hash, u.active, s.name, s.active AS s_active FROM users u JOIN sellers s ON s.id = u.seller_id WHERE u.login = ?`, d.login);
  let seller = null;
  if (u && u.active && u.s_active) {
    if (hintCache.hash !== u.pass_hash) hintCache = { hash: u.pass_hash, ok: await verifyPassword(d.pin, u.pass_hash) };
    if (hintCache.ok) seller = { login: d.login, pin: d.pin, name: u.name };
  }
  const file = path.join(config.dataDir, 'ADMIN-LOGIN.txt');
  const adminFile = fs.existsSync(file) ? path.relative(config.root, file) : null;
  return seller || adminFile ? { seller, adminFile } : null;
}

module.exports = { firstRun, resetDemo, demoHint, DEMO_SELLERS };
