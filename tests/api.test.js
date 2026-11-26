/* ------------------------------------------------------------------
   API tests: start a real server on a free port with a throwaway
   database, then exercise it over HTTP.   Run: npm test
------------------------------------------------------------------- */
'use strict';
const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const net = require('node:net');

const ROOT = path.resolve(__dirname, '..');
const ADMIN_PW = 'test-admin-pass';
let base, proc, dataDir;

const freePort = () => new Promise((res) => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
async function req(method, p, body, cookie) {
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (cookie) headers.Cookie = cookie;
  const r = await fetch(base + p, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await r.text();
  let json = null; try { json = JSON.parse(text); } catch (e) { /* not JSON */ }
  return { status: r.status, body: json, text, headers: r.headers };
}
async function login(loginName, password) {
  const r = await req('POST', '/api/auth/login', { login: loginName, password });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  return r.headers.get('set-cookie').split(';')[0];
}
const order = (items, extra = {}) => req('POST', '/api/orders', Object.assign({ customer: { name: 'Test Buyer', phone: '98765 43210', place: 'Kothrud, Pune' }, mode: 'delivery', items }, extra));
// smallest valid JPEG
const JPEG = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=';

function sse(p, cookie) {
  const events = [];
  const ctl = new AbortController();
  const ready = fetch(base + p, { headers: cookie ? { Cookie: cookie } : {}, signal: ctl.signal }).then(async (r) => {
    const reader = r.body.getReader(), dec = new TextDecoder();
    let buf = '';
    (async () => {
      try {
        for (;;) {
          const { value, done } = await reader.read(); if (done) break;
          buf += dec.decode(value);
          let i; while ((i = buf.indexOf('\n\n')) >= 0) {
            const chunk = buf.slice(0, i); buf = buf.slice(i + 2);
            const type = /event: (\w+)/.exec(chunk), data = /data: (.*)/.exec(chunk);
            if (type) events.push({ type: type[1], data: data ? JSON.parse(data[1]) : null });
          }
        }
      } catch (e) { /* aborted */ }
    })();
  });
  return { events, ready, close: () => ctl.abort() };
}
const until = async (fn, ms = 3000) => { const t = Date.now(); while (Date.now() - t < ms) { if (fn()) return true; await new Promise(r => setTimeout(r, 50)); } return false; };

before(async () => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'shesell-test-'));
  const port = await freePort();
  base = `http://127.0.0.1:${port}`;
  proc = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', 'server/index.js'], {
    cwd: ROOT, env: Object.assign({}, process.env, { PORT: String(port), HOST: '127.0.0.1', DATA_DIR: dataDir, ADMIN_PASSWORD: ADMIN_PW, LOG: '0', ORDER_LIMIT: '500', LOGIN_LIMIT: '500' }), stdio: ['ignore', 'pipe', 'pipe']
  });
  let out = '';
  proc.stdout.on('data', d => { out += d; }); proc.stderr.on('data', d => { out += d; });
  const ok = await until(() => out.includes('is running'), 15000);
  assert.ok(ok, 'server did not start:\n' + out);
});
after(() => { proc.kill('SIGKILL'); fs.rmSync(dataDir, { recursive: true, force: true }); });

