import { Instance } from './instance.js';
import { ENUMS, canonicalProp, isCreatable, isService, enumName } from './classes.js';
import { BRICK, brickByName, nearestBrick, brickPalette, brick } from './brickcolor.js';
import * as C from './cframe.js';

const EVENTS = {
  Instance: ['Changed', 'ChildAdded', 'ChildRemoved', 'DescendantAdded', 'DescendantRemoving', 'AncestryChanged'],
  BasePart: ['Touched', 'TouchEnded', 'LocalSimulationTouched', 'StoppedTouching', 'OutfitChanged'],
  Humanoid: ['Died', 'HealthChanged', 'Running', 'Jumping', 'FreeFalling', 'Climbing', 'Sitting', 'GettingUp', 'FallingDown', 'Strafing', 'Swimming', 'PlatformStanding', 'Seated', 'MoveToFinished', 'StateChanged'],
  ClickDetector: ['MouseClick', 'MouseHoverEnter', 'MouseHoverLeave'],
  Players: ['PlayerAdded', 'PlayerRemoving', 'ChildAdded'],
  Player: ['CharacterAdded', 'CharacterRemoving', 'Chatted', 'Idled'],
  Tool: ['Activated', 'Deactivated', 'Equipped', 'Unequipped'],
  HopperBin: ['Selected', 'Deselected'],
  Mouse: ['Button1Down', 'Button1Up', 'Button2Down', 'Button2Up', 'KeyDown', 'KeyUp', 'Move', 'Idle', 'WheelForward', 'WheelBackward'],
  GuiObject: ['MouseEnter', 'MouseLeave', 'MouseMoved', 'InputBegan', 'InputChanged', 'InputEnded', 'DragBegin', 'DragStopped'],
  GuiButton: ['MouseButton1Click', 'MouseButton1Down', 'MouseButton1Up', 'MouseButton2Click', 'MouseButton2Down', 'MouseButton2Up'],
  TextBox: ['FocusLost', 'Focused'],
  BindableEvent: ['Event'],
  RemoteEvent: ['OnServerEvent', 'OnClientEvent'],
  RunService: ['Stepped', 'Heartbeat', 'RenderStepped'],
  Seat: ['Seated'],
  Explosion: ['Hit'],
  Sound: ['Played', 'Paused', 'Stopped', 'Ended'],
  Dialog: ['DialogChoiceSelected'],
  DataModel: ['ItemChanged', 'Close', 'Loaded', 'GraphicsQualityChangeRequest'],
  ReplicatedFirst: ['RemoveDefaultLoadingGuiSignal', 'FinishedReplicating'],
  Workspace: [],
  UserInputService: ['InputBegan', 'InputEnded', 'InputChanged', 'TouchStarted', 'TouchMoved', 'TouchEnded', 'ProcessedEvent'],
  ContextActionService: ['BoundActionAdded', 'BoundActionRemoved', 'BoundActionChanged', 'GetActionButtonEvent'],
  Debris: [],
  Lighting: ['LightingChanged'],
  Camera: [],
  GuiService: ['KeyPressed', 'SpecialKeyPressed', 'EscapeKeyPressed', 'BrowserWindowClosed', 'MenuOpened', 'MenuClosed'],
  LogService: ['MessageOut'],
  ScriptContext: ['Error'],
  StarterGui: ['CoreGuiChangedSignal'],
  UserGameSettings: ['StudioModeChanged', 'FullscreenChanged'],
  MarketplaceService: ['PromptPurchaseRequested', 'PromptProductPurchaseRequested', 'PromptGamePassPurchaseRequested', 'PromptPurchaseFinished', 'PromptProductPurchaseFinished', 'ServerPurchaseVerification', 'ClientPurchaseSuccess', 'ClientLuaDialogRequested'],
  TeleportService: ['ItemChanged'],
  PointsService: ['PointsAwarded'],
  CollectionService: ['ItemAdded', 'ItemRemoved'],
  AnimationTrack: ['KeyframeReached', 'Stopped'],
};
EVENTS.Players.push('PlayerChatted', 'FriendRequestEvent');
EVENTS.Player.push('FriendStatusChanged', 'OnTeleport');

const ASYNC = new Set(['LoadAsset', 'loadAsset', 'GetProductInfo', 'AwardBadge', 'UserHasBadge', 'IsInGroup', 'GetRankInGroup', 'GetRoleInGroup', 'IsFriendsWith', 'isFriendsWith', 'isInGroup', 'PlayerOwnsAsset', 'GetCollectibles', 'SaveNumber', 'LoadNumber', 'SaveString', 'LoadString', 'SaveBoolean', 'LoadBoolean', 'SaveInstance', 'LoadInstance', 'WaitForDataReady', 'waitForDataReady', 'GetFriendsOnline', 'LoadCharacter', 'loadCharacter', 'GetUserIdFromNameAsync', 'GetNameFromUserIdAsync', 'HttpGet', 'PostAsync', 'GetAsync']);

const ENGINE_FLAGS = new Set(['NewLoadingScreen']);
const CAS_METHODS = ['BindAction', 'BindActionToInputTypes', 'UnbindAction', 'UnbindAllActions', 'GetAllBoundActionInfo', 'GetBoundActionInfo', 'SetTitle', 'SetImage', 'SetDescription', 'SetPosition', 'CallFunction', 'FireActionButtonFoundSignal', 'GetButton'];
const CAS_SIDE = new Set(CAS_METHODS);
const LUA_SIDE = new Set(['WaitForChild', 'waitForChild', 'Fire', 'Invoke', 'AddCenterDialog', 'RemoveCenterDialog', ...CAS_METHODS]);

const eventIndex = new Map();
for (const [cls, list] of Object.entries(EVENTS)) for (const e of list) {
  if (!eventIndex.has(e)) eventIndex.set(e, new Set());
  eventIndex.get(e).add(cls);
  const lc = e.charAt(0).toLowerCase() + e.slice(1);
  if (lc !== e) {
    if (!eventIndex.has(lc)) eventIndex.set(lc, new Set());
    eventIndex.get(lc).add(cls);
  }
}

function eventFor(inst, key) {
  const set = eventIndex.get(key);
  if (!set) return null;
  for (const c of set) if (inst.isA(c) || (c === 'DataModel' && inst.ClassName === 'DataModel')) return key.charAt(0).toUpperCase() + key.slice(1);
  return null;
}

export class Typed {
  constructor(tag, v) {
    this.tag = tag;
    this.v = v;
  }
}

export const T = {
  v3: (v) => new Typed('v3', v),
  cf: (v) => new Typed('cf', v),
  c3: (v) => new Typed('c3', v),
  v2: (v) => new Typed('v2', v),
  ud2: (v) => new Typed('ud2', v),
  bc: (v) => new Typed('bc', v),
  e: (type, v) => new Typed('e', [type, v]),
  list: (v) => new Typed('l', v),
  ray: (o, d) => new Typed('ray', [...o, ...d]),
};

function encodeAny(out, v) {
  if (v === undefined || v === null) out.push('nil');
  else if (v instanceof Instance) out.push('i', v.id); else if (typeof v === 'number') out.push('n', v);
  else if (typeof v === 'string') out.push('s', v);
  else if (typeof v === 'boolean') out.push('b', v);
  else if (v instanceof Typed) {
    if (v.tag === 'l') {
      out.push('l', v.v.length);
      for (const x of v.v) encodeAny(out, x);
    } else if (v.tag === 'e') out.push('e', v.v[0], v.v[1]);
    else if (v.tag === 'bc') out.push('bc', v.v);
    else out.push(v.tag, ...v.v);
  } else if (Array.isArray(v)) {
    out.push('l', v.length);
    for (const x of v) encodeAny(out, x);
  } else out.push('nil');
}

function encodeProp(out, p, v) {
  switch (p.type) {
    case 'string': case 'Content': out.push('s', v ?? ''); break;
    case 'bool': out.push('b', !!v); break;
    case 'number': case 'int': out.push('n', v); break;
    case 'enum':
      if (p.enumType) out.push('e', p.enumType, v);
      else out.push('n', v);
      break;
    case 'BC': out.push('bc', v); break;
    case 'V3': out.push('v3', v[0], v[1], v[2]); break;
    case 'V2': out.push('v2', v[0], v[1]); break;
    case 'C3': out.push('c3', v[0], v[1], v[2]); break;
    case 'UD2': out.push('ud2', v[0], v[1], v[2], v[3]); break;
    case 'CF': out.push('cf', ...v); break;
    case 'Ref': encodeAny(out, v); break;
    default: encodeAny(out, v);
  }
}

const ARITY = { nil: 0, b: 1, n: 1, s: 1, i: 1, v3: 3, cf: 12, c3: 3, bc: 1, ud2: 4, ud: 2, v2: 2, ray: 6, e: 2 };

