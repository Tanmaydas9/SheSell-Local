/* ------------------------------------------------------------------
   Seller Studio: MLP regression (TensorFlow.js) for fair price and
   weekly orders, with live Epoch vs MSE chart and a linear baseline.
   "What the network learned" plots either output of the 8→32→16→2 net:
   fair price against labour hours, or weekly orders against festival /
   seasonal demand, each with the seller's own product as a dot.
------------------------------------------------------------------- */
const STUDIO = (() => {
  const FESTS = [['festOff', 10], ['festRegular', 40], ['festWedding', 55], ['festPadwa', 62], ['festGanesh', 82], ['festDiwali', 96]];
  const DEFAULTS = { food: { mat: 80, hrs: 1.5 }, tailoring: { mat: 150, hrs: 3 }, craft: { mat: 140, hrs: 4 }, agri: { mat: 30, hrs: 0.5 } };
  const st = {
    cat: 'food', mat: 80, hrs: 1.5, tier: 1, season: 0.6, comm: 0.4,
    rows: [], train: [], val: [], sx: null, sy: null, model: null, training: false, trained: false, sigma: 0.08,
    lossChart: null, curveChart: null, metrics: null, baseline: null, seed: 2026, initSeed: 41, showAll: false, last: null, frame: 0,
    status: { key: 'trainWait', vars: null, extra: '' },
    server: null, nSyn: 240, nReal: 0, rerun: false, curveMode: 'price', started: false
  };
  function setStatus(key, vars, extra = '') { st.status = { key, vars, extra }; $('#trainStatus').textContent = t(key, vars) + extra; }

  /* Training rows: synthetic transactions (offline demo, or as configured on the server) plus the
     real sales records the admin keeps on the server. Fewer than 40 rows falls back to synthetic. */
  function prepareData() {
    const srv = st.server, sy = srv && srv.synthetic ? srv.synthetic : { enabled: true, n: 240, seed: st.seed };
    const real = srv && Array.isArray(srv.real) ? srv.real.map((r, i) => DATAGEN.fromRecord(r, i)) : [];
    let syn = sy.enabled ? DATAGEN.generate(sy.n, sy.seed) : [];
    if (syn.length + real.length < 40) syn = DATAGEN.generate(240, st.seed);
    st.nSyn = syn.length; st.nReal = real.length;
    st.rows = real.concat(syn);
    const idx = st.rows.map((_, i) => i), r = DATAGEN.rng(7);
    for (let i = idx.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [idx[i], idx[j]] = [idx[j], idx[i]]; }
    const nTr = Math.round(st.rows.length * 0.8);
    st.train = idx.slice(0, nTr).map(i => st.rows[i]);
    st.val = idx.slice(nTr).map(i => st.rows[i]);
    const Xtr = st.train.map(DATAGEN.features), Ytr = st.train.map(DATAGEN.targets);
    st.sx = DATAGEN.standardiser(Xtr, [4, 5]);
    st.sy = DATAGEN.standardiser(Ytr, [0, 1]);
    st.Xtr = Xtr.map(st.sx.apply); st.Ytr = Ytr.map(st.sy.apply);
    st.Xva = st.val.map(row => st.sx.apply(DATAGEN.features(row)));
    st.Yva = st.val.map(row => st.sy.apply(DATAGEN.targets(row)));
    const lin = DATAGEN.linearBaseline(st.Xtr, st.Ytr);
    const lp = st.Xva.map(x => st.sy.invert(lin(x)));
    st.baseline = {
      r2p: DATAGEN.r2(st.val.map(v => v.price), lp.map(p => Math.exp(p[0]))),
      r2o: DATAGEN.r2(st.val.map(v => v.orders), lp.map(p => Math.expm1(p[1])))
    };
  }

  function buildModel(lr, seed) {
    const m = tf.sequential();
    m.add(tf.layers.dense({ inputShape: [8], units: 32, activation: 'relu', kernelInitializer: tf.initializers.heNormal({ seed }) }));
    m.add(tf.layers.dense({ units: 16, activation: 'relu', kernelInitializer: tf.initializers.heNormal({ seed: seed + 1 }) }));
    m.add(tf.layers.dense({ units: 2, activation: 'linear', kernelInitializer: tf.initializers.glorotUniform({ seed: seed + 2 }) }));
    m.compile({ optimizer: tf.train.adam(lr), loss: 'meanSquaredError' });
    return m;
  }
  function disposeModel() {
    if (!st.model) return;
    try { if (st.model.optimizer) st.model.optimizer.dispose(); } catch (e) { /* already gone */ }
    st.model.dispose();
    st.model = null;
  }

  /* ---------- charts ---------- */
  const endLabels = {
    id: 'endLabels',
    afterDatasetsDraw(chart) {
      const { ctx } = chart;
      ctx.save();
      ctx.font = '600 12px Mukta, system-ui, sans-serif';
      ctx.fillStyle = '#44575C';
      ctx.textBaseline = 'middle';
      chart.data.datasets.forEach((ds, i) => {
        const meta = chart.getDatasetMeta(i);
        if (!meta.visible || !meta.data.length || ds.noEndLabel) return;
        const pt = meta.data[meta.data.length - 1];
        if (pt && Number.isFinite(pt.x) && Number.isFinite(pt.y)) ctx.fillText(ds.short || ds.label, pt.x + 6, pt.y + (i ? 8 : -8));
      });
      ctx.restore();
    }
  };
  function baseOpts(xTitle, yTitle) {
    return {
      animation: false, responsive: true, maintainAspectRatio: false, locale: locale(),
      layout: { padding: { right: 64, top: 4 } },
      interaction: { mode: 'index', intersect: false },
      scales: {
        x: { type: 'linear', title: { display: true, text: xTitle, color: '#44575C' }, ticks: { color: '#64767A', maxTicksLimit: 7 }, grid: { display: false }, border: { color: '#C9D4BD' } },
        y: { title: { display: true, text: yTitle, color: '#44575C' }, ticks: { color: '#64767A', maxTicksLimit: 6 }, grid: { color: '#E6ECDA' }, border: { display: false }, beginAtZero: true }
      },
      plugins: {
        legend: { display: true, position: 'top', align: 'end', labels: { boxWidth: 16, boxHeight: 3, color: '#44575C', font: { family: 'Mukta', size: 13 } } },
        tooltip: { backgroundColor: '#0F2A31', titleFont: { family: 'Mukta' }, bodyFont: { family: 'Mukta' }, padding: 10 }
      }
    };
  }
  function resetLossChart() {
    if (!libs.chart()) { const c = $('#lossChart'); if (c) c.replaceWith(Object.assign(document.createElement('p'), { className: 'small muted', textContent: t('noChartLib') })); return; }
    const data = { datasets: [
      { label: t('trainLoss'), short: t('trainShort'), data: [], borderColor: '#1B434D', borderWidth: 2, pointRadius: 0, tension: 0.25, parsing: false },
      { label: t('valLoss'), short: t('valShort'), data: [], borderColor: '#6E8A1F', borderWidth: 2, pointRadius: 0, tension: 0.25, parsing: false }
    ] };
    if (st.lossChart) { st.lossChart.data = data; st.lossChart.update('none'); return; }
    const o = baseOpts(t('epoch'), t('mseAxis'));
    o.plugins.tooltip.callbacks = { title: (it) => t('epoch') + ' ' + fmtNum(it[0].parsed.x), label: (c) => `${c.dataset.label}: ${fmtNum(c.parsed.y, 4)}` };
    st.lossChart = new Chart($('#lossChart'), { type: 'line', data, options: o, plugins: [endLabels] });
  }
  function pushLoss(ep, loss, val) {
    if (!st.lossChart) return;
    st.lossChart.data.datasets[0].data.push({ x: ep + 1, y: loss });
    st.lossChart.data.datasets[1].data.push({ x: ep + 1, y: val });
    st.lossChart.update('none');
  }
  // the two outputs, each swept over one input while the seller's other inputs stay fixed
  const CURVES = {
    price: { sub: 'curveSub', note: 'curveNote', aria: 'curveAriaPrice', x: 'hoursAxis', y: 'priceAxis', line: 'curveLine',
      sweep: () => { const v = []; for (let h = 0.25; h <= 10.001; h += 0.25) v.push(h); return v; },
      item: (x) => ({ cat: st.cat, mat: st.mat, hrs: x, tier: st.tier, season: st.season }), you: () => st.hrs,
      value: (p) => Math.round(p.price), tick: (v) => '₹' + fmtNum(v), tipX: (x) => fmtNum(x, 2) + ' ' + t('hrsUnit'), tipY: (y) => inr(y) },
    orders: { sub: 'curveSubOrders', note: 'curveNoteOrders', aria: 'curveAriaOrders', x: 'seasonAxis', y: 'ordersAxis', line: 'curveLineOrders',
      sweep: () => { const v = []; for (let s = 0; s <= 1.0001; s += 0.025) v.push(Math.round(s * 1000) / 1000); return v; },
      item: (x) => ({ cat: st.cat, mat: st.mat, hrs: st.hrs, tier: st.tier, season: x }), you: () => st.season,
      value: (p) => Math.round(p.orders * 10) / 10, tick: (v) => fmtNum(v), tipX: (x) => pct(x), tipY: (y) => t('ordersPerWeek', { n: fmtNum(y, 1) }), xTick: (v) => pct(v) }
  };
  function renderCurveText() {
    const c = CURVES[st.curveMode];
    $('#curveSub').textContent = t(c.sub);
    $('#curveNote').textContent = t(c.note);
    $('#curveChart').setAttribute('aria-label', t(c.aria));
    $$('#curveSeg [data-mode]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.mode === st.curveMode)));
  }
  function drawCurve() {
    renderCurveText();
    if (!st.trained || !libs.chart()) return;
    const c = CURVES[st.curveMode], xs = c.sweep();
    const preds = predictBatch(xs.map(c.item));
    const line = xs.map((x, i) => ({ x, y: c.value(preds[i]) }));
    const you = c.you(), cur = predict(c.item(you));
    const data = { datasets: [
      { label: t(c.line), short: '', noEndLabel: true, data: line, showLine: true, borderColor: '#1B434D', borderWidth: 2, pointRadius: 0, tension: 0.2 },
      { label: t('curveYou'), short: t('curveYou'), data: [{ x: you, y: c.value(cur) }], pointRadius: 7, pointHoverRadius: 8, pointBackgroundColor: '#9EB83B', pointBorderColor: '#fff', pointBorderWidth: 2, showLine: false }
    ] };
    if (st.curveChart && st.curveChart.$mode === st.curveMode) { st.curveChart.data = data; st.curveChart.update('none'); return; }
    if (st.curveChart) { st.curveChart.destroy(); st.curveChart = null; }
    const o = baseOpts(t(c.x), t(c.y));
    o.plugins.legend.display = false;
    o.interaction = { mode: 'nearest', intersect: false };
    o.scales.y.ticks.callback = c.tick;
    if (c.xTick) { o.scales.x.ticks.callback = c.xTick; o.scales.x.min = 0; o.scales.x.max = 1; }
    o.plugins.tooltip.callbacks = { title: (it) => c.tipX(it[0].parsed.x), label: (ctx) => c.tipY(ctx.parsed.y) };
    st.curveChart = new Chart($('#curveChart'), { type: 'scatter', data, options: o, plugins: [endLabels] });
    st.curveChart.$mode = st.curveMode;
  }
  function setCurveMode(mode) {
    if (!CURVES[mode] || mode === st.curveMode) return;
    st.curveMode = mode;
    drawCurve();
  }

  /* ---------- training ---------- */
  function renderArch(model) {
    const layers = [['archIn', '8', t('archInSub')], ['archH1', '32', 'ReLU'], ['archH2', '16', 'ReLU'], ['archOut', '2', t('archOutSub')]];
    $('#arch').innerHTML = layers.map(([k, n, sub], i) => `${i ? `<span class="arrow">${icon('arrow')}</span>` : ''}<span class="layer"><b>${esc(t(k))} · ${n}</b><span>${esc(sub)}</span></span>`).join('') +
      (model ? `<span class="pill" style="margin-left:6px">${esc(t('params', { n: fmtNum(model.countParams()) }))}</span>` : '');
  }
  async function train() {
    if (st.training || !libs.tf()) return;
    st.training = true;
    const btn = $('#retrain'); btn.disabled = true;
    if (ML.pending) setStatus('trainQueued');
    return ML.exclusive(() => fitModel(btn)).catch(e => {
      console.error(e); setStatus('trainFail'); st.training = false; btn.disabled = false;
    });
  }
  async function fitModel(btn) {
    if (ML.has('cpu') && tf.getBackend() !== 'cpu') await tf.setBackend('cpu');
    const epochs = Number($('#inEpochs').value) || 120, lr = Number($('#inLr').value) || 0.01;
    disposeModel();
    st.trained = false;
    st.initSeed += 3;
    const model = buildModel(lr, st.initSeed);
    renderArch(model);
    resetLossChart();
    setStatus('trainRun', { e: fmtNum(0), n: fmtNum(epochs) });
    const xs = tf.tensor2d(st.Xtr), ys = tf.tensor2d(st.Ytr), xv = tf.tensor2d(st.Xva), yv = tf.tensor2d(st.Yva);
    const t0 = performance.now();
    try {
      await model.fit(xs, ys, {
        epochs, batchSize: 32, shuffle: true, validationData: [xv, yv],
        callbacks: {
          onEpochEnd: async (ep, logs) => {
            pushLoss(ep, logs.loss, logs.val_loss);
            setStatus('trainRun', { e: fmtNum(ep + 1), n: fmtNum(epochs) }, ' · MSE ' + fmtNum(logs.loss, 4));
            if (ep % 2 === 1) await tf.nextFrame();
          }
        }
      });
    } catch (e) {
      console.error(e);
      setStatus('trainFail');
      try { model.optimizer.dispose(); } catch (err) { /* ignore */ }
      model.dispose(); st.training = false; btn.disabled = false; return;
    } finally {
      tf.dispose([xs, ys, xv, yv]);
    }
    st.model = model; st.trained = true; st.training = false; btn.disabled = false;
    state.metrics.trainings++;
    API.track('train');
    evaluate();
    const secs = (performance.now() - t0) / 1000;
    st.doneInfo = { n: epochs, s: secs, rows: st.train.length };
    setStatus('trainDone', { n: fmtNum(epochs), s: fmtNum(secs, 1), rows: fmtNum(st.train.length) });
    renderMetrics();
    predictNow();
    memLine();
    BUS.emit('model');
  }
  function evaluate() {
    const out = ML.run('cpu', () => tf.tidy(() => st.model.predict(tf.tensor2d(st.Xva)).arraySync()));
    const inv = out.map(o => st.sy.invert(o));
    const pT = st.val.map(v => v.price), pP = inv.map(p => Math.exp(p[0]));
    const oT = st.val.map(v => v.orders), oP = inv.map(p => Math.max(0, Math.expm1(p[1])));
    const res = st.val.map((v, i) => Math.log(v.price) - inv[i][0]);
    const mu = res.reduce((a, b) => a + b, 0) / res.length;
    st.sigma = Math.sqrt(res.reduce((a, b) => a + (b - mu) ** 2, 0) / res.length);
    st.metrics = { r2p: DATAGEN.r2(pT, pP), maep: DATAGEN.mae(pT, pP), r2o: DATAGEN.r2(oT, oP), maeo: DATAGEN.mae(oT, oP) };
  }
  function renderMetrics() {
    const m = st.metrics;
    if (!m) { $('#metrics').innerHTML = ''; return; }
    const b = st.baseline;
    $('#metrics').innerHTML = [
      [fmtNum(m.r2p, 3), t('mR2p'), t('mVsLin', { v: fmtNum(b.r2p, 3) })],
      [inr(m.maep), t('mMaep'), t('mHeld', { n: fmtNum(st.val.length) })],
      [fmtNum(m.r2o, 3), t('mR2o'), t('mVsLin', { v: fmtNum(b.r2o, 3) })],
      [fmtNum(m.maeo, 1), t('mMaeo'), t('mPerWeek')]
    ].map(([v, l, s]) => `<div class="metric"><b>${esc(v)}</b><span>${esc(l)}</span><em>${esc(s)}</em></div>`).join('');
  }
  function memLine() {
    if (!libs.tf()) return;
    const mem = tf.memory();
    $('#memLine').textContent = t('memLine', { n: fmtNum(mem.numTensors), b: ML.pick('cpu') });
    $('#tfBackend').innerHTML = `${icon('cpu')}<span>TensorFlow.js ${esc(tf.version.tfjs)} · ${esc(ML.pick('cpu'))}</span>`;
  }

  /* ---------- inference ---------- */
  function predictBatch(items) {
    const X = items.map(it => st.sx.apply(DATAGEN.features(it)));
    const out = ML.run('cpu', () => tf.tidy(() => st.model.predict(tf.tensor2d(X)).arraySync()));
    return out.map(o => { const y = st.sy.invert(o); return { price: Math.exp(y[0]), orders: Math.max(0, Math.expm1(y[1])) }; });
  }
  const predict = (it) => predictBatch([it])[0];
  const round5 = (v) => Math.max(5, Math.round(v / 5) * 5);
  function suggest(cat) {
    if (!st.trained) return null;
    const d = DEFAULTS[cat] || DEFAULTS.craft;
    return round5(predict({ cat, mat: d.mat, hrs: d.hrs, tier: 1, season: st.season }).price);
  }

  function predictNow() {
    if (!st.trained) return;
    const p = predict({ cat: st.cat, mat: st.mat, hrs: st.hrs, tier: st.tier, season: st.season });
    const price = round5(p.price), lo = round5(p.price * Math.exp(-st.sigma)), hi = round5(p.price * Math.exp(st.sigma));
    const cost = st.mat + DATAGEN.PKG[st.tier].cost;
    const profit = price - cost, margin = profit / price, hourly = profit / st.hrs;
    const orders = Math.round(p.orders);
    const W = 4.33, direct = profit * orders * W, mid = (price * (1 - st.comm) - cost) * orders * W;
    st.last = { price, lo, hi, cost, profit, margin, hourly, orders, direct, mid };
    state.metrics.uplift = mid > 0 ? (direct - mid) / mid : null;
    $('#rPrice').innerHTML = `${inr(price)} <small>/ ${esc(t('unitWord'))}</small>`;
    $('#rRange').textContent = t('rRange', { lo: inr(lo), hi: inr(hi), s: fmtNum(st.sigma * 100, 0) });
    $('#rMargin').textContent = pct(margin);
    $('#rHourly').textContent = inr(hourly);
    $('#rOrders').textContent = '≈ ' + fmtNum(orders);
    const max = Math.max(direct, mid, 1);
    $('#cmp').innerHTML = [['mid', t('cmpMid'), mid], ['direct', t('cmpDirect'), direct]].map(([k, l, v]) =>
      `<div class="cmp-row ${k === 'direct' ? 'direct' : ''}"><span>${esc(l)}</span><span class="bar" style="width:${Math.max(2, (Math.max(v, 0) / max) * 100)}%"></span><b>${inr(v)}</b></div>`).join('');
    $('#cmpGain').textContent = mid > 0 ? t('cmpGain', { v: inr(direct - mid), p: pct((direct - mid) / mid) }) : t('cmpLoss');
    const c = DATAGEN.P[st.cat];
    const warn = [];
    if (st.mat < c.mat[0] * 0.8 || st.mat > c.mat[1] * 1.15 || st.hrs < c.hrs[0] * 0.8 || st.hrs > c.hrs[1] * 1.15) warn.push(t('warnRange', { cat: catName(st.cat) }));
    if (profit <= 0) warn.push(t('warnLoss'));
    else if (hourly < CONFIG.fairWage) warn.push(t('warnWage', { h: inr(hourly), w: inr(CONFIG.fairWage) }));
    $('#rWarn').hidden = !warn.length;
    $('#rWarnText').textContent = warn.join(' ');
    const card = t('priceCard', {
      cat: catName(st.cat), mat: inr(st.mat), hrs: fmtNum(st.hrs, 2), pkg: t('pkg' + st.tier), price: inr(price), lo: inr(lo), hi: inr(hi),
      profit: inr(profit), margin: pct(margin), orders: fmtNum(orders), direct: inr(direct), mid: inr(mid)
    });
    $('#sharePrice').dataset.text = card;
    $('#sharePrice').href = waLink(card);
    $('#copyPrice').dataset.text = card;
    drawCurve();
    memLine();
    BUS.emit('metrics');
  }
  const schedule = () => { cancelAnimationFrame(st.frame); st.frame = requestAnimationFrame(predictNow); };

  /* ---------- UI ---------- */
  function setFill(el) { el.style.setProperty('--pct', ((el.value - el.min) / (el.max - el.min)) * 100 + '%'); }
  function syncInputs() {
    $('#inMat').value = st.mat; $('#inHrs').value = st.hrs; $('#inSeason').value = Math.round(st.season * 100); $('#inComm').value = Math.round(st.comm * 100);
    ['#inMat', '#inHrs', '#inSeason', '#inComm'].forEach(s => setFill($(s)));
    $('#outMat').textContent = inr(st.mat);
    $('#outHrs').textContent = fmtNum(st.hrs, st.hrs % 1 ? 2 : 0) + ' ' + t('hrsUnit');
    $('#outSeason').textContent = pct(st.season);
    $('#outComm').textContent = pct(st.comm);
    $$('#catPick button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.cat === st.cat)));
    $$('#pkgSeg button').forEach(b => b.setAttribute('aria-pressed', String(Number(b.dataset.v) === st.tier)));
    $$('#festChips button').forEach(b => b.setAttribute('aria-pressed', String(Math.abs(Number(b.dataset.v) - st.season * 100) < 1)));
  }
  function renderControls() {
    $('#catPick').innerHTML = CAT_KEYS.map(c => `<button type="button" data-cat="${c}" aria-pressed="${c === st.cat}">${icon(c)}<span>${esc(catName(c))}</span></button>`).join('');
    $('#festChips').innerHTML = FESTS.map(([k, v]) => `<button type="button" class="chip" data-v="${v}" aria-pressed="false">${esc(t(k))}</button>`).join('');
    renderArch(st.model);
    syncInputs();
  }
  function renderTable() {
    const rows = st.showAll ? st.rows : st.rows.slice(0, 8);
    const pk = ['pkg0', 'pkg1', 'pkg2'];
    $('#dataTable').innerHTML = `<table class="data"><thead><tr>
      <th>${esc(t('tId'))}</th><th>${esc(t('tMonth'))}</th><th>${esc(t('tDistrict'))}</th><th>${esc(t('tSeller'))}</th><th>${esc(t('tCat'))}</th><th>${esc(t('tItem'))}</th>
      <th class="n">${esc(t('tMat'))}</th><th class="n">${esc(t('tHrs'))}</th><th>${esc(t('tPkg'))}</th><th class="n">${esc(t('tSeason'))}</th><th class="n">${esc(t('tPrice'))}</th><th class="n">${esc(t('tOrders'))}</th></tr></thead>
      <tbody>${rows.map(r => { const mr = state.lang === 'mr'; return `<tr${r.real ? ' class="real"' : ''}><td>${esc(r.id)}${r.real ? ` <span class="pill pill-lime tiny-pill">${esc(t('realRow'))}</span>` : ''}</td><td>${esc(mr ? r.monthMr : r.month)}</td><td>${esc(mr ? r.districtMr : r.district)}</td><td>${esc(r.seller === 'SHG' ? t('tagShg') : t('tagInd'))}</td><td>${esc(catName(r.cat))}</td><td>${esc(mr ? r.itemMr : r.item)}</td>
        <td class="n">${inr(r.mat)}</td><td class="n">${fmtNum(r.hrs, 2)}</td><td>${esc(t(pk[r.tier]))}</td><td class="n">${fmtNum(r.season, 2)}</td><td class="n">${inr(r.price)}</td><td class="n">${fmtNum(r.orders)}</td></tr>`; }).join('')}</tbody></table>`;
    $('#dataSub').textContent = st.server
      ? t('dataSubLive', { n: fmtNum(st.rows.length), syn: fmtNum(st.nSyn), real: fmtNum(st.nReal), tr: fmtNum(st.train.length), va: fmtNum(st.val.length) })
      : t('dataSub', { n: fmtNum(st.rows.length), tr: fmtNum(st.train.length), va: fmtNum(st.val.length) });
    $('#dataNote').textContent = t('dataNote', { w: inr(CONFIG.fairWage) });
    $('#toggleRows').textContent = st.showAll ? t('showFew') : t('showAll');
  }

  function bind() {
    $('#priceForm').addEventListener('submit', e => e.preventDefault());
    $('#catPick').addEventListener('click', e => {
      const b = e.target.closest('[data-cat]'); if (!b) return;
      st.cat = b.dataset.cat; st.mat = DEFAULTS[st.cat].mat; st.hrs = DEFAULTS[st.cat].hrs;
      syncInputs(); schedule();
    });
    $('#inMat').addEventListener('input', e => { st.mat = Number(e.target.value); syncInputs(); schedule(); });
    $('#inHrs').addEventListener('input', e => { st.hrs = Number(e.target.value); syncInputs(); schedule(); });
    $('#inSeason').addEventListener('input', e => { st.season = Number(e.target.value) / 100; syncInputs(); schedule(); });
    $('#inComm').addEventListener('input', e => { st.comm = Number(e.target.value) / 100; syncInputs(); schedule(); });
    $('#pkgSeg').addEventListener('click', e => { const b = e.target.closest('[data-v]'); if (!b) return; st.tier = Number(b.dataset.v); syncInputs(); schedule(); });
    $('#festChips').addEventListener('click', e => { const b = e.target.closest('[data-v]'); if (!b) return; st.season = Number(b.dataset.v) / 100; syncInputs(); schedule(); });
    $('#retrain').addEventListener('click', train);
    $('#copyCsv').addEventListener('click', () => copyText(DATAGEN.toCSV(st.rows)));
    $('#toggleRows').addEventListener('click', () => { st.showAll = !st.showAll; renderTable(); });
    $('#sharePrice').addEventListener('click', (e) => {
      if (!$('#sharePrice').dataset.text) { e.preventDefault(); toast(t('trainWaitShort'), 'info'); }
    });
    $('#copyPrice').addEventListener('click', () => {
      const text = $('#copyPrice').dataset.text;
      if (text) copyText(text); else toast(t('trainWaitShort'), 'info');
    });
    $('#curveSeg').addEventListener('click', (e) => { const b = e.target.closest('[data-mode]'); if (b) setCurveMode(b.dataset.mode); });
    BUS.on('settings', () => { if (st.last) predictNow(); renderTable(); });
    BUS.on('lang', () => {
      renderControls(); renderTable(); renderMetrics();
      const ss = st.status;
      if (ss.key === 'trainDone' && st.doneInfo) setStatus('trainDone', { n: fmtNum(st.doneInfo.n), s: fmtNum(st.doneInfo.s, 1), rows: fmtNum(st.doneInfo.rows) });
      else if (ss.key !== 'trainRun') setStatus(ss.key, ss.vars, ss.extra);
      if (st.lossChart) {
        st.lossChart.data.datasets[0].label = t('trainLoss'); st.lossChart.data.datasets[0].short = t('trainShort');
        st.lossChart.data.datasets[1].label = t('valLoss'); st.lossChart.data.datasets[1].short = t('valShort');
        st.lossChart.options.scales.x.title.text = t('epoch'); st.lossChart.options.scales.y.title.text = t('mseAxis'); st.lossChart.options.locale = locale();
        st.lossChart.update('none');
      }
      if (st.curveChart) { st.curveChart.destroy(); st.curveChart = null; }   // redrawn with the new language's axis titles
      renderCurveText();
      if (st.trained) predictNow();
      else $('#rRange').textContent = t(libs.tf() ? 'rTraining' : 'tfMissing');
    });
  }
  function init() {
    prepareData();
    renderControls();
    renderTable();
    renderMetrics();
  }
  function startTraining() {
    if (st.started) return;
    st.started = true;
    if (!libs.tf()) {
      setStatus('tfMissing');
      $('#rRange').textContent = t('tfMissing');
      ['#lossChart', '#curveChart'].forEach(sel => { const c = $(sel); if (c) c.replaceWith(Object.assign(document.createElement('p'), { className: 'small muted', textContent: t('tfMissing') })); });
      return;
    }
    memLine();
    train();
  }
  /** New training data from the server: rebuild the dataset, and retrain if a model already exists. */
  function setData(price, { announce = false } = {}) {
    st.server = price;
    if (st.training) { st.rerun = true; return; }
    prepareData();
    renderTable();
    if (st.trained) { if (announce) setStatus('dataRefresh'); train(); }
  }
  BUS.on('model', () => { if (st.rerun) { st.rerun = false; setData(st.server, { announce: true }); } });

  /** The fair price for a listing draft (null until the model has trained). */
  function priceFor(it) {
    if (!st.trained) return null;
    const p = predict(it), round = (v) => round5(v);
    return { price: round(p.price), lo: round(p.price * Math.exp(-st.sigma)), hi: round(p.price * Math.exp(st.sigma)), orders: p.orders, rows: st.train.length };
  }
  return { init, bind, startTraining, setData, suggest, predict, priceFor, get trained() { return st.trained; }, get training() { return st.training; }, get started() { return st.started; }, get season() { return st.season; }, get last() { return st.last; }, DEFAULTS };
})();
