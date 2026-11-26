/* ------------------------------------------------------------------
   Voice lessons: Marathi/English lessons read aloud (Web Speech API),
   the seller's local Saheli on WhatsApp (official SheSell number), and
   a nudge to share her own shop link once lesson 1 is done.
------------------------------------------------------------------- */
const SAHELI = (() => {
  const MODS = [
    { id: 'catalogue', icon: 'camera', title: 'modCat', steps: ['c1', 'c2', 'c3', 'c4', 'c5'] },
    { id: 'price', icon: 'rupee', title: 'modPrice', steps: ['p1', 'p2', 'p3', 'p4', 'p5'] },
    { id: 'upi', icon: 'qr', title: 'modUpi', steps: ['u1', 'u2', 'u3', 'u4', 'u5'] }
  ];
  const st = { mod: 0, step: 0, seen: {}, done: new Set(), token: 0, playing: false, posted: new Set() };
  MODS.forEach(m => { st.seen[m.id] = new Set([0]); });
  const hasTTS = () => 'speechSynthesis' in window && typeof window.SpeechSynthesisUtterance === 'function';
  const voices = () => { try { return window.speechSynthesis.getVoices() || []; } catch (e) { return []; } };
  function pickVoice(lang) {
    const vs = voices();
    if (lang === 'mr') return { v: vs.find(v => /^mr/i.test(v.lang)) || vs.find(v => /^hi/i.test(v.lang)) || null, native: !!vs.find(v => /^mr/i.test(v.lang)) };
    return { v: vs.find(v => /^en[-_]IN/i.test(v.lang)) || vs.find(v => /^en/i.test(v.lang)) || null, native: true };
  }
  const sentences = (text) => (text.match(/[^.!?।]+[.!?।]*/g) || [text]).map(s => s.trim()).filter(Boolean);

  function speak(text, lang, hooks = {}) {
    if (!hasTTS()) { toast(t('ttsNone'), 'alert'); if (hooks.onEnd) hooks.onEnd(false); return; }
    const synth = window.speechSynthesis;
    synth.cancel();
    const token = ++st.token, parts = sentences(text), { v } = pickVoice(lang);
    let i = 0;
    const next = () => {
      if (token !== st.token) return;
      if (i >= parts.length) { if (hooks.onEnd) hooks.onEnd(true); return; }
      const u = new SpeechSynthesisUtterance(parts[i]);
      if (v) u.voice = v;
      u.lang = v ? v.lang : (lang === 'mr' ? 'mr-IN' : 'en-IN');
      u.rate = Number($('#ttsRate').value) || 0.95;
      const idx = i;
      u.onstart = () => { if (token === st.token && hooks.onSentence) hooks.onSentence(idx); };
      u.onend = () => { i++; next(); };
      u.onerror = (e) => { if (e.error === 'interrupted' || e.error === 'canceled') return; i++; next(); };
      synth.speak(u);
    };
    setTimeout(next, 80);
  }
  function stop() {
    st.token++; st.playing = false;
    try { window.speechSynthesis.cancel(); } catch (e) { /* no tts */ }
    $$('.voice.playing').forEach(v => v.classList.remove('playing'));
    $$('#stepText .spoken').forEach(s => s.classList.remove('spoken'));
    setPlayBtn(false);
  }
  function speakText(text, lang, el) {
    const was = el && el.classList.contains('playing');
    stop();
    if (was) return;
    if (el) el.classList.add('playing');
    speak(text, lang, { onEnd: () => { if (el) el.classList.remove('playing'); } });
  }

  const mod = () => MODS[st.mod];
  // {w}: the collective's fair-wage target from the console settings
  const stepText = (m, i, lang = state.lang) => ((I18N[lang] && I18N[lang]['ls_' + m.id + '_' + m.steps[i]]) || I18N.en['ls_' + m.id + '_' + m.steps[i]])
    .replace(/\{w\}/g, () => new Intl.NumberFormat(lang === 'mr' ? 'mr-IN' : 'en-IN').format(CONFIG.fairWage));
  function renderModules() {
    $('#modules').innerHTML = MODS.map((m, i) => {
      const seen = st.seen[m.id].size, done = st.done.has(m.id);
      return `<button type="button" class="module" data-mod="${i}" aria-pressed="${i === st.mod}"><span class="ic">${icon(done ? 'check' : m.icon)}</span>
        <span><b class="h3">${esc(t(m.title))}</b><br><span class="tiny muted">${esc(done ? t('lessonDone') : t('stepsSeen', { a: fmtNum(seen), b: fmtNum(m.steps.length) }))}</span>
        <span class="meter"><i style="width:${(done ? 1 : seen / m.steps.length) * 100}%"></i></span></span></button>`;
    }).join('');
  }
  function renderLesson() {
    const m = mod();
    $('#lessonTitle').textContent = t(m.title);
    $('#lessonImg').src = [AVATARS.saheli, AVATARS.guide, AVATARS.mom][st.mod] || AVATARS.saheli;
    $('#dots').innerHTML = m.steps.map((_, i) => `<button type="button" data-step="${i}" ${i === st.step ? 'aria-current="step"' : ''} class="${st.seen[m.id].has(i) ? 'seen' : ''}" aria-label="${esc(t('stepN', { n: fmtNum(i + 1) }))}">${esc(fmtNum(i + 1))}</button>`).join('');
    $('#stepText').innerHTML = sentences(stepText(m, st.step)).map((s, i) => `<span data-s="${i}">${esc(s)}</span>`).join(' ');
    $('#prevStep').disabled = st.step === 0;
    $('#nextStep').disabled = st.step === m.steps.length - 1;
    $('#markDone').disabled = st.done.has(m.id);
  }
  function renderVoiceInfo() {
    const info = $('#voiceInfo'), note = $('#voiceNote');
    if (!hasTTS()) { info.textContent = t('ttsNone'); note.textContent = ''; return; }
    const { v, native } = pickVoice(state.lang);
    if (!voices().length) { info.textContent = t('ttsLoading'); note.textContent = ''; return; }
    info.textContent = v ? t('ttsVoice', { v: v.name, l: v.lang }) : t('ttsDefault');
    note.textContent = state.lang === 'mr' && !native ? t('ttsHindiNote') : '';
  }
  function setPlayBtn(on) {
    st.playing = on;
    $('#playAll').innerHTML = icon(on ? 'pause' : 'play') + `<span>${esc(on ? t('stop') : t('playAll'))}</span>`;
  }
  function highlight(i) {
    $$('#stepText [data-s]').forEach(s => s.classList.toggle('spoken', Number(s.dataset.s) === i));
  }
  function go(step) {
    const m = mod();
    st.step = clamp(step, 0, m.steps.length - 1);
    st.seen[m.id].add(st.step);
    renderLesson(); renderModules();
  }
  function listen(chain) {
    const m = mod();
    speak(stepText(m, st.step), state.lang, {
      onSentence: highlight,
      onEnd: (ok) => {
        highlight(-1);
        if (chain && ok && st.playing && st.step < m.steps.length - 1) { go(st.step + 1); listen(true); }
        else if (chain) setPlayBtn(false);
      }
    });
  }

  // lessons already completed on this account (the server keeps them for sellers)
  function setDone(list) { (list || []).forEach(id => { if (MODS.some(m => m.id === id)) { st.done.add(id); MODS.find(m => m.id === id).steps.forEach((_, i) => st.seen[id].add(i)); } }); renderModules(); renderLesson(); }
  function renderPractice() { $('#practiceCard').hidden = isAdmin(); }
  const askLink = () => waLink(t('askSaheliMsg', { name: mySeller() ? mySeller().name : (CTX.me ? CTX.me.name : '') }));

  function bind() {
    $('#modules').addEventListener('click', e => { const b = e.target.closest('[data-mod]'); if (!b) return; stop(); st.mod = Number(b.dataset.mod); st.step = 0; go(0); });
    $('#dots').addEventListener('click', e => { const b = e.target.closest('[data-step]'); if (!b) return; stop(); go(Number(b.dataset.step)); });
    $('#prevStep').addEventListener('click', () => { stop(); go(st.step - 1); });
    $('#nextStep').addEventListener('click', () => { stop(); go(st.step + 1); });
    $('#speak').addEventListener('click', () => { stop(); listen(false); });
    $('#playAll').addEventListener('click', () => {
      if (st.playing) { stop(); return; }
      stop(); setPlayBtn(true); listen(true);
    });
    $('#markDone').addEventListener('click', () => {
      const m = mod();
      st.done.add(m.id); m.steps.forEach((_, i) => st.seen[m.id].add(i));
      if (!state.metrics.lessons.has(m.id)) {
        API.track('lesson', null, m.id);
        if (!isAdmin()) API.call('POST', '/my/lessons/' + m.id, {}).then(() => CTX.changed('lesson', m.id)).catch(() => { /* counted locally anyway */ });
      }
      state.metrics.lessons.add(m.id);
      renderModules(); renderLesson(); BUS.emit('metrics');
      toast(t('lessonToast', { title: t(m.title) }), 'check');
    });
    $('#shareShop').addEventListener('click', () => CTX.share());
    const ask = () => { $('#askSaheli').href = askLink(); };
    ask();
    if (hasTTS()) { try { window.speechSynthesis.onvoiceschanged = renderVoiceInfo; } catch (e) { /* ignore */ } }
    BUS.on('lang', () => { stop(); renderModules(); renderLesson(); renderVoiceInfo(); ask(); });
    BUS.on('settings', () => { ask(); renderLesson(); });
    BUS.on('me', () => { ask(); renderPractice(); });
    BUS.on('tab', (tab) => { if (tab !== 'lessons') stop(); else renderVoiceInfo(); });
  }
  function init() {
    $('#saheliImg').src = AVATARS.guide;
    renderModules(); renderLesson(); renderVoiceInfo(); renderPractice();
  }
  return { bind, init, speakText, stop, setDone };
})();
