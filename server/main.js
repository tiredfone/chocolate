import http from 'http';
import crypto from 'crypto';
import { Worker } from 'worker_threads';
import { WebSocketServer } from 'ws';
import path from 'path';
import { fileURLToPath } from 'url';
import { config, siteUrl } from './config.js';
import { TeamSession } from './teamcreate.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PORT = +config.port || 47240;
const HOST = config.host || '127.0.0.1';
const IDLE_MS = 90 * 1000;
const MAX_MSG = 64 * 1024;
const MAX_RATE = 120;
const MAX_STUDIO_MSG = 8 * 1024 * 1024;
const MAX_STUDIO_RATE = 400;
const studios = new Map();
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

const PRESENCE = siteUrl('presence');
const DEFAULT_MAX = 20;
let nextJob = 1;

function jobId() {
  return `${Date.now().toString(36)}${(nextJob++).toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

function startInstance(placeId, kind, privateId, max, allowGear, era = 2012, extra = {}) {
  const id = jobId();
  const worker = new Worker(path.join(HERE, 'worker.js'), { workerData: { placeId, jobId: id, kind, privateId, allowGear, era, placeData: extra.placeData || null, debug: extra.debug || null }, resourceLimits: { maxOldGenerationSizeMb: 1024 } });
  const p = { id, placeId, kind, privateId, max, era, worker, members: new Map(), ready: false, dead: false, idleTimer: null, failed: null, started: Date.now(), allowed: extra.allowed || null };
  places.set(id, p);
  const tag = `[place ${placeId} ${kind === 'public' ? id : kind + ' ' + privateId}]`;
  p.tag = tag;
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
    } else if (m.t === 'log') {
      log(m.line);
      if (p.debugSend && /\[(error|warn|print)\]/.test(m.line)) p.debugSend({ t: 'dbg', out: String(m.line).replace(/^\[place [^\]]+\] /, '').slice(0, 2000) });
    } else if (m.t === 'dbg') {
      if (p.debugSend) p.debugSend({ t: 'dbg', side: 'server', pause: m.data });
    } else if (m.t === 'ready') {
      p.ready = true;
      log(`${tag} ready`);
    } else if (m.t === 'failed') {
      p.failed = m.error;
      log(`${tag} failed to start: ${m.error}`);
      for (const cid of p.members.keys()) {
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
    log(`${tag} worker error: ${e.stack || e.message}`);
  });
  worker.on('exit', (code) => {
    p.dead = true;
    if (places.get(id) === p) places.delete(id);
    log(`${tag} worker exited (${code})`);
    for (const cid of p.members.keys()) {
      const s = sockets.get(cid);
      if (s) s.ws.close(4002, 'server stopped');
    }
    pushPresence();
  });
  log(`${tag} starting (max ${max}, ${era} client)`);
  return p;
}

function cleanPerks(p) {
  if (!p || typeof p !== 'object') return null;
  const hex = (c) => (typeof c === 'string' && /^#[0-9a-f]{6}$/i.test(c) ? c.toLowerCase() : null);
  const badge = typeof p.badge === 'string' && /^\/asset\/\?id=\d{1,12}$/.test(p.badge) ? p.badge : '';
  return { badge, chatColor: hex(p.chatColor), nameColor: hex(p.nameColor) };
}

function cleanScale(sc) {
  const out = { height: 1, width: 1, depth: 1, head: 1 };
  if (!sc || typeof sc !== 'object') return out;
  const lim = { height: [0.5, 1.5], width: [0.5, 1.5], depth: [0.5, 1.5], head: [0.5, 1.5] };
  for (const k of Object.keys(lim)) {
    const v = Number(sc[k]);
    if (Number.isFinite(v)) out[k] = Math.max(lim[k][0], Math.min(lim[k][1], v));
  }
  if (sc.depth === undefined) out.depth = out.width;
  return out;
}

function chooseInstance(info) {
  const placeId = info.placeId | 0;
  const max = Math.max(1, Math.min(100, (info.maxPlayers | 0) || DEFAULT_MAX));
  const allowGear = info.allowGear !== false;
  const era = (info.clientVersion | 0) === 2018 ? 2018 : 2012;
  const key = String(info.serverKey || '');
  const m = /^(priv|res):(\d+)$/.exec(key);
  if (m) {
    const kind = m[1] === 'priv' ? 'private' : 'reserved';
    const privateId = +m[2];
    let p = [...places.values()].find((x) => !x.dead && x.placeId === placeId && x.kind === kind && x.privateId === privateId && x.era === era);
    if (!p) p = startInstance(placeId, kind, privateId, max, allowGear, era);
    p.max = max;
    return p.members.size >= p.max ? { full: true } : { p };
  }
  const live = [...places.values()].filter((x) => !x.dead && !x.failed && x.placeId === placeId && x.kind === 'public' && x.era === era);
  const job = /^job:([a-z0-9]+)$/.exec(key);
  if (job) {
    const test = places.get(job[1]);
    if (test && test.kind === 'test' && !test.dead && !test.failed && test.placeId === placeId) {
      if (!test.allowed || !test.allowed.has(info.userId | 0)) return { denied: true };
      return test.members.size >= test.max ? { full: true } : { p: test };
    }
    const want = live.find((x) => x.id === job[1]);
    if (want && want.members.size < want.max) return { p: want };
  }
  const open = live.filter((x) => x.members.size < x.max).sort((a, b) => b.members.size - a.members.size || a.started - b.started);
  if (open.length) return { p: open[0] };
  return { p: startInstance(placeId, 'public', 0, max, allowGear, era) };
}

function debugInit(msg) {
  if (!msg || typeof msg !== 'object') return null;
  const bps = msg.bps && typeof msg.bps === 'object' ? msg.bps : null;
  const watches = Array.isArray(msg.watches) ? msg.watches.slice(0, 50).map((w) => String(w).slice(0, 200)) : [];
  return bps || watches.length ? { bps: bps || {}, watches } : null;
}

function soloMessage(s, str) {
  let msg;
  try {
    msg = JSON.parse(str);
  } catch {
    return;
  }
  if (!msg) return;
  if (msg.t === 'dbg') {
    if (s.solo.test && !s.solo.test.dead) s.solo.test.worker.postMessage({ t: 'dbg', data: msg });
    return;
  }
  if (msg.t !== 'playsolo') return;
  const send = (o) => {
    if (s.ws.readyState === 1) s.ws.send(JSON.stringify(o));
  };
  if (s.solo.test) {
    shutdown(s.solo.test);
    s.solo.test = null;
  }
  if (!msg.on) return send({ t: 'playsolo', on: false });
  const xml = typeof msg.xml === 'string' ? msg.xml : '';
  if (!/^\s*<roblox[\s>]/.test(xml) || xml.length > MAX_STUDIO_MSG) return send({ t: 'playsolo', on: false, error: 'The place could not be sent to the game server' });
  const p = startInstance(s.solo.placeId, 'test', 0, 1, true, s.solo.era, { placeData: xml, allowed: new Set([s.solo.userId]), debug: debugInit(msg) });
  scheduleIdle(p);
  s.solo.test = p;
  p.debugSend = send;
  send({ t: 'playsolo', on: true, job: p.id });
}

function shutdown(p, reason) {
  if (p.dead) return;
  p.dead = true;
  if (places.get(p.id) === p) places.delete(p.id);
  if (reason) {
    for (const cid of p.members.keys()) {
      const s = sockets.get(cid);
      if (s) {
        try {
          s.ws.send(JSON.stringify({ t: 'kick', m: reason }));
        } catch {}
      }
    }
  }
  p.worker.postMessage({ t: 'stop' });
  setTimeout(() => p.worker.terminate(), 3000);
  pushPresence();
}

function scheduleIdle(p) {
  clearTimeout(p.idleTimer);
  if (p.members.size) return;
  p.idleTimer = setTimeout(() => {
    if (!p.members.size) {
      log(`${p.tag} idle, stopping`);
      shutdown(p);
    }
  }, IDLE_MS);
}

function statusJson() {
  return {
    ok: true,
    places: [...places.values()].filter((p) => !p.dead && p.kind !== 'test').map((p) => ({
      id: p.placeId,
      job: p.id,
      kind: p.kind,
      privateId: p.privateId || null,
      max: p.max,
      ready: p.ready,
      started: p.started,
      players: p.members.size,
      users: [...p.members.values()].map((u) => ({ id: u.id, name: u.name })),
    })),
    studio: [...studios.values()].filter((st) => !st.empty()).map((st) => ({ id: st.placeId, users: st.users().map((u) => ({ id: u.id, name: u.name })) })),
  };
}

let presenceTimer = null;
function pushPresence() {
  if (!PRESENCE || presenceTimer) return;
  presenceTimer = setTimeout(sendPresence, 1000);
}

async function sendPresence() {
  presenceTimer = null;
  const users = [];
  const seen = new Set();
  for (const p of places.values()) {
    if (p.dead) continue;
    for (const u of p.members.values()) if (!seen.has(u.id)) {
      seen.add(u.id);
      users.push({ id: u.id, kind: 'play', place: p.placeId });
    }
  }
  for (const st of studios.values()) for (const u of st.users()) if (!seen.has(u.id)) {
    seen.add(u.id);
    users.push({ id: u.id, kind: 'studio', place: st.placeId });
  }
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 8000);
  try {
    await fetch(PRESENCE, {
      method: 'POST',
      signal: ctl.signal,
      headers: { 'User-Agent': config.userAgent || 'Chocolate/26.12-preview', 'Content-Type': 'application/json', 'X-Chocolate-Key': KEY },
      body: JSON.stringify({ users }),
    });
  } catch {
  } finally {
    clearTimeout(t);
  }
}

async function redeem(ticket) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 8000);
  try {
    const r = await fetch(REDEEM, {
      method: 'POST',
      signal: ctl.signal,
      headers: { 'User-Agent': config.userAgent || 'Chocolate/26.12-preview', 'Content-Type': 'application/x-www-form-urlencoded', 'X-Chocolate-Key': KEY },
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
  if (req.url === '/status' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify(statusJson()));
    return;
  }
  if (req.url === '/kick' && req.method === 'POST') {
    const given = String(req.headers['x-chocolate-key'] || '');
    const ok = given.length === KEY.length && crypto.timingSafeEqual(Buffer.from(given), Buffer.from(KEY));
    let body = '';
    req.on('data', (c) => {
      body += c;
      if (body.length > 4096) req.destroy();
    });
    req.on('end', () => {
      if (!ok) {
        res.writeHead(403);
        res.end();
        return;
      }
      let q = {};
      try {
        q = JSON.parse(body || '{}');
      } catch {}
      const uid = q.userId | 0;
      const reason = String(q.reason || 'You have been removed from the game').slice(0, 300);
      let n = 0;
      if (uid > 0) {
        for (const s of [...sockets.values()]) {
          if (s.userId !== uid) continue;
          try {
            s.ws.send(JSON.stringify({ t: 'kick', m: reason }));
          } catch {}
          try {
            s.ws.close(4000, 'kicked');
          } catch {}
          n++;
        }
      }
      if (n) log(`kicked user ${uid} from ${n} session(s)`);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, kicked: n }));
    });
    return;
  }
  if (req.url === '/shutdown' && req.method === 'POST') {
    const given = String(req.headers['x-chocolate-key'] || '');
    const ok = given.length === KEY.length && crypto.timingSafeEqual(Buffer.from(given), Buffer.from(KEY));
    let body = '';
    req.on('data', (c) => {
      body += c;
      if (body.length > 4096) req.destroy();
    });
    req.on('end', () => {
      if (!ok) {
        res.writeHead(403);
        res.end();
        return;
      }
      let q = {};
      try {
        q = JSON.parse(body || '{}');
      } catch {}
      const reason = 'This server was shut down';
      let n = 0;
      for (const p of [...places.values()]) {
        if (p.dead) continue;
        if ((q.job && p.id === String(q.job)) || (!q.job && q.placeId && p.placeId === (q.placeId | 0))) {
          shutdown(p, reason);
          n++;
        }
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, stopped: n }));
    });
    return;
  }
  res.writeHead(404);
  res.end();
});

const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_STUDIO_MSG, perMessageDeflate: { threshold: 1024, zlibDeflateOptions: { level: 3 } } });

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
    if (!s.studio && !s.solo && data.length > MAX_MSG) return;
    const now = Date.now();
    if (now - s.window > 1000) {
      s.window = now;
      s.count = 0;
    }
    if (++s.count > (s.studio || s.solo ? MAX_STUDIO_RATE : MAX_RATE)) return;
    const str = data.toString();
    if (!s.joined) {
      if (early.length < 50 && str.length <= MAX_MSG) early.push(str);
      return;
    }
    if (s.studio) s.studio.message(cid, str);
    else if (s.solo) soloMessage(s, str);
    else s.place.worker.postMessage({ t: 'msg', cid, data: str });
  });
  ws.on('close', () => {
    sockets.delete(cid);
    if (s.solo) {
      if (s.solo.test) shutdown(s.solo.test);
      return;
    }
    if (s.studio) {
      const st = s.studio;
      st.leave(cid);
      pushPresence();
      if (st.empty()) st.scheduleIdle(() => {
        if (studios.get(st.placeId) === st && st.empty()) {
          studios.delete(st.placeId);
          log(`[studio ${st.placeId}] idle, closed`);
        }
      });
      return;
    }
    if (s.place) {
      s.place.members.delete(cid);
      if (!s.place.dead) s.place.worker.postMessage({ t: 'leave', cid });
      scheduleIdle(s.place);
      pushPresence();
    }
  });
  if (!/^[a-f0-9]{64}$/.test(ticket)) {
    ws.close(4003, 'bad ticket');
    return;
  }
  const info = await redeem(ticket);
  if (ws.readyState !== 1) return;
  if (info) s.userId = info.userId | 0;
  if (!info) {
    ws.send(JSON.stringify({ t: 'kick', m: 'Your join ticket is invalid or has expired. Reload the page to try again.' }));
    ws.close(4003, 'bad ticket');
    return;
  }
  if (info.mode === 'studio' && info.teamCreate === false) {
    s.solo = { placeId: info.placeId | 0, era: info.clientVersion === 2018 ? 2018 : 2012, userId: info.userId | 0, test: null };
    s.joined = true;
    ws.send(JSON.stringify({ t: 'solo' }));
    for (const str of early.splice(0)) soloMessage(s, str);
    return;
  }
  if (info.mode === 'studio') {
    const placeId = info.placeId | 0;
    let st = studios.get(placeId);
    if (!st) {
      st = new TeamSession(placeId, log, info.clientVersion === 2018 ? 2018 : 2012, {
        startTest: (session, xml) => {
          const p = startInstance(placeId, 'test', 0, 50, true, session.era, { placeData: xml, allowed: session.editors });
          scheduleIdle(p);
          return p;
        },
        startSolo: (session, xml, userId, send, msg) => {
          const p = startInstance(placeId, 'test', 0, 1, true, session.era, { placeData: xml, allowed: new Set([userId | 0]), debug: debugInit(msg) });
          scheduleIdle(p);
          p.debugSend = send;
          return p;
        },
        debug: (p, msg) => {
          if (p && !p.dead) p.worker.postMessage({ t: 'dbg', data: msg });
        },
        stopTest: (p, why) => shutdown(p, why),
        testAlive: (p) => !p.dead && !p.failed,
      });
      studios.set(placeId, st);
    }
    s.studio = st;
    s.joined = true;
    const send = (str) => {
      if (ws.readyState === 1) ws.send(str);
    };
    await st.join(cid, { id: info.userId | 0, name: String(info.username), role: info.role === 'owner' ? 'owner' : 'editor' }, send, (code, why) => ws.close(code, why));
    for (const str of early.splice(0)) st.message(cid, str);
    pushPresence();
    return;
  }
  if (info.mode && info.mode !== 'play') {
    ws.close(4003, 'bad ticket');
    return;
  }
  const pick = chooseInstance(info);
  if (pick.denied) {
    ws.send(JSON.stringify({ t: 'kick', m: 'This Team Test is only for the place\'s editors.' }));
    ws.close(4003, 'denied');
    return;
  }
  if (pick.full) {
    ws.send(JSON.stringify({ t: 'kick', m: 'This server is full. Try again in a moment.' }));
    ws.close(4004, 'full');
    return;
  }
  const p = pick.p;
  clearTimeout(p.idleTimer);
  s.place = p;
  p.members.set(cid, { id: info.userId | 0, name: String(info.username) });
  p.worker.postMessage({ t: 'join', cid, user: { id: info.userId | 0, name: String(info.username), membership: info.membership | 0, age: info.age | 0, dev: !!info.dev, perks: cleanPerks(info.perks), avatarType: info.avatarType === 'R15' ? 'R15' : 'R6', scale: cleanScale(info.scale) } });
  s.joined = true;
  for (const str of early.splice(0)) p.worker.postMessage({ t: 'msg', cid, data: str });
  log(`${p.tag} ${info.username} (${info.userId}) connected`);
  pushPresence();
});

server.listen(PORT, HOST, () => {
  log(`chocolate listening on ${HOST}:${PORT}`);
  sendPresence();
  setInterval(sendPresence, 60000);
});

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    log('shutting down');
    for (const p of places.values()) shutdown(p);
    setTimeout(() => process.exit(0), 1500);
  });
}
