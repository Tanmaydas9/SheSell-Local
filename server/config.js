/* ------------------------------------------------------------------
   Configuration from environment variables (and an optional .env file).
   Every value has a safe default, so `npm start` works out of the box.
------------------------------------------------------------------- */
'use strict';
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');

// Minimal .env loader (KEY=value per line, # for comments). Real environment variables win.
(function loadDotEnv() {
  const file = path.join(root, '.env');
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!m || line.trim().startsWith('#') || m[1] in process.env) continue;
    let v = m[2];
    if (/^(["']).*\1$/.test(v)) v = v.slice(1, -1);
    process.env[m[1]] = v;
  }
})();

const env = process.env;
const num = (v, d) => (v === undefined || v === '' || Number.isNaN(Number(v)) ? d : Number(v));
const bool = (v, d) => (v === undefined || v === '' ? d : /^(1|true|yes|on)$/i.test(v));

const dataDir = path.resolve(root, env.DATA_DIR || 'data');

module.exports = {
  root,
  port: num(env.PORT, 3000),
  host: env.HOST || '0.0.0.0',
  dataDir,
  dbFile: path.join(dataDir, 'shesell.db'),
  uploadsDir: path.join(dataDir, 'uploads'),
  publicDir: path.join(root, 'public'),
  adminPassword: env.ADMIN_PASSWORD || '',
  sessionDays: num(env.SESSION_DAYS, 14),
  trustProxy: bool(env.TRUST_PROXY, false),
  seedDemo: bool(env.SEED_DEMO, true),
  demoHints: bool(env.DEMO_HINTS, bool(env.SEED_DEMO, true)),   // show the demo logins on the console sign-in page
  maxUploadMB: num(env.MAX_UPLOAD_MB, 3),
  orderLimit: num(env.ORDER_LIMIT, 40),      // orders per network address per 10 minutes
  loginLimit: num(env.LOGIN_LIMIT, 30),      // sign-in attempts per network address per 10 minutes (8 per account always)
  log: bool(env.LOG, true),
  version: require(path.join(root, 'package.json')).version
};
