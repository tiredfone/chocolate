import http from 'http';
import crypto from 'crypto';
import { Worker } from 'worker_threads';
import { spawn } from 'child_process';
import fs from 'fs';
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
const MAX_SOCKETS_PER_IP = 40;
const MAX_PENDING_PER_IP = 8;
const MAX_CONNECTS_PER_MIN = 90;
const MAX_SOCKETS_PER_USER = 4;
const MAX_REDEEMS_INFLIGHT = 24;
const MAX_BAD_TICKETS = 20;
const MAX_INSTANCES = 60;
const MAX_STARTS_PER_USER = 4;
const START_WINDOW_MS = 5 * 60 * 1000;
const JOIN_TIMEOUT_MS = 20 * 1000;
const MAX_BUFFERED = 48 * 1024 * 1024;
const RATE_STRIKES = 6;
const ipStats = new Map();
const userStarts = new Map();
let redeemsInflight = 0;
const studios = new Map();

function clientIp(req) {
  const raw = String(req.socket.remoteAddress || '').replace(/^::ffff:/, '');
  if (/^(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|::1$)/.test(raw)) {
    const hops = String(req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || '').split(',').map((s) => s.trim().replace(/^::ffff:/, '')).filter((s) => /^[0-9a-f:.]{3,45}$/i.test(s));
    for (let i = hops.length - 1; i >= 0; i--) {
      if (!/^(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|::1$|f[cd][0-9a-f]{2}:)/i.test(hops[i])) return hops[i];
    }
    if (hops.length) return hops[0];
  }
  return raw || 'unknown';
}

function ipEntry(ip) {
  let e = ipStats.get(ip);
  if (!e) {
    e = { open: 0, pending: 0, connects: [], bad: 0, badAt: 0 };
    ipStats.set(ip, e);
  }
  return e;
}

setInterval(() => {
  const now = Date.now();
  for (const [ip, e] of ipStats) {
    e.connects = e.connects.filter((t) => now - t < 60000);
    if (now - e.badAt > 60000) e.bad = 0;
    if (!e.open && !e.pending && !e.connects.length && !e.bad) ipStats.delete(ip);
  }
  for (const [uid, list] of userStarts) {
    const keep = list.filter((t) => now - t < START_WINDOW_MS);
    if (keep.length) userStarts.set(uid, keep);
    else userStarts.delete(uid);
  }
}, 30000).unref();

function drop(ws, code, why, text) {
  try {
    if (ws.readyState === 1) ws.send(JSON.stringify({ t: 'kick', m: text || why }));
  } catch {}
  try {
    ws.close(code, why);
  } catch {}
}
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

