import { canonicalProp, ENUMS, classInfo } from './classes.js';
import { brick, nearestBrick } from './brickcolor.js';
import * as C from './cframe.js';
import { parseGroups, serializeGroups, groupsCollide, MAX_COLLISION_GROUPS } from './collisiongroups.js';

export const LUA_CLASS = {
  GetPropertyChangedSignal: ['Instance'],
  FireServer: ['RemoteEvent'], FireClient: ['RemoteEvent'], FireAllClients: ['RemoteEvent'],
  InvokeServer: ['RemoteFunction'], InvokeClient: ['RemoteFunction'],
  RegisterSetCore: ['StarterGui'], RegisterGetCore: ['StarterGui'], SetCore: ['StarterGui'], GetCore: ['StarterGui'],
  BindToRenderStep: ['RunService'], UnbindFromRenderStep: ['RunService'],
  Create: ['TweenService'], Play: ['TweenBase'], Pause: ['TweenBase'], Cancel: ['TweenBase'],
  BindActionAtPriority: ['ContextActionService'], BindCoreAction: ['ContextActionService'], BindCoreActionAtPriority: ['ContextActionService'],
  UnbindCoreAction: ['ContextActionService'], GetAllBoundCoreActionInfo: ['ContextActionService'], GetBoundCoreActionInfo: ['ContextActionService'],
  GetCurrentLocalToolIcon: ['ContextActionService'],
  GetDataStore: ['DataStoreService'], GetGlobalDataStore: ['DataStoreService'], GetOrderedDataStore: ['DataStoreService'],
  GetAsync: ['GlobalDataStore'], SetAsync: ['GlobalDataStore'], UpdateAsync: ['GlobalDataStore'], IncrementAsync: ['GlobalDataStore'],
  RemoveAsync: ['GlobalDataStore'], OnUpdate: ['GlobalDataStore'], GetSortedAsync: ['OrderedDataStore'],
  GetAssetThumbnailAsync: ['AssetService'],
  BindToClose: ['DataModel'],
  GetGroupsAsync: ['GroupService'], GetGroupInfoAsync: ['GroupService'],
  JSONEncode: ['HttpService'], JSONDecode: ['HttpService'], UrlEncode: ['HttpService'],
  SetEntries: ['LocalizationTable'], GetEntries: ['LocalizationTable'], GetString: ['LocalizationTable'], GetTranslator: ['LocalizationTable'],
};

export const PLATFORM = { Windows: 0, OSX: 1, IOS: 2, Android: 3, XBoxOne: 4, PS4: 5, PS3: 6, XBox360: 7, WiiU: 8, NX: 9, Ouya: 10, AndroidTV: 11, Chromecast: 12, Linux: 13, SteamOS: 14, WebOS: 15, DOS: 16, BeOS: 17, UWP: 18, None: 19 };

const FONT_SIZES = [8, 9, 10, 11, 12, 14, 18, 24, 36, 48, 28, 32, 42, 60, 96];
export function fontSizeOf(px) {
  let best = 0;
  for (let i = 0; i < FONT_SIZES.length; i++) if (Math.abs(FONT_SIZES[i] - px) < Math.abs(FONT_SIZES[best] - px)) best = i;
  return best;
}
export function textSizeOf(fontSize) {
  return FONT_SIZES[fontSize | 0] ?? 12;
}

const BODY = ['Head', 'Torso', 'LeftArm', 'RightArm', 'LeftLeg', 'RightLeg'];

export function linkProps(dm, inst, name, value) {
  const all = inst.info.all;
  if (name === 'BrickColor' && all.has('Color') && all.get('Color').type === 'C3') {
    const b = brick(value);
    return [['Color', [b.r, b.g, b.b]]];
  }
  if (name === 'Color' && all.has('BrickColor') && all.get('BrickColor').type === 'BC' && Array.isArray(value)) {
    return [['BrickColor', nearestBrick(value[0], value[1], value[2])]];
  }
  if (inst.ClassName === 'BodyColors') {
    for (const b of BODY) {
      if (name === b + 'Color' && all.has(b + 'Color3')) {
        const c = brick(value);
        return [[b + 'Color3', [c.r, c.g, c.b]]];
      }
      if (name === b + 'Color3' && Array.isArray(value)) return [[b + 'Color', nearestBrick(value[0], value[1], value[2])]];
    }
  }
  if (name === 'TextSize' && all.has('FontSize')) return [['FontSize', fontSizeOf(value)]];
  if (name === 'FontSize' && all.has('TextSize')) return [['TextSize', textSizeOf(value)]];
  return null;
}

function orientationOf(cf) {
  const r12 = Math.max(-1, Math.min(1, cf[8]));
  const x = Math.asin(-r12);
  let y, z;
  if (Math.abs(r12) < 0.99999) {
    y = Math.atan2(cf[5], cf[11]);
    z = Math.atan2(cf[6], cf[7]);
  } else {
    y = Math.atan2(-cf[9], cf[3]);
    z = 0;
  }
  const d = 180 / Math.PI;
  return [x * d, y * d, z * d];
}

function fromOrientation(o) {
  const r = Math.PI / 180;
  return C.mul(C.mul(C.angles(0, o[1] * r, 0), C.angles(o[0] * r, 0, 0)), C.angles(0, 0, o[2] * r));
}

