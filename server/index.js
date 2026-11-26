/* ------------------------------------------------------------------
   SheSell Local server entry point.
     npm start                 run the shop + API + admin console
     npm run reset             restore the demo data (keeps admin login)
     npm run reset-admin       set a new admin password
------------------------------------------------------------------- */
'use strict';
try { require('node:sqlite'); } catch (e) {
  console.error(`\n  SheSell Local needs Node.js 22.13 or newer (it uses the built-in node:sqlite database).\n  You have Node ${process.version}. Install the LTS version from https://nodejs.org, then run npm start again.\n`);
  process.exit(1);
}

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const config = require('./config');
const { HttpError, sendError, serveFile, send, BASE_HEADERS } = require('./http');
const dbm = require('./db');
const auth = require('./auth');
const live = require('./events');
const { createServices } = require('./services');
const { createApi } = require('./api');
const { firstRun, resetDemo, DEMO_SELLERS } = require('./seed');

const PAGE_HEADERS = { 'Permissions-Policy': 'camera=(self), microphone=(), geolocation=()' };

function lanAddresses() {
  const out = [];
  for (const list of Object.values(os.networkInterfaces())) for (const a of list || []) if (a.family === 'IPv4' && !a.internal) out.push(a.address);
  return out;
}

async function main() {
  fs.mkdirSync(config.dataDir, { recursive: true });
  const db = dbm.open(config.dbFile);
  const generated = await firstRun(db, config);

  if (process.argv.includes('--reset')) {
    await resetDemo(db, config);
    console.log('  Demo data restored (admin login unchanged).');
    db.close(); return;
  }
  if (process.argv.includes('--reset-admin')) {
    const pw = config.adminPassword || auth.randomPassword();
    db.run("UPDATE users SET pass_hash = ?, active = 1 WHERE login = 'admin'", await auth.hashPassword(pw));
    db.run("DELETE FROM sessions WHERE user_id IN (SELECT id FROM users WHERE login = 'admin')");
    fs.writeFileSync(path.join(config.dataDir, 'ADMIN-LOGIN.txt'), `SheSell Local admin console\n\nLogin:    admin\nPassword: ${pw}\n`);
    console.log(`  New admin password: ${pw}\n  (also saved in ${path.relative(config.root, path.join(config.dataDir, 'ADMIN-LOGIN.txt'))})`);
    db.close(); return;
  }

  const svc = createServices(db, config);
  const api = createApi(db, svc, config);
  const sweep = () => db.run('DELETE FROM sessions WHERE expires_at < ?', Date.now());
  sweep(); setInterval(sweep, 3600e3).unref();

  function page(req, res, file) {
    if (!serveFile(req, res, config.publicDir, file, { headers: PAGE_HEADERS })) {
      send(req, res, 500, `public/${file} is missing. Run "npm run build".`, { 'Content-Type': 'text/plain; charset=utf-8' });
    }
  }
  function pages(req, res, url) {
    if (req.method !== 'GET' && req.method !== 'HEAD') throw new HttpError(405, 'method_not_allowed', 'Method not allowed');
    let p;
    try { p = decodeURIComponent(url.pathname); } catch (e) { throw new HttpError(400, 'bad_path', 'Malformed URL'); }
    if (p === '/' || p === '/index.html') return page(req, res, 'index.html');
    if (p === '/admin' || p === '/admin/' || p === '/admin.html') return page(req, res, 'admin.html');
    if (p === '/favicon.ico') { res.writeHead(204, BASE_HEADERS); return res.end(); }
    if (p.startsWith('/uploads/') && serveFile(req, res, config.uploadsDir, p.slice('/uploads/'.length), { immutable: true })) return;
    if (!p.startsWith('/uploads/') && serveFile(req, res, config.publicDir, p)) return;
    send(req, res, 404, `<!doctype html><meta charset="utf-8"><title>Not found · SheSell Local</title><body style="font-family:system-ui;padding:40px;color:#1B434D"><h1>Page not found</h1><p><a href="/">Go to the shop</a> · <a href="/admin">Admin console</a></p>`,
      Object.assign({ 'Content-Type': 'text/html; charset=utf-8' }, PAGE_HEADERS));
  }

  const server = http.createServer(async (req, res) => {
    const t0 = Date.now();
    let url;
    try { url = new URL(req.url, 'http://localhost'); } catch (e) { res.writeHead(400); res.end(); return; }
    const isApi = url.pathname.startsWith('/api/');
    if (config.log && url.pathname !== '/api/stream') {
      res.on('finish', () => {
        const quiet = req.method === 'GET' && isApi && res.statusCode < 400 || url.pathname === '/api/events' && res.statusCode < 400 || url.pathname.startsWith('/uploads/');
        if (!quiet) console.log(`  ${new Date().toTimeString().slice(0, 8)} ${req.method} ${url.pathname} ${res.statusCode} ${Date.now() - t0}ms`);
      });
    }
    try {
      if (isApi) await api(req, res, url);
      else pages(req, res, url);
    } catch (e) {
      if (!(e instanceof HttpError)) console.error(e);
      sendError(req, res, e);
    }
  });
  server.keepAliveTimeout = 65e3;
  server.headersTimeout = 70e3;
  server.requestTimeout = 120e3;

  server.on('error', (e) => {
    if (e.code === 'EADDRINUSE') console.error(`\n  Port ${config.port} is already in use. Close the other program, or start with another port (for example PORT=3001 in a .env file).\n`);
    else console.error(e);
    process.exit(1);
  });

  server.listen(config.port, config.host, () => {
    const lan = lanAddresses();
    const lines = [
      '',
      '  SheSell Local is running',
      `  Storefront:     http://localhost:${config.port}`,
      `  Admin console:  http://localhost:${config.port}/admin`
    ];
    if (config.host === '0.0.0.0' && lan.length) lines.push(`  On your phone:  http://${lan[0]}:${config.port}   (same Wi-Fi)`);
    lines.push(`  Database:       ${path.relative(config.root, config.dbFile) || config.dbFile}`);
    if (generated) lines.push('', `  First run: admin login is  admin / ${generated}`, `  (also saved in ${path.relative(config.root, path.join(config.dataDir, 'ADMIN-LOGIN.txt'))}; change it in the console)`);
    if (config.demoHints && db.get("SELECT 1 FROM users WHERE login = ?", DEMO_SELLERS[0].login)) lines.push('', `  Demo seller logins: ${DEMO_SELLERS.map(d => d.login + ' / PIN ' + d.pin).join('  ·  ')}`);
    const todo = dbm.setupIssues(dbm.getSettings(db));
    if (todo.length) lines.push('', `  Before going live: set the official ${todo.map(k => (k === 'whatsapp' ? 'WhatsApp Business number' : 'UPI ID')).join(' and ')} in Console > Settings.`);
    lines.push('', '  Press Ctrl+C to stop.', '');
    console.log(lines.join('\n'));
  });

  const stop = () => {
    console.log('\n  Stopping…');
    live.closeAll();
    server.close(() => { try { db.close(); } catch (e) { /* already closed */ } process.exit(0); });
    setTimeout(() => process.exit(0), 3000).unref();
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
}

main().catch((e) => { console.error(e); process.exit(1); });
