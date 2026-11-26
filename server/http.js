/* ------------------------------------------------------------------
   HTTP plumbing on node:http: a small router, JSON bodies and replies,
   cookies, errors, and static files with ETag + gzip.
------------------------------------------------------------------- */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

class HttpError extends Error {
  constructor(status, code, message, extra) {
    super(message || code);
    this.status = status; this.code = code; this.extra = extra;
  }
}
const fail = (status, code, message, extra) => { throw new HttpError(status, code, message, extra); };

/* ---------- router ---------- */
function createRouter() {
  const routes = [];
  const add = (method) => (pattern, handler, opts = {}) => {
    const keys = [];
    const re = new RegExp('^' + pattern.replace(/\/:([a-zA-Z]+)/g, (_, k) => { keys.push(k); return '/([^/]+)'; }) + '/?$');
    routes.push({ method, re, keys, handler, opts });
  };
  function match(method, pathname) {
    let otherMethod = false;
    for (const r of routes) {
      const m = r.re.exec(pathname);
      if (!m) continue;
      if (r.method !== method && !(method === 'HEAD' && r.method === 'GET')) { otherMethod = true; continue; }
      const params = {};
      try { r.keys.forEach((k, i) => { params[k] = decodeURIComponent(m[i + 1]); }); } catch (e) { fail(400, 'bad_path', 'Malformed URL'); }
      return { route: r, params };
    }
    return otherMethod ? { methodNotAllowed: true } : null;
  }
  return { get: add('GET'), post: add('POST'), put: add('PUT'), patch: add('PATCH'), del: add('DELETE'), match };
}

/* ---------- request helpers ---------- */
function readBody(req, limitBytes) {
  const declared = Number(req.headers['content-length'] || 0);
  if (declared > limitBytes) return Promise.reject(new HttpError(413, 'too_large', `Request body is larger than ${Math.round(limitBytes / 1024)} KB`));
  return new Promise((resolve, reject) => {
    const chunks = []; let size = 0, over = false;
    req.on('data', (c) => {
      size += c.length;
      if (size > limitBytes) { over = true; if (size > limitBytes * 4) req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => over ? reject(new HttpError(413, 'too_large', 'Request body is too large')) : resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}
async function readJson(req, limitBytes) {
  const type = String(req.headers['content-type'] || '');
  const buf = await readBody(req, limitBytes);
  if (!buf.length) return {};
  // JSON only: browsers cannot send this content type cross-site without a CORS preflight, which we never allow.
  if (!/^application\/json\b/i.test(type)) fail(415, 'json_only', 'Send the request body as application/json');
  try {
    const v = JSON.parse(buf.toString('utf8'));
    if (v === null || typeof v !== 'object' || Array.isArray(v)) fail(400, 'bad_json', 'The request body must be a JSON object');
    return v;
  } catch (e) {
    if (e instanceof HttpError) throw e;
    fail(400, 'bad_json', 'The request body is not valid JSON');
  }
}
function parseCookies(req) {
  const out = {};
  String(req.headers.cookie || '').split(';').forEach(part => {
    const i = part.indexOf('=');
    if (i < 0) return;
    const k = part.slice(0, i).trim(), v = part.slice(i + 1).trim();
    if (k && !(k in out)) { try { out[k] = decodeURIComponent(v); } catch (e) { out[k] = v; } }
  });
  return out;
}
function cookie(name, value, { maxAge, secure, httpOnly = true } = {}) {
  let c = `${name}=${encodeURIComponent(value)}; Path=/; SameSite=Lax`;
  if (httpOnly) c += '; HttpOnly';
  if (secure) c += '; Secure';
  if (maxAge !== undefined) c += `; Max-Age=${Math.floor(maxAge)}`;
  return c;
}

/* ---------- responses ---------- */
const BASE_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-Frame-Options': 'SAMEORIGIN'
};
function acceptsGzip(req) { return /\bgzip\b/.test(String(req.headers['accept-encoding'] || '')); }
function send(req, res, status, body, headers = {}) {
  const h = Object.assign({}, BASE_HEADERS, headers);
  let buf = Buffer.isBuffer(body) ? body : Buffer.from(String(body ?? ''), 'utf8');
  if (buf.length > 1400 && acceptsGzip(req) && /json|text|javascript|csv|svg/.test(h['Content-Type'] || '')) {
    buf = zlib.gzipSync(buf, { level: 6 });
    h['Content-Encoding'] = 'gzip'; h.Vary = 'Accept-Encoding';
  }
  h['Content-Length'] = buf.length;
  res.writeHead(status, h);
  res.end(req.method === 'HEAD' ? undefined : buf);
}
function sendJson(req, res, status, data, headers = {}) {
  send(req, res, status, JSON.stringify(data), Object.assign({ 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }, headers));
}
function sendError(req, res, err) {
  if (res.headersSent) { try { res.end(); } catch (e) { /* socket gone */ } return; }
  const status = err instanceof HttpError ? err.status : 500;
  const body = { error: { code: err instanceof HttpError ? err.code : 'server_error', message: err instanceof HttpError ? err.message : 'Something went wrong on the server' } };
  if (err && err.extra) Object.assign(body.error, err.extra);
  const headers = {};
  if (status === 429 && err.extra && err.extra.retryAfter) headers['Retry-After'] = String(err.extra.retryAfter);
  if (status === 413) headers.Connection = 'close';
  sendJson(req, res, status, body, headers);
}

/* ---------- static files ---------- */
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8', '.csv': 'text/csv; charset=utf-8'
};
const gzCache = new Map(); // file -> { mtime, buf }
function serveFile(req, res, baseDir, relPath, { immutable = false, headers = {} } = {}) {
  const base = path.resolve(baseDir);
  const file = path.resolve(base, '.' + path.sep + relPath);
  if (file !== base && !file.startsWith(base + path.sep)) return false;      // path traversal
  let st;
  try { st = fs.statSync(file); } catch (e) { return false; }
  if (!st.isFile()) return false;
  const type = MIME[path.extname(file).toLowerCase()] || 'application/octet-stream';
  const etag = `W/"${st.size.toString(16)}-${Math.floor(st.mtimeMs).toString(16)}"`;
  const h = Object.assign({}, BASE_HEADERS, headers, {
    'Content-Type': type, ETag: etag,
    'Cache-Control': immutable ? 'public, max-age=31536000, immutable' : 'no-cache'
  });
  if (req.headers['if-none-match'] === etag) { res.writeHead(304, h); res.end(); return true; }
  if (/^(text\/|application\/json|image\/svg)/.test(type) && st.size > 1400 && acceptsGzip(req)) {
    let c = gzCache.get(file);
    if (!c || c.mtime !== st.mtimeMs) { c = { mtime: st.mtimeMs, buf: zlib.gzipSync(fs.readFileSync(file), { level: 9 }) }; gzCache.set(file, c); }
    Object.assign(h, { 'Content-Encoding': 'gzip', Vary: 'Accept-Encoding', 'Content-Length': c.buf.length });
    res.writeHead(200, h);
    res.end(req.method === 'HEAD' ? undefined : c.buf);
    return true;
  }
  h['Content-Length'] = st.size;
  res.writeHead(200, h);
  if (req.method === 'HEAD') { res.end(); return true; }
  fs.createReadStream(file).on('error', () => res.destroy()).pipe(res);
  return true;
}

module.exports = { HttpError, fail, createRouter, readJson, parseCookies, cookie, send, sendJson, sendError, serveFile, BASE_HEADERS };