describe('public API and pages', () => {
  test('health and bootstrap', async () => {
    const h = await req('GET', '/api/health');
    assert.equal(h.status, 200); assert.equal(h.body.app, 'shesell-local');
    const b = await req('GET', '/api/bootstrap');
    assert.equal(b.body.products.length, 20);
    assert.equal(b.body.me, null);
    assert.equal(b.body.settings.upiId, 'shesell.demo@upi');
    // never an empty number (that would open WhatsApp's contact picker): the placeholder until the admin sets one
    assert.equal(b.body.settings.whatsappNumber, '910000000000');
    assert.deepEqual(b.body.settings.setupIssues, ['whatsapp', 'upi']);
    assert.ok(b.body.ml.baskets.length > 20, 'demo orders become recommender baskets');
    assert.equal(b.body.ml.price, undefined, 'sales training data is only for signed-in sellers');
    assert.deepEqual(Object.keys(b.body.stats).sort(), ['products', 'sellers', 'shg'], 'no order or revenue counts for the public');
    const p = b.body.products.find(x => x.id === 'p01');
    assert.deepEqual(p.name, { en: 'Bhajani Chakli', mr: 'भाजणीची चकली' });
    assert.equal(p.type, 'individual');
    assert.equal(p.lead, 'fresh_today');
    assert.deepEqual(b.body.products.find(x => x.id === 'p04').leadText, { en: 'Made fresh to order · next morning', mr: 'ऑर्डरनुसार ताजी · दुसऱ्या दिवशी सकाळी' });
    // the pilot area: every demo seller is in Pune district or a neighbouring district
    const districts = new Set(b.body.sellers.map(s => s.place.en.split(', ').pop()));
    assert.deepEqual([...districts].filter(d => !['Pune', 'Satara', 'Solapur', 'Ahilyanagar', 'Raigad', 'Thane'].includes(d)), []);
  });
  test('pages, static safety and errors', async () => {
    const shop = await fetch(base + '/', { headers: { 'Accept-Encoding': 'gzip' } });
    assert.equal(shop.status, 200); assert.equal(shop.headers.get('content-encoding'), 'gzip');
    assert.equal(shop.headers.get('x-content-type-options'), 'nosniff');
    assert.equal((await fetch(base + '/admin')).status, 200);
    assert.equal((await fetch(base + '/uploads/..%2fshesell.db')).status, 404);
    assert.equal((await fetch(base + '/..%2f..%2fpackage.json')).status, 404);
    const r = await req('GET', '/api/nope'); assert.equal(r.status, 404); assert.equal(r.body.error.code, 'not_found');
    assert.equal((await req('DELETE', '/api/products')).status, 405);
    const bad = await fetch(base + '/api/orders', { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: '{}' });
    assert.equal(bad.status, 415);
  });
});

describe('orders', () => {
  test('server decides prices, fees and stock', async () => {
    const before1 = (await req('GET', '/api/products/p01')).body.product.stock;
    const r = await order([{ id: 'p01', q: 2, price: 1 }, { id: 'p16', q: 1 }]);
    assert.equal(r.status, 200, JSON.stringify(r.body));
    const o = r.body.order;
    assert.match(o.id, /^SSL-\d+$/);
    assert.equal(o.subtotal, 2 * 120 + 60);              // the client's "price: 1" is ignored
    assert.equal(o.fee, 20); assert.equal(o.total, 320);
    assert.ok(o.token && o.token.length > 20);
    assert.equal((await req('GET', '/api/products/p01')).body.product.stock, before1 - 2);
    const big = await order([{ id: 'p12', q: 1 }], { mode: 'pickup' });
    assert.equal(big.body.order.fee, 0);
    const free = await order([{ id: 'p09', q: 1 }]);       // ₹900 > free-delivery threshold
    assert.equal(free.body.order.fee, 0);
  });
  test('validation', async () => {
    assert.equal((await order([{ id: 'p01', q: 1 }], { customer: { name: 'A B', phone: '12345', place: 'Pune' } })).body.error.code, 'bad_phone');
    assert.equal((await order([{ id: 'p01', q: 0 }])).status, 400);
    assert.equal((await order([{ id: 'p01', q: 21 }])).status, 400);
    assert.equal((await order([])).body.error.code, 'empty_order');
    assert.equal((await order([{ id: 'nope', q: 1 }])).body.error.code, 'unavailable');
    const r = await order([{ id: 'p13', q: 20 }]);
    assert.equal(r.status, 200);
    const r2 = await order([{ id: 'p13', q: 20 }, { id: 'p13', q: 20 }]);   // 40 merged > 20 per product
    assert.equal(r2.status, 400);
  });
  test('out of stock', async () => {
    const admin = await login('admin', ADMIN_PW);
    await req('PATCH', '/api/my/products/p05', { stock: 1 }, admin);
    const r = await order([{ id: 'p05', q: 2 }]);
    assert.equal(r.status, 409); assert.equal(r.body.error.code, 'out_of_stock'); assert.equal(r.body.error.available, 1);
  });
  test('tracking needs the private token; customer can claim payment', async () => {
    const o = (await order([{ id: 'p17', q: 1 }])).body.order;
    assert.equal((await req('GET', `/api/orders/${o.id}?t=${o.token}`)).body.order.status, 'confirmed');
    assert.equal((await req('GET', `/api/orders/${o.id}?t=wrong`)).status, 404);
    const tr = await req('POST', '/api/orders/track', { orders: [{ id: o.id, token: o.token }, { id: o.id, token: 'x' }] });
    assert.equal(tr.body.orders.length, 1);
    assert.equal(tr.body.orders[0].customer, undefined, 'customer view hides contact details');
    const c = await req('POST', `/api/orders/${o.id}/claim`, { token: o.token });
    assert.equal(c.body.order.payment, 'claimed');
    assert.equal(c.body.order.verification, 'pending');
  });
});

