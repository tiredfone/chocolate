import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import RAPIER from '@dimforge/rapier3d-compat';
import { Lua } from 'wasmoon-lua5.1';
import { parsePlace } from '../shared/rbxl.js';
import { DataModel } from '../shared/instance.js';
import { ScriptHost, T } from '../shared/luahost.js';
import { Physics } from '../shared/physics.js';
import * as C from '../shared/cframe.js';
import { buildCharacter, attachAccessory, gripWeld, syncGrip, liveCharacterOf, Rig, Controller, CharacterProxy, partColorProps, STATES } from '../shared/humanoid.js';
import { Replicator } from './replicator.js';
import { Animations, animAssetId } from '../shared/animator.js';
import { placeBytes, assetNodes, appearance, luaSource, assetBytes, assetIdOf } from './assets.js';
import { endpoint } from './config.js';
import { social } from './social.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const RUNTIME = fs.readFileSync(path.join(HERE, '../shared/runtime.lua'), 'utf8');
const TICK = 1 / 30;
const MAX_CHAT = 200;
const SERVER_LIBRARIES = { RbxGui: 45284430, RbxGear: 45374389, RbxUtility: 60595411, RbxStamper: 73157242 };
const luaCache = new Map();

function luaAsset(id) {
  return luaCache.get(id | 0) || null;
}

const CHARACTER_SCRIPTS = [['humanoidAnimateLocal', null], ['humanoidSound', null], ['humanoidHealth', 'Health']];
let characterScripts = null;

function loadCharacterScripts() {
  if (characterScripts) return characterScripts;
  characterScripts = [];
  for (const [file, only] of CHARACTER_SCRIPTS) {
    try {
      const nodes = parsePlace(fs.readFileSync(path.join(HERE, '../content/fonts', file + '.rbxm')));
      for (const n of nodes) {
        if (only && n.props.get('Name')?.v !== only) continue;
        characterScripts.push(n);
      }
    } catch {}
  }
  return characterScripts;
}

async function preloadLibraries() {
  await Promise.all(Object.values(SERVER_LIBRARIES).filter((id) => !luaCache.has(id)).map(async (id) => luaCache.set(id, await luaSource(id))));
}

let rapierReady = null;