function decodeArgs(dm, a, start = 0) {
  const out = [];
  let i = start;
  const one = () => {
    const tag = a[i++];
    if (tag === undefined) return undefined;
    if (tag === 'l') {
      const n = a[i++];
      const list = [];
      for (let k = 0; k < n; k++) list.push(one());
      return { tag: 'l', v: list };
    }
    const n = ARITY[tag] ?? 0;
    let v;
    if (tag === 'i') v = dm.byId.get(a[i]) || null;
    else if (n === 1) v = a[i];
    else if (n > 1) v = a.slice(i, i + n);
    i += n;
    return { tag, v };
  };
  while (i < a.length) out.push(one());
  return out;
}

const TYPE_NAME = { v3: 'Vector3', cf: 'CFrame', c3: 'Color3', bc: 'BrickColor', ud2: 'UDim2', v2: 'Vector2', s: 'string', n: 'number', b: 'bool', i: 'Object', nil: 'nil', e: 'EnumItem', l: 'table', ray: 'Ray' };
const WANT = { V3: 'Vector3', CF: 'CFrame', C3: 'Color3', BC: 'BrickColor', UD2: 'UDim2', V2: 'Vector2', string: 'string', Content: 'Content', number: 'number', int: 'int', bool: 'bool', Ref: 'Object', enum: 'token' };

function coerceTo(p, a) {
  const tag = a ? a.tag : 'nil';
  const v = a ? a.v : null;
  const bad = () => {
    throw new Error(`bad argument #3 to '?' (${WANT[p.type] || p.type} expected, got ${TYPE_NAME[tag] || tag})`);
  };
  switch (p.type) {
    case 'V3': if (tag !== 'v3') bad(); return v.map((x) => (Number.isFinite(x) ? x : 0));
    case 'CF': if (tag !== 'cf') bad(); return v;
    case 'C3': if (tag !== 'c3') bad(); return v;
    case 'V2': if (tag !== 'v2') bad(); return v;
    case 'UD2': if (tag !== 'ud2') bad(); return v;
    case 'BC':
      if (tag === 'bc') return v;
      if (tag === 'n') return BRICK.has(v | 0) ? v | 0 : 194;
      if (tag === 's') return brickByName(v);
      if (tag === 'c3') return nearestBrick(v[0], v[1], v[2]);
      return bad();
    case 'string': case 'Content':
      if (tag === 's') return v;
      if (tag === 'n') return fmtNum(v);
      if (tag === 'nil') return '';
      return bad();
    case 'number':
      if (tag === 'n') return v;
      if (tag === 's' && v.trim() !== '' && Number.isFinite(+v)) return +v;
      if (tag === 'b') return v ? 1 : 0;
      return bad();
    case 'int':
      if (tag === 'n') return Math.trunc(v);
      if (tag === 's' && Number.isFinite(+v)) return Math.trunc(+v);
      return bad();
    case 'bool':
      if (tag === 'b') return v;
      if (tag === 'nil') return false;
      if (tag === 'n') return v !== 0;
      return true;
    case 'Ref':
      if (tag === 'i') return v;
      if (tag === 'nil') return null;
      return bad();
    case 'enum': {
      const E = p.enumType ? ENUMS[p.enumType] : null;
      if (tag === 'e') {
        if (E && v[0] !== p.enumType) bad();
        return v[1];
      }
      if (tag === 'n') return v | 0;
      if (tag === 's' && E && v in E) return E[v];
      return bad();
    }
    default:
      return v;
  }
}

function fmtNum(v) {
  if (Number.isInteger(v)) return String(v);
  let s = v.toPrecision(14);
  if (s.includes('e')) return String(+s);
  return String(+s);
}

const deg = 180 / Math.PI;

function plain(x) {
  if (!x) return undefined;
  if (x.tag === 'l') return x.v.map(plain);
  if (x.tag === 'e') return x.v[1];
  if (x.tag === 'nil') return null;
  return x.v;
}

export class ScriptHost {
  constructor(dm, env = {}) {
    this.dm = dm;
    this.env = env;
    this.side = dm.side;
    this.queue = [];
    this.lua = null;
    this.step = null;
    this.asyncId = 1;
    this.running = new Set();
    this.linked = new Map();
    this.linkedPending = new Set();
    this.ghosts = new Map();
    this.libraries = new Map();
    this.guiKeys = new Set();
    this.t0 = Date.now();
    this.methods = buildMethods(this);
    this.computed = buildComputed(this);
    this.setters = buildSetters(this);
    this.logs = env.log || ((k, m) => console.log(`[${k}] ${m}`));
    dm.luaSink = (inst, name, args) => this.pushEvent(inst, name, args);
    dm.observe({
      reparented: (inst, old) => {
        this.scanScripts(inst);
        const cs = dm.services.get('CollectionService');
        if (!cs) return;
        const inGame = !!inst.parent && inst.isDescendantOf(dm.root);
        const wasGame = !!old && (old === dm.root || old.isDescendantOf(dm.root));
        if (inGame === wasGame) return;
        const ev = inGame ? 'ItemAdded' : 'ItemRemoved';
        if (!dm.hasListener(cs, ev)) return;
        dm.emit(cs, ev, inst);
        for (const d of inst.descendants()) dm.emit(cs, ev, d);
      },
      changed: (inst, name) => {
        if (name === 'Disabled' && inst.isA('BaseScript')) this.scanScripts(inst);
        if (name === 'Character' && inst.ClassName === 'Player') {
          const ch = inst.props.get('Character');
          if (ch && !ch.destroyed) this.scanScripts(ch);
        }
      },
      destroyed: (inst) => {
        if (this.killed) this.killed.add(inst.id);
        if (this.running.has(inst.id)) this.stopScript(inst);
        this.ghosts.set(inst.id, inst);
        if (this.ghosts.size > 20000) {
          const first = this.ghosts.keys().next().value;
          this.ghosts.delete(first);
        }
      },
    });
  }

  async init(LuaFactory, runtimeSource) {
    this.lua = await LuaFactory();
    const g = this.lua.global;
    const data = 'return ' + luaData();
    const J = {
      get: (id, k) => this.jsGet(id, k),
      set: (id, k, ...a) => this.jsSet(id, k, a),
      call: (id, m, ...a) => this.jsCall(id, m, a),
      new: (cls, parent) => this.jsNew(cls, parent),
      sub: (id, name) => { this.dm.luaSubs.add(id + ':' + name); this.onSubscribe(id, name); },
      unsub: (id, name) => { this.dm.luaSubs.delete(id + ':' + name); },
      poll: () => {
        const q = this.queue;
        this.queue = [];
        this.killed = new Set();
        return q;
      },
      alive: (id) => !this.killed || !this.killed.has(id),
      running: (id) => this.running.has(id),
      log: (kind, msg, id) => this.log(kind, msg, id),
      now: (what) => (what === 'tick' ? Date.now() / 1000 : (Date.now() - this.t0) / 1000),
      side: this.side,
      data,
    };
    g.set('__J', J);
    g.set('__RTSRC', runtimeSource);
    this.lua.doStringSync('__RT = assert(loadstring(__RTSRC, "=runtime"))(__J) __J = nil __RTSRC = nil');
    const rt = g.get('__RT');
    this.step = rt.step;
    this.rtFire = rt.fire;
    this.lua.doStringSync('__RT = nil');
    this.ready = true;
    for (const d of this.dm.root.descendants()) this.scanOne(d);
  }

  userSettings() {
    if (!this._userSettings) {
      const dm = this.dm;
      const us = dm.create('UserSettings', null);
      us.props.set('Name', 'UserSettings');
      const gs = dm.create('UserGameSettings', us);
      gs.props.set('Name', 'GameSettings');
      this._userSettings = us;
    }
    return this._userSettings;
  }

  globalSettings() {
    if (!this._globalSettings) {
      const dm = this.dm;
      const g = dm.create('GlobalSettings', null);
      g.props.set('Name', 'Settings');
      const r = dm.create('RenderSettings', g);
      r.props.set('Name', 'Rendering');
      for (const n of ['Network', 'Physics', 'Diagnostics', 'Game']) dm.create('Instance', g).props.set('Name', n);
      this._globalSettings = g;
    }
    return this._globalSettings;
  }

  log(kind, msg, id) {
    const inst = id ? this.inst(id) : null;
    this.logs(kind, String(msg), inst ? inst.fullName() : null);
    const ls = this.dm.services.get('LogService');
    if (ls && this.dm.hasListener(ls, 'MessageOut')) this.dm.emit(ls, 'MessageOut', String(msg), T.e('MessageType', kind === 'error' ? 3 : kind === 'warn' ? 2 : 0));
  }

  inst(id) {
    if (id === 0) return this.dm.root;
    return this.dm.byId.get(id) || this.ghosts.get(id) || null;
  }

  onSubscribe(id, name) {
    if (this.env.onSubscribe) this.env.onSubscribe(this.inst(id), name);
  }

