import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const CH = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(CH + '/package.json');
const { Lua } = require('wasmoon-lua5.1');
const { DataModel } = await import(CH + '/shared/instance.js');
const { ScriptHost, T } = await import(CH + '/shared/luahost.js');
const { Core2018 } = await import(CH + '/shared/core2018.js');
const { FLAGS_2018 } = await import(CH + '/shared/api2018.js');

const MODE = process.argv[2];
if (!['touch', 'desktop', 'server'].includes(MODE)) {
  console.log('usage: node tools/corescripts2018.mjs desktop|touch|server');
  process.exit(1);
}
const TOUCH = MODE === 'touch';
const SERVER = MODE === 'server';
const W = +(process.env.W || (TOUCH ? 844 : 1280)), H = +(process.env.H || (TOUCH ? 390 : 720));
const SECONDS = +(process.env.SECONDS || 10);
const files = JSON.parse(fs.readFileSync(CH + '/corescripts2018/bundle.json', 'utf8'));
const logs = [];
const moves = [];
const dm = new DataModel(SERVER ? 'server' : 'client');
dm.era = 2018;
for (const s of ['Workspace', 'Players', 'Lighting', 'StarterGui', 'StarterPack', 'StarterPlayer', 'Teams', 'SoundService', 'Debris', 'ReplicatedStorage', 'ReplicatedFirst', 'RunService', 'UserInputService', 'ContentProvider', 'GuiService', 'Chat', 'CoreGui', 'ScriptContext', 'LogService', 'MarketplaceService', 'TeleportService', 'InsertService', 'HttpService', 'ContextActionService', 'CollectionService', 'TweenService', 'TextService', 'LocalizationService', 'RobloxReplicatedStorage', 'ServerScriptService', 'ServerStorage', 'VRService']) dm.service(s);
const ws = dm.services.get('Workspace');
const terrain = dm.create('Terrain', ws);
terrain.props.set('Name', 'Terrain');
const cam = dm.create('Camera', ws);
cam.props.set('Name', 'Camera');
ws.props.set('CurrentCamera', cam);
const players = dm.services.get('Players');
const core = new Core2018(dm, files);
const coreGui = dm.services.get('CoreGui');
const rg = dm.create('ScreenGui', null);
rg.props.set('Name', 'RobloxGui');
rg.props.set('AbsoluteSize', [W, H]);
dm.setParent(rg, coreGui);
core.buildModules(rg);
const sp = dm.services.get('StarterPlayer');
const { sps, scs } = core.installPlayerScripts(sp);

let player = null;
const addPlayer = (name, uid) => {
  const pl = dm.create('Player', null);
  pl.props.set('Name', name);
  pl.props.set('userId', uid);
  for (const c of ['PlayerGui', 'Backpack', 'PlayerScripts']) {
    const x = dm.create(c, null);
    x.props.set('Name', c);
    dm.setParent(x, pl);
  }
  return pl;
};
const spawnCharacter = (pl) => {
  const ch = dm.create('Model', null);
  ch.props.set('Name', pl.props.get('Name'));
  for (const n of ['Head', 'Torso', 'HumanoidRootPart', 'Left Arm', 'Right Arm', 'Left Leg', 'Right Leg']) {
    const p = dm.create('Part', null);
    p.props.set('Name', n);
    dm.setParent(p, ch);
  }
  const hum = dm.create('Humanoid', null);
  hum.props.set('Name', 'Humanoid');
  dm.setParent(hum, ch);
  ch.props.set('PrimaryPart', ch.findChild('HumanoidRootPart'));
  for (const s of scs.children) { const c = dm.clone(s); if (c) dm.setParent(c, ch); }
  dm.setParent(ch, ws);
  dm.setProp(pl, 'Character', ch);
  dm.emit(pl, 'CharacterAdded', ch);
  return ch;
};

const mouse = dm.create('PlayerMouse', null);
const env = {
  touch: () => TOUCH, platform: () => (TOUCH ? 3 : 0), screenSize: () => [W, H], localPlayer: () => player, mouseFor: (pl) => (pl === player ? mouse : null),
  addCoreScriptLocal: (name, parent) => {
    const s = core.coreScript(name, parent && !parent.destroyed ? parent : dm.services.get('ScriptContext'));
    if (!s) logs.push(`missing CoreScript ${name}`);
  },
  isLoaded: () => true, message: () => '', loadingGuiRemoved: () => false, inFullscreen: () => false,
  thumbnailUrl: (uid) => `/thumb/${uid}`,
  playerMove: (pl, dir, rel) => { if (dir && Math.hypot(dir[0], dir[2]) > 0.01) moves.push(dir.map((v) => Math.round(v * 100) / 100).join(',') + (rel ? ' rel' : '')); },
  remote: (r, op, args) => logs.push(`remote ${op} ${r.fullName()} (${args.length} args)`),
  invoke: () => Promise.resolve([false, 'no server']),
  rotateCamera() {}, zoomCamera() {}, moveCharacter() {}, jumpCharacter() {}, setGuiInset() {},
};
const host = new ScriptHost(dm, env);
host.flags = FLAGS_2018;
host.logs = (k, m, w) => { if (k !== 'print' || process.env.PRINT) logs.push(`${k} ${w || ''}: ${String(m).split('\n').slice(0, k === 'error' ? +(process.env.TB || 3) : 1).join(' | ')}`); };
await host.init(() => Lua.create(), fs.readFileSync(CH + '/shared/runtime.lua', 'utf8'), [{ source: fs.readFileSync(CH + '/shared/runtime2018.lua', 'utf8'), name: 'runtime2018' }]);