const TRANSIENT_START = /out of bounds|unreachable|RuntimeError|WebAssembly|Aborted\(|memory/i;

function startInstance(placeId, kind, privateId, max, allowGear, era = 2012, extra = {}) {
  const id = jobId();
  const p = { id, placeId, kind, privateId, max, era, worker: null, members: new Map(), joins: new Map(), ready: false, dead: false, idleTimer: null, failed: null, started: Date.now(), allowed: extra.allowed || null, attempt: 0, spec: { placeId, jobId: id, kind, privateId, allowGear, era, placeData: extra.placeData || null, debug: extra.debug || null } };
  places.set(id, p);
  const tag = `[place ${placeId} ${kind === 'public' ? id : kind + ' ' + privateId}]`;
  p.tag = tag;
  spawnWorker(p);
  log(`${tag} starting (max ${max}, ${era} client)`);
  return p;
}

function spawnWorker(p) {
  const { id, tag } = p;
  const worker = new Worker(path.join(HERE, 'worker.js'), { workerData: p.spec, resourceLimits: { maxOldGenerationSizeMb: 1024 } });
  p.worker = worker;
  p.ready = false;
  worker.on('message', (m) => {
    if (p.worker !== worker) return;
    if (m.t === 'send') {
      const s = sockets.get(m.cid);
      if (s && s.ws.readyState === 1) {
        if (s.ws.bufferedAmount > MAX_BUFFERED) {
          log(`${tag} socket ${m.cid} (${s.userId || '?'}) too slow, buffered ${s.ws.bufferedAmount} bytes, dropping`);
          drop(s.ws, 4006, 'too slow', 'You were disconnected because your connection could not keep up with the game.');
          return;
        }
        try {
          s.ws.send(m.data);
        } catch (e) {
          log(`${tag} send to socket ${m.cid} failed: ${e && e.message}`);
        }
      }
    } else if (m.t === 'kick') {
      const s = sockets.get(m.cid);
      if (s) {
        log(`${tag} kicking socket ${m.cid} (${s.userId || '?'}): ${m.reason}`);
        try {
          s.ws.send(JSON.stringify({ t: 'kick', m: m.reason }));
        } catch {}
        s.ws.close(4000, 'kicked');
      }
    } else if (m.t === 'log') {
      log(m.line);
      if (p.captures && p.captures.size && /\[(error|warn|print)\]/.test(m.line)) {
        const line = String(m.line).replace(/^\[place [^\]]+\] /, '').slice(0, 2000);
        for (const c of p.captures) if (c.length < 200) c.push(line);
      }
      if (p.debugSend && /\[(error|warn|print)\]/.test(m.line)) p.debugSend({ t: 'dbg', out: String(m.line).replace(/^\[place [^\]]+\] /, '').slice(0, 2000) });
    } else if (m.t === 'dbg') {
      if (p.debugSend) p.debugSend({ t: 'dbg', side: 'server', pause: m.data });
    } else if (m.t === 'ready') {
      p.ready = true;
      log(`${tag} ready${p.attempt ? ` (attempt ${p.attempt + 1})` : ''}`);
    } else if (m.t === 'failed') {
      log(`${tag} failed to start (attempt ${p.attempt + 1}): ${m.error}`);
      if (p.kind !== 'test' && p.attempt < 2 && TRANSIENT_START.test(String(m.error)) && !p.dead) {
        p.attempt++;
        p.worker = null;
        worker.terminate().catch(() => {});
        log(`${tag} retrying with a fresh worker (attempt ${p.attempt + 1})`);
        spawnWorker(p);
        for (const [cid, user] of p.joins) if (p.members.has(cid)) p.worker.postMessage({ t: 'join', cid, user });
        return;
      }
      p.failed = m.error;
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
    if (p.worker !== worker) return;
    log(`${tag} worker error: ${e.stack || e.message}`);
  });
  worker.on('exit', (code) => {
    if (p.worker !== worker) return;
    p.dead = true;
    if (places.get(id) === p) places.delete(id);
    log(`${tag} worker exited (${code})`);
    for (const cid of p.members.keys()) {
      const s = sockets.get(cid);
      if (s) drop(s.ws, 4002, 'server stopped', code ? 'The game server crashed and was stopped. Rejoin to start a new one.' : 'The game server stopped.');
    }
    pushPresence();
  });
}

