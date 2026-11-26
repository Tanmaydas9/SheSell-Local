/* ------------------------------------------------------------------
   Server connection. When this page is served by the SheSell server,
   products, orders, listings, accounts and stats go through its REST
   API, with live updates over Server-Sent Events. Opened on its own
   (a file, the Claude preview, static hosting) it runs as a fully
   offline demo of the shop.
------------------------------------------------------------------- */
const API = (() => {
  const st = { online: false, me: null, es: null, queue: [], timer: null, tracked: [], handlers: {} };
  st.tracked = (store.get('tracked', []) || []).filter(o => o && typeof o.id === 'string' && typeof o.token === 'string').slice(0, 20);

  async function call(method, path, body, opts = {}) {
    let res;
    try {
      res = await fetch('/api' + path, {
        method, credentials: 'same-origin', keepalive: !!opts.keepalive, signal: opts.signal,
        headers: body !== undefined ? { 'Content-Type': 'application/json' } : {},
        body: body !== undefined ? JSON.stringify(body) : undefined
      });
    } catch (e) {
      const err = new Error(t('netError')); err.code = 'network'; throw err;
    }
    let data = {};
    try { data = await res.json(); } catch (e) { /* empty or non-JSON body */ }
    if (!res.ok) {
      const err = new Error((data.error && data.error.message) || t('netError'));
      err.status = res.status; err.code = data.error && data.error.code; err.info = data.error || {};
      throw err;
    }
    return data;
  }

  // Is a SheSell server behind this page? (any other host, a 404 or a timeout means offline demo)
  async function boot() {
    if (!/^https?:$/.test(location.protocol)) return null;
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 6000);
    try {
      const data = await call('GET', '/bootstrap', undefined, { signal: ctl.signal });
      if (!data || data.app !== 'shesell-local') return null;
      st.online = true; st.me = data.me || null;
      return data;
    } catch (e) { return null; }
    finally { clearTimeout(timer); }
  }

  /* engagement counters (views, shares, cart adds…) go up in small batches */
  function track(type, productId, meta) {
    if (!st.online) return;
    st.queue.push({ type, productId, meta });
    clearTimeout(st.timer);
    st.timer = setTimeout(flush, 1500);
  }
  function flush() {
    if (!st.queue.length) return;
    const events = st.queue.splice(0, 50);
    call('POST', '/events', { events }, { keepalive: true }).catch(() => { /* best effort */ });
  }
  window.addEventListener('pagehide', flush);

  /* orders placed from this browser: id + private tracking token */
  function remember(id, token) {
    st.tracked = [{ id, token }, ...st.tracked.filter(o => o.id !== id)].slice(0, 20);
    store.set('tracked', st.tracked);
    connect();
  }
  const tokenFor = (id) => (st.tracked.find(o => o.id === id) || {}).token;

  /* live updates */
  function on(type, fn) { (st.handlers[type] = st.handlers[type] || []).push(fn); }
  function connect() {
    if (!st.online || typeof EventSource === 'undefined') return;
    if (st.es) st.es.close();
    const track = st.tracked.map(o => o.id + '.' + o.token).join(',');
    st.es = new EventSource('/api/stream' + (track ? '?track=' + encodeURIComponent(track) : ''));
    ['product', 'order', 'settings', 'reload'].forEach(type => st.es.addEventListener(type, ev => {
      let d; try { d = JSON.parse(ev.data); } catch (e) { return; }
      (st.handlers[type] || []).forEach(fn => { try { fn(d); } catch (err) { console.error(type, err); } });
    }));
  }

  return {
    call, boot, track, flush, remember, tokenFor, on, connect,
    get online() { return st.online; },
    get me() { return st.me; }, set me(v) { st.me = v; },
    get tracked() { return st.tracked; }
  };
})();