function cleanText(s, max) {
  return String(s ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').slice(0, max);
}

function finiteArr(a, n) {
  if (!Array.isArray(a) || a.length !== n) return null;
  for (const v of a) if (typeof v !== 'number' || !Number.isFinite(v) || Math.abs(v) > 1e6) return null;
  return a;
}

function physSame(a, b) {
  for (let i = 1; i < 4; i++) if (Math.abs(a[i] - b[i]) > 0.01) return false;
  for (let i = 4; i < 13; i++) if (Math.abs(a[i] - b[i]) > 0.002) return false;
  for (let i = 13; i < 16; i++) if (Math.abs(a[i] - b[i]) > 0.05) return false;
  return true;
}

export class Game {
  constructor(placeId, io) {
    this.placeId = placeId;
    this.jobId = io.jobId || '';
    this.kind = io.kind || 'public';
    this.privateId = io.privateId || 0;
    this.allowGear = io.allowGear !== false;
    this.io = io;
    this.dm = new DataModel('server');
    this.clients = new Map();
    this.chars = new Map();
    this.mice = new Map();
    this.toolMice = new Map();
    this.store = new Map();
    this.t = 0;
    this.frame = 0;
    this.running = false;
    this.pendingTouches = [];
    this.lastSit = new Map();
  }

  log(kind, msg, where) {
    this.io.log(`[place ${this.placeId} ${this.kind === 'public' ? this.jobId : this.kind + ' ' + this.privateId}] [${kind}]${where ? ' ' + where + ':' : ''} ${msg}`);
    if (kind === 'error' || kind === 'print' || kind === 'warn') {
      const line = JSON.stringify({ t: 'out', k: kind, m: String(msg).slice(0, 2000) });
      if (!this.outHistory) this.outHistory = [];
      this.outHistory.push(line);
      if (this.outHistory.length > 200) this.outHistory.shift();
      for (const c of this.clients.values()) if (c.dev && c.ready) this.io.send(c.cid, line);
    }
  }

  async start() {
    if (!rapierReady) rapierReady = RAPIER.init();
    await Promise.all([rapierReady, preloadLibraries()]);
    const dm = this.dm;
    for (const s of ['Workspace', 'Players', 'Lighting', 'StarterGui', 'StarterPack', 'Teams', 'SoundService', 'Debris', 'ReplicatedStorage', 'ServerStorage', 'ServerScriptService', 'InsertService', 'RunService', 'BadgeService', 'Chat']) dm.service(s);
    const bytes = await placeBytes(this.placeId);
    const nodes = parsePlace(bytes);
    for (const n of nodes) {
      const wrap = n.children.filter((c) => c.cls === 'Model' && c.props.get('Name')?.v === n.cls);
      if (wrap.length === 1) {
        const i = n.children.indexOf(wrap[0]);
        n.children.splice(i, 1, ...wrap[0].children);
      }
    }
    dm.load(nodes.filter((n) => dm.services.has(n.cls) || ['Workspace', 'Lighting', 'StarterGui', 'StarterPack', 'Teams', 'SoundService', 'ReplicatedStorage', 'ServerStorage', 'ServerScriptService', 'Players', 'Debris', 'StarterPlayer', 'ReplicatedFirst', 'Chat'].includes(n.cls)), dm.root);
    dm.root.props.set('PlaceId', this.placeId);
    if (dm.root.info.all.has('JobId')) dm.root.props.set('JobId', this.jobId);
    dm.root.props.set('Name', 'Game');
    const ws = dm.services.get('Workspace');
    if (!ws.findChildOfClass('Camera')) {
      const cam = dm.create('Camera', ws);
      cam.props.set('Name', 'Camera');
    }
    ws.props.set('CurrentCamera', ws.findChildOfClass('Camera'));
    this.physics = new Physics(dm, RAPIER, {
      simulate: true,
      excluded: (p) => !!liveCharacterOf(p),
      onTouch: (a, b, started) => this.pendingTouches.push([a, b, started]),
      onFallen: (parts) => this.fallen(parts),
    });
    this.physics.attachWorkspace(ws);
    this.replicator = new Replicator(dm);
    dm.observe({
      reparented: (inst) => this.scanCharacters(inst),
      changed: (inst, name, old, opts) => this.watchChange(inst, name, old, opts),
      destroyed: (inst) => {
        if (this.chars.has(inst)) this.dropChar(inst);
      },
    });
    this.host = new ScriptHost(dm, this.env());
    this.anims = new Animations(dm, (id) => this.host.env.loadAsset(id));
    for (const [name, id] of Object.entries(SERVER_LIBRARIES)) this.host.libraries.set(name, String(id));
    await this.host.init(() => Lua.create(), RUNTIME);
    for (const d of ws.descendants()) if (d.ClassName === 'Model' && d.findChildOfClass('Humanoid')) this.trackChar(d);
    for (let i = 0; i < 3; i++) this.host.tick(this.t);
    this.running = true;
    this.t0 = performance.now();
    this.loop = setInterval(() => this.tick(), TICK * 1000);
  }

  stop() {
    this.running = false;
    clearInterval(this.loop);
  }

  env() {
    const dm = this.dm;
    return {
      log: (k, m, w) => this.log(k, m, w),
      coreSource: (id) => luaAsset(id),
      raycast: (o, d, ig) => this.physics.raycast(o, d, ig),
      breakJoints: (p) => this.physics.breakJoints(p),
      makeJoints: (ps) => this.physics.makeJoints(ps),
      connectedParts: (p) => this.physics.connectedParts(p),
      touchingParts: (p) => this.physics.touchingParts(p),
      rootPart: (p) => this.physics.rootPart(p),
      loadCharacter: (pl) => this.loadCharacter(pl),
      loadAsset: async (id) => {
        const nodes = await assetNodes(id);
        const model = dm.create('Model', null);
        model.props.set('Name', 'Model');
        dm.load(nodes, model);
        return model;
      },
      linkedSource: async (url) => {
        const id = assetIdOf(url);
        if (!id) return '';
        return new TextDecoder().decode(await assetBytes(id));
      },
      mouseFor: (pl) => this.mouseOf(pl),
      kick: (pl, msg) => {
        const c = this.clientOf(pl);
        if (c) this.io.kick(c.cid, msg || 'You have been kicked from the game');
      },
      onSubscribe: (inst, name) => {
        if (inst && inst.isA('BasePart') && (name === 'Touched' || name === 'TouchEnded')) this.physics.touchInterest(inst);
      },
      humanoidMoveTo: (h, pos, part) => {
        const rec = this.chars.get(h.parent);
        if (rec) {
          rec.moveTo = { pos, part, t: this.t };
        }
      },
      equipTool: (h, tool) => {
        const pl = this.playerOfChar(h.parent);
        if (tool) this.equip(pl, tool, h.parent);
      },
      unequipTools: (h) => {
        const pl = this.playerOfChar(h.parent);
        for (const c of [...h.parent.children]) if (c.ClassName === 'Tool') this.unequip(pl, c, h.parent);
      },
      awardBadge: async (uid, bid) => {
        const pl = [...this.clients.values()].map((c) => c.player).find((p) => p.props.get('userId') === uid);
        if (!pl || !(bid > 0)) return false;
        const r = await social('award', { userId: uid, badgeId: bid, placeId: this.placeId });
        if (r && r.awarded && r.message) this.broadcast({ t: 'sys', m: cleanText(String(r.message), 200) });
        return !!(r && r.awarded);
      },
      hasBadge: async (uid, bid) => {
        if (!(uid > 0) || !(bid > 0)) return false;
        const r = await social('hasBadge', { userId: uid, badgeId: bid });
        return !!(r && r.has);
      },
      areFriends: async (pl, uid) => {
        const me = pl && pl.props.get('userId');
        if (!me || !(uid > 0) || uid === me) return false;
        if (this.friends && this.friends.has(this.friendKey(me, uid))) return this.friends.get(this.friendKey(me, uid)) === 2;
        const r = await social('statuses', { userId: me, others: [uid] });
        return !!(r && r.statuses && r.statuses[uid] === 2);
      },
      friendsOnline: async (pl, max) => {
        const r = await social('friendsOnline', { userId: pl.props.get('userId'), max });
        return r && Array.isArray(r.friends) ? r.friends : [];
      },
      friendStatus: (pl, other) => this.friendStatusOf(pl, other),
      friendRequest: (pl, other, on) => { this.changeFriendship(pl, other, on).catch(() => {}); },
      setMessage: (m) => this.broadcast({ t: 'msg', m: m == null ? null : cleanText(m, 500) }),
      teleport: (placeId, pl) => {
        const c = pl && this.clientOf(pl);
        if (c && placeId > 0) this.io.send(c.cid, JSON.stringify({ t: 'teleport', place: placeId | 0 }));
      },
      saveData: async (pl, k, kind, v) => {
        this.store.set(`${pl.props.get('userId')}:${kind}:${k}`, v);
      },
      loadData: async (pl, k, kind) => this.store.get(`${pl.props.get('userId')}:${kind}:${k}`),
      bubbleChat: (part, msg) => {
        if (part && part.isA('BasePart')) this.broadcast({ t: 'bubble', id: part.id, m: cleanText(msg, MAX_CHAT) });
      },
      findSpace: (m, parts, cf, target) => this.findSpace(m, parts, cf, target),
      changeState: () => null,
      animate: (tr, op, a, b, c) => {
        const hum = tr.data.hum;
        const anim = tr.props.get('Animation');
        const id = animAssetId(anim && anim.props.get('AnimationId'));
        const k = 's' + tr.id;
        this.anims.op(hum, k, op, id, a, b, c, tr);
        if (hum.id > 0 && hum.repWas && hum.repWas.rep) this.broadcast({ t: 'anim', h: hum.id, k, op, id, a, b, c });
      },
      playingTracks: (h) => this.anims.playing(h),
    };
  }

  findSpace(model, parts, cf, target) {
    const sizeY = parts.reduce((m, p) => Math.max(m, p.props.get('Size')[1]), 1);
    const half = (() => {
      let lo = Infinity, hi = -Infinity;
      for (const p of parts) {
        const c = p.props.get('CFrame'), s = p.props.get('Size');
        const e = Math.abs(c[6]) * s[0] / 2 + Math.abs(c[7]) * s[1] / 2 + Math.abs(c[8]) * s[2] / 2;
        lo = Math.min(lo, c[1] - e);
        hi = Math.max(hi, c[1] + e);
      }
      return Number.isFinite(lo) ? (hi - lo) / 2 : sizeY / 2;
    })();
    const r = this.physics.raycast([target[0], target[1] + 200, target[2]], [0, -400, 0], [model]);
    if (r.part && r.point[1] + half > target[1]) return [target[0], r.point[1] + half, target[2]];
    return target;
  }

  broadcast(obj, except) {
    const s = JSON.stringify(obj);
    for (const c of this.clients.values()) if (c.ready && c !== except) this.io.send(c.cid, s);
  }

  clientOf(pl) {
    for (const c of this.clients.values()) if (c.player === pl) return c;
    return null;
  }

  playerOfChar(model) {
    const players = this.dm.services.get('Players');
    for (const p of players.children) if (p.ClassName === 'Player' && p.props.get('Character') === model) return p;
    return null;
  }

  openToolMouse(pl) {
    const base = this.mouseOf(pl);
    const m = this.dm.create('PlayerMouse', null);
    for (const k of ['Name', 'Hit', 'Origin', 'Target', 'X', 'Y', 'ViewSizeX', 'ViewSizeY']) m.props.set(k, base.props.get(k));
    this.toolMice.set(pl, m);
    return m;
  }

  emitMouse(pl, ev, ...args) {
    this.dm.emit(this.mouseOf(pl), ev, ...args);
    const t = this.toolMice.get(pl);
    if (t) this.dm.emit(t, ev, ...args);
  }

  mouseOf(pl) {
    let m = this.mice.get(pl);
    if (!m) {
      m = this.dm.create('PlayerMouse', null);
      m.props.set('Name', 'Mouse');
      m.props.set('ViewSizeX', 1024);
      m.props.set('ViewSizeY', 768);
      this.mice.set(pl, m);
    }
    return m;
  }

  async join(cid, user) {
    const dm = this.dm;
    const players = dm.services.get('Players');
    for (const c of this.clients.values()) {
      if (c.user.id === user.id) this.io.kick(c.cid, 'You joined from another session');
    }
    const max = players.props.get('MaxPlayers') || 12;
    if ([...this.clients.values()].length >= Math.max(1, Math.min(50, max))) {
      this.io.kick(cid, 'This game is full');
      return;
    }
    const player = dm.create('Player', null);
    player.props.set('Name', user.name);
    player.props.set('userId', user.id);
    player.props.set('UserId', user.id);
    player.props.set('CharacterAppearance', endpoint('appearance', user.id) || '');
    player.props.set('MembershipType', user.membership | 0);
    player.props.set('AccountAge', user.age | 0);
    const bp = dm.create('Backpack', player);
    bp.props.set('Name', 'Backpack');
    const gui = dm.create('PlayerGui', player);
    gui.props.set('Name', 'PlayerGui');
    const perks = user.perks;
    const made = [player, bp, gui];
    if (perks && (perks.badge || perks.chatColor || perks.nameColor)) {
      const cfg = dm.create('Configuration', player);
      cfg.props.set('Name', 'SolarPerks');
      made.push(cfg);
      if (perks.badge) {
        const v = dm.create('StringValue', cfg);
        v.props.set('Name', 'Badge');
        v.props.set('Value', perks.badge);
        made.push(v);
      }
      for (const [key, name] of [['chatColor', 'ChatColor'], ['nameColor', 'NameColor']]) {
        if (!perks[key]) continue;
        const n = parseInt(perks[key].slice(1), 16);
        const v = dm.create('Color3Value', cfg);
        v.props.set('Name', name);
        v.props.set('Value', [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255]);
        made.push(v);
      }
    }
    for (const o of dm.observers) if (o.created) for (const x of made) o.created(x);
    this.assignTeam(player);
    const client = { cid, user, player, ready: false, seq: 0, lastChat: 0, dev: !!user.dev };
    this.clients.set(cid, client);
    this.replicator.addClient(cid, player, (s) => this.io.send(cid, s));
    dm.setParent(player, players);
    this.copyStarterGui(player);
    const rc = this.replicator.clients.get(cid);
    const snap = this.replicator.snapshotFor(rc);
    this.io.send(cid, JSON.stringify({ t: 'init', place: this.placeId, you: player.id, user: { id: user.id, name: user.name }, snap }));
    rc.ready = true;
    client.ready = true;
    if (client.dev && this.outHistory) for (const line of this.outHistory) this.io.send(cid, line);
    for (const s of this.anims.snapshot()) this.io.send(cid, JSON.stringify({ t: 'anim', op: 'play', ...s }));
    dm.emit(players, 'PlayerAdded', player);
    this.broadcast({ t: 'sys', m: `${user.name} has joined the game.` });
    this.loadFriendStatuses(client).catch(() => {});
    if (players.props.get('CharacterAutoLoads')) this.loadCharacter(player).catch((e) => this.log('error', 'LoadCharacter: ' + e.message));
  }

  friendKey(a, b) {
    return `${a}:${b}`;
  }

  friendStatusOf(pl, other) {
    if (!this.friends) this.friends = new Map();
    const a = pl && pl.props.get('userId'), b = other && other.props.get('userId');
    if (!a || !b || a === b) return 1;
    return this.friends.get(this.friendKey(a, b)) || 1;
  }

  setFriendStatus(a, b, st) {
    if (!this.friends) this.friends = new Map();
    const rev = st === 3 ? 4 : st === 4 ? 3 : st;
    this.friends.set(this.friendKey(a.props.get('userId'), b.props.get('userId')), st);
    this.friends.set(this.friendKey(b.props.get('userId'), a.props.get('userId')), rev);
    const ca = this.clientOf(a), cb = this.clientOf(b);
    if (ca) this.io.send(ca.cid, JSON.stringify({ t: 'fs', s: { [b.id]: st } }));
    if (cb) this.io.send(cb.cid, JSON.stringify({ t: 'fs', s: { [a.id]: rev } }));
  }

  async loadFriendStatuses(client) {
    const me = client.player;
    const others = [...this.clients.values()].filter((c) => c !== client).map((c) => c.player);
    if (!others.length) return;
    const r = await social('statuses', { userId: me.props.get('userId'), others: others.map((o) => o.props.get('userId')) });
    if (!r || !r.statuses || me.destroyed) return;
    for (const o of others) {
      const st = r.statuses[o.props.get('userId')];
      if (st && !o.destroyed) this.setFriendStatus(me, o, st | 0);
    }
  }

  async changeFriendship(pl, other, on) {
    if (!pl || !other || pl === other || other.ClassName !== 'Player' || !other.parent) return;
    const now = Date.now();
    if (!this.friendTimes) this.friendTimes = new Map();
    if (now - (this.friendTimes.get(pl) || 0) < 1500) return;
    this.friendTimes.set(pl, now);
    const r = await social(on ? 'request' : 'revoke', { from: pl.props.get('userId'), to: other.props.get('userId') });
    if (!r || pl.destroyed || other.destroyed) return;
    this.setFriendStatus(pl, other, r.status | 0 || 1);
    const ca = this.clientOf(pl), cb = this.clientOf(other);
    if (r.event != null) for (const c of [ca, cb]) if (c) this.io.send(c.cid, JSON.stringify({ t: 'fre', a: pl.id, b: other.id, e: r.event | 0 }));
  }

  leave(cid) {
    const c = this.clients.get(cid);
    if (!c) return;
    this.clients.delete(cid);
    this.replicator.removeClient(cid);
    const pl = c.player;
    const players = this.dm.services.get('Players');
    this.dm.emit(players, 'PlayerRemoving', pl);
    const ch = pl.props.get('Character');
    if (ch && !ch.destroyed) this.dm.destroy(ch);
    if (!pl.destroyed) this.dm.destroy(pl);
    this.mice.delete(pl);
    this.toolMice.delete(pl);
    this.broadcast({ t: 'sys', m: `${c.user.name} has left the game.` });
  }

  assignTeam(player) {
    const teams = this.dm.services.get('Teams');
    const list = teams.children.filter((t) => t.ClassName === 'Team' && t.props.get('AutoAssignable'));
    if (!list.length) {
      player.props.set('Neutral', true);
      return;
    }
    const players = this.dm.services.get('Players').children.filter((p) => p.ClassName === 'Player');
    let best = list[0], bn = Infinity;
    for (const t of list) {
      const n = players.filter((p) => !p.props.get('Neutral') && p.props.get('TeamColor') === t.props.get('TeamColor')).length;
      if (n < bn) {
        bn = n;
        best = t;
      }
    }
    player.props.set('Neutral', false);
    player.props.set('TeamColor', best.props.get('TeamColor'));
  }

  copyStarterGui(player) {
    const gui = player.findChildOfClass('PlayerGui');
    const sg = this.dm.services.get('StarterGui');
    if (!gui || !sg) return;
    for (const c of sg.children) {
      const k = this.dm.clone(c);
      if (k) this.dm.setParent(k, gui);
    }
  }

  spawnPoint(player) {
    const ws = this.dm.services.get('Workspace');
    const spawns = ws.descendants().filter((d) => d.ClassName === 'SpawnLocation' && d.props.get('Enabled'));
    let pool = spawns;
    if (!player.props.get('Neutral')) {
      const team = spawns.filter((s) => !s.props.get('Neutral') && s.props.get('TeamColor') === player.props.get('TeamColor'));
      pool = team.length ? team : spawns.filter((s) => s.props.get('Neutral'));
    } else {
      const neutral = spawns.filter((s) => s.props.get('Neutral'));
      pool = neutral.length ? neutral : spawns;
    }
    if (!pool.length) pool = spawns;
    const others = [];
    for (const rec of this.chars.values()) {
      if (rec.dead || !rec.model || rec.model.destroyed) continue;
      const cf = rec.torsoCF;
      if (cf) others.push([cf[0], cf[1], cf[2]]);
    }
    const free = (x, y, z) => others.every((o) => Math.hypot(o[0] - x, o[2] - z) > 3 || Math.abs(o[1] - y) > 6);
    const lift = (x, y, z) => {
      let top = y;
      for (const o of others) if (Math.hypot(o[0] - x, o[2] - z) <= 3) top = Math.max(top, o[1] + 5.5);
      return top;
    };
    if (pool.length) {
      const s = pool[Math.floor(Math.random() * pool.length)];
      const cf = s.props.get('CFrame'), sz = s.props.get('Size');
      const top = cf[1] + Math.abs(cf[7]) * sz[1] / 2 + Math.abs(cf[6]) * sz[0] / 2 + Math.abs(cf[8]) * sz[2] / 2;
      const y = top + 3.2;
      let x = cf[0], z = cf[2];
      for (let i = 0; i < 12; i++) {
        const spread = i < 6 ? 0 : 3;
        x = cf[0] + (Math.random() - 0.5) * (Math.max(0, sz[0] - 2) + spread * 2);
        z = cf[2] + (Math.random() - 0.5) * (Math.max(0, sz[2] - 2) + spread * 2);
        if (free(x, y, z)) return { pos: [x, y, z], spawn: s };
      }
      return { pos: [x, lift(x, y, z), z], spawn: s };
    }
    const chars = [...this.chars.keys()];
    for (let i = 0; i < 12; i++) {
      const x = i ? (Math.random() - 0.5) * 16 : 0, z = i ? (Math.random() - 0.5) * 16 : 0;
      const r = this.physics.raycast([x, 500, z], [0, -1000, 0], chars);
      const y = (r.part ? r.point[1] : 0) + 3.2;
      if (free(x, y, z) || i === 11) return { pos: [x, free(x, y, z) ? y : lift(x, y, z), z], spawn: null };
    }
    return { pos: [0, 3.2, 0], spawn: null };
  }

  async loadCharacter(player) {
    if (player.destroyed || !player.parent) return;
    const dm = this.dm;
    const old = player.props.get('Character');
    if (old && !old.destroyed) dm.destroy(old);
    const uid = player.props.get('userId');
    const look = await appearance(uid).catch(() => ({ colors: null, assets: [], gear: [] }));
    if (player.destroyed || !player.parent) return;
    const { pos, spawn } = this.spawnPoint(player);
    const { model, humanoid } = buildCharacter(dm, player.props.get('Name'), pos);
    for (const n of loadCharacterScripts()) dm.load([n], model);
    for (const o of dm.observers) if (o.created) for (const d of [model, ...model.descendants()]) o.created(d);
    if (look.colors) {
      const bcNodes = look.colors.filter((n) => n.cls === 'BodyColors');
      if (bcNodes.length) dm.load(bcNodes, model);
    }
    if (!model.findChildOfClass('BodyColors')) {
      const bc = dm.create('BodyColors', model);
      bc.props.set('Name', 'Body Colors');
    }
    for (const id of look.assets) {
      try {
        const nodes = await assetNodes(id);
        const made = dm.load(nodes, model);
        for (const m of made) this.applyWearable(model, m);
      } catch (e) {
        this.log('warn', `appearance asset ${id}: ${e.message}`);
      }
    }
    partColorProps(model);
    if (player.destroyed || !player.parent) {
      dm.destroy(model);
      return;
    }
    const torso = model.findChild('Torso');
    const lookAt = spawn ? C.lookVector(spawn.props.get('CFrame')) : [0, 0, -1];
    const yaw = C.lookAt(0, 0, 0, lookAt[0], 0, lookAt[2]);
    const rig = new Rig(model);
    rig.pose(C.withPos(yaw, pos[0], pos[1], pos[2]), (p, cf) => p.props.set('CFrame', cf));
    const bp = player.findChildOfClass('Backpack');
    if (bp) {
      for (const c of [...bp.children]) dm.destroy(c);
      const sp = dm.services.get('StarterPack');
      for (const c of sp.children) {
        const k = dm.clone(c);
        if (k) dm.setParent(k, bp);
      }
      for (const tpl of this.allowGear ? await this.gearFor(player, look.gear) : []) {
        if (player.destroyed || bp.destroyed) break;
        const k = dm.clone(tpl);
        if (k) dm.setParent(k, bp);
      }
    }
    if (spawn && spawn.props.get('Duration') > 0) {
      const ff = dm.create('ForceField', model);
      ff.props.set('Name', 'ForceField');
      const dur = spawn.props.get('Duration');
      setTimeout(() => { if (!ff.destroyed) dm.destroy(ff); }, dur * 1000);
    }
    const gui = player.findChildOfClass('PlayerGui');
    if (gui && old && dm.services.get('StarterGui').props.get('ResetPlayerGuiOnSpawn')) {
      for (const c of [...gui.children]) if (!(c.isA('ScreenGui') && c.props.get('ResetOnSpawn') === false)) dm.destroy(c);
      this.copyStarterGui(player);
    }
    dm.setParent(model, dm.services.get('Workspace'));
    dm.setProp(player, 'Character', model);
    const rec = this.chars.get(model) || this.trackChar(model);
    if (rec) {
      rec.owner = player;
      rec.torsoCF = torso.props.get('CFrame');
      rec.tpSeq = 1;
      if (rec.ctrl) {
        rec.ctrl.destroy();
        rec.ctrl = null;
      }
    }
    const c = this.clientOf(player);
    if (c) c.ownPending = { t: 'own', id: model.id, s: rec ? rec.tpSeq : 1, c: torso.props.get('CFrame') };
    dm.emit(player, 'CharacterAdded', model);
  }

  humanoidEvents(rec, prev) {
    const dm = this.dm;
    const hum = rec.hum;
    if (!hum || hum.destroyed) return;
    const st = rec.state;
    if (st !== prev) {
      if (prev === STATES.jump) dm.emit(hum, 'Jumping', false);
      if (prev === STATES.fall) dm.emit(hum, 'FreeFalling', false);
      if (st === STATES.jump) dm.emit(hum, 'Jumping', true);
      if (st === STATES.fall) dm.emit(hum, 'FreeFalling', true);
      if (st === STATES.climb) dm.emit(hum, 'Climbing', hum.props.get('WalkSpeed'));
    }
    const speed = st === STATES.walk ? Math.hypot(rec.vel[0], rec.vel[2]) : 0;
    const running = speed > 0.5 ? Math.round(speed) : 0;
    if (running !== rec.lastRunning) {
      rec.lastRunning = running;
      dm.emit(hum, 'Running', running);
    }
  }

  async gearFor(player, ids) {
    if (!this.gear) this.gear = new WeakMap();
    let list = this.gear.get(player);
    if (list) return list;
    list = [];
    this.gear.set(player, list);
    for (const id of ids || []) {
      try {
        const made = this.dm.load(await assetNodes(id), null);
        const roots = made.filter((m) => !m.parent);
        const tool = roots.find((m) => m.isA('Tool') || m.ClassName === 'HopperBin') || made.find((m) => m.isA('Tool') || m.ClassName === 'HopperBin');
        if (tool) {
          if (tool.parent) this.dm.setParent(tool, null);
          list.push(tool);
        }
        for (const r of roots) if (r !== tool && !r.destroyed) this.dm.destroy(r);
      } catch (e) {
        this.log('warn', `gear ${id}: ${e.message}`);
      }
    }
    return list;
  }

  applyWearable(model, inst) {
    const dm = this.dm;
    if (inst.isA('Accoutrement')) {
      attachAccessory(dm, model, inst);
    } else if (inst.ClassName === 'Decal' && /face/i.test(inst.props.get('Name'))) {
      const head = model.findChild('Head');
      const oldFace = head && head.findChild('face');
      if (oldFace) dm.destroy(oldFace);
      if (head) dm.setParent(inst, head);
      inst.props.set('Face', 5);
    } else if (inst.ClassName === 'SpecialMesh') {
      const head = model.findChild('Head');
      const oldMesh = head && head.findChildOfClass('SpecialMesh');
      if (oldMesh) dm.destroy(oldMesh);
      if (head) dm.setParent(inst, head);
    } else if (inst.isA('Tool') || inst.ClassName === 'HopperBin') {
      dm.destroy(inst);
    } else if (inst.ClassName === 'Model') {
      for (const c of [...inst.children]) {
        dm.setParent(c, model);
        this.applyWearable(model, c);
      }
      dm.destroy(inst);
    }
  }

  surfaceJoints(model) {
    const dm = this.dm;
    const parts = model.children.filter((c) => c.isA('BasePart'));
    const linked = new Set();
    for (const d of model.descendants()) {
      if (!d.isA('JointInstance')) continue;
      const a = d.props.get('Part0'), b = d.props.get('Part1');
      if (a && b) linked.add(a.id + ':' + b.id).add(b.id + ':' + a.id);
    }
    for (let i = 0; i < parts.length; i++) {
      for (let k = i + 1; k < parts.length; k++) {
        const a = parts[i], b = parts[k];
        if (linked.has(a.id + ':' + b.id)) continue;
        const cls = this.physics.contactJointClass(a, b);
        if (!cls) continue;
        const j = dm.create(cls, null);
        j.props.set('Name', cls);
        j.props.set('Part0', a);
        j.props.set('Part1', b);
        j.props.set('C0', C.mul(C.inv(a.props.get('CFrame')), b.props.get('CFrame')));
        j.props.set('C1', C.cf(0, 0, 0));
        for (const o of dm.observers) if (o.created) o.created(j);
        dm.setParent(j, a);
        linked.add(a.id + ':' + b.id).add(b.id + ':' + a.id);
      }
    }
  }

  trackChar(model) {
    if (this.chars.has(model)) return this.chars.get(model);
    const hum = model.findChildOfClass('Humanoid');
    const torso = model.findChild('Torso');
    const head = model.findChild('Head');
    if (!hum || !torso || !head || !this.dm.inWorkspace(model)) return null;
    if (torso.props.get('Anchored')) return null;
    if (hum.props.get('Health') <= 0) return null;
    let rig = new Rig(model);
    if (!rig.parts || !rig.parts.has(head)) {
      this.surfaceJoints(model);
      rig = new Rig(model);
    }
    const rec = {
      model, hum, rig, proxy: null, owner: null, ctrl: null, torsoCF: torso.props.get('CFrame'),
      vel: [0, 0, 0], state: STATES.idle, tpSeq: 1, dead: false, dirty: false, moveTo: null, seat: null, lastHealth: hum.props.get('Health'),
    };
    rec.proxy = new CharacterProxy(this.physics, model);
    model.data = model.data || {};
    this.chars.set(model, rec);
    for (const d of model.descendants()) if (d.isA('BasePart')) this.physics.removePart(d);
    return rec;
  }

  dropChar(model) {
    const rec = this.chars.get(model);
    if (!rec) return;
    this.chars.delete(model);
    if (rec.proxy) rec.proxy.destroy();
    if (rec.ctrl) rec.ctrl.destroy();
    rec.proxy = rec.ctrl = null;
  }

  scanCharacters(inst) {
    if (!this.chars) return;
    const ws = this.dm.services.get('Workspace');
    for (const [model, rec] of this.chars) {
      if (model === inst || inst.isDescendantOf(model) || model.isDescendantOf(inst)) rec.dirty = true;
      if (!model.isDescendantOf(ws) && !rec.dead) this.dropChar(model);
    }
    if (!inst.isDescendantOf(ws) && inst !== ws) return;
    const check = (m) => {
      if (m.ClassName === 'Model' && m.findChildOfClass('Humanoid') && !this.chars.has(m)) this.trackChar(m);
    };
    if (inst.ClassName === 'Humanoid' && inst.parent) check(inst.parent);
    check(inst);
    if (inst.children.length) for (const d of inst.descendants()) if (d.ClassName === 'Model') check(d);
  }

  watchChange(inst, name, old, opts) {
    if (name === 'Grip' && inst.ClassName === 'Tool') syncGrip(this.dm, inst);
    if (inst.ClassName === 'Humanoid' && name === 'Health') {
      this.dm.emit(inst, 'HealthChanged', inst.props.get('Health'));
    }
    if (name === 'CFrame' && opts && opts.lua && inst.isA('BasePart')) {
      const model = liveCharacterOf(inst);
      const rec = model && this.chars.get(model);
      if (rec && !rec.dead) {
        const torso = model.findChild('Torso');
        let tcf;
        if (inst === torso) tcf = inst.props.get('CFrame');
        else {
          const poses = rec.rig.pose(rec.torsoCF);
          const cur = poses.get(inst);
          if (!cur) return;
          tcf = C.mul(inst.props.get('CFrame'), C.mul(C.inv(cur), rec.torsoCF));
        }
        rec.torsoCF = C.orthonormalize(tcf);
        rec.vel = [0, 0, 0];
        if (rec.ctrl) rec.ctrl.teleport(rec.torsoCF);
        if (rec.owner) {
          rec.tpSeq++;
          const c = this.clientOf(rec.owner);
          if (c) c.tpPending = { t: 'tp', s: rec.tpSeq, c: rec.torsoCF.map((v) => Math.round(v * 1e4) / 1e4) };
        }
      }
    }
    if (inst.isA('JointInstance') && (name === 'Part0' || name === 'Part1')) {
      for (const [model, rec] of this.chars) if (inst.isDescendantOf(model)) rec.dirty = true;
    }
    if (inst.ClassName === 'Explosion' && name === 'Position') return;
  }

  neckOK(rec) {
    const head = rec.model.findChild('Head');
    return !!head && rec.rig.parts && rec.rig.parts.has(head);
  }

  die(rec) {
    if (rec.dead) return;
    rec.dead = true;
    const { model, hum } = rec;
    model.data.dead = true;
    if (hum.props.get('Health') > 0 && !hum.destroyed) this.dm.setProp(hum, 'Health', 0);
    const parts = model.descendants().filter((d) => d.isA('BasePart'));
    this.dropChar(model);
    for (const p of parts) this.physics.breakJoints(p);
    for (const p of parts) {
      if (p.destroyed) continue;
      this.physics.enter(p);
    }
    this.physics.flush();
    const v = rec.vel;
    for (const p of parts) {
      const r = this.physics.parts.get(p);
      if (r && r.asm && r.asm.body) r.asm.body.setLinvel({ x: v[0] + (Math.random() - 0.5) * 8, y: Math.max(v[1], 0) + 4, z: v[2] + (Math.random() - 0.5) * 8 }, true);
    }
    if (!hum.destroyed) this.dm.emit(hum, 'Died');
    const pl = rec.owner || this.playerOfChar(model);
    if (pl) {
      setTimeout(() => {
        if (pl.destroyed || !pl.parent) return;
        if (pl.props.get('Character') !== model && pl.props.get('Character')) return;
        if (this.dm.services.get('Players').props.get('CharacterAutoLoads')) this.loadCharacter(pl).catch((e) => this.log('error', 'respawn: ' + e.message));
      }, 5000);
    }
    setTimeout(() => {
      if (!model.destroyed && (!pl || pl.props.get('Character') !== model)) this.dm.destroy(model);
    }, 15000);
  }

  fallen(parts) {
    for (const p of parts) if (!p.destroyed) this.dm.destroy(p);
  }

  updateChars(dt) {
    const ws = this.dm.services.get('Workspace');
    const destroyY = ws.props.get('FallenPartsDestroyHeight');
    for (const rec of [...this.chars.values()]) {
      const { model, hum } = rec;
      if (model.destroyed || hum.destroyed || hum.parent !== model) {
        this.die(rec);
        continue;
      }
      if (!rec.dirty && rec.rig.order && rec.rig.order.some((e) => e[1].destroyed || !e[1].isDescendantOf(model))) rec.dirty = true;
      if (rec.dirty) {
        rec.dirty = false;
        rec.rig.build();
        rec.proxy.refresh();
      }
      if (hum.props.get('Health') <= 0 || !this.neckOK(rec) || !model.findChild('Torso')) {
        this.die(rec);
        continue;
      }
      if (rec.torsoCF[1] < destroyY) {
        this.dm.setProp(hum, 'Health', 0);
        this.die(rec);
        continue;
      }
      if (rec.owner) {
        const h = hum.props.get('Health'), mh = hum.props.get('MaxHealth');
        if (h < mh) this.dm.setProp(hum, 'Health', Math.min(mh, h + mh * 0.01 * dt));
      }
      if (rec.seat) {
        const seat = rec.seat.seat;
        const weld = rec.seat.weld;
        if (seat.destroyed || weld.destroyed || weld.props.get('Part0') !== seat) {
          this.unseat(rec);
        } else {
          rec.torsoCF = C.mul(C.mul(seat.props.get('CFrame'), weld.props.get('C0')), C.inv(weld.props.get('C1')));
          rec.state = STATES.sit;
          rec.vel = seat.props.get('Velocity').slice();
        }
      } else if (!rec.owner) {
        if (!rec.ctrl) rec.ctrl = new Controller(this.physics, model, hum);
        let move = [0, 0, 0];
        if (rec.moveTo) {
          const tp = rec.moveTo.part && !rec.moveTo.part.destroyed ? rec.moveTo.part.props.get('CFrame') : rec.moveTo.pos;
          if (tp) {
            const d = [tp[0] - rec.torsoCF[0], 0, tp[2] - rec.torsoCF[2]];
            const l = Math.hypot(d[0], d[2]);
            if (l < 1.5) {
              rec.moveTo = null;
              this.dm.emit(hum, 'MoveToFinished', true);
            } else if (this.t - rec.moveTo.t > 8) {
              rec.moveTo = null;
              this.dm.emit(hum, 'MoveToFinished', false);
            } else move = d;
          }
        }
        const r = rec.ctrl.update(dt, { move, jump: false });
        rec.torsoCF = r.cf;
        rec.vel = r.vel;
        rec.state = r.state;
      }
      const poses = rec.rig.pose(rec.torsoCF);
      for (const [p, cf] of poses) this.dm.setProp(p, 'CFrame', cf, { physics: true });
      this.dm.setProp(model.findChild('Torso'), 'Velocity', rec.vel, { physics: true });
      rec.proxy.update(rec.torsoCF, poses);
      hum.data = hum.data || {};
      hum.data.state = rec.state;
    }
  }

  sit(rec, seat) {
    if (rec.seat || rec.dead || seat.props.get('Disabled') || seat.props.get('Occupant')) return;
    const last = this.lastSit.get(rec.model) || 0;
    if (this.t - last < 1.2) return;
    const torso = rec.model.findChild('Torso');
    const dm = this.dm;
    const w = dm.create('Weld', null);
    w.props.set('Name', 'SeatWeld');
    w.props.set('Part0', seat);
    w.props.set('Part1', torso);
    w.props.set('C0', C.cf(0, seat.props.get('Size')[1] / 2 + 1, 0));
    w.props.set('C1', C.angles(0, 0, 0));
    for (const o of dm.observers) if (o.created) o.created(w);
    dm.setParent(w, seat);
    rec.seat = { seat, weld: w };
    if (rec.proxy) rec.proxy.setSeated(true);
    dm.setProp(rec.hum, 'Sit', true);
    dm.setProp(seat, 'Occupant', rec.hum);
    dm.emit(rec.hum, 'Seated', true, seat);
  }

  unseat(rec) {
    if (!rec.seat) return;
    const { seat, weld } = rec.seat;
    rec.seat = null;
    if (rec.proxy) rec.proxy.setSeated(false);
    this.lastSit.set(rec.model, this.t);
    if (!weld.destroyed) this.dm.destroy(weld);
    if (!seat.destroyed) {
      this.dm.setProp(seat, 'Occupant', null);
      if (seat.ClassName === 'VehicleSeat') {
        this.dm.setProp(seat, 'Throttle', 0);
        this.dm.setProp(seat, 'Steer', 0);
      }
    }
    if (!rec.hum.destroyed) {
      this.dm.setProp(rec.hum, 'Sit', false);
      this.dm.emit(rec.hum, 'Seated', false, null);
    }
    rec.torsoCF = C.mul(rec.torsoCF, C.cf(0, 3, 0));
    rec.vel = [0, 30, 0];
    if (rec.owner) {
      rec.tpSeq++;
      const c = this.clientOf(rec.owner);
      if (c) c.tpPending = { t: 'tp', s: rec.tpSeq, c: flat(rec.torsoCF), v: [0, 40, 0] };
    } else if (rec.ctrl) rec.ctrl.teleport(rec.torsoCF);
  }

  handleTouches() {
    const list = this.pendingTouches;
    this.pendingTouches = [];
    for (const [a, b, started] of list) {
      if (a.destroyed || b.destroyed) continue;
      const ca = liveCharacterOf(a), cb = liveCharacterOf(b);
      if (ca && ca === cb) continue;
      const ev = started ? 'Touched' : 'TouchEnded';
      this.dm.emit(a, ev, b);
      this.dm.emit(b, ev, a);
      if (!started) continue;
      for (const [part, ch] of [[a, cb], [b, ca]]) {
        if (!ch) continue;
        const rec = this.chars.get(ch);
        if (!rec) continue;
        if ((part.ClassName === 'Seat' || part.ClassName === 'VehicleSeat') && !rec.seat) this.sit(rec, part);
        if (part.props.get('Name') === 'Handle' && part.parent && part.parent.ClassName === 'Tool' && this.dm.inWorkspace(part) && !liveCharacterOf(part)) {
          const pl = rec.owner;
          if (pl) {
            const bp = pl.findChildOfClass('Backpack');
            const tool = part.parent;
            if (bp) {
              this.dm.setParent(tool, bp);
              this.equip(pl, tool, ch);
            }
          }
        }
        if (part.ClassName === 'SpawnLocation' && part.props.get('AllowTeamChangeOnTouch') && rec.owner && !part.props.get('Neutral')) {
          this.dm.setProp(rec.owner, 'TeamColor', part.props.get('TeamColor'));
          this.dm.setProp(rec.owner, 'Neutral', false);
        }
      }
    }
  }

  handleExplosions() {
    const ws = this.dm.services.get('Workspace');
    if (!this.explosions) this.explosions = new Set();
    for (const e of ws.children) {
      if (e.ClassName !== 'Explosion' || this.explosions.has(e)) continue;
      this.explosions.add(e);
      const pos = e.props.get('Position');
      const radius = e.props.get('BlastRadius');
      const pressure = e.props.get('BlastPressure');
      const killed = new Set();
      this.physics.explode(pos, radius, pressure, (part, d) => {
        this.dm.emit(e, 'Hit', part, d);
        const ch = liveCharacterOf(part);
        if (ch && !ch.findChildOfClass('ForceField') && !killed.has(ch)) {
          killed.add(ch);
          const rec = this.chars.get(ch);
          if (rec) {
            this.dm.setProp(rec.hum, 'Health', 0);
            this.die(rec);
          }
        }
      });
      setTimeout(() => {
        if (!e.destroyed) this.dm.destroy(e);
        this.explosions.delete(e);
      }, 2000);
    }
  }

  equip(pl, tool, model) {
    const dm = this.dm;
    model = model || (pl && pl.props.get('Character'));
    if (!model || !this.chars.has(model)) return;
    if (tool.ClassName !== 'Tool' || tool.destroyed) return;
    for (const c of [...model.children]) if (c.ClassName === 'Tool' && c !== tool) this.unequip(pl, c, model);
    if (tool.parent !== model) dm.setParent(tool, model);
    if (tool.props.get('RequiresHandle') !== false) gripWeld(dm, model, tool);
    const rec = this.chars.get(model);
    if (rec) rec.dirty = true;
    dm.emit(tool, 'Equipped', pl ? this.openToolMouse(pl) : null);
  }

  unequip(pl, tool, model) {
    const dm = this.dm;
    model = model || (pl && pl.props.get('Character'));
    if (!model || tool.parent !== model) return;
    const arm = model.findChild('Right Arm');
    const grip = arm && arm.findChild('RightGrip');
    if (grip) dm.destroy(grip);
    const bp = pl && pl.findChildOfClass('Backpack');
    if (pl) this.toolMice.delete(pl);
    dm.emit(tool, 'Unequipped');
    if (bp) dm.setParent(tool, bp);
    else dm.destroy(tool);
    const rec = this.chars.get(model);
    if (rec) rec.dirty = true;
  }

  message(cid, raw) {
    const c = this.clients.get(cid);
    if (!c || !c.ready) return;
    let m;
    try {
      m = JSON.parse(raw);
    } catch {
      return;
    }
    if (!m || typeof m !== 'object') return;
    try {
      this.handle(c, m);
    } catch (e) {
      this.log('error', `client message ${m.t}: ${e.message}`);
    }
  }

  ownedInst(c, id, cls) {
    const inst = this.dm.byId.get(id);
    if (!inst || inst.destroyed) return null;
    if (cls && !inst.isA(cls)) return null;
    return inst;
  }

  handle(c, m) {
    const dm = this.dm;
    const pl = c.player;
    const model = pl.props.get('Character');
    const rec = model ? this.chars.get(model) : null;
    switch (m.t) {
      case 'char': {
        if (!rec || rec.owner !== pl || rec.dead || rec.seat) return;
        if ((m.s | 0) < rec.tpSeq) return;
        const cf = finiteArr(m.c, 12);
        const v = finiteArr(m.v, 3);
        if (!cf || !v) return;
        const ws = rec.hum.props.get('WalkSpeed');
        const dt = Math.max(0.03, this.t - (rec.lastUpdate || this.t - 0.05));
        const dist = Math.hypot(cf[0] - rec.torsoCF[0], cf[2] - rec.torsoCF[2]);
        const dy = cf[1] - rec.torsoCF[1];
        if (dist > ws * 2.5 * dt + 6 || dy > 120 * dt + 8) {
          rec.tpSeq++;
          c.tpPending = { t: 'tp', s: rec.tpSeq, c: flat(rec.torsoCF) };
          return;
        }
        rec.torsoCF = C.orthonormalize(cf);
        rec.vel = v;
        const prev = rec.state;
        rec.state = Math.max(0, Math.min(7, m.st | 0));
        rec.lastUpdate = this.t;
        this.humanoidEvents(rec, prev);
        break;
      }
      case 'jump': {
        if (rec && rec.seat) this.unseat(rec);
        break;
      }
      case 'drive': {
        if (!rec || !rec.seat || rec.seat.seat.ClassName !== 'VehicleSeat') return;
        const seat = rec.seat.seat;
        dm.setProp(seat, 'Throttle', Math.max(-1, Math.min(1, m.th | 0)));
        dm.setProp(seat, 'Steer', Math.max(-1, Math.min(1, m.st | 0)));
        break;
      }
      case 'click': {
        const cd = this.ownedInst(c, m.id, 'ClickDetector');
        if (!cd || !rec || !dm.inWorkspace(cd)) return;
        const part = cd.parent;
        if (!part) return;
        const pp = part.isA('BasePart') ? part : part.findChildWhichIsA && part.findChildWhichIsA('BasePart');
        if (!pp) return;
        const pcf = pp.props.get('CFrame');
        const d = Math.hypot(pcf[0] - rec.torsoCF[0], pcf[1] - rec.torsoCF[1], pcf[2] - rec.torsoCF[2]);
        if (d > cd.props.get('MaxActivationDistance') + 8 + Math.max(...pp.props.get('Size'))) return;
        dm.emit(cd, 'MouseClick', pl);
        break;
      }
      case 'hover': {
        const cd = this.ownedInst(c, m.id, 'ClickDetector');
        if (cd) dm.emit(cd, m.on ? 'MouseHoverEnter' : 'MouseHoverLeave', pl);
        break;
      }
      case 'equip': {
        const tool = this.ownedInst(c, m.id, 'Tool');
        if (!tool || !rec || (tool.parent !== pl.findChildOfClass('Backpack') && tool.parent !== model)) return;
        this.equip(pl, tool, model);
        break;
      }
      case 'friend': {
        const other = this.dm.byId.get(m.id | 0);
        if (other && other.ClassName === 'Player') this.changeFriendship(pl, other, !!m.on).catch(() => {});
        break;
      }
      case 'unequip': {
        const tool = this.ownedInst(c, m.id, 'Tool');
        if (!tool || !rec || tool.parent !== model) return;
        this.unequip(pl, tool, model);
        break;
      }
      case 'drop': {
        const tool = this.ownedInst(c, m.id, 'Tool');
        if (!tool || !rec || tool.parent !== model || !tool.props.get('CanBeDropped')) return;
        const arm = model.findChild('Right Arm');
        const grip = arm && arm.findChild('RightGrip');
        if (grip) dm.destroy(grip);
        this.toolMice.delete(pl);
        dm.emit(tool, 'Unequipped');
        const h = tool.findChild('Handle');
        if (h && h.isA('BasePart')) {
          const lv = C.lookVector(rec.torsoCF);
          h.props.set('CFrame', C.cf(rec.torsoCF[0] + lv[0] * 3, rec.torsoCF[1] + 2, rec.torsoCF[2] + lv[2] * 3));
        }
        dm.setParent(tool, dm.services.get('Workspace'));
        rec.dirty = true;
        break;
      }
      case 'act': {
        const tool = this.ownedInst(c, m.id, 'Tool');
        if (!tool || tool.parent !== model || !rec) return;
        if (m.down) {
          if (tool.props.get('Enabled')) dm.emit(tool, 'Activated');
          this.emitMouse(pl, 'Button1Down');
        } else {
          dm.emit(tool, 'Deactivated');
          this.emitMouse(pl, 'Button1Up');
        }
        break;
      }
      case 'hop': {
        const bin = this.ownedInst(c, m.id, 'HopperBin');
        if (!bin || bin.parent !== pl.findChildOfClass('Backpack')) return;
        dm.setProp(bin, 'Active', !!m.on);
        if (m.on) dm.emit(bin, 'Selected', this.openToolMouse(pl));
        else {
          this.toolMice.delete(pl);
          dm.emit(bin, 'Deselected');
        }
        break;
      }
      case 'mouse': {
        const mouse = this.mouseOf(pl);
        const h = finiteArr(m.h, 3), o = finiteArr(m.o, 3);
        if (h) mouse.props.set('Hit', C.lookAt(o ? o[0] : h[0], o ? o[1] : h[1], o ? o[2] : h[2] + 1, h[0], h[1], h[2]).map((v, i) => (i < 3 ? h[i] : v)));
        if (o) mouse.props.set('Origin', C.cf(o[0], o[1], o[2]));
        if (h) {
          const ch = pl.props.get('Character');
          const hum = ch && !ch.destroyed ? ch.findChildOfClass('Humanoid') : null;
          if (hum) hum.props.set('TargetPoint', h.slice());
        }
        const tg = m.tg ? dm.byId.get(m.tg) : null;
        mouse.props.set('Target', tg && tg.isA('BasePart') ? tg : null);
        if (m.x != null) mouse.props.set('X', m.x | 0);
        if (m.y != null) mouse.props.set('Y', m.y | 0);
        const tm = this.toolMice.get(pl);
        if (tm) for (const key of ['Hit', 'Origin', 'Target', 'X', 'Y']) tm.props.set(key, mouse.props.get(key));
        if (m.b) this.emitMouse(pl, m.b === 'down' ? 'Button1Down' : m.b === 'up' ? 'Button1Up' : m.b === 'move' ? 'Move' : 'Idle');
        break;
      }
      case 'anim': {
        const hum = dm.byId.get(m.h | 0);
        if (!rec || !hum || hum !== rec.hum || !Animations.validOp(m.op)) return;
        const k = Number(m.k) | 0;
        const id = Number(m.id) | 0;
        const n = (v) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(-100, Math.min(100, v)) : undefined);
        if (m.op === 'play' && id <= 0) return;
        const key = 'c' + c.cid + ':' + k;
        const a = n(m.a), b = n(m.b), cc = n(m.c);
        this.anims.op(hum, key, m.op, id, a, b, cc);
        this.broadcast({ t: 'anim', h: hum.id, k: key, op: m.op, id, a, b, c: cc }, c);
        break;
      }
      case 'hp': {
        const hum = rec && rec.hum;
        const v = Number(m.v);
        if (!hum || hum.destroyed || rec.dead || !Number.isFinite(v)) return;
        if (v < hum.props.get('Health')) dm.setProp(hum, 'Health', Math.max(0, v));
        break;
      }
      case 'break': {
        const part = dm.byId.get(m.id | 0);
        if (!rec || rec.dead || !part || part.destroyed || !part.isA('BasePart') || !part.isDescendantOf(model)) return;
        this.physics.breakJoints(part);
        rec.dirty = true;
        break;
      }
      case 'val': {
        const inst = dm.byId.get(m.id | 0);
        if (!inst || inst.destroyed || !inst.isA('ValueBase')) return;
        const ch = pl.props.get('Character');
        const owned = (ch && inst.isDescendantOf(ch)) || pl.children.some((x) => (x.ClassName === 'Backpack' || x.ClassName === 'PlayerGui') && inst.isDescendantOf(x));
        if (!owned) return;
        const p = inst.info.all.get('Value');
        if (!p) return;
        let v = m.v;
        if (p.type === 'Ref') v = v == null ? null : dm.byId.get(v | 0) || null;
        else if (['V3', 'V2', 'C3', 'CF', 'UD2'].includes(p.type)) {
          if (!Array.isArray(v) || v.length > 12 || !v.every((x) => typeof x === 'number' && Number.isFinite(x))) return;
        } else if (p.type === 'string') v = cleanText(v, 2000);
        else if (p.type === 'bool') v = !!v;
        else if (typeof v !== 'number' || !Number.isFinite(v)) return;
        dm.setProp(inst, 'Value', v);
        break;
      }
      case 'key': {
        const k = cleanText(m.k, 8).toLowerCase();
        if (!k) return;
        this.emitMouse(pl, m.down ? 'KeyDown' : 'KeyUp', k);
        break;
      }
      case 'chat': {
        const msg = cleanText(m.m, MAX_CHAT).trim();
        if (!msg || this.t - c.lastChat < 0.6) return;
        c.lastChat = this.t;
        const kind = m.k === 'team' ? 'team' : m.k === 'whisper' ? 'whisper' : 'all';
        const target = kind === 'whisper' ? this.ownedInst(c, m.to, 'Player') : null;
        if (kind === 'whisper' && !target) return;
        dm.emit(pl, 'Chatted', msg, target);
        const head = model && model.findChild('Head');
        const out = JSON.stringify({ t: 'chat', p: pl.id, n: pl.props.get('Name'), u: pl.props.get('userId'), m: msg, k: kind, to: target ? target.id : undefined, h: head ? head.id : null });
        for (const o of this.clients.values()) {
          if (!o.ready) continue;
          if (kind === 'team' && (o.player.props.get('Neutral') || pl.props.get('Neutral') || o.player.props.get('TeamColor') !== pl.props.get('TeamColor'))) continue;
          if (kind === 'whisper' && o.player !== target && o !== c) continue;
          this.io.send(o.cid, out);
        }
        break;
      }
      case 'gui': {
        const inst = this.ownedInst(c, m.id, 'GuiObject');
        const gui = pl.findChildOfClass('PlayerGui');
        if (!inst || !gui || !inst.isDescendantOf(gui)) return;
        const ev = String(m.ev);
        if (!['MouseButton1Click', 'MouseButton1Down', 'MouseButton1Up', 'MouseButton2Click', 'MouseEnter', 'MouseLeave'].includes(ev)) return;
        dm.emit(inst, ev, m.x | 0, m.y | 0);
        break;
      }
      case 'txt': {
        const inst = this.ownedInst(c, m.id, 'TextBox');
        const gui = pl.findChildOfClass('PlayerGui');
        if (!inst || !gui || !inst.isDescendantOf(gui)) return;
        dm.setProp(inst, 'Text', cleanText(m.text, 2000));
        if (m.done) dm.emit(inst, 'FocusLost', !!m.enter);
        break;
      }
      case 'ping': {
        this.io.send(c.cid, JSON.stringify({ t: 'pong', x: m.x }));
        break;
      }
      default:
        break;
    }
  }

  physExtras(client, msg) {
    if (this.frame % 2 === 0) {
      const ph = this._ph;
      if (ph && ph.length) msg.ph = ph;
    }
    const ch = [];
    for (const rec of this.chars.values()) {
      if (rec.dead) continue;
      if (rec.owner === client.player && !rec.seat) continue;
      const cf = rec.torsoCF;
      ch.push([rec.model.id, ...flat(cf), Math.round(rec.vel[0] * 100) / 100, Math.round(rec.vel[1] * 100) / 100, Math.round(rec.vel[2] * 100) / 100, rec.state]);
    }
    if (ch.length) msg.ch = ch;
    const c = this.clients.get(client.cid);
    if (c && (c.ownPending || c.tpPending)) {
      msg.after = [];
      if (c.ownPending) msg.after.push(c.ownPending);
      if (c.tpPending) msg.after.push(c.tpPending);
      c.ownPending = c.tpPending = null;
    }
  }

  collectPhys() {
    const out = [];
    for (const asm of this.physics.assemblies) {
      if (!asm.body) continue;
      const sleeping = asm.body.isSleeping();
      if (sleeping && asm.sentSleep) continue;
      asm.sentSleep = sleeping;
      for (const p of asm.parts) {
        if (!p.repWas || !p.repWas.rep) continue;
        const r = Replicator.physRecord(p);
        const last = p.phSent;
        if (last && physSame(last, r)) continue;
        p.phSent = r;
        out.push(r);
      }
    }
    return out;
  }

  tick() {
    if (!this.running) return;
    const dt = TICK;
    this.t += dt;
    this.frame++;
    try {
      this.host.tick(this.t);
      const rs = this.dm.services.get('RunService');
      if (rs && (this.dm.hasListener(rs, 'Stepped') || this.dm.hasListener(rs, 'Heartbeat'))) {
        this.dm.emit(rs, 'Stepped', this.t, dt);
        this.dm.emit(rs, 'Heartbeat', dt);
      }
      this.anims.step(dt, (inst, ev, arg) => this.dm.emit(inst, ev, arg));
      this.updateChars(dt);
      this.handleExplosions();
      this.physics.step(dt);
      this.handleTouches();
      this.dm.services.get('Workspace').props.set('DistributedGameTime', this.t);
      if (this.frame % 2 === 0) this._ph = this.collectPhys();
      this.replicator.flush((client, msg) => this.physExtras(client, msg));
    } catch (e) {
      this.log('error', 'tick: ' + (e.stack || e.message));
    }
  }
}

function flat(cf) {
  return cf.map((v) => Math.round(v * 1e4) / 1e4);
}