function postJoin(p, cid, user) {
  p.joins.set(cid, user);
  p.worker.postMessage({ t: 'join', cid, user });
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

function cleanGenres(v) {
  return Array.isArray(v) ? v.map((g) => String(g).slice(0, 24)).slice(0, 16) : [];
}

function cleanGearMap(v) {
  const out = {};
  if (!v || typeof v !== 'object') return out;
  for (const k of Object.keys(v).slice(0, 64)) if (/^\d{1,12}$/.test(k)) out[k] = cleanGenres(v[k]);
  return out;
}

function startAllowed(info) {
  let live = 0;
  for (const x of places.values()) if (!x.dead) live++;
  if (live >= MAX_INSTANCES) return 'The server is busy right now. Try again in a moment.';
  const uid = info.userId | 0;
  const now = Date.now();
  const list = (userStarts.get(uid) || []).filter((t) => now - t < START_WINDOW_MS);
  if (list.length >= MAX_STARTS_PER_USER) return 'You have started too many servers recently. Wait a few minutes and try again.';
  list.push(now);
  userStarts.set(uid, list);
  return null;
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
    if (!p) {
      const why = startAllowed(info);
      if (why) return { busy: why };
      p = startInstance(placeId, kind, privateId, max, allowGear, era);
    }
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
  const why = startAllowed(info);
  if (why) return { busy: why };
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

const ACTIVE_TYPES = new Set(['jump', 'key', 'click', 'chat', 'act', 'drive', 'equip', 'unequip', 'drop', 'hop']);
function noteActivity(p, cid, str) {
  const m = p && p.members.get(cid);
  if (!m) return;
  let msg;
  try {
    msg = JSON.parse(str);
  } catch {
    return;
  }
  const t = msg && msg.t;
  let active = false;
  if (t === 'char') {
    const c = msg.c;
    if (Array.isArray(c) && c.length >= 3) {
      const x = +c[0], z = +c[2];
      if (Number.isFinite(x) && Number.isFinite(z)) {
        if (m.px === undefined) {
          m.px = x;
          m.pz = z;
        } else if (Math.hypot(x - m.px, z - m.pz) > 1.5) {
          m.px = x;
          m.pz = z;
          active = true;
          if (m.cells.size < 64) m.cells.add(Math.round(x / 8) + ',' + Math.round(z / 8));
        }
      }
    }
  } else if (t === 'mouse') active = msg.b === 'down';
  else if (ACTIVE_TYPES.has(t)) active = true;
  if (!active) return;
  m.lastActive = Date.now();
  m.acts++;
  if (m.kinds.size < 16) m.kinds.add(t);
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
    const nowMs = Date.now();
    for (const u of p.members.values()) if (!seen.has(u.id)) {
      seen.add(u.id);
      users.push({ id: u.id, kind: 'play', place: p.placeId, job: p.id, srv: p.kind, players: p.members.size, idle: Math.floor((nowMs - u.lastActive) / 1000), session: Math.floor((nowMs - u.joinedAt) / 1000), acts: u.acts, kinds: u.kinds.size, cells: u.cells.size });
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
  if (req.url === '/run' && req.method === 'POST') {
    keyedJson(req, res, 262144, (q) => {
      const source = typeof q.source === 'string' ? q.source : '';
      const p = places.get(String(q.job || ''));
      if (!source.trim() || source.length > 200000) return { ok: false, error: 'No code given' };
      if (!p || p.dead || p.kind === 'test') return { ok: false, error: 'That server is not running' };
      if (!p.ready) return { ok: false, error: 'That server is still starting' };
      const by = String(q.by || 'a developer').replace(/[^\w .-]/g, '').slice(0, 40);
      const cap = [];
      if (!p.captures) p.captures = new Set();
      p.captures.add(cap);
      p.worker.postMessage({ t: 'run', source, by });
      log(`${p.tag} server code run by ${by} (${source.length} bytes)`);
      return new Promise((resolve) => setTimeout(() => {
        p.captures.delete(cap);
        resolve({ ok: true, output: cap.slice(0, 200) });
      }, Math.max(200, Math.min(5000, q.wait | 0 || 1500))));
    });
    return;
  }
  if (req.url === '/restart' && req.method === 'POST') {
    keyedJson(req, res, 4096, () => {
      setTimeout(restartSelf, 200);
      return { ok: true, places: [...places.values()].filter((p) => !p.dead).length };
    });
    return;
  }
  res.writeHead(404);
  res.end();
});

function keyedJson(req, res, max, fn) {
  const given = String(req.headers['x-chocolate-key'] || '');
  const ok = KEY.length > 0 && given.length === KEY.length && crypto.timingSafeEqual(Buffer.from(given), Buffer.from(KEY));
  let body = '';
  req.on('data', (c) => {
    body += c;
    if (body.length > max) req.destroy();
  });
  req.on('end', () => {
    if (!ok) {
      res.writeHead(403);
      res.end();
      return;
    }
    let q = {};
    try {
      q = JSON.parse(body || '{}') || {};
    } catch {}
    Promise.resolve()
      .then(() => fn(q))
      .catch((e) => ({ ok: false, error: e.message }))
      .then((out) => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(out));
      });
  });
}

