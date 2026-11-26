/* ------------------------------------------------------------------
   Procedural sample product photos (no files, no network).
   Each scene is shaded per pixel (Lambert + Blinn-Phong, bump noise,
   soft shadows) so the CNN sees photo-like texture, not flat clip-art.
------------------------------------------------------------------- */
const PHOTOS = (() => {
  const rng = (seed) => () => {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  function makeNoise(seed) {
    const r = rng(seed), p = new Uint8Array(512), g = new Float32Array(256);
    const base = Array.from({ length: 256 }, (_, i) => i);
    for (let i = 255; i > 0; i--) { const j = Math.floor(r() * (i + 1)); const t = base[i]; base[i] = base[j]; base[j] = t; }
    for (let i = 0; i < 512; i++) p[i] = base[i & 255];
    for (let i = 0; i < 256; i++) g[i] = r() * 2 - 1;
    return (x, y) => {
      const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
      const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
      const X = xi & 255, Y = yi & 255;
      const a = g[p[p[X] + Y]], b = g[p[p[X + 1] + Y]], c = g[p[p[X] + Y + 1]], d = g[p[p[X + 1] + Y + 1]];
      const top = a + (b - a) * u, bot = c + (d - c) * u;
      return top + (bot - top) * v;
    };
  }
  const fbm = (n, x, y, o = 4) => { let s = 0, a = 0.5, f = 1; for (let i = 0; i < o; i++) { s += a * n(x * f, y * f); f *= 2.03; a *= 0.5; } return s; };
  const clamp = (v, a = 0, b = 1) => v < a ? a : v > b ? b : v;
  const smooth = (e0, e1, x) => { const t = clamp((x - e0) / (e1 - e0)); return t * t * (3 - 2 * t); };
  const mix = (a, b, t) => a + (b - a) * t;
  const norm3 = (x, y, z) => { const l = Math.hypot(x, y, z) || 1; return [x / l, y / l, z / l]; };
  const L = norm3(-0.45, -0.6, 0.66);
  const Hh = norm3(L[0], L[1], L[2] + 1);

  function canvasBuf(S) { return { S, c: new Float32Array(S * S * 3) }; }
  const put = (B, x, y, r, g, b, a = 1) => {
    const i = (y * B.S + x) * 3, c = B.c;
    c[i] = c[i] * (1 - a) + r * a; c[i + 1] = c[i + 1] * (1 - a) + g * a; c[i + 2] = c[i + 2] * (1 - a) + b * a;
  };
  const shade = (B, x, y, k) => { const i = (y * B.S + x) * 3; B.c[i] *= k; B.c[i + 1] *= k; B.c[i + 2] *= k; };
  function lightAt(n, spec = 0.2, shin = 30, wrap = 0.35) {
    const nl = n[0] * L[0] + n[1] * L[1] + n[2] * L[2];
    const d = clamp((nl + wrap) / (1 + wrap));
    const nh = Math.max(0, n[0] * Hh[0] + n[1] * Hh[1] + n[2] * Hh[2]);
    return [d, spec * Math.pow(nh, shin)];
  }
  function finish(B, seed, vignette = 0.28, grain = 0.018) {
    const { S, c } = B, r = rng(seed), out = new Uint8ClampedArray(S * S * 4);
    const tmp = new Float32Array(c.length);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {           // gentle 3x3 blur = lens softness
      for (let k = 0; k < 3; k++) {
        let s = 0, w = 0;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx, yy = y + dy;
          if (xx < 0 || yy < 0 || xx >= S || yy >= S) continue;
          const ww = (dx === 0 && dy === 0) ? 4 : (dx === 0 || dy === 0) ? 2 : 1;
          s += c[(yy * S + xx) * 3 + k] * ww; w += ww;
        }
        tmp[(y * S + x) * 3 + k] = s / w;
      }
    }
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const dx = x / S - 0.5, dy = y / S - 0.5, v = 1 - vignette * Math.pow(dx * dx + dy * dy, 1.1) * 2.2;
      const gn = (r() - 0.5) * grain * 2;
      const i = (y * S + x) * 3, o = (y * S + x) * 4;
      out[o] = clamp(tmp[i] * v + gn) * 255; out[o + 1] = clamp(tmp[i + 1] * v + gn) * 255;
      out[o + 2] = clamp(tmp[i + 2] * v + gn) * 255; out[o + 3] = 255;
    }
    return { w: S, h: S, data: out };
  }
  function wood(B, n, tone = [0.36, 0.22, 0.13], plank = 0.25, vertical = false) {
    const { S } = B;
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const u = vertical ? y : x, v = vertical ? x : y;
      const pi = Math.floor(v / (S * plank)), pv = (v / (S * plank)) - pi;
      const varn = 0.85 + 0.25 * ((pi * 0.618) % 1);
      const g = fbm(n, u * 0.006 + pi * 13, v * 0.06, 4);
      const ring = 0.5 + 0.5 * Math.sin(u * 0.018 + g * 9 + pi * 2);
      const fine = n(u * 0.25, v * 2.2) * 0.06;
      let k = varn * (0.82 + 0.18 * ring + fine);
      const gap = smooth(0.0, 0.025, pv) * smooth(0.0, 0.025, 1 - pv);
      k *= 0.35 + 0.65 * gap;
      put(B, x, y, tone[0] * k, tone[1] * k, tone[2] * k);
    }
  }
  function softShadow(B, cx, cy, rx, ry, strength) {
    const { S } = B;
    const x0 = Math.max(0, Math.floor(cx - rx * 1.8)), x1 = Math.min(S - 1, Math.ceil(cx + rx * 1.8));
    const y0 = Math.max(0, Math.floor(cy - ry * 1.8)), y1 = Math.min(S - 1, Math.ceil(cy + ry * 1.8));
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const d = Math.pow((x - cx) / rx, 2) + Math.pow((y - cy) / ry, 2);
      shade(B, x, y, 1 - strength * Math.exp(-d * 1.6));
    }
  }

  /* ---------- Oranges on a wooden table ---------- */
  function oranges(S = 448) {
    const B = canvasBuf(S), n = makeNoise(11), n2 = makeNoise(27);
    wood(B, n, [0.34, 0.21, 0.12], 0.22);
    const fruits = [
      [0.30, 0.31, 0.165, 0], [0.63, 0.24, 0.150, 1], [0.50, 0.57, 0.190, 2],
      [0.22, 0.68, 0.150, 3], [0.79, 0.58, 0.160, 4], [0.66, 0.84, 0.140, 5], [0.34, 0.90, 0.125, 6]
    ].map(([x, y, r, i]) => ({ x: x * S, y: y * S, r: r * S, i }));
    const cut = { x: 0.86 * S, y: 0.20 * S, r: 0.125 * S };
    fruits.forEach(f => softShadow(B, f.x + f.r * 0.32, f.y + f.r * 0.42, f.r * 1.05, f.r * 0.75, 0.62));
    softShadow(B, cut.x + cut.r * 0.2, cut.y + cut.r * 0.25, cut.r * 1.05, cut.r * 0.9, 0.5);
    // leaves under the fruit
    const leaves = [[0.43, 0.15, -0.5, 0.17], [0.10, 0.45, 2.3, 0.16], [0.92, 0.40, 1.2, 0.14]];
    leaves.forEach(([lx, ly, ang, len]) => {
      const cx = lx * S, cy = ly * S, Lh = len * S, ca = Math.cos(ang), sa = Math.sin(ang);
      softShadow(B, cx + 6, cy + 9, Lh * 0.55, Lh * 0.22, 0.35);
      for (let y = Math.max(0, cy - Lh); y < Math.min(S, cy + Lh); y++) for (let x = Math.max(0, cx - Lh); x < Math.min(S, cx + Lh); x++) {
        const dx = x - cx, dy = y - cy, u = (dx * ca + dy * sa) / Lh + 0.5, v = (-dx * sa + dy * ca) / Lh;
        if (u < 0 || u > 1) continue;
        const w = 0.22 * Math.pow(Math.sin(Math.PI * u), 0.85);
        const e = Math.abs(v) / w;
        if (e > 1) continue;
        const a = smooth(1, 0.9, e);
        const vein = Math.abs(Math.sin((u * 7 - Math.abs(v) * 9) * Math.PI));
        const mid = Math.exp(-Math.pow(v / 0.012, 2));
        const nn = norm3(-v * 1.6, (u - 0.5) * 0.4, 1);
        const [d, sp] = lightAt(nn, 0.35, 40);
        let r = 0.10 + 0.08 * u, g = 0.30 + 0.10 * u + 0.05 * n(x * 0.05, y * 0.05), b = 0.08;
        r += mid * 0.18; g += mid * 0.25; b += mid * 0.08;
        const vk = 0.92 + 0.08 * vein;
        put(B, Math.floor(x), Math.floor(y), (r * d * vk + sp) , (g * d * vk + sp), (b * d * vk + sp * 0.8), a);
      }
    });
    const order = fruits.slice().sort((a, b) => a.y - b.y);
    order.forEach(f => {
      const hueShift = (f.i * 0.37) % 1;
      for (let y = Math.max(0, Math.floor(f.y - f.r)); y < Math.min(S, Math.ceil(f.y + f.r)); y++)
        for (let x = Math.max(0, Math.floor(f.x - f.r)); x < Math.min(S, Math.ceil(f.x + f.r)); x++) {
          const dx = (x - f.x) / f.r, dy = (y - f.y) / f.r, rr = dx * dx + dy * dy;
          if (rr >= 1) continue;
          const edge = smooth(1, 0.985, rr);
          const nz = Math.sqrt(1 - rr);
          const k = 1.25, px = x * k + f.i * 50, py = y * k;
          const gx = n2(px + 1, py) - n2(px - 1, py), gy = n2(px, py + 1) - n2(px, py - 1);
          const nn = norm3(dx - gx * 0.26, dy - gy * 0.26, nz);
          const [d, sp] = lightAt(nn, 0.38, 36, 0.25);
          const mott = fbm(n, x * 0.03 + f.i * 9, y * 0.03, 3);
          let r = 0.95, g = 0.47 + 0.10 * hueShift + 0.10 * mott, b = 0.05;
          const greenPatch = smooth(0.15, 0.45, mott + (dy < -0.3 ? 0.15 : 0)) * 0.35;
          r = mix(r, 0.70, greenPatch); g = mix(g, 0.62, greenPatch); b = mix(b, 0.10, greenPatch);
          const ao = 0.55 + 0.45 * Math.pow(nz, 0.6);
          const rim = Math.pow(1 - nz, 3) * 0.12;
          let R = r * d * ao + sp + rim, G = g * d * ao + sp * 0.95 + rim * 0.4, Bc = b * d * ao + sp * 0.8;
          const cdx = dx - 0.12, cdy = dy + 0.30, cd = Math.hypot(cdx, cdy);
          if (f.i % 2 === 0 && cd < 0.075) {
            const star = 0.6 + 0.4 * Math.cos(Math.atan2(cdy, cdx) * 5);
            const t = smooth(0.075, 0.03 * star, cd);
            R = mix(R, 0.25 * d, t); G = mix(G, 0.30 * d, t); Bc = mix(Bc, 0.10 * d, t);
          }
          put(B, x, y, R, G, Bc, edge);
        }
    });
    // halved orange showing segments
    for (let y = Math.max(0, Math.floor(cut.y - cut.r)); y < Math.min(S, Math.ceil(cut.y + cut.r)); y++)
      for (let x = Math.max(0, Math.floor(cut.x - cut.r)); x < Math.min(S, Math.ceil(cut.x + cut.r)); x++) {
        const dx = (x - cut.x) / cut.r, dy = (y - cut.y) / cut.r, rad = Math.hypot(dx, dy);
        if (rad >= 1) continue;
        const a = smooth(1, 0.98, rad * rad), ang = Math.atan2(dy, dx);
        let r, g, b;
        if (rad > 0.93) { r = 0.92; g = 0.46; b = 0.06; }
        else if (rad > 0.84) { r = 0.98; g = 0.90; b = 0.72; }
        else if (rad < 0.09) { r = 0.98; g = 0.92; b = 0.78; }
        else {
          const seg = (ang + Math.PI) / (Math.PI * 2) * 11, sf = seg - Math.floor(seg);
          const wall = smooth(0.06, 0.0, Math.min(sf, 1 - sf) * rad * 2.2);
          const juice = 0.85 + 0.15 * n(rad * 40, seg * 6) + 0.08 * Math.sin(rad * 90 + n(ang * 6, rad * 9) * 4);
          r = mix(0.99 * juice, 0.98, wall); g = mix(0.58 * juice, 0.90, wall); b = mix(0.10, 0.74, wall);
          const glint = Math.pow(clamp(n(x * 0.6, y * 0.6) * 1.4), 6) * 0.6;
          r += glint; g += glint; b += glint;
        }
        const k = 0.88 + 0.12 * (1 - rad) - 0.1 * (dx + dy) * 0.5;
        put(B, x, y, r * k, g * k, b * k, a);
      }
    return finish(B, 5);
  }

  /* ---------- Terracotta matka with Warli painting ---------- */
  function pot(S = 448) {
    const B = canvasBuf(S), n = makeNoise(41), n2 = makeNoise(43);
    const tableY = 0.76 * S;
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      if (y < tableY) {
        const t = y / tableY, plaster = 0.03 * fbm(n, x * 0.02, y * 0.02, 4);
        put(B, x, y, 0.90 - 0.08 * t + plaster, 0.86 - 0.09 * t + plaster, 0.79 - 0.10 * t + plaster);
      } else {
        const t = (y - tableY) / (S - tableY), g = fbm(n2, x * 0.004, y * 0.09, 4);
        const ring = 0.5 + 0.5 * Math.sin(x * 0.012 + g * 10);
        const k = (0.78 + 0.16 * ring) * (1.05 - 0.25 * t);
        put(B, x, y, 0.56 * k, 0.37 * k, 0.22 * k);
      }
    }
    for (let x = 0; x < S; x++) for (let y = Math.floor(tableY) - 2; y < tableY + 3; y++) shade(B, x, y, 0.82);
    const cx = S * 0.5, top = 0.13 * S, bot = 0.79 * S, H = bot - top;
    const prof = [[0, 0.150], [0.03, 0.158], [0.055, 0.135], [0.12, 0.112], [0.19, 0.150], [0.31, 0.236], [0.47, 0.288], [0.60, 0.286], [0.75, 0.238], [0.87, 0.165], [0.95, 0.105], [1.0, 0.07]];
    const radiusAt = (t) => {
      if (t <= 0) return prof[0][1] * S;
      for (let i = 1; i < prof.length; i++) if (t <= prof[i][0]) {
        const [t0, r0] = prof[i - 1], [t1, r1] = prof[i];
        const m0 = i > 1 ? (r1 - prof[i - 2][1]) / (t1 - prof[i - 2][0]) : (r1 - r0) / (t1 - t0);
        const m1 = i < prof.length - 1 ? (prof[i + 1][1] - r0) / (prof[i + 1][0] - t0) : (r1 - r0) / (t1 - t0);
        const h = t1 - t0, s = (t - t0) / h, s2 = s * s, s3 = s2 * s;
        return S * ((2 * s3 - 3 * s2 + 1) * r0 + (s3 - 2 * s2 + s) * h * m0 + (-2 * s3 + 3 * s2) * r1 + (s3 - s2) * h * m1);
      }
      return prof[prof.length - 1][1] * S;
    };
    softShadow(B, cx + 0.07 * S, bot - 0.005 * S, 0.30 * S, 0.045 * S, 0.7);
    for (let y = Math.floor(top); y < S; y++) {
      const t = (y - top) / H;
      if (t > 1) break;
      const r = radiusAt(t), dr = (radiusAt(t + 0.004) - radiusAt(t - 0.004)) / (0.008 * H);
      for (let x = Math.floor(cx - r - 1); x <= Math.ceil(cx + r + 1); x++) {
        const u = (x - cx) / r;
        if (Math.abs(u) >= 1) continue;
        const a = smooth(1, 0.97, Math.abs(u));
        const th = Math.asin(u), ct = Math.cos(th);
        const rings = 0.025 * Math.sin(y * 0.55 + n(x * 0.02, y * 0.02) * 3);
        const nn = norm3(u, -dr + rings, ct);
        const [d, sp] = lightAt(nn, 0.09, 14, 0.3);
        const grain = 0.05 * fbm(n2, th * 60, y * 0.25, 3);
        let R = 0.70 + grain, G = 0.33 + grain * 0.6, Bc = 0.19 + grain * 0.4;
        // Warli paint in (angle, height) space
        const phi = th, circ = phi * r;
        let paint = 0;
        if (t > 0.2 && t < 0.25) {
          const p = ((circ / (0.035 * S)) % 1 + 1) % 1, h = (t - 0.2) / 0.05;
          paint = Math.abs(p - 0.5) * 2 < h ? 1 : 0;
          if (h > 0.92) paint = 1;
        }
        if (t > 0.265 && t < 0.275) paint = 1;
        if (t > 0.33 && t < 0.62) {
          const fw = 0.075 * S, fi = Math.floor(circ / fw), fx = circ / fw - fi - 0.5;
          const ft = (t - 0.33) / 0.29;
          const head = Math.hypot(fx / 0.55, (ft - 0.12) / 0.075) < 1;
          const tri1 = ft > 0.21 && ft < 0.45 && Math.abs(fx) < (0.45 - ft) * 1.25 + 0.02;
          const tri2 = ft > 0.44 && ft < 0.68 && Math.abs(fx) < (ft - 0.44) * 1.25 + 0.02;
          const arms = Math.abs(ft - 0.26 - Math.abs(fx) * 0.25) < 0.018;
          const legL = ft > 0.67 && ft < 0.95 && Math.abs(fx + 0.12 + (ft - 0.67) * 0.5) < 0.04;
          const legR = ft > 0.67 && ft < 0.95 && Math.abs(fx - 0.12 - (ft - 0.67) * 0.5) < 0.04;
          if (head || tri1 || tri2 || arms || legL || legR) paint = 1;
        }
        if (t > 0.67 && t < 0.70) {
          const p = ((circ / (0.03 * S)) % 1 + 1) % 1;
          if (Math.hypot(p - 0.5, (t - 0.685) / 0.03 * 0.5) < 0.22) paint = 1;
        }
        if (t > 0.74 && t < 0.75) paint = 1;
        if (paint) { const pk = 0.88 + 0.08 * n(x * 0.4, y * 0.4); R = mix(R, 0.95 * pk, 0.9); G = mix(G, 0.92 * pk, 0.9); Bc = mix(Bc, 0.84 * pk, 0.9); }
        const ao = 0.6 + 0.4 * Math.pow(ct, 0.5);
        const lift = t > 0.97 ? 0.75 : 1;
        put(B, x, y, (R * d * ao + sp) * lift, (G * d * ao + sp * 0.9) * lift, (Bc * d * ao + sp * 0.8) * lift, a);
      }
    }
    // mouth opening
    const r0 = radiusAt(0), ey = top, eh = r0 * 0.26;
    for (let y = Math.floor(ey - eh - 2); y < ey + eh + 2; y++) for (let x = Math.floor(cx - r0 - 2); x < cx + r0 + 2; x++) {
      const q = Math.pow((x - cx) / r0, 2) + Math.pow((y - ey) / eh, 2);
      if (q > 1.02) continue;
      const lip = smooth(0.62, 0.8, q);
      const inner = 0.12 + 0.12 * ((y - ey) / eh + 1) * 0.5;
      const lipShade = 0.75 + 0.35 * (-(x - cx) / r0 * 0.5 + 0.5);
      const R = mix(inner * 1.1, 0.74 * lipShade, lip), G = mix(inner * 0.55, 0.38 * lipShade, lip), Bc = mix(inner * 0.4, 0.24 * lipShade, lip);
      put(B, x, y, R, G, Bc, smooth(1.02, 0.98, q));
    }
    return finish(B, 9, 0.22);
  }

  /* ---------- Bhajani chakli with a cup of chai ---------- */
  function chakli(S = 448, o = {}) {
    const opt = Object.assign({ ridge: 0.05, gloss: 0.45, wob: 0.16, chai: true, plateR: 0.5, layout: 1 }, o);
    const B = canvasBuf(S), n = makeNoise(71), n2 = makeNoise(73), r = rng(99);
    wood(B, n, [0.30, 0.18, 0.11], 0.3, true);
    const pcx = S * 0.44, pcy = S * 0.56, pR = S * opt.plateR;
    softShadow(B, pcx + 0.03 * S, pcy + 0.05 * S, pR * 1.02, pR * 1.0, 0.55);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const dx = x - pcx, dy = y - pcy, rho = Math.hypot(dx, dy);
      if (rho > pR + 1) continue;
      const a = smooth(pR + 0.8, pR - 0.8, rho), rn = rho / pR, ang = Math.atan2(dy, dx);
      const brushed = 0.04 * n(rho * 0.9, ang * 2) + 0.02 * n2(rho * 3, ang * 40);
      let k;
      if (rn > 0.86) {
        const t = (rn - 0.86) / 0.14, slope = Math.cos(t * Math.PI);
        const nn = norm3(Math.cos(ang) * slope * 0.8, Math.sin(ang) * slope * 0.8, 1);
        const [d, sp] = lightAt(nn, 0.9, 25, 0.4);
        k = 0.45 + 0.35 * d + sp + brushed;
      } else {
        k = 0.68 + 0.16 * (-(dx + dy) / pR) * 0.5 + 0.10 * Math.exp(-Math.pow((rn - 0.4) / 0.2, 2)) + brushed;
      }
      put(B, x, y, k * 0.93, k * 0.95, k, a);
    }
    // crumbs and sesame on the plate
    for (let i = 0; i < 90; i++) {
      const a = r() * Math.PI * 2, rr = Math.sqrt(r()) * pR * 0.8, cx = pcx + Math.cos(a) * rr, cy = pcy + Math.sin(a) * rr, sz = 1 + r() * 2.2, light = r() < 0.4;
      for (let y = Math.floor(cy - 3); y < cy + 3; y++) for (let x = Math.floor(cx - 3); x < cx + 3; x++) {
        if (x < 0 || y < 0 || x >= S || y >= S) continue;
        const e = Math.hypot(x - cx, (y - cy) * 1.6);
        if (e < sz) light ? put(B, x, y, 0.93, 0.88, 0.74, 0.9) : put(B, x, y, 0.55, 0.34, 0.14, 0.85);
      }
    }
    if (opt.chai) {
      const ccx = S * 0.86, ccy = S * 0.17, sR = S * 0.2, cR = S * 0.125;
      softShadow(B, ccx + 10, ccy + 14, sR * 1.05, sR, 0.5);
      for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
        const dx = x - ccx, dy = y - ccy, rho = Math.hypot(dx, dy);
        if (rho < sR) {
          const rn = rho / sR, rim = rn > 0.82 ? Math.cos((rn - 0.82) / 0.18 * Math.PI) : 0;
          const nn = norm3(dx / sR * rim * 0.9, dy / sR * rim * 0.9, 1);
          const [d, sp] = lightAt(nn, 0.5, 40, 0.5);
          const k = 0.8 + 0.18 * d + sp;
          put(B, x, y, k * 0.97, k * 0.96, k * 0.93, smooth(sR, sR - 1, rho));
        }
        const hx = x - (ccx - cR * 1.25), hy = y - (ccy + cR * 0.35);
        if (Math.abs(Math.hypot(hx / 1.4, hy) - cR * 0.32) < cR * 0.09 && x < ccx - cR * 0.9) put(B, x, y, 0.9, 0.89, 0.86);
      }
      softShadow(B, ccx + 6, ccy + 8, cR * 1.02, cR, 0.45);
      for (let y = Math.floor(ccy - cR - 2); y < ccy + cR + 2; y++) for (let x = Math.floor(ccx - cR - 2); x < ccx + cR + 2; x++) {
        if (x < 0 || y < 0 || x >= S || y >= S) continue;
        const dx = x - ccx, dy = y - ccy, rho = Math.hypot(dx, dy), rn = rho / cR;
        if (rn > 1) continue;
        if (rn > 0.86) { const k = 0.86 + 0.12 * (1 - (dx + dy) / cR * 0.5); put(B, x, y, k, k * 0.99, k * 0.96, smooth(1, 0.98, rn)); continue; }
        const skin = 0.04 * fbm(n2, x * 0.08, y * 0.08, 3), edge = smooth(0.6, 0.86, rn);
        let R = 0.74 + skin + edge * 0.08, G = 0.55 + skin + edge * 0.07, Bc = 0.36 + skin + edge * 0.05;
        const hl = Math.exp(-Math.pow(Math.hypot(dx + cR * 0.3, dy + cR * 0.32) / (cR * 0.16), 2)) * 0.5;
        put(B, x, y, R + hl, G + hl, Bc + hl);
      }
    }
    const layouts = [
      [[0.24, 0.40, 0.17, 0.4], [0.58, 0.40, 0.165, 2.1], [0.22, 0.75, 0.165, 4.0], [0.57, 0.77, 0.17, 1.2], [0.40, 0.58, 0.18, 5.3]],
      [[0.30, 0.48, 0.24, 0.4], [0.62, 0.70, 0.22, 2.6], [0.28, 0.82, 0.18, 4.4]]
    ];
    layouts[opt.layout].forEach(([fx, fy, fr, rot], ci) => {
      const cx = fx * S, cy = fy * S, R = fr * S, turns = 2.3, w = R / (turns * 2 + 1.5);
      const a0 = w * 1.05, b = (R - w - a0) / (turns * Math.PI * 2), phiMax = turns * Math.PI * 2;
      softShadow(B, cx + R * 0.16, cy + R * 0.2, R * 0.98, R * 0.98, 0.5);
      const seeds = [];
      for (let s2 = 0; s2 < 30; s2++) seeds.push([r() * phiMax, (r() - 0.5) * 1.2, r() * Math.PI]);
      for (let y = Math.max(0, Math.floor(cy - R * 1.2)); y < Math.min(S, cy + R * 1.2); y++)
        for (let x = Math.max(0, Math.floor(cx - R * 1.2)); x < Math.min(S, cx + R * 1.2); x++) {
          const dx = x - cx, dy = y - cy, rho = Math.hypot(dx, dy);
          if (rho > R * 1.2) continue;
          let ang = Math.atan2(dy, dx) - rot; ang = ((ang % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
          let best = null;
          for (let k = 0; k <= Math.ceil(turns); k++) {
            const ph = ang + k * Math.PI * 2;
            if (ph > phiMax) break;
            const wob = 1 + opt.wob * n(ph * 0.9 + ci * 5, ci);
            const ww = w * (1 + 0.25 * n2(ph * 2.1, ci * 3));
            const dd = rho - (a0 + b * ph) * wob;
            if (Math.abs(dd) < ww && (!best || Math.abs(dd) / ww < Math.abs(best.dd) / best.ww)) best = { dd, ph, ww };
          }
          if (!best) continue;
          const v = best.dd / best.ww, vv = Math.min(0.999, Math.abs(v));
          const ca = Math.cos(ang + rot), sa = Math.sin(ang + rot);
          const ridge = Math.sin(v * Math.PI * 2.5) * opt.ridge * 2;
          const crumb = (n2(x * 0.45, y * 0.45) + 0.6 * n(x * 0.9, y * 0.9)) * 0.45;
          const nn = norm3(ca * (v + ridge) + crumb, sa * (v + ridge) + crumb * 0.8, Math.sqrt(1 - vv * vv) + 0.05);
          const [d, sp] = lightAt(nn, opt.gloss, 18, 0.3);
          const fry = 0.5 + 0.5 * fbm(n, x * 0.05 + ci * 3, y * 0.05, 3);
          const edgeDark = 1 - 0.45 * Math.pow(vv, 2.5);
          let Rr = mix(0.80, 0.52, fry), G = mix(0.52, 0.28, fry), Bc = mix(0.20, 0.08, fry);
          for (const [sp2, sv, so] of seeds) {
            const dph = (best.ph - sp2) * (a0 + b * best.ph) / best.ww, dv = (v - sv);
            const ex = dph * Math.cos(so) + dv * Math.sin(so), ey = -dph * Math.sin(so) + dv * Math.cos(so);
            if (ex * ex / 0.11 + ey * ey / 0.03 < 1) { Rr = 0.92; G = 0.87; Bc = 0.72; }
          }
          const k = d * edgeDark;
          put(B, x, y, Rr * k + sp, G * k + sp * 0.9, Bc * k + sp * 0.65, smooth(1, 0.85, vv));
        }
    });
    return finish(B, 13, 0.3);
  }

  /* ---------- Block-print cotton kurta on a hanger ---------- */
  function kurta(S = 448) {
    const B = canvasBuf(S), n = makeNoise(5), n2 = makeNoise(7);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const t = y / S, k = 0.03 * fbm(n, x * 0.015, y * 0.015, 4) - 0.05 * Math.hypot(x / S - 0.5, t - 0.4);
      put(B, x, y, 0.91 + k, 0.89 + k, 0.85 + k);
    }
    const P = (x, y) => [x * S, y * S];
    const half = [P(0.07, 0.165), P(0.205, 0.205), P(0.265, 0.235), P(0.355, 0.500), P(0.270, 0.535), P(0.205, 0.345), P(0.230, 0.925)];
    const poly = [P(0.5, 0.215)];
    half.forEach(([x, y]) => poly.push([S * 0.5 + x, y]));
    for (let i = half.length - 1; i >= 0; i--) poly.push([S * 0.5 - half[i][0], half[i][1]]);
    const inside = (x, y) => {
      let c = false;
      for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        const [xi, yi] = poly[i], [xj, yj] = poly[j];
        if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) c = !c;
      }
      return c;
    };
    // wall shadow
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      let s = 0;
      for (const [ox, oy] of [[14, 16], [20, 20], [10, 22], [18, 12]]) if (inside(x - ox, y - oy)) s++;
      if (s) shade(B, x, y, 1 - 0.07 * s);
    }
    // hanger hook and bar
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const hx = x - 0.5 * S, hy = y - 0.105 * S, hr = Math.hypot(hx, hy);
      if (y < 0.13 * S && Math.abs(hr - 0.035 * S) < 0.0055 * S && !(hx < 0 && hy > 0)) {
        const k = 0.55 + 0.4 * (1 - (hy / (0.035 * S) + 1) * 0.5);
        put(B, x, y, k * 0.75, k * 0.77, k * 0.8);
      }
      if (x > 0.495 * S && x < 0.505 * S && y > 0.13 * S && y < 0.165 * S) put(B, x, y, 0.5, 0.52, 0.55);
      const bx = (x - 0.5 * S) / (0.27 * S), by = 0.165 * S + Math.pow(Math.abs(bx), 1.6) * 0.06 * S;
      if (Math.abs(bx) < 1 && Math.abs(y - by) < 0.011 * S) {
        const v = (y - by) / (0.011 * S), k = 0.75 + 0.25 * (1 - Math.abs(v)) - 0.2 * v;
        put(B, x, y, 0.52 * k, 0.33 * k, 0.18 * k);
      }
    }
    const motif = (u, v) => {
      const cx = Math.floor(u / 26), cy = Math.floor(v / 26), off = (cy % 2) * 13;
      const lx = ((u + off) % 26) - 13, ly = (v % 26) - 13;
      const rr = Math.hypot(lx, ly), aa = Math.atan2(ly, lx);
      const petal = rr < 6.5 * (0.6 + 0.4 * Math.abs(Math.cos(aa * 2.5)));
      return (petal && rr > 1.6) || (cx + cy) < -999 ? 1 : 0;
    };
    const ss = [[0.25, 0.25], [0.75, 0.25], [0.25, 0.75], [0.75, 0.75]];
    for (let y = Math.floor(0.16 * S); y < Math.ceil(0.94 * S); y++) for (let x = Math.floor(0.12 * S); x < Math.ceil(0.88 * S); x++) {
      let cov = 0;
      for (const [sx, sy] of ss) if (inside(x + sx, y + sy)) cov++;
      if (!cov) continue;
      const xr = (x - 0.5 * S) / S, yr = y / S;
      const isSleeve = Math.abs(xr) > 0.205 + (yr - 0.24) * 0.04 && yr < 0.54;
      const hemY = 0.925 + 0.012 * Math.sin(xr * 38 + 1.3) + 0.006 * Math.sin(xr * 90);
      if (!isSleeve && yr > hemY) continue;
      if (!isSleeve && yr > 0.80 && Math.abs(Math.abs(xr) - (0.205 + (yr - 0.34) * 0.045)) < (yr - 0.80) * 0.12) continue;
      const drapeF = 34 + 10 * yr, ph = xr * drapeF + fbm(n, yr * 2.2, xr * 3, 2) * 5;
      const amp = isSleeve ? 0.0 : 0.08 + 0.32 * smooth(0.3, 0.95, yr);
      const fold = isSleeve ? Math.sin(yr * 60 + xr * 40) * 0.22 : Math.sin(ph) * amp;
      const bodyHalf = 0.205 + Math.max(0, yr - 0.34) * 0.045;
      const cyl = isSleeve ? 0 : clamp(xr / bodyHalf, -1, 1);
      const nn = norm3(fold + cyl * 0.75, isSleeve ? 0.3 : -0.08 + 0.15 * smooth(0.85, 0.93, yr), 1);
      const [d, sp] = lightAt(nn, 0.10, 14, 0.4);
      const weave = 0.03 * (n2(x * 0.9, y * 0.12) + n2(x * 0.12, y * 0.9));
      let R = 0.13, G = 0.22, Bc = 0.42;
      const disp = Math.cos(ph) * amp * 9;
      if (motif(x - 0.5 * S + 400 + disp, y) && !(yr > 0.86)) { R = 0.92; G = 0.89; Bc = 0.80; }
      if (yr > 0.86 && yr < 0.915) {
        const zig = Math.abs(((x / 9) % 2) - 1) * 0.02 + 0.875;
        R = 0.55; G = 0.10; Bc = 0.18;
        if (Math.abs(yr - zig) < 0.006 || Math.abs(yr - 0.905) < 0.003) { R = 0.86; G = 0.66; Bc = 0.22; }
      }
      if (isSleeve) {
        const ax = Math.abs(xr) - 0.355, ay = yr - 0.5, dxl = -0.085, dyl = 0.035;
        const sd = (ax * dyl - ay * dxl) / Math.hypot(dxl, dyl);
        if (sd > -0.034) { R = 0.55; G = 0.10; Bc = 0.18; if (Math.abs(sd + 0.026) < 0.003) { R = 0.86; G = 0.66; Bc = 0.22; } }
      }
      const pl = Math.abs(xr) < 0.016 && yr > 0.2 && yr < 0.38;
      if (pl) { R *= 1.15; G *= 1.15; Bc *= 1.15; }
      for (const by of [0.245, 0.285, 0.325, 0.36]) if (Math.hypot(xr, yr - by) < 0.0075) { R = 0.95; G = 0.92; Bc = 0.85; }
      const neck = Math.hypot(xr / 0.07, (yr - 0.165) / 0.06);
      if (neck < 1.0) continue;
      if (neck < 1.16) { R = 0.55; G = 0.10; Bc = 0.18; }
      const shadeNeck = neck < 1.3 ? 0.82 : 1;
      const k = d * shadeNeck * (1 + weave);
      put(B, x, y, R * k + sp, G * k + sp, Bc * k + sp, cov / 4);
    }
    return finish(B, 3, 0.18);
  }

  const SCENES = { oranges, pot, chakli, kurta };
  function render(kind, S, o) { return SCENES[kind](S, o); }
  function toCanvas(kind, S = 448, o) {
    const img = render(kind, S, o), cv = document.createElement('canvas');
    cv.width = img.w; cv.height = img.h;
    cv.getContext('2d').putImageData(new ImageData(img.data, img.w, img.h), 0, 0);
    return cv;
  }
  return { render, toCanvas, kinds: Object.keys(SCENES) };
})();