describe('accounts and permissions', () => {
  test('admin login, wrong password, logout', async () => {
    assert.equal((await req('POST', '/api/auth/login', { login: 'admin', password: 'wrong' })).status, 401);
    const c = await login('ADMIN', ADMIN_PW);
    assert.equal((await req('GET', '/api/auth/me', undefined, c)).body.user.role, 'admin');
    await req('POST', '/api/auth/logout', {}, c);
    assert.equal((await req('GET', '/api/auth/me', undefined, c)).body.user, null);
  });
  test('brute force is rate limited per account', async () => {
    let last;
    for (let i = 0; i < 9; i++) last = await req('POST', '/api/auth/login', { login: '9800000002', password: '0000' });
    assert.equal(last.status, 429);
    assert.ok(last.headers.get('retry-after'));
  });
  test('seller sees only her orders and products', async () => {
    const s = await login('+91 98000 00001', '1234');                 // Annapurna SHG, product p02
    const shared = (await order([{ id: 'p02', q: 1 }, { id: 'p18', q: 1 }])).body.order;
    const solo = (await order([{ id: 'p02', q: 1 }])).body.order;
    const mine = (await req('GET', '/api/my/orders?status=active', undefined, s)).body.orders;
    assert.ok(mine.every(o => o.items.some(i => i.mine)));
    assert.ok(mine.some(o => o.id === shared.id));
    const prods = (await req('GET', '/api/my/products', undefined, s)).body.products;
    assert.deepEqual(prods.map(p => p.id), ['p02']);
    // shared order: only her items can be packed by her
    assert.equal((await req('POST', `/api/my/orders/${shared.id}/status`, { status: 'out' }, s)).status, 403);
    const packed = (await req('POST', `/api/my/orders/${shared.id}/pack`, {}, s)).body.order;
    assert.equal(packed.status, 'confirmed');
    assert.ok(packed.items.find(i => i.id === 'p02').packed);
    assert.ok(!packed.items.find(i => i.id === 'p18').packed);
    // her own order: full control
    assert.equal((await req('POST', `/api/my/orders/${solo.id}/status`, { status: 'packed' }, s)).body.order.status, 'packed');
    // not her product, not admin
    assert.equal((await req('PATCH', '/api/my/products/p01', { price: 1 }, s)).status, 403);
    assert.equal((await req('GET', '/api/admin/settings', undefined, s)).status, 403);
    assert.equal((await req('POST', `/api/admin/orders/${solo.id}/payment`, { payment: 'paid' }, s)).status, 403);
    assert.equal((await req('GET', '/api/my/orders')).status, 401);
  });
  test('registration and review of new sellers', async () => {
    assert.equal((await req('POST', '/api/auth/register', { name: 'Kalpana', phone: '12', pin: '1234', place: 'Wai' })).body.error.code, 'bad_phone');
    assert.equal((await req('POST', '/api/auth/register', { name: 'Kalpana', phone: '9876512345', pin: '12', place: 'Wai' })).body.error.code, 'bad_pin');
    assert.equal((await req('POST', '/api/auth/register', { name: 'Kalpana', phone: '9800000001', pin: '1234', place: 'Wai' })).status, 409);
    const r = await req('POST', '/api/auth/register', { name: 'Kalpana More', phone: '9876512345', pin: '2468', place: 'Wai, Satara', type: 'shg', members: 12 });
    assert.equal(r.status, 200);
    assert.equal(r.body.user.seller.verified, false);
    const c = r.headers.get('set-cookie').split(';')[0];
    const p = (await req('POST', '/api/my/products', { name: 'Kokum Syrup', cat: 'food', price: 150, stock: 10 }, c)).body.product;
    assert.equal(p.status, 'pending');
    assert.equal((await req('PATCH', `/api/my/products/${p.id}`, { status: 'active' }, c)).status, 403);
    assert.equal((await req('GET', `/api/products/${p.id}`)).status, 404);
    // verifying the seller publishes her waiting listings
    const admin = await login('admin', ADMIN_PW);
    const sellerId = r.body.user.seller.id;
    await req('PATCH', `/api/admin/sellers/${sellerId}`, { verified: true }, admin);
    assert.equal((await req('GET', `/api/products/${p.id}`)).status, 200);
    // pausing her hides the shop and signs her out
    await req('PATCH', `/api/admin/sellers/${sellerId}`, { active: false }, admin);
    assert.equal((await req('GET', `/api/products/${p.id}`)).status, 404);
    assert.equal((await req('GET', '/api/my/products', undefined, c)).status, 401);
  });
  test('admin creates a seller login and the PIN works once shown', async () => {
    const admin = await login('admin', ADMIN_PW);
    const r = await req('POST', '/api/admin/sellers/s03/login', { phone: '9876500003' }, admin);
    assert.match(r.body.pin, /^\d{6}$/);
    await login('9876500003', r.body.pin);
  });
});