  pushEvent(inst, name, args) {
    const q = this.queue;
    q.push('ev', inst.id, name, args.length);
    if (name === 'Changed' && inst.isA('ValueBase') && args.length === 1 && typeof args[0] !== 'string') {
      const p = inst.info.all.get('Value');
      if (p) {
        encodeProp(q, p, args[0]);
        return;
      }
    }
    for (const a of args) encodeAny(q, a);
  }

  fire(inst, name, ...args) {
    this.dm.emit(inst, name, ...args);
  }

  resolveAsync(token, promise) {
    promise.then(
      (vals) => {
        const out = ['ok'];
        for (const v of vals || []) encodeAny(out, v);
        this.queue.push('async', token, out.length, ...out);
      },
      (err) => {
        this.queue.push('async', token, 2, 'err', String(err && err.message ? err.message : err));
      },
    );
  }

  canRun(inst) {
    if (inst.props.get('Disabled') || inst.destroyed) return false;
    const dm = this.dm;
    if (inst.ClassName === 'Script') {
      if (this.side !== 'server') return false;
      const ws = dm.services.get('Workspace');
      const sss = dm.services.get('ServerScriptService');
      const players = dm.services.get('Players');
      return (ws && inst.isDescendantOf(ws)) || (sss && inst.isDescendantOf(sss)) || (players && inst.isDescendantOf(players));
    }
    if (inst.ClassName === 'CoreScript') {
      if (this.side !== 'client') return false;
      for (let p = inst.parent; p; p = p.parent) if (p === dm.root) return true;
      return false;
    }
    if (inst.ClassName === 'LocalScript') {
      if (this.side !== 'client') return false;
      const lp = this.env.localPlayer && this.env.localPlayer();
      if (!lp) return false;
      if (inst.isDescendantOf(lp)) return true;
      const ch = lp.props.get('Character');
      if (ch && (inst === ch || inst.isDescendantOf(ch))) return true;
      const rf = dm.services.get('ReplicatedFirst');
      return !!rf && inst.isDescendantOf(rf);
    }
    return false;
  }

  scanOne(inst) {
    if (!this.ready) return;
    if (inst.ClassName !== 'Script' && inst.ClassName !== 'LocalScript' && inst.ClassName !== 'CoreScript') return;
    const run = this.canRun(inst);
    if (run && !this.running.has(inst.id)) this.startScript(inst);
    else if (!run && this.running.has(inst.id)) this.stopScript(inst);
  }

  scanScripts(inst) {
    if (!this.ready) return;
    this.scanOne(inst);
    for (const d of inst.descendants()) this.scanOne(d);
  }

  rescanAll() {
    this.scanScripts(this.dm.root);
  }

  startScript(inst) {
    this.running.add(inst.id);
    const url = inst.ClassName !== 'CoreScript' && !inst.props.get('Source') && this.env.linkedSource ? inst.props.get('LinkedSource') : null;
    if (url && !this.linked.has(inst.id)) {
      if (this.linkedPending.has(inst.id)) return;
      this.linkedPending.add(inst.id);
      Promise.resolve()
        .then(() => this.env.linkedSource(url))
        .then((src) => this.linked.set(inst.id, typeof src === 'string' ? src : ''), (e) => {
          this.linked.set(inst.id, '');
          this.logs('warn', `${inst.props.get('Name')}: LinkedSource ${url} failed: ${e && e.message ? e.message : e}`, null);
        })
        .then(() => {
          this.linkedPending.delete(inst.id);
          if (this.running.has(inst.id) && !inst.destroyed) this.queue.push('start', inst.id);
        });
      return;
    }
    this.queue.push('start', inst.id);
  }

  stopScript(inst) {
    this.running.delete(inst.id);
    this.queue.push('stop', inst.id);
  }

  tick(t) {
    if (!this.step) return;
    try {
      this.step(t);
    } catch (e) {
      this.logs('error', 'scheduler: ' + (e && e.message ? e.message : e), null);
    }
  }

  jsGet(id, key) {
    const inst = this.inst(id);
    if (!inst) return ['err', 'Instance no longer exists'];
    try {
      return this.get(inst, key);
    } catch (e) {
      return ['err', e.message];
    }
  }

  get(inst, key) {
    if (key === 'Parent') return inst.parent && !inst.destroyed ? ['i', inst.parent.id] : ['nil'];
    if (key === '__ownerPlayer') {
      const players = this.dm.services.get('Players');
      for (let p = inst; p; p = p.parent) {
        if (p.ClassName === 'Player') return ['i', p.id];
        if (p.ClassName === 'Model' && players) {
          const pl = players.children.find((c) => c.ClassName === 'Player' && c.props.get('Character') === p);
          if (pl) return ['i', pl.id];
        }
      }
      return ['nil'];
    }
    if (key === 'ClassName' || key === 'className') return ['s', inst.ClassName];
    if (key === 'Name') return ['s', inst.props.get('Name')];
    const comp = this.computed.get(key);
    if (comp) {
      for (const [cls, fn] of comp) {
        if (inst.isA(cls)) {
          const out = [];
          encodeAny(out, fn(inst));
          return out;
        }
      }
    }
    const m = this.methodName(inst, key);
    if (m) return ['m', m];
    const ev = eventFor(inst, key);
    if (ev) return ['ev', ev];
    const pn = canonicalProp(inst.ClassName, key);
    if (pn) {
      const p = inst.info.all.get(pn);
      if (p) {
        const out = [];
        encodeProp(out, p, inst.props.get(pn));
        return out;
      }
    }
    const child = inst.findChild(key);
    if (child) return ['i', child.id];
    if (inst === this.dm.root) {
      const s = this.dm.services.get(key) || (key === 'workspace' ? this.dm.services.get('Workspace') : null) || (key === 'lighting' ? this.dm.services.get('Lighting') : null);
      if (s) return ['i', s.id];
    }
    return ['err', `${key} is not a valid member of ${inst.ClassName}`];
  }

  methodName(inst, key) {
    const tryKey = (k) => {
      if (LUA_SIDE.has(k)) {
        if (k === 'Fire' && !inst.isA('BindableEvent')) return null;
        if (k === 'Invoke' && !inst.isA('BindableFunction')) return null;
        if ((k === 'AddCenterDialog' || k === 'RemoveCenterDialog') && inst.ClassName !== 'GuiService') return null;
        if (CAS_SIDE.has(k) && inst.ClassName !== 'ContextActionService') return null;
        return k;
      }
      const list = this.methods.get(k);
      if (!list) return null;
      for (const [cls] of list) if (inst.isA(cls) || (cls === 'DataModel' && inst === this.dm.root)) return k;
      return null;
    };
    return tryKey(key) || (key[0] >= 'a' && key[0] <= 'z' ? tryKey(key[0].toUpperCase() + key.slice(1)) : null);
  }

  jsSet(id, key, raw) {
    const inst = this.inst(id);
    if (!inst) return 'Instance no longer exists';
    try {
      const [a] = decodeArgs(this.dm, raw);
      this.set(inst, key, a);
      return undefined;
    } catch (e) {
      return e.message;
    }
  }

  set(inst, key, a) {
    if (key === 'Parent') {
      const v = a && a.tag === 'i' ? a.v : null;
      if (a && a.tag !== 'i' && a.tag !== 'nil') throw new Error('bad argument #3 to \'?\' (Object expected)');
      if (v && v.destroyed) throw new Error('The Parent property is locked');
      if (this.env.canParent && !this.env.canParent(inst, v)) throw new Error('The Parent property of ' + inst.props.get('Name') + ' is locked');
      this.dm.setParent(inst, v);
      return;
    }
    if (key === 'ClassName' || key === 'className') throw new Error('ClassName is read-only');
    const sp = this.setters.get(key);
    if (sp) {
      for (const [cls, fn] of sp) {
        if (inst.isA(cls)) {
          fn(inst, a);
          return;
        }
      }
    }
    const pn = canonicalProp(inst.ClassName, key);
    const p = pn && inst.info.all.get(pn);
    if (!p) {
      if (inst.findChild(key)) throw new Error(`${key} is not a valid member of ${inst.ClassName}`);
      throw new Error(`${key} is not a valid member of ${inst.ClassName}`);
    }
    if (p.type === 'any') return;
    const v = coerceTo(p, a);
    this.dm.setProp(inst, pn, v, { lua: true });
  }

  jsCall(id, method, raw) {
    const inst = this.inst(id);
    if (!inst) return ['err', 'Instance no longer exists'];
    try {
      const args = decodeArgs(this.dm, raw);
      if (method === '__source') {
        const out = ['ok'];
        encodeAny(out, inst.props.get('Source') || this.linked.get(inst.id) || (this.env.sourceOf ? this.env.sourceOf(inst) : ''));
        return out;
      }
      const list = this.methods.get(method);
      if (!list) return ['err', `${method} is not a valid member of ${inst.ClassName}`];
      for (const [cls, fn] of list) {
        if (inst.isA(cls) || (cls === 'DataModel' && inst === this.dm.root)) {
          const r = fn(inst, args.map(plain), args);
          if (ASYNC.has(method) && r && typeof r.then === 'function') {
            const token = this.asyncId++;
            this.resolveAsync(token, r);
            return ['async', token];
          }
          const out = ['ok'];
          if (Array.isArray(r) && r.multi) for (const v of r) encodeAny(out, v);
          else encodeAny(out, r);
          return out;
        }
      }
      return ['err', `${method} is not a valid member of ${inst.ClassName}`];
    } catch (e) {
      return ['err', e.message];
    }
  }

