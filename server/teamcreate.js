import zlib from 'zlib';
import { DataModel } from '../shared/instance.js';
import { parsePlace } from '../shared/rbxl.js';
import { GidMap, packPlace, unpack, encodeProp, decodeProp, canMove, MAX_XML } from '../shared/teamsync.js';
import { writePlace } from '../shared/rbxlx.js';
import { placeBytes } from './assets.js';
import { defaultServices } from '../shared/services.js';
import { terrainOf, storeTerrain } from '../shared/terrain.js';

const IDLE_MS = 10 * 60 * 1000;
const MAX_CHAT = 200;
const COLORS = ['#e8453c', '#3d7be8', '#2fa84f', '#e8a23c', '#9b4de8', '#1fb5b5', '#e84d9b', '#7a8a1f'];
const DEFAULT_SERVICES = ['Workspace', 'Lighting', 'StarterGui', 'StarterPack'];

function inflate(buf) {
  const b = Buffer.from(buf);
  try {
    if (b[0] === 0x1f && b[1] === 0x8b) return new Uint8Array(zlib.gunzipSync(b));
    if (b[0] === 0x78) return new Uint8Array(zlib.inflateSync(b));
  } catch {}
  return new Uint8Array(buf);
}

function cleanText(s, n) {
  return String(s ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, n);
}

export class TeamSession {
  constructor(placeId, log, era = 2012, hooks = {}) {
    this.placeId = placeId;
    this.hooks = hooks;
    this.test = null;
    this.editors = new Set();
    this.era = era === 2018 ? 2018 : 2012;
    this.log = log;
    this.members = new Map();
    this.ready = null;
    this.idle = null;
    this.colorNext = 0;
    this.dirty = false;
  }

  load() {
    if (!this.ready) this.ready = this.boot();
    return this.ready;
  }

  async boot() {
    const dm = new DataModel('server');
    for (const s of DEFAULT_SERVICES) dm.service(s);
    const bytes = await placeBytes(this.placeId).catch((e) => {
      if (e && e.code === 'ENOENT') return null;
      throw e;
    });
    if (bytes && bytes.length) dm.load(parsePlace(inflate(bytes)), dm.root, { track: true });
    dm.era = this.era;
    defaultServices(dm, this.era);
    const ws = dm.services.get('Workspace');
    if (!ws.descendants().some((d) => d.isA('BasePart'))) {
      const base = dm.create('Part', null);
      base.props.set('Name', 'Baseplate');
      base.props.set('Anchored', true);
      base.props.set('Locked', true);
      base.props.set('Size', [512, 1.2, 512]);
      base.props.set('CFrame', [0, -0.6, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1]);
      base.props.set('BrickColor', 1);
      base.props.set('TopSurface', 3);
      base.props.set('BottomSurface', 4);
      dm.setParent(base, ws);
    }
    if (!ws.findChildOfClass('Terrain')) {
      const t = dm.create('Terrain', null);
      t.props.set('Name', 'Terrain');
      t.props.set('Anchored', true);
      t.props.set('Locked', true);
      dm.setParent(t, ws);
    }
    this.dm = dm;
    this.gids = new GidMap(dm, 's');
    for (const d of dm.root.descendants()) this.gids.mint(d);
    this.log(`[studio ${this.placeId}] loaded ${dm.root.descendants().length} objects`);
  }

  users() {
    return [...this.members.values()].map((m) => ({ cid: m.cid, id: m.user.id, name: m.user.name, role: m.user.role, color: m.color }));
  }

  send(m, obj) {
    m.send(typeof obj === 'string' ? obj : JSON.stringify(obj));
  }

  broadcast(obj, except = null) {
    const s = JSON.stringify(obj);
    for (const m of this.members.values()) if (m !== except) m.send(s);
  }

