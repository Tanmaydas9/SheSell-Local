/* ------------------------------------------------------------------
   Server calls from the workspace. The console's sign-in cookie comes
   along, and the server checks the role on every route.
------------------------------------------------------------------- */
const API = (() => {
  const st = { queue: [], timer: null };
  async function call(method, path, body) {
    let res;
    try {
      res = await fetch('/api' + path, {
        method, credentials: 'same-origin',
        headers: body !== undefined ? { 'Content-Type': 'application/json' } : {},
        body: body !== undefined ? JSON.stringify(body) : undefined
      });
    } catch (e) { const err = new Error(t('netError')); err.code = 'network'; throw err; }
    let data = {};
    try { data = await res.json(); } catch (e) { /* empty body */ }
    if (!res.ok) {
      const err = new Error((data.error && data.error.message) || t('netError'));
      err.status = res.status; err.code = data.error && data.error.code; err.info = data.error || {};
      if (res.status === 401 && CTX.signedOut) CTX.signedOut();
      throw err;
    }
    return data;
  }
  /* engagement counters (model trained, photo scanned, lesson done) go up in small batches */
  function track(type, productId, meta) {
    st.queue.push({ type, productId, meta });
    clearTimeout(st.timer);
    st.timer = setTimeout(flush, 1500);
  }
  function flush() {
    if (!st.queue.length) return;
    const events = st.queue.splice(0, 50);
    call('POST', '/events', { events }).catch(() => { /* best effort */ });
  }
  window.addEventListener('pagehide', flush);
  return { call, track, flush, get online() { return true; }, get me() { return CTX.me; } };
})();
