/* ------------------------------------------------------------------
   AI Catalogue Assistant: MobileNet (pre-trained CNN) auto-tagger,
   photo readiness metrics (TF.js ops) and bilingual listing writer.
   A listing is always published under a signed-in account: a seller's
   own shop, or (for the admin) the seller she picks. The draft price
   comes from the Seller Studio MLP once it has trained.
------------------------------------------------------------------- */
const CATALOGUE = (() => {
  // TF Hub files that @tensorflow-models/mobilenet@2.1.1 loads for { version: 2, alpha: 1.0 }
  const MOBILENET_V2 = 'https://tfhub.dev/google/imagenet/mobilenet_v2_100_224/classification/2/model.json?tfjs-format=file';
  // [ImageNet synonym, SheSell category, weight, product key]
  const RULES = [
    ['pretzel', 'food', 1, 'snack'], ['bagel', 'food', 1, 'snack'], ['french loaf', 'food', 1, 'snack'], ['dough', 'food', 0.9, 'snack'], ['bakery', 'food', 0.9, 'snack'],
    ['pizza', 'food', 0.9, 'meal'], ['potpie', 'food', 0.9, 'meal'], ['burrito', 'food', 0.9, 'snack'], ['hotdog', 'food', 0.8, 'snack'], ['cheeseburger', 'food', 0.8, 'snack'],
    ['meat loaf', 'food', 0.8, 'meal'], ['mashed potato', 'food', 0.8, 'meal'], ['guacamole', 'food', 0.8, 'meal'], ['carbonara', 'food', 0.8, 'meal'], ['consomme', 'food', 0.8, 'meal'],
    ['hot pot', 'food', 0.8, 'meal'], ['plate', 'food', 0.8, 'meal'], ['tray', 'food', 0.6, 'snack'], ['soup bowl', 'food', 0.7, 'meal'], ['mixing bowl', 'food', 0.6, 'meal'],
    ['wok', 'food', 0.6, 'meal'], ['frying pan', 'food', 0.6, 'meal'], ['dutch oven', 'food', 0.5, 'meal'], ['crock pot', 'food', 0.5, 'meal'], ['caldron', 'food', 0.5, 'meal'],
    ['trifle', 'food', 0.9, 'sweet'], ['ice cream', 'food', 0.8, 'sweet'], ['ice lolly', 'food', 0.7, 'sweet'], ['chocolate sauce', 'food', 0.8, 'sweet'], ['confectionery', 'food', 0.9, 'sweet'],
    ['espresso', 'food', 0.6, 'snack'], ['cup', 'food', 0.6, 'snack'], ['coffee mug', 'food', 0.5, 'snack'], ['eggnog', 'food', 0.6, 'snack'], ['packet', 'food', 0.6, 'snack'],
    ['pop bottle', 'food', 0.5, 'preserve'], ['water bottle', 'food', 0.4, 'preserve'], ['pill bottle', 'food', 0.4, 'preserve'], ['mortar', 'food', 0.4, 'meal'], ['strainer', 'food', 0.4, 'meal'], ['saltshaker', 'food', 0.4, 'snack'],
    ['orange', 'agri', 1, 'orange'], ['lemon', 'agri', 1, 'citrus'], ['banana', 'agri', 1, 'banana'], ['granny smith', 'agri', 1, 'fruit'], ['strawberry', 'agri', 1, 'fruit'],
    ['fig', 'agri', 1, 'fruit'], ['pineapple', 'agri', 1, 'fruit'], ['jackfruit', 'agri', 1, 'fruit'], ['custard apple', 'agri', 1, 'fruit'], ['pomegranate', 'agri', 1, 'fruit'],
    ['head cabbage', 'agri', 1, 'veg'], ['broccoli', 'agri', 1, 'veg'], ['cauliflower', 'agri', 1, 'veg'], ['zucchini', 'agri', 1, 'veg'], ['spaghetti squash', 'agri', 1, 'veg'],
    ['acorn squash', 'agri', 1, 'veg'], ['butternut squash', 'agri', 1, 'veg'], ['cucumber', 'agri', 1, 'veg'], ['artichoke', 'agri', 1, 'veg'], ['bell pepper', 'agri', 1, 'veg'],
    ['cardoon', 'agri', 0.9, 'veg'], ['mushroom', 'agri', 0.9, 'veg'], ['corn', 'agri', 1, 'grain'], ['ear', 'agri', 1, 'grain'], ['hay', 'agri', 0.8, 'grain'], ['rapeseed', 'agri', 0.8, 'grain'],
    ['acorn', 'agri', 0.5, 'fruit'], ['hip', 'agri', 0.5, 'fruit'], ['buckeye', 'agri', 0.4, 'fruit'], ['grocery store', 'agri', 0.6, 'veg'], ['honeycomb', 'agri', 0.9, 'honey'], ['crate', 'agri', 0.3, 'veg'],
    ['jersey', 'tailoring', 1, 'garment'], ['sweatshirt', 'tailoring', 1, 'garment'], ['cardigan', 'tailoring', 1, 'garment'], ['kimono', 'tailoring', 1, 'garment'], ['abaya', 'tailoring', 1, 'garment'],
    ['poncho', 'tailoring', 1, 'garment'], ['gown', 'tailoring', 1, 'garment'], ['apron', 'tailoring', 1, 'garment'], ['bib', 'tailoring', 0.8, 'garment'], ['pajama', 'tailoring', 1, 'garment'],
    ['suit', 'tailoring', 0.9, 'garment'], ['cloak', 'tailoring', 0.9, 'garment'], ['stole', 'tailoring', 1, 'saree'], ['sarong', 'tailoring', 1, 'saree'], ['overskirt', 'tailoring', 1, 'garment'],
    ['hoopskirt', 'tailoring', 1, 'garment'], ['miniskirt', 'tailoring', 1, 'garment'], ['trench coat', 'tailoring', 0.9, 'garment'], ['lab coat', 'tailoring', 0.8, 'garment'], ['fur coat', 'tailoring', 0.8, 'garment'],
    ['academic gown', 'tailoring', 0.8, 'garment'], ['vestment', 'tailoring', 0.9, 'garment'], ['military uniform', 'tailoring', 0.7, 'garment'], ['jean', 'tailoring', 0.9, 'garment'], ['brassiere', 'tailoring', 0.9, 'garment'],
    ['maillot', 'tailoring', 0.8, 'garment'], ['bow tie', 'tailoring', 0.7, 'garment'], ['windsor tie', 'tailoring', 0.7, 'garment'], ['sock', 'tailoring', 0.6, 'garment'], ['mitten', 'tailoring', 0.6, 'garment'],
    ['handkerchief', 'tailoring', 0.7, 'garment'], ['quilt', 'tailoring', 0.9, 'quilt'], ['wool', 'tailoring', 0.7, 'garment'], ['velvet', 'tailoring', 0.7, 'garment'], ['sewing machine', 'tailoring', 1, 'stitching'], ['thimble', 'tailoring', 0.6, 'stitching'],
    ['vase', 'craft', 1, 'pottery'], ['pot', 'craft', 1, 'pottery'], ['pitcher', 'craft', 1, 'pottery'], ['water jug', 'craft', 1, 'pottery'], ['whiskey jug', 'craft', 0.9, 'pottery'],
    ['piggy bank', 'craft', 0.8, 'pottery'], ['teapot', 'craft', 0.6, 'pottery'], ['purse', 'craft', 1, 'bag'], ['mailbag', 'craft', 1, 'bag'], ['backpack', 'craft', 0.9, 'bag'],
    ['wallet', 'craft', 0.9, 'bag'], ['shopping basket', 'craft', 0.8, 'basket'], ['hamper', 'craft', 0.9, 'basket'], ['necklace', 'craft', 1, 'jewellery'], ['chain', 'craft', 0.6, 'jewellery'],
    ['candle', 'craft', 0.9, 'lamp'], ['lampshade', 'craft', 0.8, 'lamp'], ['prayer rug', 'craft', 0.9, 'mat'], ['doormat', 'craft', 0.8, 'mat'], ['mask', 'craft', 0.7, 'decor'],
    ['jigsaw puzzle', 'craft', 0.5, 'art'], ['teddy', 'craft', 0.8, 'toy'], ['pinwheel', 'craft', 0.7, 'decor'], ['maraca', 'craft', 0.7, 'decor'], ['drum', 'craft', 0.6, 'decor'],
    ['chime', 'craft', 0.7, 'decor'], ['sandal', 'craft', 0.9, 'footwear'], ['clog', 'craft', 0.8, 'footwear'], ['loafer', 'craft', 0.7, 'footwear'], ['wooden spoon', 'craft', 0.7, 'kitchenware'],
    ['ladle', 'craft', 0.5, 'kitchenware'], ['birdhouse', 'craft', 0.6, 'woodcraft'], ['chest', 'craft', 0.6, 'woodcraft'], ['umbrella', 'craft', 0.4, 'decor']
  ];
  const RULE_MAP = new Map(RULES.map(r => [r[0], r]));
  const PERISH = { food: 0.5, tailoring: 0, craft: 0, agri: 0.85 };
  const SAMPLES = [
    { key: 'oranges', name: 'sOranges', cat: 'agri' },
    { key: 'pot', name: 'sPot', cat: 'craft' },
    { key: 'chakli', name: 'sChakli', cat: 'food' },
    { key: 'kurta', name: 'sKurta', cat: 'tailoring' }
  ];
  const st = { model: null, loading: false, ready: false, failed: false, blocked: false, version: '', promise: null, current: null, result: null,
    samplesDone: false, warm: false, sellerId: '', leadTouched: false, priceTouched: false, published: null };

  /* ---------- model ---------- */
  function status(kind, text) {
    $('#cnnDot').className = 'status-dot ' + (kind || '');
    $('#cnnText').textContent = text;
  }
  function failLoad(reason) {
    st.loading = false; st.failed = true; st.promise = null; st.reason = reason;
    status('err', t(reason));
    $('#cnnRetry').hidden = false;
    renderResults();
    return null;
  }
  function load() {
    if (st.ready) return Promise.resolve(st.model);
    if (st.promise) return st.promise;
    st.loading = true; st.failed = false;
    $('#cnnRetry').hidden = true;
    status('busy', t('cnnLoading'));
    st.promise = (async () => {
      // TF.js + the MobileNet wrapper come from the CDN the first time the AI Catalogue opens
      try { await LOADER.need('mobilenet'); } catch (e) { console.warn(e); return failLoad('cnnLibMissing'); }
      // Phase 1, outside the backend queue so the price model can keep training: download the
      // MobileNet v2 graph and weights (the same TF Hub files mobilenet.load() fetches).
      let artifacts = null;
      try { artifacts = await tf.io.http(MOBILENET_V2).load(); } catch (e) { console.warn('MobileNet download failed', e); }
      if (ML.pending) status('busy', t('cnnQueued'));
      // Phase 2, queued: create the weight tensors and run mobilenet's own warm-up on WebGL.
      const tries = [
        artifacts ? { label: 'MobileNet v2', cfg: { version: 2, alpha: 1.0, modelUrl: tf.io.fromMemory(artifacts), inputRange: [0, 1] } } : { label: 'MobileNet v2', cfg: { version: 2, alpha: 1.0 } },
        { label: 'MobileNet v1', cfg: { version: 1, alpha: 1.0 } }
      ];
      await ML.exclusive(async () => {
        status('busy', t(artifacts ? 'cnnWarm' : 'cnnLoading'));
        if (ML.has('webgl') && tf.getBackend() !== 'webgl') await tf.setBackend('webgl');
        for (const a of tries) {
          try {
            st.model = await mobilenet.load(a.cfg);
            st.version = a.label; st.ready = true; break;
          } catch (e) { console.warn('MobileNet load failed', a.label, e); }
        }
        if (!st.ready) return;
        status('busy', t('cnnWarm'));
        try { const w = document.createElement('canvas'); w.width = w.height = 224; await ML.run('webgl', () => st.model.classify(w, 1)); st.warm = true; } catch (e) { /* warm-up is best effort */ }
      });
      if (!st.ready) return failLoad(st.blocked ? 'cnnBlocked' : 'cnnFail');
      st.loading = false;
      status('ok', t('cnnReady', { v: st.version, b: ML.pick('webgl') }));
      if (st.current) analyze(st.current.canvas, st.current.meta);
      return st.model;
    })();
    return st.promise;
  }

  /* ---------- photo metrics ---------- */
  function photoStats(canvas) {
    const S = 256, k = Math.min(1, S / Math.max(canvas.width, canvas.height));
    const c = document.createElement('canvas');
    c.width = Math.max(8, Math.round(canvas.width * k)); c.height = Math.max(8, Math.round(canvas.height * k));
    c.getContext('2d').drawImage(canvas, 0, 0, c.width, c.height);
    if (libs.tf()) try {
      // small image ops: the CPU backend avoids a GPU upload + readback for three numbers
      const [mean, std, lapVar] = ML.run('cpu', () => {
        const packed = tf.tidy(() => {
          const img = tf.browser.fromPixels(c).toFloat();
          const gray = img.mul(tf.tensor1d([0.299, 0.587, 0.114])).sum(2);
          const m = tf.moments(gray);
          const lap = tf.conv2d(gray.expandDims(0).expandDims(-1), tf.tensor4d([0, 1, 0, 1, -4, 1, 0, 1, 0], [3, 3, 1, 1]), 1, 'valid');
          return tf.stack([m.mean, m.variance.sqrt(), tf.moments(lap).variance]);
        });
        const v = packed.dataSync();
        packed.dispose();
        return v;
      });
      return { mean, std, lapVar, via: 'tf' };
    } catch (e) { console.warn('TF photo stats failed, using JS', e); }
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data, W = c.width, H = c.height;
    const g = new Float32Array(W * H);
    let s = 0;
    for (let i = 0; i < W * H; i++) { g[i] = 0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2]; s += g[i]; }
    const mean = s / g.length;
    let v = 0; for (let i = 0; i < g.length; i++) v += (g[i] - mean) ** 2;
    let ls = 0, ls2 = 0, n = 0;
    for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
      const i = y * W + x, l = g[i - W] + g[i + W] + g[i - 1] + g[i + 1] - 4 * g[i];
      ls += l; ls2 += l * l; n++;
    }
    return { mean, std: Math.sqrt(v / g.length), lapVar: ls2 / n - (ls / n) ** 2, via: 'js' };
  }
  function readiness(meta, stats, preds, mapping) {
    const minSide = Math.min(meta.w, meta.h), ratio = minSide / Math.max(meta.w, meta.h);
    const res = minSide < 240 ? clamp((minSide - 64) / (240 - 64), 0, 1) * 0.35 : clamp(0.35 + 0.65 * (Math.log2(minSide) - Math.log2(240)) / (Math.log2(1024) - Math.log2(240)), 0, 1);
    const L = stats.mean;
    const bright = L < 105 ? clamp((L - 40) / 65, 0, 1) : L > 185 ? clamp((235 - L) / 50, 0, 1) : 1;
    const contrast = clamp((stats.std - 18) / (55 - 18), 0, 1);
    const sharp = clamp((Math.log10(Math.max(stats.lapVar, 1)) - 0.9) / (2.3 - 0.9), 0, 1);
    const frame = clamp((ratio - 0.45) / 0.55, 0, 1);
    const parts = [['resolution', res, 0.15], ['brightness', bright, 0.2], ['contrast', contrast, 0.15], ['sharpness', sharp, 0.2], ['framing', frame, 0.1]];
    if (preds && mapping) parts.push(['subject', clamp(0.5 * clamp(preds[0].probability / 0.6, 0, 1) + 0.5 * mapping.conf, 0, 1), 0.2]);
    const wsum = parts.reduce((a, p) => a + p[2], 0);
    const score = parts.reduce((a, p) => a + p[1] * p[2], 0) / wsum;
    return { score, parts, dark: L < 105, glare: L > 185 };
  }

  /* ---------- CNN -> SheSell category ---------- */
  function mapCats(preds) {
    const score = { food: 0, tailoring: 0, craft: 0, agri: 0 };
    let best = null, mass = 0;
    preds.forEach(p => {
      const syns = p.className.toLowerCase().split(',').map(s => s.trim());
      let rule = null;
      for (const s of syns) { if (RULE_MAP.has(s)) { rule = RULE_MAP.get(s); break; } }
      if (!rule) return;
      const v = p.probability * rule[2];
      score[rule[1]] += v; mass += v;
      if (!best || v > best.v) best = { v, cat: rule[1], key: rule[3], cls: syns[0] };
    });
    const total = preds.reduce((a, p) => a + p.probability, 0) || 1;
    const ranked = CAT_KEYS.map(c => ({ c, v: mass ? score[c] / mass : 0 })).sort((a, b) => b.v - a.v);
    const cat = mass > 0.02 ? ranked[0].c : null;
    return { cat, ranked, conf: mass ? ranked[0].v * Math.min(1, mass / total / 0.35) : 0, coverage: mass / total, key: best && best.cat === cat ? best.key : null };
  }

  /* ---------- rendering ---------- */
  function drawPreview(canvas) {
    const cv = $('#cvPreview'), k = Math.min(1, 640 / Math.max(canvas.width, canvas.height));
    cv.width = Math.round(canvas.width * k); cv.height = Math.round(canvas.height * k);
    cv.getContext('2d').drawImage(canvas, 0, 0, cv.width, cv.height);
    cv.hidden = false; $('#dropHint').hidden = true; $('#changePhoto').hidden = false;
  }
  function dial(score) {
    const r = 50, c = 2 * Math.PI * r, v = clamp(score, 0, 1);
    const col = v >= 0.75 ? '#9EB83B' : v >= 0.5 ? '#E3A83B' : '#C2603A';
    $('#dial').innerHTML = `<circle cx="60" cy="60" r="${r}" fill="none" stroke="#E6ECDA" stroke-width="12"/>
      <circle cx="60" cy="60" r="${r}" fill="none" stroke="${col}" stroke-width="12" stroke-linecap="round" stroke-dasharray="${(c * v).toFixed(1)} ${c.toFixed(1)}" transform="rotate(-90 60 60)"/>
      <text x="60" y="62" text-anchor="middle" font-size="30" font-weight="800" fill="#0F2A31" font-family="Mukta, sans-serif">${esc(fmtNum(Math.round(v * 100)))}</text>
      <text x="60" y="82" text-anchor="middle" font-size="12" fill="#64767A" font-family="Mukta, sans-serif">/ ${esc(fmtNum(100))}</text>`;
    $('#dial').setAttribute('aria-label', t('readyAria', { n: fmtNum(Math.round(v * 100)) }));
  }
  function renderResults() {
    const r = st.result;
    if (!r) {
      $('#preds').innerHTML = `<p class="small muted">${esc(st.failed ? t(st.reason || 'cnnFail') : t('predEmpty'))}</p>`;
      $('#catMap').innerHTML = ''; $('#subscores').innerHTML = ''; $('#tips').innerHTML = ''; dial(0);
      return;
    }
    if (r.preds) {
      $('#preds').innerHTML = r.preds.slice(0, 3).map(p => `<div class="pred"><span class="name">${esc(p.className.split(',')[0])}</span><span class="pct">${pct(p.probability, 1)}</span><span class="meter teal"><i style="width:${(p.probability * 100).toFixed(1)}%"></i></span></div>`).join('');
    } else {
      $('#preds').innerHTML = `<p class="small muted">${esc(st.failed ? t(st.reason || 'cnnFail') : t('cnnWaitPred'))}</p>`;
    }
    const m = r.mapping, chosen = r.override || (m && m.cat);
    $('#catMap').innerHTML = m ? m.ranked.map(x => `<div class="pred"><span class="name"><span class="status-dot cat-dot-${x.c}"></span> ${esc(catName(x.c))}${x.c === chosen ? ` <span class="pill pill-lime" style="margin-left:4px">${icon('check')}${esc(t('chosen'))}</span>` : ''}</span><span class="pct">${pct(x.v)}</span><span class="meter"><i style="width:${(x.v * 100).toFixed(1)}%"></i></span></div>`).join('') +
      (m.cat ? '' : `<p class="small muted">${esc(t('mapUnsure'))}</p>`) : `<p class="small muted">${esc(st.failed ? t('mapOffline') : t('cnnWaitPred'))}</p>`;
    $('#catOverride').innerHTML = `<option value="">${esc(t('autoCat'))}</option>` + CAT_KEYS.map(c => `<option value="${c}" ${r.override === c ? 'selected' : ''}>${esc(catName(c))}</option>`).join('');
    const rd = r.ready;
    dial(rd.score);
    const names = { resolution: t('sRes'), brightness: t('sBright'), contrast: t('sContrast'), sharpness: t('sSharp'), framing: t('sFrame'), subject: t('sSubject') };
    $('#subscores').innerHTML = rd.parts.map(([k, v]) => `<div class="subscore"><span>${esc(names[k])}</span><b class="num">${esc(fmtNum(Math.round(v * 100)))}</b><span class="meter"><i style="width:${(v * 100).toFixed(0)}%;background:${v >= 0.6 ? 'var(--lime)' : v >= 0.35 ? 'var(--mustard)' : 'var(--terra)'}"></i></span></div>`).join('');
    const tips = [];
    rd.parts.forEach(([k, v]) => {
      if (v >= 0.6) return;
      if (k === 'brightness') tips.push(rd.dark ? t('tipDark') : t('tipBright'));
      else tips.push(t({ resolution: 'tipRes', contrast: 'tipContrast', sharpness: 'tipSharp', framing: 'tipFrame', subject: 'tipSubject' }[k]));
    });
    if (!tips.length) tips.push(t('tipGreat'));
    $('#tips').innerHTML = tips.map(x => `<li>${icon('spark')}<span>${esc(x)}</span></li>`).join('');
  }

  /* ---------- who the listing is for ---------- */
  const sellerById = (id) => state.sellers.find(s => s.id === id) || null;
  function boundSeller() {
    if (isAdmin()) return sellerById(st.sellerId);
    return mySeller();
  }
  const nameOf = (s, lang) => (lang === 'mr' && s.nameMr ? s.nameMr : s.name);
  const placeOf = (s, lang) => (lang === 'mr' && s.placeMr ? s.placeMr : s.place) || '';
  function renderBind() {
    const el = $('#bindRow');
    if (isAdmin()) {
      const opts = state.sellers.filter(s => s.active).map(s => `<option value="${esc(s.id)}"${s.id === st.sellerId ? ' selected' : ''}>${esc(nameOf(s, state.lang))} · ${esc(placeOf(s, state.lang))}${s.verified ? '' : ' · ' + esc(t('bindUnverified'))}</option>`).join('');
      el.innerHTML = `<img src="${AVATARS.shg}" alt=""><label class="stack-sm"><b class="small">${esc(t('bindAdminLabel'))}</b><select class="input" id="lSellerId"><option value="">${esc(t('bindChoose'))}</option>${opts}</select></label><span class="small muted">${esc(t('bindAdminNote'))}</span>`;
      return;
    }
    const s = mySeller();
    el.innerHTML = s ? `<img src="${s.type === 'shg' ? AVATARS.shg : AVATARS.mom}" alt="">
      <div class="stack-sm"><span class="tiny muted">${esc(t('bindSellerLabel'))}</span><b>${esc(nameOf(s, state.lang))}</b><span class="small muted">${esc(s.type === 'shg' ? t('typeShg') : t('typeInd'))} · ${esc(placeOf(s, state.lang))}</span></div>
      <span class="pill ${s.verified ? 'pill-lime' : ''}">${icon(s.verified ? 'shield' : 'clock')}<span>${esc(t(s.verified ? 'bindVerified' : 'bindReview'))}</span></span>` : '';
  }

  /* ---------- availability / lead time ---------- */
  function renderLeadSelect() {
    const cur = $('#lLead').value || DEFAULT_LEAD[st.cat || 'craft'];
    $('#lLead').innerHTML = LEADS.map(k => `<option value="${k}"${k === cur ? ' selected' : ''}>${esc(k === 'custom' ? t('leadCustom') : t('lead_' + k))}</option>`).join('');
    toggleCustomLead();
  }
  function toggleCustomLead() { $$('[data-custom-lead]').forEach(f => { f.hidden = $('#lLead').value !== 'custom'; }); }
  const leadFor = (lang, d) => (d.lead === 'custom' ? (lang === 'mr' ? d.leadTextMr || d.leadText : d.leadText) : (I18N[lang]['lead_' + d.lead] || I18N.en['lead_' + d.lead]));

  /* ---------- fair price from the Seller Studio MLP ---------- */
  function mlpInputs() {
    const d = STUDIO.DEFAULTS[st.cat] || STUDIO.DEFAULTS.craft;
    return { cat: st.cat, mat: Math.max(1, Number($('#lMat').value) || d.mat), hrs: Math.max(0.25, Number($('#lHrs').value) || d.hrs), tier: Number($('#lTier').value) || 0, season: STUDIO.season };
  }
  function renderPrice(apply) {
    const src = $('#priceSrc'), range = $('#mlpRange');
    const p = st.result ? STUDIO.priceFor(mlpInputs()) : null;
    if (p) {
      src.textContent = t('priceSrcMlp', { rows: fmtNum(p.rows) }); src.className = 'small ok';
      range.textContent = t('mlpRange', { lo: inr(p.lo), hi: inr(p.hi), o: fmtNum(Math.round(p.orders)) });
      if (apply || !st.priceTouched) { $('#lPrice').value = p.price; st.priceTouched = false; }
    } else {
      src.className = 'small muted';
      src.textContent = t(STUDIO.started && !libs.tf() ? 'priceSrcFallback' : 'priceSrcTraining');
      range.textContent = '';
      if (st.result && (apply || !st.priceTouched || !$('#lPrice').value)) $('#lPrice').value = ({ food: 150, tailoring: 450, craft: 350, agri: 80 }[st.cat]);
    }
    $('#useMlp').disabled = !p;
  }

  /* ---------- listing ---------- */
  function names(cat, key) {
    const k = key && I18N.en['pn_' + key] ? 'pn_' + key : 'pn_' + cat;
    return { en: I18N.en[k], mr: I18N.mr[k] };
  }
  function listingText(lang, d) {
    const tl = (k, v) => { let s = I18N[lang][k] ?? I18N.en[k]; return s.replace(/\{(\w+)\}/g, (_, x) => v[x] ?? ''); };
    const price = '₹' + new Intl.NumberFormat(lang === 'mr' ? 'mr-IN' : 'en-IN').format(d.price);
    const s = d.seller;
    return tl('listTpl', {
      name: lang === 'mr' ? d.nameMr : d.name, seller: s ? nameOf(s, lang) : tl('sellerDefault', {}), place: s ? placeOf(s, lang) : tl('placeDefault', {}),
      blurb: I18N[lang]['blurb_' + d.cat], lead: leadFor(lang, d), price, tag: I18N.en['tag_' + d.cat], link: s ? shopUrl('?seller=' + encodeURIComponent(s.id)) : shopUrl()
    });
  }
  function fillListing(keepUser) {
    const r = st.result;
    if (!r) return;
    const cat = r.override || (r.mapping && r.mapping.cat) || (!r.preds && r.meta.sampleCat) || 'craft';
    const n = names(cat, r.override ? null : (r.mapping && r.mapping.key));
    const sample = r.meta.sample ? SAMPLES.find(s => s.key === r.meta.sample) : null;
    const changedCat = st.cat !== cat;
    st.cat = cat;
    if (!keepUser) {
      $('#lName').value = sample ? I18N.en[sample.name] : n.en;
      $('#lNameMr').value = sample ? I18N.mr[sample.name] : n.mr;
      const d = STUDIO.DEFAULTS[cat] || STUDIO.DEFAULTS.craft;
      if (changedCat || !$('#lMat').value) { $('#lMat').value = d.mat; $('#lHrs').value = d.hrs; }
      if (!st.leadTouched) $('#lLead').value = DEFAULT_LEAD[cat];
      st.priceTouched = false;
    }
    renderLeadSelect();
    renderPrice(false);
    updateText();
    $('#publish').disabled = false;
    $('#pubNote').hidden = true;
  }
  function draftData() {
    const s = boundSeller();
    return {
      cat: st.cat, name: $('#lName').value.trim() || I18N.en['pn_' + st.cat], nameMr: $('#lNameMr').value.trim() || I18N.mr['pn_' + st.cat],
      price: Math.max(5, Math.round(Number($('#lPrice').value) || 0)), seller: s, sellerId: s ? s.id : '',
      lead: $('#lLead').value || DEFAULT_LEAD[st.cat], leadText: $('#lLeadText').value.trim(), leadTextMr: $('#lLeadTextMr').value.trim()
    };
  }
  function updateText() {
    const d = draftData();
    $('#lTextEn').value = listingText('en', d);
    $('#lTextMr').value = listingText('mr', d);
    $('#shareListing').href = waLink(state.lang === 'mr' ? $('#lTextMr').value : $('#lTextEn').value);
  }

  /* ---------- analysis ---------- */
  async function analyze(canvas, meta) {
    st.current = { canvas, meta };
    drawPreview(canvas);
    const stats = photoStats(canvas);
    let preds = null, mapping = null;
    if (st.ready) {
      try { preds = await ML.run('webgl', () => st.model.classify(canvas, 10)); mapping = mapCats(preds); }
      catch (e) { console.error(e); }
    } else if (!st.failed) { load(); }
    const override = st.result && st.result.meta === meta ? st.result.override : null;
    st.result = { meta, stats, preds, mapping, override, ready: readiness(meta, stats, preds, mapping) };
    renderResults();
    fillListing(false);
    if (preds) API.track('scan', null, st.cat);
  }
  function toWorking(img, w, h) {
    const k = Math.min(1, 1024 / Math.max(w, h)), c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(w * k)); c.height = Math.max(1, Math.round(h * k));
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    return c;
  }
  function loadFile(file) {
    if (!file || !/^image\//.test(file.type)) { toast(t('notImage'), 'alert'); return; }
    const url = URL.createObjectURL(file), img = new Image();
    img.onload = () => {
      const c = toWorking(img, img.naturalWidth, img.naturalHeight);
      URL.revokeObjectURL(url);
      $$('#samples .sample').forEach(b => b.setAttribute('aria-pressed', 'false'));
      analyze(c, { source: 'upload', w: img.naturalWidth, h: img.naturalHeight });
    };
    img.onerror = () => { URL.revokeObjectURL(url); toast(t('notImage'), 'alert'); };
    img.src = url;
  }
  function renderSamples() {
    const started = st.samplesStarted;
    st.samplesStarted = true;
    $('#samples').innerHTML = SAMPLES.map(s => `<button type="button" class="sample" data-sample="${s.key}" aria-pressed="false"><span>${esc(t(s.name))}</span></button>`).join('');
    SAMPLES.forEach(s => { const b = $(`[data-sample="${s.key}"]`); if (b && s.canvas) b.prepend(s.canvas); });
    if (st.samplesDone || started) return;
    let i = 0;
    const next = () => {
      if (i >= SAMPLES.length) { st.samplesDone = true; return; }
      const s = SAMPLES[i++];
      try {
        s.canvas = PHOTOS.toCanvas(s.key, 448);
        const b = $(`[data-sample="${s.key}"]`);
        if (b) b.prepend(s.canvas);
      } catch (e) { console.error(e); }
      setTimeout(next, 16);
    };
    setTimeout(next, 30);
  }
  function useSample(key) {
    const s = SAMPLES.find(x => x.key === key);
    if (!s) return;
    if (!s.canvas) s.canvas = PHOTOS.toCanvas(s.key, 448);
    $$('#samples .sample').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.sample === key)));
    const c = document.createElement('canvas'); c.width = s.canvas.width; c.height = s.canvas.height;
    c.getContext('2d').drawImage(s.canvas, 0, 0);
    analyze(c, { source: 'sample', sample: key, sampleCat: s.cat, w: c.width, h: c.height });
  }

  async function publish() {
    const r = st.result;
    if (!r) return;
    const d = draftData();
    if (isAdmin() && !d.sellerId) { toast(t('bindChooseFirst'), 'alert'); $('#lSellerId').focus(); return; }
    if (d.lead === 'custom' && d.leadText.length < 3) { toast(t('err_lead_text_required'), 'alert'); $('#lLeadText').focus(); return; }
    const src = $('#cvPreview'), k = Math.min(1, 560 / Math.max(src.width, src.height));
    const out = document.createElement('canvas'); out.width = Math.round(src.width * k); out.height = Math.round(src.height * k);
    out.getContext('2d').drawImage(src, 0, 0, out.width, out.height);
    const image = out.toDataURL('image/jpeg', 0.84);
    const btn = $('#publish');
    btn.disabled = true;
    try {
      const body = {
        name: d.name, nameMr: d.nameMr, cat: d.cat, price: d.price,
        unit: I18N.en.unitPiece, unitMr: I18N.mr.unitPiece, desc: I18N.en['blurb_' + d.cat], descMr: I18N.mr['blurb_' + d.cat],
        lead: d.lead, photo: image,
        ai: { top: (r.preds || []).slice(0, 3).map(x => ({ className: x.className, probability: x.probability })), readiness: Math.round(r.ready.score * 100), model: st.version || '' }
      };
      if (d.lead === 'custom') Object.assign(body, { leadText: d.leadText, leadTextMr: d.leadTextMr });
      if (isAdmin()) body.sellerId = d.sellerId;   // a seller's listing is always her own shop: the server decides
      const res = await API.call('POST', '/listings', body);
      const p = res.product, live = res.status === 'active';
      state.metrics.published++;
      st.published = p.id;
      toast(t(live ? 'published' : 'listingPending', { name: L(p.name) }), live ? 'store' : 'clock', 5200);
      const note = $('#pubNote');
      note.hidden = false;
      note.className = 'pub-note ' + (live ? 'ok' : 'wait');
      note.innerHTML = live ? `${icon('check')}<span>${esc(t('pubLive', { name: L(p.name) }))}</span><a href="${esc(shopUrl('?p=' + encodeURIComponent(p.id)))}" target="_blank" rel="noopener">${esc(t('pubView'))}</a>`
        : `${icon('clock')}<span>${esc(t('pubWait', { name: L(p.name) }))}</span>`;
      CTX.changed('product', p);
      BUS.emit('metrics');
    } catch (e) {
      toast(errText(e), 'alert', 5200);
      btn.disabled = false;
    }
  }

  function bind() {
    document.addEventListener('securitypolicyviolation', (e) => {
      if (/tfhub|kaggle|storage\.googleapis/.test(e.blockedURI || '')) st.blocked = true;
    });
    $('#file').addEventListener('change', e => { loadFile(e.target.files[0]); e.target.value = ''; });
    $('#changePhoto').addEventListener('click', () => $('#file').click());
    $('#cnnRetry').addEventListener('click', () => { st.failed = false; load(); });
    const drop = $('#drop');
    ['dragenter', 'dragover'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add('over'); }));
    ['dragleave', 'drop'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.remove('over'); }));
    drop.addEventListener('drop', e => { const f = e.dataTransfer && e.dataTransfer.files[0]; if (f) loadFile(f); });
    $('#samples').addEventListener('click', e => { const b = e.target.closest('[data-sample]'); if (b) useSample(b.dataset.sample); });
    $('#catOverride').addEventListener('change', e => { if (!st.result) return; st.result.override = e.target.value || null; renderResults(); fillListing(false); });
    $('#listingCard').addEventListener('input', (e) => {
      if (!st.result) return;
      const id = e.target.id;
      if (id === 'lPrice') st.priceTouched = true;
      if (['lMat', 'lHrs', 'lTier'].includes(id)) renderPrice(false);
      if (id === 'lLead') { st.leadTouched = true; toggleCustomLead(); }
      updateText();
    });
    $('#listingCard').addEventListener('change', (e) => {
      if (e.target.id === 'lSellerId') { st.sellerId = e.target.value; if (st.result) updateText(); }
      if (e.target.id === 'lLead' || e.target.id === 'lTier') { if (e.target.id === 'lLead') { st.leadTouched = true; toggleCustomLead(); } else renderPrice(false); if (st.result) updateText(); }
    });
    $('#useMlp').addEventListener('click', () => { renderPrice(true); updateText(); });
    $('#publish').addEventListener('click', publish);
    $('#copyListing').addEventListener('click', () => copyText($('#lTextEn').value + '\n\n' + $('#lTextMr').value));
    $('#shareListing').addEventListener('click', (e) => { if (!st.result) { e.preventDefault(); toast(t('predEmpty'), 'info'); } });
    BUS.on('tab', (tab) => { if (tab === 'catalogue') { if (!st.samplesDone) renderSamples(); if (!st.ready && !st.loading && !st.failed) load(); } });
    BUS.on('me', () => { renderBind(); if (st.result) updateText(); });
    BUS.on('sellers', () => { renderBind(); });
    BUS.on('settings', () => { if (st.result) updateText(); });
    BUS.on('lang', () => {
      const pressed = $('#samples [aria-pressed="true"]');
      if (st.samplesStarted) renderSamples();
      if (pressed) { const b = $(`[data-sample="${pressed.dataset.sample}"]`); if (b) b.setAttribute('aria-pressed', 'true'); }
      if (st.ready) status('ok', t('cnnReady', { v: st.version, b: ML.pick('webgl') }));
      else if (st.loading) status('busy', t('cnnLoading'));
      else if (st.failed) status('err', t(st.reason || 'cnnFail'));
      else status('', t('cnnIdle'));
      renderResults(); renderBind(); renderLeadSelect();
      if (st.result) { renderPrice(false); updateText(); }
    });
    BUS.on('model', () => { if (st.result) { renderPrice(false); updateText(); } });
  }
  function init() { renderBind(); renderLeadSelect(); renderResults(); renderPrice(false); }
  return { bind, init, load, renderResults, get ready() { return st.ready; } };
})();
