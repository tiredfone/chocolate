import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
const CH = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
import fs from 'fs';
const require = createRequire(CH + '/package.json');
const { Lua } = require('wasmoon-lua5.1');
const { DataModel } = await import(CH + '/shared/instance.js');
const { ScriptHost } = await import(CH + '/shared/luahost.js');
globalThis.window = { addEventListener() {} };
globalThis.location = { search: '' };
const { TouchInput } = await import(CH + '/client/touch.js');
const { luaSource } = await import(CH + '/server/assets.js');

const W = 844, H = 390;
const calls = [];
const logs = [];
const dm = new DataModel('client');
for (const s of ['Workspace', 'Players', 'Lighting', 'StarterGui', 'StarterPack', 'Teams', 'RunService', 'UserInputService', 'ContentProvider', 'GuiService', 'CoreGui', 'ScriptContext', 'LogService', 'ContextActionService', 'Debris']) dm.service(s);
const players = dm.services.get('Players');
const player = dm.create('Player', null);
player.props.set('Name', 'Tester');
dm.setParent(player, players);
players.props.set('LocalPlayer', player);
const pg = dm.create('PlayerGui', null);
pg.props.set('Name', 'PlayerGui');
dm.setParent(pg, player);
const mouse = dm.create('PlayerMouse', null);
const rg = dm.create('ScreenGui', null);
rg.props.set('Name', 'RobloxGui');
rg.props.set('AbsoluteSize', [W, H]);
dm.setParent(rg, dm.services.get('CoreGui'));
const uis = dm.services.get('UserInputService');
uis.props.set('TouchEnabled', true);

const env = {
  touch: () => true,
  screenSize: () => [W, H],
  localPlayer: () => player,
  mouseFor: (pl) => (pl === player ? mouse : null),
  rotateCamera: (dx, dy) => calls.push(['rotate', dx, dy]),
  zoomCamera: (d) => calls.push(['zoom', d]),
  moveCharacter: (pl, x, y, m) => calls.push(['move', x, y, m]),
  jumpCharacter: () => calls.push(['jump']),
  log: (k, m, w) => logs.push(`${k} ${w || ''}: ${m}`),
  addCoreScript: () => {},
};
const host = new ScriptHost(dm, env);
host.logs = (k, m, w) => logs.push(`${k} ${w || ''}: ${m}`);
await host.init(() => Lua.create(), fs.readFileSync(CH + '/shared/runtime.lua', 'utf8'));

const touchSources = { 153556783: await luaSource(153556783), 152908679: await luaSource(152908679) };
function addScript(id, name, parent) {
  const s = dm.create('CoreScript', null);
  s.props.set('Name', name);
  s.props.set('Source', touchSources[id] || '');
  host.scanOne && null;
  dm.setParent(s, parent);
  host.scanScripts(s);
}

function layout(inst, pPos, pSize) {
  for (const c of inst.children) {
    if (!c.isA('GuiObject')) continue;
    const P = c.props;
    const sz = P.get('Size'), ps = P.get('Position');
    const w = Math.round(pSize[0] * sz[0] + sz[1]), h = Math.round(pSize[1] * sz[2] + sz[3]);
    const abs = [pPos[0] + Math.round(pSize[0] * ps[0] + ps[1]), pPos[1] + Math.round(pSize[1] * ps[2] + ps[3])];
    P.set('AbsolutePosition', abs);
    P.set('AbsoluteSize', [w, h]);
    layout(c, abs, [w, h]);
  }
}
const screenGuis = () => [rg, ...pg.children.filter((c) => c.isA('ScreenGui'))];
let t = 0;
function tick(n = 3) {
  for (let i = 0; i < n; i++) {
    t += 1 / 60;
    host.tick(t);
    for (const sg of screenGuis()) layout(sg, [0, 0], [W, H]);
  }
}

addScript(153556783, 'TouchControls', rg);
addScript(152908679, 'ContextActionTouch', rg);
tick(30);

const gui = { screenGuis, isTyping: () => false };
const root = { addEventListener() {}, getBoundingClientRect: () => ({ left: 0, top: 0, width: W, height: H }) };
const world = { dm, ready: true, ensureAudio() {}, mouseState: { x: 0, y: 0, ndc: [0, 0] }, mouse, updateMouse() {}, mouseDown() { calls.push(['tap']); }, mouseUp() {}, emitMouse() {} };
const ti = new TouchInput(world, { pick: () => ({}) }, gui, root, null);
const ev = (id, x, y) => ({ pointerType: 'touch', pointerId: id, clientX: x, clientY: y, target: null, preventDefault() {} });

