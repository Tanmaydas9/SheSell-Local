/* ------------------------------------------------------------------
   Cart drawer, UPI QR, WhatsApp checkout and the 4-stage tracker.
   Online: step 1 places the order on the server (prices, stock and fees
   are checked there); step 2 shows the UPI QR for that order and sends
   it to the official SheSell WhatsApp number. "I've paid" is only a
   claim: the order shows "UPI claimed — pending verification" until the
   admin sees the money in the bank app and marks it paid.
   Offline demo (no server): simulated as before.
------------------------------------------------------------------- */
const CHECKOUT = (() => {
  const STAGES = [
    { key: 'stConfirmed', icon: 'check' },
    { key: 'stPacked', icon: 'package' },
    { key: 'stOut', icon: 'truck' },
    { key: 'stDelivered', icon: 'home' }
  ];
  const STATUS = ['confirmed', 'packed', 'out', 'delivered'];
  const PAY = { pending: ['payPending', 'pend', 'rupee'], claimed: ['payClaimed', 'claim', 'clock'], paid: ['payPaid', 'paid', 'check'], refunded: ['payRefunded', 'ref', 'refresh'] };
  let orderSeq = 1041, busy = false, placedId = null;   // placedId: the order shown in step 2 of the drawer
  Object.assign(state.buyer, { phone: '' }, store.get('buyer', {}));

  const lines = () => [...state.cart.entries()].map(([id, q]) => ({ p: state.products.find(x => x.id === id), q })).filter(x => x.p);
  function totals() {
    const sub = lines().reduce((s, x) => s + x.p.price * x.q, 0);
    const fee = state.delivery === 'delivery' && sub > 0 && sub < CONFIG.freeDeliveryAbove ? CONFIG.deliveryFee : 0;
    return { sub, fee, total: sub + fee };
  }
  function orderText(id, ls, tot, buyer = state.buyer, mode = state.delivery) {
    const items = ls.map(x => `• ${L(x.p.name)} × ${fmtNum(x.q)}: ${inr(x.p.price * x.q)}`).join('\n');
    return t('waOrder', {
      id, items, sub: inr(tot.sub), fee: tot.fee ? inr(tot.fee) : t('free'), total: inr(tot.total),
      mode: mode === 'delivery' ? t('optDelivery') : t('optPickup'), name: buyer.name || t('buyerAnon'), place: buyer.place || t('placeAsk')
    });
  }
  const isDemoUpi = () => /demo/i.test(CONFIG.upiId);
  const waNote = () => (waIsPlaceholder() ? `<span class="demo-note">${esc(t('waPlaceholderNote'))}</span>` : '');
  const values = () => `<div class="co-values">${icon('rupee')}<span><b>${esc(t('valUpi'))}</b> ${esc(t('coValues'))}</span></div>`;
  const payPill = (o) => { const p = PAY[o.payment] || PAY.pending; return `<span class="pay-pill ${p[1]}">${icon(p[2])}${esc(t(p[0]))}</span>`; };

  function render() {
    const body = $('#drawerBody');
    const ls = lines();
    // step 2 stays until the buyer closes it or starts a new basket
    if (placedId && !ls.length) { const o = state.orders.find(x => x.id === placedId); if (o) { renderPlaced(o); return; } }
    placedId = null;
    $('#drawerTitle').textContent = t('cartTitle');
    if (!ls.length) {
      body.innerHTML = `<div class="empty card"><b>${esc(t('cartEmpty'))}</b><p class="small" style="margin:6px 0 12px">${esc(t('cartEmptySub'))}</p><button type="button" class="btn btn-primary" data-goshop>${icon('store')}<span>${esc(t('browse'))}</span></button></div>`;
      return;
    }
    const tot = totals(), nextId = 'SSL-' + (orderSeq + 1), online = API.online;
    const suggestions = state.reco ? state.reco.forProfile(ls.map(x => ({ id: x.p.id, w: 1 })), 3) : [];
    const closed = online && state.serverSettings && !state.serverSettings.storeOpen;
    body.innerHTML = `
      ${values()}
      <div class="stack-sm">${ls.map(x => `<div class="line-item">
        <span class="art">${ART.svg(x.p)}</span>
        <div><b class="small">${esc(L(x.p.name))}</b><div class="tiny muted">${inr(x.p.price)} · ${esc(L(x.p.unit))}</div>${leadTag(x.p, 'sm')}
          <div class="qty" style="margin-top:6px"><button type="button" data-cq="${esc(x.p.id)}" data-d="-1" aria-label="${esc(t('less'))}">${icon(x.q === 1 ? 'trash' : 'minus')}</button><output>${fmtNum(x.q)}</output><button type="button" data-cq="${esc(x.p.id)}" data-d="1" aria-label="${esc(t('more'))}">${icon('plus')}</button></div></div>
        <b class="num">${inr(x.p.price * x.q)}</b></div>`).join('')}</div>
      ${suggestions.length ? `<div class="card" style="padding:14px"><div class="spread" style="margin-bottom:8px"><b class="small">${esc(t('completeBasket'))}</b><span class="pill pill-lime">${icon('cpu')}${esc(t('mlMatch'))}</span></div>
        <div class="stack-sm">${suggestions.map(x => `<div class="fbt-item" style="grid-template-columns:52px minmax(0,1fr) auto;padding:6px"><span class="art" style="width:52px;height:40px">${ART.svg(x.p)}</span><div><b class="tiny">${esc(L(x.p.name))}</b><div class="tiny muted">${inr(x.p.price)} · <span class="match">${pct(x.score)}</span></div></div><button type="button" class="btn btn-ghost btn-sm" data-add="${esc(x.p.id)}" aria-label="${esc(t('add'))}">${icon('plus')}</button></div>`).join('')}</div></div>` : ''}
      <div class="field"><span class="label">${icon('truck')}${esc(t('deliveryTitle'))}</span>
        <div class="seg" id="delSeg"><button type="button" data-del="delivery" aria-pressed="${state.delivery === 'delivery'}">${esc(t('optDelivery'))}</button><button type="button" data-del="pickup" aria-pressed="${state.delivery === 'pickup'}">${esc(t('optPickup'))}</button></div>
        <span class="tiny muted">${esc(t(state.delivery === 'delivery' ? 'deliveryNote' : 'pickupNote', { fee: inr(CONFIG.deliveryFee), free: inr(CONFIG.freeDeliveryAbove) }))}</span></div>
      <div class="fields" style="grid-template-columns:repeat(auto-fit,minmax(150px,1fr))">
        <div class="field"><label class="label" for="bName">${esc(t('yourName'))}</label><input class="input" id="bName" autocomplete="name" maxlength="60" value="${esc(state.buyer.name)}"></div>
        ${online ? `<div class="field"><label class="label" for="bPhone">${esc(t('yourPhone'))}</label><input class="input" id="bPhone" type="tel" inputmode="numeric" autocomplete="tel" maxlength="14" value="${esc(state.buyer.phone)}"></div>` : ''}
        <div class="field"><label class="label" for="bPlace">${esc(t('yourPlace'))}</label><input class="input" id="bPlace" maxlength="120" value="${esc(state.buyer.place)}"></div>
      </div>
      <div class="totals card" style="padding:14px">
        <div><span>${esc(t('subtotal'))}</span><b class="num">${inr(tot.sub)}</b></div>
        <div><span>${esc(t('deliveryFee'))}</span><b class="num">${tot.fee ? inr(tot.fee) : esc(t('free'))}</b></div>
        <div class="grand"><span>${esc(t('total'))}</span><span class="num">${inr(tot.total)}</span></div>
      </div>
      ${online ? `
      ${closed ? `<div class="warn-box">${icon('alert')}<span>${esc(t('shopPaused'))}</span></div>` : ''}
      <p class="form-err" id="coErr" role="alert" hidden></p>
      <button type="button" class="btn btn-teal btn-block" id="placeBtn"${closed ? ' disabled' : ''}>${icon('check')}<span>${esc(t('placeOrder'))}</span></button>
      <ol class="co-next"><li>${icon('qr')}<span>${esc(t('coNext1'))}</span></li><li>${icon('wa')}<span>${esc(t('coNext2'))}</span></li></ol>` : `
      <div class="qr-box">
        <b class="h3">${esc(t('scanPay'))}</b>
        <canvas id="qr" width="200" height="200" aria-label="UPI QR" data-i18n-aria="upiQr"></canvas>
        <b class="num" style="font-size:22px;color:var(--teal-900)">${inr(tot.total)}</b>
        <span class="tiny muted">${esc(t('payTo', { name: CONFIG.upiName, id: CONFIG.upiId }))}</span>
        ${isDemoUpi() ? `<span class="demo-note">${esc(t('demoUpi'))}</span>` : ''}
        <a class="btn btn-ghost btn-sm" href="${esc(upiUri(tot.total, 'SheSell ' + nextId))}">${icon('rupee')}<span>${esc(t('payApp'))}</span></a>
      </div>
      <a class="btn btn-wa btn-block" id="waOrder" href="${esc(waLink(orderText(nextId, ls, tot)))}" target="_blank" rel="noopener">${icon('wa')}<span>${esc(t('orderWa'))}</span></a>
      ${waNote()}
      <button type="button" class="btn btn-teal btn-block" id="paidBtn">${icon('check')}<span>${esc(t('paidPlace'))}</span></button>
      <p class="tiny muted">${esc(t('checkoutNote'))}</p>`}`;
    $('#drawer').querySelectorAll('[data-i18n-aria]').forEach(el => el.setAttribute('aria-label', t(el.dataset.i18nAria)));
    if (!online) { try { QR.draw($('#qr'), QR.encode(upiUri(tot.total, 'SheSell ' + nextId)), 200); } catch (e) { console.error(e); } }
  }

  /* step 2 of the online checkout: pay this order by UPI, then confirm it on WhatsApp */
  function renderPlaced(o) {
    const body = $('#drawerBody'), ls = o.items.map(i => ({ p: { name: i.name, price: i.price }, q: i.q }));
    $('#drawerTitle').textContent = t('orderNo', { id: o.id });
    const waText = orderText(o.id, ls, { sub: o.sub, fee: o.fee, total: o.total }, state.buyer, o.mode);
    body.innerHTML = `
      <div class="co-placed">${icon('check')}<div class="stack-sm"><b class="h3">${esc(t('coPlacedTitle', { id: o.id }))}</b><span class="small">${esc(t('coPlacedSub'))}</span></div></div>
      <section class="co-step">
        <b class="h3"><span class="n">1</span>${esc(t('coStep1', { total: inr(o.total) }))}</b>
        ${o.payment === 'pending' ? `<div class="pay-box">
          <canvas data-qr="${esc(o.id)}" width="160" height="160" aria-label="UPI QR" data-i18n-aria="upiQr"></canvas>
          <div class="stack-sm">
            <span class="tiny muted">${esc(t('payTo', { name: CONFIG.upiName, id: CONFIG.upiId }))}</span>
            ${isDemoUpi() ? `<span class="demo-note">${esc(t('demoUpi'))}</span>` : ''}
            <div class="row" style="gap:8px"><a class="btn btn-ghost btn-sm" href="${esc(upiUri(o.total, 'SheSell ' + o.id))}">${icon('rupee')}<span>${esc(t('payApp'))}</span></a>
            <button type="button" class="btn btn-teal btn-sm" data-claim="${esc(o.id)}">${icon('check')}<span>${esc(t('paidClaim'))}</span></button></div>
          </div></div>` : `<div class="stack-sm">${payPill(o)}${o.payment === 'claimed' ? `<span class="tiny muted">${esc(t('claimNote'))}</span>` : ''}</div>`}
      </section>
      <section class="co-step">
        <b class="h3"><span class="n">2</span>${esc(t('coStep2'))}</b>
        <a class="btn btn-wa btn-block" href="${esc(waLink(waText))}" target="_blank" rel="noopener" data-sendwa>${icon('wa')}<span>${esc(t('coWaBtn'))}</span></a>
        <span class="tiny muted">${esc(t('coWaNote'))}</span>${waNote()}
      </section>
      <button type="button" class="btn btn-ghost btn-block" data-done>${icon('arrow')}<span>${esc(t('coDone'))}</span></button>`;
    $('#drawer').querySelectorAll('[data-i18n-aria]').forEach(el => el.setAttribute('aria-label', t(el.dataset.i18nAria)));
    const c = body.querySelector('canvas[data-qr]');
    if (c) { try { QR.draw(c, QR.encode(upiUri(o.total, 'SheSell ' + o.id)), 160); } catch (e) { console.error(e); } }
  }
  function open() { render(); SHOP.showOverlay($('#drawer')); setTimeout(() => $('#drawerClose').focus(), 50); }

  /* ---------- offline demo order (simulated tracker) ---------- */
  function placeOrder(via) {
    const ls = lines();
    if (!ls.length) return;
    const tot = totals(), id = 'SSL-' + (++orderSeq);
    const order = { id, items: ls.map(x => ({ id: x.p.id, q: x.q, name: x.p.name, price: x.p.price })), total: tot.total, stage: 0, at: Date.now(), via, timer: null };
    state.orders.unshift(order);
    const buyer = { name: state.buyer.name, place: state.buyer.place }, mode = state.delivery;
    PHONE.post({ dir: 'out', text: () => orderText(id, ls, tot, buyer, mode) });
    PHONE.post({ dir: 'in', text: () => t('waConfirmed', { id }) });
    state.reco.addBasket(ls.map(x => x.p.id));
    state.cart.clear();
    SHOP.renderBadge(); SHOP.renderReco();
    SHOP.closeOverlays();
    renderOrders();
    BUS.emit('orders');
    toast(t('orderPlaced', { id, n: fmtNum(state.reco.baskets.length) }), 'cpu', 5200);
    schedule(order);
    $('#ordersCard').scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
  function schedule(order) {
    clearTimeout(order.timer);
    if (order.stage >= 3) return;
    order.timer = setTimeout(() => advance(order), 7000);
  }
  function advance(order) {
    if (order.stage >= 3) return;
    order.stage++;
    const key = ['', 'waPacked', 'waOut', 'waDelivered'][order.stage];
    PHONE.post({ dir: 'in', text: () => t(key, { id: order.id }) });
    renderOrders(); BUS.emit('orders');
    schedule(order);
  }

  /* ---------- live order (server) ---------- */
  const fromServer = (o) => ({
    id: o.id, live: true, status: o.status, payment: o.payment, verification: o.verification || null, mode: o.mode,
    stage: o.status === 'cancelled' ? -1 : STATUS.indexOf(o.status),
    items: o.items.map(i => ({ id: i.id, q: i.q, name: i.name, price: i.price })),
    total: o.total, sub: o.subtotal, fee: o.fee, at: o.createdAt
  });

  async function placeOrderOnline() {
    if (busy) return;
    const ls = lines();
    if (!ls.length) return;
    const showErr = (msg, focusSel) => { const el = $('#coErr'); if (!el) return; el.textContent = msg; el.hidden = false; if (focusSel && $(focusSel)) $(focusSel).focus(); };
    const name = state.buyer.name.trim(), place = state.buyer.place.trim();
    const digits = String(state.buyer.phone || '').replace(/\D/g, '').replace(/^(91|0)(?=\d{10}$)/, '');
    if (name.length < 2) return showErr(t('errName'), '#bName');
    if (!/^[6-9]\d{9}$/.test(digits)) return showErr(t('errPhone'), '#bPhone');
    if (state.delivery === 'delivery' && place.length < 3) return showErr(t('errPlace'), '#bPlace');
    busy = true;
    const btn = $('#placeBtn');
    btn.disabled = true; btn.innerHTML = `${icon('clock')}<span>${esc(t('placing'))}</span>`;
    const buyer = { name, place }, mode = state.delivery;
    try {
      const res = await API.call('POST', '/orders', { customer: { name, phone: digits, place }, mode, lang: state.lang, items: ls.map(x => ({ id: x.p.id, q: x.q })) });
      const o = res.order, order = fromServer(o);
      API.remember(o.id, o.token);
      state.orders = [order, ...state.orders.filter(x => x.id !== o.id)];
      const textItems = order.items.map(i => ({ p: { name: i.name, price: i.price }, q: i.q }));
      const tot = { sub: o.subtotal, fee: o.fee, total: o.total };
      PHONE.post({ dir: 'out', text: () => orderText(o.id, textItems, tot, buyer, mode) });
      PHONE.post({ dir: 'in', text: () => t('waConfirmed', { id: o.id }) });
      state.reco.addBasket(order.items.map(i => i.id));
      state.cart.clear();
      placedId = o.id;
      SHOP.renderBadge(); SHOP.renderReco();
      renderOrders(); render();
      BUS.emit('orders');
      toast(t('orderPlaced', { id: o.id, n: fmtNum(state.reco.baskets.length) }), 'cpu', 5200);
      $('#drawerBody').scrollTop = 0;
    } catch (e) {
      const pid = e.info && e.info.productId;
      if (pid && (e.code === 'out_of_stock' || e.code === 'unavailable')) {
        const p = state.products.find(x => x.id === pid), left = e.code === 'out_of_stock' ? Math.max(0, Number(e.info.available) || 0) : 0;
        if (p && e.code === 'out_of_stock') p.stock = left;
        if (left > 0) state.cart.set(pid, Math.min(state.cart.get(pid) || 0, left)); else state.cart.delete(pid);
        SHOP.renderBadge(); render();
      }
      showErr(errText(e));
    } finally {
      busy = false;
      const b = $('#placeBtn');
      if (b) { b.disabled = !!(state.serverSettings && !state.serverSettings.storeOpen); b.innerHTML = `${icon('check')}<span>${esc(t('placeOrder'))}</span>`; }
    }
  }

  async function loadTracked() {
    if (!API.online || !API.tracked.length) return;
    try {
      const res = await API.call('POST', '/orders/track', { orders: API.tracked });
      const live = res.orders.map(fromServer).sort((a, b) => b.at - a.at);
      state.orders = live.concat(state.orders.filter(o => !o.live && !live.some(x => x.id === o.id)));
      renderOrders(); BUS.emit('orders');
    } catch (e) { /* keep what we have */ }
  }

  function applyServerOrder(o) {
    const i = state.orders.findIndex(x => x.id === o.id);
    if (i < 0) return;
    const prev = state.orders[i], next = fromServer(o);
    state.orders[i] = next;
    if (prev.status !== next.status) {
      const key = { packed: 'waPacked', out: 'waOut', delivered: 'waDelivered', cancelled: 'waCancelled' }[next.status];
      if (key) PHONE.post({ dir: 'in', text: () => t(key, { id: o.id }) });
    }
    if (prev.payment !== 'paid' && next.payment === 'paid') PHONE.post({ dir: 'in', text: () => t('waPaidBuyer', { id: o.id }) });
    renderOrders(); BUS.emit('orders');
    if (placedId === o.id && !$('#drawer').hidden) render();
  }

  async function claim(id) {
    const token = API.tokenFor(id), o = state.orders.find(x => x.id === id);
    if (!token || !o) return;
    try {
      const res = await API.call('POST', '/orders/' + encodeURIComponent(id) + '/claim', { token });
      applyServerOrder(res.order);
      PHONE.post({ dir: 'out', text: () => t('waClaimed', { id, total: inr(o.total) }) });
      PHONE.post({ dir: 'in', text: () => t('waClaimedReply') });
      toast(t('claimToast'), 'clock', 4200);
    } catch (e) { toast(errText(e), 'alert', 4200); }
  }

  /* ---------- orders card ---------- */
  const tracker = (stage) => `<div class="tracker" role="list">${STAGES.map((s, i) => `<div role="listitem" class="tstep ${i < stage ? 'done' : i === stage ? (stage === 3 ? 'done' : 'now') : ''}"><span class="ball">${icon(s.icon)}</span><span>${esc(t(s.key))}</span></div>`).join('')}</div>`;
  const itemsLine = (o) => `<div class="tiny muted">${esc(o.items.map(i => L(i.name) + ' × ' + fmtNum(i.q)).join(', '))}</div>`;
  function demoOrder(o) {
    return `<div class="order">
      <div class="spread"><b>${esc(t('orderNo', { id: o.id }))}</b><span class="num"><b>${inr(o.total)}</b></span></div>
      ${itemsLine(o)}${tracker(o.stage)}
      ${o.stage < 3 ? `<div class="row" style="justify-content:flex-end"><button type="button" class="btn btn-ghost btn-sm" data-adv="${esc(o.id)}">${icon('arrow')}<span>${esc(t('nextUpdate'))}</span></button></div>` : ''}
    </div>`;
  }
  function liveOrder(o) {
    const cancelled = o.status === 'cancelled';
    const ls = o.items.map(i => ({ p: { name: i.name, price: i.price }, q: i.q }));
    return `<div class="order${cancelled ? ' cancelled' : ''}">
      <div class="spread"><b>${esc(t('orderNo', { id: o.id }))}</b><span class="num"><b>${inr(o.total)}</b></span></div>
      ${itemsLine(o)}
      ${cancelled ? `<div><span class="pill tag-out">${icon('x')}${esc(t('stCancelled'))}</span></div>` : tracker(o.stage)}
      <div class="stack-sm">${payPill(o)}${o.payment === 'claimed' && !cancelled ? `<span class="tiny muted">${esc(t('claimNote'))}</span>` : ''}</div>
      ${!cancelled && o.payment === 'pending' ? `<div class="pay-box">
        <canvas data-qr="${esc(o.id)}" width="148" height="148" aria-label="UPI QR" data-i18n-aria="upiQr"></canvas>
        <div class="stack-sm">
          <b>${esc(t('payNow', { total: inr(o.total) }))}</b>
          <span class="tiny muted">${esc(t('payTo', { name: CONFIG.upiName, id: CONFIG.upiId }))}</span>
          ${isDemoUpi() ? `<span class="demo-note">${esc(t('demoUpi'))}</span>` : ''}
          <div class="row" style="gap:8px"><a class="btn btn-ghost btn-sm" href="${esc(upiUri(o.total, 'SheSell ' + o.id))}">${icon('rupee')}<span>${esc(t('payApp'))}</span></a>
          <button type="button" class="btn btn-teal btn-sm" data-claim="${esc(o.id)}">${icon('check')}<span>${esc(t('paidClaim'))}</span></button></div>
        </div></div>` : ''}
      <div class="spread tiny" style="gap:10px;align-items:flex-start"><span class="muted">${o.status !== 'delivered' && !cancelled ? esc(t('liveTrack')) : ''}</span>
        <a class="link-wa" href="${esc(waLink(orderText(o.id, ls, { sub: o.sub, fee: o.fee, total: o.total }, state.buyer, o.mode)))}" target="_blank" rel="noopener">${icon('wa')}<span>${esc(t('msgUs'))}</span></a></div>
    </div>`;
  }
  function renderOrders() {
    const card = $('#ordersCard');
    card.hidden = !state.orders.length;
    $('#ordersList').innerHTML = state.orders.map(o => (o.live ? liveOrder(o) : demoOrder(o))).join('');
    $$('#ordersList [data-i18n-aria]').forEach(el => el.setAttribute('aria-label', t(el.dataset.i18nAria)));
    $$('#ordersList canvas[data-qr]').forEach(c => {
      const o = state.orders.find(x => x.id === c.dataset.qr);
      if (o) { try { QR.draw(c, QR.encode(upiUri(o.total, 'SheSell ' + o.id)), 148); } catch (e) { console.error(e); } }
    });
  }

  function bind() {
    $('#cartBtn').addEventListener('click', open);
    $('#drawerClose').addEventListener('click', () => { SHOP.closeOverlays(); placedId = null; });
    $('#drawerBody').addEventListener('click', e => {
      const q = e.target.closest('[data-cq]');
      if (q) {
        const id = q.dataset.cq, p = state.products.find(x => x.id === id);
        const cap = p ? Math.min(20, SHOP.stockOf(p)) : 20;
        const nq = Math.min(cap, (state.cart.get(id) || 0) + Number(q.dataset.d));
        if (nq <= 0) state.cart.delete(id); else state.cart.set(id, nq);
        SHOP.renderBadge(); SHOP.renderReco(); render(); return;
      }
      const d = e.target.closest('[data-del]');
      if (d) { state.delivery = d.dataset.del; render(); return; }
      if (e.target.closest('[data-goshop]')) { SHOP.closeOverlays(); return; }
      if (e.target.closest('[data-done]')) { placedId = null; SHOP.closeOverlays(); setTimeout(() => $('#ordersCard').scrollIntoView({ behavior: 'smooth', block: 'center' }), 240); return; }
      if (e.target.closest('#placeBtn')) { placeOrderOnline(); return; }
      if (e.target.closest('#paidBtn')) { placeOrder('upi'); return; }
      if (e.target.closest('#waOrder')) { setTimeout(() => placeOrder('whatsapp'), 60); return; }
      const c = e.target.closest('[data-claim]');
      if (c) { c.disabled = true; claim(c.dataset.claim); }
    });
    $('#drawerBody').addEventListener('input', e => {
      if (e.target.id === 'bName') state.buyer.name = e.target.value.slice(0, 60);
      if (e.target.id === 'bPlace') state.buyer.place = e.target.value.slice(0, 120);
      if (e.target.id === 'bPhone') state.buyer.phone = e.target.value.slice(0, 14);
      store.set('buyer', { name: state.buyer.name, place: state.buyer.place, phone: state.buyer.phone });
      if ($('#coErr')) $('#coErr').hidden = true;
      const ls = lines();
      if (ls.length && $('#waOrder')) $('#waOrder').href = waLink(orderText('SSL-' + (orderSeq + 1), ls, totals()));
    });
    $('#ordersList').addEventListener('click', e => {
      const b = e.target.closest('[data-adv]');
      if (b) { const o = state.orders.find(x => x.id === b.dataset.adv); if (o) { clearTimeout(o.timer); advance(o); } return; }
      const c = e.target.closest('[data-claim]');
      if (c) { c.disabled = true; claim(c.dataset.claim); }
    });
    $('#scrim').addEventListener('click', () => { placedId = null; });
    BUS.on('cart', () => { if (!$('#drawer').hidden) render(); });
    BUS.on('lang', () => { renderOrders(); if (!$('#drawer').hidden) render(); });
    BUS.on('settings', () => { renderOrders(); if (!$('#drawer').hidden) render(); });
  }
  return { open, bind, renderOrders, render, loadTracked, applyServerOrder };
})();