describe('order status flow', () => {
  test('forward only, cancel restores stock, delivered is final', async () => {
    const admin = await login('admin', ADMIN_PW);
    const stock0 = (await req('GET', '/api/products/p19')).body.product.stock;
    const o = (await order([{ id: 'p19', q: 3 }])).body.order;
    assert.equal((await req('GET', '/api/products/p19')).body.product.stock, stock0 - 3);
    assert.equal((await req('POST', `/api/my/orders/${o.id}/status`, { status: 'out' }, admin)).body.order.status, 'out');
    assert.equal((await req('POST', `/api/my/orders/${o.id}/status`, { status: 'packed' }, admin)).body.error.code, 'backwards');
    assert.equal((await req('POST', `/api/my/orders/${o.id}/status`, { status: 'cancelled' }, admin)).body.order.status, 'cancelled');
    assert.equal((await req('GET', '/api/products/p19')).body.product.stock, stock0);
    assert.equal((await req('POST', `/api/my/orders/${o.id}/status`, { status: 'delivered' }, admin)).body.error.code, 'order_closed');
    const o2 = (await order([{ id: 'p19', q: 1 }])).body.order;
    const paid = await req('POST', `/api/admin/orders/${o2.id}/payment`, { payment: 'paid', ref: 'UTR123' }, admin);
    assert.equal(paid.body.order.payment, 'paid'); assert.equal(paid.body.order.paymentRef, 'UTR123');
    const ev = (await req('GET', `/api/my/orders/${o2.id}`, undefined, admin)).body.order.events.map(e => e.kind + ':' + e.value);
    assert.deepEqual(ev, ['status:confirmed', 'payment:paid']);
  });
});