  async join(cid, user, send, close) {
    clearTimeout(this.idle);
    const m = { cid, user, send, close, color: COLORS[this.colorNext++ % COLORS.length], prefix: `c${cid}_` };
    this.members.set(cid, m);
    this.editors.add(user.id | 0);
    try {
      await this.load();
    } catch (e) {
      this.log(`[studio ${this.placeId}] failed to load: ${e.message}`);
      this.send(m, { t: 'err', m: 'The place could not be loaded for Team Create.' });
      close(4500, 'load failed');
      this.members.delete(cid);
      return;
    }
    if (!this.members.has(cid)) return;
    const snap = packPlace(this.dm, this.gids);
    this.send(m, { t: 'snap', you: cid, prefix: m.prefix, role: user.role, users: this.users(), xml: snap.xml, refs: snap.refs, dirty: this.dirty, test: this.testInfo() });
    this.broadcast({ t: 'users', users: this.users(), joined: { name: user.name, color: m.color } }, m);
    this.log(`[studio ${this.placeId}] ${user.name} (${user.id}) joined`);
  }

  leave(cid) {
    const m = this.members.get(cid);
    if (!m) return;
    if (m.solo && this.hooks.stopTest) this.hooks.stopTest(m.solo);
    this.members.delete(cid);
    this.broadcast({ t: 'users', users: this.users(), left: { name: m.user.name } });
    this.log(`[studio ${this.placeId}] ${m.user.name} left`);
  }

  empty() {
    return this.members.size === 0;
  }