let restarting = false;
function restartSelf() {
  if (restarting) return;
  restarting = true;
  log('restarting');
  for (const p of [...places.values()]) shutdown(p, 'The game server is restarting');
  for (const s of sockets.values()) {
    try {
      s.ws.close(1012, 'restart');
    } catch {}
  }
  setTimeout(() => {
    let out = 'ignore';
    try {
      out = fs.openSync(config.logFile || '/tmp/chocolate-server.log', 'a');
    } catch {}
    const child = spawn('sh', ['-c', 'sleep 2; exec sh "$0"', path.join(HERE, 'start.sh')], { cwd: path.dirname(HERE), detached: true, stdio: ['ignore', out, out] });
    child.unref();
    try {
      server.closeAllConnections();
    } catch {}
    server.close();
    setTimeout(() => process.exit(0), 300);
  }, 1500);
}

const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_STUDIO_MSG, perMessageDeflate: { threshold: 1024, zlibDeflateOptions: { level: 3 } } });

server.on('upgrade', (req, socket, head) => {
  socket.on('error', () => {});
  let url;
  try {
    url = new URL(req.url, 'http://x');
  } catch {
    socket.destroy();
    return;
  }
  if (!/\/ws\/?$/.test(url.pathname)) {
    socket.destroy();
    return;
  }
  const ip = clientIp(req);
  const e = ipEntry(ip);
  const now = Date.now();
  e.connects = e.connects.filter((t) => now - t < 60000);
  if (e.open >= MAX_SOCKETS_PER_IP || e.pending >= MAX_PENDING_PER_IP || e.connects.length >= MAX_CONNECTS_PER_MIN || e.bad >= MAX_BAD_TICKETS) {
    log(`refused connection from ${ip}: open ${e.open}, pending ${e.pending}, recent ${e.connects.length}, bad tickets ${e.bad}`);
    socket.end('HTTP/1.1 429 Too Many Requests\r\nConnection: close\r\nContent-Length: 0\r\n\r\n');
    return;
  }
  e.connects.push(now);
  req.solarIp = ip;
  wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req, url));
});

