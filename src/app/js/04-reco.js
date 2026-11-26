/* ------------------------------------------------------------------
   Hybrid recommender
   1) Item-based collaborative filtering: cosine similarity between
      item columns of the basket x item purchase matrix
      (= co-purchases / sqrt(nA * nB)).
   2) Content similarity: cosine between weighted attribute vectors
      (category one-hot, price tier, perishability, SHG, handmade,
      local popularity, festival affinity).
   Blend alpha shrinks toward content when an item has little purchase
   history, which handles cold-start for brand-new listings.
------------------------------------------------------------------- */
const RECO = (() => {
  const CATS = ['food', 'tailoring', 'craft', 'agri'];
  const W = { cat: 0.75, price: 0.6, perish: 0.8, shg: 0.45, handmade: 0.45, pop: 0.5, fest: 0.6 };
  const ALPHA = 0.65, CONF_N = 6;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const priceTier = (price) => clamp((Math.log(price) - Math.log(40)) / (Math.log(1000) - Math.log(40)), 0, 1);

  function vector(p) {
    const v = CATS.map(c => (c === p.cat ? W.cat : 0));
    v.push(priceTier(p.price) * W.price, p.perish * W.perish, (p.type === 'shg' ? 1 : 0) * W.shg,
      (p.cat !== 'agri' ? 1 : 0) * W.handmade, p.pop * W.pop, p.fest * W.fest);
    return v;
  }
  function cosine(a, b) {
    let d = 0, na = 0, nb = 0;
    for (let i = 0; i < a.length; i++) { d += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
    return na && nb ? d / Math.sqrt(na * nb) : 0;
  }

  function create(products, baskets) {
    const m = { products, baskets: baskets.map(b => b.slice()), n: 0, index: new Map(), counts: null, cf: null, cs: null, vectors: [] };
    m.rebuild = () => {
      const n = products.length;
      m.n = n;
      m.index = new Map(products.map((p, i) => [p.id, i]));
      m.vectors = products.map(vector);
      const counts = new Float64Array(n), co = new Float64Array(n * n);
      for (const b of m.baskets) {
        const ix = [...new Set(b)].map(id => m.index.get(id)).filter(i => i !== undefined);
        for (const i of ix) {
          counts[i]++;
          for (const j of ix) if (j !== i) co[i * n + j]++;
        }
      }
      const cf = new Float64Array(n * n), cs = new Float64Array(n * n);
      for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
        cf[i * n + j] = i === j ? (counts[i] ? 1 : 0) : (counts[i] && counts[j] ? co[i * n + j] / Math.sqrt(counts[i] * counts[j]) : 0);
        cs[i * n + j] = cosine(m.vectors[i], m.vectors[j]);
      }
      m.counts = counts; m.co = co; m.cf = cf; m.cs = cs;
    };
    m.pair = (i, j) => {
      const n = m.n;
      const conf = Math.min(1, Math.min(m.counts[i], m.counts[j]) / CONF_N);
      const alpha = ALPHA * conf, cfv = m.cf[i * n + j], csv = m.cs[i * n + j];
      return { score: alpha * cfv + (1 - alpha) * csv, cf: cfv, content: csv, alpha, together: m.co[i * n + j] };
    };
    m.similar = (id, k = 4, exclude = []) => {
      const i = m.index.get(id);
      if (i === undefined) return [];
      const ex = new Set([id, ...exclude]);
      return products.map((p, j) => ({ p, ...m.pair(i, j) })).filter(x => !ex.has(x.p.id)).sort((a, b) => b.score - a.score).slice(0, k);
    };
    /** weighted: [{id, w}] — cart items weigh 1, viewed items 0.5 */
    m.forProfile = (weighted, k = 4, exclude = []) => {
      const src = weighted.map(x => ({ i: m.index.get(x.id), w: x.w })).filter(x => x.i !== undefined);
      if (!src.length) return [];
      const ex = new Set([...exclude, ...weighted.map(x => x.id)]);
      const tw = src.reduce((s, x) => s + x.w, 0);
      return products.map((p, j) => {
        let s = 0, cf = 0, cn = 0;
        for (const x of src) { const pr = m.pair(x.i, j); s += x.w * pr.score; cf += x.w * pr.cf; cn += x.w * pr.content; }
        return { p, score: s / tw, cf: cf / tw, content: cn / tw };
      }).filter(x => !ex.has(x.p.id)).sort((a, b) => b.score - a.score).slice(0, k);
    };
    m.addBasket = (ids) => { m.baskets.push(ids.slice()); m.rebuild(); };
    m.matrix = () => {
      const n = m.n, out = [];
      for (let i = 0; i < n; i++) { const row = []; for (let j = 0; j < n; j++) row.push(m.pair(i, j).score); out.push(row); }
      return out;
    };
    m.rebuild();
    return m;
  }
  const FEATURES = ['catFood', 'catTailoring', 'catCraft', 'catAgri', 'fPrice', 'fPerish', 'fShg', 'fHandmade', 'fPop', 'fFest'];
  return { create, vector, cosine, priceTier, FEATURES, W, ALPHA };
})();
