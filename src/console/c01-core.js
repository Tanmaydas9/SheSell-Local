/* ------------------------------------------------------------------
   SheSell Console: helpers, API client, state, router, dialogs and
   live updates. Three roles, kept apart in the UI and on the server:
     buyers   use the shop at / (no account)
     sellers  their own orders, products and shop page, plus the seller
              workspace: Seller Studio, AI Catalogue, voice lessons
     admin    everything above for every seller, plus payment verification,
              listing approval, sellers, training data, settings, the pilot
              dashboard, activity log and backups
------------------------------------------------------------------- */
const ICONS = __ICONS__;
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const icon = (name, cls = '') => `<svg${cls ? ` class="${cls}"` : ''} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ''}</svg>`;
const BRAND_SVG = '<svg class="brand-mark" viewBox="0 0 40 40" aria-hidden="true"><rect width="40" height="40" rx="12" fill="#9EB83B"/><path d="M11.5 15h17l-2.2 15.5H13.7z" fill="#1B434D"/><path d="M15.5 15c0-5.6 9-5.6 9 0" fill="none" stroke="#1B434D" stroke-width="2.6" stroke-linecap="round"/><path d="M20 27.5c0-4.4 3.2-6.8 6.8-6.8 0 3.9-2.8 6.8-6.8 6.8z" fill="#9EB83B"/><path d="M20 27.5l3.6-3.6" stroke="#1B434D" stroke-width="1.4" stroke-linecap="round"/></svg>';
const store = {
  get(k, d) { try { const v = localStorage.getItem('shesell.' + k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem('shesell.' + k, JSON.stringify(v)); } catch (e) { /* private mode */ } }
};

const S = {
  lang: store.get('lang', 'en') === 'mr' ? 'mr' : 'en',
  me: null, view: 'dashboard', es: null, live: false, settings: null, info: null,
  feed: [], data: {}, filters: { orders: 'active', products: 'all', sellers: 'all', payments: 'claimed' }, q: { orders: '', products: '', sellers: '' }
};

/* ---------- i18n + formatting ---------- */
function t(key, vars) {
  let s = (CI18N[S.lang] && CI18N[S.lang][key]) ?? CI18N.en[key] ?? key;
  if (vars) s = s.replace(/\{(\w+)\}/g, (_, k) => (vars[k] ?? ''));
  return s;
}
const tl = (lang, key, vars) => { let s = (CI18N[lang] || CI18N.en)[key] ?? CI18N.en[key] ?? key; if (vars) s = s.replace(/\{(\w+)\}/g, (_, k) => (vars[k] ?? '')); return s; };
const loc = () => (S.lang === 'mr' ? 'mr-IN' : 'en-IN');
const num = (n, d = 0) => { try { return new Intl.NumberFormat(loc(), { maximumFractionDigits: d, minimumFractionDigits: d }).format(n); } catch (e) { return Number(n).toFixed(d); } };
const inr = (n) => '₹' + num(Math.round(n || 0));
const L = (o) => (o ? (o[S.lang] || o.en || '') : '');
const catName = (c) => t('cat_' + c);
const CAT_KEYS = ['food', 'tailoring', 'craft', 'agri'];
const CAT_COLORS = { food: '#E3A83B', tailoring: '#D2648E', craft: '#74BDBA', agri: '#9EB83B' };
const dateStr = (ts, opts = { day: 'numeric', month: 'short' }) => new Date(ts).toLocaleDateString(loc(), opts);
const monthName = (i) => new Date(2026, i, 1).toLocaleDateString(loc(), { month: 'short' });
const timeStr = (ts) => new Date(ts).toLocaleString(loc(), { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
function ago(ts) {
  const s = Math.max(0, Math.round((Date.now() - ts) / 1000));
  if (s < 50) return t('justNow');
  const m = Math.round(s / 60); if (m < 60) return t('minAgo', { n: num(m) });
  const h = Math.round(m / 60); if (h < 24) return t('hAgo', { n: num(h) });
  const d = Math.round(h / 24); if (d < 7) return t('dAgo', { n: num(d) });
  return dateStr(ts);
}
const isAdmin = () => S.me && S.me.role === 'admin';
const LEADS = ['fresh_today', 'small_batch', 'harvest_same_day', 'made_to_order', 'custom_fit', 'ready_stock', 'preorder', 'custom'];
const DEFAULT_LEAD = { food: 'fresh_today', tailoring: 'custom_fit', craft: 'made_to_order', agri: 'harvest_same_day' };
const leadText = (p) => (p.lead === 'custom' && p.leadText ? L(p.leadText) : p.lead ? t('lead_' + p.lead) : '');
// a server error code in the console's language (falls back to the server's English message)
function errText(e) {
  if (!e) return t('netError');
  const key = 'err_' + (e.code || '');
  if (e.code && CI18N.en[key] !== undefined) return t(key, e.info || {});
  return e.message || t('netError');
}

/* ---------- API ---------- */
async function api(method, path, body) {
  let res;
  try {
    res = await fetch('/api' + path, { method, credentials: 'same-origin', headers: body !== undefined ? { 'Content-Type': 'application/json' } : {}, body: body !== undefined ? JSON.stringify(body) : undefined });
  } catch (e) { const err = new Error(t('netError')); err.code = 'network'; throw err; }
  let data = {};
  try { data = await res.json(); } catch (e) { /* empty body */ }
  if (res.status === 401 && path !== '/auth/login' && path !== '/auth/password') { S.me = null; showLogin(); }
  if (!res.ok) {
    const err = new Error((data.error && data.error.message) || t('netError'));
    err.status = res.status; err.code = data.error && data.error.code; err.info = data.error || {};
    err.message = errText(err);
    throw err;
  }
  return data;
}

/* ---------- toasts, dialogs, drawer ---------- */
function toast(msg, kind = 'ok', ms = 3600) {
  const el = document.createElement('div');
  el.className = 'toast ' + kind;
  el.innerHTML = icon(kind === 'err' ? 'alert' : kind === 'info' ? 'bell' : 'check') + '<span></span>';
  el.querySelector('span').textContent = msg;
  $('#toasts').appendChild(el);
  setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 300); }, ms);
}
function dialog({ title, body = '', ok = t('ok'), cancel = t('cancel'), danger = false, input = null, onOpen = null }) {
  return new Promise(resolve => {
    const d = $('#dialog');
    d.innerHTML = `<form class="dlg" method="dialog">
      <h2 class="h2">${esc(title)}</h2>${body ? `<div class="dlg-body">${body}</div>` : ''}
      ${input ? `<label class="field"><span class="label">${esc(input.label)}</span><input class="input" id="dlgInput" autocomplete="off" placeholder="${esc(input.placeholder || '')}"></label>` : ''}
      <div class="dlg-actions">${cancel ? `<button type="button" class="btn ghost" data-v="0">${esc(cancel)}</button>` : ''}<button type="submit" class="btn ${danger ? 'danger' : 'teal'}" data-v="1">${esc(ok)}</button></div></form>`;
    d.hidden = false; $('#scrim').hidden = false;
    const done = (v) => { d.hidden = true; if ($('#drawer').hidden) $('#scrim').hidden = true; resolve(v); };
    d.querySelector('form').addEventListener('submit', (e) => { e.preventDefault(); done(input ? ($('#dlgInput').value || '') : true); });
    d.querySelector('[data-v="0"]')?.addEventListener('click', () => done(input ? null : false));
    if (onOpen) onOpen(d);
    setTimeout(() => (input ? $('#dlgInput') : d.querySelector('[data-v="1"]')).focus(), 30);
  });
}
function openDrawer(html, wide = false) {
  const d = $('#drawer');
  d.className = 'drawer' + (wide ? ' wide' : '');
  d.innerHTML = `<button type="button" class="icon-btn close-x" data-close aria-label="${esc(t('close'))}">${icon('x')}</button><div class="drawer-in">${html}</div>`;
  d.hidden = false; $('#scrim').hidden = false;
  requestAnimationFrame(() => d.classList.add('on'));
  setTimeout(() => d.querySelector('[data-close]').focus(), 60);
}
function closeDrawer() {
  const d = $('#drawer');
  d.classList.remove('on'); d.dataset.order = ''; d.dataset.product = '';
  setTimeout(() => { d.hidden = true; d.innerHTML = ''; }, 200);
  if ($('#dialog').hidden) $('#scrim').hidden = true;
}

