/* ------------------------------------------------------------------
   Sync: loads the shop from the server (products, sellers, settings,
   real order baskets) and keeps it current with live events: listings
   approved in the console appear instantly, order updates move the
   tracker, settings change the UPI QR and the official WhatsApp number.
------------------------------------------------------------------- */
const SYNC = (() => {
  let resolveReady;
  const ready = new Promise(r => { resolveReady = r; });
  let catalogTimer = null;

  function renderLive() {
    const pill = $('#livePill');
    pill.hidden = false;
    pill.className = 'live-pill ' + (API.online ? 'on' : 'off');
    pill.innerHTML = `<span class="dot" aria-hidden="true"></span><span>${esc(t(API.online ? 'liveOnline' : 'liveOffline'))}</span>`;
  }
  function renderBanner() {
    const s = state.serverSettings, el = $('#announce');
    let msg = '', warn = false;
    if (API.online && s) {
      if (!s.storeOpen) { msg = t('shopPaused'); warn = true; }
      else if (s.announcement && L(s.announcement)) msg = L(s.announcement);
    }
    el.hidden = !msg;
    el.classList.toggle('warn', warn);
    el.innerHTML = msg ? `${icon(warn ? 'alert' : 'bell')}<span>${esc(msg)}</span>` : '';
  }
  // signed in already (from the console)? The login button becomes a link back to the workspace.
  function renderLogin() {
    const a = $('#loginLink');
    a.href = location.protocol === 'file:' ? 'admin.html' : '/admin';
    $('#loginLabel').textContent = t(API.me ? 'myWorkspace' : 'sellerLogin');
    $('#loginShort').textContent = t(API.me ? 'myWorkspaceShort' : 'sellerLoginShort');
  }
  function applySettings(s) {
    state.serverSettings = s;
    ['upiId', 'upiName', 'whatsappNumber', 'deliveryFee', 'freeDeliveryAbove', 'fairWage', 'setupIssues'].forEach(k => { if (s[k] !== undefined) CONFIG[k] = s[k]; });
    renderBanner();
    BUS.emit('settings');
  }

  // batch bursts of product events into one re-render
  function catalogChanged() {
    clearTimeout(catalogTimer);
    catalogTimer = setTimeout(() => {
      state.reco.rebuild();
      for (const id of [...state.cart.keys()]) if (!state.products.some(p => p.id === id)) state.cart.delete(id);
      SHOP.renderBadge();
      BUS.emit('catalog');
    }, 120);
  }
  function upsertProduct(p) {
    if (!p || !p.id) return;
    if (p.status && p.status !== 'active') { removeProduct(p.id); return; }
    const i = state.products.findIndex(x => x.id === p.id);
    if (i >= 0) { state.products[i] = Object.assign({}, p); catalogChanged(); return; }
    state.products.unshift(Object.assign({}, p));
    catalogChanged();
    if (p.isNew) {
      toast(t('newListingToast', { name: L(p.name) }), 'spark', 3600);
      PHONE.post({ dir: 'in', img: p.image, text: () => t('waNewListing', { name: L(p.name), seller: L(p.seller), price: inr(p.price) }) });
    }
  }
  function removeProduct(id) {
    const i = state.products.findIndex(x => x.id === id);
    if (i < 0) return;
    state.products.splice(i, 1);
    catalogChanged();
  }

  function hydrate(data) {
    applySettings(data.settings);
    state.products = data.products.map(p => Object.assign({}, p));
    state.sellers = data.sellers || [];
    // recommender: the seeded archetype baskets plus every real order on the server
    state.reco = RECO.create(state.products, CATALOG.baskets().concat((data.ml && data.ml.baskets) || []));
    for (const id of [...state.cart.keys()]) if (!state.products.some(p => p.id === id)) state.cart.delete(id);
    renderLogin();
    SHOP.renderBadge();
    BUS.emit('catalog'); BUS.emit('online');
    CHECKOUT.loadTracked();
    API.connect();
  }

  function bindLive() {
    API.on('product', d => (d.action === 'remove' ? removeProduct(d.id) : upsertProduct(d.product)));
    API.on('order', d => CHECKOUT.applyServerOrder(d.order));
    API.on('settings', s => { applySettings(s); });
    API.on('reload', () => { setTimeout(() => location.reload(), 300); });
  }

  async function start() {
    bindLive();
    renderLogin();
    let data = null;
    try { data = await API.boot(); if (data) hydrate(data); }
    catch (e) { console.error('Server data could not be applied', e); }
    renderLive();
    resolveReady(!!data);
  }
  function bind() { BUS.on('lang', () => { renderLive(); renderBanner(); renderLogin(); }); }

  return { start, ready, bind, upsertProduct, renderBanner };
})();
