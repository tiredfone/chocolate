import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import RAPIER from '@dimforge/rapier3d-compat';
import { Lua } from 'wasmoon-lua5.1';
import { parsePlace } from '../shared/rbxl.js';
import { DataModel } from '../shared/instance.js';
import { ScriptHost, T, wireArgs, unwireArgs } from '../shared/luahost.js';
import { Core2018 } from '../shared/core2018.js';
import { FLAGS_2018 } from '../shared/api2018.js';
import { Physics } from '../shared/physics.js';
import * as C from '../shared/cframe.js';
import { buildCharacter, buildR15, attachAccessory, gripWeld, gripArm, syncGrip, liveCharacterOf, withHumanoidMemo, Rig, Controller, CharacterProxy, partColorProps, STATES, rootOf, applyLimbAngles } from '../shared/humanoid.js';
import { Replicator } from './replicator.js';
import { Animations, animAssetId } from '../shared/animator.js';
import { placeBytes, assetNodes, appearance, luaSource, assetBytes, assetIdOf } from './assets.js';
import { endpoint, config } from './config.js';
import { social, report } from './social.js';
import { meshDataFromAsset } from '../shared/csg.js';
import { PlayerData } from './persistence.js';
import { DEBUG_LUA, DebugAgent } from '../shared/debugger.js';
import { writeModel } from '../shared/rbxlx.js';
import { terrainOf } from '../shared/terrain.js';

const HUM_STATE = [8, 8, 3, 5, 13, 12, 15, 14, 4];

const HERE = path.dirname(fileURLToPath(import.meta.url));
const RUNTIME = fs.readFileSync(path.join(HERE, '../shared/runtime.lua'), 'utf8');
let era2018 = null;
function load2018() {
  if (!era2018) {
    era2018 = {
      runtime: fs.readFileSync(path.join(HERE, '../shared/runtime2018.lua'), 'utf8'),
      bundle: JSON.parse(fs.readFileSync(path.join(HERE, '../corescripts2018/bundle.json'), 'utf8')),
      character: [],
      characterR15: [],
      r15: null,
    };
    try {
      era2018.r15 = parsePlace(fs.readFileSync(path.join(HERE, '../content2018/avatar/characterR15V2.rbxm')))[0] || null;
    } catch {}
    for (const [dir, file, only] of [['content2018/avatar/scripts', 'humanoidAnimateLocalKeyframe.rbxm', null], ['content/fonts', 'humanoidHealth.rbxm', 'Health']]) {
      try {
        for (const n of parsePlace(fs.readFileSync(path.join(HERE, '..', dir, file)))) {
          if (only && n.props.get('Name')?.v !== only) continue;
          era2018.character.push(n);
          if (n.props.get('Name')?.v !== 'Animate') era2018.characterR15.push(n);
        }
      } catch {}
    }
    try {
      for (const n of parsePlace(fs.readFileSync(path.join(HERE, '../content2018/avatar/scripts/humanoidAnimateR15.rbxm')))) era2018.characterR15.push(n);
    } catch {}
  }
  return era2018;
}
const TICK = 1 / 30;
const ASSEMBLY_MIN = 8;
const PRELOAD_ANIMS = new Set(['idle', 'walk', 'run', 'jump', 'fall', 'climb', 'sit', 'toolnone']);
const MAX_CHAT = 200;
const SERVER_LIBRARIES = { RbxGui: 45284430, RbxGear: 45374389, RbxUtility: 60595411, RbxStamper: 73157242 };
const luaCache = new Map();

function luaAsset(id) {
  return luaCache.get(id | 0) || null;
}

const CHARACTER_SCRIPTS = [['humanoidAnimateLocal', null], ['humanoidSound', null], ['humanoidHealth', null]];
let characterScripts = null;

