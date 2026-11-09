import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
const CH = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
import fs from 'fs';
const require = createRequire(CH + '/package.json');
const { Lua } = require('wasmoon-lua5.1');
const { DataModel } = await import(CH + '/shared/instance.js');
const { ScriptHost } = await import(CH + '/shared/luahost.js');
const { ClientWorld } = await import(CH + '/client/world.js');
const { luaSource } = await import(CH + '/server/assets.js');
const TOUCH = process.argv[2] === 'touch';
if (!['touch', 'desktop'].includes(process.argv[2])) { console.log('usage: node tools/corescripts.mjs desktop|touch'); process.exit(1); }
let inset = [0, 0, 0, 0];
const W = +(process.env.W || (TOUCH ? 844 : 1280)), H = +(process.env.H || (TOUCH ? 390 : 720));
const logs = [];
const dm = new DataModel('client');
for (const s of ['Workspace', 'Players', 'Lighting', 'StarterGui', 'StarterPack', 'Teams', 'SoundService', 'Debris', 'ReplicatedStorage', 'RunService', 'UserInputService', 'ContentProvider', 'GuiService', 'Chat', 'CoreGui', 'ScriptContext', 'LogService', 'MarketplaceService', 'TeleportService', 'InsertService', 'ChangeHistoryService', 'PersonalServerService', 'PointsService', 'HttpService', 'ContextActionService', 'ReplicatedFirst', 'NetworkClient', 'LocalBackpack', 'CollectionService']) dm.service(s);
const players = dm.services.get('Players');
const player = dm.create('Player', null);
player.props.set('Name', 'Tester');
dm.setParent(player, players);
players.props.set('LocalPlayer', player);
for (const c of ['PlayerGui', 'Backpack']) { const x = dm.create(c, null); x.props.set('Name', c); dm.setParent(x, player); }
const mouse = dm.create('PlayerMouse', null);
if (process.env.TOOLS) {
  for (const n of ['Sword', 'Slingshot']) {
    const t = dm.create('Tool', null); t.props.set('Name', n);
    const hnd = dm.create('Part', null); hnd.props.set('Name', 'Handle'); dm.setParent(hnd, t);
    dm.setParent(t, player.findChildOfClass('Backpack'));
  }
}
const ch = dm.create('Model', null); ch.props.set('Name', 'Tester');
for (const n of ['Head', 'Torso']) { const p = dm.create('Part', null); p.props.set('Name', n); dm.setParent(p, ch); }
const hum = dm.create('Humanoid', null); hum.props.set('Name', 'Humanoid'); dm.setParent(hum, ch);
dm.setParent(ch, dm.services.get('Workspace'));
const cam = dm.create('Camera', null); cam.props.set('Name', 'Camera'); dm.setParent(cam, dm.services.get('Workspace'));
dm.services.get('Workspace').props.set('CurrentCamera', cam);
player.props.set('Character', ch);
const rg = dm.create('ScreenGui', null);
rg.props.set('Name', 'RobloxGui');
rg.props.set('AbsoluteSize', [W, H]);
dm.setParent(rg, dm.services.get('CoreGui'));
const fakeWorld = { dm, robloxGui: rg, touch: TOUCH, hooks: {}, gui: ClientWorld.prototype.gui, controlButton: ClientWorld.prototype.controlButton, buildLeaveMenu: ClientWorld.prototype.buildLeaveMenu };
ClientWorld.prototype.buildControlFrame.call(fakeWorld);
let loaded = false;
const uis = dm.services.get('UserInputService');
uis.props.set('TouchEnabled', TOUCH);
const ALIAS = { 53878057: 53878058 };
const sources = new Map();
let frontier = [158948138, 37801172, 46295863];
for (let d = 0; d < 5 && frontier.length; d++) {
  const next = [];
  for (const id of frontier) {
    if (sources.has(id)) continue;
    const s = await luaSource(ALIAS[id] || id);
    sources.set(id, s);
    if (s) for (const m of s.matchAll(/(?:AddCoreScript|AddStarterScript)\(\s*(\d+)|RegisterLibrary\([^,]+,\s*["']?(\d+)/g)) next.push(+(m[1] || m[2]));
  }
  frontier = next;
}
const src = (id) => sources.get(id) || null;
let host;
const env = {
  touch: () => TOUCH, screenSize: () => [W, H], localPlayer: () => player, mouseFor: (pl) => (pl === player ? mouse : null),
  coreSource: (id) => src(id),
  addCoreScript: (id, parent, name) => {
    if (TOUCH && id === 153556783 && !env.touchSettings) { env.touchSettings = true; env.addCoreScript(46295863, parent, 'CoreScripts/Settings'); }
    const s = src(id);
    if (!s) { logs.push(`missing core ${id} ${name}`); return; }
    const cs = dm.create('CoreScript', null);
    cs.props.set('Name', String(name));
    cs.props.set('Source', s);
    dm.setParent(cs, parent && !parent.destroyed ? parent : dm.services.get('ScriptContext'));
  },
  isLoaded: () => loaded, message: () => '', loadingGuiRemoved: () => false, inFullscreen: () => false,
  setGuiInset: (v) => { inset = v; },
  rotateCamera() {}, zoomCamera() {}, moveCharacter() {}, jumpCharacter() {},
};
host = new ScriptHost(dm, env);
host.logs = (k, m, w) => { if (k !== 'print') logs.push(`${k} ${w || ''}: ${String(m).split('\n')[0]}`); };
await host.init(() => Lua.create(), fs.readFileSync(CH + '/shared/runtime.lua', 'utf8'));
env.addCoreScript(158948138, rg, 'CoreScripts/LoadingScript');
env.addCoreScript(37801172, dm.services.get('ScriptContext'), 'StarterScript');
let shot = null;
let t = 0;
for (let i = 0; i < 600; i++) {
  t += 1 / 30; host.tick(t);
  if (i === 30) { shot = rg.children.filter((c) => c.ClassName === 'Frame' && c.props.get('BackgroundColor3')[2] > 0.8).map((c) => c.children.map((x) => x.props.get('Name')).join('+')); loaded = true; dm.emit(dm.root, 'Loaded'); }
}
if (process.env.CHAT) {
  const { T } = await import(CH + '/shared/luahost.js');
  dm.emit(dm.services.get('Players'), 'PlayerChatted', T.e('PlayerChatType', 0), player, process.env.CHAT, null);
  for (let i = 0; i < 60; i++) { t += 1 / 30; host.tick(t); await new Promise((r) => setTimeout(r, 20)); }
}
if (process.env.CLICK) {
  for (const name of process.env.CLICK.split(',')) {
    const b = dm.root.descendants().find((d) => d.props.get('Name') === name && d.isA('GuiButton'));
    if (b) { dm.emit(b, "MouseButton1Click"); for (let i = 0; i < 90; i++) { t += 1 / 30; host.tick(t); await new Promise((r) => setTimeout(r, 34)); } } else console.log('no button', name);
  }
}
console.log('loading screen at 1s:', JSON.stringify(shot));
const lsLeft = rg.children.some((c) => c.findChild && c.findChild('RobloxLogo'));
console.log('loading screen still present after 20s:', lsLeft);
const cf = rg.findChild('ControlFrame');
const dump = (i, d) => i.children.filter((c) => c.isA('GuiObject')).map((c) => '  '.repeat(d) + c.props.get('Name') + (c.props.get('Visible') ? '' : ' (hidden)') + '\n' + dump(c, d + 1)).join('');
console.log('ControlFrame:\n' + dump(cf, 1));
const cl = rg.findChild('CurrentLoadout');
console.log('CurrentLoadout slots:', cl ? cl.children.map((c) => c.props.get('Name')).join(',') : 'none');
const names = rg.children.map((c) => c.props.get('Name'));
console.log(TOUCH ? 'TOUCH' : 'DESKTOP', 'RobloxGui children:', names.join(', '));
const pgc = player.findChildOfClass('PlayerGui').children.map((c) => c.props.get('Name'));
console.log('PlayerGui children:', pgc.join(', '));
const find = (n) => dm.root.descendants().filter((d) => d.props.get('Name') === n).map((d) => d.fullName()).join(' | ');
console.log('ChatFrame:', find('ChatFrame'), '| ChatTouchFrame:', find('ChatTouchFrame'), '| HealthGui:', find('HealthGUI') || find('HealthGui'));
const layoutAll = (inst, pPos, pSize) => { for (const c of inst.children) { if (!c.isA('GuiObject')) continue; const sz = c.props.get('Size'), ps = c.props.get('Position'); const w = Math.round(pSize[0] * sz[0] + sz[1]), h = Math.round(pSize[1] * sz[2] + sz[3]); const ap = [pPos[0] + Math.round(pSize[0] * ps[0] + ps[1]), pPos[1] + Math.round(pSize[1] * ps[2] + ps[3])]; c.props.set('AbsolutePosition', ap); c.props.set('AbsoluteSize', [w, h]); layoutAll(c, ap, [w, h]); } };
layoutAll(rg, [inset[0], inset[1]], [W - inset[0] - inset[2], H - inset[1] - inset[3]]);
console.log('gui inset:', JSON.stringify(inset));
for (const name of (process.env.DUMP || '').split(',').filter(Boolean)) {
  const roots = dm.root.descendants().filter((d) => d.props.get('Name') === name);
  const pr = (i, d) => { const P = i.props; const vis = P.has('Visible') ? (P.get('Visible') ? '' : ' HIDDEN') : ''; const t = P.has('Text') && P.get('Text') ? ` text=${JSON.stringify(String(P.get('Text')).slice(0, 40))}` : ''; console.log('  '.repeat(d) + i.ClassName + ' ' + P.get('Name') + (P.has('AbsolutePosition') ? ` pos=${P.get('AbsolutePosition')} size=${P.get('AbsoluteSize')}` : '') + vis + t); if (d < 3) for (const c of i.children) pr(c, d + 1); };
  for (const r of roots) pr(r, 1);
}
console.log([...new Set(logs)].join('\n'));
process.exit(0);
