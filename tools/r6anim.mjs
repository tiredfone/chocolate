import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
const CH = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(CH + '/package.json');
const { Lua } = require('wasmoon-lua5.1');
const { DataModel } = await import(CH + '/shared/instance.js');
const { ScriptHost, T } = await import(CH + '/shared/luahost.js');
const { FLAGS_2018 } = await import(CH + '/shared/api2018.js');
const { Animations, animAssetId, parseSequence } = await import(CH + '/shared/animator.js');
const { buildCharacter, Rig } = await import(CH + '/shared/humanoid.js');
const { parsePlace } = await import(CH + '/shared/rbxl.js');
const C = await import(CH + '/shared/cframe.js');
const dm = new DataModel('client');
dm.era = 2018;
for (const s of ['Workspace', 'Players', 'RunService', 'ScriptContext', 'ReplicatedStorage', 'Lighting']) dm.service(s);
const ws = dm.services.get('Workspace');
const player = dm.create('Player', null);
player.props.set('Name', 'Tester');
dm.setParent(player, dm.services.get('Players'));
dm.services.get('Players').props.set('LocalPlayer', player);
const { model, parts, humanoid } = buildCharacter(dm, 'Tester', [0, 4, 0], { rootPart: true });
dm.setParent(model, ws);
player.props.set('Character', model);
const anims = new Animations(dm, async (id) => {
  const bytes = fs.readFileSync('/var/www/assets/cache/' + id);
  const m = dm.create('Model', null);
  m.props.set('Name', 'Model');
  dm.load(parsePlace(new Uint8Array(bytes)), m);
  return m;
});
const ops = [];
const env = {
  localPlayer: () => player, platform: () => 0, isLoaded: () => true,
  animate: (tr, op, a, b, c) => {
    const hum = tr.data.hum;
    const anim = tr.props.get('Animation');
    const id = animAssetId(anim && anim.props.get('AnimationId'));
    ops.push(`${t.toFixed(2)} ${op} ${id} a=${a} b=${b} c=${c} prio=${JSON.stringify(tr.props.get('Priority'))}`);
    anims.op(hum, 'l' + tr.id, op, id, a, b, c, tr);
  },
  playingTracks: (h) => anims.playing(h), animTrack: (x) => anims.trackOf(x),
};
const host = new ScriptHost(dm, env);
host.flags = FLAGS_2018;
host.logs = (k, m) => { if (process.env.LUA) console.log(k, String(m).split('\n')[0]); };
await host.init(() => Lua.create(), fs.readFileSync(CH + '/shared/runtime.lua', 'utf8'), [{ source: fs.readFileSync(CH + '/shared/runtime2018.lua', 'utf8'), name: 'runtime2018' }]);
const kids = parsePlace(fs.readFileSync(CH + '/content2018/avatar/scripts/humanoidAnimateLocalKeyframe.rbxm'));
dm.load(kids, model);
const hum = humanoid;
const rig = new Rig(model);
let t = 0;
const DT = 1 / 30;
const names = ['Torso', 'Head', 'Right Arm', 'Left Arm', 'Right Leg', 'Left Leg'];
const jointOf = (n) => model.descendants().find((d) => d.isA('JointInstance') && d.props.get('Part1') && d.props.get('Part1').props.get('Name') === n);
const fmt = (cf) => cf ? cf.map((v) => (Math.round(v * 1000) / 1000)).join(',') : '-';
async function run(sec, label) {
  const n = Math.round(sec / DT);
  for (let i = 0; i < n; i++) {
    t += DT;
    host.tick(t);
    host.renderStep(DT);
    anims.step(DT, (inst, ev, arg) => dm.emit(inst, ev, arg));
    await new Promise((r) => setTimeout(r, 0));
    if (process.env.TRACE && i % +process.env.TRACE === 0) console.log(t.toFixed(2), label, ['Right Arm', 'Right Leg', 'Torso'].map((x) => { const j = jointOf(x); return x + '=' + fmt(j && j.anim); }).join(' '));
  }
}
const playing = () => (anims.byHum.get(hum) ? anims.byHum.get(hum).tracks.map((x) => `${x.id}:w=${x.w.toFixed(2)}${x.target ? '' : '(out)'}:p=${anims.priorityOf(x)}:t=${x.t.toFixed(2)}:sp=${x.speed.toFixed(2)}`).join(' | ') : 'none');
export { dm, hum, model, anims, host, run, playing, jointOf, fmt, ops, parseSequence, C, rig, parts, DT, T, fs };
export const clock = () => t;
globalThis.__t = () => t;