  message(cid, raw) {
    const m = this.members.get(cid);
    if (!m || !this.dm) return;
    let msg;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }
    if (!msg || typeof msg !== 'object') return;
    if (msg.t === 'b') {
      if (!Array.isArray(msg.ops)) return;
      for (const op of msg.ops.slice(0, 4000)) if (op && typeof op === 'object' && op.t !== 'b') this.op(m, op);
      return;
    }
    this.op(m, msg);
  }

  op(m, msg) {
    const cid = m.cid;
    const s = typeof msg.s === 'number' ? msg.s : 0;
    const reject = (why) => this.send(m, { t: 'nack', s, m: why });
    const dm = this.dm;
    switch (msg.t) {
      case 'p': {
        const inst = this.gids.get(String(msg.g));
        const name = String(msg.n);
        if (!inst || inst === dm.root) return reject('unknown object');
        if (name === 'Parent' || name === 'ClassName') return reject('bad property');
        const d = decodeProp(this.gids, inst, name, msg.v);
        if (!d.ok) return reject('bad value');
        dm.setProp(inst, name, d.v);
        (inst.dirtyProps ||= new Set()).add(name);
        this.dirty = true;
        this.broadcast({ t: 'p', u: cid, s, g: inst.gid, n: name, v: encodeProp(inst, name) });
        break;
      }
      case 'm': {
        const inst = this.gids.get(String(msg.g));
        const parent = msg.p == null ? null : this.gids.get(String(msg.p));
        if (msg.p != null && !parent) return reject('unknown parent');
        if (!canMove(inst, parent, dm.root)) return reject('bad move');
        try {
          dm.setParent(inst, parent);
        } catch {
          return reject('bad move');
        }
        this.dirty = true;
        this.broadcast({ t: 'm', u: cid, s, g: inst.gid, p: parent ? parent.gid : null });
        break;
      }
      case 'n': {
        const parent = this.gids.get(String(msg.p));
        const xml = String(msg.xml || '');
        if (!parent || parent === dm.root || xml.length > MAX_XML) return reject('bad insert');
        const refs = msg.refs && typeof msg.refs === 'object' ? msg.refs : {};
        let made;
        try {
          made = unpack(dm, this.gids, xml, refs, parent, {
            validate: (nodes, ids) => nodes.length > 0 && nodes.length <= 64 && ids.every((g) => typeof g === 'string' && g.startsWith(m.prefix) && g.length < 40 && !this.gids.byGid.has(g)) && new Set(ids).size === ids.length,
          });
        } catch {
          made = null;
        }
        if (!made) return reject('bad insert');
        for (const t of made) for (const d of [t, ...t.descendants()]) if (!d.gid) this.gids.mint(d);
        this.dirty = true;
        this.broadcast({ t: 'n', u: cid, s, p: parent.gid, xml, refs });
        break;
      }
      case 'chat': {
        const text = cleanText(msg.m, MAX_CHAT);
        if (!text) return;
        this.broadcast({ t: 'chat', u: cid, name: m.user.name, color: m.color, m: text });
        break;
      }
      case 'sel': {
        const list = Array.isArray(msg.g) ? msg.g.slice(0, 200).map(String).filter((g) => this.gids.get(g)) : [];
        this.broadcast({ t: 'sel', u: cid, g: list }, m);
        break;
      }
      case 'teamtest': {
        if (msg.on) {
          if (this.test && this.hooks.testAlive && this.hooks.testAlive(this.test)) return this.send(m, { t: 'teamtest', ...this.testInfo() });
          if (!this.hooks.startTest) return reject('Team Test is not available');
          const xml = writePlace(dm);
          this.test = this.hooks.startTest(this, xml, m.user);
          if (!this.test) return reject('Team Test could not start');
          this.broadcast({ t: 'teamtest', ...this.testInfo(), by: m.user.name });
          this.log(`[studio ${this.placeId}] ${m.user.name} started Team Test`);
        } else {
          if (!this.test) return;
          if (this.hooks.stopTest) this.hooks.stopTest(this.test, `${m.user.name} ended the Team Test`);
          this.test = null;
          this.broadcast({ t: 'teamtest', on: false, by: m.user.name });
          this.log(`[studio ${this.placeId}] ${m.user.name} ended Team Test`);
        }
        break;
      }
      case 'dbg': {
        if (m.solo && this.hooks.debug) this.hooks.debug(m.solo, msg);
        break;
      }
      case 'playsolo': {
        if (m.solo && this.hooks.stopTest) this.hooks.stopTest(m.solo);
        m.solo = null;
        if (!msg.on) return this.send(m, { t: 'playsolo', on: false });
        if (!this.hooks.startSolo) return reject('Play Solo is not available');
        const own = typeof msg.xml === 'string' && /^\s*<roblox[\s>]/.test(msg.xml) && msg.xml.length <= 64 * 1024 * 1024 ? msg.xml : null;
        m.solo = this.hooks.startSolo(this, own || writePlace(dm), m.user.id, (o) => this.send(m, o), msg);
        this.send(m, m.solo ? { t: 'playsolo', on: true, job: m.solo.id } : { t: 'playsolo', on: false, error: 'Play Solo could not start' });
        break;
      }
      case 'terr': {
        if (typeof msg.d !== 'string' || msg.d.length > 8 * 1024 * 1024) return reject('terrain change too large');
        const t = dm.services.get('Workspace').findChildOfClass('Terrain');
        if (!t) return reject('no terrain');
        try {
          terrainOf(t, this.era).decode(msg.d);
        } catch {
          return reject('bad terrain data');
        }
        terrainOf(t, this.era).takeDirty();
        storeTerrain(t);
        this.dirty = true;
        this.broadcast({ t: 'terr', u: cid, d: msg.d }, m);
        break;
      }
      case 'saved': {
        this.dirty = false;
        this.broadcast({ t: 'saved', u: cid, name: m.user.name }, m);
        break;
      }
      default:
        break;
    }
  }

  testInfo() {
    if (!this.test || (this.hooks.testAlive && !this.hooks.testAlive(this.test))) return { on: false };
    return { on: true, job: this.test.id };
  }

  scheduleIdle(onIdle) {
    clearTimeout(this.idle);
    this.idle = setTimeout(() => {
      if (this.empty()) onIdle();
    }, IDLE_MS);
  }
}
