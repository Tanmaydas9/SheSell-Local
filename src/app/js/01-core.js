/* ------------------------------------------------------------------
   Core: configuration, helpers, state, i18n, toasts, WhatsApp + UPI links.
   This page is the buyer storefront only. Sellers and the admin work
   in the console at /admin (Seller Studio, AI Catalogue, lessons, settings).
------------------------------------------------------------------- */
// Placeholder until the admin saves the official number in Console › Settings. It is not a real
// number, so WhatsApp shows "invalid number" instead of opening a stranger's chat.
const PLACEHOLDER_WA = '910000000000';
const CONFIG = {
  upiId: 'shesell.demo@upi',          // DEMO payee. The console's Settings page replaces it with the collective's real UPI ID.
  upiName: 'SheSell Local Collective',
  whatsappNumber: PLACEHOLDER_WA,     // the official SheSell WhatsApp Business number (country code, no +)
  deliveryFee: 20,
  freeDeliveryAbove: 499,
  fairWage: 60,
  setupIssues: ['whatsapp', 'upi']
};

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const ICONS = __ICONS__;
const AVATARS = __AVATARS__;
const icon = (name, cls = '') => `<svg${cls ? ` class="${cls}"` : ''} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ''}</svg>`;
const store = {
  get(k, d) { try { const v = localStorage.getItem('shesell.' + k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem('shesell.' + k, JSON.stringify(v)); } catch (e) { /* storage unavailable */ } }
};

const state = {
  lang: 'en',
  products: [],
  sellers: [],
  reco: null,
  cart: new Map(),
  views: [],
  orders: [],
  filters: { cat: 'all', seller: 'all', sellerId: null, q: '', sort: 'rec' },
  delivery: 'delivery',
  buyer: { name: '', place: '' },
  metrics: { views: 0, shares: 0, adds: 0 }
};

/* ---------- tiny event bus ---------- */
const BUS = (() => {
  const m = {};
  return {
    on: (e, f) => { (m[e] = m[e] || []).push(f); },
    emit: (e, ...a) => (m[e] || []).forEach(f => { try { f(...a); } catch (err) { console.error(e, err); } })
  };
})();

/* ---------- i18n ---------- */
function t(key, vars) {
  let s = (I18N[state.lang] && I18N[state.lang][key]) ?? I18N.en[key] ?? key;
  if (vars) s = s.replace(/\{(\w+)\}/g, (_, k) => (vars[k] ?? ''));
  return s;
}
const L = (o) => (o ? (o[state.lang] || o.en || '') : '');
const locale = () => (state.lang === 'mr' ? 'mr-IN' : 'en-IN');
function fmtNum(n, d = 0) {
  try { return new Intl.NumberFormat(locale(), { maximumFractionDigits: d, minimumFractionDigits: d }).format(n); }
  catch (e) { return Number(n).toFixed(d); }
}
const inr = (n) => '₹' + fmtNum(Math.round(n));
const pct = (x, d = 0) => fmtNum(x * 100, d) + '%';
const CAT_KEYS = ['food', 'tailoring', 'craft', 'agri'];
const catName = (c) => t('cat_' + c);
// seller-set availability: a preset ("Fresh batch today") or her own words
const LEAD_ICON = { fresh_today: 'spark', small_batch: 'food', harvest_same_day: 'agri', made_to_order: 'clock', custom_fit: 'tailoring', ready_stock: 'package', preorder: 'bell', custom: 'clock' };
const leadText = (p) => (p.lead === 'custom' && p.leadText ? L(p.leadText) : p.lead ? t('lead_' + p.lead) : '');
const leadTag = (p, cls = '') => { const s = leadText(p); return s ? `<span class="lead-tag ${cls}">${icon(LEAD_ICON[p.lead] || 'clock')}<span>${esc(s)}</span></span>` : ''; };

// a server error code in the buyer's language (falls back to the server's English message)
function errText(e) {
  if (!e) return t('netError');
  const key = 'err_' + (e.code || '');
  if (e.code && (I18N.en[key] !== undefined)) return t(key, e.info || {});
  return e.message || t('netError');
}

function applyI18n() {
  document.documentElement.lang = state.lang;
  $$('[data-i18n]').forEach(el => { el.textContent = t(el.dataset.i18n); });
  $$('[data-i18n-ph]').forEach(el => { el.placeholder = t(el.dataset.i18nPh); });
  $$('[data-i18n-aria]').forEach(el => { el.setAttribute('aria-label', t(el.dataset.i18nAria)); });
  $$('.lang button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.lang === state.lang)));
  document.title = 'SheSell Local · ' + t('docTitle');
}
function setLang(lang) {
  if (!I18N[lang] || lang === state.lang) return;
  state.lang = lang;
  store.set('lang', lang);
  applyI18n();
  BUS.emit('lang', lang);
}

/* ---------- toasts ---------- */
function toast(msg, ic = 'check', ms = 3600) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.innerHTML = icon(ic) + '<span></span>';
  el.querySelector('span').textContent = msg;
  $('#toasts').appendChild(el);
  setTimeout(() => { el.style.transition = 'opacity .3s'; el.style.opacity = '0'; setTimeout(() => el.remove(), 320); }, ms);
}

/* ---------- WhatsApp + UPI ---------- */
// Every WhatsApp link goes to the one official SheSell Business number, never to an open contact picker.
const officialWa = () => (/^\d{11,15}$/.test(String(CONFIG.whatsappNumber || '')) ? CONFIG.whatsappNumber : PLACEHOLDER_WA);
const waLink = (text) => 'https://wa.me/' + officialWa() + '?text=' + encodeURIComponent(text);
const waIsPlaceholder = () => officialWa() === PLACEHOLDER_WA;
function upiUri(amount, note) {
  const vpa = String(CONFIG.upiId).replace(/[^a-zA-Z0-9.\-_@]/g, '');
  return `upi://pay?pa=${vpa}&pn=${encodeURIComponent(CONFIG.upiName)}&am=${Number(amount).toFixed(2)}&cu=INR&tn=${encodeURIComponent(note)}`;
}
// shareable link to one seller's shop (?seller=ID) or one product (?p=ID); none in the offline file demo
const shopUrl = (q = '') => (/^https?:$/.test(location.protocol) ? location.origin + '/' + q : '');
async function copyText(text) {
  try { await navigator.clipboard.writeText(text); toast(t('copied')); }
  catch (e) {
    const ta = document.createElement('textarea'); ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    let ok = false; try { ok = document.execCommand('copy'); } catch (err) { ok = false; }
    ta.remove();
    toast(ok ? t('copied') : t('copyFail'), ok ? 'check' : 'alert');
  }
}