const names = [];
const walk = (i, d) => { for (const c of i.children) { if (c.isA('GuiObject')) names.push('  '.repeat(d) + c.props.get('Name') + ' ' + JSON.stringify(c.props.get('AbsolutePosition')) + ' ' + JSON.stringify(c.props.get('AbsoluteSize'))); walk(c, d + 1); } };
walk(rg, 0);
console.log('GUI tree:\n' + names.join('\n'));

const stick = rg.findChild('TouchControlFrame').findChild('CharacterThumbstick');
const sp = stick.props.get('AbsolutePosition'), ss = stick.props.get('AbsoluteSize');
const cx = sp[0] + ss[0] / 2, cy = sp[1] + ss[1] / 2;
calls.length = 0;
ti.down(ev(1, cx, cy)); tick();
for (let k = 1; k <= 6; k++) { ti.move(ev(1, cx + k * 6, cy - k * 10)); tick(); }
const moves = calls.filter((c) => c[0] === 'move');
console.log('thumbstick move calls:', moves.length, 'last:', JSON.stringify(moves[moves.length - 1]));
ti.up(ev(1, cx + 36, cy - 60)); tick();
console.log('after release:', JSON.stringify(calls.filter((c) => c[0] === 'move').pop()));

const jb = rg.findChild('TouchControlFrame').findChild('JumpButton');
const jp = jb.props.get('AbsolutePosition'), js = jb.props.get('AbsoluteSize');
calls.length = 0;
ti.down(ev(2, jp[0] + js[0] / 2, jp[1] + js[1] / 2)); tick(10);
ti.up(ev(2, jp[0] + js[0] / 2, jp[1] + js[1] / 2)); tick(10);
const jumps = calls.filter((c) => c[0] === 'jump').length;
console.log('jump calls while held:', jumps);
calls.length = 0; tick(10);
console.log('jump calls after release:', calls.filter((c) => c[0] === 'jump').length);

calls.length = 0;
ti.down(ev(3, 600, 150)); tick(15);
for (let k = 1; k <= 8; k++) { ti.move(ev(3, 600 + k * 15, 150 + k * 4)); tick(); }
ti.up(ev(3, 720, 182)); tick();
const rot = calls.filter((c) => c[0] === 'rotate');
console.log('camera rotate calls:', rot.length, 'sample:', JSON.stringify(rot[rot.length - 1]));

calls.length = 0;
ti.down(ev(4, 500, 200)); ti.down(ev(5, 600, 200)); tick();
for (let k = 1; k <= 6; k++) { ti.move(ev(4, 500 - k * 10, 200)); tick(); ti.move(ev(5, 600 + k * 10, 200)); tick(); }
ti.up(ev(4, 440, 200)); ti.up(ev(5, 660, 200)); tick();
const zooms = calls.filter((c) => c[0] === 'zoom');
console.log('pinch zoom calls:', zooms.length, 'total:', zooms.reduce((a, c) => a + c[1], 0).toFixed(2));

calls.length = 0;
ti.down(ev(6, 400, 120)); ti.up(ev(6, 401, 121)); tick();
console.log('tap fired mouse click:', calls.some((c) => c[0] === 'tap'));

const ls = dm.create('LocalScript', null);
ls.props.set('Source', `
local cas = game:GetService("ContextActionService")
cas:BindActionToInputTypes("Reload", function(name, state, obj) print("ACTION", name, state.Name) end, true, "r")
cas:SetTitle("Reload", "R")
local b = cas:GetButton("Reload")
print("BUTTON", b and b.Name, b and b.ActionTitle.Text)
`);
dm.setParent(ls, player);
host.scanScripts(ls);
tick(20);
const cag = pg.findChild('ContextActionGui');
console.log('ContextActionGui created:', !!cag);
const btn = cag && cag.findChild('ContextButtonFrame').findChild('ContextActionButton');
if (btn) {
  const bp = btn.props.get('AbsolutePosition'), bs = btn.props.get('AbsoluteSize');
  ti.down(ev(7, bp[0] + bs[0] / 2, bp[1] + bs[1] / 2)); tick(5);
  ti.up(ev(7, bp[0] + bs[0] / 2, bp[1] + bs[1] / 2)); tick(5);
}
console.log('logs:\n' + logs.join('\n'));
process.exit(0);