/* ---------- small UI pieces ---------- */
const STATUS_ICON = { confirmed: 'bell', packed: 'package', out: 'truck', delivered: 'home', cancelled: 'x' };
const statusPill = (s) => `<span class="spill st-${esc(s)}">${icon(STATUS_ICON[s] || 'info')}${esc(t('st_' + s))}</span>`;
const payPill = (p) => `<span class="spill pay-${esc(p)}">${icon(p === 'paid' ? 'shield' : p === 'claimed' ? 'clock' : p === 'refunded' ? 'refresh' : 'rupee')}${esc(t('pay_' + p))}</span>`;
const leadPill = (p) => { const s = leadText(p); return s ? `<span class="spill lead">${icon('clock')}${esc(s)}</span>` : ''; };
const prodPill = (s) => `<span class="spill pr-${esc(s)}">${esc(t('ps_' + s))}</span>`;
const empty = (msg, ic = 'info') => `<div class="empty">${icon(ic)}<p>${esc(msg)}</p></div>`;
const skeleton = () => `<div class="skel"><i></i><i></i><i></i></div>`;
const initials = (name) => String(name || '?').split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase();
const waNumber = (phone) => { const d = String(phone || '').replace(/\D/g, ''); return d.length === 10 ? '91' + d : d; };
// staff → one named customer or seller, sent from the SheSell Business account on this device
const waLink = (phone, text) => `https://wa.me/${waNumber(phone)}?text=${encodeURIComponent(text)}`;
// sellers → SheSell: always the official Business number from Settings, never a blank contact picker
const PLACEHOLDER_WA = '910000000000';
const officialWa = () => (S.settings && /^\d{11,15}$/.test(String(S.settings.whatsappNumber || '')) ? S.settings.whatsappNumber : PLACEHOLDER_WA);
const waOfficial = (text) => `https://wa.me/${officialWa()}?text=${encodeURIComponent(text)}`;
const waPretty = (n = officialWa()) => (n.startsWith('91') && n.length === 12 ? '+91 ' + n.slice(2, 7) + ' ' + n.slice(7) : '+' + n);
const waHint = () => (officialWa() === PLACEHOLDER_WA
  ? `<p class="wa-hint warn">${icon('alert')}<span>${esc(t('waHintPlaceholder'))}</span></p>`
  : `<p class="wa-hint">${icon('wa')}<span>${esc(t('waHintOfficial', { n: waPretty() }))}</span></p>`);
