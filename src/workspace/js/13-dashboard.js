/* ------------------------------------------------------------------
   Pilot impact dashboard (admin only): the deck's national figures, the
   live catalogue mix, the six pilot metrics counted from the server,
   and the 3-month roadmap for rural Pune and its neighbouring districts.
------------------------------------------------------------------- */
const DASH = (() => {
  let lfpr = null;
  const prev = {};
  const ROAD = [['m1', 'r1'], ['m1', 'r2'], ['m2', 'r3'], ['m2', 'r4'], ['m3', 'r5'], ['m3', 'r6']];

  function chart() {
    if (!libs.chart()) { const c = $('#lfprChart'); if (c) c.replaceWith(Object.assign(document.createElement('p'), { className: 'small muted', textContent: t('noChartLib') })); return; }
    const valueLabels = {
      id: 'valueLabels',
      afterDatasetsDraw(ch) {
        const { ctx } = ch, meta = ch.getDatasetMeta(0);
        ctx.save(); ctx.font = '800 15px Mukta, system-ui, sans-serif'; ctx.fillStyle = '#0F2A31'; ctx.textAlign = 'center';
        meta.data.forEach((bar, i) => ctx.fillText(fmtNum(ch.data.datasets[0].data[i], 1) + '%', bar.x, bar.y - 8));
        ctx.restore();
      }
    };
    const data = { labels: [t('yA'), t('yB')], datasets: [{ label: t('lfprLabel'), data: [23.3, 40], backgroundColor: ['#8FB0B6', '#9EB83B'], borderRadius: { topLeft: 4, topRight: 4 }, borderSkipped: 'bottom', maxBarThickness: 64 }] };
    if (lfpr) { lfpr.data.labels = [t('yA'), t('yB')]; lfpr.data.datasets[0].label = t('lfprLabel'); lfpr.options.locale = locale(); lfpr.update('none'); return; }
    lfpr = new Chart($('#lfprChart'), {
      type: 'bar', data, plugins: [valueLabels],
      options: {
        animation: false, responsive: true, maintainAspectRatio: false, locale: locale(), layout: { padding: { top: 24 } },
        scales: {
          x: { grid: { display: false }, ticks: { color: '#44575C', font: { family: 'Mukta', size: 14, weight: '600' } }, border: { color: '#C9D4BD' } },
          y: { beginAtZero: true, max: 50, ticks: { color: '#64767A', stepSize: 10, callback: v => fmtNum(v) + '%' }, grid: { color: '#E6ECDA' }, border: { display: false } }
        },
        plugins: { legend: { display: false }, tooltip: { backgroundColor: '#0F2A31', callbacks: { label: c => fmtNum(c.parsed.y, 1) + '%' } } }
      }
    });
  }
  const live = () => state.products.filter(p => !p.status || p.status === 'active');
  function renderSplit() {
    const list = live(), n = list.length || 1;
    $('#split').innerHTML = CAT_KEYS.map(c => {
      const share = list.filter(p => p.cat === c).length / n;
      return `<div class="split-row"><span>${esc(catName(c))}</span><span class="two"><i style="width:${(share * 100).toFixed(1)}%;background:#9EB83B"></i><i style="width:25%;background:#8FB0B6"></i></span><b class="num">${pct(share)}</b></div>`;
    }).join('');
  }
  function renderLive() {
    const s = state.stats, up = state.metrics.uplift;
    if (!s) { $('#liveMetrics').innerHTML = `<p class="small muted">${esc(t('lmLoading'))}</p>`; return; }
    const items = [
      ['sellers', fmtNum(s.sellers), t('lmSellers'), t('lmSellersSub', { shg: fmtNum(s.shg), target: fmtNum(30) }), Math.min(1, s.sellers / 30)],
      ['products', fmtNum(s.products), t('lmProducts'), t('lmProductsLive', { n: fmtNum(s.published) })],
      ['orders', fmtNum(s.orders), t('lmOrders'), t('lmOrdersLive')],
      ['deliv', fmtNum(s.delivered), t('lmDelivered'), s.orders ? t('lmRate', { p: pct(s.delivered / s.orders) }) : t('lmNone')],
      ['engage', fmtNum(s.views + s.shares + s.adds), t('lmEngage'), t('lmEngageSub', { v: fmtNum(s.views), s: fmtNum(s.shares), a: fmtNum(s.adds) })],
      ['income', up === null || up === undefined ? '—' : '+' + pct(up), t('lmIncome'), up === null || up === undefined ? t('lmIncomeWait') : t('lmIncomeSub')]
    ];
    $('#liveMetrics').innerHTML = items.map(([k, v, l, sub, meter]) => `<div class="lm${prev[k] !== undefined && prev[k] !== v ? ' flash' : ''}" data-k="${k}"><b>${esc(v)}</b><span>${esc(l)}</span><span class="tiny muted">${esc(sub)}</span>${meter !== undefined ? `<span class="meter" style="margin-top:6px"><i style="width:${(meter * 100).toFixed(0)}%"></i></span>` : ''}</div>`).join('');
    items.forEach(([k, v]) => { prev[k] = v; });
    setTimeout(() => $$('#liveMetrics .flash').forEach(el => el.classList.remove('flash')), 900);
  }
  function renderRoad() {
    $('#roadmap').innerHTML = ROAD.map(([mk, rk], i) => `<div class="road"><span class="m">${esc(t(mk))} · ${esc(fmtNum(i + 1))}</span><b>${esc(t(rk))}</b></div>`).join('');
  }
  function renderAll() { renderSplit(); renderLive(); renderRoad(); }
  function bind() {
    BUS.on('metrics', renderLive);
    BUS.on('stats', renderLive);
    BUS.on('catalog', () => { renderSplit(); renderLive(); });
    BUS.on('lang', () => { renderAll(); if (lfpr) chart(); });
  }
  return { bind, init: renderAll, chart };
})();