describe('listings from the AI Catalogue', () => {
  test('only signed-in sellers and the admin can list; a seller always lists under her own shop', async () => {
    const guest = await req('POST', '/api/listings', { name: 'Pot', cat: 'craft', price: 300, seller: { name: 'Vithai Gat', place: 'Pandharpur' }, photo: JPEG });
    assert.equal(guest.status, 401); assert.equal(guest.body.error.code, 'signin_required');
    const s = await login('9800000001', '1234');                    // Annapurna Mahila Bachat Gat, verified, s02
    const bad = await req('POST', '/api/listings', { name: 'Pot', cat: 'craft', price: 300, photo: 'data:image/jpeg;base64,AAAA' }, s);
    assert.equal(bad.body.error.code, 'bad_photo');
    const r = await req('POST', '/api/listings', {
      name: 'Warli pot', nameMr: 'वारली मडके', cat: 'craft', price: 350, sellerId: 's05', seller: { name: 'Someone Else', place: 'Elsewhere' },
      lead: 'custom', leadText: 'Fired every Sunday', leadTextMr: 'दर रविवारी भाजतो',
      photo: JPEG, ai: { top: [{ className: 'vase', probability: 0.97 }], readiness: 94, model: 'MobileNet v2' }
    }, s);
    assert.equal(r.status, 200, JSON.stringify(r.body)); assert.equal(r.body.status, 'active', 'verified seller goes live');
    assert.equal(r.body.product.sellerId, 's02', 'bound to the signed-in seller, not the one in the request');
    const id = r.body.product.id;
    const pub = (await req('GET', `/api/products/${id}`)).body.product;
    assert.equal(pub.name.mr, 'वारली मडके'); assert.equal(pub.seller.en, 'Annapurna Mahila Bachat Gat');
    assert.deepEqual(pub.leadText, { en: 'Fired every Sunday', mr: 'दर रविवारी भाजतो' });
    const img = await fetch(base + r.body.product.image);
    assert.equal(img.status, 200); assert.equal(img.headers.get('content-type'), 'image/jpeg');
    assert.match(img.headers.get('cache-control'), /immutable/);
    const admin = await login('admin', ADMIN_PW);
    const staff = (await req('GET', '/api/my/products', undefined, admin)).body.products.find(p => p.id === id);
    assert.equal(staff.ai.readiness, 94);
    // custom availability needs words; unknown options are refused
    assert.equal((await req('PATCH', `/api/my/products/${id}`, { leadText: '' }, s)).body.error.code, 'lead_text_required');
    assert.equal((await req('PATCH', `/api/my/products/${id}`, { lead: '10-minute delivery' }, s)).body.error.code, 'invalid_lead');
    assert.equal((await req('PATCH', `/api/my/products/${id}`, { lead: 'made_to_order' }, s)).body.product.lead, 'made_to_order');
    // the admin lists for a seller she chooses
    assert.equal((await req('POST', '/api/listings', { name: 'Basket', cat: 'craft', price: 200 }, admin)).body.error.code, 'seller_required');
    const a = await req('POST', '/api/listings', { name: 'Basket', cat: 'craft', price: 200, sellerId: 's14' }, admin);
    assert.equal(a.body.product.sellerId, 's14'); assert.equal(a.body.product.lead, 'made_to_order', 'category default');
  });
  test('an unverified seller\'s listing waits for the admin\'s approval', async () => {
    const r = await req('POST', '/api/auth/register', { name: 'Vaishali Gat', phone: '9876512399', pin: '1357', place: 'Bhor, Pune', type: 'shg' });
    const c = r.headers.get('set-cookie').split(';')[0];
    const p = (await req('POST', '/api/listings', { name: 'Kurdai', cat: 'food', price: 120, photo: JPEG }, c)).body.product;
    assert.equal(p.status, 'pending');
    assert.equal((await req('GET', `/api/products/${p.id}`)).status, 404);
    assert.equal((await req('PATCH', `/api/my/products/${p.id}`, { status: 'active' }, c)).body.error.code, 'needs_review');
    const admin = await login('admin', ADMIN_PW);
    await req('PATCH', `/api/my/products/${p.id}`, { status: 'active' }, admin);
    assert.equal((await req('GET', `/api/products/${p.id}`)).status, 200);
  });
});