const shopLink = (sellerId) => location.origin + '/' + (sellerId ? '?seller=' + encodeURIComponent(sellerId) : '');
async function copyText(text) {
  try { await navigator.clipboard.writeText(text); toast(t('copied')); }
  catch (e) {
    const ta = document.createElement('textarea'); ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    let ok = false; try { ok = document.execCommand('copy'); } catch (err) { ok = false; }
    ta.remove();
    toast(ok ? t('copied') : t('copyFail'), ok ? 'ok' : 'err');
  }
}

// resize a picked photo to a JPEG data URL (max 900 px), like the storefront's AI Catalogue does
function photoToDataUrl(file, max = 900) {
  return new Promise((resolve, reject) => {
    if (!file || !/^image\//.test(file.type)) { reject(new Error(t('photoType'))); return; }
    const url = URL.createObjectURL(file), img = new Image();
    img.onload = () => {
      const k = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
      const c = document.createElement('canvas'); c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      resolve(c.toDataURL('image/jpeg', 0.85));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error(t('photoType'))); };
    img.src = url;
  });
}

/* ---------- router ---------- */
// ws: drawn by the seller workspace (Seller Studio, AI Catalogue, lessons, pilot dashboard) in #ws
const NAV = [
  { id: 'dashboard', icon: 'grid', roles: ['admin', 'seller'], group: 'shop' },
  { id: 'orders', icon: 'package', roles: ['admin', 'seller'], group: 'shop' },
  { id: 'payments', icon: 'rupee', roles: ['admin'], group: 'shop' },
  { id: 'products', icon: 'tag', roles: ['admin', 'seller'], group: 'shop' },
  { id: 'profile', icon: 'user', roles: ['seller'], group: 'shop' },
  { id: 'studio', icon: 'chart', roles: ['admin', 'seller'], group: 'tools', ws: true },
  { id: 'catalogue', icon: 'camera', roles: ['admin', 'seller'], group: 'tools', ws: true },
  { id: 'lessons', icon: 'volume', roles: ['admin', 'seller'], group: 'tools', ws: true },
  { id: 'impact', icon: 'flag', roles: ['admin'], group: 'admin', ws: true },
  { id: 'sellers', icon: 'users', roles: ['admin'], group: 'admin' },
  { id: 'training', icon: 'cpu', roles: ['admin'], group: 'admin' },
  { id: 'settings', icon: 'settings', roles: ['admin'], group: 'admin' },
  { id: 'activity', icon: 'clock', roles: ['admin'], group: 'admin' }
];
const navItem = (id) => NAV.find(x => x.id === id);
const allowed = (id) => { const n = navItem(id); return !!(n && S.me && n.roles.includes(S.me.role)); };
function go(view, push = true) {
  const wanted = view;
  if (!allowed(view)) view = 'dashboard';
  S.view = view;
  if (!$('#drawer').hidden) closeDrawer();
  if ((push || wanted !== view) && location.hash !== '#' + view) { try { history.replaceState(null, '', '#' + view); } catch (e) { location.hash = view; } }
  renderNav();
  $('#side').classList.remove('open');
  window.scrollTo({ top: 0 });
  renderView();
}
function renderNav() {
  const mine = NAV.filter(n => S.me && n.roles.includes(S.me.role));
  const groups = [...new Set(mine.map(n => n.group))];
  const badge = (id) => { const n = S.badges && S.badges[id]; return n ? `<span class="nbadge">${num(n)}</span>` : ''; };
  $('#nav').innerHTML = groups.map(g => `<div class="nav-group"><span class="nav-gh">${esc(t('navg_' + g + (g === 'shop' && !isAdmin() ? '_seller' : '')))}</span>${mine.filter(n => n.group === g).map(n =>
    `<button type="button" class="nav-item" data-view="${n.id}" aria-current="${S.view === n.id ? 'page' : 'false'}">${icon(n.icon)}<span>${esc(t('nav_' + n.id))}</span>${badge(n.id)}</button>`).join('')}</div>`).join('');
  $('#topTitle').textContent = t('nav_' + S.view);
  $('.side .brand small').textContent = t('consoleWord');
  $('#nav').setAttribute('aria-label', t('navAria'));
  $('#menuBtn').setAttribute('aria-label', t('menu'));
  const me = S.me;
  $('#who').innerHTML = me ? `<span class="avatar">${esc(initials(me.name))}</span><span class="who-t"><b>${esc(me.name)}</b><small>${esc(me.role === 'admin' ? t('roleAdmin') : t('roleSeller'))}${me.seller && !me.seller.verified ? ' · ' + esc(t('unverified')) : ''}</small></span>` : '';
  $('#sideLinks').innerHTML = `<a href="/${me && me.seller ? '?seller=' + encodeURIComponent(me.seller.id) : ''}" target="_blank" rel="noopener">${icon('store')}<span>${esc(t(me && me.seller ? 'openMyShop' : 'openShop'))}</span></a><button type="button" id="signOut">${icon('logout')}<span>${esc(t('signOut'))}</span></button>`;
  $$('.lang button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.lang === S.lang)));
  document.documentElement.lang = S.lang;
  document.title = t('nav_' + S.view) + ' · SheSell Console';
}
async function refreshBadges() {
  if (!S.me) return;
  try {
    const o = await api('GET', '/my/overview');
    S.data.overview = o;
    setBadges(o);
  } catch (e) { /* badges are optional */ }
}
function setBadges(o) {
  S.badges = { orders: o.kpis.toPack, payments: isAdmin() ? o.kpis.claimed : 0, products: isAdmin() ? o.kpis.pendingListings : 0 };
  renderNav();
}

/* ---------- live updates ---------- */
function connectLive() {
  if (S.es) S.es.close();
  if (typeof EventSource === 'undefined') return;
  const es = new EventSource('/api/stream');
  S.es = es;
  es.addEventListener('hello', () => setLive(true));
  es.onerror = () => setLive(false);
  const on = (type, fn) => es.addEventListener(type, (ev) => { let d; try { d = JSON.parse(ev.data); } catch (e) { return; } try { fn(d); } catch (err) { console.error(type, err); } });
  on('order', (d) => LIVE.order(d));
  on('product', (d) => LIVE.product(d));
  on('notice', (d) => LIVE.notice(d));
  on('stats', (d) => LIVE.stats(d));
  on('settings', (d) => { S.settings = d; if (window.SheSellWorkspace) SheSellWorkspace.event('settings', d); if (S.view === 'settings') renderView(); });
  on('training', (d) => { if (window.SheSellWorkspace) SheSellWorkspace.event('training', d); if (S.view === 'training') renderView(); });
  on('reload', () => { toast(t('dataReloaded'), 'info'); setTimeout(() => location.reload(), 900); });
}
function setLive(v) {
  S.live = v;
  const el = $('#liveDot');
  el.className = 'live-dot ' + (v ? 'on' : 'off');
  el.innerHTML = `<i></i><span>${esc(t(v ? 'liveOn' : 'liveOff'))}</span>`;
}
function pushFeed(item) {
  S.feed.unshift(Object.assign({ at: Date.now() }, item));
  S.feed = S.feed.slice(0, 30);
  if (S.view === 'dashboard') VIEWS.renderFeed();
}
