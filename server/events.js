/* ------------------------------------------------------------------
   Live updates over Server-Sent Events (GET /api/stream).
   Each connection knows who it is (public visitor, a seller, the
   admin) and which orders it may follow, and only gets what it may see.
------------------------------------------------------------------- */
'use strict';
const clients = new Set();
const STREAMING = Symbol('streaming');   // returned by a route that wrote its own response

function attach(req, res, client) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-store',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
    'X-Content-Type-Options': 'nosniff'
  });
  res.write('retry: 4000\n\n');
  const c = Object.assign({ res, track: new Set() }, client);
  clients.add(c);
  const ping = setInterval(() => { try { res.write(': ping\n\n'); } catch (e) { /* closed */ } }, 25e3);
  const done = () => { clearInterval(ping); clients.delete(c); };
  req.on('close', done);
  res.on('error', done);
  send(c, 'hello', { at: Date.now(), role: c.role });
  return c;
}

function send(c, type, data) {
  try { c.res.write(`event: ${type}\ndata: ${JSON.stringify(data)}\n\n`); } catch (e) { clients.delete(c); }
}

// data may be a function (client) => payload | undefined, for per-viewer payloads
function publish(type, data, filter) {
  for (const c of clients) {
    if (filter && !filter(c)) continue;
    const payload = typeof data === 'function' ? data(c) : data;
    if (payload !== undefined) send(c, type, payload);
  }
}

const isStaff = (c) => c.role === 'admin' || c.role === 'seller';
function closeAll() { for (const c of clients) { try { c.res.end(); } catch (e) { /* ignore */ } } clients.clear(); }

module.exports = { attach, publish, isStaff, closeAll, count: () => clients.size, STREAMING };
