/* ------------------------------------------------------------------
   Storefront: filters, grid, product modal, live recommendations
------------------------------------------------------------------- */
const SHOP = (() => {
  const CAT_COLORS = { food: '#E3A83B', tailoring: '#D2648E', craft: '#74BDBA', agri: '#9EB83B' };
  const avatarFor = (p) => (p.type === 'shg' ? AVATARS.shg : ({ food: AVATARS.food, tailoring: AVATARS.artisan, craft: AVATARS.mom, agri: AVATARS.farmer }[p.cat]));

  function profile() {
    const w = new Map();
    state.views.forEach((id, i) => w.set(id, Math.max(w.get(id) || 0, 0.5 * Math.pow(0.85, i))));
    state.cart.forEach((q, id) => w.set(id, 1));
    return [...w.entries()].map(([id, wt]) => ({ id, w: wt }));
  }
  function filtered() {
    const f = state.filters, q = f.q.trim().toLowerCase();
    let list = state.products.filter(p =>
      (f.cat === 'all' || p.cat === f.cat) &&
      (f.seller === 'all' || p.type === f.seller) &&
      (!f.sellerId || p.sellerId === f.sellerId) &&
      (!q || [p.name.en, p.name.mr, p.seller.en, p.seller.mr, p.place.en, p.place.mr, catName(p.cat)].join(' ').toLowerCase().includes(q)));
    if (f.sort === 'low') list.sort((a, b) => a.price - b.price);
    else if (f.sort === 'high') list.sort((a, b) => b.price - a.price);
    else if (f.sort === 'pop') list.sort((a, b) => b.pop - a.pop);
    else {
      const prof = profile();
      if (prof.length && state.reco) {
        const scores = new Map(state.reco.forProfile(prof, state.products.length).map(x => [x.p.id, x.score]));
        list.sort((a, b) => (scores.get(b.id) ?? 0) - (scores.get(a.id) ?? 0) || b.pop - a.pop);
      } else list.sort((a, b) => (b.isNew ? 1 : 0) - (a.isNew ? 1 : 0) || b.pop - a.pop);
    }
    return list;
  }
  const stockOf = (p) => (p.stock === null || p.stock === undefined ? Infinity : p.stock);
  const stockTag = (p) => {
    const n = stockOf(p);
    if (n === 0) return `<span class="pill tag-out">${esc(t('soldOut'))}</span>`;
    return n <= 5 ? `<span class="pill tag-low">${esc(t('stockLeft', { n: fmtNum(n) }))}</span>` : '';
  };
  const typeTag = (p) => p.type === 'shg' ? `<span class="pill tag-shg">${esc(t('tagShg'))}</span>` : `<span class="pill tag-ind">${esc(t('tagInd'))}</span>`;

  function card(p) {
    return `<article class="pcard">
      <button type="button" class="art" data-open="${esc(p.id)}" aria-label="${esc(L(p.name))}">${ART.svg(p)}</button>
      <div class="body">
        <div class="row" style="gap:6px">${typeTag(p)}${p.isNew ? `<span class="pill tag-new">${esc(t('tagNew'))}</span>` : ''}${stockTag(p)}</div>
        <button type="button" class="title" data-open="${esc(p.id)}">${esc(L(p.name))}</button>
        ${leadTag(p)}
        <div class="seller"><img src="${avatarFor(p)}" alt=""><span>${esc(L(p.seller))}</span></div>
        <div class="tiny muted">${icon('pin', '').replace('<svg', '<svg style="width:13px;height:13px;display:inline;vertical-align:-2px"')} ${esc(L(p.place))}</div>
        <div class="foot"><div class="pr"><span class="price">${inr(p.price)}</span><span class="unit">${esc(L(p.unit))}</span></div>
          <button type="button" class="btn btn-primary btn-sm" data-add="${esc(p.id)}" aria-label="${esc(t('addTo') + ' ' + L(p.name))}"${stockOf(p) === 0 ? ' disabled' : ''}>${icon('plus')}<span>${esc(t('add'))}</span></button></div>
      </div></article>`;
  }
  function renderChips() {
    const cats = [['all', t('catAll'), null], ...CAT_KEYS.map(c => [c, catName(c), CAT_COLORS[c]])];
    $('#catChips').innerHTML = cats.map(([k, label, col]) => `<button type="button" class="chip" data-cat="${k}" aria-pressed="${state.filters.cat === k}">${col ? `<span class="dot" style="background:${col}"></span>` : ''}${esc(label)}</button>`).join('');
    const sel = [['all', t('sellAll')], ['individual', t('sellInd')], ['shg', t('sellShg')]];
    $('#sellerChips').innerHTML = sel.map(([k, label]) => `<button type="button" class="chip" data-seller="${k}" aria-pressed="${state.filters.seller === k}">${esc(label)}</button>`).join('');
  }
  // ?seller=ID: one seller's (or one SHG's) own shop page, the link she shares on WhatsApp
  function renderSellerBanner() {
    const el = $('#sellerBanner'), id = state.filters.sellerId;
    const p = id && state.products.find(x => x.sellerId === id);
    const s = id && (state.sellers || []).find(x => x.id === id);
    if (!id || (!p && !s)) { el.hidden = true; el.innerHTML = ''; return; }
    const name = s ? L(s.name) : L(p.seller), place = s ? L(s.place) : L(p.place), shg = (s ? s.type : p.type) === 'shg';
    const n = state.products.filter(x => x.sellerId === id).length;
    el.hidden = false;
    el.innerHTML = `<img src="${shg ? AVATARS.shg : AVATARS.mom}" alt="">
      <div class="stack-sm"><b class="h3">${esc(t('sellerShopTitle', { name }))}</b>
        <span class="small muted">${esc(shg ? t('typeShg') : t('typeInd'))} · ${esc(place)}${s && shg && s.members ? ' · ' + esc(t('members', { n: fmtNum(s.members) })) : ''} · ${esc(t(n === 1 ? 'listings_one' : 'listings', { n: fmtNum(n) }))}</span></div>
      <button type="button" class="btn btn-ghost btn-sm" data-allsellers>${icon('store')}<span>${esc(t('showAllShop'))}</span></button>`;
  }
  function setSellerFilter(id) {
    state.filters.sellerId = id || null;
    try { const u = new URL(location.href); if (id) u.searchParams.set('seller', id); else u.searchParams.delete('seller'); history.replaceState(null, '', u); } catch (e) { /* file:// */ }
    renderSellerBanner(); renderGrid();
  }
  function renderGrid() {
    const list = filtered();
    $('#grid').innerHTML = list.length ? list.map(card).join('') : `<div class="empty card" style="grid-column:1/-1"><b>${esc(t('noResults'))}</b><p class="small">${esc(t('noResultsSub'))}</p></div>`;
  }
  function renderReco() {
    const prof = profile(), row = $('#recoRow');
    let items, title, why;
    if (prof.length && state.reco) {
      items = state.reco.forProfile(prof, 6);
      title = t('recoTitle');
      const names = prof.slice(0, 2).map(x => L(state.products.find(p => p.id === x.id)?.name)).filter(Boolean);
      why = t('recoWhy', { items: names.join(', ') });
    } else {
      items = state.products.slice().sort((a, b) => b.pop - a.pop).slice(0, 6).map(p => ({ p, score: p.pop, pop: true }));
      title = t('recoTitlePop'); why = t('recoWhyPop');
    }
    $('#recoTitle').textContent = title;
    $('#recoWhy').textContent = why;
    row.innerHTML = items.map(x => `<button type="button" class="reco-card" data-open="${esc(x.p.id)}">
      <span class="art">${ART.svg(x.p)}</span>
      <span class="stack-sm" style="gap:3px"><b class="small" style="line-height:1.2">${esc(L(x.p.name))}</b>
      <span class="row" style="gap:6px"><span class="price" style="font-size:15px">${inr(x.p.price)}</span>
      ${x.pop ? `<span class="tiny muted">${esc(t('popular'))} ${pct(x.score)}</span>` : `<span class="match">${esc(t('mlMatch'))} ${pct(x.score)}</span>`}</span>
      <span class="meter"><i style="width:${Math.round(x.score * 100)}%"></i></span></span></button>`).join('');
  }
  function renderHeat() {
    if (!state.reco) return;
    const M = state.reco.matrix(), n = M.length, ps = state.products;
    const heat = $('#heat');
    heat.style.gridTemplateColumns = `110px repeat(${n}, minmax(0, 1fr))`;
    let h = '<span></span>' + ps.map((p, j) => `<span class="lab" title="${esc(L(p.name))}" style="writing-mode:vertical-rl;transform:rotate(180deg);height:70px">${esc(L(p.name))}</span>`).join('');
    for (let i = 0; i < n; i++) {
      h += `<span class="lab" title="${esc(L(ps[i].name))}">${esc(L(ps[i].name))}</span>`;
      for (let j = 0; j < n; j++) {
        const v = i === j ? 1 : M[i][j];
        const a = i === j ? 1 : Math.pow(v, 1.3);
        h += `<span class="cell" title="${esc(L(ps[i].name))} × ${esc(L(ps[j].name))}: ${pct(v)}" style="background:${i === j ? '#0F2A31' : `rgba(27,67,77,${(0.06 + 0.94 * a).toFixed(3)})`}"></span>`;
      }
    }
    heat.innerHTML = h;
    $('#statBaskets').textContent = t('nBaskets', { n: fmtNum(state.reco.baskets.length) });
    $('#statItems').textContent = t('nProducts', { n: fmtNum(n) });
  }
  function renderStats() {
    if (!state.reco) return;
    $('#statBaskets').textContent = t('nBaskets', { n: fmtNum(state.reco.baskets.length) });
    $('#statItems').textContent = t('nProducts', { n: fmtNum(state.products.length) });
  }
  function renderAll() { renderChips(); renderSellerBanner(); renderGrid(); renderReco(); renderStats(); if ($('#modelInside').open) renderHeat(); renderBadge(); }
  function renderBadge() {
    const n = [...state.cart.values()].reduce((a, b) => a + b, 0);
    $('#cartCount').textContent = n ? fmtNum(n) : '';
  }

  /* ---------- product modal ---------- */
  let lastFocus = null, modalQty = 1, modalId = null;
  function featureChips(p) {
    const v = RECO.vector(p), W = RECO.W;
    const parts = [
      [t('fvCat'), catName(p.cat)],
      [t('fvPrice'), fmtNum(v[4] / W.price, 2)],
      [t('fvPerish'), fmtNum(p.perish, 2)],
      [t('fvShg'), p.type === 'shg' ? '1' : '0'],
      [t('fvPop'), fmtNum(p.pop, 2)],
      [t('fvFest'), fmtNum(p.fest, 2)]
    ];
    return parts.map(([k, val]) => `<span>${esc(k)}: <b>${esc(val)}</b></span>`).join('');
  }
  function openProduct(id) {
    const p = state.products.find(x => x.id === id);
    if (!p) return;
    modalId = id; modalQty = 1;
    lastFocus = document.activeElement;
    state.views = [id, ...state.views.filter(x => x !== id)].slice(0, 8);
    state.metrics.views++;
    API.track('view', id);
    BUS.emit('metrics');
    const sims = state.reco ? state.reco.similar(id, 4) : [];
    const link = shopUrl('?p=' + encodeURIComponent(p.id));
    const askText = t('askProduct', { name: L(p.name), price: inr(p.price), unit: L(p.unit), seller: L(p.seller), place: L(p.place), lead: leadText(p) }) + (link ? '\n' + link : '');
    const m = $('#pmodal');
    m.innerHTML = `<button type="button" class="close-x" data-close aria-label="${esc(t('close'))}">${icon('x')}</button>
      <div class="modal-in">
        <div class="art" style="background:${ART.BG[p.cat] || '#EEF2E6'}">${ART.svg(p, '', 'meet')}</div>
        <div class="modal-body">
          <div class="row" style="gap:6px">${typeTag(p)}<span class="pill"><span class="status-dot" style="background:${CAT_COLORS[p.cat]}"></span>${esc(catName(p.cat))}</span>${stockTag(p)}</div>
          ${leadTag(p, 'big')}
          <h2 class="h2" id="pmTitle">${esc(L(p.name))}</h2>
          <div><span class="price" style="font-size:26px">${inr(p.price)}</span> <span class="unit">/ ${esc(L(p.unit))}</span></div>
          <p>${esc(L(p.desc))}</p>
          <div class="seller"><img src="${avatarFor(p)}" alt=""><span><b>${esc(L(p.seller))}</b> · ${esc(L(p.place))}</span>${p.sellerId ? `<button type="button" class="link-btn" data-sellershop="${esc(p.sellerId)}">${esc(t('seeShop'))}</button>` : ''}</div>
          <p class="tiny muted modal-values">${icon('rupee')}<span>${esc(t('valUpi'))}</span> · ${icon('truck')}<span>${esc(t('valLocal'))}</span></p>
          <div class="row">
            <div class="qty"><button type="button" data-q="-1" aria-label="${esc(t('less'))}">${icon('minus')}</button><output id="mQty">${fmtNum(1)}</output><button type="button" data-q="1" aria-label="${esc(t('more'))}">${icon('plus')}</button></div>
            <button type="button" class="btn btn-primary" data-madd${stockOf(p) === 0 ? ' disabled' : ''}>${icon('cart')}<span>${esc(t('addToCart'))}</span></button>
            <a class="btn btn-wa" href="${esc(waLink(askText))}" target="_blank" rel="noopener" data-share>${icon('wa')}<span>${esc(t('askWa'))}</span></a>
          </div>
          <div class="stack-sm">
            <div class="spread"><b class="h3">${esc(t('fbtTitle'))}</b><span class="pill pill-lime">${icon('cpu')}${esc(t('cosine'))}</span></div>
            <div class="fbt">${sims.map(x => `<div class="fbt-item">
              <button type="button" class="art" data-open="${esc(x.p.id)}" style="border:0;padding:0">${ART.svg(x.p)}</button>
              <div><button type="button" class="title" data-open="${esc(x.p.id)}" style="background:none;border:0;padding:0;text-align:left;font-weight:700;color:var(--teal-900)">${esc(L(x.p.name))}</button>
                <div class="why">${x.alpha < 0.05 ? esc(t('whyCold', { c: pct(x.content) })) : esc(t('whyHybrid', { cf: pct(x.cf), c: pct(x.content), n: fmtNum(x.together) }))}</div></div>
              <div style="text-align:right"><div class="match">${pct(x.score)}</div><button type="button" class="btn btn-ghost btn-sm" data-add="${esc(x.p.id)}" style="margin-top:4px">${icon('plus')}<span class="sr-only">${esc(t('add'))}</span></button></div>
            </div>`).join('')}</div>
          </div>
          <details><summary class="small" style="cursor:pointer;font-weight:700;color:var(--teal-700)">${esc(t('fvTitle'))}</summary><div class="vec" style="margin-top:8px">${featureChips(p)}</div></details>
        </div>
      </div>`;
    showOverlay(m);
    renderReco();
    m.querySelector('[data-close]').focus();
  }
  function showOverlay(el) {
    $('#scrim').hidden = false;
    requestAnimationFrame(() => $('#scrim').classList.add('on'));
    el.hidden = false;
    if (el.id === 'drawer') requestAnimationFrame(() => el.classList.add('on'));
    document.body.style.overflow = 'hidden';
  }
  function closeOverlays() {
    $('#scrim').classList.remove('on');
    $('#drawer').classList.remove('on');
    setTimeout(() => { $('#scrim').hidden = true; $('#drawer').hidden = true; }, 220);
    $$('.modal').forEach(m => { m.hidden = true; });
    document.body.style.overflow = '';
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }

  function addToCart(id, qty = 1, silent = false) {
    const p = state.products.find(x => x.id === id);
    if (!p) return;
    const have = state.cart.get(id) || 0, room = Math.min(20, stockOf(p)) - have;
    if (room <= 0) { toast(stockOf(p) === 0 ? t('soldOut') : t('stockLeft', { n: fmtNum(Math.min(20, stockOf(p))) }), 'alert', 2600); return; }
    state.cart.set(id, have + Math.min(qty, room));
    state.metrics.adds++;
    API.track('cart_add', id);
    renderBadge(); renderReco();
    BUS.emit('cart'); BUS.emit('metrics');
    if (!silent) toast(t('added', { name: L(p.name) }), 'cart', 2400);
  }

  function bind() {
    $('#catChips').addEventListener('click', e => { const b = e.target.closest('[data-cat]'); if (b) { state.filters.cat = b.dataset.cat; renderChips(); renderGrid(); } });
    $('#sellerChips').addEventListener('click', e => { const b = e.target.closest('[data-seller]'); if (b) { state.filters.seller = b.dataset.seller; renderChips(); renderGrid(); } });
    $('#sort').addEventListener('change', e => { state.filters.sort = e.target.value; renderGrid(); });
    $('#sellerBanner').addEventListener('click', e => { if (e.target.closest('[data-allsellers]')) setSellerFilter(null); });
    let qt; $('#q').addEventListener('input', e => { clearTimeout(qt); qt = setTimeout(() => { state.filters.q = e.target.value; renderGrid(); }, 120); });
    document.addEventListener('click', e => {
      const add = e.target.closest('[data-add]');
      if (add) { addToCart(add.dataset.add); return; }
      const open = e.target.closest('[data-open]');
      if (open && !open.closest('#chat')) { openProduct(open.dataset.open); return; }
    });
    $('#pmodal').addEventListener('click', e => {
      if (e.target.closest('[data-close]')) { closeOverlays(); return; }
      const q = e.target.closest('[data-q]');
      if (q) {
        const p = state.products.find(x => x.id === modalId);
        modalQty = clamp(modalQty + Number(q.dataset.q), 1, Math.max(1, Math.min(20, p ? stockOf(p) : 20)));
        $('#mQty').textContent = fmtNum(modalQty); return;
      }
      if (e.target.closest('[data-madd]')) { addToCart(modalId, modalQty); closeOverlays(); return; }
      if (e.target.closest('[data-share]')) {
        const p = state.products.find(x => x.id === modalId);
        state.metrics.shares++; API.track('share', modalId); BUS.emit('metrics');
        PHONE.post({ dir: 'out', product: modalId, text: () => t('waShareMsg') });
        PHONE.post({ dir: 'in', text: () => t('waShareReply', { seller: L(p.seller) }) });
        return;
      }
      const shopBtn = e.target.closest('[data-sellershop]');
      if (shopBtn) { closeOverlays(); setSellerFilter(shopBtn.dataset.sellershop); $('#sellerBanner').scrollIntoView({ behavior: 'smooth', block: 'center' }); }
    });
    $('#scrim').addEventListener('click', closeOverlays);
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('#scrim').hidden) closeOverlays(); });
    $('#modelInside').addEventListener('toggle', () => { if ($('#modelInside').open) renderHeat(); });
    BUS.on('lang', renderAll);
    BUS.on('catalog', () => { renderAll(); });
  }
  return { renderAll, renderGrid, renderReco, renderBadge, openProduct, addToCart, bind, showOverlay, closeOverlays, avatarFor, profile, stockOf, setSellerFilter };
})();