wss.on('connection', async (ws, req, url) => {
  const cid = nextCid++;
  const ticket = url.searchParams.get('ticket') || '';
  const ip = req.solarIp || 'unknown';
  const ipe = ipEntry(ip);
  const s = { ws, cid, ip, place: null, joined: false, count: 0, window: Date.now(), over: false, strikes: 0, pend: true };
  ipe.open++;
  ipe.pending++;
  sockets.set(cid, s);
  const release = () => {
    if (s.pend) {
      s.pend = false;
      ipe.pending = Math.max(0, ipe.pending - 1);
    }
  };
  const joinTimer = setTimeout(() => {
    if (!s.joined) {
      log(`socket ${cid} from ${ip} did not finish joining in time`);
      drop(ws, 4003, 'join timeout', 'Joining the game took too long. Reload the page to try again.');
    }
  }, JOIN_TIMEOUT_MS);
  ws.on('error', (e) => log(`socket ${cid} (${s.userId || '?'}) error: ${e && e.message}`));
  const early = [];
  ws.on('message', (data, isBinary) => {
    if (isBinary || s.dropped) return;
    const big = !s.studio && !s.solo && data.length > MAX_MSG;
    if (big) {
      if (s.joined) {
        log(`socket ${cid} (${s.userId || '?'}) sent an oversized message (${data.length} bytes), disconnecting`);
        s.dropped = true;
        drop(ws, 4005, 'message too large', 'You were disconnected for sending too much data.');
      }
      return;
    }
    const now = Date.now();
    if (now - s.window > 1000) {
      s.window = now;
      s.count = 0;
      s.strikes = s.over ? s.strikes + 1 : 0;
      s.over = false;
      if (s.strikes >= RATE_STRIKES) {
        log(`socket ${cid} (${s.userId || '?'}) from ${ip} flooded messages for ${s.strikes}s, disconnecting`);
        s.dropped = true;
        drop(ws, 4005, 'rate limited', 'You were disconnected for sending too many messages.');
        return;
      }
    }
    if (++s.count > (s.studio || s.solo ? MAX_STUDIO_RATE : MAX_RATE)) {
      s.over = true;
      return;
    }
    const str = data.toString();
    if (!s.joined) {
      if (early.length < 50 && str.length <= MAX_MSG) early.push(str);
      return;
    }
    if (s.studio) s.studio.message(cid, str);
    else if (s.solo) soloMessage(s, str);
    else {
      noteActivity(s.place, cid, str);
      s.place.worker.postMessage({ t: 'msg', cid, data: str });
    }
  });
  ws.on('close', (code, reason) => {
    clearTimeout(joinTimer);
    release();
    ipe.open = Math.max(0, ipe.open - 1);
    sockets.delete(cid);
    log(`socket ${cid} (${s.userId || '?'}) from ${ip} closed: ${code}${reason && reason.length ? ' ' + String(reason).slice(0, 80) : ''}${s.place ? ' ' + s.place.tag : ''}`);
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
      s.place.joins.delete(cid);
      if (!s.place.dead) s.place.worker.postMessage({ t: 'leave', cid });
      scheduleIdle(s.place);
      pushPresence();
    }
  });
  if (!/^[a-f0-9]{64}$/.test(ticket)) {
    ipe.bad++;
    ipe.badAt = Date.now();
    ws.close(4003, 'bad ticket');
    return;
  }
  if (redeemsInflight >= MAX_REDEEMS_INFLIGHT) {
    drop(ws, 4010, 'busy', 'The server is busy. Try again in a moment.');
    return;
  }
  redeemsInflight++;
  let info;
  try {
    info = await redeem(ticket);
  } finally {
    redeemsInflight--;
    release();
  }
  if (ws.readyState !== 1) return;
  if (info) s.userId = info.userId | 0;
  if (!info) {
    ipe.bad++;
    ipe.badAt = Date.now();
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
  let sameUser = 0;
  for (const o of sockets.values()) if (o !== s && o.userId === s.userId) sameUser++;
  if (sameUser >= MAX_SOCKETS_PER_USER) {
    drop(ws, 4010, 'too many connections', 'You have too many game connections open.');
    return;
  }
  try {
    ws._receiver._maxPayload = MAX_MSG;
  } catch {}
  const pick = chooseInstance(info);
  if (pick.busy) {
    drop(ws, 4010, 'busy', pick.busy);
    return;
  }
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
  const joinedAt = Date.now();
  p.members.set(cid, { id: info.userId | 0, name: String(info.username), joinedAt, lastActive: joinedAt, acts: 0, kinds: new Set(), cells: new Set(), px: undefined, pz: undefined });
  postJoin(p, cid, { id: info.userId | 0, name: String(info.username), membership: info.membership | 0, age: info.age | 0, dev: !!info.dev, perks: cleanPerks(info.perks), avatarType: info.avatarType === 'R15' ? 'R15' : 'R6', scale: cleanScale(info.scale), gearGenres: cleanGenres(info.gearGenres), gearMap: cleanGearMap(info.gearMap), animations: Array.isArray(info.animations) ? info.animations.map((a) => String(a)).filter((a) => /^\d{1,20}$/.test(a)).slice(0, 16) : [] });
  s.joined = true;
  for (const str of early.splice(0)) p.worker.postMessage({ t: 'msg', cid, data: str });
  log(`${p.tag} ${info.username} (${info.userId}) connected`);
  pushPresence();
});

setInterval(() => {
  for (const ws of wss.clients) {
    if (ws.readyState !== 1) continue;
    if (ws.solarMiss >= 2) {
      log(`socket timed out (no pong for ${ws.solarMiss} pings), terminating`);
      ws.terminate();
      continue;
    }
    ws.solarMiss = (ws.solarMiss || 0) + 1;
    try {
      ws.ping();
    } catch {}
  }
}, 20000);
wss.on('connection', (ws) => {
  ws.solarMiss = 0;
  ws.on('pong', () => (ws.solarMiss = 0));
  ws.on('message', () => (ws.solarMiss = 0));
});

server.listen(PORT, HOST, () => {
  log(`chocolate listening on ${HOST}:${PORT}`);
  sendPresence();
  setInterval(sendPresence, 60000);
});

process.on('uncaughtException', (e) => {
  log(`uncaught exception: ${(e && e.stack) || e}`);
});

process.on('unhandledRejection', (e) => {
  log(`unhandled rejection: ${(e && e.stack) || e}`);
});

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    log('shutting down');
    for (const p of places.values()) shutdown(p);
    setTimeout(() => process.exit(0), 1500);
  });
}
