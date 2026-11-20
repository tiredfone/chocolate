import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const CH = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(CH + '/package.json');
const { Lua } = require('wasmoon-lua5.1');
const placeId = +process.argv[2];
if (!placeId) {
  console.log('usage: node tools/e2e2018.mjs <placeId>');
  process.exit(1);
}
const { Game } = await import(CH + '/server/game.js');
const { DataModel } = await import(CH + '/shared/instance.js');
const { applyRecords, decodeValue } = await import(CH + '/shared/codec.js');
const { ScriptHost, wireArgs, unwireArgs, T } = await import(CH + '/shared/luahost.js');
const { Core2018 } = await import(CH + '/shared/core2018.js');
const { FLAGS_2018 } = await import(CH + '/shared/api2018.js');

const toClient = [];
const serverLogs = [];
const game = new Game(placeId, {
  jobId: 'e2e', kind: 'public', privateId: 0, allowGear: false, era: 2018,
  send: (cid, data) => toClient.push(JSON.parse(data)),
  kick: (cid, reason) => serverLogs.push('kick: ' + reason),
  log: (line) => serverLogs.push(line),
});
await game.start();
await game.join(1, { id: 1, name: 'Tester', membership: 0, age: 100, dev: true });
const init = toClient.find((m) => m.t === 'init');
const dm = new DataModel('client');
dm.era = 2018;
applyRecords(dm, init.snap);
for (const s of ['Workspace', 'Players', 'Lighting', 'StarterGui', 'StarterPlayer', 'ReplicatedStorage', 'ReplicatedFirst', 'RunService', 'UserInputService', 'GuiService', 'Chat', 'CoreGui', 'ScriptContext', 'ContextActionService', 'TweenService', 'TextService', 'HttpService', 'LocalizationService', 'RobloxReplicatedStorage']) dm.service(s);
const player = dm.byId.get(init.you);
dm.services.get('Players').props.set('LocalPlayer', player);
const ws = dm.services.get('Workspace');
const cam = dm.create('Camera', null);
cam.props.set('Name', 'Camera');
cam.props.set('CameraType', 5);
dm.setParent(cam, ws);
ws.props.set('CurrentCamera', cam);
const rg = dm.create('ScreenGui', null);
rg.props.set('Name', 'RobloxGui');
rg.props.set('AbsoluteSize', [1280, 684]);
dm.setParent(rg, dm.services.get('CoreGui'));
const core = new Core2018(dm, JSON.parse(fs.readFileSync(CH + '/corescripts2018/bundle.json', 'utf8')));
core.buildModules(rg);
const logs = [];
const invokes = new Map();
let seq = 1;
const send = (m) => game.message(1, JSON.stringify(m));
const mouse = dm.create('Mouse', null);
mouse.props.set('Name', 'Mouse');
const env = {
  productInfo: (id) => ({ AssetId: id, Name: 'Test Place', Creator: { Name: 'Tester', CreatorType: 'User', Id: 1 } }),
  touch: () => false, screenSize: () => [1280, 720], localPlayer: () => player, mouseFor: (pl) => (pl === player ? mouse : null), platform: () => 0,
  addCoreScriptLocal: (name, parent) => core.coreScript(name, parent || dm.services.get('ScriptContext')),
  isLoaded: () => true, message: () => '', inFullscreen: () => false, setGuiInset() {},
  remote: (r, op, raw) => { if (op === 'fs') send({ t: 're', id: r.id, a: wireArgs(raw) }); },
  invoke: (r, pl, raw) => {
    const k = seq++;
    return new Promise((resolve) => {
      invokes.set(k, resolve);
      send({ t: 'rf', id: r.id, k, a: wireArgs(raw) });
    });
  },
  invokeResult: (r, token, raw) => send({ t: 'rfr', k: token | 0, a: wireArgs(raw) }),
  focusTextBox: (t, on) => console.log('focusTextBox', t.props.get('Name'), on),
  shutdown: () => console.log('shutdown requested'),
};
const host = new ScriptHost(dm, env);
host.flags = FLAGS_2018;
host.logs = (k, m, w) => { if (k !== 'print') logs.push(`${k} ${w || ''}: ${String(m).split('\n')[0]}`); else if (process.env.LUA) console.log('print', String(m)); };
await host.init(() => Lua.create(), fs.readFileSync(CH + '/shared/runtime.lua', 'utf8'), [{ source: fs.readFileSync(CH + '/shared/runtime2018.lua', 'utf8'), name: 'runtime2018' }]);
dm.root.props.set('PlaceId', placeId);
core.coreScript('LoadingScript', rg);
core.starterScript(dm.services.get('ScriptContext'), false);
let consumed = toClient.indexOf(init) + 1;
const received = {};
const pump = () => {
  for (; consumed < toClient.length; consumed++) {
    const m = toClient[consumed];
    received[m.t] = (received[m.t] || 0) + 1;
    if (m.t === 'rep') {
      for (const op of m.o || []) {
        try {
          if (op[0] === 'p') {
            const inst = dm.byId.get(op[1]);
            const p = inst && inst.info.all.get(op[2]);
            if (p) dm.setProp(inst, op[2], decodeValue(dm, p.type, op[3]), { remote: true });
          } else if (op[0] === 'tg') {
            const inst = dm.byId.get(op[1]);
            if (inst) (op[3] ? dm.addTag(inst, op[2], { remote: true }) : dm.removeTag(inst, op[2], { remote: true }));
          } else if (op[0] === 'n') applyRecords(dm, op[1]);
          else if (op[0] === 'm') {
            const inst = dm.byId.get(op[1]);
            const par = op[2] == null ? null : op[2] === 0 ? dm.root : dm.byId.get(op[2]);
            if (inst && !inst.parentLocked && (op[2] == null || par)) dm.setParent(inst, par, { remote: true });
          } else if (op[0] === 'd') {
            const inst = dm.byId.get(op[1]);
            if (inst) dm.destroy(inst);
          }
        } catch {}
      }
      continue;
    }
    if (m.t === 'rfr') {
      if (process.env.RFR) console.log('rfr payload', JSON.stringify(m.a).slice(0, 600));
      const r = invokes.get(m.k);
      invokes.delete(m.k);
      if (r) r(unwireArgs(dm, m.a));
    } else if (m.t === 're' || m.t === 'rfc') {
      const r = dm.byId.get(m.id);
      if (!r) continue;
      const args = unwireArgs(dm, m.a);
      if (m.t === 're') {
        dm.emit(r, 'OnClientEvent', ...args);
        const ev = r.props.get('Name');
        received['re:' + ev] = (received['re:' + ev] || 0) + 1;
      } else dm.emit(r, '__Invoke', m.k, ...args);
    }
  }
};
let t = 0;
const run = async (seconds) => {
  for (let i = 0; i < seconds * 30; i++) {
    t += 1 / 30;
    host.tick(t); host.renderStep(1 / 30);
    const rs = dm.services.get('RunService');
    if (rs && dm.hasListener(rs, 'RenderStepped')) dm.emit(rs, 'RenderStepped', 1 / 30);
    pump();
    await new Promise((r) => setTimeout(r, 33));
  }
};
if (process.env.LEAVE) {
  setTimeout(() => {
    const hub = dm.root.descendants().find((d) => d.props.get('Name') === 'LeaveGameButton');
    console.log('leave button found:', !!hub);
    if (hub) {
      dm.emit(hub, 'MouseButton1Click');
      dm.emit(hub, 'Activated');
    }
  }, (+(process.env.SECONDS || 8) - 3) * 1000);
}
if (process.env.SLASH) {
  setTimeout(() => {
    console.log('pressing chat hotkey, keys registered:', [...host.guiKeys].join(' '));
    dm.emit(dm.services.get('GuiService'), 'SpecialKeyPressed', T.e('SpecialKey', 5));
  }, (+(process.env.SECONDS || 8) - 2) * 1000);
}
if (process.env.SHIFT) {
  setTimeout(() => {
    const ch = player.props.get('Character');
    const hum = ch && ch.findChildOfClass('Humanoid');
    if (hum) cam.props.set('CameraSubject', hum);
    const uis = dm.services.get('UserInputService');
    const io = dm.create('InputObject', null);
    io.props.set('UserInputType', 8);
    io.props.set('KeyCode', 304);
    io.props.set('UserInputState', 0);
    dm.emit(uis, '__Input', io, false, 'b');
  }, (+(process.env.SECONDS || 8) - 3) * 1000);
}
if (process.env.KEYS) {
  for (const spec of process.env.KEYS.split(',')) {
    const [sec, code, state] = spec.split(':');
    setTimeout(() => {
      const uis = dm.services.get('UserInputService');
      const io = dm.create('InputObject', null);
      io.props.set('UserInputType', 8);
      io.props.set('KeyCode', +code);
      io.props.set('UserInputState', +(state || 0));
      dm.emit(uis, '__Input', io, false, 'b');
    }, +sec * 1000);
  }
}
if (process.env.CLICKCD) {
  const [sec, pattern] = process.env.CLICKCD.split(':');
  setTimeout(() => {
    const cds = game.dm.root.descendants().filter((d) => d.ClassName === 'ClickDetector' && d.fullName().includes(pattern));
    console.log('clickdetectors matching', pattern, cds.length);
    const pl = game.dm.services.get('Players').children.find((c) => c.ClassName === 'Player');
    if (cds[0]) game.dm.emit(cds[0], 'MouseClick', pl);
  }, +sec * 1000);
}
if (process.env.CLICKS) {
  for (const spec of process.env.CLICKS.split(',')) {
    const [sec, name, evt] = spec.split(':');
    setTimeout(() => {
      const pgx = player.findChildOfClass('PlayerGui');
      const target = (pgx ? pgx.descendants() : []).find((d) => (name.includes('.') ? d.fullName().endsWith(name) : d.props.get('Name') === name));
      console.log('click', name, evt, !!target);
      if (target) dm.emit(target, evt || 'MouseButton1Down');
    }, +sec * 1000);
  }
}
if (process.env.FLOW) {
  const steps = process.env.FLOW.split(',').map((x) => x.split(':'));
  let at = 0;
  const firstSeen = new Map();
  const shown = (d) => {
    for (let x = d; x && x.parent; x = x.parent) if (x.isA('GuiObject') && !x.props.get('Visible')) return false;
    return true;
  };
  const tick = () => {
    if (at >= steps.length) return;
    const [name, evt, prop, val] = steps[at];
    const pgx = player.findChildOfClass('PlayerGui');
    const target = (pgx ? pgx.descendants() : []).find((d) => (name.includes('.') ? d.fullName().endsWith(name) : d.props.get('Name') === name) && shown(d));
    if (target && !firstSeen.has(at)) firstSeen.set(at, Date.now());
    if (target && Date.now() - firstSeen.get(at) >= 3000) {
      console.log('flow', at, name, evt);
      if (evt === 'prop') dm.setProp(target, prop, val === 'true' ? true : val === 'false' ? false : val);
      else dm.emit(target, evt || 'MouseButton1Click');
      at++;
      setTimeout(tick, 2500);
    } else setTimeout(tick, 500);
  };
  setTimeout(tick, 15000);
}
if (process.env.LUA) {
  const probe = dm.create('LocalScript', null);
  probe.props.set('Name', 'Probe');
  probe.props.set('Source', process.env.LUA);
  dm.setParent(probe, player.findChildOfClass('PlayerGui') || player);
}
if (process.env.SLUA) {
  const sp = game.dm.create('Script', null);
  sp.props.set('Name', 'ServerProbe');
  sp.props.set('Source', process.env.SLUA);
  game.dm.setParent(sp, game.dm.services.get('ServerScriptService'));
}
await run(+(process.env.SECONDS || 8));
const say = dm.create('LocalScript', null);
say.props.set('Name', 'Say');
say.props.set('Source', 'game:GetService("ReplicatedStorage"):WaitForChild("DefaultChatSystemChatEvents"):WaitForChild("SayMessageRequest"):FireServer("hello from 2018", "All")');
dm.setParent(say, player.findChildOfClass('PlayerGui') || player);
await run(4);
if (process.env.DUMP) for (const svc of process.env.DUMP.split(',')) console.log('server ' + svc + ':', (game.dm.services.get(svc) || { children: [] }).children.map((c) => c.ClassName + ' ' + c.props.get('Name')).join(', '));
game.stop();
console.log('client PlayerScripts:', player.findChildOfClass('PlayerScripts') ? player.findChildOfClass('PlayerScripts').children.map((c) => c.props.get('Name')).join(', ') : 'none');
console.log('client Chat:', dm.services.get('Chat').children.map((c) => c.props.get('Name')).join(', '));
console.log('received from server:', JSON.stringify(received));
console.log('RobloxGui:', rg.children.map((c) => c.props.get('Name')).join(', '));
const pg = player.findChildOfClass('PlayerGui');
const lines = dm.root.descendants().filter((d) => d.props.has('Text') && /hello from 2018|Chat '\/\?'/.test(String(d.props.get('Text')))).map((d) => d.fullName().split('.').slice(-3).join('.') + ' = ' + JSON.stringify(d.props.get('Text')));
console.log('chat lines:', lines.length ? '\n  ' + lines.join('\n  ') : 'none');
console.log('PlayerGui:', pg ? pg.children.map((c) => c.props.get('Name')).join(', ') : 'none');
if (process.env.SPG) {
  const sp = game.dm.root.descendants().find((d) => d.ClassName === 'Player' && d.props.get('Name') === 'Tester');
  const spg = sp && sp.findChildOfClass('PlayerGui');
  console.log('server pending invokes:', game.invokes ? game.invokes.size : 'n/a');
  console.log('server Character:', sp && sp.props.get('Character') ? sp.props.get('Character').props.get('Name') : 'none', 'TeamColor', sp && sp.props.get('TeamColor'));
  console.log('server PlayerGui:', spg ? spg.children.map((c) => c.props.get('Name')).join(', ') : 'none');
}
if (process.env.TEXTS) {
  const re = new RegExp(process.env.TEXTS);
  for (const d of dm.root.descendants()) if (d.props.has('Text') && re.test(String(d.props.get('Text')))) console.log('text', d.fullName().split('.').slice(-4).join('.'), JSON.stringify(d.props.get('Text')), 'vis', d.props.get('Visible'), 'size', JSON.stringify(d.props.get('AbsoluteSize')), 'pos', JSON.stringify(d.props.get('AbsolutePosition')));
}
if (process.env.ALL) console.log('server output:\n' + serverLogs.map((l) => '  ' + l.replace(/^\[place [^\]]+\] /, '').slice(0, 300)).join('\n'));
const serverErr = serverLogs.filter((l) => /\[(error|warn)\]|kick/.test(l)).map((l) => 'server ' + l.replace(/^\[place [^\]]+\] /, '').slice(0, 300));
const uniq = [...new Set([...logs, ...serverErr])];
console.log(`${uniq.length} problems:\n` + uniq.join('\n'));
process.exit(0);