function loadCharacterScripts() {
  if (characterScripts) return characterScripts;
  characterScripts = [];
  for (const [file, only] of CHARACTER_SCRIPTS) {
    try {
      const nodes = parsePlace(fs.readFileSync(path.join(HERE, '../content/fonts', file + '.rbxm')));
      for (const n of nodes) {
        if (only && n.props.get('Name')?.v !== only) continue;
        for (const g of n.children) {
          if (g.props.get('Name')?.v !== 'HealthGUI') continue;
          for (const t of g.children) if (t.props.get('Name')?.v === 'Tray') t.props.set('Visible', { t: 'bool', v: false, tag: 'bool' });
        }
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

const CHARACTER_MASS = 9.8;

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
    this.placeData = io.placeData || null;
    this.privateId = io.privateId || 0;
    this.allowGear = io.allowGear !== false;
    this.era = io.era === 2018 ? 2018 : 2012;
    this.io = io;
    this.dm = new DataModel('server');
    this.dm.era = this.era;
    this.invokes = new Map();
    this.invokeSeq = 1;
    this.clients = new Map();
    this.chars = new Map();
    this.mice = new Map();
    this.toolMice = new Map();
    this.store = new Map();
    this.playerData = new PlayerData(config.dataStoreDir, placeId, (k, m) => this.log(k, m));
    this.playerData.keep = (uid) => [...this.clients.values()].some((c) => c.user.id === uid);
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

  runCode(source, by) {
    const dm = this.dm;
    const sss = dm.service('ServerScriptService');
    const sc = dm.create('Script', null);
    sc.props.set('Name', 'ServerCode');
    sc.props.set('Source', source);
    this.log('print', `Running server code from ${by || 'a developer'}`);
    dm.setParent(sc, sss);
  }

  async start() {
    if (!rapierReady) rapierReady = RAPIER.init();
    await Promise.all([rapierReady, preloadLibraries()]);
    const dm = this.dm;
    for (const s of ['Workspace', 'Players', 'Lighting', 'StarterGui', 'StarterPack', 'Teams', 'SoundService', 'Debris', 'ReplicatedStorage', 'ServerStorage', 'ServerScriptService', 'InsertService', 'RunService', 'BadgeService', 'Chat']) dm.service(s);
    const bytes = this.placeData ? this.placeData : await placeBytes(this.placeId);
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
      unionMesh: (url) => {
        const id = assetIdOf(url);
        return id ? assetBytes(id).then(meshDataFromAsset).catch(() => null) : null;
      },
    });
    withHumanoidMemo(() => this.physics.attachWorkspace(ws));
    this.physics.onBoardState = (board, state, old) => {
      this.dm.emit(board, 'MoveStateChanged', T.e('MoveState', state), T.e('MoveState', old));
    };
    this.replicator = new Replicator(dm);
    dm.observe({
      reparented: (inst) => this.scanCharacters(inst),
      changed: (inst, name, old, opts) => this.watchChange(inst, name, old, opts),
      destroyed: (inst) => {
        if (this.chars.has(inst)) this.dropChar(inst);
      },
    });
    if (this.era === 2018) this.prepare2018();
    this.setupTerrain();
    this.host = new ScriptHost(dm, this.env());
    this.anims = new Animations(dm, (id) => this.host.env.loadAsset(id));
    for (const [name, id] of Object.entries(SERVER_LIBRARIES)) this.host.libraries.set(name, String(id));
    if (this.era === 2018) this.host.flags = FLAGS_2018;
    this.unimplTimer = setInterval(() => this.flushUnimplemented(), 60000);
    if (this.unimplTimer.unref) this.unimplTimer.unref();
    await this.host.init(() => Lua.create(), RUNTIME, [...(this.era === 2018 ? [{ source: load2018().runtime, name: 'runtime2018' }] : []), ...(this.kind === 'test' ? [{ source: DEBUG_LUA, name: 'debug' }] : [])]);
    if (this.kind === 'test' && this.io.debug) {
      this.debugger = new DebugAgent(this.host, (info) => this.io.debug(info));
      const init = this.io.debugInit;
      if (init) {
        this.debugger.handle({ cmd: 'bps', bps: init.bps });
        this.debugger.handle({ cmd: 'watches', watches: init.watches });
      }
    }
    if (this.era === 2018) this.core.starterScript(dm.service('ScriptContext'), true);
    for (const d of ws.descendants()) if (d.ClassName === 'Model' && d.findChildOfClass('Humanoid')) this.trackChar(d);
    for (let i = 0; i < 3; i++) this.host.tick(this.t);
    this.running = true;
    this.t0 = performance.now();
    this.nextTick = performance.now() + TICK * 1000;
    this.loop = setInterval(() => {
      const now = performance.now();
      if (now - this.nextTick > TICK * 4000) this.nextTick = now;
      let n = 0;
      while (this.running && now >= this.nextTick - 1 && n < 3) {
        this.nextTick += TICK * 1000;
        n++;
        this.tick();
      }
    }, 8);
    const begin = performance.now();
    while (performance.now() - begin < 15000) {
      const quiet = performance.now() - Math.max(begin, this.lastLoadChange || 0);
      if (!(this.pendingLoads > 0) && !(this.physics && this.physics.unionWaiting.size) && quiet >= 500) break;
      await new Promise((r) => setTimeout(r, 50));
    }
  }

  setupTerrain() {
    const dm = this.dm;
    const ws = dm.services.get('Workspace');
    let t = ws.findChildOfClass('Terrain');
    if (!t) {
      t = dm.create('Terrain', null);
      t.props.set('Name', 'Terrain');
      t.props.set('Anchored', true);
      t.props.set('Locked', true);
      dm.setParent(t, ws);
    }
    this.terrain = terrainOf(t, this.era);
    this.terrain.takeDirty();
    this.physics.setTerrain(t, this.terrain);
    this.terrain.listeners.add((keys) => this.broadcast({ t: 'terrain', d: this.terrain.encode(keys) }));
  }

  prepare2018() {
    const dm = this.dm;
    for (const s of ['StarterPlayer', 'RobloxReplicatedStorage', 'ReplicatedFirst', 'TweenService', 'TextService', 'LocalizationService', 'HttpService', 'MarketplaceService', 'CollectionService']) dm.service(s);
    const ws = dm.services.get('Workspace');
    if (!ws.findChildOfClass('Terrain')) {
      const t = dm.create('Terrain', null);
      t.props.set('Name', 'Terrain');
      t.props.set('Anchored', true);
      t.props.set('Locked', true);
      dm.setParent(t, ws);
    }
    this.core = new Core2018(dm, load2018().bundle);
    const rg = dm.create('ScreenGui', null);
    rg.props.set('Name', 'RobloxGui');
    dm.setParent(rg, dm.service('CoreGui'));
    this.core.buildModules(rg);
    this.core.installPlayerScripts(dm.services.get('StarterPlayer'));
  }

  dataStoreApi() {
    const dir = String(config.dataStoreDir || '');
    const file = dir ? path.join(dir, `${this.placeId | 0}.json`) : null;
    let data = {};
    if (file) {
      try {
        data = JSON.parse(fs.readFileSync(file, 'utf8')) || {};
      } catch {}
    }
    let timer = null;
    const save = () => {
      if (!file || timer) return;
      timer = setTimeout(() => {
        timer = null;
        try {
          fs.mkdirSync(dir, { recursive: true });
          fs.writeFileSync(file + '.tmp', JSON.stringify(data));
          fs.renameSync(file + '.tmp', file);
        } catch (e) {
          this.log('warn', 'DataStore save failed: ' + e.message);
        }
      }, 2000);
    };
    return {
      get: (store, key) => (data[store] && Object.prototype.hasOwnProperty.call(data[store], key) ? data[store][key] : null),
      set: (store, key, v) => {
        if (!data[store]) data[store] = {};
        if (v == null) delete data[store][key];
        else data[store][key] = v;
        save();
      },
      entries: (store) => Object.entries(data[store] || {}),
    };
  }

  applyStarterPlayer(player) {
    const sp = this.dm.services.get('StarterPlayer');
    if (!sp) return;
    const map = [
      ['CameraMaxZoomDistance', 'CameraMaxZoomDistance'], ['CameraMinZoomDistance', 'CameraMinZoomDistance'], ['CameraMode', 'CameraMode'],
      ['DevCameraOcclusionMode', 'DevCameraOcclusionMode'], ['DevComputerCameraMovementMode', 'DevComputerCameraMode'], ['DevComputerMovementMode', 'DevComputerMovementMode'],
      ['DevTouchCameraMovementMode', 'DevTouchCameraMode'], ['DevTouchMovementMode', 'DevTouchMovementMode'], ['EnableMouseLockOption', 'DevEnableMouseLock'],
      ['HealthDisplayDistance', 'HealthDisplayDistance'], ['NameDisplayDistance', 'NameDisplayDistance'], ['AutoJumpEnabled', 'AutoJumpEnabled'],
    ];
    for (const [from, to] of map) {
      if (!sp.info.all.has(from) || !player.info.all.has(to)) continue;
      const v = sp.props.get(from);
      if (v !== undefined && v !== null) player.props.set(to, v);
    }
    if (sp.info.all.has('LoadCharacterAppearance') && player.info.all.has('CanLoadCharacterAppearance')) player.props.set('CanLoadCharacterAppearance', sp.props.get('LoadCharacterAppearance') !== false);
  }

  copyPlayerScripts(player) {
    const sp = this.dm.services.get('StarterPlayer');
    const sps = sp && sp.findChildOfClass('StarterPlayerScripts');
    let ps = player.findChildOfClass('PlayerScripts');
    if (!ps) {
      ps = this.dm.create('PlayerScripts', null);
      ps.props.set('Name', 'PlayerScripts');
      for (const o of this.dm.observers) if (o.created) o.created(ps);
      this.dm.setParent(ps, player);
    }
    if (!sps) return;
    for (const c of sps.children) {
      const k = this.cloneAlways(c);
      if (k) this.dm.setParent(k, ps);
    }
  }

  cloneAlways(inst) {
    const was = inst.props.get('Archivable');
    inst.props.set('Archivable', true);
    const k = this.dm.clone(inst);
    inst.props.set('Archivable', was);
    if (k) k.props.set('Archivable', was);
    return k;
  }

  stop() {
    this.running = false;
    clearInterval(this.loop);
    clearInterval(this.unimplTimer);
    this.flushUnimplemented();
  }

  noteUnimplemented(kind, name, side) {
    if (this.kind === 'test' || !/^(method|class|service)$/.test(kind)) return;
    if (!this.unimpl) this.unimpl = new Map();
    const key = `${kind}|${name}|${side}`;
    const e = this.unimpl.get(key);
    if (e) {
      e.count++;
      return;
    }
    if (this.unimpl.size >= 200) return;
    this.unimpl.set(key, { kind, name: String(name).slice(0, 120), side, count: 1 });
  }

  flushUnimplemented() {
    if (!this.unimpl || !this.unimpl.size) return;
    const items = [...this.unimpl.values()];
    this.unimpl.clear();
    social('unimplemented', { placeId: this.placeId | 0, era: this.era | 0, items }).catch(() => {});
  }

  async close() {
    if (this.running && this.host && this.host.closeBound) {
      this.dm.emit(this.dm.root, '__Close');
      await new Promise((r) => setTimeout(r, 2500));
    }
    this.playerData.flushAll();
    this.stop();
  }

  env() {
    const dm = this.dm;
    return {
      log: (k, m, w) => this.log(k, m, w),
      unimplemented: (kind, name) => this.noteUnimplemented(kind, name, 'server'),
      thumbnailUrl: (id, kind) => (kind === 'avatar' && endpoint('avatarThumbnail', id)) || endpoint('thumbnail', id) || '',
      placeThumbnailUrl: (id) => endpoint('placeThumbnail', id) || '',
      coreSource: (id) => luaAsset(id),
      raycast: (o, d, ig) => this.physics.raycast(o, d, ig),
      breakJoints: (p) => this.physics.breakJoints(p),
      boardImpulse: (b, v) => this.physics.boardImpulse(b, v),
      makeJoints: (ps) => this.physics.makeJoints(ps),
      connectedParts: (p) => this.physics.connectedParts(p),
      touchingParts: (p) => this.physics.touchingParts(p),
      rootPart: (p) => this.physics.rootPart(p),
      loadCharacter: (pl) => this.loadCharacter(pl),
      loadAsset: async (id) => {
        this.pendingLoads = (this.pendingLoads || 0) + 1;
        this.lastLoadChange = performance.now();
        let nodes;
        try {
          nodes = await assetNodes(id);
        } finally {
          this.pendingLoads--;
          this.lastLoadChange = performance.now();
        }
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
      dataStore: this.dataStoreApi(),
      addCoreScriptLocal: (name, parent) => { if (this.core) this.core.coreScript(name, parent || dm.service('ScriptContext')); },
      remote: (r, op, raw) => {
        if (op === 'fc') {
          const pl = raw[0] && raw[0].v;
          const c = pl && pl.ClassName === 'Player' ? this.clientOf(pl) : null;
          if (c && c.ready) this.io.send(c.cid, JSON.stringify({ t: 're', id: r.id, a: wireArgs(raw.slice(1)) }));
        } else if (op === 'fa') {
          const msg = JSON.stringify({ t: 're', id: r.id, a: wireArgs(raw) });
          for (const c of this.clients.values()) if (c.ready) this.io.send(c.cid, msg);
        }
      },
      invoke: (r, pl, raw) => {
        const c = pl && pl.ClassName === 'Player' ? this.clientOf(pl) : null;
        if (!c || !c.ready) return Promise.resolve([false, 'Player is not in the game']);
        const k = this.invokeSeq++;
        return new Promise((resolve) => {
          const timer = setTimeout(() => {
            this.invokes.delete(k);
            resolve([false, 'InvokeClient timed out']);
          }, 30000);
          this.invokes.set(k, { cid: c.cid, resolve, timer, out: true });
          this.io.send(c.cid, JSON.stringify({ t: 'rfc', id: r.id, k, a: wireArgs(raw) }));
        });
      },
      invokeResult: (r, token, raw) => {
        const p = this.invokes.get(token | 0);
        if (!p || p.out) return;
        this.invokes.delete(token | 0);
        this.io.send(p.cid, JSON.stringify({ t: 'rfr', k: p.k, a: wireArgs(raw) }));
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
      productInfoAsync: (id, kind) => this.productInfo(id, kind),
      ownsAsset: async (uid, id) => {
        if (!(uid > 0) || !(id > 0)) return false;
        const r = await social('ownsAsset', { userId: uid, assetId: id });
        return !!(r && r.owns);
      },
      prompt: (pl, kind, id, equip) => {
        const c = pl && pl.ClassName === 'Player' ? this.clientOf(pl) : null;
        if (c && id > 0) this.io.send(c.cid, JSON.stringify({ t: 'prompt', kind, id, equip: !!equip }));
      },
      receiptResult: (token, result) => {
        const w = this.receiptWaits && this.receiptWaits.get(token | 0);
        if (w) {
          this.receiptWaits.delete(token | 0);
          w(String(result || ''));
        }
      },
      teleport: (placeId, pl) => {
        const c = pl && this.clientOf(pl);
        if (c && placeId > 0) this.io.send(c.cid, JSON.stringify({ t: 'teleport', place: placeId | 0 }));
      },
      saveData: async (pl, k, kind, v) => {
        const uid = pl.props.get('userId') | 0;
        if (uid <= 0) return;
        const val = kind === 'n' ? (Number.isFinite(+v) ? +v : 0) : kind === 'b' ? !!v : v == null ? '' : String(v);
        await this.playerData.set(uid, kind, k, val);
        if (!pl.destroyed) dm.setProp(pl, 'DataComplexity', this.playerData.complexity(uid));
      },
      loadData: async (pl, k, kind) => {
        const uid = pl.props.get('userId') | 0;
        return uid > 0 ? this.playerData.get(uid, kind, k) : null;
      },
      waitForData: async (pl) => {
        const uid = pl.props.get('userId') | 0;
        if (uid > 0) await this.playerData.load(uid);
        return true;
      },
      saveInstance: async (pl, k, inst) => {
        const uid = pl.props.get('userId') | 0;
        if (uid <= 0) return;
        const xml = inst && !inst.destroyed ? writeModel(dm, [inst]) : null;
        await this.playerData.set(uid, 'i', k, xml);
      },
      loadInstance: async (pl, k) => {
        const uid = pl.props.get('userId') | 0;
        const xml = uid > 0 ? await this.playerData.get(uid, 'i', k) : null;
        if (!xml) return null;
        const made = dm.load(parsePlace(String(xml)), null);
        const top = made.find((m) => !m.parent) || null;
        for (const m of made) if (!m.parent && m !== top) dm.destroy(m, true);
        return top;
      },
      bubbleChat: (part, msg, color) => {
        const owner = part && part.parent ? this.playerOfChar(part.parent) : null;
        if (owner) this.noteChat(owner.props.get('Name'), cleanText(msg, MAX_CHAT));
        if (part && part.isA('BasePart')) this.broadcast({ t: 'bubble', id: part.id, m: cleanText(msg, MAX_CHAT), c: (typeof color === 'number' ? color : color && color.value) | 0 });
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
      animTrack: (t) => this.anims.trackOf(t),
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

  noteChat(name, msg) {
    if (!this.chatLog) this.chatLog = [];
    this.chatLog.push(`${name}: ${msg}`.slice(0, 200));
    if (this.chatLog.length > 40) this.chatLog.shift();
  }

  broadcast(obj, except) {
    const s = JSON.stringify(obj);
    for (const c of this.clients.values()) if (c.ready && c !== except) this.io.send(c.cid, s);
  }

  productInfo(id, kind) {
    if (!(id > 0)) return Promise.resolve(null);
    if (!this.infoCache) this.infoCache = new Map();
    const key = kind + ':' + id;
    const hit = this.infoCache.get(key);
    if (hit && Date.now() - hit.at < 30000) return hit.p;
    const p = social('productInfo', { kind, id }).then((r) => (r && r.info) || null);
    this.infoCache.set(key, { at: Date.now(), p });
    if (this.infoCache.size > 500) this.infoCache.delete(this.infoCache.keys().next().value);
    return p;
  }

  async marketRequest(c, m) {
    const uid = c.user.id | 0;
    const id = Math.max(0, Math.floor(+m.id || 0));
    if (m.op === 'info') return { info: await this.productInfo(id, ['asset', 'gamepass', 'product'].includes(m.kind) ? m.kind : 'asset') };
    if (m.op === 'owns') {
      const who = Math.floor(+m.uid || 0);
      if (!(who > 0) || !(id > 0)) return { owns: false };
      const r = await social('ownsAsset', { userId: who, assetId: id });
      return { owns: !!(r && r.owns) };
    }
    if (m.op === 'balance') {
      const r = await social('balance', { userId: uid });
      return { robux: r ? r.robux | 0 : 0 };
    }
    if (m.op === 'buy') {
      const kind = m.kind === 'product' ? 'product' : 'asset';
      const r = await social('purchase', { userId: uid, placeId: this.placeId, kind, id, price: Math.floor(+m.price || 0) });
      const out = { success: !!(r && r.success), status: String((r && r.status) || 'Error') };
      if (out.success || out.status === 'AlreadyOwned') {
        if (!c.bought) c.bought = new Set();
        c.bought.add(kind + ':' + id);
        if (this.infoCache) this.infoCache.delete('asset:' + id);
      }
      if (out.success && kind === 'product') {
        out.receipt = String(r.receipt);
        setTimeout(() => {
          this.io.send(c.cid, JSON.stringify({ t: 'pver', receipt: out.receipt, product: id }));
          this.processReceipts(c).catch(() => {});
        }, 0);
      }
      if (out.success) this.log('print', `${c.user.name} bought ${kind} ${id} for ${r.price | 0} Robux`);
      return out;
    }
    return null;
  }

  async processReceipts(c) {
    if (this.era !== 2018 || c.receiptBusy || !this.clients.has(c.cid)) return;
    c.receiptBusy = true;
    let retry = false;
    try {
      const r = await social('pendingReceipts', { userId: c.user.id, placeId: this.placeId });
      const list = r && Array.isArray(r.receipts) ? r.receipts : [];
      const mps = this.dm.service('MarketplaceService');
      for (const rc of list) {
        if (!this.clients.has(c.cid)) break;
        if (!this.receiptWaits) this.receiptWaits = new Map();
        const token = this.invokeSeq++;
        const result = await new Promise((resolve) => {
          const timer = setTimeout(() => {
            this.receiptWaits.delete(token);
            resolve('Timeout');
          }, 60000);
          this.receiptWaits.set(token, (v) => {
            clearTimeout(timer);
            resolve(v);
          });
          this.dm.emit(mps, '__Receipt', token, T.dict({
            PlayerId: c.user.id, PlaceIdWherePurchased: this.placeId, PurchaseId: String(rc.id), ProductId: rc.productId | 0,
            CurrencyType: T.e('CurrencyType', 1), CurrencySpent: rc.robux | 0,
          }));
        });
        if (/PurchaseGranted$/.test(result)) await social('grantReceipt', { receiptId: rc.id, userId: c.user.id, placeId: this.placeId });
        else if (result === 'NoHandler') break;
        else retry = true;
      }
    } finally {
      c.receiptBusy = false;
    }
    if (retry && this.clients.has(c.cid)) setTimeout(() => this.processReceipts(c).catch(() => {}), 30000);
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
    player.props.set('DataReady', false);
    player.props.set('DataComplexityLimit', 45000);
    player.data = Object.assign(player.data || {}, { avatarType: user.avatarType === 'R15' ? 'R15' : 'R6', scale: user.scale || null, gearGenres: Array.isArray(user.gearGenres) ? user.gearGenres : [], gearMap: user.gearMap || {}, animations: Array.isArray(user.animations) ? user.animations : [] });
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
    if (this.era === 2018) {
      this.applyStarterPlayer(player);
      this.copyPlayerScripts(player);
    }
    const client = { cid, user, player, ready: false, seq: 0, lastChat: 0, dev: !!user.dev, remoteT: 0, remoteN: 0 };
    this.clients.set(cid, client);
    this.replicator.addClient(cid, player, (s) => this.io.send(cid, s));
    const netRep = dm.create('ServerReplicator', null);
    netRep.props.set('Name', 'ServerReplicator');
    netRep.data = Object.assign(netRep.data || {}, { player });
    client.netRep = netRep;
    dm.setParent(netRep, dm.service('NetworkServer'));
    dm.setParent(player, players);
    this.copyStarterGui(player);
    const rc = this.replicator.clients.get(cid);
    const snap = this.replicator.snapshotFor(rc);
    const r15Player = !!(player.data && player.data.avatarType === 'R15');
    const anims = this.era === 2018 ? [...new Set([...(r15Player ? player.data.animations || [] : []), ...this.preloadAnims(r15Player)])].slice(0, 32) : [];
    this.io.send(cid, JSON.stringify({ t: 'init', place: this.placeId, era: this.era, you: player.id, user: { id: user.id, name: user.name }, snap, asm: this.assemblySnapshot(), anims, terrain: this.terrain && this.terrain.chunks.size ? this.terrain.encode() : null }));
    rc.ready = true;
    client.ready = true;
    if (client.dev && this.outHistory) for (const line of this.outHistory) this.io.send(cid, line);
    for (const s of this.anims.snapshot()) this.io.send(cid, JSON.stringify({ t: 'anim', op: 'play', ...s }));
    this.playerData.load(user.id).then(() => {
      if (player.destroyed) return;
      dm.setProp(player, 'DataComplexity', this.playerData.complexity(user.id));
      dm.setProp(player, 'DataReady', true);
    }).catch(() => {});
    dm.emit(players, 'PlayerAdded', player);
    this.broadcast({ t: 'sys', m: `${user.name} has joined the game.` });
    if (this.era === 2018) setTimeout(() => this.processReceipts(client).catch(() => {}), 8000);
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
    if (c.netRep && !c.netRep.destroyed) this.dm.destroy(c.netRep);
    const pl = c.player;
    const players = this.dm.services.get('Players');
    this.dm.emit(players, 'PlayerRemoving', pl);
    const ch = pl.props.get('Character');
    if (ch && !ch.destroyed) this.dm.destroy(ch);
    if (!pl.destroyed) {
      if (pl.parent) this.dm.setParent(pl, null);
      setTimeout(() => {
        if (!pl.destroyed) this.dm.destroy(pl);
      }, 10000);
    }
    this.mice.delete(pl);
    this.toolMice.delete(pl);
    this.playerData.release(c.user.id);
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

  preloadAnims(r15) {
    const ids = new Set();
    const scan = (animate, nodeStyle) => {
      const kids = (n) => (nodeStyle ? n.children || [] : n.children);
      const name = (n) => (nodeStyle ? n.props.get('Name')?.v ?? n.props.get('Name') : n.props.get('Name'));
      const cls = (n) => (nodeStyle ? n.cls || n.ClassName : n.ClassName);
      for (const sv of kids(animate)) {
        if (!PRELOAD_ANIMS.has(String(name(sv)).toLowerCase())) continue;
        for (const a of kids(sv)) {
          if (cls(a) !== 'Animation') continue;
          const raw = a.props.get('AnimationId');
          const id = assetIdOf(String(raw && typeof raw === 'object' && 'v' in raw ? raw.v : raw || ''));
          if (id) ids.add(id);
        }
      }
    };
    const set = r15 ? load2018().characterR15 : load2018().character;
    for (const n of set) {
      const nm = n.props.get('Name');
      if ((nm && nm.v !== undefined ? nm.v : nm) === 'Animate') scan(n, true);
    }
    const sp = this.dm.services.get('StarterPlayer');
    const scs = sp && sp.findChildOfClass('StarterCharacterScripts');
    const own = scs && scs.findChild('Animate');
    if (own) scan(own, false);
    return [...ids].slice(0, 24);
  }

  async loadCharacter(player) {
    if (player.destroyed || !player.parent) return;
    const dm = this.dm;
    const old = player.props.get('Character');
    if (old && !old.destroyed) dm.destroy(old);
    const uid = player.props.get('userId');
    const starter = this.era === 2018 ? dm.services.get('StarterPlayer') : null;
    const custom = starter && starter.children.find((c) => c.ClassName === 'Model' && c.props.get('Name') === 'StarterCharacter' && c.findChildOfClass('Humanoid'));
    const skipLook = !!custom || (player.info.all.has('CanLoadCharacterAppearance') && player.props.get('CanLoadCharacterAppearance') === false);
    const look = skipLook ? { colors: null, assets: [], gear: [] } : await appearance(uid).catch(() => ({ colors: null, assets: [], gear: [] }));
    const nodeCache = new Map();
    const nodesOf = (id) => {
      if (!nodeCache.has(id)) nodeCache.set(id, assetNodes(id).catch((e) => {
        this.log('warn', `appearance asset ${id}: ${e.message}`);
        return null;
      }));
      return nodeCache.get(id);
    };
    if (player.destroyed || !player.parent) return;
    const { pos, spawn } = this.spawnPoint(player);
    const r15 = !custom && this.era === 2018 && player.data && player.data.avatarType === 'R15' && load2018().r15;
    const animOverrides = new Map();
    let built;
    if (custom) {
      const m = this.cloneAlways(custom);
      m.props.set('Name', player.props.get('Name'));
      built = { model: m, humanoid: m.findChildOfClass('Humanoid') };
      const root = rootOf(m);
      if (root) {
        const cf = root.props.get('CFrame');
        const off = [pos[0] - cf[0], pos[1] - cf[1], pos[2] - cf[2]];
        for (const d of m.descendants()) if (d.isA('BasePart')) {
          const c = d.props.get('CFrame').slice();
          c[0] += off[0]; c[1] += off[1]; c[2] += off[2];
          d.props.set('CFrame', c);
        }
      }
    } else {
      let pkgFolder = null;
      if (r15) {
        for (const id of look.assets) {
          const ns = await nodesOf(id);
          const anim = ns && ns.find((n) => n.cls === 'Folder' && n.props.get('Name')?.v === 'R15Anim');
          if (anim) for (const sv of anim.children) if (sv.cls === 'StringValue') animOverrides.set(sv.props.get('Name')?.v, sv);
          const f = ns && ns.find((n) => n.cls === 'Folder' && n.props.get('Name')?.v === 'R15ArtistIntent');
          if (!f) continue;
          const loaded = dm.load([f], null).find((m) => !m.parent) || null;
          if (!loaded) continue;
          if (!pkgFolder) {
            pkgFolder = loaded;
            continue;
          }
          for (const ch of [...loaded.children]) {
            const old = pkgFolder.findChild(ch.props.get('Name'));
            if (old) dm.destroy(old, true);
            dm.setParent(ch, pkgFolder);
          }
          dm.destroy(loaded, true);
        }
        if (player.destroyed || !player.parent) {
          if (pkgFolder) dm.destroy(pkgFolder, true);
          return;
        }
      }
      built = r15 ? buildR15(dm, load2018().r15, player.props.get('Name'), pos, player.data.scale, pkgFolder ? pkgFolder.children : null) : buildCharacter(dm, player.props.get('Name'), pos, { rootPart: this.era === 2018 });
      if (pkgFolder) dm.destroy(pkgFolder, true);
    }
    const { model, humanoid } = built;
    for (const n of this.era === 2018 ? (r15 ? load2018().characterR15 : load2018().character) : loadCharacterScripts()) {
      const nm = n.props.get('Name');
      if (custom && model.findChild(nm && nm.v !== undefined ? nm.v : nm)) continue;
      dm.load([n], model);
    }
    const sh = starter && starter.children.find((c) => c.ClassName === 'Humanoid' && c.props.get('Name') === 'StarterHumanoid');
    if (sh && humanoid && !custom) {
      for (const [k, v] of sh.props) {
        if (k === 'Name' || k === 'Health' || k === 'HipHeight' && r15 || !humanoid.info.all.has(k)) continue;
        humanoid.props.set(k, Array.isArray(v) ? v.slice() : v);
      }
      if (humanoid.info.all.has('Health')) humanoid.props.set('Health', humanoid.props.get('MaxHealth'));
    }
    if (this.era === 2018) {
      const animate = animOverrides.size && model.findChild('Animate');
      if (animate) for (const [slot, sv] of animOverrides) {
        const target = slot && animate.findChild(slot);
        if (!target || !sv.children.length) continue;
        for (const old of [...target.children]) dm.destroy(old, true);
        dm.load(sv.children, target);
      }
      const scs = dm.services.get('StarterPlayer') && dm.services.get('StarterPlayer').findChildOfClass('StarterCharacterScripts');
      if (scs) for (const c of scs.children) {
        if (model.findChild(c.props.get('Name'))) dm.destroy(model.findChild(c.props.get('Name')));
        const k = this.cloneAlways(c);
        if (k) dm.setParent(k, model);
      }
    }
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
        const all = await nodesOf(id);
        const nodes = all && (r15 ? all : all.filter((n) => !(n.cls === 'Folder' && /^R15/i.test(String(n.props.get('Name')?.v ?? '')))));
        if (!nodes || !nodes.length) continue;
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
    const torso = rootOf(model);
    const lookAt = spawn ? C.lookVector(spawn.props.get('CFrame')) : [0, 0, -1];
    const yaw = C.lookAt(0, 0, 0, lookAt[0], 0, lookAt[2]);
    const rig = new Rig(model);
    const rootY = r15 ? torso.props.get('CFrame')[1] : pos[1];
    rig.pose(C.withPos(yaw, pos[0], rootY, pos[2]), (p, cf) => p.props.set('CFrame', cf));
    const bp = player.findChildOfClass('Backpack');
    if (bp) {
      for (const c of [...bp.children]) dm.destroy(c);
      const sp = dm.services.get('StarterPack');
      for (const c of sp.children) {
        const k = dm.clone(c);
        if (k) dm.setParent(k, bp);
      }
      for (const tpl of this.allowGear ? await this.gearFor(player, this.allowedGear(player, look.gear)) : []) {
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
      if (this.era === 2018) dm.emit(hum, 'StateChanged', T.e('HumanoidStateType', HUM_STATE[prev] ?? 8), T.e('HumanoidStateType', HUM_STATE[st] ?? 8));
    }
    const speed = st === STATES.walk || st === STATES.swim ? Math.hypot(rec.vel[0], rec.vel[2]) : 0;
    const running = speed > 0.5 ? Math.round(speed) : 0;
    if (st === STATES.swim) {
      if (running !== rec.lastSwim || prev !== st) {
        rec.lastSwim = running;
        dm.emit(hum, 'Swimming', running);
      }
    } else rec.lastSwim = undefined;
    if (st === STATES.swim) return;
    if (running !== rec.lastRunning) {
      rec.lastRunning = running;
      dm.emit(hum, 'Running', running);
    }
  }

  allowedGear(player, ids) {
    const d = player.data || {};
    const allowed = d.gearGenres || [];
    if (!allowed.length) return ids || [];
    const map = d.gearMap || {};
    return (ids || []).filter((id) => {
      const g = map[String(id)];
      return Array.isArray(g) && g.some((x) => allowed.includes(x));
    });
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
    } else if (inst.ClassName === 'Folder' && /^R15/i.test(String(inst.props.get('Name') || ''))) {
      dm.destroy(inst, true);
    } else if (inst.ClassName === 'CharacterMesh' && model.findChild('UpperTorso')) {
      dm.destroy(inst, true);
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
    const torso = rootOf(model);
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
        const torso = rootOf(model);
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
      if (hum.props.get('Health') <= 0 || !this.neckOK(rec) || !rootOf(model)) {
        this.die(rec);
        continue;
      }
      if (rec.torsoCF[1] < destroyY) {
        this.dm.setProp(hum, 'Health', 0);
        this.die(rec);
        continue;
      }
      if (rec.owner) {
        if (!rec.seat && (rec.state === STATES.idle || rec.state === STATES.walk || rec.state === STATES.stand)) this.physics.setLoad(model, rec.torsoCF, CHARACTER_MASS);
        else this.physics.clearLoad(model);
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
        const prev = rec.state;
        rec.torsoCF = r.cf;
        rec.vel = r.vel;
        rec.state = r.state;
        this.humanoidEvents(rec, prev);
      }
      const poses = rec.rig.pose(rec.torsoCF);
      for (const [p, cf] of poses) this.dm.setProp(p, 'CFrame', cf, { physics: true });
      this.dm.setProp(rootOf(model), 'Velocity', rec.vel, { physics: true });
      rec.proxy.update(rec.torsoCF, poses);
      hum.data = hum.data || {};
      hum.data.state = rec.state;
    }
  }

  sitHeight(model, root) {
    const lower = model.findChild('LowerTorso');
    const leg = model.findChild('RightUpperLeg');
    const hip = leg && leg.findChild('RightHip');
    const c0 = hip && hip.props.get('C0');
    if (!lower || !leg || !c0 || !root) return 1;
    const rel = lower.props.get('CFrame')[1] - root.props.get('CFrame')[1] + c0[1];
    const h = -rel + (leg.props.get('Size')[0] || 1) / 2;
    return Math.max(0.3, Math.min(1.5, h));
  }

  sit(rec, seat) {
    if (rec.seat || rec.dead || seat.props.get('Disabled') || seat.props.get('Occupant')) return;
    const last = this.lastSit.get(rec.model) || 0;
    if (this.t - last < 1.2) return;
    const torso = rootOf(rec.model);
    const dm = this.dm;
    const w = dm.create('Weld', null);
    w.props.set('Name', 'SeatWeld');
    w.props.set('Part0', seat);
    w.props.set('Part1', torso);
    w.props.set('C0', C.cf(0, seat.props.get('Size')[1] / 2 + this.sitHeight(rec.model, torso), 0));
    w.props.set('C1', C.angles(0, 0, 0));
    for (const o of dm.observers) if (o.created) o.created(w);
    dm.setParent(w, seat);
    rec.seat = { seat, weld: w };
    if (rec.proxy) rec.proxy.setSeated(true);
    dm.setProp(rec.hum, 'Sit', true);
    dm.setProp(seat, 'Occupant', rec.hum);
    dm.emit(rec.hum, 'Seated', true, seat);
  }

  mountBoard(rec, board) {
    if (rec.seat || rec.dead || board.props.get('ControllingHumanoid')) return;
    const last = this.lastSit.get(rec.model) || 0;
    if (this.t - last < 1.2) return;
    const torso = rootOf(rec.model);
    if (!torso) return;
    const bcf = board.props.get('CFrame'), tcf = torso.props.get('CFrame');
    if (tcf[1] < bcf[1] + 1) return;
    const dm = this.dm;
    const r15 = !!rec.model.findChild('UpperTorso');
    const hip = r15 ? (+rec.hum.props.get('HipHeight') || 2) + (torso.props.get('Size')?.[1] || 2) / 2 : 3;
    const w = dm.create('Weld', null);
    w.props.set('Name', 'SeatWeld');
    w.props.set('Part0', board);
    w.props.set('Part1', torso);
    w.props.set('C0', C.cf(0, board.props.get('Size')[1] / 2 + hip, 0));
    w.props.set('C1', C.angles(0, 0, 0));
    for (const o of dm.observers) if (o.created) o.created(w);
    dm.setParent(w, board);
    const controller = dm.create('SkateboardController', null);
    controller.props.set('Name', 'SkateboardController');
    controller.data = { buttons: {} };
    for (const o of dm.observers) if (o.created) o.created(controller);
    dm.setParent(controller, board);
    rec.seat = { seat: board, weld: w, board: true, controller };
    if (rec.proxy) rec.proxy.setSeated(true);
    dm.setProp(rec.hum, 'PlatformStand', true);
    dm.setProp(board, 'ControllingHumanoid', rec.hum);
    dm.setProp(board, 'Controller', controller);
    dm.emit(board, 'equipped', rec.hum, controller);
    dm.emit(board, 'Equipped', rec.hum, controller);
  }

  unseat(rec) {
    if (!rec.seat) return;
    if (rec.seat.board) {
      const { seat: board, weld, controller } = rec.seat;
      rec.seat = null;
      if (rec.proxy) rec.proxy.setSeated(false);
      this.lastSit.set(rec.model, this.t);
      if (!weld.destroyed) this.dm.destroy(weld);
      if (!board.destroyed) {
        this.dm.setProp(board, 'Throttle', 0);
        this.dm.setProp(board, 'Steer', 0);
        this.dm.setProp(board, 'ControllingHumanoid', null);
        this.dm.setProp(board, 'Controller', null);
        this.dm.emit(board, 'unequipped', board);
        this.dm.emit(board, 'Unequipped', board);
      }
      if (controller && !controller.destroyed) this.dm.destroy(controller);
      if (!rec.hum.destroyed) this.dm.setProp(rec.hum, 'PlatformStand', false);
      rec.torsoCF = C.mul(rec.torsoCF, C.cf(0, 1.5, 0));
      rec.vel = [0, 20, 0];
      if (rec.owner) {
        rec.tpSeq++;
        const c = this.clientOf(rec.owner);
        if (c) c.tpPending = { t: 'tp', s: rec.tpSeq, c: flat(rec.torsoCF), v: [0, 25, 0] };
      } else if (rec.ctrl) rec.ctrl.teleport(rec.torsoCF);
      return;
    }
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

  sweepTouches(rec, from, to) {
    const dist = Math.hypot(to[0] - from[0], to[1] - from[1], to[2] - from[2]);
    if (dist < 1.2 || dist > 60) return;
    const R = this.physics.R;
    const torso = rootOf(rec.model);
    if (!torso) return;
    if (!this.sweepBox) this.sweepBox = new R.Cuboid(1, 2.5, 0.6);
    const q = C.toQuat(to);
    const rot = { x: q[0], y: q[1], z: q[2], w: q[3] };
    const steps = Math.ceil(dist / 0.8);
    const hit = new Set();
    for (let i = 1; i < steps; i++) {
      const k = i / steps;
      const at = { x: from[0] + (to[0] - from[0]) * k, y: from[1] + (to[1] - from[1]) * k - 0.5, z: from[2] + (to[2] - from[2]) * k };
      this.physics.world.intersectionsWithShape(at, rot, this.sweepBox, (c) => {
        const r = this.physics.byHandle.get(c.handle);
        if (r && r.part && r.touch && !r.character && !r.sensorOnly && !liveCharacterOf(r.part)) hit.add(r.part);
        return true;
      });
    }
    for (const part of hit) {
      if (part.destroyed || this.physics.touchingParts(part).some((o) => o.isDescendantOf(rec.model))) continue;
      this.pendingTouches.push([part, torso, true]);
      this.pendingTouches.push([part, torso, false]);
    }
  }

  handleTouches() {
    const list = this.pendingTouches;
    this.pendingTouches = [];
    if (!list.length) return false;
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
        if (part.ClassName === 'SkateboardPlatform' && !rec.seat) this.mountBoard(rec, part);
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
    return true;
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
    const arm = gripArm(model);
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

  remoteBudget(c) {
    const now = Date.now();
    if (now - c.remoteT > 1000) {
      c.remoteT = now;
      c.remoteN = 0;
    }
    return ++c.remoteN <= 400;
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
        const ja = finiteArr(m.j, 4);
        if (ja) {
          rec.netAngles = ja.map((a) => Math.max(-7, Math.min(7, Math.round(a * 1000) / 1000)));
          applyLimbAngles(rec.model, rec.netAngles);
        }
        const ws = rec.hum.props.get('WalkSpeed');
        const dt = Math.max(0.03, this.t - (rec.lastUpdate || this.t - 0.05));
        const dist = Math.hypot(cf[0] - rec.torsoCF[0], cf[2] - rec.torsoCF[2]);
        const dy = cf[1] - rec.torsoCF[1];
        if (dist > ws * 2.5 * dt + 6 || dy > 120 * dt + 8) {
          rec.tpSeq++;
          c.tpPending = { t: 'tp', s: rec.tpSeq, c: flat(rec.torsoCF) };
          return;
        }
        const was = rec.torsoCF;
        rec.torsoCF = C.orthonormalize(cf);
        this.sweepTouches(rec, was, rec.torsoCF);
        rec.vel = v;
        const prev = rec.state;
        rec.state = Math.max(0, Math.min(8, m.st | 0));
        rec.lastUpdate = this.t;
        if (rec.state === STATES.jump || rec.state === STATES.fall) rec.fallSpeed = Math.min(rec.fallSpeed || 0, v[1]);
        else if (prev === STATES.jump || prev === STATES.fall) {
          if ((rec.fallSpeed || 0) < -5) this.physics.addImpact(rec.model, rec.torsoCF, CHARACTER_MASS * -rec.fallSpeed);
          rec.fallSpeed = 0;
        }
        this.humanoidEvents(rec, prev);
        break;
      }
      case 'jump': {
        if (rec && rec.seat) this.unseat(rec);
        break;
      }
      case 'drive': {
        if (rec && rec.seat && rec.seat.board) {
          const board = rec.seat.seat, ctl = rec.seat.controller;
          const th = Math.max(-1, Math.min(1, m.th | 0)), st = Math.max(-1, Math.min(1, m.st | 0));
          const axis = th !== (board.props.get('Throttle') | 0) || st !== (board.props.get('Steer') | 0);
          dm.setProp(board, 'Throttle', th);
          dm.setProp(board, 'Steer', st);
          if (ctl && !ctl.destroyed) {
            dm.setProp(ctl, 'Throttle', th);
            dm.setProp(ctl, 'Steer', st);
            if (axis) dm.emit(ctl, 'AxisChanged', th !== (ctl.data.lastTh ?? 0) ? 'Throttle' : 'Steer');
            ctl.data.lastTh = th;
            for (const [key, code] of [['j', 32], ['d', 33]]) {
              const down = !!m[key];
              if (down === !!ctl.data.buttons[code]) continue;
              ctl.data.buttons[code] = down;
              dm.emit(ctl, 'ButtonChanged', T.e('Button', code));
              if (down && code === 32 && !dm.hasListener(ctl, 'ButtonChanged') && this.physics.boardGrounded(board)) this.physics.boardImpulse(board, [0, 32, 0]);
              if (down && code === 33) {
                this.unseat(rec);
                return;
              }
            }
          }
          return;
        }
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
      case 'unimpl': {
        const now = Date.now();
        if (!c.unimplWindow || now - c.unimplWindow > 60000) {
          c.unimplWindow = now;
          c.unimplCount = 0;
        }
        if (++c.unimplCount > 40) return;
        if (typeof m.n === 'string' && m.n.length <= 120) this.noteUnimplemented(m.k, m.n, 'client');
        break;
      }
      case 'report': {
        if (this.t - (c.lastReport || -999) < 20) return;
        c.lastReport = this.t;
        const target = m.p ? this.ownedInst(c, m.p, 'Player') : null;
        this.log('info', `report from ${c.user.name} (${c.user.id | 0}) about ${target ? target.props.get('Name') : 'the game'}: ${cleanText(m.r, 80)}`);
        report({
          reporterId: c.user.id | 0,
          targetId: target ? target.props.get('userId') | 0 : 0,
          placeId: this.placeId | 0,
          job: String(this.jobId || ''),
          reason: cleanText(m.r, 80),
          description: cleanText(m.m, 1500),
          chat: (this.chatLog || []).slice(-25),
        }).catch(() => {});
        break;
      }
      case 'mkt': {
        const now = Date.now();
        if (!c.mktWindow || now - c.mktWindow > 10000) {
          c.mktWindow = now;
          c.mktCount = 0;
        }
        if (++c.mktCount > 30) {
          this.io.send(c.cid, JSON.stringify({ t: 'mktr', k: m.k | 0, r: null }));
          return;
        }
        this.marketRequest(c, m).catch(() => null).then((r) => this.io.send(c.cid, JSON.stringify({ t: 'mktr', k: m.k | 0, r })));
        break;
      }
      case 'pfin': {
        const id = Math.max(0, Math.floor(+m.id || 0));
        const kind = m.kind === 'product' ? 'product' : m.kind === 'gamepass' ? 'gamepass' : 'asset';
        const key = (kind === 'product' ? 'product:' : 'asset:') + id;
        const ok = !!m.ok && !!(c.bought && c.bought.has(key));
        if (ok) c.bought.delete(key);
        const mps = dm.service('MarketplaceService');
        if (kind === 'gamepass') dm.emit(mps, 'PromptGamePassPurchaseFinished', pl, id, ok);
        else if (kind === 'asset') dm.emit(mps, 'PromptPurchaseFinished', pl, id, ok);
        else dm.emit(mps, 'PromptProductPurchaseFinished', c.user.id, id, ok);
        break;
      }
      case 'rcpt': {
        this.processReceipts(c).catch(() => {});
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
        const arm = gripArm(model);
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
        if (kind === 'all') this.noteChat(pl.props.get('Name'), msg);
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
      case 're': case 'rf': case 'rfr': {
        if (this.era !== 2018 || !this.remoteBudget(c)) return;
        if (m.t === 'rfr') {
          const p = this.invokes.get(m.k | 0);
          if (!p || !p.out || p.cid !== c.cid) return;
          this.invokes.delete(m.k | 0);
          clearTimeout(p.timer);
          p.resolve(unwireArgs(dm, m.a));
          return;
        }
        const r = this.ownedInst(c, m.id | 0, m.t === 're' ? 'RemoteEvent' : 'RemoteFunction');
        if (!r) return;
        const args = unwireArgs(dm, m.a);
        if (m.t === 're') dm.emit(r, 'OnServerEvent', pl, ...args);
        else {
          const k = this.invokeSeq++;
          this.invokes.set(k, { cid: c.cid, k: m.k | 0 });
          setTimeout(() => this.invokes.delete(k), 60000);
          dm.emit(r, '__Invoke', k, pl, ...args);
        }
        this.runSoon();
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
    if (this._asmDiff) {
      if (this._asmDiff.as.length) msg.as = this._asmDiff.as;
      if (this._asmDiff.ad.length) msg.ad = this._asmDiff.ad;
    }
    const ch = [];
    for (const rec of this.chars.values()) {
      if (rec.dead) continue;
      if (rec.owner === client.player && !rec.seat) continue;
      const cf = rec.torsoCF;
      ch.push([rec.model.id, ...flat(cf), Math.round(rec.vel[0] * 100) / 100, Math.round(rec.vel[1] * 100) / 100, Math.round(rec.vel[2] * 100) / 100, rec.state, ...(rec.owner && rec.netAngles ? rec.netAngles : [])]);
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

  assemblyList() {
    const out = new Map();
    for (const asm of this.physics.assemblies) {
      if (!asm.body || asm.anchored || asm.parts.size < ASSEMBLY_MIN) continue;
      const ids = [];
      for (const p of asm.parts) if (p.repWas && p.repWas.rep) ids.push(p.id);
      if (ids.length < ASSEMBLY_MIN) continue;
      ids.sort((a, b) => a - b);
      let prev = 0;
      const d = ids.map((id) => {
        const x = id - prev;
        prev = id;
        return x;
      });
      out.set(asm.root.id, d);
    }
    return out;
  }

  assemblySnapshot() {
    if (!this._asmSent) return [];
    return [...this._asmSent].map(([r, d]) => [r, d]);
  }

  syncAssemblies() {
    if (this._asmEpoch === this.physics.asmEpoch) {
      this._asmDiff = null;
      return;
    }
    this._asmEpoch = this.physics.asmEpoch;
    const now = this.assemblyList();
    const old = this._asmSent || new Map();
    const as = [], ad = [];
    for (const [r, d] of now) {
      const o = old.get(r);
      if (!o || o.length !== d.length || o.some((x, i) => x !== d[i])) as.push([r, d]);
    }
    for (const r of old.keys()) if (!now.has(r)) ad.push(r);
    this._asmSent = now;
    this._asmDiff = as.length || ad.length ? { as, ad } : null;
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

  runSoon() {
    if (this.soonQueued || !this.running) return;
    this.soonQueued = true;
    setImmediate(() => {
      this.soonQueued = false;
      if (!this.running) return;
      try {
        this.host.tick(this.t);
      } catch (e) {
        this.log('error', 'tick: ' + (e.stack || e.message));
      }
    });
  }

  tick() {
    if (!this.running) return;
    const dt = TICK;
    this.t += dt;
    this.frame++;
    try {
      this.host.tick(this.t);
      if (this.terrain) this.terrain.flush();
      const rs = this.dm.services.get('RunService');
      if (rs && (this.dm.hasListener(rs, 'Stepped') || this.dm.hasListener(rs, 'Heartbeat'))) {
        this.dm.emit(rs, 'Stepped', this.t, dt);
        this.dm.emit(rs, 'Heartbeat', dt);
      }
      this.anims.step(dt, (inst, ev, arg) => this.dm.emit(inst, ev, arg));
      this.updateChars(dt);
      this.handleExplosions();
      this.physics.step(dt);
      this.syncAssemblies();
      if (this.handleTouches()) this.host.tick(this.t);
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
