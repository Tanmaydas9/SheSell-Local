/* ------------------------------------------------------------------
   Console boot: sign-in (and new-seller registration), session check,
   navigation, language.
------------------------------------------------------------------- */
let loginMode = 'in';
function demoBox() {
  const d = S.info && S.info.demo;
  if (!d || (!d.seller && !d.adminFile)) return '';
  return `<details class="demo-creds"><summary>${icon('info')}<span>${esc(t('demoTitle'))}</span>${icon('chev')}</summary>
    <div class="demo-body">
      ${d.seller ? `<div class="demo-row"><span>${esc(t('demoSeller'))}</span><b>${esc(d.seller.login)}</b><span>PIN</span><b>${esc(d.seller.pin)}</b><small>${esc(d.seller.name)}</small>
        <button type="button" class="btn ghost sm" data-demo-fill>${esc(t('demoFill'))}</button></div>` : ''}
      <p class="small">${icon('lock')}<span>${esc(d.adminFile ? t('demoAdmin', { file: d.adminFile }) : t('demoAdminEnv'))}</span></p>
      <p class="muted small">${esc(t('demoNote'))}</p>
    </div></details>`;
}
function renderLogin(msg) {
  const L2 = $('#login'), reg = loginMode === 'reg';
  L2.innerHTML = `<div class="login-card">
    <div class="brand-row">${BRAND_SVG}<span><b>SheSell ${esc(t('consoleWord'))}</b><small>${esc(t('consoleTag'))}</small></span></div>
    <h1 class="h1">${esc(t(reg ? 'regTitle' : 'loginTitle'))}</h1>
    <p class="muted">${esc(t(reg ? 'regSub' : 'loginSub'))}</p>
    ${msg ? `<p class="note warn">${icon('alert')}<span>${esc(msg)}</span></p>` : ''}
    ${reg ? `<form id="regForm" class="form" novalidate>
      <label class="field"><span class="label">${esc(t('regName'))}</span><input class="input" id="rName" autocomplete="organization" maxlength="80" required></label>
      <div class="grid-f">
        <label class="field"><span class="label">${esc(t('phone'))}</span><input class="input" id="rPhone" type="tel" inputmode="numeric" autocomplete="tel" maxlength="14" required placeholder="98XXXXXXXX"></label>
        <label class="field"><span class="label">${esc(t('regPin'))}</span><input class="input" id="rPin" type="password" inputmode="numeric" autocomplete="new-password" maxlength="6" required></label>
      </div>
      <div class="field"><span class="label">${esc(t('sellerType'))}</span><div class="seg" id="rType" role="group"><button type="button" data-type="individual" aria-pressed="true">${esc(t('typeInd'))}</button><button type="button" data-type="shg" aria-pressed="false">${esc(t('typeShg'))}</button></div></div>
      <div class="grid-f">
        <label class="field"><span class="label">${esc(t('place'))}</span><input class="input" id="rPlace" maxlength="80" required placeholder="${esc(t('regPlacePh'))}"></label>
        <label class="field" id="rMembersF" hidden><span class="label">${esc(t('members'))}</span><input class="input" id="rMembers" type="number" min="2" max="500" value="10"></label>
      </div>
      <p class="form-err" id="lErr" hidden></p>
      <button type="submit" class="btn teal block" id="lBtn">${icon('check')}<span>${esc(t('regBtn'))}</span></button>
      <button type="button" class="btn ghost block" data-mode="in">${esc(t('toSignIn'))}</button>
    </form>` : `<form id="loginForm" class="form" novalidate>
      <label class="field"><span class="label">${esc(t('loginField'))}</span><input class="input" id="lLogin" autocomplete="username" maxlength="20" required placeholder="${esc(t('loginPh'))}"></label>
      <label class="field"><span class="label">${esc(t('secretField'))}</span><input class="input" id="lSecret" type="password" autocomplete="current-password" maxlength="128" required></label>
      <p class="form-err" id="lErr" hidden></p>
      <button type="submit" class="btn teal block" id="lBtn">${icon('lock')}<span>${esc(t('signIn'))}</span></button>
      <button type="button" class="btn ghost block" data-mode="reg">${icon('plus')}<span>${esc(t('toRegister'))}</span></button>
    </form>
    ${demoBox()}`}
    <div class="login-roles">${icon('shield')}<p>${esc(t('rolesNote'))}</p></div>
    <div class="login-foot"><div class="lang" role="group" aria-label="Language / भाषा"><button type="button" data-lang="en" aria-pressed="${S.lang === 'en'}">EN</button><button type="button" data-lang="mr" lang="mr" aria-pressed="${S.lang === 'mr'}">मराठी</button></div><a href="/">${icon('store')}<span>${esc(t('backToShop'))}</span></a></div>
  </div>`;
  document.documentElement.lang = S.lang;
  setTimeout(() => { const f = $(reg ? '#rName' : '#lLogin'); if (f) f.focus(); }, 50);
}
async function loadInfo() {
  try { S.info = await (await fetch('/api/console-info', { credentials: 'same-origin' })).json(); } catch (e) { S.info = null; }
}
function showLogin(msg) {
  if (S.es) { S.es.close(); S.es = null; }
  closeDrawer();
  if (window.SheSellWorkspace) { SheSellWorkspace.hide(); SheSellWorkspace.reset(); }
  $('#shell').hidden = true;
  $('#login').hidden = false;
  document.title = 'SheSell Console';
  renderLogin(msg);
  if (!S.info) loadInfo().then(() => { const f = $('#loginForm'); if (f && !$('.demo-creds')) f.insertAdjacentHTML('afterend', demoBox()); });
}
function noServer() {
  $('#shell').hidden = true;
  $('#login').hidden = false;
  $('#login').innerHTML = `<div class="login-card"><div class="brand-row">${BRAND_SVG}<span><b>SheSell ${esc(t('consoleWord'))}</b></span></div>
    <h1 class="h1">${esc(t('noServerTitle'))}</h1><p class="muted">${esc(t('noServerBody'))}</p><pre class="code">npm start</pre><p class="muted small">${esc(t('noServerThen'))}</p></div>`;
}
async function start() {
  if (!/^https?:$/.test(location.protocol)) { noServer(); return; }
  try {
    const [me, st] = await Promise.all([
      fetch('/api/auth/me', { credentials: 'same-origin' }).then(r => r.json()),
      fetch('/api/settings', { credentials: 'same-origin' }).then(r => r.json()).catch(() => ({})),
      loadInfo()
    ]);
    S.me = me.user || null;
    S.settings = st.settings || null;
  } catch (e) { noServer(); return; }
  if (!S.me) { showLogin(); return; }
  $('#login').hidden = true;
  $('#shell').hidden = false;
  connectLive();
  const hash = location.hash.slice(1);
  go(allowed(hash) ? hash : 'dashboard', false);
  if (S.view !== 'dashboard') refreshBadges();
}
function setLang(lang) {
  if (lang === S.lang) return;
  S.lang = lang; store.set('lang', lang);
  if (window.SheSellWorkspace) SheSellWorkspace.update({ lang });
  if (!$('#login').hidden) { renderLogin(); return; }
  renderNav(); setLive(S.live); renderView();
  const id = $('#drawer').dataset.order;
  if (id && !$('#drawer').hidden) { const o = (S.data.orders || []).find(x => x.id === id); if (o) closeDrawer(); }
}
function bindShell() {
  document.addEventListener('click', (e) => {
    const lb = e.target.closest('.lang [data-lang]');
    if (lb) { setLang(lb.dataset.lang); return; }
    const nav = e.target.closest('#nav [data-view]');
    if (nav) { go(nav.dataset.view); return; }
    if (e.target.closest('#menuBtn')) { $('#side').classList.toggle('open'); return; }
    if (e.target.closest('#signOut')) { api('POST', '/auth/logout', {}).catch(() => {}).finally(() => { S.me = null; S.data = {}; showLogin(); }); return; }
    const mode = e.target.closest('#login [data-mode]');
    if (mode) { loginMode = mode.dataset.mode; renderLogin(); return; }
    const type = e.target.closest('#rType [data-type]');
    if (type) { $$('#rType button').forEach(b => b.setAttribute('aria-pressed', String(b === type))); $('#rMembersF').hidden = type.dataset.type !== 'shg'; return; }
    if (e.target.closest('[data-demo-fill]') && S.info && S.info.demo && S.info.demo.seller) { $('#lLogin').value = S.info.demo.seller.login; $('#lSecret').value = S.info.demo.seller.pin; $('#lBtn').focus(); return; }
    if (e.target.id === 'scrim') { if (!$('#dialog').hidden) return; closeDrawer(); $('#side').classList.remove('open'); }
  });
  document.addEventListener('submit', async (e) => {
    if (e.target.id !== 'loginForm' && e.target.id !== 'regForm') return;
    e.preventDefault();
    const err = $('#lErr'), btn = $('#lBtn');
    err.hidden = true; btn.disabled = true;
    try {
      const reg = e.target.id === 'regForm';
      const type = reg ? $('#rType [aria-pressed="true"]').dataset.type : null;
      const { user } = reg
        ? await api('POST', '/auth/register', { name: $('#rName').value.trim(), phone: $('#rPhone').value.trim(), pin: $('#rPin').value.trim(), type, place: $('#rPlace').value.trim(), members: Number($('#rMembers').value) || 10 })
        : await api('POST', '/auth/login', { login: $('#lLogin').value.trim(), password: $('#lSecret').value });
      S.me = user; S.data = {}; S.feed = []; loginMode = 'in';
      await start();
      if (reg) toast(t('regDone'), 'ok', 6000);
    } catch (ex) { err.textContent = ex.message; err.hidden = false; btn.disabled = false; }
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && $('#dialog').hidden && !$('#drawer').hidden) closeDrawer(); });
  window.addEventListener('hashchange', () => { if (S.me) go(location.hash.slice(1), false); });
  setInterval(() => { if (S.view === 'dashboard') VIEWS.renderFeed(); }, 30e3);
}

bindShell();
VIEWS.bind();
start();