describe('role boundaries', () => {
  const ADMIN_ROUTES = [
    ['GET', '/api/admin/settings'], ['PUT', '/api/admin/settings', { deliveryFee: 0 }], ['GET', '/api/admin/sellers'], ['POST', '/api/admin/sellers', { name: 'X Gat' }],
    ['PATCH', '/api/admin/sellers/s01', { verified: false }], ['POST', '/api/admin/sellers/s01/login', {}], ['POST', '/api/admin/orders/SSL-1001/payment', { payment: 'paid' }],
    ['GET', '/api/admin/training'], ['POST', '/api/admin/training/import', { csv: 'a,b' }], ['POST', '/api/admin/training/rows', {}], ['DELETE', '/api/admin/training/rows'],
    ['GET', '/api/admin/audit'], ['GET', '/api/admin/export/orders.csv'], ['GET', '/api/admin/backup'], ['POST', '/api/admin/orders/clear-demo', {}],
    ['POST', '/api/admin/reset', { confirm: 'RESET' }], ['GET', '/api/stats']
  ];
  test('a seller session gets 403 on every admin-only endpoint', async () => {
    const s = await login('9800000001', '1234');
    for (const [m, p, body] of ADMIN_ROUTES) {
      const r = await req(m, p, body, s);
      assert.equal(r.status, 403, `${m} ${p} → ${r.status}`);
      assert.equal(r.body.error.code, 'admin_only');
    }
  });
  test('no session gets 401 on admin, seller-workspace and listing endpoints', async () => {
    const more = [['GET', '/api/ml/training-data'], ['POST', '/api/listings', { name: 'Pot', cat: 'craft', price: 1 }], ['GET', '/api/my/overview'], ['GET', '/api/my/products'], ['POST', '/api/my/lessons/upi', {}]];
    for (const [m, p, body] of ADMIN_ROUTES.concat(more)) {
      const r = await req(m, p, body);
      assert.equal(r.status, 401, `${m} ${p} → ${r.status}`);
    }
  });
  test('sellers can use the workspace data they need', async () => {
    const s = await login('9800000001', '1234');
    const d = await req('GET', '/api/ml/training-data', undefined, s);
    assert.equal(d.status, 200); assert.equal(d.body.synthetic.n, 240);
    assert.equal((await req('GET', '/api/settings')).body.settings.whatsappNumber, '910000000000');
    assert.deepEqual((await req('GET', '/api/my/overview', undefined, s)).body.setup, [], 'setup warnings are for the admin');
  });
});

describe('UPI payment verification', () => {
  test('a buyer\'s claim stays pending until the admin confirms it in the bank app', async () => {
    const o = (await order([{ id: 'p13', q: 1 }])).body.order;
    assert.equal(o.payment, 'pending'); assert.equal(o.verification, null);
    const c = (await req('POST', `/api/orders/${o.id}/claim`, { token: o.token, ref: '4321 0987 6543', payment: 'paid' })).body.order;
    assert.equal(c.payment, 'claimed', 'a claim never marks the order paid');
    assert.equal(c.verification, 'pending');
    assert.equal((await req('GET', `/api/orders/${o.id}?t=${o.token}`)).body.order.verification, 'pending');
    const admin = await login('admin', ADMIN_PW);
    const queue = (await req('GET', '/api/my/orders?status=claimed', undefined, admin)).body.orders;
    const mine = queue.find(x => x.id === o.id);
    assert.ok(mine, 'listed for verification'); assert.equal(mine.paymentRef, '4321 0987 6543');
    const seller = await login('9800000001', '1234');
    assert.equal((await req('POST', `/api/admin/orders/${o.id}/payment`, { payment: 'paid' }, seller)).status, 403);
    assert.equal((await req('POST', `/api/admin/orders/${o.id}/payment`, { payment: 'claimed' }, admin)).body.error.code, 'invalid_payment');
    const paid = (await req('POST', `/api/admin/orders/${o.id}/payment`, { payment: 'paid' }, admin)).body.order;
    assert.equal(paid.payment, 'paid'); assert.equal(paid.verification, 'verified');
    const again = (await req('POST', `/api/orders/${o.id}/claim`, { token: o.token })).body.order;
    assert.equal(again.payment, 'paid', 'claiming again cannot undo a verified payment');
    const ev = (await req('GET', `/api/my/orders/${o.id}`, undefined, admin)).body.order.events.filter(e => e.kind === 'payment').map(e => e.value);
    assert.deepEqual(ev, ['claimed', 'paid']);
  });
});