let t = 0;
const tick = async (n) => {
  for (let i = 0; i < n; i++) {
    t += 1 / 30;
    host.tick(t); host.renderStep(1 / 30);
    const rs = dm.services.get('RunService');
    dm.emit(rs, 'RenderStepped', 1 / 30);
    dm.emit(rs, 'Stepped', t, 1 / 30);
    dm.emit(rs, 'Heartbeat', 1 / 30);
    await new Promise((r) => setImmediate(r));
  }
};
if (SERVER) {
  core.starterScript(dm.services.get('ServerScriptService'), true);
  await tick(30);
  player = addPlayer('Tester', 1);
  dm.setParent(player, players);
  for (const s of sps.children) { const c = dm.clone(s); if (c) dm.setParent(c, player.findChildOfClass('PlayerScripts')); }
  spawnCharacter(player);
} else {
  const uis = dm.services.get('UserInputService');
  uis.props.set('TouchEnabled', TOUCH);
  uis.props.set('MouseEnabled', !TOUCH);
  uis.props.set('KeyboardEnabled', !TOUCH);
  player = addPlayer('Tester', 1);
  dm.setParent(player, players);
  players.props.set('LocalPlayer', player);
  core.starterScript(dm.services.get('ScriptContext'), false);
  for (const s of sps.children) { const c = dm.clone(s); if (c) dm.setParent(c, player.findChildOfClass('PlayerScripts')); }
  await tick(15);
  spawnCharacter(player);
}
if (process.env.LUA && !SERVER) {
  const ls = dm.create('LocalScript', null);
  ls.props.set('Name', 'Probe');
  ls.props.set('Source', process.env.LUA);
  dm.setParent(ls, player.findChildOfClass('PlayerGui'));
}
await tick(Math.round(SECONDS * 30));

if (process.env.KEY && !SERVER) {
  const uis = dm.services.get('UserInputService');
  const io = dm.create('InputObject', null);
  io.props.set('KeyCode', +process.env.KEY);
  io.props.set('UserInputType', 8);
  io.props.set('UserInputState', 0);
  dm.emit(uis, '__Input', io, false, 'b');
  await tick(30);
}

if (process.env.KEYS) {
  const { ENUMS } = await import(CH + '/shared/classes.js');
  const uisvc = dm.services.get('UserInputService');
  const humanoid = dm.root.descendants().find((d) => d.ClassName === 'Humanoid');
  for (const name of process.env.KEYS.split(',')) {
    const io = dm.create('InputObject', null);
    io.props.set('UserInputType', ENUMS.UserInputType.Keyboard);
    io.props.set('KeyCode', ENUMS.KeyCode[name]);
    io.props.set('UserInputState', 0);
    dm.emit(uisvc, '__Input', io, false, 'b');
    for (let i = 0; i < 15; i++) { t += 1 / 30; host.tick(t); host.renderStep(1 / 30); }
    console.log(`key ${name}: Move calls ${JSON.stringify([...new Set(moves)])}, Humanoid.Jump=${humanoid.props.get('Jump')}`);
    moves.length = 0;
    io.props.set('UserInputState', 2);
    dm.emit(uisvc, '__Input', io, false, 'e');
    for (let i = 0; i < 15; i++) { t += 1 / 30; host.tick(t); host.renderStep(1 / 30); }
    humanoid.props.set('Jump', false);
  }
}
const dump = (inst, d, max) => {
  const out = [];
  for (const c of inst.children) {
    const P = c.props;
    const vis = P.has('Visible') && !P.get('Visible') ? ' (hidden)' : '';
    const txt = P.has('Text') && P.get('Text') ? ` "${String(P.get('Text')).slice(0, 30)}"` : '';
    out.push('  '.repeat(d) + c.ClassName + ' ' + P.get('Name') + vis + txt);
    if (d < max) out.push(...dump(c, d + 1, max));
  }
  return out;
};
const depth = +(process.env.DEPTH || 1);
if (SERVER) {
  console.log('ServerScriptService:\n' + dump(dm.services.get('ServerScriptService'), 1, depth).join('\n'));
  console.log('Chat:\n' + dump(dm.services.get('Chat'), 1, depth).join('\n'));
  console.log('ReplicatedStorage:\n' + dump(dm.services.get('ReplicatedStorage'), 1, depth).join('\n'));
  console.log('StarterPlayerScripts:\n' + dump(sps, 1, 0).join('\n'));
} else {
  console.log(`${TOUCH ? 'TOUCH' : 'DESKTOP'} RobloxGui:\n` + dump(rg, 1, depth).filter((l) => !/ Modules$/.test(l)).join('\n'));
  console.log('PlayerGui:\n' + dump(player.findChildOfClass('PlayerGui'), 1, depth).join('\n'));
  console.log('PlayerScripts:\n' + dump(player.findChildOfClass('PlayerScripts'), 1, 0).join('\n'));
}
for (const name of (process.env.DUMP || '').split(',').filter(Boolean)) {
  for (const r of dm.root.descendants().filter((d) => d.props.get('Name') === name)) console.log(r.fullName() + ':\n' + dump(r, 1, 4).join('\n'));
}
const uniq = [...new Set(logs)];
console.log(`\n${uniq.filter((l) => l.startsWith('error')).length} errors, ${uniq.filter((l) => l.startsWith('warn')).length} warnings`);
console.log(uniq.join('\n'));
process.exit(0);
