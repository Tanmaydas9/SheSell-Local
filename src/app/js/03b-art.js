/* ------------------------------------------------------------------
   Flat product illustrations (inline SVG, deck palette).
------------------------------------------------------------------- */
const ART = (() => {
  const C = { teal: '#1B434D', lime: '#9EB83B', mustard: '#E3A83B', pink: '#D2648E', aqua: '#74BDBA', terra: '#C2603A', maroon: '#8C2B3F', indigo: '#2B4A7A', brown: '#8A5A33', cream: '#FFF6E5', gold: '#D9A53B', leaf: '#4F8A3B', white: '#FFFFFF' };
  const BG = { food: '#F7E6C4', tailoring: '#F5DCE6', craft: '#DCEDEA', agri: '#E7F0CC' };
  const spiral = (cx, cy, r, turns = 2.4, rot = 0) => {
    let d = '';
    const steps = 90;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps, a = rot + t * turns * Math.PI * 2, rr = r * (0.12 + 0.88 * t);
      d += (i ? 'L' : 'M') + (cx + Math.cos(a) * rr).toFixed(1) + ' ' + (cy + Math.sin(a) * rr).toFixed(1);
    }
    return d;
  };
  const shadow = (cx, cy, rx, ry = 6) => `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="#000" opacity=".08"/>`;
  const plate = (cx, cy, rx, ry) => `${shadow(cx + 3, cy + 6, rx, ry * 0.6)}<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="#E9EEF0"/><ellipse cx="${cx}" cy="${cy - 1}" rx="${rx - 7}" ry="${ry - 5}" fill="#D7DEE2"/>`;
  const draw = {
    chakli: () => plate(80, 78, 58, 24) + [[58, 70, 17, 0.3], [98, 72, 17, 2.1], [78, 62, 19, 4.2]].map(([x, y, r, rot]) =>
      `<path d="${spiral(x, y, r, 2.3, rot)}" fill="none" stroke="#9A5B22" stroke-width="7.5" stroke-linecap="round" transform="matrix(1 0 0 .62 0 ${(y * 0.38).toFixed(1)})"/><path d="${spiral(x, y, r, 2.3, rot)}" fill="none" stroke="#D9963E" stroke-width="3.2" stroke-linecap="round" transform="matrix(1 0 0 .62 0 ${(y * 0.38 - 1.2).toFixed(1)})"/>`).join(''),
    ladoo: () => plate(80, 82, 56, 20) + [[60, 74], [80, 74], [100, 74], [70, 60], [90, 60], [80, 47]].map(([x, y]) =>
      `<circle cx="${x}" cy="${y}" r="12" fill="${C.mustard}"/><circle cx="${x - 4}" cy="${y - 4}" r="4" fill="#F6CF7F"/><circle cx="${x + 3}" cy="${y + 2}" r="1.3" fill="#B97B1E"/>`).join(''),
    pickle: () => `${shadow(80, 100, 30)}<rect x="56" y="38" width="48" height="62" rx="12" fill="#F3F7F8" stroke="#C9D3D6" stroke-width="2"/><rect x="60" y="56" width="40" height="40" rx="9" fill="${C.terra}"/>` +
      [[68, 66], [84, 72], [74, 82], [90, 86], [92, 62]].map(([x, y]) => `<path d="M${x - 6} ${y}q6 -8 12 0q-6 6 -12 0z" fill="#E9B44C"/>`).join('') +
      `<rect x="58" y="28" width="44" height="14" rx="4" fill="${C.maroon}"/><path d="M58 33h44M66 28v14M78 28v14M90 28v14" stroke="#B6475F" stroke-width="2"/><path d="M60 42c10 6 30 6 40 0" stroke="${C.gold}" stroke-width="2.5" fill="none"/>`,
    poli: () => `${shadow(76, 98, 46)}` + [0, 1, 2, 3].map(i => `<ellipse cx="${74 - i}" cy="${88 - i * 7}" rx="46" ry="14" fill="${i % 2 ? '#E7B96A' : '#EDC67D'}" stroke="#C8913F" stroke-width="1.5"/>`).join('') +
      [[60, 66], [84, 64], [72, 70], [96, 69], [52, 69]].map(([x, y]) => `<ellipse cx="${x}" cy="${y}" rx="3.5" ry="1.6" fill="#A8692A"/>`).join('') +
      `<ellipse cx="126" cy="88" rx="16" ry="7" fill="${C.cream}" stroke="#D9C6A0" stroke-width="2"/><ellipse cx="126" cy="86" rx="11" ry="4" fill="#F2CE5C"/>`,
    papad: () => `${shadow(80, 100, 52)}` + [[64, 86, -10], [96, 82, 8], [80, 66, 2]].map(([x, y, rot]) =>
      `<g transform="rotate(${rot} ${x} ${y})"><ellipse cx="${x}" cy="${y + 2}" rx="34" ry="12" fill="#CDB78F"/><ellipse cx="${x}" cy="${y}" rx="34" ry="12" fill="#EAD9B4" stroke="#C7AE80" stroke-width="1.2"/>${[[-14, -2], [-4, 3], [8, -4], [16, 2], [-20, 3], [2, -6], [22, -2]].map(([dx, dy]) => `<circle cx="${x + dx}" cy="${y + dy}" r="1.1" fill="#4A3A2A"/>`).join('')}<ellipse cx="${x - 8}" cy="${y - 3}" rx="6" ry="2" fill="#F6EBD2"/></g>`).join(''),
    blouse: () => `${shadow(80, 104, 42)}<path d="M52 34l16-6q12 10 24 0l16 6l18 18l-12 14l-10-8v34q-24 8-48 0v-34l-10 8l-12-14z" fill="${C.maroon}"/>` +
      `<path d="M64 28q16 18 32 0" fill="none" stroke="${C.gold}" stroke-width="3"/><path d="M56 92q24 8 48 0" stroke="${C.gold}" stroke-width="5" fill="none"/><path d="M34 52l12 14M126 52l-12 14" stroke="${C.gold}" stroke-width="4"/><path d="M80 40v46" stroke="#6F1F31" stroke-width="2" stroke-dasharray="3 3"/>`,
    kurti: () => `${shadow(80, 108, 38)}<path d="M60 24L72 18Q80 27 88 18L100 24L118 46L107 56L101 47V100Q80 105 59 100V47L53 56L42 46Z" fill="${C.indigo}"/>` +
      Array.from({ length: 16 }, (_, i) => `<circle cx="${65 + (i % 4) * 10 + (Math.floor(i / 4) % 2) * 5}" cy="${40 + Math.floor(i / 4) * 14}" r="2.4" fill="#F4EEE1"/>`).join('') +
      `<path d="M59 97Q80 102 101 97" stroke="${C.pink}" stroke-width="5" fill="none"/><path d="M72 18Q80 27 88 18" fill="none" stroke="${C.pink}" stroke-width="2.5"/><path d="M107 56L118 46M53 56L42 46" stroke="${C.pink}" stroke-width="3"/>`,
    saree: () => `${shadow(76, 100, 48)}<rect x="34" y="72" width="86" height="22" rx="4" fill="${C.pink}"/><rect x="34" y="88" width="86" height="6" fill="${C.gold}"/><rect x="40" y="52" width="76" height="22" rx="4" fill="${C.teal}"/><rect x="40" y="68" width="76" height="6" fill="${C.lime}"/>` +
      `<path d="M118 34q-30 30 -6 50" fill="none" stroke="${C.maroon}" stroke-width="2"/><path d="M110 26l14 14" stroke="#9AA5A8" stroke-width="3" stroke-linecap="round"/><circle cx="110" cy="26" r="2" fill="#fff" stroke="#9AA5A8"/>`,
    nauvari: () => `${shadow(80, 106, 40)}<path d="M64 26q16-8 32 0l8 30q-10 10 0 22l8 26h-72l8-26q10-12 0-22z" fill="#6A2C7A"/><path d="M64 26q-6 40 20 78" fill="none" stroke="${C.gold}" stroke-width="5"/>` +
      `<path d="M48 104h72" stroke="${C.gold}" stroke-width="6"/><path d="M98 30q8 30 -6 50" fill="none" stroke="#8F4AA0" stroke-width="3"/>` + [[70, 60], [86, 74], [76, 88], [92, 50]].map(([x, y]) => `<path d="M${x} ${y - 4}l3 4l-3 4l-3-4z" fill="${C.gold}"/>`).join(''),
    frock: () => `${shadow(80, 108, 46)}<path d="M64 22h32l12 8l-6 9l-6-4v12h-36v-12l-6 4l-6-9z" fill="${C.lime}"/><path d="M62 47h36l26 56q-44 9-88 0z" fill="${C.pink}"/>` +
      `<path d="M62 47h36" stroke="${C.gold}" stroke-width="4"/><path d="M38 99q42 9 84 0" stroke="${C.gold}" stroke-width="6" fill="none"/><path d="M70 22q10 9 20 0" fill="none" stroke="#6F8A22" stroke-width="2"/>` + [[68, 64], [90, 70], [78, 82], [100, 86], [58, 84]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="2.6" fill="${C.gold}"/>`).join(''),
    bag: () => `${shadow(80, 108, 42)}<path d="M60 44q0-24 20-24t20 24" fill="none" stroke="${C.brown}" stroke-width="5"/><path d="M42 44h76l-6 60h-64z" fill="#E9D7B5"/>` +
      [52, 60, 68].map((y, i) => `<path d="M${44 - i * 0.3} ${y}h${72 + i * 0.6}" stroke="${[C.teal, C.mustard, C.terra][i]}" stroke-width="5"/>`).join('') + `<rect x="66" y="78" width="28" height="16" rx="3" fill="${C.teal}" opacity=".85"/>`,
    warli: () => `${shadow(80, 110, 44)}<rect x="36" y="18" width="88" height="86" rx="4" fill="#9C4A2A" stroke="#6F3017" stroke-width="3"/><circle cx="80" cy="62" r="26" fill="none" stroke="#F5EEDC" stroke-width="1.5" stroke-dasharray="2 4"/>` +
      Array.from({ length: 8 }, (_, i) => {
        const a = i / 8 * Math.PI * 2, x = 80 + Math.cos(a) * 26, y = 62 + Math.sin(a) * 26;
        return `<g transform="translate(${x.toFixed(1)} ${y.toFixed(1)})" fill="#F5EEDC"><circle cy="-8" r="2.4"/><path d="M-4-5h8l-4 5zM-4 5h8l-4-5z"/></g>`;
      }).join('') + `<path d="M76 58l4-6l4 6zM76 66l4 6l4-6z" fill="#F5EEDC"/>`,
    diya: () => [[52, 84], [80, 90], [108, 84]].map(([x, y]) =>
      `${shadow(x, y + 10, 20, 4)}<path d="M${x - 20} ${y - 4}q20 22 40 0z" fill="${C.terra}"/><path d="M${x - 20} ${y - 4}q20 8 40 0" fill="#E08A5A"/><path d="M${x + 2} ${y - 8}q-8-10 0-22q8 12 0 22z" fill="${C.mustard}"/><path d="M${x + 1} ${y - 9}q-3-6 0-12q3 6 0 12z" fill="#FFF1B8"/><path d="M${x - 12} ${y + 2}h24" stroke="${C.cream}" stroke-width="2" stroke-dasharray="2 3"/>`).join(''),
    basket: () => `${shadow(80, 108, 48)}<path d="M30 54h100l-12 50h-76z" fill="#C99A5B"/>` +
      Array.from({ length: 9 }, (_, i) => `<path d="M${40 + i * 10} 54l${-4 + i} 50" stroke="#A9783D" stroke-width="2"/>`).join('') +
      [64, 76, 88, 98].map(y => `<path d="M${30 + (y - 54) * 0.24} ${y}h${100 - (y - 54) * 0.48}" stroke="#E2BE85" stroke-width="3"/>`).join('') + `<ellipse cx="80" cy="54" rx="50" ry="8" fill="#B9874A"/>`,
    toran: () => `<path d="M20 30q60 20 120 0" stroke="${C.brown}" stroke-width="3" fill="none"/>` +
      Array.from({ length: 9 }, (_, i) => {
        const x = 26 + i * 13.5, y = 31 + Math.sin(i / 8 * Math.PI) * 10;
        const col = i % 2 ? C.leaf : C.mustard;
        return `<path d="M${x} ${y}q-7 18 0 34q7-16 0-34z" fill="${col}"/><circle cx="${x}" cy="${y + 40}" r="3" fill="${[C.pink, C.teal, C.terra][i % 3]}"/><path d="M${x} ${y}v40" stroke="${C.gold}" stroke-width="1"/>`;
      }).join(''),
    veg: () => `${shadow(80, 108, 50)}<path d="M32 62h96l-10 42h-76z" fill="#C99A5B"/>` +
      `<path d="M50 60q-10-26 14-34q4 20-14 34z" fill="${C.leaf}"/><path d="M60 58q2-24 24-24q-6 20-24 24z" fill="#6DA548"/>` +
      `<ellipse cx="104" cy="56" rx="20" ry="11" fill="#5B2A6E" transform="rotate(-20 104 56)"/><path d="M118 46l8-6" stroke="${C.leaf}" stroke-width="4"/>` +
      [[64, 60], [82, 56], [74, 50]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="11" fill="#D9412F"/><path d="M${x - 4} ${y - 10}l4 3l4-3" stroke="${C.leaf}" stroke-width="2.5" fill="none"/>`).join('') +
      `<path d="M32 62h96" stroke="#A9783D" stroke-width="3"/>`,
    orange: () => [[60, 78, 22], [100, 80, 21], [80, 58, 22]].map(([x, y, r]) =>
      `${shadow(x + 4, y + r - 2, r * 0.9, 4)}<circle cx="${x}" cy="${y}" r="${r}" fill="#EE8A1C"/><circle cx="${x - r * 0.35}" cy="${y - r * 0.35}" r="${r * 0.28}" fill="#F7B357"/><circle cx="${x + 3}" cy="${y - r + 5}" r="2" fill="${C.leaf}"/>`).join('') +
      `<path d="M84 38q16-12 30 0q-16 8 -30 0z" fill="${C.leaf}"/>`,
    pomegranate: () => [[56, 82, 22], [104, 82, 21]].map(([x, y, r]) =>
      `${shadow(x + 4, y + r - 2, r * 0.9, 4)}<circle cx="${x}" cy="${y}" r="${r}" fill="#B3263A"/><circle cx="${x - r * 0.38}" cy="${y - r * 0.36}" r="${r * 0.26}" fill="#D9566A"/>` +
      `<path d="M${x - 6} ${y - r + 3}l1-9l3 5l2-6l2 6l3-5l1 9z" fill="#8A1B2B"/>`).join('') +
      `${shadow(84, 70, 20, 4)}<circle cx="80" cy="54" r="21" fill="#B3263A"/><circle cx="80" cy="54" r="16.5" fill="#F3E2C6"/>` +
      Array.from({ length: 19 }, (_, i) => { const a = i * 2.4, d = 3 + (i % 5) * 2.6; return `<circle cx="${(80 + Math.cos(a) * d).toFixed(1)}" cy="${(54 + Math.sin(a) * d).toFixed(1)}" r="2.6" fill="#D43349"/>`; }).join('') +
      `<path d="M112 40q10-12 22-4q-12 8-22 4z" fill="${C.leaf}"/>`,
    jaggery: () => `${shadow(80, 104, 50)}<path d="M24 96q56 -30 112 0q-56 18 -112 0z" fill="#5E9A43"/>` +
      [[52, 74], [80, 70], [108, 74], [66, 56], [94, 56]].map(([x, y]) => `<path d="M${x - 13} ${y}l13-7l13 7v14l-13 7l-13-7z" fill="#9B5B23"/><path d="M${x - 13} ${y}l13 7l13-7l-13-7z" fill="#C07A35"/><path d="M${x} ${y + 7}v14" stroke="#7E4519" stroke-width="1.5"/>`).join(''),
    banana: () => `${shadow(80, 104, 46)}` + [0, 1, 2, 3].map(i => {
        const ox = i * 9, oy = i * 5;
        return `<path d="M${106 - i * 2} ${40 + i * 2}Q${74 + ox} ${46 + oy} ${48 + ox} ${88 + oy}" fill="none" stroke="#B8901A" stroke-width="15" stroke-linecap="round"/><path d="M${106 - i * 2} ${40 + i * 2}Q${74 + ox} ${46 + oy} ${48 + ox} ${88 + oy}" fill="none" stroke="${['#F2CF3A', '#EBC12E', '#F5D650', '#E9BE2A'][i]}" stroke-width="12" stroke-linecap="round"/><circle cx="${48 + ox}" cy="${88 + oy}" r="3" fill="#5A4316"/>`;
      }).join('') + `<path d="M100 40q8-10 14-6" stroke="#6B4E1E" stroke-width="7" fill="none" stroke-linecap="round"/>`,
    rice: () => `${shadow(80, 108, 44)}<path d="M50 40q30-10 60 0l8 64q-38 8-76 0z" fill="#D7B98A"/><path d="M50 40q30 10 60 0" fill="none" stroke="#B49565" stroke-width="3"/><path d="M58 44l-6-12M104 44l6-12" stroke="#B49565" stroke-width="3"/>` +
      `<rect x="62" y="62" width="36" height="20" rx="3" fill="${C.teal}"/><path d="M68 72h24" stroke="#F5EEDC" stroke-width="2"/>` +
      Array.from({ length: 22 }, (_, i) => { const x = 108 + (i % 6) * 5 + (i * 7) % 3, y = 98 + Math.floor(i / 6) * 3.5; return `<ellipse cx="${x}" cy="${y}" rx="2.4" ry="1.1" fill="#FBF7EC" stroke="#D8CDAE" stroke-width=".6" transform="rotate(${(i * 37) % 180} ${x} ${y})"/>`; }).join('')
  };
  function svg(p, cls = '', fit = 'slice') {
    if (p.image) return `<img class="${cls} art-photo" src="${p.image}" alt="" loading="lazy"${fit === 'meet' ? ' style="object-fit:contain"' : ''}>`;
    const body = (draw[p.art] || draw.bag)();
    return `<svg class="${cls}" viewBox="0 0 160 120" role="img" aria-hidden="true" preserveAspectRatio="xMidYMid ${fit}"><rect width="160" height="120" fill="${BG[p.cat] || '#EEF2E6'}"/>${body}</svg>`;
  }
  return { svg, BG };
})();
