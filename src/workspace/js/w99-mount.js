/* ------------------------------------------------------------------
   Mount. The console calls SheSellWorkspace.open(view, ctx) to show a
   workspace view in its main area (after sign-in), and hide() when it
   moves to one of its own views. Roles are checked here for the UI and
   again by the server on every API call.
     studio, catalogue, lessons   sellers and the admin
     impact                       the admin only
------------------------------------------------------------------- */
window.SheSellWorkspace = (() => {
  const VIEWS = { studio: ['seller', 'admin'], catalogue: ['seller', 'admin'], lessons: ['seller', 'admin'], impact: ['admin'] };
  const started = {};
  let built = false, current = null;

  function build(host) {
    ROOT = host.shadowRoot || host.attachShadow({ mode: 'open' });
    ROOT.innerHTML = `<style>${WS_CSS}</style>${WS_HTML}`;
    applyI18n();
    [STUDIO, CATALOGUE, SAHELI, DASH].forEach(p => { try { p.bind(); } catch (e) { console.error(e); } });
    [() => STUDIO.init(), () => CATALOGUE.init(), () => SAHELI.init(), () => DASH.init()].forEach(f => { try { f(); } catch (e) { console.error(e); } });
    built = true;
  }
  function applySettings(s) {
    if (!s) return;
    ['upiId', 'upiName', 'whatsappNumber', 'deliveryFee', 'freeDeliveryAbove', 'fairWage'].forEach(k => { if (s[k] !== undefined) CONFIG[k] = s[k]; });
    if (built) { renderWaHints(); BUS.emit('settings'); }
  }
  function update(ctx) {
    const meChanged = ctx.me !== undefined && JSON.stringify(ctx.me) !== JSON.stringify(CTX.me);
    Object.assign(CTX, ctx);
    if (ctx.settings) applySettings(ctx.settings);
    if (ctx.lang && ctx.lang !== state.lang) { state.lang = ctx.lang; if (built) { applyI18n(); BUS.emit('lang', state.lang); } }
    if (meChanged && built) BUS.emit('me');
  }

  // libraries and server data each view needs, fetched once (retried if it failed)
  const once = (key, fn) => started[key] || (started[key] = fn().catch(e => { delete started[key]; throw e; }));
  const startStudio = () => once('studio', async () => {
    const [data] = await Promise.all([API.call('GET', '/ml/training-data'), LOADER.need('chart').catch(() => {}), LOADER.need('tf').catch(() => {})]);
    STUDIO.setData(data);
    if (libs.tf()) { try { await tf.ready(); } catch (e) { console.warn(e); } }
    STUDIO.startTraining();
  });
  async function refreshImpact() {
    try {
      const [s, p] = await Promise.all([API.call('GET', '/stats'), API.call('GET', '/my/products')]);
      state.stats = s.stats; state.products = p.products;
      BUS.emit('catalog'); BUS.emit('stats');
    } catch (e) { if (e.status !== 401) toast(errText(e), 'alert'); }
  }
  function prepare(view) {
    // the AI Catalogue prices drafts with the Studio's MLP, so both start the price model
    if (view === 'studio' || view === 'catalogue') startStudio().catch(e => toast(errText(e), 'alert'));
    if (view === 'catalogue' && isAdmin()) once('sellers', async () => { state.sellers = (await API.call('GET', '/admin/sellers')).sellers; BUS.emit('sellers'); }).catch(() => {});
    if (view === 'lessons' && !isAdmin()) once('lessons', async () => {
      const r = await API.call('GET', '/my/profile');
      SAHELI.setDone(((r.seller && r.seller.lessonsDone) || []).map(x => x.module));
    }).catch(() => {});
    if (view === 'impact') {
      once('impactChart', () => LOADER.need('chart').then(() => DASH.chart())).catch(() => DASH.chart());
      refreshImpact();
    }
  }

  function open(view, ctx) {
    if (!VIEWS[view] || !ctx || !ctx.me || !VIEWS[view].includes(ctx.me.role)) return false;
    update(ctx);
    if (!built) build(ctx.host);
    $$('.ws-view').forEach(v => { v.hidden = v.dataset.view !== view; });
    current = view;
    BUS.emit('tab', view);
    prepare(view);
    return true;
  }
  function hide() { if (current) { current = null; BUS.emit('tab', null); } }

  // live events, forwarded from the console's own event stream
  function event(type, data) {
    if (!built) return;
    if (type === 'training' && started.studio) API.call('GET', '/ml/training-data').then(d => STUDIO.setData(d, { announce: true })).catch(() => {});
    if (type === 'settings') applySettings(data);
    if (type === 'stats' && isAdmin()) { state.stats = data; BUS.emit('stats'); }
    if (type === 'product' && isAdmin() && state.products.length) {
      const i = state.products.findIndex(p => p.id === (data.product ? data.product.id : data.id));
      if (data.action === 'remove') { if (i >= 0) state.products.splice(i, 1); }
      else if (data.product && data.product.status !== undefined) { if (i >= 0) state.products[i] = data.product; else state.products.unshift(data.product); }
      BUS.emit('catalog');
    }
  }
  function reset() { Object.keys(started).forEach(k => delete started[k]); state.sellers = []; state.stats = null; state.products = []; }

  return { open, hide, update, event, reset, views: VIEWS, get current() { return current; } };
})();