function teamOf(dm, pl) {
  if (pl.props.get('Neutral')) return null;
  const teams = dm.services.get('Teams');
  if (!teams) return null;
  const tc = pl.props.get('TeamColor');
  return teams.children.find((t) => t.ClassName === 'Team' && t.props.get('TeamColor') === tc) || null;
}

export function installMethods2018(def, host, { T, multi, Instance }) {
  const dm = host.dm;
  const env = host.env;
  const ev = (type, name) => T.e(type, ENUMS[type][name]);
  def('__hasProperty', 'Instance', (i, [p]) => {
    const n = canonicalProp(i.ClassName, String(p));
    if (n && i.info.all.has(n)) return true;
    const comp = host.computed && host.computed.get(String(p));
    return !!(comp && comp.some(([c]) => i.isA(c)));
  });
  def('__remote', 'RemoteEvent', (r, args, raw) => {
    if (env.remote) env.remote(r, raw[0] ? raw[0].v : '', raw.slice(1));
    return null;
  });
  def('__invokeServer', 'RemoteFunction', (r, args, raw) => (env.invoke ? env.invoke(r, null, raw) : Promise.resolve([false, 'RemoteFunction is not available'])));
  def('__invokeClient', 'RemoteFunction', (r, args, raw) => (env.invoke ? env.invoke(r, raw[0] && raw[0].v, raw.slice(1)) : Promise.resolve([false, 'RemoteFunction is not available'])));
  def('__invokeResult', 'RemoteFunction', (r, args, raw) => {
    if (env.invokeResult) env.invokeResult(r, raw[0] ? raw[0].v : 0, raw.slice(1));
    return null;
  });
  def('__newTween', 'TweenService', (s, [target]) => {
    const tw = dm.create('Tween', null);
    tw.props.set('Name', 'Tween');
    if (tw.info.all.has('Instance')) tw.props.set('Instance', target || null);
    return tw;
  });
  def('AddCoreScriptLocal', 'ScriptContext', (sc, [name, parent]) => {
    if (env.addCoreScriptLocal) env.addCoreScriptLocal(String(name), parent || null);
    return null;
  });
  def('GetRobloxVersion', 'RunService', () => '0.338.0.202976');
  def('IsFocused', 'TextBox', (tb) => !!(env.focusedTextBox && env.focusedTextBox() === tb));
  def('__dataStore', 'DataStoreService', (s, [name, scope, ordered]) => {
    if (host.side !== 'server') throw new Error('DataStore can\'t be accessed from client');
    const key = `${ordered ? 'o' : 'g'}|${scope}|${name}`;
    if (!host.dataStores) host.dataStores = new Map();
    let ds = host.dataStores.get(key);
    if (!ds) {
      ds = dm.create(ordered ? 'OrderedDataStore' : 'GlobalDataStore', null);
      ds.props.set('Name', String(name));
      ds.data = { key };
      host.dataStores.set(key, ds);
    }
    return ds;
  });
  def('__dsGet', 'GlobalDataStore', (ds, [k]) => (env.dataStore ? env.dataStore.get(ds.data.key, String(k)) : null) ?? null);
  def('__dsSet', 'GlobalDataStore', (ds, [k, json]) => {
    if (env.dataStore) env.dataStore.set(ds.data.key, String(k), json == null ? null : String(json));
    return null;
  });
  def('__dsSorted', 'OrderedDataStore', (ds, [asc, size]) => T.list((env.dataStore ? env.dataStore.entries(ds.data.key) : []).map(([k, v]) => [k, +JSON.parse(v) || 0]).sort((a, b) => (asc ? a[1] - b[1] : b[1] - a[1])).slice(0, Math.max(1, Math.min(100, size | 0 || 50))).map(([k, v]) => T.dict({ key: k, value: v }))));
  def('GetPivot', 'Model', (m) => {
    const pp = m.props.get('PrimaryPart');
    if (pp && pp.isDescendantOf(m)) return T.cf(pp.props.get('CFrame'));
    const parts = m.descendants().filter((d) => d.isA('BasePart'));
    if (!parts.length) return T.cf(C.cf(0, 0, 0));
    let lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
    for (const p of parts) {
      const cf = p.props.get('CFrame'), sz = p.props.get('Size');
      for (let k = 0; k < 3; k++) {
        const e = Math.abs(cf[3 + k * 3]) * sz[0] / 2 + Math.abs(cf[4 + k * 3]) * sz[1] / 2 + Math.abs(cf[5 + k * 3]) * sz[2] / 2;
        lo[k] = Math.min(lo[k], cf[k] - e);
        hi[k] = Math.max(hi[k], cf[k] + e);
      }
    }
    return T.cf(C.cf((lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, (lo[2] + hi[2]) / 2));
  });
  def('GetPivot', 'BasePart', (p) => T.cf(p.props.get('CFrame')));
  def('PivotTo', 'BasePart', (p, [cf]) => {
    if (cf && C.isFiniteCF(cf)) dm.setProp(p, 'CFrame', C.orthonormalize(cf), { lua: true });
    return null;
  });
  def('PivotTo', 'Model', (m, [cf]) => {
    if (!cf || !C.isFiniteCF(cf)) return null;
    const pivot = host.methods.get('GetPivot').find(([c]) => c === 'Model')[1](m).v;
    const rel = C.mul(cf, C.inv(pivot));
    for (const p of m.descendants()) if (p.isA('BasePart')) dm.setProp(p, 'CFrame', C.orthonormalize(C.mul(rel, p.props.get('CFrame'))), { lua: true, model: true });
    return null;
  });
  def('IsFinishedReplicating', 'ReplicatedFirst', () => true);
  def('ApplyLayout', 'UIGridStyleLayout', () => null);
  def('SetDefaultLoadingGuiRemoved', 'ReplicatedFirst', () => { if (env.removeLoadingGui) env.removeLoadingGui(); return null; });
  def('GetErrorMessage', 'GuiService', () => (env.errorMessage ? String(env.errorMessage() || '') : ''));
  def('GetAssetThumbnailAsync', 'AssetService', (s, [id]) => Promise.resolve([env.placeThumbnailUrl ? env.placeThumbnailUrl(+id || 0) : '', true]));
  def('GetTopbarTransparency', 'PlayerGui', (pg) => (pg.data && pg.data.topbar != null ? pg.data.topbar : 0.5));
  def('SetTopbarTransparency', 'PlayerGui', (pg, [v]) => {
    const t = Math.max(0, Math.min(1, +v || 0));
    pg.data = Object.assign(pg.data || {}, { topbar: t });
    dm.emit(pg, 'TopbarTransparencyChangedSignal', t);
    return null;
  });
  def('GetService', 'GlobalSettings', (g, [name]) => {
    const n = String(name ?? '');
    let c = g.children.find((x) => x.ClassName === n || x.props.get('Name') === n);
    if (!c) {
      c = dm.create(classInfo(n) ? n : 'Instance', null);
      c.props.set('Name', n);
      dm.setParent(c, g);
    }
    return c;
  });
  def('IsEdit', 'RunService', () => false);
  def('Set3dRenderingEnabled', 'RunService', (r, [on]) => { if (env.set3d) env.set3d(!!on); return null; });
  def('SetCoreGuiEnabled', 'StarterGui', (s, [type, on], raw) => {
    const t = raw[0] && raw[0].tag === 'e' ? raw[0].v[1] : typeof type === 'number' ? type : ENUMS.CoreGuiType[String(type)];
    if (!host.coreGui) host.coreGui = new Map();
    const all = ENUMS.CoreGuiType.All;
    const list = t === all ? Object.values(ENUMS.CoreGuiType).filter((v) => v !== all) : [t];
    for (const x of list) host.coreGui.set(x, !!on);
    dm.emit(s, 'CoreGuiChangedSignal', T.e('CoreGuiType', t), !!on);
    return null;
  });
  def('GetCoreGuiEnabled', 'StarterGui', (s, [type], raw) => {
    const t = raw[0] && raw[0].tag === 'e' ? raw[0].v[1] : typeof type === 'number' ? type : ENUMS.CoreGuiType[String(type)];
    if (!host.coreGui) return true;
    if (t === ENUMS.CoreGuiType.All) return [...host.coreGui.values()].every(Boolean);
    return host.coreGui.get(t) !== false;
  });
  const wsOf = () => dm.services.get('Workspace');
  const groupTable = () => parseGroups(wsOf() ? wsOf().props.get('CollisionGroups') : '');
  const saveGroups = (groups) => { if (wsOf()) dm.setProp(wsOf(), 'CollisionGroups', serializeGroups(groups)); };
  const cloneGroups = () => groupTable().groups.map((g) => ({ ...g }));
  const needGroup = (name, n) => {
    const g = groupTable().byName.get(String(name));
    if (!g) throw new Error(`Parameter ${n} must be a valid collision group name`);
    return g;
  };
  def('GetPlayer', 'NetworkReplicator', (r) => (r.data && r.data.player && !r.data.player.destroyed ? r.data.player : null));
  def('CloseConnection', 'NetworkReplicator', (r) => {
    const pl = r.data && r.data.player;
    if (pl && env.kick) env.kick(pl, 'You have been disconnected');
    return null;
  });
  def('GetRakStatsString', 'NetworkReplicator', () => '');
  def('__CloseBound', 'DataModel', () => {
    host.closeBound = (host.closeBound || 0) + 1;
    return null;
  });
  def('CreateCollisionGroup', 'PhysicsService', (ps, [name]) => {
    name = String(name ?? '');
    if (!name) throw new Error('Collision group name must be a non-empty string');
    const groups = cloneGroups();
    if (groups.some((g) => g.name === name)) throw new Error('Could not create collision group, one with that name already exists.');
    let id = 1;
    while (groups.some((g) => g.id === id)) id++;
    if (id >= MAX_COLLISION_GROUPS) throw new Error('Could not create collision group, the maximum number of collision groups has been reached.');
    let mask = 1 << id;
    for (const g of groups) {
      g.mask |= 1 << id;
      mask |= 1 << g.id;
    }
    groups.push({ name, id, mask });
    saveGroups(groups);
    return id;
  });
  def('CollisionGroupSetCollidable', 'PhysicsService', (ps, [a, b, on]) => {
    const ga = needGroup(a, 1), gb = needGroup(b, 2);
    const groups = cloneGroups();
    const A = groups.find((g) => g.id === ga.id), B = groups.find((g) => g.id === gb.id);
    if (on) {
      A.mask |= 1 << B.id;
      B.mask |= 1 << A.id;
    } else {
      A.mask &= ~(1 << B.id);
      B.mask &= ~(1 << A.id);
    }
    saveGroups(groups);
    return null;
  });
  def('CollisionGroupsAreCollidable', 'PhysicsService', (ps, [a, b]) => groupsCollide(groupTable(), needGroup(a, 1).id, needGroup(b, 2).id));
  def('GetCollisionGroupId', 'PhysicsService', (ps, [name]) => needGroup(name, 1).id);
  def('GetCollisionGroupName', 'PhysicsService', (ps, [id]) => {
    const g = groupTable().byId.get(+id);
    if (!g) throw new Error('Parameter 1 must be a valid collision group id');
    return g.name;
  });
  def('GetCollisionGroups', 'PhysicsService', () => T.list(groupTable().groups.map((g) => T.dict({ name: g.name, id: g.id, mask: g.mask }))));
  def('GetMaxCollisionGroups', 'PhysicsService', () => MAX_COLLISION_GROUPS);
  def('SetPartCollisionGroup', 'PhysicsService', (ps, [part, name]) => {
    if (!(part instanceof Instance) || !part.isA('BasePart')) throw new Error('Parameter 1 must be a BasePart');
    dm.setProp(part, 'CollisionGroupId', needGroup(name, 2).id, { lua: true });
    return null;
  });
  def('CollisionGroupContainsPart', 'PhysicsService', (ps, [name, part]) => {
    if (!(part instanceof Instance) || !part.isA('BasePart')) throw new Error('Parameter 2 must be a BasePart');
    return (part.props.get('CollisionGroupId') | 0) === needGroup(name, 1).id;
  });
  def('RemoveCollisionGroup', 'PhysicsService', (ps, [name]) => {
    const g = needGroup(name, 1);
    if (g.id === 0) throw new Error('Cannot remove the default collision group');
    const groups = cloneGroups().filter((x) => x.id !== g.id);
    for (const x of groups) x.mask &= ~(1 << g.id);
    saveGroups(groups);
    for (const d of dm.root.descendants()) if (d.isA('BasePart') && (d.props.get('CollisionGroupId') | 0) === g.id) dm.setProp(d, 'CollisionGroupId', 0, { lua: true });
    return null;
  });
  def('RenameCollisionGroup', 'PhysicsService', (ps, [from, to]) => {
    const g = needGroup(from, 1);
    to = String(to ?? '');
    if (!to) throw new Error('Collision group name must be a non-empty string');
    const groups = cloneGroups();
    if (groups.some((x) => x.name === to && x.id !== g.id)) throw new Error('Could not rename collision group, one with that name already exists.');
    groups.find((x) => x.id === g.id).name = to;
    saveGroups(groups);
    return null;
  });
  def('GetGuiInset', 'GuiService', () => multi(T.v2(env.guiInsetTopLeft ? env.guiInsetTopLeft() : [0, 36]), T.v2([0, 0])));
  def('SetMenuIsOpen', 'GuiService', (g, [open]) => {
    dm.setProp(g, 'MenuIsOpen', !!open);
    dm.emit(g, open ? 'MenuOpened' : 'MenuClosed');
    if (env.menuOpen) env.menuOpen(!!open);
    return null;
  });
  def('ToggleFullscreen ToggleFullScreen', 'GuiService', () => { if (env.verb) env.verb('ToggleFullScreen'); return null; });
  def('CloseInspectMenu InspectPlayerFromUserId InspectPlayerFromUserIdWithCtx BroadcastNotification SetGameplayPausedNotificationEnabled ClearError SetPurchasePromptIsShown SetSafeZoneOffsets SetUiMessage', 'GuiService', () => null);
  def('GetBrickCount', 'GuiService', () => dm.services.get('Workspace').descendants().filter((d) => d.isA('BasePart')).length);
  def('GetResolutionScale', 'GuiService', () => 1);
  def('GetUiMessage', 'GuiService', () => '');
  def('GetClosestDialogToPosition', 'GuiService', () => null);
  def('ShowStatsBasedOnInputString CloseStatsBasedOnInputString', 'GuiService', () => false);
  def('GetPlatform', 'UserInputService', () => T.e('Platform', env.platform ? env.platform() : 0));
  def('GetMouseDelta', 'UserInputService', () => T.v2(env.mouseDelta ? env.mouseDelta() : [0, 0]));
  def('IsMouseButtonPressed', 'UserInputService', (u, [b], raw) => !!(env.mouseButtonDown && env.mouseButtonDown(raw[0] && raw[0].tag === 'e' ? raw[0].v[1] : b | 0)));
  def('GetKeysPressed', 'UserInputService', () => T.list(env.keysPressed ? env.keysPressed() : []));
  def('GetLastInputType', 'UserInputService', () => T.e('UserInputType', env.lastInputType ? env.lastInputType() : ENUMS.UserInputType.Keyboard));
  def('GetFocusedTextBox', 'UserInputService', () => (env.focusedTextBox ? env.focusedTextBox() : null));
  def('GetGamepadConnected IsNavigationGamepad GamepadSupports IsGamepadButtonDown', 'UserInputService', () => false);
  def('GetConnectedGamepads GetNavigationGamepads GetSupportedGamepadKeyCodes GetGamepadState', 'UserInputService', () => T.list([]));
  def('SetNavigationGamepad', 'UserInputService', () => null);
  def('GetStringForKeyCode', 'UserInputService', (u, [k], raw) => {
    const v = raw[0] && raw[0].tag === 'e' ? raw[0].v[1] : k | 0;
    return v >= 32 && v < 127 ? String.fromCharCode(v).toUpperCase() : '';
  });
  def('GetDeviceAcceleration GetDeviceGravity GetDeviceRotation', 'UserInputService', () => null);
  def('GetUserCFrame', 'UserInputService', () => T.cf(C.cf(0, 0, 0)));
  def('GetUserCFrame', 'VRService', () => T.cf(C.cf(0, 0, 0)));
  def('GetUserCFrameEnabled', 'VRService', () => false);
  def('RecenterUserHeadCFrame RequestNavigation SetTouchpadMode', 'VRService', () => null);
  def('GetTouchpadMode', 'VRService', () => T.e('VRTouchpadMode', 0));
  def('IsVibrationSupported IsMotorSupported', 'HapticService', () => false);
  def('SetMotor', 'HapticService', () => null);
  def('GetMotor', 'HapticService', () => 0);
  def('GetTextSize', 'TextService', (s, [text, size, font, frame], raw) => {
    const f = raw[2] && raw[2].tag === 'e' ? raw[2].v[1] : font | 0;
    const v = env.measureText ? env.measureText(String(text ?? ''), +size || 14, f, frame || [1e9, 1e9]) : null;
    if (v) return T.v2(v);
    const px = +size || 14;
    const lines = String(text ?? '').split('\n');
    return T.v2([Math.max(...lines.map((l) => l.length)) * px * 0.5, lines.length * px]);
  });
  def('FilterStringAsync', 'TextService', (s, [text]) => String(text ?? ''));
  def('GetUserThumbnailAsync', 'Players', (p, [uid, type]) => {
    const t = type == null ? 0 : +type;
    return multi(env.thumbnailUrl ? env.thumbnailUrl(+uid || 0, t === 0 ? 'headshot' : 'avatar') : '', true);
  });
  def('GetCharacterAppearanceInfoAsync GetFriendsAsync', 'Players', () => T.dict({}));
  def('SetCharacterAppearanceTimeout', 'Players', () => null);
  def('GetGameSessionID', 'Player', () => '');
  def('IsUserAvailableForExperiment', 'Player', () => false);
  def('GetStateEnabled', 'Humanoid', () => true);
  def('GetAccessories', 'Humanoid', (h) => T.list(h.parent ? h.parent.children.filter((c) => c.isA('Accoutrement')) : []));
  def('AddAccessory', 'Humanoid', (h, [a]) => { if (a && h.parent) dm.setParent(a, h.parent); return null; });
  def('RemoveAccessories', 'Humanoid', (h) => { if (h.parent) for (const c of [...h.parent.children]) if (c.isA('Accoutrement')) dm.destroy(c); return null; });
  def('GetLimb', 'Humanoid', (h, [part]) => {
    const n = part ? part.props.get('Name') : '';
    const map = { Head: 0, Torso: 1, 'Left Arm': 2, 'Right Arm': 3, 'Left Leg': 4, 'Right Leg': 5 };
    return T.e('Limb', map[n] ?? 6);
  });
  def('GetBodyPartR15', 'Humanoid', () => T.e('BodyPartR15', 15));
  def('BuildRigFromAttachments', 'Humanoid', (h) => { if (env.buildRig) env.buildRig(h); return null; });
  def('GetMoveVelocity', 'Humanoid', (h) => T.v3(h.props.get('MoveDirection') || [0, 0, 0]));
  def('ScreenPointToRay ViewportPointToRay', 'Camera', (c, [x, y, depth]) => {
    const r = env.screenRay ? env.screenRay(+x || 0, +y || 0) : null;
    const d = +depth || 0;
    if (!r) return T.ray([0, 0, 0], [0, 0, -1]);
    return T.ray([r.o[0] + r.d[0] * d, r.o[1] + r.d[1] * d, r.o[2] + r.d[2] * d], r.d);
  });
  def('WorldToScreenPoint WorldToViewportPoint', 'Camera', (c, [p]) => {
    const r = env.worldToScreen && p ? env.worldToScreen(p) : null;
    if (!r) return multi(T.v3([0, 0, 0]), false);
    return multi(T.v3([r[0], r[1], r[2]]), r[3]);
  });
  def('GetRenderCFrame', 'Camera', (c) => T.cf(c.props.get('CFrame')));
  def('GetRenderCFrame', 'BasePart', (p) => T.cf(p.props.get('CFrame')));
  def('GetLargestCutoffDistance', 'Camera', (c, [list]) => {
    if (!env.raycast) return 0;
    const cf = c.props.get('CFrame'), fc = c.props.get('Focus');
    if (!cf || !fc) return 0;
    const dir = [cf[0] - fc[0], cf[1] - fc[1], cf[2] - fc[2]];
    const len = Math.hypot(dir[0], dir[1], dir[2]);
    if (len < 0.01) return 0;
    const ignore = (Array.isArray(list) ? list : list && typeof list === 'object' ? Object.values(list) : []).filter((x) => x instanceof Instance);
    for (let i = 0; i < 8; i++) {
      const hit = env.raycast([fc[0], fc[1], fc[2]], dir, ignore);
      if (!hit || !hit.part) return 0;
      if ((+hit.part.props.get('Transparency') || 0) >= 0.95) {
        ignore.push(hit.part);
        continue;
      }
      const d = Math.hypot(hit.point[0] - fc[0], hit.point[1] - fc[1], hit.point[2] - fc[2]);
      return Math.max(0, len - d + 0.2);
    }
    return 0;
  });
  def('GetRoll', 'Camera', () => 0);
  def('SetRoll', 'Camera', () => null);
  def('Interpolate', 'Camera', (c, [cf, focus]) => {
    if (cf) dm.setProp(c, 'CFrame', cf, { lua: true });
    if (focus) dm.setProp(c, 'Focus', focus, { lua: true });
    return null;
  });
  def('GetPartsObscuringTarget', 'Camera', () => T.list([]));
  def('GetPanSpeed GetTiltSpeed', 'Camera', () => 0);
  def('PanUnits TiltUnits Zoom', 'Camera', () => null);
  def('FindPartOnRayWithWhitelist', 'Workspace', (w, [ray, list]) => {
    if (!ray || !env.raycast) return multi(null, T.v3([0, 0, 0]));
    const allow = new Set();
    for (const x of list || []) if (x) { allow.add(x); for (const d of x.descendants()) allow.add(d); }
    const ignore = dm.services.get('Workspace').descendants().filter((d) => d.isA('BasePart') && !allow.has(d));
    const r = env.raycast(ray.slice(0, 3), ray.slice(3, 6), ignore);
    return multi(r.part, T.v3(r.point), T.v3(r.normal || [0, 1, 0]));
  });
  def('FindPartsInRegion3WithIgnoreList FindPartsInRegion3WithWhiteList', 'Workspace', () => T.list([]));
  def('IsRegion3Empty IsRegion3EmptyWithIgnoreList', 'Workspace', () => true);
  def('ArePartsTouchingOthers', 'Workspace', () => false);
  def('PGSIsEnabled ExperimentalSolverIsEnabled', 'Workspace', () => true);
  def('JoinToOutsiders UnjoinFromOutsiders', 'Workspace', () => null);
  def('CanSetNetworkOwnership', 'BasePart', () => multi(false, 'Cannot change network ownership'));
  def('SetNetworkOwner SetNetworkOwnershipAuto', 'BasePart', () => null);
  def('GetNetworkOwner', 'BasePart', () => null);
  def('GetNetworkOwnershipAuto', 'BasePart', () => true);
  def('IsGrounded', 'BasePart', (p) => !!p.props.get('Anchored'));
  def('GetCorescriptLocalizations', 'LocalizationService', () => T.list([]));
  def('GetTranslatorForPlayer', 'LocalizationService', () => null);
  def('FilterStringForBroadcast', 'Chat', (c, [s]) => String(s ?? ''));
  def('CanUserChatAsync CanUsersChatAsync', 'Chat', () => true);
  def('PlayLocalSound', 'SoundService', (s, [snd]) => { if (snd && env.sound) env.sound(snd, 'play'); return null; });
  def('GetListener', 'SoundService', () => multi(T.e('ListenerType', 0), null));
  def('SetListener', 'SoundService', () => null);
  def('PreloadAsync', 'ContentProvider', () => null);
  def('GetLocalPlayerTeleportData', 'TeleportService', () => null);
  def('GetTotalMemoryUsageMb', 'Stats', () => 120);
  def('GetMemoryUsageMbForTag', 'Stats', () => 0);
  def('ReportCounter TrackEvent SetRBXEvent SetRBXEventStream UpdateHeartbeatObject ReportInfluxSeries ReleaseRBXEventStream ReportStats', 'AnalyticsService', () => null);
  def('GetSessionId', 'AnalyticsService', () => '');
  def('GetAsync PostAsync RequestAsync', 'HttpRbxApiService', () => Promise.reject(new Error('HTTP 403 (Forbidden)')));
  def('GetCameraYInvertValue', 'UserGameSettings', (g) => (g.props.get('CameraYInverted') ? -1 : 1));
  def('SetCameraYInvertVisible SetGamepadCameraSensitivityVisible SetCameraYInvertValue', 'UserGameSettings', () => null);
  def('GetOnboardingCompleted', 'UserGameSettings', () => true);
  def('SetOnboardingCompleted', 'UserGameSettings', () => null);
  def('IsUserFeatureEnabled', 'UserSettings', () => false);
  def('GetService', 'UserSettings', (u, [name]) => (String(name) === 'UserGameSettings' ? u.findChild('GameSettings') : null));
  def('GetRegisteredComputerCameraMovementModes GetRegisteredTouchCameraMovementModes', 'PlayerScripts', () => T.list(Object.values(ENUMS.ComputerCameraMovementMode || {}).slice(0, 3).map((v) => T.e('ComputerCameraMovementMode', v))));
  def('GetRegisteredComputerMovementModes GetRegisteredTouchMovementModes', 'PlayerScripts', () => T.list([]));
  def('RegisterComputerCameraMovementMode RegisterComputerMovementMode RegisterTouchCameraMovementMode RegisterTouchMovementMode ClearComputerCameraMovementModes ClearComputerMovementModes ClearTouchCameraMovementModes ClearTouchMovementModes', 'PlayerScripts', () => null);
  def('GetPlayingAnimationTracks', 'Animator', (a) => T.list(env.playingTracks && a.parent ? env.playingTracks(a.parent) : []));
  def('LoadAnimation', 'Animator', (a, [anim]) => {
    const hum = a.parent && a.parent.isA('Humanoid') ? a.parent : null;
    if (!(anim instanceof Instance) || anim.ClassName !== 'Animation') throw new Error('LoadAnimation requires an Animation object');
    const tr = dm.create('AnimationTrack', null);
    tr.props.set('Name', anim.props.get('Name'));
    tr.props.set('Animation', anim);
    tr.data = { hum };
    return tr;
  });
  def('SetPlayerIsUsing', 'Dialog', (d, [pl, on]) => { dm.setProp(d, 'InUse', !!on); return null; });
  def('GetCurrentPlayers', 'Dialog', () => T.list([]));
  def('SetIsExemptFromUGCAnalytics', 'LocalizationTable', () => null);
  def('ReportGoogleAnalyticsEvent', 'GuiService', () => null);
  def('GetNotificationTypeList', 'GuiService', () => T.list([]));
  def('GetEmotesMenuOpen', 'GuiService', () => false);
  def('GetSafeZoneOffsets', 'GuiService', () => T.dict({ top: 0, bottom: 0, left: 0, right: 0 }));
  def('RegisterKeyframeSequence', 'KeyframeSequenceProvider', (k, [seq]) => (seq ? 'rbxassetid://0' : ''));
  def('GetKeyframeSequenceAsync GetKeyframeSequence', 'KeyframeSequenceProvider', () => null);
  def('GetFVariable GetFastVariable', 'GlobalSettings', () => '');
  def('GetFInt GetFastInt', 'GlobalSettings', () => 0);
}

export const FLAGS_2018 = new Set([]);

export function installComputed2018(def, host, { T }) {
  const dm = host.dm;
  const env = host.env;
  const trackOf = (t) => (env.animTrack ? env.animTrack(t) : null);
  def('TimePosition', 'AnimationTrack', (t) => {
    const r = trackOf(t);
    return r ? r.t : 0;
  });
  def('Speed', 'AnimationTrack', (t) => {
    const r = trackOf(t);
    return r ? r.speed : 1;
  });
  def('WeightCurrent', 'AnimationTrack', (t) => {
    const r = trackOf(t);
    return r ? r.w * r.weight : 0;
  });
  def('WeightTarget', 'AnimationTrack', (t) => {
    const r = trackOf(t);
    return r ? r.target * r.weight : 0;
  });
  def('ViewportSize', 'Camera', () => T.v2(env.screenSize ? env.screenSize() : [1024, 768]));
  def('ClockTime', 'Lighting', (l) => {
    const m = /^(-?\d+):?(\d+)?:?(\d+)?/.exec(String(l.props.get('TimeOfDay'))) || [];
    return ((+m[1] || 0) + (+m[2] || 0) / 60 + (+m[3] || 0) / 3600);
  });
  def('Orientation', 'BasePart', (p) => T.v3(orientationOf(p.props.get('CFrame'))));
  def('Position', 'Attachment', (a) => { const c = a.props.get('CFrame'); return T.v3([c[0], c[1], c[2]]); });
  def('Orientation Rotation', 'Attachment', (a) => T.v3(orientationOf(a.props.get('CFrame'))));
  def('Axis', 'Attachment', (a) => { const c = a.props.get('CFrame'); return T.v3([c[3], c[6], c[9]]); });
  def('SecondaryAxis', 'Attachment', (a) => { const c = a.props.get('CFrame'); return T.v3([c[4], c[7], c[10]]); });
  const worldCF = (a) => {
    const p = a.parent;
    const cf = a.props.get('CFrame');
    return p && p.isA('BasePart') ? C.mul(p.props.get('CFrame'), cf) : cf;
  };
  def('WorldCFrame', 'Attachment', (a) => T.cf(worldCF(a)));
  def('WorldPosition', 'Attachment', (a) => { const c = worldCF(a); return T.v3([c[0], c[1], c[2]]); });
  def('WorldOrientation WorldRotation', 'Attachment', (a) => T.v3(orientationOf(worldCF(a))));
  def('WorldAxis', 'Attachment', (a) => { const c = worldCF(a); return T.v3([c[3], c[6], c[9]]); });
  def('WorldSecondaryAxis', 'Attachment', (a) => { const c = worldCF(a); return T.v3([c[4], c[7], c[10]]); });
  def('RootPart', 'Humanoid', (h) => (h.parent ? h.parent.findChild('HumanoidRootPart') || h.parent.findChild('Torso') : null));
  def('SeatPart', 'Humanoid', (h) => (h.data && h.data.seat) || null);
  def('FloorMaterial', 'Humanoid', (h) => T.e('Material', h.data && h.data.state === 5 ? ENUMS.Material.Air : ENUMS.Material.Plastic));
  def('Team', 'Player', (pl) => teamOf(dm, pl));
  def('Terrain', 'Workspace', (w) => w.findChildOfClass('Terrain'));
  def('Workspace', 'DataModel', () => dm.services.get('Workspace'));
  def('Transparency', 'GuiObject', (g) => g.props.get('BackgroundTransparency'));
  def('LocalizedText', 'TextLabel', (t) => t.props.get('Text'));
  def('LocalizedText', 'TextButton', (t) => t.props.get('Text'));
  def('LocalizedText', 'TextBox', (t) => t.props.get('Text'));
  def('AbsoluteWindowSize', 'ScrollingFrame', (s) => T.v2(s.props.get('AbsoluteSize') || [0, 0]));
  def('AbsoluteContentSize', 'UIGridStyleLayout', (l) => T.v2((l.data && l.data.content) || [0, 0]));
  def('AbsoluteRotation', 'GuiBase2d', (g) => (g.props.has('Rotation') ? g.props.get('Rotation') : 0));
  def('Playing', 'Sound', (s) => !!s.props.get('IsPlaying'));
}

export function installSetters2018(def, host) {
  const dm = host.dm;
  const env = host.env;
  const v3 = (a) => {
    if (!a || a.tag !== 'v3') throw new Error("bad argument #3 to '?' (Vector3 expected)");
    return a.v;
  };
  def('TimePosition', 'AnimationTrack', (t, a) => {
    const v = a && a.tag === 'n' ? +a.v : 0;
    if (env.animate && t.data && t.data.hum) env.animate(t, 'time', Math.max(0, v));
  });
  def('Orientation', 'BasePart', (p, a) => {
    const o = v3(a);
    const cf = p.props.get('CFrame');
    const r = fromOrientation(o);
    dm.setProp(p, 'CFrame', C.withPos(r, cf[0], cf[1], cf[2]), { lua: true });
  });
  def('Position', 'Attachment', (at, a) => {
    const v = v3(a);
    const cf = at.props.get('CFrame');
    dm.setProp(at, 'CFrame', C.withPos(cf, v[0], v[1], v[2]), { lua: true });
  });
  def('Orientation Rotation', 'Attachment', (at, a) => {
    const cf = at.props.get('CFrame');
    dm.setProp(at, 'CFrame', C.withPos(fromOrientation(v3(a)), cf[0], cf[1], cf[2]), { lua: true });
  });
  def('WorldPosition', 'Attachment', (at, a) => {
    const v = v3(a);
    const p = at.parent;
    const cf = at.props.get('CFrame');
    const local = p && p.isA('BasePart') ? C.point(C.inv(p.props.get('CFrame')), v[0], v[1], v[2]) : v;
    dm.setProp(at, 'CFrame', C.withPos(cf, local[0], local[1], local[2]), { lua: true });
  });
  def('ClockTime', 'Lighting', (l, a) => {
    const h = ((+a.v || 0) % 24 + 24) % 24;
    const hh = Math.floor(h), mm = Math.floor((h - hh) * 60), ss = Math.floor(((h - hh) * 60 - mm) * 60);
    const p = (n) => String(n).padStart(2, '0');
    dm.setProp(l, 'TimeOfDay', `${p(hh)}:${p(mm)}:${p(ss)}`, { lua: true });
  });
  def('Team', 'Player', (pl, a) => {
    const t = a && a.tag === 'i' ? a.v : null;
    if (t && t.ClassName === 'Team') {
      dm.setProp(pl, 'TeamColor', t.props.get('TeamColor'), { lua: true });
      dm.setProp(pl, 'Neutral', false, { lua: true });
    } else dm.setProp(pl, 'Neutral', true, { lua: true });
  });
  def('Transparency', 'GuiObject', (g, a) => dm.setProp(g, 'BackgroundTransparency', +a.v || 0, { lua: true }));
  def('MouseBehavior', 'UserInputService', (u, a) => {
    const v = a && a.tag === 'e' ? a.v[1] : a && a.tag === 's' ? ENUMS.MouseBehavior[a.v] ?? 0 : (a && a.v) | 0;
    dm.setProp(u, 'MouseBehavior', v, { lua: true });
    if (env.mouseBehavior) env.mouseBehavior(v);
  });
  def('MouseIconEnabled', 'UserInputService', (u, a) => {
    dm.setProp(u, 'MouseIconEnabled', !!(a && a.v), { lua: true });
    if (env.mouseIconEnabled) env.mouseIconEnabled(!!(a && a.v));
  });
  def('Playing', 'Sound', (s, a) => {
    const on = !!(a && a.v);
    dm.setProp(s, 'IsPlaying', on, { force: true, op: on ? 'play' : 'stop' });
    if (env.sound) env.sound(s, on ? 'play' : 'stop');
  });
}