  jsNew(cls, parentId) {
    if (!isCreatable(cls)) return `Unable to create an Instance of type "${cls}"`;
    if (this.env.canCreate && !this.env.canCreate(cls)) return `Unable to create an Instance of type "${cls}"`;
    const inst = this.dm.create(cls, null);
    for (const o of this.dm.observers) if (o.created) o.created(inst);
    if (parentId != null) {
      const par = this.inst(parentId);
      if (par) this.dm.setParent(inst, par);
    }
    return inst.id;
  }
}

export function multi(...v) {
  v.multi = true;
  return v;
}

function partsOf(inst) {
  if (inst.isA('BasePart')) return [inst];
  return inst.descendants().filter((d) => d.isA('BasePart'));
}

function boundsOf(parts) {
  let lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (const p of parts) {
    const cf = p.props.get('CFrame');
    const s = p.props.get('Size');
    const h = [s[0] / 2, s[1] / 2, s[2] / 2];
    for (let k = 0; k < 3; k++) {
      const e = Math.abs(cf[3 + k * 3]) * h[0] + Math.abs(cf[4 + k * 3]) * h[1] + Math.abs(cf[5 + k * 3]) * h[2];
      lo[k] = Math.min(lo[k], cf[k] - e);
      hi[k] = Math.max(hi[k], cf[k] + e);
    }
  }
  if (!parts.length) return { lo: [0, 0, 0], hi: [0, 0, 0] };
  return { lo, hi };
}

function modelCFrame(m) {
  const pp = m.props.get('PrimaryPart');
  const parts = partsOf(m);
  const b = boundsOf(parts);
  const c = [(b.lo[0] + b.hi[0]) / 2, (b.lo[1] + b.hi[1]) / 2, (b.lo[2] + b.hi[2]) / 2];
  if (pp && pp.isDescendantOf(m)) return C.withPos(pp.props.get('CFrame'), c[0], c[1], c[2]);
  return C.cf(c[0], c[1], c[2]);
}

function translateModel(host, m, delta) {
  for (const p of partsOf(m)) {
    const cf = p.props.get('CFrame').slice();
    cf[0] += delta[0];
    cf[1] += delta[1];
    cf[2] += delta[2];
    host.dm.setProp(p, 'CFrame', cf, { lua: true, model: true });
  }
}

function minutesOf(tod) {
  const m = /^(-?\d+):?(\d+)?:?(\d+)?/.exec(String(tod)) || [];
  return ((+m[1] || 0) * 60 + (+m[2] || 0) + (+m[3] || 0) / 60);
}

function todOf(min) {
  min = ((min % 1440) + 1440) % 1440;
  const h = Math.floor(min / 60), mm = Math.floor(min % 60), ss = Math.floor((min * 60) % 60);
  const p = (n) => String(n).padStart(2, '0');
  return `${p(h)}:${p(mm)}:${p(ss)}`;
}

