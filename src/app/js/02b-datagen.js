/* ------------------------------------------------------------------
   Synthetic micro-enterprise transactions for the pilot area: rural
   Pune district and its neighbouring districts (Maharashtra).
   Generative story: cost-plus fair price (materials, fair hourly wage,
   packaging, festival premium) with log-normal market noise, and
   Poisson weekly orders driven by price elasticity + seasonality.
   The MLP never sees these formulas, only the noisy rows.
------------------------------------------------------------------- */
const DATAGEN = (() => {
  const CATS = ['food', 'tailoring', 'craft', 'agri'];
  const P = {
    food:      { mat: [25, 180],  hrs: [0.4, 3],    wage: 50, markup: 0.35, fest: 0.14, base: 24, ref: 150, elast: 0.75, boost: 0.9,  pkgP: [0.35, 0.45, 0.20] },
    tailoring: { mat: [40, 450],  hrs: [1, 6],      wage: 65, markup: 0.15, fest: 0.10, base: 7,  ref: 450, elast: 0.60, boost: 0.6,  pkgP: [0.40, 0.45, 0.15] },
    craft:     { mat: [30, 400],  hrs: [1, 8],      wage: 60, markup: 0.30, fest: 0.16, base: 5,  ref: 350, elast: 0.55, boost: 1.0,  pkgP: [0.25, 0.45, 0.30] },
    agri:      { mat: [15, 80],   hrs: [0.1, 1.2],  wage: 45, markup: 0.28, fest: 0.06, base: 38, ref: 60,  elast: 0.90, boost: 0.35, pkgP: [0.70, 0.25, 0.05] }
  };
  const PKG = [
    { cost: 5,  uplift: 0.00, attract: 0.00 },
    { cost: 18, uplift: 0.07, attract: 0.10 },
    { cost: 42, uplift: 0.16, attract: 0.18 }
  ];
  const ITEMS = {
    food: ['Chakli', 'Besan ladoo', 'Puran poli', 'Shankarpali', 'Mango pickle', 'Nachni papad', 'Karanji', 'Poha chivda'],
    tailoring: ['Blouse stitching', 'Kurti stitching', 'Saree fall & pico', 'Nauvari stitching', 'Parkar-polka', 'Petticoat', 'School uniform', 'Alterations'],
    craft: ['Handloom bag', 'Warli painting', 'Clay diyas', 'Bamboo basket', 'Bead toran', 'Akash kandil', 'Godhadi quilt', 'Jute bag'],
    agri: ['Tomatoes 1 kg', 'Pomegranates 1 kg', 'Jaggery 1 kg', 'Bananas 1 dozen', 'Indrayani rice 2 kg', 'Onions 2 kg', 'Methi bunch', 'Groundnuts 1 kg']
  };
  const ITEMS_MR = {
    food: ['चकली', 'बेसन लाडू', 'पुरणपोळी', 'शंकरपाळी', 'कैरीचे लोणचे', 'नाचणी पापड', 'करंजी', 'पोह्यांचा चिवडा'],
    tailoring: ['ब्लाउज शिलाई', 'कुर्ती शिलाई', 'साडी फॉल व पिको', 'नऊवारी शिलाई', 'परकर-पोलकं', 'पेटीकोट', 'शाळेचा गणवेश', 'कपड्यांत बदल'],
    craft: ['हातमाग पिशवी', 'वारली चित्र', 'मातीच्या पणत्या', 'बांबूची टोपली', 'मण्यांचे तोरण', 'आकाशकंदील', 'गोधडी', 'ज्यूट पिशवी'],
    agri: ['टोमॅटो १ किलो', 'डाळिंब १ किलो', 'गूळ १ किलो', 'केळी १ डझन', 'इंद्रायणी तांदूळ २ किलो', 'कांदे २ किलो', 'मेथीची जुडी', 'शेंगदाणे १ किलो']
  };
  // half the rows come from Pune district itself, the rest from the districts around it
  const DISTRICTS_MR = ['पुणे', 'सातारा', 'सोलापूर', 'अहिल्यानगर', 'रायगड', 'ठाणे'];
  const MONTHS_MR = ['जाने.', 'फेब्रु.', 'मार्च', 'एप्रिल', 'मे', 'जून', 'जुलै', 'ऑग.', 'सप्टें.', 'ऑक्टो.', 'नोव्हें.', 'डिसें.'];
  const DISTRICTS = ['Pune', 'Satara', 'Solapur', 'Ahilyanagar', 'Raigad', 'Thane'];
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const SEASON = [0.6, 0.35, 0.6, 0.55, 0.5, 0.2, 0.15, 0.45, 0.8, 0.85, 0.95, 0.4]; // Sankranti, Gudi Padwa, weddings, Ganeshotsav, Navratri, Diwali

  function rng(seed) {
    return () => {
      seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const gauss = (r) => { let u = 0, v = 0; while (u === 0) u = r(); while (v === 0) v = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
  const poisson = (r, lam) => {
    if (lam > 40) return Math.max(0, Math.round(lam + Math.sqrt(lam) * gauss(r)));
    const L = Math.exp(-lam); let k = 0, p = 1;
    do { k++; p *= r(); } while (p > L);
    return k - 1;
  };
  const pick = (r, probs) => { let u = r(), acc = 0; for (let i = 0; i < probs.length; i++) { acc += probs[i]; if (u < acc) return i; } return probs.length - 1; };
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  /** The latent "fair price" rule used only to synthesise training rows. */
  function fairPrice(cat, mat, hrs, tier, season) {
    const c = P[cat], k = PKG[tier];
    return (mat * (1 + c.markup) + hrs * c.wage + k.cost) * (1 + k.uplift) * (1 + c.fest * season);
  }

  function generate(n = 240, seed = 2026) {
    const r = rng(seed), rows = [];
    const catP = [0.32, 0.22, 0.22, 0.24];
    for (let i = 0; i < n; i++) {
      const cat = CATS[pick(r, catP)], c = P[cat];
      const lm = Math.log(c.mat[0]) + r() * (Math.log(c.mat[1]) - Math.log(c.mat[0]));
      const mat = Math.round(Math.exp(lm));
      const mFrac = (lm - Math.log(c.mat[0])) / (Math.log(c.mat[1]) - Math.log(c.mat[0]));
      const hrs = Math.round(clamp(c.hrs[0] + (c.hrs[1] - c.hrs[0]) * clamp(0.65 * mFrac + 0.35 * r() + 0.08 * gauss(r), 0, 1), c.hrs[0], c.hrs[1]) * 4) / 4;
      const tier = pick(r, c.pkgP);
      const month = Math.floor(r() * 12);
      const season = Math.round(clamp(SEASON[month] + 0.1 * gauss(r), 0, 1) * 100) / 100;
      const price = Math.max(10, Math.round(fairPrice(cat, mat, hrs, tier, season) * Math.exp(0.07 * gauss(r)) / 5) * 5);
      const lam = clamp(c.base * Math.pow(c.ref / price, c.elast) * (1 + c.boost * season) * (1 + PKG[tier].attract), 0.3, 150);
      const orders = poisson(r, lam);
      const di = r() < 0.5 ? 0 : 1 + Math.floor(r() * (DISTRICTS.length - 1)), seller = r() < 0.42 ? 'SHG' : 'Individual', ii = Math.floor(r() * ITEMS[cat].length);
      rows.push({
        id: 'TX' + String(1001 + i), month: MONTHS[month], monthMr: MONTHS_MR[month], district: DISTRICTS[di], districtMr: DISTRICTS_MR[di],
        seller, cat, item: ITEMS[cat][ii], itemMr: ITEMS_MR[cat][ii], mat, hrs, tier, season, price, orders
      });
    }
    return rows;
  }

  /** Feature vector: one-hot category, ln(material) & hours (to be standardised), packaging tier, season. */
  function features(row) {
    const oh = CATS.map(c => (c === row.cat ? 1 : 0));
    return [...oh, Math.log(row.mat), row.hrs, row.tier / 2, row.season];
  }
  const targets = (row) => [Math.log(row.price), Math.log1p(row.orders)];

  function standardiser(matrix, cols) {
    const mu = [], sd = [];
    for (let j = 0; j < matrix[0].length; j++) {
      if (!cols.includes(j)) { mu.push(0); sd.push(1); continue; }
      const v = matrix.map(r => r[j]), m = v.reduce((a, b) => a + b, 0) / v.length;
      const s = Math.sqrt(v.reduce((a, b) => a + (b - m) ** 2, 0) / v.length) || 1;
      mu.push(m); sd.push(s);
    }
    return { mu, sd, apply: (row) => row.map((x, j) => (x - mu[j]) / sd[j]), invert: (row) => row.map((x, j) => x * sd[j] + mu[j]) };
  }

  /** Closed-form ridge regression (linear baseline). Returns predict(featureRow) → target row. */
  function linearBaseline(X, Y, lambda = 1e-3) {
    const n = X.length, d = X[0].length + 1, k = Y[0].length;
    const A = Array.from({ length: d }, () => new Array(d).fill(0));
    const Bm = Array.from({ length: d }, () => new Array(k).fill(0));
    for (let i = 0; i < n; i++) {
      const x = [1, ...X[i]];
      for (let a = 0; a < d; a++) {
        for (let b = 0; b < d; b++) A[a][b] += x[a] * x[b];
        for (let t = 0; t < k; t++) Bm[a][t] += x[a] * Y[i][t];
      }
    }
    for (let a = 1; a < d; a++) A[a][a] += lambda;
    // Gauss-Jordan solve A W = B
    const M = A.map((row, i) => row.concat(Bm[i]));
    for (let col = 0; col < d; col++) {
      let piv = col;
      for (let r = col + 1; r < d; r++) if (Math.abs(M[r][col]) > Math.abs(M[piv][col])) piv = r;
      [M[col], M[piv]] = [M[piv], M[col]];
      const pv = M[col][col] || 1e-12;
      for (let c = col; c < d + k; c++) M[col][c] /= pv;
      for (let r = 0; r < d; r++) if (r !== col) {
        const f = M[r][col];
        if (f) for (let c = col; c < d + k; c++) M[r][c] -= f * M[col][c];
      }
    }
    const W = M.map(row => row.slice(d));
    return (x) => {
      const xx = [1, ...x];
      return Array.from({ length: k }, (_, t) => xx.reduce((s, v, a) => s + v * W[a][t], 0));
    };
  }

  function r2(yTrue, yPred) {
    const m = yTrue.reduce((a, b) => a + b, 0) / yTrue.length;
    const ssr = yTrue.reduce((a, y, i) => a + (y - yPred[i]) ** 2, 0);
    const sst = yTrue.reduce((a, y) => a + (y - m) ** 2, 0) || 1;
    return 1 - ssr / sst;
  }
  const mae = (a, b) => a.reduce((s, y, i) => s + Math.abs(y - b[i]), 0) / a.length;

  function toCSV(rows) {
    const head = ['id', 'month', 'district', 'seller_type', 'category', 'item', 'material_cost_inr', 'labour_hours', 'packaging_tier', 'seasonal_demand', 'price_inr', 'weekly_orders'];
    const esc = (v) => (/[",\n]/.test(String(v)) ? '"' + String(v).replace(/"/g, '""') + '"' : String(v));
    return [head.join(',')].concat(rows.map(r => [r.id, r.month, r.district, r.seller, r.cat, r.item, r.mat, r.hrs, ['basic', 'standard', 'premium'][r.tier], r.season, r.price, r.orders].map(esc).join(','))).join('\n');
  }

  /* Real sales records (entered by the admin on the server, or imported from CSV) use the same
     columns as toCSV(). check() validates one record; fromRecord() maps it to a generate()-style row. */
  const TIERS = ['basic', 'standard', 'premium'];
  // Returns the cleaned record, or { error, message } where error names the bad column (the console translates it).
  function check(r) {
    const n = (v) => (v === '' || v === null || v === undefined ? NaN : Number(v));
    const bad = (error, message) => ({ error, message });
    if (!CATS.includes(r.cat)) return bad('cat', 'category must be one of ' + CATS.join(', '));
    const tier = typeof r.tier === 'string' && TIERS.includes(r.tier.toLowerCase()) ? TIERS.indexOf(r.tier.toLowerCase()) : n(r.tier);
    let season = n(r.season); if (season > 1 && season <= 100) season /= 100;
    const out = { cat: r.cat, mat: n(r.mat), hrs: n(r.hrs), tier, season, price: n(r.price), orders: n(r.orders) };
    if (!(out.mat >= 1 && out.mat <= 100000)) return bad('mat', 'material_cost_inr must be 1 to 100000');
    if (!(out.hrs >= 0.05 && out.hrs <= 200)) return bad('hrs', 'labour_hours must be 0.05 to 200');
    if (![0, 1, 2].includes(out.tier)) return bad('tier', 'packaging_tier must be basic, standard or premium (or 0, 1, 2)');
    if (!(out.season >= 0 && out.season <= 1)) return bad('season', 'seasonal_demand must be 0 to 1 (or 0 to 100)');
    if (!(out.price >= 1 && out.price <= 1000000)) return bad('price', 'price_inr must be 1 to 1000000');
    if (!(Number.isInteger(out.orders) && out.orders >= 0 && out.orders <= 10000)) return bad('orders', 'weekly_orders must be a whole number 0 to 10000');
    const mi = Number.isInteger(n(r.month)) && n(r.month) >= 0 && n(r.month) < 12 ? n(r.month) : MONTHS.findIndex(m => m.toLowerCase() === String(r.month || '').trim().slice(0, 3).toLowerCase());
    return Object.assign(out, { month: mi, district: String(r.district || '').trim().slice(0, 40), seller: /shg/i.test(String(r.seller || '')) ? 'SHG' : 'Individual', item: String(r.item || '').trim().slice(0, 60) });
  }
  function fromRecord(r, i = 0) {
    const di = DISTRICTS.findIndex(d => d.toLowerCase() === String(r.district || '').toLowerCase());
    const ii = CATS.includes(r.cat) ? ITEMS[r.cat].findIndex(x => x.toLowerCase() === String(r.item || '').toLowerCase()) : -1;
    const mi = Number.isInteger(r.month) && r.month >= 0 ? r.month : -1;
    return {
      id: r.id || 'RX' + String(1001 + i), real: true,
      month: mi >= 0 ? MONTHS[mi] : '—', monthMr: mi >= 0 ? MONTHS_MR[mi] : '—',
      district: di >= 0 ? DISTRICTS[di] : (r.district || '—'), districtMr: di >= 0 ? DISTRICTS_MR[di] : (r.district || '—'),
      seller: r.seller === 'SHG' ? 'SHG' : 'Individual', cat: r.cat,
      item: r.item || '—', itemMr: ii >= 0 ? ITEMS_MR[r.cat][ii] : (r.item || '—'),
      mat: Number(r.mat), hrs: Number(r.hrs), tier: Number(r.tier), season: Number(r.season), price: Number(r.price), orders: Number(r.orders)
    };
  }

  return { CATS, P, PKG, generate, features, targets, standardiser, linearBaseline, r2, mae, toCSV, rng, fairPrice, check, fromRecord };
})();
