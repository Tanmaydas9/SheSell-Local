/* ------------------------------------------------------------------
   QR encoder (ISO/IEC 18004, byte mode, ECC L/M/Q/H, versions 1-40).
   Written from the spec so the UPI QR is generated fully offline.
------------------------------------------------------------------- */
const QR = (() => {
  const ECC_CW = [
    [-1,7,10,15,20,26,18,20,24,30,18,20,24,26,30,22,24,28,30,28,28,28,28,30,30,26,28,30,30,30,30,30,30,30,30,30,30,30,30,30,30],
    [-1,10,16,26,18,24,16,18,22,22,26,30,22,22,24,24,28,28,26,26,26,26,28,28,28,28,28,28,28,28,28,28,28,28,28,28,28,28,28,28,28],
    [-1,13,22,18,26,18,24,18,22,20,24,28,26,24,20,30,24,28,28,26,30,28,30,30,30,30,28,30,30,30,30,30,30,30,30,30,30,30,30,30,30],
    [-1,17,28,22,16,22,28,26,26,24,28,24,28,22,24,24,30,28,28,26,28,30,24,30,30,30,30,30,30,30,30,30,30,30,30,30,30,30,30,30,30]
  ];
  const NUM_BLOCKS = [
    [-1,1,1,1,1,1,2,2,2,2,4,4,4,4,4,6,6,6,6,7,8,8,9,9,10,12,12,12,13,14,15,16,17,18,19,19,20,21,22,24,25],
    [-1,1,1,1,2,2,4,4,4,5,5,5,8,9,9,10,10,11,13,14,16,17,17,18,20,21,23,25,26,28,29,31,33,35,37,38,40,43,45,47,49],
    [-1,1,1,2,2,4,4,6,6,8,8,8,10,12,16,12,17,16,18,21,20,23,23,25,27,29,34,34,35,38,40,43,45,48,51,53,56,59,62,65,68],
    [-1,1,1,2,4,4,4,5,6,8,8,11,11,16,16,18,16,19,21,25,25,25,34,30,32,35,37,40,42,45,48,51,54,57,60,63,66,70,74,77,81]
  ];
  const LEVEL_BITS = [1, 0, 3, 2]; // L, M, Q, H
  const bit = (x, i) => ((x >>> i) & 1) !== 0;

  function rawModules(ver) {
    let r = (16 * ver + 128) * ver + 64;
    if (ver >= 2) {
      const n = Math.floor(ver / 7) + 2;
      r -= (25 * n - 10) * n - 55;
      if (ver >= 7) r -= 36;
    }
    return r;
  }
  const dataCodewords = (ver, ecl) => Math.floor(rawModules(ver) / 8) - ECC_CW[ecl][ver] * NUM_BLOCKS[ecl][ver];

  function gfMul(x, y) {
    let z = 0;
    for (let i = 7; i >= 0; i--) {
      z = (z << 1) ^ ((z >>> 7) * 0x11D);
      z ^= ((y >>> i) & 1) * x;
    }
    return z & 0xFF;
  }
  function rsDivisor(degree) {
    const res = new Array(degree).fill(0);
    res[degree - 1] = 1;
    let root = 1;
    for (let i = 0; i < degree; i++) {
      for (let j = 0; j < res.length; j++) {
        res[j] = gfMul(res[j], root);
        if (j + 1 < res.length) res[j] ^= res[j + 1];
      }
      root = gfMul(root, 2);
    }
    return res;
  }
  function rsRemainder(data, div) {
    const res = new Array(div.length).fill(0);
    for (const b of data) {
      const f = b ^ res.shift();
      res.push(0);
      for (let i = 0; i < div.length; i++) res[i] ^= gfMul(div[i], f);
    }
    return res;
  }
  function alignPositions(ver) {
    if (ver === 1) return [];
    const n = Math.floor(ver / 7) + 2;
    const step = Math.floor((ver * 8 + n * 3 + 5) / (n * 4 - 4)) * 2;
    const res = [6];
    for (let pos = ver * 4 + 10; res.length < n; pos -= step) res.splice(1, 0, pos);
    return res;
  }

  function encode(text, minEcl = 1, forceMask = -1) {
    const bytes = Array.from(new TextEncoder().encode(String(text)));
    let ver = 0, ecl = minEcl;
    for (let v = 1; v <= 40; v++) {
      const ccBits = v < 10 ? 8 : 16;
      if (bytes.length < (1 << ccBits) && 4 + ccBits + bytes.length * 8 <= dataCodewords(v, ecl) * 8) { ver = v; break; }
    }
    if (!ver) throw new Error('Data too long for a QR code');
    const ccBits = ver < 10 ? 8 : 16;
    const usedBits = 4 + ccBits + bytes.length * 8;
    for (let e = 3; e > ecl; e--) { // boost error correction while it still fits
      if (usedBits <= dataCodewords(ver, e) * 8) { ecl = e; break; }
    }
    // Bit stream
    const bits = [];
    const push = (val, len) => { for (let i = len - 1; i >= 0; i--) bits.push((val >>> i) & 1); };
    push(4, 4); push(bytes.length, ccBits);
    bytes.forEach(b => push(b, 8));
    const capBits = dataCodewords(ver, ecl) * 8;
    push(0, Math.min(4, capBits - bits.length));
    push(0, (8 - bits.length % 8) % 8);
    for (let pad = 0xEC; bits.length < capBits; pad ^= 0xEC ^ 0x11) push(pad, 8);
    const data = [];
    for (let i = 0; i < bits.length; i += 8) {
      let b = 0;
      for (let j = 0; j < 8; j++) b = (b << 1) | bits[i + j];
      data.push(b);
    }
    // ECC + interleave
    const nb = NUM_BLOCKS[ecl][ver], eccLen = ECC_CW[ecl][ver];
    const raw = Math.floor(rawModules(ver) / 8);
    const nShort = nb - raw % nb, shortLen = Math.floor(raw / nb);
    const div = rsDivisor(eccLen);
    const blocks = [];
    for (let i = 0, k = 0; i < nb; i++) {
      const dat = data.slice(k, k + shortLen - eccLen + (i < nShort ? 0 : 1));
      k += dat.length;
      const ecc = rsRemainder(dat, div);
      if (i < nShort) dat.push(0);
      blocks.push(dat.concat(ecc));
    }
    const cw = [];
    for (let i = 0; i < blocks[0].length; i++) {
      blocks.forEach((blk, j) => { if (i !== shortLen - eccLen || j >= nShort) cw.push(blk[i]); });
    }

    // Matrix
    const size = ver * 4 + 17;
    const mod = Array.from({ length: size }, () => new Array(size).fill(false));
    const fn = Array.from({ length: size }, () => new Array(size).fill(false));
    const setF = (x, y, dark) => { mod[y][x] = dark; fn[y][x] = true; };
    for (let i = 0; i < size; i++) { setF(6, i, i % 2 === 0); setF(i, 6, i % 2 === 0); }
    const finder = (cx, cy) => {
      for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
        const d = Math.max(Math.abs(dx), Math.abs(dy)), x = cx + dx, y = cy + dy;
        if (x >= 0 && x < size && y >= 0 && y < size) setF(x, y, d !== 2 && d !== 4);
      }
    };
    finder(3, 3); finder(size - 4, 3); finder(3, size - 4);
    const ap = alignPositions(ver), na = ap.length;
    for (let i = 0; i < na; i++) for (let j = 0; j < na; j++) {
      if ((i === 0 && j === 0) || (i === 0 && j === na - 1) || (i === na - 1 && j === 0)) continue;
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++)
        setF(ap[i] + dx, ap[j] + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
    }
    const drawFormat = (mask) => {
      const d = LEVEL_BITS[ecl] << 3 | mask;
      let rem = d;
      for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
      const b = ((d << 10) | rem) ^ 0x5412;
      for (let i = 0; i <= 5; i++) setF(8, i, bit(b, i));
      setF(8, 7, bit(b, 6)); setF(8, 8, bit(b, 7)); setF(7, 8, bit(b, 8));
      for (let i = 9; i < 15; i++) setF(14 - i, 8, bit(b, i));
      for (let i = 0; i < 8; i++) setF(size - 1 - i, 8, bit(b, i));
      for (let i = 8; i < 15; i++) setF(8, size - 15 + i, bit(b, i));
      setF(8, size - 8, true);
    };
    drawFormat(0);
    if (ver >= 7) {
      let rem = ver;
      for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1F25);
      const b = (ver << 12) | rem;
      for (let i = 0; i < 18; i++) {
        const c = bit(b, i), a = size - 11 + i % 3, bb = Math.floor(i / 3);
        setF(a, bb, c); setF(bb, a, c);
      }
    }
    // Place data (zig-zag)
    let idx = 0;
    for (let right = size - 1; right >= 1; right -= 2) {
      if (right === 6) right = 5;
      for (let vert = 0; vert < size; vert++) for (let j = 0; j < 2; j++) {
        const x = right - j, up = ((right + 1) & 2) === 0, y = up ? size - 1 - vert : vert;
        if (!fn[y][x] && idx < cw.length * 8) { mod[y][x] = bit(cw[idx >>> 3], 7 - (idx & 7)); idx++; }
      }
    }
    const applyMask = (m) => {
      for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
        let inv;
        switch (m) {
          case 0: inv = (x + y) % 2 === 0; break;
          case 1: inv = y % 2 === 0; break;
          case 2: inv = x % 3 === 0; break;
          case 3: inv = (x + y) % 3 === 0; break;
          case 4: inv = (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0; break;
          case 5: inv = (x * y) % 2 + (x * y) % 3 === 0; break;
          case 6: inv = ((x * y) % 2 + (x * y) % 3) % 2 === 0; break;
          default: inv = ((x + y) % 2 + (x * y) % 3) % 2 === 0;
        }
        if (!fn[y][x] && inv) mod[y][x] = !mod[y][x];
      }
    };
    const penalty = () => {
      let p = 0, dark = 0;
      const line = (get) => {
        for (let a = 0; a < size; a++) {
          let run = 1, s = '';
          for (let b = 0; b < size; b++) {
            const v = get(a, b);
            s += v ? '1' : '0';
            if (b > 0) {
              if (v === get(a, b - 1)) { run++; if (run === 5) p += 3; else if (run > 5) p++; }
              else run = 1;
            }
          }
          const padded = '0000' + s + '0000';
          for (let i = 0; i + 11 <= padded.length; i++) {
            const w = padded.substr(i, 11);
            if (w === '10111010000' || w === '00001011101') p += 40;
          }
        }
      };
      line((a, b) => mod[a][b]);
      line((a, b) => mod[b][a]);
      for (let y = 0; y < size - 1; y++) for (let x = 0; x < size - 1; x++) {
        const c = mod[y][x];
        if (c === mod[y][x + 1] && c === mod[y + 1][x] && c === mod[y + 1][x + 1]) p += 3;
      }
      for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (mod[y][x]) dark++;
      const total = size * size;
      p += (Math.ceil(Math.abs(dark * 20 - total * 10) / total) - 1) * 10;
      return p;
    };
    let best = forceMask, bestP = Infinity;
    for (let m = 0; m < 8 && forceMask < 0; m++) {
      applyMask(m); drawFormat(m);
      const p = penalty();
      if (p < bestP) { bestP = p; best = m; }
      applyMask(m);
    }
    applyMask(best); drawFormat(best);
    return { size, modules: mod, version: ver, ecl: 'LMQH'[ecl], mask: best };
  }

  /** Draws the QR onto a canvas with a 4-module quiet zone. */
  function draw(canvas, qr, px = 240, dark = '#0E2A31', light = '#FFFFFF') {
    const quiet = 4, n = qr.size + quiet * 2;
    const scale = Math.max(1, Math.floor(px / n));
    const dim = n * scale;
    const ratio = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = dim * ratio; canvas.height = dim * ratio;
    canvas.style.width = dim + 'px'; canvas.style.height = dim + 'px';
    const g = canvas.getContext('2d');
    g.setTransform(ratio, 0, 0, ratio, 0, 0);
    g.fillStyle = light; g.fillRect(0, 0, dim, dim);
    g.fillStyle = dark;
    for (let y = 0; y < qr.size; y++) for (let x = 0; x < qr.size; x++)
      if (qr.modules[y][x]) g.fillRect((x + quiet) * scale, (y + quiet) * scale, scale, scale);
  }

  return { encode, draw };
})();
