/* ------------------------------------------------------------------
   Seller workspace core. Seller Studio, AI Catalogue, voice lessons and
   the admin's pilot dashboard live inside the console (/admin), after
   sign-in. They are drawn into a shadow root with the shop's own
   stylesheet, so the two design systems never clash. The console opens
   a view with SheSellWorkspace.open(view, ctx) (see w99-mount.js).
------------------------------------------------------------------- */
const ICONS = __ICONS__;
const AVATARS = __AVATARS__;
const WS_CSS = __WS_CSS__;
const WS_HTML = __WS_HTML__;
const PLACEHOLDER_WA = '910000000000';
let ROOT = null;                          // the shadow root, created when the workspace first opens
// what the console hands over: who is signed in, the shop settings, and a few console actions
const CTX = { me: null, settings: null, toast: null, changed: () => {}, share: () => {}, go: () => {} };
const CONFIG = { upiId: 'shesell.demo@upi', upiName: 'SheSell Local Collective', whatsappNumber: PLACEHOLDER_WA, deliveryFee: 20, freeDeliveryAbove: 499, fairWage: 60 };

const $ = (s, el = ROOT) => el.querySelector(s);
const $$ = (s, el = ROOT) => [...el.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const icon = (name, cls = '') => `<svg${cls ? ` class="${cls}"` : ''} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ''}</svg>`;

const state = {
  lang: 'en',
  products: [],        // admin: every product (catalogue mix on the pilot dashboard)
  sellers: [],         // admin: seller register (AI Catalogue "list for")
  stats: null,         // admin: live counters
  metrics: { published: 0, trainings: 0, lessons: new Set(), uplift: null }
};
const isAdmin = () => !!(CTX.me && CTX.me.role === 'admin');
const mySeller = () => (CTX.me && CTX.me.seller) || null;

/* ---------- tiny event bus ---------- */
const BUS = (() => {
  const m = {};
  return {
    on: (e, f) => { (m[e] = m[e] || []).push(f); },
    emit: (e, ...a) => (m[e] || []).forEach(f => { try { f(...a); } catch (err) { console.error(e, err); } })
  };
})();

/* ---------- i18n (the shop's dictionary, shared with the storefront) ---------- */
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
const LEADS = ['fresh_today', 'small_batch', 'harvest_same_day', 'made_to_order', 'custom_fit', 'ready_stock', 'preorder', 'custom'];
const DEFAULT_LEAD = { food: 'fresh_today', tailoring: 'custom_fit', craft: 'made_to_order', agri: 'harvest_same_day' };

function errText(e) {
  if (!e) return t('netError');
  const key = 'err_' + (e.code || '');
  if (e.code && I18N.en[key] !== undefined) return t(key, e.info || {});
  return e.message || t('netError');
}

function applyI18n() {
  if (!ROOT) return;
  ROOT.host.dataset.lang = state.lang;
  $$('[data-i18n]').forEach(el => { el.textContent = t(el.dataset.i18n); });
  $$('[data-i18n-ph]').forEach(el => { el.placeholder = t(el.dataset.i18nPh); });
  $$('[data-i18n-aria]').forEach(el => { el.setAttribute('aria-label', t(el.dataset.i18nAria)); });
  renderWaHints();
}

/* ---------- toasts go through the console ---------- */
function toast(msg, ic = 'check', ms = 3600) {
  const kind = ic === 'alert' ? 'err' : ['info', 'clock', 'spark', 'bell'].includes(ic) ? 'info' : 'ok';
  if (CTX.toast) CTX.toast(msg, kind, ms);
}

/* ---------- WhatsApp: always the official SheSell Business number ---------- */
const officialWa = () => (/^\d{11,15}$/.test(String(CONFIG.whatsappNumber || '')) ? CONFIG.whatsappNumber : PLACEHOLDER_WA);
const waLink = (text) => 'https://wa.me/' + officialWa() + '?text=' + encodeURIComponent(text);
const waIsPlaceholder = () => officialWa() === PLACEHOLDER_WA;
const waPretty = () => { const n = officialWa(); return n.startsWith('91') && n.length === 12 ? '+91 ' + n.slice(2, 7) + ' ' + n.slice(7) : '+' + n; };
function renderWaHints() {
  $$('[data-wa-hint]').forEach(el => {
    const ph = waIsPlaceholder();
    el.classList.toggle('placeholder', ph);
    el.innerHTML = icon(ph ? 'alert' : 'wa') + `<span>${esc(ph ? t('waHintPlaceholder') : t('waHintOfficial', { n: waPretty() }))}</span>`;
  });
}
const shopUrl = (q = '') => location.origin + '/' + q;

async function copyText(text) {
  try { await navigator.clipboard.writeText(text); toast(t('copied')); }
  catch (e) {
    const ta = document.createElement('textarea'); ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
    ROOT.appendChild(ta); ta.select();
    let ok = false; try { ok = document.execCommand('copy'); } catch (err) { ok = false; }
    ta.remove();
    toast(ok ? t('copied') : t('copyFail'), ok ? 'check' : 'alert');
  }
}

/* ---------- CDN libraries, loaded the first time a view needs them ---------- */
const CDN = {
  chart: 'https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js',
  tf: 'https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.22.0/dist/tf.min.js',
  mobilenet: 'https://cdn.jsdelivr.net/npm/@tensorflow-models/mobilenet@2.1.1'
};
const libs = { tf: () => typeof window.tf !== 'undefined', chart: () => typeof window.Chart !== 'undefined', mobilenet: () => typeof window.mobilenet !== 'undefined' };
const LOADER = (() => {
  const loading = {};
  function script(src) {
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src; s.async = true; s.crossOrigin = 'anonymous';
      s.onload = () => resolve(); s.onerror = () => { s.remove(); reject(new Error('Could not load ' + src)); };
      document.head.appendChild(s);
    });
  }
  function need(name) {
    if (libs[name]()) return Promise.resolve();
    if (!loading[name]) {
      const p = name === 'mobilenet' ? need('tf').then(() => script(CDN.mobilenet)) : script(CDN[name]);
      loading[name] = p.catch(e => { delete loading[name]; throw e; });
    }
    return loading[name];
  }
  return { need };
})();

/* Two TF.js backends side by side. The 850-parameter pricing MLP runs on 'cpu': for a net this small,
   per-kernel GPU dispatch costs more than the maths (measured ~6x faster on an integrated GPU).
   MobileNet runs on 'webgl'. Synchronous blocks switch, run and restore the active backend; a tensor
   that lives on the other backend is moved by TF.js automatically, so results never depend on timing.
   Long async jobs that need the global backend (training, MobileNet download + warm-up) are queued. */
const ML = {
  pending: 0,
  queue: Promise.resolve(),
  has(name) { try { return libs.tf() && !!tf.findBackend(name); } catch (e) { return false; } },
  pick(name) { return ML.has(name) ? name : (libs.tf() ? tf.getBackend() : ''); },
  run(name, fn) {
    if (!ML.has(name)) return fn();
    const prev = tf.getBackend();
    if (prev === name) return fn();
    tf.setBackend(name);
    try { return fn(); } finally { if (prev) tf.setBackend(prev); }
  },
  exclusive(job) {
    ML.pending++;
    const run = ML.queue.then(job);
    ML.queue = run.catch(() => {}).then(() => { ML.pending--; });
    return run;
  }
};