describe('admin tools', () => {
  test('settings are validated and reach the storefront', async () => {
    const admin = await login('admin', ADMIN_PW);
    assert.equal((await req('PUT', '/api/admin/settings', { upiId: 'not a upi' }, admin)).body.error.code, 'invalid_upi');
    assert.equal((await req('PUT', '/api/admin/settings', { whatsappNumber: '' }, admin)).body.error.code, 'whatsapp_required');
    assert.equal((await req('PUT', '/api/admin/settings', { whatsappNumber: '910000000000' }, admin)).body.error.code, 'invalid_whatsapp');
    assert.deepEqual((await req('GET', '/api/admin/settings', undefined, admin)).body.setupIssues, ['whatsapp', 'upi']);
    const s = (await req('PUT', '/api/admin/settings', { upiId: 'annapurna.shg@okaxis', whatsappNumber: '98765 43210', deliveryFee: 25, announcement: { en: 'Diwali orders close Friday', mr: 'दिवाळी' } }, admin)).body.settings;
    assert.equal(s.whatsappNumber, '919876543210');
    assert.deepEqual((await req('GET', '/api/admin/settings', undefined, admin)).body.setupIssues, []);
    const b = (await req('GET', '/api/bootstrap')).body.settings;
    assert.equal(b.upiId, 'annapurna.shg@okaxis'); assert.equal(b.deliveryFee, 25); assert.equal(b.announcement.en, 'Diwali orders close Friday');
    assert.equal(b.whatsappNumber, '919876543210'); assert.deepEqual(b.setupIssues, []);
    await req('PUT', '/api/admin/settings', { storeOpen: false }, admin);
    assert.equal((await order([{ id: 'p20', q: 1 }])).body.error.code, 'store_closed');
    await req('PUT', '/api/admin/settings', { storeOpen: true, deliveryFee: 20 }, admin);
  });
  test('training data: CSV import, synthetic settings, export', async () => {
    const admin = await login('admin', ADMIN_PW);
    const csv = 'id,month,district,seller_type,category,item,material_cost_inr,labour_hours,packaging_tier,seasonal_demand,price_inr,weekly_orders\n' +
      'R1,Oct,Pune,SHG,food,Chakli,90,1.5,standard,0.85,240,31\nR2,Nov,Satara,Individual,tailoring,"Blouse, silk",120,3,basic,60,450,6\nR3,Dec,Pune,SHG,toys,Robot,1,1,basic,0.5,10,1\n';
    const r = (await req('POST', '/api/admin/training/import', { csv }, admin)).body;
    assert.equal(r.added, 2); assert.equal(r.skipped.length, 1); assert.equal(r.skipped[0].row, 4);
    assert.equal(r.skipped[0].field, 'cat');
    const d = (await req('GET', '/api/ml/training-data', undefined, admin)).body;
    assert.equal(d.real.length, 2);
    assert.equal(d.real[1].item, 'Blouse, silk'); assert.equal(d.real[1].season, 0.6);
    await req('PUT', '/api/admin/settings', { synthetic: { enabled: false, n: 100, seed: 7 } }, admin);
    assert.deepEqual((await req('GET', '/api/ml/training-data', undefined, admin)).body.synthetic, { enabled: false, n: 100, seed: 7 });
    const ex = await fetch(base + '/api/admin/export/training.csv', { headers: { Cookie: admin } });
    assert.match(ex.headers.get('content-type'), /text\/csv/);
    assert.match(await ex.text(), /Blouse, silk/);
  });
  test('backup, exports and audit log', async () => {
    const admin = await login('admin', ADMIN_PW);
    const b = await fetch(base + '/api/admin/backup', { headers: { Cookie: admin } });
    assert.equal(Buffer.from(await b.arrayBuffer()).slice(0, 15).toString(), 'SQLite format 3');
    const o = await fetch(base + '/api/admin/export/orders.csv', { headers: { Cookie: admin } });
    assert.match(o.headers.get('content-disposition'), /attachment; filename="shesell-orders-/);
    const a = (await req('GET', '/api/admin/audit', undefined, admin)).body.entries.map(e => e.action);
    assert.ok(a.includes('settings.update') && a.includes('training.add') && a.includes('order.status'));
  });
});

describe('live updates (Server-Sent Events)', () => {
  test('public, customer and staff streams each get what they may see', async () => {
    const admin = await login('admin', ADMIN_PW);
    const o = (await order([{ id: 'p20', q: 1 }])).body.order;
    const pub = sse('/api/stream');
    const cust = sse(`/api/stream?track=${o.id}.${o.token}`);
    const staff = sse('/api/stream', admin);
    await Promise.all([pub.ready, cust.ready, staff.ready]);
    await until(() => pub.events.length && cust.events.length && staff.events.length);
    await req('POST', '/api/my/products', { name: 'Live Test Product', cat: 'agri', price: 70, sellerId: 's17' }, admin);
    await req('POST', `/api/my/orders/${o.id}/status`, { status: 'packed' }, admin);
    const o2 = (await order([{ id: 'p20', q: 1 }])).body.order;
    assert.ok(await until(() => cust.events.some(e => e.type === 'order' && e.data.order.status === 'packed')));
    assert.ok(await until(() => pub.events.some(e => e.type === 'product' && e.data.product && e.data.product.name.en === 'Live Test Product')));
    assert.ok(await until(() => staff.events.some(e => e.type === 'order' && e.data.kind === 'created' && e.data.order.id === o2.id)));
    assert.ok(!pub.events.some(e => e.type === 'order'), 'public stream never sees orders');
    assert.ok(await until(() => staff.events.some(e => e.type === 'stats')), 'the admin gets live stats');
    assert.ok(!pub.events.some(e => e.type === 'stats') && !cust.events.some(e => e.type === 'stats'), 'stats are admin-only');
    assert.ok(!cust.events.some(e => e.type === 'order' && e.data.order.id === o2.id), 'customers see only their own orders');
    const custOrder = cust.events.find(e => e.type === 'order').data.order;
    assert.equal(custOrder.customer, undefined);
    [pub, cust, staff].forEach(s => s.close());
  });
});

describe('console sign-in help', () => {
  test('demo credentials are shown only while the demo PIN still works', async () => {
    const h = (await req('GET', '/api/console-info')).body.demo;
    assert.deepEqual(h.seller, { login: '9800000001', pin: '1234', name: 'Annapurna Mahila Bachat Gat' });
    assert.equal(h.adminFile, null, 'ADMIN_PASSWORD was set, so no password file was written');
    const s = await login('9800000001', '1234');
    assert.equal((await req('POST', '/api/auth/password', { current: '1234', next: '8642' }, s)).status, 200);
    assert.equal((await req('GET', '/api/console-info')).body.demo, null);
  });
});

describe('reset', () => {
  test('reset demo data restores the catalogue and keeps the admin login', async () => {
    const admin = await login('admin', ADMIN_PW);
    assert.equal((await req('POST', '/api/admin/reset', { confirm: 'nope' }, admin)).status, 400);
    assert.equal((await req('POST', '/api/admin/reset', { confirm: 'RESET' }, admin)).status, 200);
    const b = (await req('GET', '/api/bootstrap')).body;
    assert.equal(b.products.length, 20);
    assert.equal(b.settings.upiId, 'shesell.demo@upi');
    assert.equal(b.settings.whatsappNumber, '910000000000');
    assert.equal((await req('GET', '/api/auth/me', undefined, admin)).body.user.role, 'admin');
    await login('9800000001', '1234');
  });
});
