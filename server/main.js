import http from 'http';
import { Worker } from 'worker_threads';
import { WebSocketServer } from 'ws';
import path from 'path';
import { fileURLToPath } from 'url';
import { config, siteUrl } from './config.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PORT = +config.port || 47240;
const HOST = config.host || '127.0.0.1';
const IDLE_MS = 90 * 1000;
const MAX_MSG = 64 * 1024;
const MAX_RATE = 120;
const KEY = String(config.key || '');
const REDEEM = siteUrl('redeem');

if (!KEY || !REDEEM) {
  process.stderr.write('Set key and endpoints.redeem in config.local.php\n');
  process.exit(1);
}

const places = new Map();
const sockets = new Map();
let nextCid = 1;

function log(line) {
  process.stdout.write(`${new Date().toISOString()} ${line}\n`);
}

function placeFor(placeId) {
  let p = places.get(placeId);
  if (p && !p.dead) return p;
  const worker = new Worker(path.join(HERE, 'worker.js'), { workerData: { placeId }, resourceLimits: { maxOldGenerationSizeMb: 1024 } });
  p = { placeId, worker, members: new Set(), ready: false, dead: false, idleTimer: null, failed: null };
  places.set(placeId, p);
  worker.on('message', (m) => {
    if (m.t === 'send') {
      const s = sockets.get(m.cid);
      if (s && s.ws.readyState === 1) s.ws.send(m.data);
    } else if (m.t === 'kick') {
      const s = sockets.get(m.cid);
      if (s) {
        try {
          s.ws.send(JSON.stringify({ t: 'kick', m: m.reason }));
        } catch {}
        s.ws.close(4000, 'kicked');
      }
    } else if (m.t === 'log') log(m.line);
    else if (m.t === 'ready') {
      p.ready = true;
      log(`[place ${placeId}] ready`);
    } else if (m.t === 'failed') {
      p.failed = m.error;
      log(`[place ${placeId}] failed to start: ${m.error}`);
      for (const cid of p.members) {
        const s = sockets.get(cid);
        if (s) {
          try {
            s.ws.send(JSON.stringify({ t: 'kick', m: 'This game could not be started' }));
          } catch {}
          s.ws.close(4001, 'failed');
        }
      }
      shutdown(p);
    }
  });
  worker.on('error', (e) => {
    log(`[place ${placeId}] worker error: ${e.stack || e.message}`);
  });
  worker.on('exit', (code) => {
    p.dead = true;
    if (places.get(placeId) === p) places.delete(placeId);
    log(`[place ${placeId}] worker exited (${code})`);
    for (const cid of p.members) {
      const s = sockets.get(cid);
      if (s) s.ws.close(4002, 'server stopped');
    }
  });
  return p;
}

function shutdown(p) {
  if (p.dead) return;
  p.dead = true;
  if (places.get(p.placeId) === p) places.delete(p.placeId);
  p.worker.postMessage({ t: 'stop' });
  setTimeout(() => p.worker.terminate(), 3000);
}

function scheduleIdle(p) {
  clearTimeout(p.idleTimer);
  if (p.members.size) return;
  p.idleTimer = setTimeout(() => {
    if (!p.members.size) {
      log(`[place ${p.placeId}] idle, stopping`);
      shutdown(p);
    }
  }, IDLE_MS);
}

async function redeem(ticket) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 8000);
  try {
    const r = await fetch(REDEEM, {
      method: 'POST',
      signal: ctl.signal,
      headers: { 'User-Agent': config.userAgent || 'Chocolate/0.1', 'Content-Type': 'application/x-www-form-urlencoded', 'X-Chocolate-Key': KEY },
      body: new URLSearchParams({ ticket }).toString(),
    });
    if (!r.ok) return null;
    const j = await r.json();
    return j && j.ok ? j : null;
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

const server = http.createServer((req, res) => {
  if (req.url === '/status') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, places: [...places.values()].map((p) => ({ id: p.placeId, players: p.members.size, ready: p.ready })) }));
    return;
  }
  res.writeHead(404);
  res.end();
});

const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_MSG, perMessageDeflate: { threshold: 1024, zlibDeflateOptions: { level: 3 } } });

server.on('upgrade', (req, socket, head) => {
  const url = new URL(req.url, 'http://x');
  if (!/\/ws\/?$/.test(url.pathname)) {
    socket.destroy();
    return;
  }
  wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req, url));
});

wss.on('connection', async (ws, req, url) => {
  const cid = nextCid++;
  const ticket = url.searchParams.get('ticket') || '';
  const s = { ws, cid, place: null, joined: false, count: 0, window: Date.now() };
  sockets.set(cid, s);
  const early = [];
  ws.on('message', (data, isBinary) => {
    if (isBinary) return;
    const now = Date.now();
    if (now - s.window > 1000) {
      s.window = now;
      s.count = 0;
    }
    if (++s.count > MAX_RATE) return;
    const str = data.toString();
    if (!s.joined) {
      if (early.length < 50) early.push(str);
      return;
    }
    s.place.worker.postMessage({ t: 'msg', cid, data: str });
  });
  ws.on('close', () => {
    sockets.delete(cid);
    if (s.place) {
      s.place.members.delete(cid);
      if (!s.place.dead) s.place.worker.postMessage({ t: 'leave', cid });
      scheduleIdle(s.place);
    }
  });
  if (!/^[a-f0-9]{64}$/.test(ticket)) {
    ws.close(4003, 'bad ticket');
    return;
  }
  const info = await redeem(ticket);
  if (ws.readyState !== 1) return;
  if (!info) {
    ws.send(JSON.stringify({ t: 'kick', m: 'Your join ticket is invalid or has expired. Reload the page to try again.' }));
    ws.close(4003, 'bad ticket');
    return;
  }
  const p = placeFor(info.placeId | 0);
  clearTimeout(p.idleTimer);
  s.place = p;
  p.members.add(cid);
  p.worker.postMessage({ t: 'join', cid, user: { id: info.userId | 0, name: String(info.username), membership: info.membership | 0, age: info.age | 0, dev: !!info.dev } });
  s.joined = true;
  for (const str of early.splice(0)) p.worker.postMessage({ t: 'msg', cid, data: str });
  log(`[place ${p.placeId}] ${info.username} (${info.userId}) connected`);
});

server.listen(PORT, HOST, () => log(`chocolate listening on ${HOST}:${PORT}`));

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    log('shutting down');
    for (const p of places.values()) shutdown(p);
    setTimeout(() => process.exit(0), 1500);
  });
}
