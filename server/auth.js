/* ------------------------------------------------------------------
   Accounts: scrypt password hashing, cookie sessions, rate limits.
   Admin signs in with login "admin"; sellers with their 10-digit
   mobile number and a 4–6 digit PIN.
------------------------------------------------------------------- */
'use strict';
const crypto = require('node:crypto');
const { promisify } = require('node:util');
const { fail, parseCookies, cookie } = require('./http');
const { sha256, newId, now } = require('./db');

const scrypt = promisify(crypto.scrypt);
const SCRYPT = { N: 16384, r: 8, p: 1 };
const COOKIE = 'ssl_sid';

async function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = await scrypt(String(password), salt, 32, SCRYPT);
  return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${salt.toString('base64url')}$${hash.toString('base64url')}`;
}
async function verifyPassword(password, stored) {
  const [alg, N, r, p, salt, hash] = String(stored || '').split('$');
  if (alg !== 'scrypt' || !salt || !hash) return false;
  const want = Buffer.from(hash, 'base64url');
  const got = await scrypt(String(password), Buffer.from(salt, 'base64url'), want.length, { N: Number(N), r: Number(r), p: Number(p) });
  return crypto.timingSafeEqual(want, got);
}
// Same work for unknown logins as for known ones, so response time does not reveal which logins exist.
const DUMMY_HASH = 'scrypt$16384$8$1$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';

/* ---------- validation ---------- */
function normPhone(v) {
  let s = String(v || '').replace(/[\s\-()]/g, '');
  if (s.startsWith('+91')) s = s.slice(3); else if (/^91\d{10}$/.test(s)) s = s.slice(2); else if (/^0\d{10}$/.test(s)) s = s.slice(1);
  return /^[6-9]\d{9}$/.test(s) ? s : null;
}
const validPin = (v) => /^\d{4,6}$/.test(String(v || ''));
const validAdminPassword = (v) => typeof v === 'string' && v.length >= 8 && v.length <= 128;

/* ---------- sessions ---------- */
function createSession(db, userId, req, days) {
  const token = crypto.randomBytes(32).toString('base64url');
  const t = now();
  db.run('INSERT INTO sessions (token_hash, user_id, created_at, expires_at, agent) VALUES (?, ?, ?, ?, ?)',
    sha256(token), userId, t, t + days * 864e5, String(req.headers['user-agent'] || '').slice(0, 160));
  db.run('UPDATE users SET last_login = ? WHERE id = ?', t, userId);
  return token;
}
function tokenFrom(req) {
  const auth = String(req.headers.authorization || '');
  if (auth.startsWith('Bearer ')) return auth.slice(7).trim();
  return parseCookies(req)[COOKIE] || '';
}
function userFromRequest(db, req) {
  const token = tokenFrom(req);
  if (!token || token.length > 100) return null;
  const row = db.get(`SELECT u.id, u.role, u.login, u.name, u.seller_id, s.token_hash
                      FROM sessions s JOIN users u ON u.id = s.user_id
                      WHERE s.token_hash = ? AND s.expires_at > ? AND u.active = 1`, sha256(token), now());
  if (!row) return null;
  if (row.role === 'seller') {
    const seller = db.get('SELECT active FROM sellers WHERE id = ?', row.seller_id);
    if (!seller || !seller.active) return null;
  }
  return { id: row.id, role: row.role, login: row.login, name: row.name, sellerId: row.seller_id, tokenHash: row.token_hash };
}
const sessionCookie = (token, days, secure) => cookie(COOKIE, token, { maxAge: days * 86400, secure });
const clearCookie = (secure) => cookie(COOKIE, '', { maxAge: 0, secure });

function publicUser(db, u) {
  if (!u) return null;
  const out = { id: u.id, role: u.role, login: u.login, name: u.name };
  if (u.role === 'seller') {
    const s = db.get('SELECT id, name, name_mr, type, place, place_mr, verified, members FROM sellers WHERE id = ?', u.sellerId);
    if (s) out.seller = { id: s.id, name: s.name, nameMr: s.name_mr, type: s.type, place: s.place, placeMr: s.place_mr, verified: !!s.verified, members: s.members };
  }
  return out;
}

/* ---------- rate limits (in memory, per process) ---------- */
const buckets = new Map();
function limit(key, max, windowMs, message) {
  const t = now();
  let b = buckets.get(key);
  if (!b || b.reset <= t) { b = { n: 0, reset: t + windowMs }; buckets.set(key, b); }
  b.n++;
  if (b.n > max) fail(429, 'rate_limited', message || 'Too many requests. Please wait a moment and try again.', { retryAfter: Math.ceil((b.reset - t) / 1000) });
}
const resetLimit = (key) => buckets.delete(key);
setInterval(() => { const t = now(); for (const [k, b] of buckets) if (b.reset <= t) buckets.delete(k); }, 60e3).unref();

/* ---------- user creation ---------- */
async function createUser(db, { role, login, name, password, sellerId }) {
  const id = newId('u');
  db.run('INSERT INTO users (id, role, login, name, pass_hash, seller_id, active, created_at) VALUES (?, ?, ?, ?, ?, ?, 1, ?)',
    id, role, login, name, await hashPassword(password), sellerId || null, now());
  return id;
}
const randomPin = () => String(crypto.randomInt(0, 1e6)).padStart(6, '0');
const randomPassword = () => crypto.randomBytes(9).toString('base64url');

module.exports = {
  hashPassword, verifyPassword, DUMMY_HASH, normPhone, validPin, validAdminPassword,
  createSession, userFromRequest, sessionCookie, clearCookie, publicUser,
  limit, resetLimit, createUser, randomPin, randomPassword
};
