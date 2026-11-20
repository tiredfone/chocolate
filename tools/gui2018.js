import { Lua } from 'wasmoon-lua5.1';
import { DataModel } from '/shared/instance.js';
import { ScriptHost } from '/shared/luahost.js';
import { Core2018 } from '/shared/core2018.js';
import { FLAGS_2018 } from '/shared/api2018.js';
import { Gui } from '/client/gui.js';
import { Input2018 } from '/client/input2018.js';
import { TouchInput } from '/client/touch.js';
import { configure, useContent2018 } from '/client/assets.js';

const q = new URLSearchParams(location.search);
const W = innerWidth, H = innerHeight;
const TOUCH = q.get('touch') === '1';
const logs = [];
window.__logs = logs;
configure({ publicPath: '' });
await useContent2018();
const files = await (await fetch('/corescripts2018/bundle.json')).json();
const dm = new DataModel('client');
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
const { sps } = core.installPlayerScripts(sp);
const addPlayer = (name, uid) => {
  const pl = dm.create('Player', null);
  pl.props.set('Name', name);
  pl.props.set('userId', uid);
  pl.props.set('UserId', uid);
  for (const c of ['PlayerGui', 'Backpack', 'PlayerScripts']) {
    const x = dm.create(c, null);
    x.props.set('Name', c);
    dm.setParent(x, pl);
  }
  return pl;
};
const player = addPlayer('Tester', 1);
dm.setParent(player, players);
players.props.set('LocalPlayer', player);
for (let i = 0; i < +(q.get('players') || 2); i++) dm.setParent(addPlayer('Other' + (i + 1), 10 + i), players);
const mouse = dm.create('PlayerMouse', null);
const env = {
  touch: () => TOUCH, platform: () => (TOUCH ? 3 : 0), screenSize: () => [W, H], localPlayer: () => player, mouseFor: (pl) => (pl === player ? mouse : null),
  addCoreScriptLocal: (name, parent) => { core.coreScript(name, parent && !parent.destroyed ? parent : dm.services.get('ScriptContext')); },
  isLoaded: () => true, message: () => '', loadingGuiRemoved: () => false, inFullscreen: () => false,
  thumbnailUrl: (uid) => `/thumb/${uid}`,
  playerMove() {}, remote() {}, invoke: () => Promise.resolve([false, 'no server']),
  rotateCamera() {}, zoomCamera() {}, moveCharacter() {}, jumpCharacter() {}, setGuiInset() {},
};
const world = { dm, era: 2018, touch: TOUCH, ready: true, player, guiInset: [0, 0, 0, 0], guiScale: () => 1, noTopbar: false, own: null, physics: null, hooks: { screenSize: () => [W, H] } };
const host = new ScriptHost(dm, env);
host.flags = FLAGS_2018;
host.logs = (k, m, w) => { if (k !== 'print' || q.get('print')) logs.push(`${k} ${w || ''}: ${String(m).split('\n').slice(0, 3).join(' | ')}`); };
await host.init(() => Lua.create({ customWasmUri: '/client/vendor/liblua5.1.wasm' }), await (await fetch('/shared/runtime.lua')).text(), [{ source: await (await fetch('/shared/runtime2018.lua')).text(), name: 'runtime2018' }]);
const root = document.getElementById('root');
const canvas = document.createElement('canvas');
canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%';
root.appendChild(canvas);
world.mouseState = { x: 0, y: 0 };
world.ensureAudio = () => {};
const gui = new Gui(root, world, null, { leave() {}, sendChat() {}, send() {}, flush: () => host.tick(t) });
gui.updateTags = () => {};
gui.updateBillboards = () => {};
world.input2018 = new Input2018(world, gui, canvas, root);
const overGuiTarget = (e) => e.target !== canvas && root.contains(e.target);
window.addEventListener('pointermove', (e) => {
  const at = [e.clientX, e.clientY];
  if (e.target === canvas) world.input2018.mouseMove(e.movementX || 0, e.movementY || 0, false, at);
  else if (overGuiTarget(e)) world.input2018.mouseMove(e.movementX || 0, e.movementY || 0, true, at);
});
canvas.addEventListener('pointerdown', (e) => {
  world.input2018.buttonDown(e.button, false, [e.clientX, e.clientY]);
});
root.addEventListener('pointerdown', (e) => {
  if (!overGuiTarget(e)) return;
  world.input2018.buttonDown(e.button, true, [e.clientX, e.clientY]);
}, true);
window.addEventListener('pointerup', (e) => {
  world.input2018.buttonUp(e.button, overGuiTarget(e), [e.clientX, e.clientY]);
}, true);
window.addEventListener('keydown', (e) => world.input2018.keyDown(e, false));
window.addEventListener('keyup', (e) => world.input2018.keyUp(e, false));
if (TOUCH) new TouchInput(world, null, gui, root, canvas);
let t = 0;
const uis = dm.services.get('UserInputService');
uis.props.set('TouchEnabled', TOUCH);
uis.props.set('MouseEnabled', !TOUCH);
uis.props.set('KeyboardEnabled', !TOUCH);
core.starterScript(dm.services.get('ScriptContext'), false);
for (const s of sps.children) { const c = dm.clone(s); if (c) dm.setParent(c, player.findChildOfClass('PlayerScripts')); }
setInterval(() => {
  t += 1 / 30;
  host.tick(t); host.renderStep(1 / 30);
  const rs = dm.services.get('RunService');
  dm.emit(rs, 'RenderStepped', 1 / 30);
  dm.emit(rs, 'Stepped', t, 1 / 30);
  dm.emit(rs, 'Heartbeat', 1 / 30);
  gui.frame();
}, 33);
window.__dm = dm;
window.__rg = rg;
window.__gui = gui;
window.__ready = true;
