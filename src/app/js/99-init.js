/* ------------------------------------------------------------------
   Boot: the shop renders immediately from the built-in catalogue, then
   the server's data replaces it (if a SheSell server is behind the page).
   Links: ?seller=ID opens one seller's shop, ?p=ID opens one product.
------------------------------------------------------------------- */
function boot() {
  state.lang = store.get('lang', 'en') === 'mr' ? 'mr' : 'en';
  state.products = CATALOG.items.map(p => Object.assign({}, p));
  state.reco = RECO.create(state.products, CATALOG.baskets());
  const params = new URLSearchParams(location.search);
  if (/^[\w-]{1,40}$/.test(params.get('seller') || '')) state.filters.sellerId = params.get('seller');
  applyI18n();
  [PHONE, SHOP, CHECKOUT, SYNC].forEach(p => { try { p.bind(); } catch (e) { console.error(e); } });
  [() => SHOP.renderAll(), () => CHECKOUT.renderOrders(), () => PHONE.seed()].forEach(f => { try { f(); } catch (e) { console.error(e); } });
  $$('.lang button').forEach(b => b.addEventListener('click', () => setLang(b.dataset.lang)));
  SYNC.start();
  const pid = params.get('p');
  if (pid) SYNC.ready.then(() => { if (state.products.some(p => p.id === pid)) SHOP.openProduct(pid); });
}

try { boot(); } catch (e) { console.error('Boot failed', e); }