function buildMethods(host) {
  const dm = host.dm;
  const env = host.env;
  const M = new Map();
  const def = (names, cls, fn) => {
    for (const n of names.split(' ')) {
      if (!M.has(n)) M.set(n, []);
      M.get(n).push([cls, fn]);
    }
  };
  def('FindFirstChild findFirstChild', 'Instance', (i, [name, rec]) => i.findChild(String(name), !!rec));
  def('FindFirstChildOfClass', 'Instance', (i, [c]) => i.findChildOfClass(String(c)));
  def('FindFirstChildWhichIsA', 'Instance', (i, [c]) => i.findChildWhichIsA(String(c)));
  def('FindFirstAncestor', 'Instance', (i, [n]) => { for (let p = i.parent; p; p = p.parent) if (p.props.get('Name') === n) return p; return null; });
  def('FindFirstAncestorOfClass', 'Instance', (i, [c]) => { for (let p = i.parent; p; p = p.parent) if (p.ClassName === c) return p; return null; });
  def('GetChildren getChildren children', 'Instance', (i) => T.list(i.children.slice()));
  def('GetDescendants', 'Instance', (i) => T.list(i.descendants()));
  def('Clone clone', 'Instance', (i) => {
    const c = dm.clone(i);
    return c;
  });
  def('Destroy destroy', 'Instance', (i) => {
    if (env.canDestroy && !env.canDestroy(i)) return null;
    dm.destroy(i);
    return null;
  });
  def('Remove remove', 'Instance', (i) => {
    if (env.canDestroy && !env.canDestroy(i)) return null;
    dm.remove(i);
    return null;
  });
  def('ClearAllChildren clearAllChildren', 'Instance', (i) => {
    for (const c of [...i.children]) if (!env.canDestroy || env.canDestroy(c)) dm.destroy(c);
    return null;
  });
  def('IsA isA', 'Instance', (i, [c]) => i.isA(String(c)));
  def('GetFullName getFullName', 'Instance', (i) => i.fullName());
  def('IsDescendantOf isDescendantOf', 'Instance', (i, [o]) => (o ? i.isDescendantOf(o) : false));
  def('IsAncestorOf isAncestorOf', 'Instance', (i, [o]) => (o ? o.isDescendantOf(i) : false));
  def('GetDebugId', 'Instance', (i) => String(i.id));

  def('GetService getService service FindService', 'DataModel', (i, [name]) => {
    const s = dm.service(String(name));
    if (!s) throw new Error(`'${name}' is not a valid Service name`);
    return s;
  });
  def('IsLoaded', 'DataModel', () => (env.isLoaded ? env.isLoaded() : true));
  def('GetMessage', 'DataModel', () => (env.message ? String(env.message() || '') : ''));
  def('IsDefaultLoadingGuiRemoved', 'ReplicatedFirst', () => (env.loadingGuiRemoved ? env.loadingGuiRemoved() : true));
  def('RemoveDefaultLoadingGui', 'ReplicatedFirst', () => { if (env.removeLoadingGui) env.removeLoadingGui(); return null; });
  def('SetVerb', 'GuiButton', (b, [verb]) => {
    if (!b.verbHooked) {
      b.verbHooked = true;
      b.on('MouseButton1Click', () => { if (b.verb && env.verb) env.verb(b.verb); });
    }
    b.verb = String(verb ?? '');
    return null;
  });
  def('FinishShutdown', 'DataModel', () => { if (env.shutdown) env.shutdown(); return null; });
  def('GetJobsInfo', 'DataModel', () => T.list([]));
  def('SetMessage', 'DataModel', (i, [msg]) => { if (env.setMessage) env.setMessage(String(msg)); return null; });
  def('ClearMessage', 'DataModel', () => { if (env.setMessage) env.setMessage(null); return null; });
  def('Shutdown', 'DataModel', () => { if (env.shutdown) env.shutdown(); return null; });
  def('HttpGet', 'DataModel', () => Promise.reject(new Error('HttpGet is not available')));

  def('MoveTo moveTo', 'Model', (m, [pos]) => {
    if (!pos) return null;
    const cf = modelCFrame(m);
    const parts = partsOf(m);
    let target = pos.slice();
    if (env.findSpace) target = env.findSpace(m, parts, cf, target);
    translateModel(host, m, [target[0] - cf[0], target[1] - cf[1], target[2] - cf[2]]);
    return null;
  });
  def('TranslateBy', 'Model', (m, [d]) => { translateModel(host, m, d); return null; });
  def('GetModelCFrame getModelCFrame', 'Model', (m) => T.cf(modelCFrame(m)));
  def('GetModelSize getModelSize GetExtentsSize', 'Model', (m) => {
    const b = boundsOf(partsOf(m));
    return T.v3([b.hi[0] - b.lo[0], b.hi[1] - b.lo[1], b.hi[2] - b.lo[2]]);
  });
  def('GetPrimaryPartCFrame', 'Model', (m) => {
    const pp = m.props.get('PrimaryPart');
    return pp ? T.cf(pp.props.get('CFrame')) : null;
  });
  def('SetPrimaryPartCFrame', 'Model', (m, [cf]) => {
    const pp = m.props.get('PrimaryPart');
    if (!pp) throw new Error('Model:SetPrimaryPartCFrame() failed because no PrimaryPart has been set');
    const rel = C.mul(cf, C.inv(pp.props.get('CFrame')));
    for (const p of partsOf(m)) dm.setProp(p, 'CFrame', C.orthonormalize(C.mul(rel, p.props.get('CFrame'))), { lua: true, model: true });
    return null;
  });
  def('BreakJoints breakJoints', 'Model', (m) => { if (env.breakJoints) for (const p of partsOf(m)) env.breakJoints(p); return null; });
  def('MakeJoints makeJoints', 'Model', (m) => { if (env.makeJoints) env.makeJoints(partsOf(m)); return null; });
  def('BreakJoints breakJoints', 'BasePart', (p) => { if (env.breakJoints) env.breakJoints(p); return null; });
  def('MakeJoints makeJoints', 'BasePart', (p) => { if (env.makeJoints) env.makeJoints([p]); return null; });
  def('GetMass getMass', 'BasePart', (p) => {
    const s = p.props.get('Size');
    return s[0] * s[1] * s[2] * 0.7;
  });
  def('GetConnectedParts', 'BasePart', (p) => T.list(env.connectedParts ? env.connectedParts(p) : [p]));
  def('GetTouchingParts', 'BasePart', (p) => T.list(env.touchingParts ? env.touchingParts(p) : []));
  def('Resize resize', 'BasePart', (p, [face, delta]) => {
    const s = p.props.get('Size').slice();
    const axis = [0, 1, 2, 0, 1, 2][face | 0];
    const sign = (face | 0) < 3 ? 1 : -1;
    s[axis] = Math.max(0.2, s[axis] + delta);
    const cf = p.props.get('CFrame');
    const off = [0, 0, 0];
    off[axis] = (sign * delta) / 2;
    const w = C.vector(cf, off[0], off[1], off[2]);
    dm.setProp(p, 'Size', s, { lua: true });
    dm.setProp(p, 'CFrame', C.withPos(cf, cf[0] + w[0], cf[1] + w[1], cf[2] + w[2]), { lua: true });
    return true;
  });
  def('GetRootPart', 'BasePart', (p) => (env.rootPart ? env.rootPart(p) : p));
  def('CanCollideWith', 'BasePart', () => true);

  def('FindPartOnRay findPartOnRay', 'Workspace', (w, [ray, ignore]) => {
    if (!ray || !env.raycast) return multi(null, T.v3(ray ? [ray[0] + ray[3], ray[1] + ray[4], ray[2] + ray[5]] : [0, 0, 0]));
    const r = env.raycast(ray.slice(0, 3), ray.slice(3, 6), ignore ? [ignore] : []);
    return multi(r.part, T.v3(r.point), T.v3(r.normal || [0, 1, 0]));
  });
  def('FindPartOnRayWithIgnoreList findPartOnRayWithIgnoreList', 'Workspace', (w, [ray, list]) => {
    if (!ray || !env.raycast) return multi(null, T.v3([0, 0, 0]));
    const r = env.raycast(ray.slice(0, 3), ray.slice(3, 6), (list || []).filter(Boolean));
    return multi(r.part, T.v3(r.point), T.v3(r.normal || [0, 1, 0]));
  });
  def('FindPartsInRegion3 findPartsInRegion3', 'Workspace', (w, [region, ignore, maxN], raw) => {
    const a = raw[0];
    if (!a || !env.partsInBox) return T.list([]);
    return T.list([]);
  });
  def('GetNumAwakeParts', 'Workspace', () => 0);
  def('ZoomToExtents', 'Workspace', () => null);
  def('GetRealPhysicsFPS', 'Workspace', () => 60);
  def('GetServerTimeNow', 'Workspace', () => Date.now() / 1000);

  def('AddItem addItem', 'Debris', (d, [item, t]) => {
    if (!item) return null;
    const ms = Math.max(0, (Number.isFinite(t) ? t : 10) * 1000);
    setTimeout(() => {
      if (!item.destroyed && (!env.canDestroy || env.canDestroy(item))) dm.destroy(item);
    }, ms);
    return null;
  });
  def('SetLegacyMaxItems', 'Debris', () => null);

  def('GetMinutesAfterMidnight getMinutesAfterMidnight', 'Lighting', (l) => minutesOf(l.props.get('TimeOfDay')));
  def('SetMinutesAfterMidnight setMinutesAfterMidnight', 'Lighting', (l, [m]) => { dm.setProp(l, 'TimeOfDay', todOf(+m || 0), { lua: true }); return null; });
  def('GetSunDirection', 'Lighting', (l) => T.v3(sunDirection(l)));
  def('GetMoonDirection', 'Lighting', (l) => T.v3(sunDirection(l).map((x) => -x)));

  def('GetPlayers getPlayers players', 'Players', (p) => T.list(p.children.filter((c) => c.ClassName === 'Player')));
  def('GetPlayerFromCharacter getPlayerFromCharacter playerFromCharacter', 'Players', (p, [ch]) => {
    if (!ch) return null;
    for (const c of p.children) if (c.ClassName === 'Player' && c.props.get('Character') === ch) return c;
    return null;
  });
  def('GetPlayerByUserId GetPlayerByID', 'Players', (p, [uid]) => {
    for (const c of p.children) if (c.ClassName === 'Player' && c.props.get('userId') === uid) return c;
    return null;
  });
  def('GetUserIdFromNameAsync', 'Players', (p, [n]) => (env.userIdFromName ? env.userIdFromName(String(n)).then((v) => [v]) : Promise.resolve([0])));
  def('GetNameFromUserIdAsync', 'Players', (p, [u]) => (env.nameFromUserId ? env.nameFromUserId(+u).then((v) => [v]) : Promise.resolve(['Player'])));
  def('Chat', 'Players', (p, [msg]) => { if (env.chat) env.chat(null, String(msg)); return null; });
  def('SetChatStyle', 'Players', () => null);

  def('LoadCharacter loadCharacter', 'Player', (pl) => (env.loadCharacter ? Promise.resolve(env.loadCharacter(pl)).then(() => []) : Promise.resolve([])));
  def('RemoveCharacter', 'Player', (pl) => { const c = pl.props.get('Character'); if (c) dm.destroy(c); return null; });
  def('ClearCharacterAppearance', 'Player', (pl) => {
    const c = pl.props.get('Character');
    if (c) for (const x of [...c.children]) if (x.isA('Accoutrement') || x.isA('Clothing') || x.ClassName === 'ShirtGraphic' || x.ClassName === 'BodyColors' || x.ClassName === 'CharacterMesh') dm.destroy(x);
    return null;
  });
  def('GetMouse', 'Player', (pl) => (env.mouseFor ? env.mouseFor(pl) : null));
  def('Kick', 'Player', (pl, [msg]) => { if (env.kick) env.kick(pl, msg ? String(msg) : ''); return null; });
  def('HasAppearanceLoaded', 'Player', () => true);
  def('IsInGroup isInGroup', 'Player', (pl, [g]) => (env.inGroup ? env.inGroup(pl, +g).then((v) => [!!v]) : Promise.resolve([false])));
  def('GetRankInGroup', 'Player', (pl, [g]) => (env.groupRank ? env.groupRank(pl, +g).then((v) => [v | 0]) : Promise.resolve([0])));
  def('GetRoleInGroup', 'Player', (pl, [g]) => (env.groupRole ? env.groupRole(pl, +g).then((v) => [String(v)]) : Promise.resolve(['Guest'])));
  def('IsFriendsWith isFriendsWith', 'Player', (pl, [u]) => (env.areFriends ? env.areFriends(pl, +u).then((v) => [!!v]) : Promise.resolve([false])));
  def('GetFriendsOnline', 'Player', () => Promise.resolve([T.list([])]));
  def('WaitForDataReady waitForDataReady', 'Player', () => Promise.resolve([true]));
  for (const [m, kind] of [['SaveNumber', 'n'], ['SaveString', 's'], ['SaveBoolean', 'b']]) {
    def(m, 'Player', (pl, [k, v]) => (env.saveData ? env.saveData(pl, String(k), kind, v).then(() => []) : Promise.resolve([])));
  }
  for (const [m, kind, d] of [['LoadNumber', 'n', 0], ['LoadString', 's', ''], ['LoadBoolean', 'b', false]]) {
    def(m, 'Player', (pl, [k]) => (env.loadData ? env.loadData(pl, String(k), kind).then((v) => [v ?? d]) : Promise.resolve([d])));
  }
  def('SaveInstance', 'Player', () => Promise.resolve([]));
  def('LoadInstance', 'Player', () => Promise.resolve([null]));
  def('Move', 'Player', (pl, [dir]) => { if (env.playerMove) env.playerMove(pl, dir); return null; });
  def('GetUnder13', 'Player', () => false);
  def('DistanceFromCharacter', 'Player', (pl, [p]) => {
    const ch = pl.props.get('Character');
    const h = ch && (ch.findChild('Head') || ch.findChild('Torso'));
    if (!h || !p) return 0;
    const cf = h.props.get('CFrame');
    return Math.hypot(cf[0] - p[0], cf[1] - p[1], cf[2] - p[2]);
  });

  def('GetTeams', 'Teams', (t) => T.list(t.children.filter((c) => c.ClassName === 'Team')));

  def('TakeDamage takeDamage', 'Humanoid', (h, [amt]) => {
    const ch = h.parent;
    if (ch && ch.findChildOfClass('ForceField')) return null;
    dm.setProp(h, 'Health', Math.max(0, h.props.get('Health') - (+amt || 0)), { lua: true });
    return null;
  });
  def('MoveTo moveTo', 'Humanoid', (h, [pos, part]) => {
    if (pos) dm.setProp(h, 'WalkToPoint', pos, { lua: true });
    dm.setProp(h, 'WalkToPart', part || null, { lua: true });
    if (env.humanoidMoveTo) env.humanoidMoveTo(h, pos, part);
    return null;
  });
  def('Move', 'Humanoid', (h, [dir]) => { if (env.humanoidMove) env.humanoidMove(h, dir); return null; });
  def('EquipTool', 'Humanoid', (h, [tool]) => { if (env.equipTool) env.equipTool(h, tool); return null; });
  def('UnequipTools', 'Humanoid', (h) => { if (env.unequipTools) env.unequipTools(h); return null; });
  def('LoadAnimation loadAnimation', 'Humanoid', (h, [anim]) => {
    if (!(anim instanceof Instance) || anim.ClassName !== 'Animation') throw new Error('LoadAnimation requires an Animation object');
    const tr = dm.create('AnimationTrack', null);
    tr.props.set('Name', anim.props.get('Name'));
    tr.props.set('Animation', anim);
    tr.data = { hum: h };
    return tr;
  });
  const trackOp = (tr, op, a, b, c) => {
    if (env.animate && tr.data && tr.data.hum) env.animate(tr, op, a, b, c);
    return null;
  };
  const optNum = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);
  def('Play play', 'AnimationTrack', (tr, [fade, weight, speed]) => trackOp(tr, 'play', optNum(fade), optNum(weight), optNum(speed)));
  def('Stop stop', 'AnimationTrack', (tr, [fade]) => trackOp(tr, 'stop', optNum(fade)));
  def('AdjustSpeed', 'AnimationTrack', (tr, [speed]) => trackOp(tr, 'speed', optNum(speed)));
  def('AdjustWeight', 'AnimationTrack', (tr, [weight, fade]) => trackOp(tr, 'weight', optNum(weight), optNum(fade)));
  def('GetState', 'Humanoid', (h) => T.e('HumanoidStateType', h.data && h.data.state != null ? h.data.state : 8));
  def('ChangeState', 'Humanoid', (h, [s]) => { if (env.changeState) env.changeState(h, s); return null; });
  def('SetStateEnabled', 'Humanoid', () => null);
  def('SetDesiredAngle', 'Motor', (m, [a]) => { dm.setProp(m, 'DesiredAngle', +a || 0, { lua: true }); return null; });
  def('GetPlayingAnimationTracks', 'Humanoid', (h) => T.list(env.playingTracks ? env.playingTracks(h) : []));

  def('Play play', 'Sound', (s) => { dm.setProp(s, 'IsPlaying', true, { force: true, op: 'play' }); if (env.sound) env.sound(s, 'play'); dm.emit(s, 'Played'); return null; });
  def('Stop stop', 'Sound', (s) => { dm.setProp(s, 'IsPlaying', false, { force: true, op: 'stop' }); if (env.sound) env.sound(s, 'stop'); dm.emit(s, 'Stopped'); return null; });
  def('Pause pause', 'Sound', (s) => { dm.setProp(s, 'IsPlaying', false, { force: true, op: 'pause' }); if (env.sound) env.sound(s, 'pause'); return null; });
  def('Resume resume', 'Sound', (s) => { dm.setProp(s, 'IsPlaying', true, { force: true, op: 'resume' }); if (env.sound) env.sound(s, 'resume'); return null; });

  def('LoadAsset loadAsset', 'InsertService', (s, [id]) => (env.loadAsset ? env.loadAsset(+id).then((m) => [m]) : Promise.reject(new Error('InsertService is not available'))));
  def('Insert', 'InsertService', (s, [m]) => { if (m) dm.setParent(m, dm.services.get('Workspace')); return null; });
  def('ApproveAssetId', 'InsertService', () => null);
  def('GetFreeModels GetFreeDecals GetBaseSets GetUserSets GetCollection', 'InsertService', () => T.list([]));

  def('AwardBadge', 'BadgeService', (s, [uid, bid]) => (env.awardBadge ? env.awardBadge(+uid, +bid).then((v) => [!!v]) : Promise.resolve([false])));
  def('UserHasBadge', 'BadgeService', (s, [uid, bid]) => (env.hasBadge ? env.hasBadge(+uid, +bid).then((v) => [!!v]) : Promise.resolve([false])));
  def('IsDisabled IsLegal', 'BadgeService', () => false);

  def('GetProductInfo', 'MarketplaceService', (s, [id]) => Promise.resolve([T.list([])]));
  def('PromptPurchase PromptProductPurchase PromptGamePassPurchase', 'MarketplaceService', () => null);
  def('PlayerOwnsAsset', 'MarketplaceService', () => Promise.resolve([false]));
  def('PlayerHasPass', 'GamePassService', () => false);
  def('Teleport TeleportToSpawnByName TeleportToPlaceInstance', 'TeleportService', (s, [placeId, player]) => { if (env.teleport) env.teleport(+placeId, player); return null; });
  def('SetTeleportGui GetTeleportSetting SetTeleportSetting', 'TeleportService', () => null);
  def('Preload', 'ContentProvider', () => null);
  def('SetBaseUrl', 'ContentProvider', () => null);
  def('AddTag RemoveTag', 'CollectionService', () => null);
  def('GetTagged', 'CollectionService', () => T.list([]));
  def('HasTag', 'CollectionService', () => false);
  def('GetCollection', 'CollectionService', (c, [cls]) => T.list(dm.root.descendants().filter((d) => d.ClassName === String(cls ?? ''))));
  def('IsServer', 'RunService', () => host.side === 'server');
  def('IsClient', 'RunService', () => host.side === 'client');
  def('IsStudio', 'RunService', () => false);
  def('IsRunMode IsRunning', 'RunService', () => true);
  def('Run Pause Reset Stop', 'RunService', () => null);
  def('BindToRenderStep UnbindFromRenderStep', 'RunService', () => null);
  def('GenerateGUID', 'HttpService', () => crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2));
  def('JSONEncode', 'HttpService', () => '{}');
  def('JSONDecode', 'HttpService', () => T.list([]));
  def('GetAsync PostAsync', 'HttpService', () => Promise.reject(new Error('Http requests are not enabled')));
  def('Chat', 'Chat', (c, [part, msg, color]) => { if (env.bubbleChat) env.bubbleChat(part, String(msg ?? ''), color); return null; });
  def('FilterStringForPlayerAsync FilterStringAsync', 'Chat', (c, [s]) => String(s ?? ''));
  def('AddSelectionParent AddSelectionTuple RemoveSelectionGroup', 'GuiService', () => null);
  def('IsKeyDown', 'UserInputService', (u, [k]) => (env.isKeyDown ? env.isKeyDown(k) : false));
  def('GetMouseLocation', 'UserInputService', () => T.v2(env.mouseLocation ? env.mouseLocation() : [0, 0]));
  def('IsLuaTouchControls', 'UserInputService', () => !!(env.touch && env.touch()));
  def('RotateCamera', 'UserInputService', (u, [d]) => { if (env.rotateCamera && Array.isArray(d)) env.rotateCamera(+d[0] || 0, +d[1] || 0); return null; });
  def('ZoomCamera', 'UserInputService', (u, [d]) => { if (env.zoomCamera) env.zoomCamera(+d || 0); return null; });
  def('MoveCharacter', 'Player', (pl, [v, max]) => { if (env.moveCharacter && Array.isArray(v)) env.moveCharacter(pl, +v[0] || 0, +v[1] || 0, +max || 1); return null; });
  def('JumpCharacter', 'Player', (pl) => { if (env.jumpCharacter) env.jumpCharacter(pl); return null; });
  def('GetScreenResolution', 'GuiService', () => T.v2(env.screenSize ? env.screenSize() : [1024, 768]));
  def('Create', 'TweenService', () => null);
  def('Message', 'TestService', (t, [m]) => { host.logs('print', String(m), null); return null; });
  def('Check Require Fail Error Warn Checkpoint Done', 'TestService', () => null);

  def('TweenPosition tweenPosition', 'GuiObject', (g, a) => tweenGui(host, g, { pos: a[0], easingDir: a[1], easingStyle: a[2], time: a[3], override: a[4] }));
  def('TweenSize tweenSize', 'GuiObject', (g, a) => tweenGui(host, g, { size: a[0], easingDir: a[1], easingStyle: a[2], time: a[3], override: a[4] }));
  def('TweenSizeAndPosition tweenSizeAndPosition', 'GuiObject', (g, a) => tweenGui(host, g, { size: a[0], pos: a[1], easingDir: a[2], easingStyle: a[3], time: a[4], override: a[5] }));
  def('CaptureFocus', 'TextBox', (t) => { if (env.focusTextBox) env.focusTextBox(t, true); return null; });
  def('ReleaseFocus', 'TextBox', (t) => { if (env.focusTextBox) env.focusTextBox(t, false); return null; });

  def('GetDisplayName', 'Instance', (i) => i.props.get('Name'));

  def('AddCoreScript', 'ScriptContext', (sc, [id, parent, name]) => { if (env.addCoreScript) env.addCoreScript(id | 0, parent || null, String(name ?? 'CoreScript')); return null; });
  def('AddStarterScript', 'ScriptContext', (sc, [id]) => { if (env.addCoreScript) env.addCoreScript(id | 0, sc, 'StarterScript'); return null; });
  def('RegisterLibrary', 'ScriptContext', (sc, [name, id]) => { host.libraries.set(String(name).replace(/^.*\//, ''), String(id)); return null; });
  def('LibraryRegistrationComplete', 'ScriptContext', () => null);
  def('SetTimeout SetCollectScriptStats', 'ScriptContext', () => null);
  def('GetCoreScripts', 'ScriptContext', () => T.list([]));
  def('__librarySource', 'DataModel', (g, [name]) => {
    const id = host.libraries.get(String(name));
    return id && env.coreSource ? env.coreSource(+id) ?? null : null;
  });
  def('__UserSettings', 'DataModel', () => host.userSettings());
  def('__settings', 'DataModel', () => host.globalSettings());
  def('GetFFlag GetFastFlag DefineFastFlag', 'DataModel', () => false);
  def('GetFFlag GetFastFlag', 'GlobalSettings', (g, [name]) => ENGINE_FLAGS.has(String(name)));
  def('GetFVariable GetFastVariable', 'DataModel', () => '');
  def('GetMaxQualityLevel', 'RenderSettings', () => 21);
  def('SetTutorialState', 'UserGameSettings', () => null);
  def('GetTutorialState InStudioMode', 'UserGameSettings', () => false);
  def('InFullScreen', 'UserGameSettings', () => !!(env.inFullscreen && env.inFullscreen()));
  for (const name of ['AddKey', 'RemoveKey', 'AddSpecialKey', 'RemoveSpecialKey']) {
    def(name, 'GuiService', (g, [k], raw) => {
      const key = raw[0] && raw[0].tag === 'e' ? 'special:' + raw[0].v[1] : String(k ?? '').toLowerCase();
      if (name.startsWith('Add')) host.guiKeys.add(key);
      else host.guiKeys.delete(key);
      return null;
    });
  }
  def('SetGlobalGuiInset', 'GuiService', (g, [l, t, r, b]) => { if (env.setGuiInset) env.setGuiInset([+l || 0, +t || 0, +r || 0, +b || 0]); return null; });
  def('SetGlobalSizeOffsetPixel', 'GuiService', (g, [x, y]) => { if (env.setGuiInset) env.setGuiInset([0, 0, 0, -(+y || 0)]); return null; });
  def('OpenBrowserWindow CloseBrowserWindow', 'GuiService', () => null);
  def('IsTenFootInterface', 'GuiService', () => false);
  def('IsTouchDevice', 'GuiService', () => !!(env.touch && env.touch()));
  def('GetCoreGuiEnabled', 'StarterGui', () => true);
  def('SetCoreGuiEnabled SetCore', 'StarterGui', () => null);
  def('GetLogHistory', 'LogService', () => T.list([]));
  def('Chat chat', 'Players', (p, [msg]) => { if (env.chat) env.chat(null, String(msg ?? ''), 'all'); return null; });
  def('TeamChat teamChat', 'Players', (p, [msg]) => { if (env.chat) env.chat(null, String(msg ?? ''), 'team'); return null; });
  def('WhisperChat', 'Players', (p, [msg, target]) => { if (env.chat) env.chat(target || null, String(msg ?? ''), 'whisper'); return null; });
  def('ReportAbuse', 'Players', () => null);
  def('GetUseCoreScriptHealthBar', 'Players', () => true);
  def('SetOldSchoolBackpack', 'LocalBackpack', () => null);
  def('GetOldSchoolBackpack', 'LocalBackpack', () => false);
  def('RequestFriendship RevokeFriendship', 'Player', () => null);
  def('GetFriendStatus', 'Player', () => T.e('FriendStatus', 1));
  def('SetSuperSafeChat SetUnder13 SetMembershipType SetAccountAge', 'Player', () => null);
  def('SignalPromptProductPurchaseFinished SignalPromptPurchaseFinished SignalClientPurchaseSuccess SignalServerLuaDialogClosed', 'MarketplaceService', () => null);
  def('TeleportCancel', 'TeleportService', () => null);
  def('HttpGetAsync HttpPostAsync', 'DataModel', () => Promise.reject(new Error('Http requests are not enabled')));
  return M;
}

const tweens = new Map();

function easing(style, dir, t) {
  const f = {
    0: (x) => x,
    1: (x) => 1 - Math.cos((x * Math.PI) / 2),
    2: (x) => 2.70158 * x * x * x - 1.70158 * x * x,
    3: (x) => x * x,
    4: (x) => x * x * x * x,
    5: (x) => x * x * x * x * x,
    6: (x) => 1 - bounceOut(1 - x),
    7: (x) => (x <= 0 ? 0 : x >= 1 ? 1 : -Math.pow(2, 10 * x - 10) * Math.sin((x * 10 - 10.75) * ((2 * Math.PI) / 3))),
  }[style] || ((x) => x * x);
  if (dir === 0) return f(t);
  if (dir === 1) return 1 - f(1 - t);
  return t < 0.5 ? f(t * 2) / 2 : 1 - f((1 - t) * 2) / 2;
}

function bounceOut(x) {
  const n1 = 7.5625, d1 = 2.75;
  if (x < 1 / d1) return n1 * x * x;
  if (x < 2 / d1) return n1 * (x -= 1.5 / d1) * x + 0.75;
  if (x < 2.5 / d1) return n1 * (x -= 2.25 / d1) * x + 0.9375;
  return n1 * (x -= 2.625 / d1) * x + 0.984375;
}

function tweenGui(host, g, o) {
  const kinds = [o.pos ? 'pos' : null, o.size ? 'size' : null].filter(Boolean);
  let slot = tweens.get(g);
  if (!slot) tweens.set(g, (slot = {}));
  if (!o.override && kinds.some((k) => slot[k])) return false;
  for (const k of kinds) if (slot[k]) clearInterval(slot[k]);
  const time = Number.isFinite(o.time) ? o.time : 1;
  const from = { pos: g.props.get('Position').slice(), size: g.props.get('Size').slice() };
  const dir = typeof o.easingDir === 'string' ? ENUMS.EasingDirection[o.easingDir] ?? 1 : o.easingDir ?? 1;
  const style = typeof o.easingStyle === 'string' ? ENUMS.EasingStyle[o.easingStyle] ?? 3 : o.easingStyle ?? 3;
  const t0 = Date.now();
  const done = () => {
    clearInterval(iv);
    for (const k of kinds) if (slot[k] === iv) delete slot[k];
    if (!slot.pos && !slot.size) tweens.delete(g);
  };
  const tick = () => {
    if (g.destroyed) return done();
    const k = time <= 0 ? 1 : Math.min(1, (Date.now() - t0) / 1000 / time);
    const e = easing(style, dir, k);
    if (o.pos) host.dm.setProp(g, 'Position', from.pos.map((v, i) => v + (o.pos[i] - v) * e), { lua: true });
    if (o.size) host.dm.setProp(g, 'Size', from.size.map((v, i) => v + (o.size[i] - v) * e), { lua: true });
    if (k >= 1) done();
  };
  const iv = setInterval(tick, 1000 / 30);
  for (const k of kinds) slot[k] = iv;
  tick();
  return true;
}

export function sunDirection(l) {
  const min = minutesOf(l.props.get('TimeOfDay'));
  const lat = (l.props.get('GeographicLatitude') * Math.PI) / 180;
  const h = ((min / 1440) * 2 - 1) * Math.PI;
  const x = -Math.sin(h);
  const y = Math.cos(h) * Math.cos(lat - 0.4);
  const z = Math.cos(h) * Math.sin(lat - 0.4);
  const l2 = Math.hypot(x, y, z) || 1;
  return [x / l2, y / l2, z / l2];
}

function buildComputed(host) {
  const M = new Map();
  const def = (names, cls, fn) => {
    for (const n of names.split(' ')) {
      if (!M.has(n)) M.set(n, []);
      M.get(n).push([cls, fn]);
    }
  };
  def('Position position', 'BasePart', (p) => {
    const cf = p.props.get('CFrame');
    return T.v3([cf[0], cf[1], cf[2]]);
  });
  def('GripPos', 'Tool', (t) => { const g = t.props.get('Grip'); return T.v3([g[0], g[1], g[2]]); });
  def('GripRight', 'Tool', (t) => { const g = t.props.get('Grip'); return T.v3([g[3], g[6], g[9]]); });
  def('GripUp', 'Tool', (t) => { const g = t.props.get('Grip'); return T.v3([g[4], g[7], g[10]]); });
  def('GripForward', 'Tool', (t) => { const g = t.props.get('Grip'); return T.v3([-g[5], -g[8], -g[11]]); });
  def('Rotation', 'BasePart', (p) => {
    const c = p.props.get('CFrame');
    const r02 = Math.max(-1, Math.min(1, c[5]));
    const y = Math.asin(r02);
    let x, z;
    if (Math.abs(r02) < 0.99999) {
      x = Math.atan2(-c[8], c[11]);
      z = Math.atan2(-c[4], c[3]);
    } else {
      x = Math.atan2(c[10], c[7]);
      z = 0;
    }
    return T.v3([x * deg, y * deg, z * deg]);
  });
  def('Color', 'BasePart', (p) => {
    const b = brick(p.props.get('BrickColor'));
    return T.c3([b.r, b.g, b.b]);
  });
  def('Torso', 'Humanoid', (h) => (h.parent ? h.parent.findChild('Torso') || h.parent.findChild('HumanoidRootPart') : null));
  def('LeftLeg', 'Humanoid', (h) => (h.parent ? h.parent.findChild('Left Leg') : null));
  def('RightLeg', 'Humanoid', (h) => (h.parent ? h.parent.findChild('Right Leg') : null));
  def('NumPlayers numPlayers', 'Players', (p) => p.children.filter((c) => c.ClassName === 'Player').length);
  def('CoordinateFrame', 'Camera', (c) => T.cf(c.props.get('CFrame')));
  def('MaxPlayers', 'Players', (p) => p.props.get('MaxPlayers'));
  def('Occupant', 'Seat', (s) => s.props.get('Occupant'));
  def('Hit hit', 'Mouse', (m) => T.cf(m.props.get('Hit')));
  def('UnitRay', 'Mouse', (m) => {
    const o = m.props.get('Origin');
    const h = m.props.get('Hit');
    const d = [h[0] - o[0], h[1] - o[1], h[2] - o[2]];
    const l = Math.hypot(...d) || 1;
    return T.ray([o[0], o[1], o[2]], d.map((v) => v / l));
  });
  def('Character character', 'Player', (p) => p.props.get('Character'));
  def('Backpack', 'Player', (p) => p.findChildOfClass('Backpack'));
  def('PlayerGui', 'Player', (p) => p.findChildOfClass('PlayerGui'));
  def('TextFits', 'GuiObject', () => true);
  return M;
}

function buildSetters(host) {
  const dm = host.dm;
  const env = host.env;
  const M = new Map();
  const def = (names, cls, fn) => {
    for (const n of names.split(' ')) {
      if (!M.has(n)) M.set(n, []);
      M.get(n).push([cls, fn]);
    }
  };
  const v3 = (a) => {
    if (!a || a.tag !== 'v3') throw new Error("bad argument #3 to '?' (Vector3 expected)");
    return a.v;
  };
  def('Position position', 'BasePart', (p, a) => {
    const v = v3(a);
    if (env.breakJoints) env.breakJoints(p);
    const cf = p.props.get('CFrame');
    dm.setProp(p, 'CFrame', C.withPos(cf, v[0], v[1], v[2]), { lua: true, position: true });
  });
  const gripSet = (idx, sign) => (t, a) => {
    const v = v3(a);
    const g = t.props.get('Grip').slice();
    for (let i = 0; i < 3; i++) g[idx[i]] = v[i] * sign;
    if (!C.isFiniteCF(g)) return;
    dm.setProp(t, 'Grip', g, { lua: true });
  };
  def('GripPos', 'Tool', gripSet([0, 1, 2], 1));
  def('GripRight', 'Tool', gripSet([3, 6, 9], 1));
  def('GripUp', 'Tool', gripSet([4, 7, 10], 1));
  def('GripForward', 'Tool', gripSet([5, 8, 11], -1));
  def('Rotation', 'BasePart', (p, a) => {
    const v = v3(a);
    const cf = p.props.get('CFrame');
    const r = C.angles(v[0] / deg, v[1] / deg, v[2] / deg);
    if (env.breakJoints) env.breakJoints(p);
    dm.setProp(p, 'CFrame', C.withPos(r, cf[0], cf[1], cf[2]), { lua: true });
  });
  def('CFrame', 'BasePart', (p, a) => {
    if (!a || a.tag !== 'cf') throw new Error("bad argument #3 to '?' (CFrame expected)");
    const v = a.v;
    if (!C.isFiniteCF(v)) return;
    dm.setProp(p, 'CFrame', C.orthonormalize(v), { lua: true });
  });
  def('Size size', 'BasePart', (p, a) => {
    const v = v3(a);
    dm.setProp(p, 'Size', snapSize(p, v), { lua: true });
  });
  def('Color', 'BasePart', (p, a) => {
    if (!a || a.tag !== 'c3') throw new Error("bad argument #3 to '?' (Color3 expected)");
    dm.setProp(p, 'BrickColor', nearestBrick(a.v[0], a.v[1], a.v[2]), { lua: true });
  });
  def('Health', 'Humanoid', (h, a) => {
    if (!a || (a.tag !== 'n' && a.tag !== 's')) throw new Error("bad argument #3 to '?' (number expected)");
    const v = Math.max(0, Math.min(+a.v || 0, h.props.get('MaxHealth')));
    dm.setProp(h, 'Health', v, { lua: true });
  });
  def('MaxHealth maxHealth', 'Humanoid', (h, a) => {
    const v = Math.max(0, +a.v || 0);
    dm.setProp(h, 'MaxHealth', v, { lua: true });
    if (h.props.get('Health') > v) dm.setProp(h, 'Health', v, { lua: true });
  });
  def('Value', 'IntConstrainedValue', (i, a) => {
    const v = Math.max(i.props.get('MinValue'), Math.min(i.props.get('MaxValue'), Math.trunc(+a.v || 0)));
    dm.setProp(i, 'Value', v, { lua: true });
  });
  def('CoordinateFrame', 'Camera', (c, a) => {
    if (!a || a.tag !== 'cf') throw new Error("bad argument #3 to '?' (CFrame expected)");
    dm.setProp(c, 'CFrame', a.v, { lua: true });
  });
  def('Character character', 'Player', (p, a) => {
    const v = a && a.tag === 'i' ? a.v : null;
    dm.setProp(p, 'Character', v, { lua: true });
  });
  def('TargetFilter', 'Mouse', (m, a) => dm.setProp(m, 'TargetFilter', a && a.tag === 'i' ? a.v : null, { lua: true }));
  def('Icon', 'Mouse', (m, a) => dm.setProp(m, 'Icon', a ? String(a.v ?? '') : '', { lua: true }));
  return M;
}

export function snapSize(p, v) {
  let [x, y, z] = v.map((n) => (Number.isFinite(n) ? Math.abs(n) : 1));
  const ff = p.info.all.has('FormFactor') ? p.props.get('FormFactor') : 3;
  const cls = p.ClassName;
  if (cls === 'TrussPart') {
    return [Math.max(2, Math.round(x / 2) * 2), Math.max(2, Math.round(y / 2) * 2), Math.max(2, Math.round(z / 2) * 2)];
  }
  if (ff === 0) {
    x = Math.max(1, Math.round(x)); y = Math.max(1, Math.round(y)); z = Math.max(1, Math.round(z));
  } else if (ff === 1) {
    x = Math.max(1, Math.round(x)); y = Math.max(1.2, Math.round(y / 1.2) * 1.2); z = Math.max(1, Math.round(z));
  } else if (ff === 2) {
    x = Math.max(1, Math.round(x)); y = Math.max(0.4, Math.round(y / 0.4) * 0.4); z = Math.max(1, Math.round(z));
  } else {
    x = Math.max(0.2, x); y = Math.max(0.2, y); z = Math.max(0.2, z);
  }
  return [x, y, z];
}

function luaStr(s) {
  return '"' + String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n') + '"';
}

let dataCache = null;
function luaData() {
  if (dataCache) return dataCache;
  const b = [];
  for (const c of BRICK.values()) b.push(`[${c.n}]={name=${luaStr(c.name)},r=${c.r},g=${c.g},b=${c.b}}`);
  const e = [];
  for (const [name, items] of Object.entries(ENUMS)) {
    const its = Object.entries(items).map(([k, v]) => `[${luaStr(k)}]=${v}`).join(',');
    e.push(`[${luaStr(name)}]={${its}}`);
  }
  dataCache = `{bricks={${b.join(',')}},enums={${e.join(',')}},palette={${brickPalette().join(',')}}}`;
  return dataCache;
}

export { minutesOf, todOf, modelCFrame, partsOf, boundsOf, encodeAny, decodeArgs, enumName };
