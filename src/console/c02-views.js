/* ------------------------------------------------------------------
   SheSell Console views. Each view fetches what it needs, renders
   into #view, and patches itself when live events arrive.
------------------------------------------------------------------- */
const VIEWS = (() => {
  const FLOW = ['confirmed', 'packed', 'out', 'delivered'];
  const pageHead = (title, sub, actions = '') => `<div class="page-head"><div><h1 class="h1">${esc(title)}</h1>${sub ? `<p class="muted">${esc(sub)}</p>` : ''}</div>${actions ? `<div class="head-actions">${actions}</div>` : ''}</div>`;
  const chips = (id, list, current, counts = {}) => `<div class="chips" id="${id}" role="group">${list.map(f => `<button type="button" class="chip" data-f="${f}" aria-pressed="${current === f}">${esc(t(id + '_' + f))}${counts[f] ? ` <span class="cnt">${num(counts[f])}</span>` : ''}</button>`).join('')}</div>`;
  const field = (label, inner, hint = '') => `<label class="field"><span class="label">${esc(label)}</span>${inner}${hint ? `<small class="hint">${esc(hint)}</small>` : ''}</label>`;
  const compact = (v) => { try { return '₹' + new Intl.NumberFormat(loc(), { notation: 'compact', maximumFractionDigits: 1 }).format(v); } catch (e) { return inr(v); } };

  /* ======================= dashboard ======================= */
  let dashTimer = null;
  function niceMax(v) { const p = Math.pow(10, Math.floor(Math.log10(v))); for (const m of [1, 2, 2.5, 5, 10]) if (m * p >= v) return m * p; return 10 * p; }
  function barPath(x, y, w, h, r) { r = Math.min(r, h, w / 2); return h <= 0 ? '' : `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`; }
  function salesChart(series) {
    // drawn at the card's real width so labels stay readable on phones
    const W = Math.round(Math.min(680, Math.max(300, ($('#view').clientWidth || 640) * (window.innerWidth > 1000 ? 0.5 : 1) - 70))), H = 230, P = { l: 52, r: 10, t: 14, b: 28 };
    const max = niceMax(Math.max(100, ...series.map(d => d.revenue)));
    const iw = W - P.l - P.r, ih = H - P.t - P.b, n = series.length, slot = iw / n, bw = Math.max(8, Math.min(24, slot * 0.58));
    const y = (v) => P.t + ih - (v / max) * ih;
    const grid = [0, 0.5, 1].map(f => `<line class="gl" x1="${P.l}" x2="${W - P.r}" y1="${y(max * f).toFixed(1)}" y2="${y(max * f).toFixed(1)}"/><text class="yl" x="${P.l - 8}" y="${(y(max * f) + 4).toFixed(1)}">${esc(compact(max * f))}</text>`).join('');
    const bars = series.map((d, i) => {
      const x = P.l + i * slot + (slot - bw) / 2, h = d.revenue ? Math.max(2, ih * d.revenue / max) : 0;
      return `<g class="bar" data-i="${i}"><rect class="hit" x="${(P.l + i * slot).toFixed(1)}" y="${P.t}" width="${slot.toFixed(1)}" height="${ih}"/><path d="${barPath(x, P.t + ih - h, bw, h, 4)}"/></g>`;
    }).join('');
    const every = W < 420 ? 3 : 2;
    const labels = series.map((d, i) => ((n - 1 - i) % every === 0 ? `<text class="xl" x="${(P.l + i * slot + slot / 2).toFixed(1)}" y="${H - 8}">${esc(i === n - 1 ? t('today') : dateStr(d.day))}</text>` : '')).join('');
    const table = `<details class="as-table"><summary>${esc(t('showTable'))}</summary><table class="tbl"><thead><tr><th>${esc(t('day'))}</th><th class="n">${esc(t('ordersWord'))}</th><th class="n">${esc(t('salesWord'))}</th></tr></thead><tbody>${series.map(d => `<tr><td>${esc(dateStr(d.day, { weekday: 'short', day: 'numeric', month: 'short' }))}</td><td class="n">${num(d.orders)}</td><td class="n">${inr(d.revenue)}</td></tr>`).join('')}</tbody></table></details>`;
    return `<div class="chart" data-series='${esc(JSON.stringify(series))}'><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(t('chartAria'))}">${grid}<line class="axis" x1="${P.l}" x2="${W - P.r}" y1="${P.t + ih}" y2="${P.t + ih}"/>${bars}${labels}</svg><div class="tip" hidden></div></div>${table}`;
  }
  function chartHover(e) {
    const chart = e.target.closest('.chart'); if (!chart) return;
    const tip = chart.querySelector('.tip'), g = e.target.closest('.bar');
    chart.querySelectorAll('.bar.on').forEach(b => b.classList.remove('on'));
    if (!g) { tip.hidden = true; return; }
    g.classList.add('on');
    const d = JSON.parse(chart.dataset.series)[Number(g.dataset.i)];
    tip.innerHTML = `<b>${esc(dateStr(d.day, { weekday: 'short', day: 'numeric', month: 'short' }))}</b><span>${esc(inr(d.revenue))} · ${esc(t('nOrders', { n: num(d.orders) }))}</span>`;
    const r = chart.getBoundingClientRect(), gr = g.getBoundingClientRect();
    tip.hidden = false;
    tip.style.left = Math.min(r.width - tip.offsetWidth - 4, Math.max(4, gr.left - r.left + gr.width / 2 - tip.offsetWidth / 2)) + 'px';
    tip.style.top = '4px';
  }
  function catBars(rows) {
    const max = Math.max(1, ...rows.map(r => r.revenue));
    return `<div class="cbars">${rows.map(r => `<div class="cbar"><span class="cl"><i style="background:${CAT_COLORS[r.cat]}"></i>${esc(catName(r.cat))}</span><span class="ct"><i style="width:${(r.revenue / max * 100).toFixed(1)}%;background:${CAT_COLORS[r.cat]}"></i></span><b>${esc(inr(r.revenue))}</b></div>`).join('')}</div>`;
  }
  function tile([ic, label, value, sub, link, trend]) {
    const tag = link ? 'button' : 'div';
    return `<${tag} ${link ? `type="button" data-link="${link}"` : ''} class="kpi">${icon(ic)}<span class="kl">${esc(label)}</span><b class="kpv">${esc(value)}</b><small class="${trend === undefined || trend === null ? '' : trend >= 0 ? 'up' : 'down'}">${esc(sub)}</small></${tag}>`;
  }
  function attention(k) {
    const items = isAdmin() ? [
      [k.claimed, 'clock', 'atClaimed', 'payments:claimed'], [k.toPack, 'bell', 'atToPack', 'orders:confirmed'],
      [k.pendingListings, 'tag', 'atListings', 'products:pending'], [k.unverified, 'users', 'atSellers', 'sellers:unverified'], [k.lowStock, 'alert', 'atLowStock', 'products:active']
    ] : [[k.toPack, 'bell', 'atToPackMine', 'orders:confirmed'], [k.pendingListings, 'tag', 'atMyListings', 'products:pending'], [k.lowStock, 'alert', 'atLowStock', 'products:active']];
    const open = items.filter(x => x[0] > 0);
    return open.length ? `<div class="att">${open.map(([n, ic, key, link]) => `<button type="button" class="att-item" data-link="${link}">${icon(ic)}<span>${esc(t(key))}</span><b class="cnt">${num(n)}</b></button>`).join('')}</div>`
      : empty(t('allClear'), 'check');
  }
  function feedHtml() {
    return S.feed.length ? `<ul class="feed">${S.feed.map(f => `<li>${icon(f.icon)}<span>${esc(f.text)}</span><small>${esc(ago(f.at))}</small></li>`).join('')}</ul>` : `<p class="muted small">${esc(t('feedEmpty'))}</p>`;
  }
  function renderFeed() { const el = $('#feed'); if (el) el.innerHTML = feedHtml(); }
  function engagement(s) {
    if (!s) return '';
    const parts = [['eye', 'enViews', s.views], ['share', 'enShares', s.shares], ['cart', 'enAdds', s.adds], ['book', 'enLessons', s.lessons], ['cpu', 'enTrain', s.trainings], ['camera', 'enScans', s.scans]];
    return `<div class="eng">${parts.map(([ic, k, v]) => `<div>${icon(ic)}<b>${num(v)}</b><small>${esc(t(k))}</small></div>`).join('')}</div>`;
  }

  /* ---------- WhatsApp-first distribution: a seller's (or SHG's) shop link, ready to forward ---------- */
  async function shopMessage(seller, lang) {
    let items = [];
    try {
      const list = isAdmin() ? (await api('GET', '/products')).products.filter(p => p.sellerId === seller.id) : (S.data.products || (S.data.products = (await api('GET', '/my/products')).products));
      items = list.filter(p => !p.status || p.status === 'active').slice(0, 8);
    } catch (e) { /* message without the product lines */ }
    const name = lang === 'mr' && seller.nameMr ? seller.nameMr : seller.name, place = lang === 'mr' && seller.placeMr ? seller.placeMr : seller.place;
    const lines = items.map(p => `• ${(p.name && (p.name[lang] || p.name.en)) || ''} · ₹${new Intl.NumberFormat(lang === 'mr' ? 'mr-IN' : 'en-IN').format(p.price)}${p.lead ? ' · ' + (p.lead === 'custom' && p.leadText ? (p.leadText[lang] || p.leadText.en) : tl(lang, 'lead_' + p.lead)) : ''}`).join('\n');
    return tl(lang, seller.type === 'shg' ? 'shopMsgShg' : 'shopMsg', { name, place, items: lines || tl(lang, 'shopMsgSoon'), link: shopLink(seller.id) });
  }
  async function shareShop(seller) {
    seller = seller || (S.me && S.me.seller);
    if (!seller) return;
    const msg = await shopMessage(seller, S.lang);
    await dialog({
      title: t(seller.type === 'shg' ? 'shareTitleShg' : 'shareTitle', { name: seller.name }),
      body: `<p class="wa-preview">${esc(msg)}</p>${waHint()}<p class="muted small">${esc(t('shareHow'))}</p>
        <div class="btn-row"><a class="btn wa" href="${esc(waOfficial(msg))}" target="_blank" rel="noopener">${icon('wa')}<span>${esc(t('shareSend'))}</span></a>
        <button type="button" class="btn ghost" data-copy-msg>${icon('copy')}<span>${esc(t('copyMsg'))}</span></button>
        <a class="btn ghost" href="${esc(shopLink(seller.id))}" target="_blank" rel="noopener">${icon('external')}<span>${esc(t('openShopPage'))}</span></a></div>`,
      ok: t('done'), cancel: null,
      onOpen: (d) => d.querySelector('[data-copy-msg]').addEventListener('click', () => copyText(msg))
    });
  }
  function shareCard() {
    const s = S.me && S.me.seller;
    if (!s) return '';
    return `<section class="card share-card"><div class="share-ic">${icon('wa')}</div>
      <div class="share-t"><h2 class="h2">${esc(t(s.type === 'shg' ? 'shareCardTitleShg' : 'shareCardTitle'))}</h2><p class="muted small">${esc(t('shareCardSub'))}</p>
        <code class="share-link">${esc(shopLink(s.id))}</code></div>
      <div class="btn-row"><button type="button" class="btn wa" data-share-shop>${icon('wa')}<span>${esc(t('shareShopBtn'))}</span></button></div></section>`;
  }
  function setupBanner(issues) {
    if (!issues || !issues.length) return '';
    return `<div class="setup-banner">${icon('alert')}<div><b>${esc(t('setupTitle'))}</b><ul>${issues.map(k => `<li>${esc(t('setup_' + k))}</li>`).join('')}</ul></div>
      ${S.view !== 'settings' ? `<button type="button" class="btn teal sm" data-link="settings">${icon('settings')}<span>${esc(t('setupFix'))}</span></button>` : ''}</div>`;
  }

  async function dashboard() {
    const v = $('#view');
    if (!S.data.overview) v.innerHTML = skeleton();
    const o = await api('GET', '/my/overview');
    S.data.overview = o;
    setBadges(o);
    if (S.view !== 'dashboard') return;
    const k = o.kpis, admin = isAdmin();
    const trend = k.revenuePrev7d ? (k.revenue7d - k.revenuePrev7d) / k.revenuePrev7d : null;
    const trendText = trend === null ? t('kNoPrev') : t('kVsPrev', { p: (trend >= 0 ? '+' : '−') + num(Math.abs(trend) * 100) + '%' });
    const tiles = admin ? [
      ['package', t('kOrdersToday'), num(k.ordersToday), t('kInTransit', { n: num(k.inTransit) }), 'orders:active'],
      ['rupee', t('kRevenue7'), inr(k.revenue7d), trendText, null, trend],
      ['bell', t('kToPack'), num(k.toPack), t('kToPackSub'), 'orders:confirmed'],
      ['clock', t('kClaimed'), num(k.claimed), t('kUnpaid', { v: inr(k.unpaid) }), 'payments:claimed'],
      ['tag', t('kPending'), num(k.pendingListings), t('kLiveN', { n: num(k.products) }), 'products:pending'],
      ['users', t('kSellers'), num(k.sellers), t('kUnverified', { n: num(k.unverified) }), 'sellers:unverified']
    ] : [
      ['package', t('kOrdersToday'), num(k.ordersToday), t('kInTransit', { n: num(k.inTransit) }), 'orders:active'],
      ['rupee', t('kMySales7'), inr(k.revenue7d), trendText, null, trend],
      ['bell', t('kToPack'), num(k.toPack), t('kToPackMine'), 'orders:confirmed'],
      ['tag', t('kLive'), num(k.products), k.pendingListings ? t('kWaiting', { n: num(k.pendingListings) }) : t('kAllLive'), 'products:all'],
      ['alert', t('kLowStock'), num(k.lowStock), t('kLowStockSub'), 'products:active']
    ];
    const name = (S.me.seller ? (S.lang === 'mr' && S.me.seller.nameMr) || S.me.seller.name : S.me.name);
    v.innerHTML = pageHead(t('hello', { name }), dateStr(Date.now(), { weekday: 'long', day: 'numeric', month: 'long' }), `<a class="btn ghost" href="/" target="_blank" rel="noopener">${icon('store')}<span>${esc(t('openShop'))}</span></a>`) +
      (S.me.seller && !S.me.seller.verified ? `<div class="note warn">${icon('shield')}<span>${esc(t('pendingVerify'))}</span></div>` : '') +
      (admin ? setupBanner(o.setup) : shareCard()) +
      `<div class="kpis" data-n="${tiles.length}">${tiles.map(tile).join('')}</div>
      <div class="grid2">
        <section class="card"><div class="card-h"><h2 class="h2">${esc(t(admin ? 'salesTitle' : 'mySalesTitle'))}</h2><small class="muted">${esc(t('last14'))}</small></div>${salesChart(o.series)}</section>
        <section class="card"><div class="card-h"><h2 class="h2">${esc(t('attentionTitle'))}</h2></div>${attention(k)}</section>
      </div>
      <div class="grid2">
        <section class="card"><div class="card-h"><h2 class="h2">${esc(t('recentTitle'))}</h2><button type="button" class="link" data-link="orders:all">${esc(t('seeAll'))}</button></div>
          ${o.recent.length ? `<div class="rows compact">${o.recent.map(orderRow).join('')}</div>` : empty(t('noOrders'), 'package')}</section>
        <section class="card"><div class="card-h"><h2 class="h2">${esc(t('feedTitle'))}</h2><span class="muted small">${icon('wifi')}</span></div><div id="feed">${feedHtml()}</div></section>
      </div>
      <div class="grid2">
        <section class="card"><div class="card-h"><h2 class="h2">${esc(t('byCatTitle'))}</h2><small class="muted">${esc(t('last30'))}</small></div>${catBars(o.byCategory)}</section>
        <section class="card"><div class="card-h"><h2 class="h2">${esc(t('topTitle'))}</h2><small class="muted">${esc(t('last30'))}</small></div>
          ${o.top.length ? `<ol class="toplist">${o.top.map(p => `<li><span>${esc(S.lang === 'mr' && p.nameMr ? p.nameMr : p.name)}</span><small>${esc(t('soldN', { n: num(p.qty) }))}</small><b>${esc(inr(p.revenue))}</b></li>`).join('')}</ol>` : empty(t('noSales'), 'chart')}</section>
      </div>
      ${admin ? `<section class="card"><div class="card-h"><h2 class="h2">${esc(t('engageTitle'))}</h2><small class="muted">${esc(t('engageSub'))}</small></div><div id="eng">${engagement(o.engagement)}</div></section>` : ''}`;
  }
  function refreshDashboard() { clearTimeout(dashTimer); dashTimer = setTimeout(() => { if (S.view === 'dashboard') dashboard().catch(() => {}); else refreshBadges(); }, 700); }

  /* ======================= orders ======================= */
  const ORDER_F = () => ['active', 'confirmed', 'packed', 'out', 'delivered', 'cancelled', 'all'];
  const myShare = (o) => o.items.filter(i => i.mine).reduce((s, i) => s + i.price * i.q, 0);
  function orderRow(o) {
    const share = !(isAdmin() || o.allMine), amount = share ? myShare(o) : o.total;
    // right-hand block: status + amount, then the payment state (the long "UPI claimed — pending verification" gets its own line)
    return `<button type="button" class="row ord" data-order="${esc(o.id)}">
      <span class="c-id"><b>${esc(o.id)}</b><small>${esc(ago(o.createdAt))}</small>${o.demo ? `<small class="demo">${esc(t('demoTag'))}</small>` : ''}</span>
      <span class="c-cust"><b>${esc(o.customer.name)}</b><small>${esc(o.customer.place || t('mode_' + o.mode))}</small></span>
      <span class="c-items"><small>${esc(o.items.map(i => L(i.name) + ' ×' + num(i.q)).join(', '))}</small></span>
      <span class="c-end"><span class="c-top">${statusPill(o.status)}<b>${esc(inr(amount))}</b></span><span class="c-pay">${payPill(o.payment)}${share ? `<small>${esc(t('yourItems'))}</small>` : ''}</span></span>
    </button>`;
  }
  async function orders() {
    const v = $('#view');
    if (!ORDER_F().includes(S.filters.orders)) S.filters.orders = 'active';
    v.innerHTML = pageHead(t('nav_orders'), t(isAdmin() ? 'ordersSubAdmin' : 'ordersSubSeller'),
      `<label class="search">${icon('search')}<input class="input" id="oq" type="search" placeholder="${esc(t('searchOrders'))}" value="${esc(S.q.orders)}" aria-label="${esc(t('searchOrders'))}"></label>`) +
      chips('of', ORDER_F(), S.filters.orders) + `<div id="oList">${skeleton()}</div>`;
    await loadOrders();
  }
  async function loadOrders() {
    const f = S.filters.orders;
    const res = await api('GET', `/my/orders?status=${f === 'all' ? '' : f}&q=${encodeURIComponent(S.q.orders)}`);
    S.data.orders = res.orders;
    renderOrderList();
  }
  function renderOrderList() {
    const el = $('#oList'); if (!el) return;
    const list = S.data.orders || [];
    el.innerHTML = list.length ? `<div class="rows">${list.map(orderRow).join('')}</div>` : empty(t('noOrders'), 'package');
  }
  function matchesOrderFilter(o) {
    const f = S.filters.orders, q = S.q.orders.toLowerCase();
    const okF = f === 'all' || (f === 'active' ? ['confirmed', 'packed', 'out'].includes(o.status) : o.status === f);
    const okQ = !q || [o.id, o.customer.name, o.customer.phone, o.customer.place].join(' ').toLowerCase().includes(q);
    return okF && okQ;
  }
  function orderDrawer(o) {
    const admin = isAdmin(), cur = FLOW.indexOf(o.status), cancelled = o.status === 'cancelled', closed = cancelled || o.status === 'delivered';
    const canStatus = admin || o.allMine;
    const next = cur >= 0 && cur < 3 ? FLOW[cur + 1] : null;
    const myUnpacked = !admin && o.items.some(i => i.mine && !i.packed);
    const notifyKey = cancelled ? 'nfCancelled' : o.payment === 'paid' && o.status === 'confirmed' ? 'nfPaid' : 'nf_' + o.status;
    const lang = o.lang === 'mr' ? 'mr' : 'en';
    const msg = tl(lang, notifyKey, { name: o.customer.name.split(' ')[0], id: o.id, total: '₹' + o.total });
    const actions = [];
    if (!closed && canStatus && next) actions.push(`<button type="button" class="btn teal" data-status="${next}">${icon(STATUS_ICON[next])}<span>${esc(t('do_' + next))}</span></button>`);
    if (!closed && canStatus && next && next !== 'delivered') actions.push(`<button type="button" class="btn ghost" data-status="delivered">${icon('home')}<span>${esc(t('do_delivered'))}</span></button>`);
    if (o.status === 'confirmed' && !canStatus && myUnpacked) actions.push(`<button type="button" class="btn teal" data-pack>${icon('package')}<span>${esc(t('packMine'))}</span></button>`);
    if (!closed && canStatus) actions.push(`<button type="button" class="btn danger-ghost" data-status="cancelled">${icon('x')}<span>${esc(t('do_cancelled'))}</span></button>`);
    const payActions = !admin ? '' : [
      ['pending', 'claimed'].includes(o.payment) && !cancelled ? `<button type="button" class="btn teal sm" data-pay="paid">${icon('shield')}<span>${esc(t('markPaid'))}</span></button>` : '',
      o.payment === 'paid' && !cancelled ? `<button type="button" class="btn ghost sm" data-pay="pending">${esc(t('markUnpaid'))}</button>` : '',
      o.payment === 'paid' && cancelled ? `<button type="button" class="btn ghost sm" data-pay="refunded">${icon('refresh')}<span>${esc(t('markRefunded'))}</span></button>` : ''
    ].join('');
    const evLabel = (e) => e.kind === 'status' ? t('st_' + e.value) : e.kind === 'payment' ? t('pay_' + e.value) : e.kind === 'packed_items' ? t('evPacked') : e.value;
    return `<div class="dh"><div><h2 class="h2">${esc(o.id)}</h2><small class="muted">${esc(timeStr(o.createdAt))} · ${esc(t('mode_' + o.mode))}${o.demo ? ' · ' + esc(t('demoTag')) : ''}</small></div><div class="pills">${statusPill(o.status)}${payPill(o.payment)}</div></div>
      ${cancelled ? '' : `<ol class="stepper">${FLOW.map((s, i) => `<li class="${i < cur || (i === cur && s === 'delivered') ? 'done' : i === cur ? 'now' : ''}">${icon(STATUS_ICON[s])}<small>${esc(t('st_' + s))}</small></li>`).join('')}</ol>`}
      ${actions.length ? `<div class="btn-row">${actions.join('')}</div>` : ''}
      ${!admin && !o.allMine ? `<p class="note">${icon('info')}<span>${esc(t('sharedOrder'))}</span></p>` : ''}
      <section class="dsec"><h3>${esc(t('customer'))}</h3>
        <div class="kv"><span>${esc(t('name'))}</span><b>${esc(o.customer.name)}</b></div>
        <div class="kv"><span>${esc(t('phone'))}</span><b><a href="tel:+91${esc(o.customer.phone)}">${esc(o.customer.phone)}</a></b></div>
        <div class="kv"><span>${esc(t('place'))}</span><b>${esc(o.customer.place || '—')}</b></div></section>
      <section class="dsec"><h3>${esc(t('items'))}</h3>
        <table class="tbl"><tbody>${o.items.map(i => `<tr class="${i.mine ? 'mine' : ''}"><td><b>${esc(L(i.name))}</b><small>${esc(i.sellerName)}${i.mine ? ' · ' + esc(t('you')) : ''}</small></td><td class="n">${num(i.q)} × ${esc(inr(i.price))}</td><td class="n">${i.packed ? `<span class="ok">${icon('check')}${esc(t('packed'))}</span>` : `<small class="muted">${esc(t('notPacked'))}</small>`}</td></tr>`).join('')}</tbody></table>
        <div class="kv"><span>${esc(t('subtotal'))}</span><b>${esc(inr(o.subtotal))}</b></div>
        <div class="kv"><span>${esc(t('deliveryFee'))}</span><b>${o.fee ? esc(inr(o.fee)) : esc(t('free'))}</b></div>
        <div class="kv total"><span>${esc(t('total'))}</span><b>${esc(inr(o.total))}</b></div></section>
      <section class="dsec"><h3>${esc(t('payment'))}</h3><div class="kv"><span>${esc(t('status'))}</span>${payPill(o.payment)}</div>${admin && o.paymentRef ? `<div class="kv"><span>${esc(t('upiRef'))}</span><b>${esc(o.paymentRef)}</b></div>` : ''}
        <p class="muted small">${esc(t(admin ? (o.payment === 'claimed' ? 'payHelpClaimed' : 'payHelp') : 'payHelpSeller', { total: inr(o.total), id: o.id }))}</p>${payActions ? `<div class="btn-row">${payActions}</div>` : ''}</section>
      ${admin ? `<section class="dsec"><h3>${esc(t('notifyTitle'))}</h3><p class="wa-preview">${esc(msg)}</p>
        <a class="btn wa" href="${esc(waLink(o.customer.phone, msg))}" target="_blank" rel="noopener">${icon('wa')}<span>${esc(t('notifyBtn'))}</span></a><p class="muted small">${esc(t('notifyFromOfficial'))}</p></section>`
      : `<section class="dsec"><h3>${esc(t('askTeamTitle'))}</h3><p class="wa-preview">${esc(t('askTeamMsg', { id: o.id, name: S.me.name }))}</p>
        <a class="btn wa" href="${esc(waOfficial(t('askTeamMsg', { id: o.id, name: S.me.name })))}" target="_blank" rel="noopener">${icon('wa')}<span>${esc(t('askTeamBtn'))}</span></a>${waHint()}</section>`}
      <section class="dsec"><h3>${esc(t('note'))}</h3><textarea class="input" id="oNote" rows="3" maxlength="500" placeholder="${esc(t('notePh'))}">${esc(o.note || '')}</textarea><div class="btn-row"><button type="button" class="btn ghost sm" data-note>${esc(t('saveNote'))}</button></div></section>
      <section class="dsec"><h3>${esc(t('timeline'))}</h3><ol class="tl">${o.events.slice().reverse().map(e => `<li><b>${esc(evLabel(e))}</b><small>${esc(timeStr(e.at))}</small></li>`).join('')}</ol></section>`;
  }
  async function openOrder(id) {
    let o = (S.data.orders || []).find(x => x.id === id) || ((S.data.overview && S.data.overview.recent) || []).find(x => x.id === id);
    if (!o) o = (await api('GET', '/my/orders/' + encodeURIComponent(id))).order;
    openDrawer(orderDrawer(o), true);
    $('#drawer').dataset.order = id;
  }
  function putOrder(o) {
    const list = S.data.orders || (S.data.orders = []);
    const i = list.findIndex(x => x.id === o.id);
    if (i >= 0) list[i] = o; else if (matchesOrderFilter(o)) list.unshift(o);
    if (i >= 0 && !matchesOrderFilter(o) && S.view === 'orders' && S.filters.orders !== 'all') list.splice(i, 1);
    if (S.data.overview) { const r = S.data.overview.recent, j = r.findIndex(x => x.id === o.id); if (j >= 0) r[j] = o; }
    if (S.view === 'orders') renderOrderList();
    if ($('#drawer').dataset.order === o.id && !$('#drawer').hidden) { const sc = $('#drawer').scrollTop; $('#drawer .drawer-in').innerHTML = orderDrawer(o); $('#drawer').scrollTop = sc; }
  }
  async function orderAction(btn) {
    const id = $('#drawer').dataset.order;
    if (!id) return;
    try {
      let res;
      if (btn.dataset.status) {
        const st = btn.dataset.status;
        if (st === 'cancelled' && !(await dialog({ title: t('cancelQ', { id }), body: esc(t('cancelBody')), ok: t('do_cancelled'), danger: true }))) return;
        btn.disabled = true;
        res = await api('POST', `/my/orders/${encodeURIComponent(id)}/status`, { status: st });
        toast(t('statusSaved', { id, s: t('st_' + st) }));
      } else if (btn.hasAttribute('data-pack')) {
        btn.disabled = true;
        res = await api('POST', `/my/orders/${encodeURIComponent(id)}/pack`, {});
        toast(t('packedSaved'));
      } else if (btn.dataset.pay) {
        const o = (S.data.orders || []).find(x => x.id === id) || (S.data.payments || []).find(x => x.id === id);
        if (btn.dataset.pay === 'paid' && !(await dialog({ title: t('markPaidQ', { id }), body: esc(t('markPaidBody', { total: o ? inr(o.total) : '', ref: o && o.paymentRef ? o.paymentRef : t('noRef') })), ok: t('markPaid') }))) return;
        btn.disabled = true;
        res = await api('POST', `/admin/orders/${encodeURIComponent(id)}/payment`, { payment: btn.dataset.pay });
        toast(t('paySaved', { s: t('pay_' + btn.dataset.pay) }));
      } else if (btn.hasAttribute('data-note')) {
        res = await api('POST', `/my/orders/${encodeURIComponent(id)}/note`, { note: $('#oNote').value });
        toast(t('noteSaved'));
      }
      if (res && res.order) putOrder(res.order);
      refreshDashboard();
    } catch (e) { toast(e.message, 'err', 5000); btn.disabled = false; }
  }

  /* ======================= payments (admin): verify UPI claims ======================= */
  const PAY_F = ['claimed', 'unpaid'];
  async function payments() {
    const v = $('#view');
    if (!PAY_F.includes(S.filters.payments)) S.filters.payments = 'claimed';
    v.innerHTML = pageHead(t('nav_payments'), t('paymentsSub')) + `<div class="note">${icon('shield')}<span>${esc(t('paymentsWhy'))}</span></div>` +
      chips('pyf', PAY_F, S.filters.payments) + `<div id="pyList">${skeleton()}</div>`;
    await loadPayments();
  }
  async function loadPayments() {
    const res = await api('GET', `/my/orders?status=${S.filters.payments}`);
    S.data.payments = res.orders;
    renderPayments();
  }
  function renderPayments() {
    const el = $('#pyList'); if (!el) return;
    const list = S.data.payments || [];
    el.innerHTML = list.length ? `<div class="rows">${list.map(o => `<div class="row ord pay-row" data-order="${esc(o.id)}" role="button" tabindex="0">
        <span class="c-id"><b>${esc(o.id)}</b><small>${esc(ago(o.createdAt))}</small></span>
        <span class="c-cust"><b>${esc(o.customer.name)}</b><small>${esc(o.customer.phone)}</small></span>
        <span class="c-items"><small>${esc(t('upiRef'))}: <b>${esc(o.paymentRef || t('noRef'))}</b></small></span>
        <span class="c-amt"><b>${esc(inr(o.total))}</b>${payPill(o.payment)}</span>
        <span class="c-st"><button type="button" class="btn teal sm" data-quickpay="${esc(o.id)}">${icon('shield')}<span>${esc(t('markPaid'))}</span></button></span>
      </div>`).join('')}</div>` : empty(t(S.filters.payments === 'claimed' ? 'noClaims' : 'noUnpaid'), 'check');
  }
  async function quickPay(btn) {
    const id = btn.dataset.quickpay, o = (S.data.payments || []).find(x => x.id === id);
    if (!o || !(await dialog({ title: t('markPaidQ', { id }), body: esc(t('markPaidBody', { total: inr(o.total), ref: o.paymentRef || t('noRef') })), ok: t('markPaid') }))) return;
    btn.disabled = true;
    try {
      await api('POST', `/admin/orders/${encodeURIComponent(id)}/payment`, { payment: 'paid' });
      toast(t('paySaved', { s: t('pay_paid') }));
      S.data.payments = S.data.payments.filter(x => x.id !== id); renderPayments(); refreshDashboard();
    } catch (e) { toast(e.message, 'err', 5000); btn.disabled = false; }
  }

  /* ======================= products ======================= */
  const PROD_F = ['all', 'active', 'pending', 'hidden', 'rejected'];
  // same flat illustrations as the storefront when there is no photo
  const thumb = (p) => (p.image ? `<img src="${esc(p.image)}" alt="" loading="lazy">` : ART.svg(p));
  function aiBadge(p) {
    if (!p.ai || !p.ai.top || !p.ai.top.length) return '';
    const top = p.ai.top[0];
    return `<small class="ai">${icon('cpu')}${esc(t('aiLine', { model: p.ai.model || 'MobileNet', cls: String(top.className).split(',')[0], p: num(top.probability * 100) + '%', r: num(p.ai.readiness) }))}</small>`;
  }
  function productRow(p) {
    const admin = isAdmin(), acts = [];
    if (p.status === 'pending' && admin) acts.push(`<button type="button" class="btn teal sm" data-pact="approve">${icon('check')}<span>${esc(t('approve'))}</span></button>`, `<button type="button" class="btn ghost sm" data-pact="reject">${esc(t('reject'))}</button>`);
    if (p.status === 'active') acts.push(`<button type="button" class="btn ghost sm" data-pact="hide">${icon('eyeoff')}<span>${esc(t('hide'))}</span></button>`);
    if (p.status === 'hidden') acts.push(`<button type="button" class="btn ghost sm" data-pact="show">${icon('eye')}<span>${esc(t('show'))}</span></button>`);
    if (p.status === 'rejected' && admin) acts.push(`<button type="button" class="btn ghost sm" data-pact="approve">${esc(t('approve'))}</button>`);
    acts.push(`<button type="button" class="icon-btn" data-pact="edit" aria-label="${esc(t('edit'))}">${icon('edit')}</button>`, `<button type="button" class="icon-btn" data-pact="delete" aria-label="${esc(t('delete'))}">${icon('trash')}</button>`);
    return `<div class="prow" data-id="${esc(p.id)}">
      <span class="thumb">${thumb(p)}</span>
      <div class="pinfo"><b>${esc(L(p.name))}</b><small lang="${S.lang === 'mr' ? 'en' : 'mr'}">${esc(S.lang === 'mr' ? p.name.en : p.name.mr)}</small><small class="muted">${esc(L(p.seller))} · ${esc(catName(p.cat))}${p.isNew ? ' · ' + esc(t('newTag')) : ''}</small>${leadPill(p)}${aiBadge(p)}</div>
      <label class="pf"><span>${esc(t('price'))}</span><span class="money"><i>₹</i><input class="input" type="number" min="1" max="500000" step="1" inputmode="numeric" data-pf="price" value="${esc(p.price)}"></span></label>
      <label class="pf"><span>${esc(t('stock'))}</span><input class="input" type="number" min="0" max="100000" step="1" inputmode="numeric" data-pf="stock" value="${p.stock === null || p.stock === undefined ? '' : esc(p.stock)}" placeholder="${esc(t('stockAny'))}"></label>
      <span class="pst">${prodPill(p.status)}${p.stock === 0 ? `<span class="spill pr-hidden">${esc(t('soldOut'))}</span>` : ''}</span>
      <div class="pacts">${acts.join('')}</div>
    </div>`;
  }
  async function products() {
    const v = $('#view');
    v.innerHTML = pageHead(t('nav_products'), t(isAdmin() ? 'productsSubAdmin' : 'productsSubSeller'),
      `<label class="search">${icon('search')}<input class="input" id="pq" type="search" placeholder="${esc(t('searchProducts'))}" value="${esc(S.q.products)}" aria-label="${esc(t('searchProducts'))}"></label>
       <button type="button" class="btn teal" data-padd>${icon('plus')}<span>${esc(t('addProduct'))}</span></button>`) + `<div id="pf"></div><div id="pList">${skeleton()}</div>`;
    const res = await api('GET', '/my/products');
    S.data.products = res.products;
    renderProducts();
  }
  function renderProducts() {
    const list = S.data.products || [], f = S.filters.products, q = S.q.products.toLowerCase();
    const counts = {}; PROD_F.forEach(k => { counts[k] = k === 'all' ? list.length : list.filter(p => p.status === k).length; });
    if ($('#pf')) $('#pf').innerHTML = chips('pf', PROD_F.filter(k => k === 'all' || counts[k] || k === 'pending'), f, counts);
    const shown = list.filter(p => (f === 'all' || p.status === f) && (!q || [p.name.en, p.name.mr, p.seller.en, catName(p.cat)].join(' ').toLowerCase().includes(q)));
    if ($('#pList')) $('#pList').innerHTML = shown.length ? `<div class="plist">${shown.map(productRow).join('')}</div>` : empty(t(f === 'pending' ? 'noPending' : 'noProducts'), 'tag');
  }
  function putProduct(p) {
    const list = S.data.products || (S.data.products = []), i = list.findIndex(x => x.id === p.id);
    if (i >= 0) list[i] = p; else list.unshift(p);
    if (S.view === 'products') renderProducts();
  }
  async function patchProduct(id, body, okMsg) {
    try { const res = await api('PATCH', '/my/products/' + encodeURIComponent(id), body); putProduct(res.product); if (okMsg) toast(okMsg); refreshDashboard(); return res.product; }
    catch (e) { toast(e.message, 'err', 5000); if (S.view === 'products') renderProducts(); return null; }
  }
  async function productAction(btn) {
    const row = btn.closest('[data-id]'), id = row.dataset.id, p = (S.data.products || []).find(x => x.id === id);
    const a = btn.dataset.pact;
    if (a === 'approve') return patchProduct(id, { status: 'active' }, t('approved', { name: L(p.name) }));
    if (a === 'reject') return patchProduct(id, { status: 'rejected' }, t('rejected', { name: L(p.name) }));
    if (a === 'hide') return patchProduct(id, { status: 'hidden' }, t('hidden', { name: L(p.name) }));
    if (a === 'show') return patchProduct(id, { status: 'active' }, t('shown', { name: L(p.name) }));
    if (a === 'edit') return productForm(p);
    if (a === 'delete') {
      if (!(await dialog({ title: t('deleteQ', { name: L(p.name) }), body: esc(t('deleteBody')), ok: t('delete'), danger: true }))) return;
      try {
        const res = await api('DELETE', '/my/products/' + encodeURIComponent(id));
        if (res.hidden) { p.status = 'hidden'; toast(t('hiddenInstead')); } else { S.data.products = S.data.products.filter(x => x.id !== id); toast(t('deleted')); }
        renderProducts(); refreshDashboard();
      } catch (e) { toast(e.message, 'err'); }
    }
  }
  async function productForm(p) {
    const admin = isAdmin();
    if (admin && !S.data.sellers) { try { S.data.sellers = (await api('GET', '/admin/sellers')).sellers; } catch (e) { S.data.sellers = []; } }
    const v = (x) => esc(x ?? '');
    openDrawer(`<form id="prodForm" class="form" novalidate data-id="${p ? esc(p.id) : ''}">
      <div class="dh"><h2 class="h2">${esc(p ? t('editProduct') : t('addProduct'))}</h2></div>
      <div class="photo-pick"><span class="thumb big" id="pfThumb">${p ? thumb(p) : `<span class="ph">${icon('camera')}</span>`}</span>
        <label class="btn ghost sm">${icon('upload')}<span>${esc(t('choosePhoto'))}</span><input type="file" id="pfPhoto" accept="image/*" hidden></label></div>
      <div class="grid-f">
        ${field(t('nameEn'), `<input class="input" name="name" required maxlength="80" value="${v(p && p.name.en)}">`)}
        ${field(t('nameMr'), `<input class="input" name="nameMr" maxlength="80" lang="mr" value="${v(p && p.name.mr !== p.name.en ? p.name.mr : '')}">`)}
        ${field(t('category'), `<select class="input" name="cat">${CAT_KEYS.map(c => `<option value="${c}"${p && p.cat === c ? ' selected' : ''}>${esc(catName(c))}</option>`).join('')}</select>`)}
        ${field(t('price'), `<input class="input" name="price" type="number" min="1" max="500000" required value="${v(p && p.price)}">`)}
        ${field(t('stock'), `<input class="input" name="stock" type="number" min="0" max="100000" placeholder="${esc(t('stockAny'))}" value="${p && p.stock !== null && p.stock !== undefined ? v(p.stock) : ''}">`, t('stockHint'))}
        ${field(t('unitEn'), `<input class="input" name="unit" maxlength="40" placeholder="250 g" value="${v(p && p.unit.en)}">`)}
        ${field(t('unitMr'), `<input class="input" name="unitMr" maxlength="40" lang="mr" placeholder="२५० ग्रॅम" value="${v(p && p.unit.mr !== p.unit.en ? p.unit.mr : '')}">`)}
        ${admin ? field(t('seller'), `<select class="input" name="sellerId" required><option value="">${esc(t('chooseSeller'))}</option>${S.data.sellers.map(s => `<option value="${esc(s.id)}"${p && p.sellerId === s.id ? ' selected' : ''}>${esc(s.name)}${s.verified ? '' : ' (' + esc(t('unverified')) + ')'}</option>`).join('')}</select>`) : ''}
      </div>
      <fieldset class="lead-set"><legend>${icon('clock')}<span>${esc(t('leadLabel'))}</span></legend>
        <p class="muted small">${esc(t('leadHelp'))}</p>
        ${field(t('leadPick'), `<select class="input" name="lead" data-lead>${LEADS.map(k => `<option value="${k}"${(p ? p.lead : DEFAULT_LEAD.food) === k ? ' selected' : ''}>${esc(k === 'custom' ? t('leadCustom') : t('lead_' + k))}</option>`).join('')}</select>`)}
        <div class="grid-f" data-lead-custom${p && p.lead === 'custom' ? '' : ' hidden'}>
          ${field(t('leadTextEn'), `<input class="input" name="leadText" maxlength="60" placeholder="${esc(t('leadTextPh'))}" value="${v(p && p.leadText && p.leadText.en)}">`)}
          ${field(t('leadTextMr'), `<input class="input" name="leadTextMr" maxlength="60" lang="mr" placeholder="${esc(t('leadTextPhMr'))}" value="${v(p && p.leadText && p.leadText.mr !== p.leadText.en ? p.leadText.mr : '')}">`)}
        </div></fieldset>
      ${field(t('descEn'), `<textarea class="input" name="desc" rows="3" maxlength="400">${v(p && p.desc.en)}</textarea>`)}
      ${field(t('descMr'), `<textarea class="input" name="descMr" rows="3" maxlength="400" lang="mr">${v(p && p.desc.mr !== p.desc.en ? p.desc.mr : '')}</textarea>`)}
      ${!admin && !p && S.me.seller && !S.me.seller.verified ? `<p class="note">${icon('info')}<span>${esc(t('reviewNote'))}</span></p>` : ''}
      <p class="form-err" id="pfErr" hidden></p>
      <div class="btn-row"><button type="submit" class="btn teal">${icon('check')}<span>${esc(p ? t('save') : t('addProduct'))}</span></button><button type="button" class="btn ghost" data-close>${esc(t('cancel'))}</button></div>
    </form>`);
    $('#drawer').dataset.product = p ? p.id : 'new';
  }
  async function submitProduct(form) {
    const fd = new FormData(form), body = {};
    for (const [k, val] of fd.entries()) body[k] = typeof val === 'string' ? val.trim() : val;
    body.price = Number(body.price);
    body.stock = body.stock === '' ? null : Number(body.stock);
    if (body.lead !== 'custom') { delete body.leadText; delete body.leadTextMr; }
    if (!body.sellerId) delete body.sellerId;
    if (form.dataset.photo) body.photo = form.dataset.photo;
    const id = form.dataset.id, err = $('#pfErr');
    err.hidden = true;
    const btn = form.querySelector('[type="submit"]'); btn.disabled = true;
    try {
      const res = id ? await api('PATCH', '/my/products/' + encodeURIComponent(id), body) : await api('POST', '/my/products', body);
      putProduct(res.product);
      closeDrawer();
      toast(id ? t('saved') : (res.product.status === 'active' ? t('productLive', { name: L(res.product.name) }) : t('productPending', { name: L(res.product.name) })));
      refreshDashboard();
    } catch (e) { err.textContent = e.message; err.hidden = false; btn.disabled = false; }
  }

  /* ======================= sellers (admin) ======================= */
  const SELL_F = ['all', 'unverified', 'shg', 'individual', 'paused'];
  function sellerRow(s) {
    const acts = [];
    if (!s.verified) acts.push(`<button type="button" class="btn teal sm" data-sact="verify">${icon('shield')}<span>${esc(t('verify'))}</span></button>`);
    acts.push(s.active ? `<button type="button" class="btn ghost sm" data-sact="pause">${esc(t('pause'))}</button>` : `<button type="button" class="btn ghost sm" data-sact="activate">${esc(t('activate'))}</button>`);
    acts.push(`<button type="button" class="btn ghost sm" data-sact="login">${icon('lock')}<span>${esc(s.login ? t('resetPin') : t('createLogin'))}</span></button>`);
    acts.push(`<button type="button" class="icon-btn" data-sact="share" aria-label="${esc(t('shareShopShort'))}" title="${esc(t('shareShopShort'))}">${icon('share')}</button>`);
    acts.push(`<button type="button" class="icon-btn" data-sact="edit" aria-label="${esc(t('edit'))}">${icon('edit')}</button>`);
    if (s.phone) acts.push(`<a class="icon-btn wa-ic" href="${esc(waLink(s.phone, t('waSellerHi', { name: s.name })))}" target="_blank" rel="noopener" aria-label="WhatsApp">${icon('wa')}</a>`);
    return `<div class="srow${s.active ? '' : ' paused'}" data-id="${esc(s.id)}">
      <span class="avatar ${s.type}">${esc(initials(s.name))}</span>
      <div class="sinfo"><b>${esc(S.lang === 'mr' && s.nameMr ? s.nameMr : s.name)}</b>
        <small>${esc(s.type === 'shg' ? t('typeShg') : t('typeInd'))} · ${esc(S.lang === 'mr' && s.placeMr ? s.placeMr : s.place)}${s.type === 'shg' ? ' · ' + esc(t('membersN', { n: num(s.members || 0) })) : ''}</small>
        <span class="pills">${s.verified ? `<span class="spill pr-active">${icon('shield')}${esc(t('verified'))}</span>` : `<span class="spill pr-pending">${esc(t('unverified'))}</span>`}${s.active ? '' : `<span class="spill pr-hidden">${esc(t('paused'))}</span>`}${s.login ? `<span class="spill">${icon('phone')}${esc(s.login)}</span>` : ''}</span></div>
      <div class="sstats"><span><b>${num(s.products)}</b><small>${esc(t('liveWord'))}</small></span><span><b>${num(s.pending)}</b><small>${esc(t('reviewWord'))}</small></span><span><b>${num(s.orders)}</b><small>${esc(t('ordersWord'))}</small></span><span><b>${esc(compact(s.revenue))}</b><small>${esc(t('earned'))}</small></span></div>
      <div class="pacts">${acts.join('')}</div>
    </div>`;
  }
  async function sellers() {
    const v = $('#view');
    v.innerHTML = pageHead(t('nav_sellers'), t('sellersSub'),
      `<label class="search">${icon('search')}<input class="input" id="sq" type="search" placeholder="${esc(t('searchSellers'))}" value="${esc(S.q.sellers)}" aria-label="${esc(t('searchSellers'))}"></label>
       <button type="button" class="btn teal" data-sadd>${icon('plus')}<span>${esc(t('addSeller'))}</span></button>`) + `<div id="sf"></div><div id="sList">${skeleton()}</div>`;
    S.data.sellers = (await api('GET', '/admin/sellers')).sellers;
    renderSellers();
  }
  function renderSellers() {
    const list = S.data.sellers || [], f = S.filters.sellers, q = S.q.sellers.toLowerCase();
    const test = { all: () => true, unverified: s => !s.verified, shg: s => s.type === 'shg', individual: s => s.type === 'individual', paused: s => !s.active };
    const counts = {}; SELL_F.forEach(k => { counts[k] = list.filter(test[k]).length; });
    if ($('#sf')) $('#sf').innerHTML = chips('sf', SELL_F, f, counts);
    const shown = list.filter(test[f] || test.all).filter(s => !q || [s.name, s.nameMr, s.place, s.phone, s.login].join(' ').toLowerCase().includes(q));
    if ($('#sList')) $('#sList').innerHTML = shown.length ? `<div class="slist">${shown.map(sellerRow).join('')}</div>` : empty(t('noSellers'), 'users');
  }
  function putSeller(s) { const list = S.data.sellers || [], i = list.findIndex(x => x.id === s.id); if (i >= 0) list[i] = s; else list.unshift(s); if (S.view === 'sellers') renderSellers(); }
  async function sellerAction(btn) {
    const id = btn.closest('[data-id]').dataset.id, s = S.data.sellers.find(x => x.id === id), a = btn.dataset.sact;
    try {
      if (a === 'verify') { putSeller((await api('PATCH', '/admin/sellers/' + id, { verified: true })).seller); toast(t('verifiedToast', { name: s.name })); refreshDashboard(); }
      if (a === 'pause') {
        if (!(await dialog({ title: t('pauseQ', { name: s.name }), body: esc(t('pauseBody')), ok: t('pause'), danger: true }))) return;
        putSeller((await api('PATCH', '/admin/sellers/' + id, { active: false })).seller); toast(t('pausedToast', { name: s.name }));
      }
      if (a === 'activate') { putSeller((await api('PATCH', '/admin/sellers/' + id, { active: true })).seller); toast(t('activeToast', { name: s.name })); }
      if (a === 'edit') sellerForm(s);
      if (a === 'share') await shareShop(s);
      if (a === 'login') {
        let phone = s.phone || '';
        if (!s.login && !phone) { phone = await dialog({ title: t('createLogin'), body: esc(t('phoneFirst')), ok: t('createLogin'), input: { label: t('phone'), placeholder: '98XXXXXXXX' } }); if (!phone) return; }
        else if (!(await dialog({ title: s.login ? t('resetPinQ', { name: s.name }) : t('createLoginQ', { name: s.name }), body: esc(t(s.login ? 'resetPinBody' : 'createLoginBody')), ok: s.login ? t('resetPin') : t('createLogin') }))) return;
        const res = await api('POST', `/admin/sellers/${id}/login`, { phone });
        const msg = t('waLoginMsg', { name: s.name, login: res.login, pin: res.pin, url: location.origin + '/admin' });
        await dialog({ title: t('loginReady'), body: `<div class="pin-box"><span>${esc(t('loginWord'))}</span><b>${esc(res.login)}</b><span>PIN</span><b class="pin">${esc(res.pin)}</b></div><p class="muted small">${esc(t('pinOnce'))}</p><a class="btn wa" href="${esc(waLink(res.login, msg))}" target="_blank" rel="noopener">${icon('wa')}<span>${esc(t('sendPin'))}</span></a>`, ok: t('done'), cancel: null });
        S.data.sellers = (await api('GET', '/admin/sellers')).sellers; renderSellers();
      }
    } catch (e) { toast(e.message, 'err', 5000); }
  }
  function sellerForm(s) {
    const v = (x) => esc(x ?? '');
    openDrawer(`<form id="sellerForm" class="form" novalidate data-id="${s ? esc(s.id) : ''}">
      <div class="dh"><h2 class="h2">${esc(s ? t('editSeller') : t('addSeller'))}</h2></div>
      <div class="grid-f">
        ${field(t('sellerName'), `<input class="input" name="name" required maxlength="80" value="${v(s && s.name)}">`)}
        ${field(t('nameMr'), `<input class="input" name="nameMr" maxlength="80" lang="mr" value="${v(s && s.nameMr)}">`)}
        ${field(t('sellerType'), `<select class="input" name="type"><option value="individual"${s && s.type === 'individual' ? ' selected' : ''}>${esc(t('typeInd'))}</option><option value="shg"${s && s.type === 'shg' ? ' selected' : ''}>${esc(t('typeShg'))}</option></select>`)}
        ${field(t('members'), `<input class="input" name="members" type="number" min="1" max="500" value="${v(s ? s.members : 1)}">`)}
        ${field(t('place'), `<input class="input" name="place" maxlength="80" value="${v(s && s.place)}">`)}
        ${field(t('placeMr'), `<input class="input" name="placeMr" maxlength="80" lang="mr" value="${v(s && s.placeMr)}">`)}
        ${field(t('phone'), `<input class="input" name="phone" type="tel" inputmode="numeric" maxlength="14" value="${v(s && s.phone)}">`)}
      </div>
      ${field(t('bio'), `<textarea class="input" name="bio" rows="3" maxlength="300">${v(s && s.bio)}</textarea>`)}
      <p class="form-err" id="sfErr" hidden></p>
      <div class="btn-row"><button type="submit" class="btn teal">${icon('check')}<span>${esc(t('save'))}</span></button><button type="button" class="btn ghost" data-close>${esc(t('cancel'))}</button></div>
    </form>`);
  }
  async function submitSeller(form) {
    const fd = new FormData(form), body = {};
    for (const [k, val] of fd.entries()) body[k] = String(val).trim();
    body.members = Number(body.members) || 1;
    const id = form.dataset.id, err = $('#sfErr'); err.hidden = true;
    try {
      const res = id ? await api('PATCH', '/admin/sellers/' + id, body) : await api('POST', '/admin/sellers', body);
      putSeller(res.seller); closeDrawer(); toast(t('saved'));
    } catch (e) { err.textContent = e.message; err.hidden = false; }
  }

  /* ======================= training data (admin) ======================= */
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const TEMPLATE = 'id,month,district,seller_type,category,item,material_cost_inr,labour_hours,packaging_tier,seasonal_demand,price_inr,weekly_orders\nR1,Oct,Pune,SHG,food,Chakli,90,1.5,standard,0.85,240,31\nR2,Nov,Satara,Individual,tailoring,Blouse stitching,120,3,basic,0.6,450,6\n';
  function download(name, text) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob(['﻿' + text], { type: 'text/csv' }));
    a.download = name; document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }
  async function training() {
    const v = $('#view');
    v.innerHTML = skeleton();
    const d = await api('GET', '/admin/training');
    S.data.training = d;
    const sy = d.synthetic, total = (sy.enabled ? sy.n : 0) + d.real.length;
    v.innerHTML = pageHead(t('nav_training'), t('trainingSub')) + `
      <div class="note">${icon('cpu')}<span>${esc(t('trainingNow', { syn: num(sy.enabled ? sy.n : 0), real: num(d.real.length), n: num(total) }))}</span></div>
      <div class="grid2">
        <section class="card"><div class="card-h"><h2 class="h2">${esc(t('synTitle'))}</h2></div><p class="muted small">${esc(t('synHelp'))}</p>
          <form id="synForm" class="form">
            <label class="switch"><input type="checkbox" name="enabled"${sy.enabled ? ' checked' : ''}><span>${esc(t('synUse'))}</span></label>
            <div class="grid-f">${field(t('synRows'), `<input class="input" name="n" type="number" min="0" max="2000" value="${esc(sy.n)}">`)}${field(t('synSeed'), `<input class="input" name="seed" type="number" min="1" max="999999" value="${esc(sy.seed)}">`, t('synSeedHint'))}</div>
            <div class="btn-row"><button type="submit" class="btn teal">${esc(t('save'))}</button></div></form></section>
        <section class="card"><div class="card-h"><h2 class="h2">${esc(t('importTitle'))}</h2></div><p class="muted small">${esc(t('importHelp'))}</p>
          <form id="csvForm" class="form">
            <textarea class="input mono" name="csv" rows="6" placeholder="${esc(TEMPLATE.split('\n')[0])}"></textarea>
            <div class="btn-row"><label class="btn ghost sm">${icon('upload')}<span>${esc(t('chooseCsv'))}</span><input type="file" id="csvFile" accept=".csv,text/csv" hidden></label>
              <button type="button" class="btn ghost sm" data-template>${icon('download')}<span>${esc(t('template'))}</span></button>
              <button type="submit" class="btn teal">${icon('upload')}<span>${esc(t('importBtn'))}</span></button></div>
            <div id="csvResult"></div></form></section>
      </div>
      <section class="card"><div class="card-h"><h2 class="h2">${esc(t('addRowTitle'))}</h2></div>
        <form id="rowForm" class="form row-form">
          ${field(t('category'), `<select class="input" name="cat">${CAT_KEYS.map(c => `<option value="${c}">${esc(catName(c))}</option>`).join('')}</select>`)}
          ${field(t('material'), `<input class="input" name="mat" type="number" min="1" step="any" required>`)}
          ${field(t('hours'), `<input class="input" name="hrs" type="number" min="0.05" step="0.05" required>`)}
          ${field(t('packaging'), `<select class="input" name="tier"><option value="0">${esc(t('pkg0'))}</option><option value="1" selected>${esc(t('pkg1'))}</option><option value="2">${esc(t('pkg2'))}</option></select>`)}
          ${field(t('season'), `<input class="input" name="season" type="number" min="0" max="100" value="60" required>`)}
          ${field(t('priceSold'), `<input class="input" name="price" type="number" min="1" required>`)}
          ${field(t('weeklyOrders'), `<input class="input" name="orders" type="number" min="0" step="1" required>`)}
          ${field(t('month'), `<select class="input" name="month"><option value="">—</option>${MONTHS.map((m, i) => `<option value="${i}">${esc(monthName(i))}</option>`).join('')}</select>`)}
          ${field(t('district'), `<input class="input" name="district" maxlength="40">`)}
          ${field(t('item'), `<input class="input" name="item" maxlength="60">`)}
          <div class="btn-row end"><button type="submit" class="btn teal">${icon('plus')}<span>${esc(t('addRow'))}</span></button></div>
        </form></section>
      <section class="card"><div class="card-h"><h2 class="h2">${esc(t('realTitle', { n: num(d.real.length) }))}</h2>
          <div class="btn-row"><a class="btn ghost sm" href="/api/admin/export/training.csv">${icon('download')}<span>${esc(t('exportCsv'))}</span></a>${d.real.length ? `<button type="button" class="btn danger-ghost sm" data-clear-rows>${icon('trash')}<span>${esc(t('clearRows'))}</span></button>` : ''}</div></div>
        ${d.real.length ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>${esc(t('month'))}</th><th>${esc(t('district'))}</th><th>${esc(t('category'))}</th><th>${esc(t('item'))}</th><th class="n">${esc(t('material'))}</th><th class="n">${esc(t('hours'))}</th><th>${esc(t('packaging'))}</th><th class="n">${esc(t('season'))}</th><th class="n">${esc(t('priceSold'))}</th><th class="n">${esc(t('weeklyOrders'))}</th><th></th></tr></thead>
          <tbody>${d.real.map(r => `<tr><td>${esc(r.month === null || r.month === undefined ? '—' : monthName(r.month))}</td><td>${esc(r.district || '—')}</td><td>${esc(catName(r.cat))}</td><td>${esc(r.item || '—')}</td><td class="n">${esc(inr(r.mat))}</td><td class="n">${num(r.hrs, 2)}</td><td>${esc(t('pkg' + r.tier))}</td><td class="n">${num(r.season * 100)}%</td><td class="n">${esc(inr(r.price))}</td><td class="n">${num(r.orders)}</td><td><button type="button" class="icon-btn" data-del-row="${esc(r.id)}" aria-label="${esc(t('delete'))}">${icon('trash')}</button></td></tr>`).join('')}</tbody></table></div>`
        : empty(t('noRealRows'), 'database')}</section>`;
  }
  async function trainingSubmit(form) {
    try {
      if (form.id === 'synForm') {
        const fd = new FormData(form);
        await api('PUT', '/admin/settings', { synthetic: { enabled: fd.get('enabled') === 'on', n: Number(fd.get('n')), seed: Number(fd.get('seed')) } });
        toast(t('synSaved')); await training();
      }
      if (form.id === 'csvForm') {
        const text = form.csv.value.trim();
        if (!text) { toast(t('csvEmpty'), 'err'); return; }
        const res = await api('POST', '/admin/training/import', { csv: text });
        toast(t('imported', { n: num(res.added) }), res.added ? 'ok' : 'err');
        await training();
        if (res.skipped.length) $('#csvResult').innerHTML = `<div class="note warn">${icon('alert')}<div><b>${esc(t('skippedN', { n: num(res.skipped.length) }))}</b><ul>${res.skipped.slice(0, 8).map(s => `<li>${esc(t('rowN', { n: s.row }))}: ${esc(CI18N.en['csv_' + s.field] ? t('csv_' + s.field) : s.error)}</li>`).join('')}</ul></div></div>`;
      }
      if (form.id === 'rowForm') {
        const fd = new FormData(form), body = {};
        for (const [k, val] of fd.entries()) body[k] = val;
        body.season = Number(body.season) / 100;
        if (body.month === '') delete body.month; else body.month = Number(body.month);
        await api('POST', '/admin/training/rows', body);
        toast(t('rowAdded')); await training();
      }
    } catch (e) { toast(e.message, 'err', 5000); }
  }

  /* ======================= settings (admin) ======================= */
  async function settings() {
    const v = $('#view');
    v.innerHTML = skeleton();
    const { settings: s, setupIssues } = await api('GET', '/admin/settings');
    const a = s.announcement || {};
    const waPlaceholder = !s.whatsappNumber || s.whatsappNumber === PLACEHOLDER_WA;
    v.innerHTML = pageHead(t('nav_settings'), t('settingsSub')) + setupBanner(setupIssues) + `
      <form id="setForm" class="form">
        <div class="grid2">
          <section class="card"><div class="card-h"><h2 class="h2">${esc(t('storeTitle'))}</h2></div>
            <label class="switch"><input type="checkbox" name="storeOpen"${s.storeOpen ? ' checked' : ''}><span>${esc(t('storeOpen'))}</span></label>
            <p class="muted small">${esc(t('storeOpenHelp'))}</p>
            ${field(t('announceEn'), `<input class="input" name="annEn" maxlength="160" value="${esc(a.en || '')}" placeholder="${esc(t('announcePh'))}">`)}
            ${field(t('announceMr'), `<input class="input" name="annMr" maxlength="160" lang="mr" value="${esc(a.mr || '')}">`)}
            <label class="switch"><input type="checkbox" name="autoApproveVerified"${s.autoApproveVerified ? ' checked' : ''}><span>${esc(t('autoApprove'))}</span></label>
          </section>
          <section class="card"><div class="card-h"><h2 class="h2">${esc(t('payTitle'))}</h2></div>
            ${field(t('upiId'), `<input class="input" name="upiId" required maxlength="80" value="${esc(s.upiId)}" placeholder="shg.name@okaxis">`, /demo/i.test(s.upiId) ? t('upiDemo') : t('upiHelp'))}
            ${field(t('upiName'), `<input class="input" name="upiName" maxlength="60" value="${esc(s.upiName)}">`)}
            ${field(t('waNumber'), `<input class="input" name="whatsappNumber" type="tel" maxlength="16" required value="${esc(waPlaceholder ? '' : s.whatsappNumber)}" placeholder="91 98765 43210">`, waPlaceholder ? t('waPlaceholderHelp') : t('waHelp'))}
          </section>
          <section class="card"><div class="card-h"><h2 class="h2">${esc(t('delTitle'))}</h2></div>
            <div class="grid-f">${field(t('delFee'), `<input class="input" name="deliveryFee" type="number" min="0" max="1000" value="${esc(s.deliveryFee)}">`)}${field(t('freeAbove'), `<input class="input" name="freeDeliveryAbove" type="number" min="0" max="100000" value="${esc(s.freeDeliveryAbove)}">`)}</div>
            ${field(t('fairWage'), `<input class="input" name="fairWage" type="number" min="10" max="5000" value="${esc(s.fairWage)}">`, t('fairWageHelp'))}
          </section>
        </div>
        <div class="save-bar"><span class="muted small">${esc(t('saveHint'))}</span><button type="submit" class="btn teal">${icon('check')}<span>${esc(t('saveSettings'))}</span></button></div>
      </form>
      <div class="grid2">
        <section class="card"><div class="card-h"><h2 class="h2">${esc(t('pwTitle'))}</h2></div>
          <form id="pwForm" class="form">${field(t('pwCurrent'), `<input class="input" name="current" type="password" autocomplete="current-password" required>`)}${field(t('pwNew'), `<input class="input" name="next" type="password" autocomplete="new-password" minlength="8" required>`, t('pwHelp'))}
            <div class="btn-row"><button type="submit" class="btn teal">${esc(t('pwSave'))}</button></div></form></section>
        <section class="card"><div class="card-h"><h2 class="h2">${esc(t('dataTitle'))}</h2></div>
          <div class="btn-col">
            <a class="btn ghost" href="/api/admin/backup">${icon('database')}<span>${esc(t('backup'))}</span></a>
            <div class="btn-row"><a class="btn ghost sm" href="/api/admin/export/orders.csv">${icon('download')}<span>${esc(t('expOrders'))}</span></a><a class="btn ghost sm" href="/api/admin/export/products.csv">${icon('download')}<span>${esc(t('expProducts'))}</span></a><a class="btn ghost sm" href="/api/admin/export/sellers.csv">${icon('download')}<span>${esc(t('expSellers'))}</span></a></div>
            <p class="muted small">${esc(t('dangerHelp'))}</p>
            <div class="btn-row"><button type="button" class="btn danger-ghost sm" data-clear-demo>${icon('trash')}<span>${esc(t('clearDemo'))}</span></button><button type="button" class="btn danger-ghost sm" data-reset>${icon('refresh')}<span>${esc(t('resetDemo'))}</span></button></div>
          </div></section>
      </div>`;
  }
  async function settingsSubmit(form) {
    try {
      if (form.id === 'setForm') {
        const f = form.elements;
        await api('PUT', '/admin/settings', {
          storeOpen: f.storeOpen.checked, autoApproveVerified: f.autoApproveVerified.checked,
          announcement: { en: f.annEn.value, mr: f.annMr.value },
          upiId: f.upiId.value.trim(), upiName: f.upiName.value, whatsappNumber: f.whatsappNumber.value.trim(),
          deliveryFee: Number(f.deliveryFee.value), freeDeliveryAbove: Number(f.freeDeliveryAbove.value), fairWage: Number(f.fairWage.value)
        });
        toast(t('settingsSaved'));
        try { S.settings = (await api('GET', '/settings')).settings; } catch (e) { /* the live event brings it too */ }
        await settings();
      }
      if (form.id === 'pwForm' || form.id === 'pinForm') {
        await api('POST', '/auth/password', { current: form.current.value, next: form.next.value });
        form.reset(); toast(t(form.id === 'pinForm' ? 'pinChanged' : 'pwChanged'));
      }
    } catch (e) { toast(e.message, 'err', 5000); }
  }
  async function dataAction(btn) {
    try {
      if (btn.hasAttribute('data-clear-demo')) {
        if (!(await dialog({ title: t('clearDemoQ'), body: esc(t('clearDemoBody')), ok: t('clearDemo'), danger: true }))) return;
        const r = await api('POST', '/admin/orders/clear-demo', {}); toast(t('clearedN', { n: num(r.deleted) }));
      }
      if (btn.hasAttribute('data-reset')) {
        const v = await dialog({ title: t('resetQ'), body: esc(t('resetBody')), ok: t('resetDemo'), danger: true, input: { label: t('typeReset'), placeholder: 'RESET' } });
        if (v === null) return;
        await api('POST', '/admin/reset', { confirm: v.trim() }); toast(t('resetDone'));
      }
      if (btn.hasAttribute('data-clear-rows')) {
        if (!(await dialog({ title: t('clearRowsQ'), body: esc(t('clearRowsBody')), ok: t('clearRows'), danger: true }))) return;
        await api('DELETE', '/admin/training/rows'); toast(t('rowsCleared')); await training();
      }
      if (btn.dataset.delRow) { await api('DELETE', '/admin/training/rows/' + encodeURIComponent(btn.dataset.delRow)); toast(t('rowDeleted')); await training(); }
    } catch (e) { toast(e.message, 'err', 5000); }
  }

  /* ======================= activity (admin) ======================= */
  async function activity() {
    const v = $('#view');
    v.innerHTML = skeleton();
    const { entries } = await api('GET', '/admin/audit?limit=200');
    const detail = (d) => { if (!d) return ''; try { const o = JSON.parse(d); if (Array.isArray(o)) return o.join(', '); return Object.entries(o).map(([k, val]) => `${k}: ${typeof val === 'object' ? JSON.stringify(val) : val}`).join(' · '); } catch (e) { return d; } };
    v.innerHTML = pageHead(t('nav_activity'), t('activitySub')) + (entries.length ? `<section class="card"><div class="tbl-wrap"><table class="tbl"><thead><tr><th>${esc(t('when'))}</th><th>${esc(t('who'))}</th><th>${esc(t('what'))}</th><th>${esc(t('target'))}</th><th>${esc(t('details'))}</th></tr></thead>
      <tbody>${entries.map(e => `<tr><td><small>${esc(timeStr(e.at))}</small></td><td>${esc(!e.user || e.user === 'customer' ? t('byCustomer') : e.user)}</td><td>${esc(CI18N.en['act_' + e.action] ? t('act_' + e.action) : e.action)}</td><td><code>${esc(e.target || '')}</code></td><td><small class="muted">${esc(detail(e.detail)).slice(0, 160)}</small></td></tr>`).join('')}</tbody></table></div></section>` : empty(t('noActivity'), 'clock'));
  }

  /* ======================= profile (seller) ======================= */
  async function profile() {
    const v = $('#view');
    v.innerHTML = skeleton();
    const { seller: s } = await api('GET', '/my/profile');
    const done = new Set((s.lessonsDone || []).map(x => x.module));
    v.innerHTML = pageHead(t('nav_profile'), t('profileSub')) + shareCard() + `
      <div class="grid2">
        <section class="card"><div class="card-h"><h2 class="h2">${esc(t('shopTitle'))}</h2>${s.verified ? `<span class="spill pr-active">${icon('shield')}${esc(t('verified'))}</span>` : `<span class="spill pr-pending">${esc(t('unverified'))}</span>`}</div>
          <form id="profForm" class="form"><div class="grid-f">
            ${field(t('sellerName'), `<input class="input" name="name" maxlength="80" required value="${esc(s.name)}">`)}
            ${field(t('nameMr'), `<input class="input" name="nameMr" maxlength="80" lang="mr" value="${esc(s.nameMr || '')}">`)}
            ${field(t('sellerType'), `<select class="input" name="type"><option value="individual"${s.type === 'individual' ? ' selected' : ''}>${esc(t('typeInd'))}</option><option value="shg"${s.type === 'shg' ? ' selected' : ''}>${esc(t('typeShg'))}</option></select>`)}
            ${field(t('members'), `<input class="input" name="members" type="number" min="1" max="500" value="${esc(s.members || 1)}">`)}
            ${field(t('place'), `<input class="input" name="place" maxlength="80" value="${esc(s.place)}">`)}
            ${field(t('placeMr'), `<input class="input" name="placeMr" maxlength="80" lang="mr" value="${esc(s.placeMr || '')}">`)}
          </div>${field(t('bio'), `<textarea class="input" name="bio" rows="3" maxlength="300">${esc(s.bio || '')}</textarea>`)}
          <div class="btn-row"><button type="submit" class="btn teal">${esc(t('save'))}</button></div></form></section>
        <div class="stack">
          <section class="card"><div class="card-h"><h2 class="h2">${esc(t('pinTitle'))}</h2></div>
            <form id="pinForm" class="form">${field(t('pinCurrent'), `<input class="input" name="current" type="password" inputmode="numeric" autocomplete="current-password" required>`)}${field(t('pinNew'), `<input class="input" name="next" type="password" inputmode="numeric" autocomplete="new-password" pattern="[0-9]{4,6}" required>`, t('pinHelp'))}
              <div class="btn-row"><button type="submit" class="btn teal">${esc(t('pinSave'))}</button></div></form></section>
          <section class="card"><div class="card-h"><h2 class="h2">${esc(t('lessonsTitle'))}</h2></div>
            <ul class="lessons">${['catalogue', 'price', 'upi'].map(m => `<li class="${done.has(m) ? 'done' : ''}">${icon(done.has(m) ? 'check' : 'book')}<span>${esc(t('lesson_' + m))}</span></li>`).join('')}</ul>
            <button type="button" class="btn ghost sm" data-link="lessons">${icon('volume')}<span>${esc(t('openLessons'))}</span></button></section>
        </div>
      </div>`;
  }
  async function profileSubmit(form) {
    const fd = new FormData(form), body = {};
    for (const [k, val] of fd.entries()) body[k] = String(val).trim();
    body.members = Number(body.members) || 1;
    try {
      const { seller } = await api('PATCH', '/my/profile', body);
      S.me.name = seller.name; if (S.me.seller) Object.assign(S.me.seller, { name: seller.name, nameMr: seller.nameMr, place: seller.place, placeMr: seller.placeMr, type: seller.type });
      renderNav(); toast(t('saved'));
    } catch (e) { toast(e.message, 'err', 5000); }
  }

  /* ======================= live events ======================= */
  const LIVE_FNS = {
    order({ kind, order }) {
      if (kind === 'created') {
        const amount = isAdmin() || order.allMine ? order.total : myShare(order);
        toast(t('newOrderToast', { id: order.id, total: inr(amount), name: order.customer.name }), 'info', 6000);
        pushFeed({ icon: 'bell', text: t('feedOrder', { id: order.id, total: inr(amount), place: order.customer.place || t('mode_' + order.mode) }) });
      } else if (kind === 'payment' && order.payment === 'claimed') {
        pushFeed({ icon: 'rupee', text: t('feedClaimed', { id: order.id, total: inr(order.total) }) });
        if (isAdmin()) toast(t('claimToast', { id: order.id }), 'info', 5000);
        if (S.view === 'payments' && S.filters.payments === 'claimed' && !(S.data.payments || []).some(x => x.id === order.id)) { (S.data.payments = S.data.payments || []).unshift(order); renderPayments(); }
      } else if (kind === 'status') pushFeed({ icon: STATUS_ICON[order.status] || 'package', text: t('feedStatus', { id: order.id, s: t('st_' + order.status) }) });
      putOrder(order);
      refreshDashboard();
    },
    product(d) {
      const { action, product, id } = d;
      if (window.SheSellWorkspace) SheSellWorkspace.event('product', d);
      if (action === 'remove') { if (S.data.products) { S.data.products = S.data.products.filter(x => x.id !== id); if (S.view === 'products') renderProducts(); } return; }
      if (product && product.status !== undefined) putProduct(product);
      refreshDashboard();
    },
    notice({ kind, name }) {
      if (kind === 'listing') { pushFeed({ icon: 'tag', text: t('feedListing', { name }) }); if (isAdmin()) toast(t('listingToast', { name }), 'info', 5000); }
      if (kind === 'seller') { pushFeed({ icon: 'users', text: t('feedSeller', { name }) }); if (isAdmin()) toast(t('sellerToast', { name }), 'info', 5000); if (S.view === 'sellers') sellers(); }
      refreshDashboard();
    },
    stats(s) { if (window.SheSellWorkspace) SheSellWorkspace.event('stats', s); if (S.data.overview) S.data.overview.engagement = s; const el = $('#eng'); if (el) el.innerHTML = engagement(s); }
  };

  /* ======================= events ======================= */
  const RENDER = { dashboard, orders, payments, products, sellers, training, settings, activity, profile };
  let qTimer = null;
  function bind() {
    const view = $('#view');
    view.addEventListener('click', (e) => {
      const link = e.target.closest('[data-link]');
      if (link) { const [v, f] = link.dataset.link.split(':'); if (f) S.filters[v] = f; go(v); return; }
      const chip = e.target.closest('.chips .chip');
      if (chip) {
        const group = chip.parentElement.id;
        if (group === 'of') { S.filters.orders = chip.dataset.f; $$('#of .chip').forEach(c => c.setAttribute('aria-pressed', String(c === chip))); $('#oList').innerHTML = skeleton(); loadOrders().catch(err => toast(err.message, 'err')); }
        if (group === 'pf') { S.filters.products = chip.dataset.f; renderProducts(); }
        if (group === 'sf') { S.filters.sellers = chip.dataset.f; renderSellers(); }
        if (group === 'pyf') { S.filters.payments = chip.dataset.f; $$('#pyf .chip').forEach(c => c.setAttribute('aria-pressed', String(c === chip))); $('#pyList').innerHTML = skeleton(); loadPayments().catch(err => toast(err.message, 'err')); }
        return;
      }
      const qp = e.target.closest('[data-quickpay]');
      if (qp) { quickPay(qp); return; }
      if (e.target.closest('[data-share-shop]')) { shareShop(); return; }
      const ord = e.target.closest('[data-order]');
      if (ord) { openOrder(ord.dataset.order).catch(err => toast(err.message, 'err')); return; }
      const pact = e.target.closest('[data-pact]');
      if (pact) { productAction(pact); return; }
      if (e.target.closest('[data-padd]')) { productForm(null); return; }
      const sact = e.target.closest('[data-sact]');
      if (sact) { sellerAction(sact); return; }
      if (e.target.closest('[data-sadd]')) { sellerForm(null); return; }
      if (e.target.closest('[data-template]')) { download('shesell-training-template.csv', TEMPLATE); return; }
      const dangerBtn = e.target.closest('[data-clear-demo],[data-reset],[data-clear-rows],[data-del-row]');
      if (dangerBtn) { dataAction(dangerBtn); return; }
    });
    view.addEventListener('keydown', (e) => {
      if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('.pay-row')) { e.preventDefault(); openOrder(e.target.dataset.order).catch(err => toast(err.message, 'err')); }
    });
    view.addEventListener('mousemove', chartHover);
    view.addEventListener('mouseleave', () => $$('.chart .tip').forEach(tip => { tip.hidden = true; }));
    view.addEventListener('input', (e) => {
      if (e.target.id === 'oq') { S.q.orders = e.target.value; clearTimeout(qTimer); qTimer = setTimeout(() => loadOrders().catch(() => {}), 250); }
      if (e.target.id === 'pq') { S.q.products = e.target.value; renderProducts(); }
      if (e.target.id === 'sq') { S.q.sellers = e.target.value; renderSellers(); }
    });
    view.addEventListener('change', async (e) => {
      const pf = e.target.closest('[data-pf]');
      if (pf) {
        const id = pf.closest('[data-id]').dataset.id, k = pf.dataset.pf, raw = pf.value.trim();
        const val = k === 'stock' && raw === '' ? null : Number(raw);
        if (k === 'price' && !(val >= 1)) { renderProducts(); return; }
        await patchProduct(id, { [k]: val }, t('savedField', { f: t(k) }));
      }
      if (e.target.id === 'csvFile' && e.target.files[0]) { const txt = await e.target.files[0].text(); $('#csvForm').csv.value = txt; }
    });
    view.addEventListener('submit', (e) => {
      e.preventDefault();
      const f = e.target;
      if (['synForm', 'csvForm', 'rowForm'].includes(f.id)) trainingSubmit(f);
      if (['setForm', 'pwForm', 'pinForm'].includes(f.id)) settingsSubmit(f);
      if (f.id === 'profForm') profileSubmit(f);
    });

    const drawer = $('#drawer');
    drawer.addEventListener('click', (e) => {
      if (e.target.closest('[data-close]')) { closeDrawer(); return; }
      const b = e.target.closest('[data-status],[data-pack],[data-pay],[data-note]');
      if (b) orderAction(b);
    });
    drawer.addEventListener('change', async (e) => {
      if (e.target.matches('[data-lead]')) { const c = $('#drawer [data-lead-custom]'); if (c) c.hidden = e.target.value !== 'custom'; return; }
      if (e.target.id === 'pfPhoto' && e.target.files[0]) {
        try {
          const url = await photoToDataUrl(e.target.files[0]);
          $('#prodForm').dataset.photo = url;
          $('#pfThumb').innerHTML = `<img src="${url}" alt="">`;
        } catch (err) { toast(err.message, 'err'); }
      }
    });
    drawer.addEventListener('submit', (e) => {
      e.preventDefault();
      if (e.target.id === 'prodForm') submitProduct(e.target);
      if (e.target.id === 'sellerForm') submitSeller(e.target);
    });
  }

  return { bind, RENDER, renderFeed, LIVE: LIVE_FNS, orderRow, shareShop };
})();
const LIVE = VIEWS.LIVE;
/* Seller workspace views (Studio, AI Catalogue, lessons, pilot dashboard) are drawn by
   SheSellWorkspace in #ws; the console hands it the signed-in user, settings and a few actions. */
function wsCtx() {
  return {
    host: $('#ws'), me: S.me, lang: S.lang, settings: S.settings,
    toast, share: () => VIEWS.shareShop(), go,
    changed: (kind) => { if (kind === 'product') { S.data.products = null; refreshBadges(); } },
    signedOut: () => { S.me = null; showLogin(); }
  };
}
async function renderView() {
  const n = navItem(S.view), ws = window.SheSellWorkspace;
  if (n && n.ws) {
    $('#view').hidden = true; $('#view').innerHTML = '';
    $('#ws').hidden = false;
    if (ws && ws.open(S.view, wsCtx())) return;
    $('#ws').hidden = true; $('#view').hidden = false;
    $('#view').innerHTML = `<div class="empty">${icon('alert')}<p>${esc(t('wsMissing'))}</p></div>`;
    return;
  }
  if (ws) ws.hide();
  $('#ws').hidden = true; $('#view').hidden = false;
  const fn = VIEWS.RENDER[S.view];
  try { await fn(); }
  catch (e) {
    if (e.status === 401) return;
    $('#view').innerHTML = `<div class="empty">${icon('alert')}<p>${esc(e.message)}</p><button type="button" class="btn ghost" onclick="location.reload()">${esc(t('retry'))}</button></div>`;
  }
}
