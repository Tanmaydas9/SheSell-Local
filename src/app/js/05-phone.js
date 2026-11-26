/* ------------------------------------------------------------------
   WhatsApp Flow Preview (simulated): the buyer's chat with the official
   SheSell Business number, showing the messages each step sends.
   Phase 2 sends these for real through the WhatsApp Cloud API.
------------------------------------------------------------------- */
const PHONE = (() => {
  const chat = [];
  const hhmm = (d) => d.toLocaleTimeString(state.lang === 'mr' ? 'mr-IN' : 'en-IN', { hour: 'numeric', minute: '2-digit' });
  const BRAND_AVATAR = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><rect width="40" height="40" fill="#9EB83B"/><path d="M11.5 15h17l-2.2 15.5H13.7z" fill="#1B434D"/><path d="M15.5 15c0-5.6 9-5.6 9 0" fill="none" stroke="#1B434D" stroke-width="2.6"/></svg>');

  function bubble(m, fresh) {
    const meta = `<span class="meta">${esc(hhmm(m.time))}${m.dir === 'out' ? icon('ticks') : ''}</span>`;
    let inner = '';
    if (m.img) inner += `<img class="ph" src="${m.img}" alt="">`;
    if (m.product) {
      const p = state.products.find(x => x.id === m.product);
      if (p) inner += `<button type="button" class="pcard-mini" data-open="${esc(p.id)}"><span class="art">${ART.svg(p)}</span><span><b>${esc(L(p.name))}</b><br><span class="tiny">${inr(p.price)} · ${esc(L(p.unit))}</span></span></button>`;
    }
    const text = typeof m.text === 'function' ? m.text() : m.text;
    if (text) inner += `<span>${esc(text)}</span>`;
    return `<div class="msg ${m.dir}${fresh ? ' new' : ''}">${inner}${meta}</div>`;
  }
  function render() {
    const box = $('#chat');
    if (!box) return;
    box.innerHTML = `<span class="day">${esc(t('today'))}</span><span class="sim-note">${esc(t('simNote'))}</span>` + chat.map(m => bubble(m)).join('');
    box.scrollTop = box.scrollHeight;
    $('#waName').textContent = 'SheSell Local';
    $('#waSub').textContent = t('waBiz');
    $('#waAvatar').src = BRAND_AVATAR;
  }
  let seq = 0;
  function post(m) {
    m.id = 'm' + (++seq);
    m.time = m.time || new Date();
    chat.push(m);
    if (chat.length > 60) chat.shift();
    const box = $('#chat');
    if (box) { box.insertAdjacentHTML('beforeend', bubble(m, true)); box.scrollTop = box.scrollHeight; }
    return m;
  }

  function bind() {
    $('#waFab').addEventListener('click', () => { document.body.classList.add('phone-open'); render(); });
    $('#phoneClose').addEventListener('click', () => document.body.classList.remove('phone-open'));
    $('#phoneCol').addEventListener('click', (e) => { if (e.target === $('#phoneCol') && document.body.classList.contains('phone-open')) document.body.classList.remove('phone-open'); });
    const tick = () => { const c = $('#clock'); if (c) c.textContent = new Date().toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: false }); };
    tick(); setInterval(tick, 30000);
    const send = () => { $('#waSend').href = waLink(t('waHello')); };
    send();
    BUS.on('lang', () => { render(); send(); });
    BUS.on('settings', send);
  }
  function seed() {
    post({ dir: 'in', text: () => t('waWelcome') });
    render();
  }
  return { post, render, bind, seed };
})();
