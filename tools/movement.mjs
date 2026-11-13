import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
const CH = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(CH + '/package.json');
const RAPIER = require('@dimforge/rapier3d-compat');
const { DataModel } = await import(CH + '/shared/instance.js');
const { Physics } = await import(CH + '/shared/physics.js');
const { buildCharacter, Controller, CharacterProxy } = await import(CH + '/shared/humanoid.js');
const C = await import(CH + '/shared/cframe.js');
await RAPIER.init();

function scene(parts) {
  const dm = new DataModel('client');
  const ws = dm.service('Workspace');
  for (const [name, pos, size] of parts) {
    const p = dm.create('Part', null);
    p.props.set('Name', name);
    p.props.set('Anchored', true);
    p.props.set('Size', size);
    p.props.set('CFrame', C.cf(pos[0], pos[1], pos[2]));
    dm.setParent(p, ws);
  }
  const ph = new Physics(dm, RAPIER, { simulate: false, excluded: () => false });
  ph.attachWorkspace(ws);
  const { model, humanoid } = buildCharacter(dm, 'Tester', [0, 4, 0]);
  const ctrl = new Controller(ph, model, humanoid);
  ctrl.teleport(C.cf(0, 4, 0));
  return { ph, ctrl };
}

function run({ ph, ctrl }, seconds, input) {
  const dt = 1 / 60;
  let r, maxY = -Infinity, jumps = 0, prev = null;
  for (let i = 0; i < seconds * 60; i++) {
    r = ctrl.update(dt, typeof input === 'function' ? input(i * dt) : input);
    ph.world.step();
    maxY = Math.max(maxY, r.cf[1]);
    if (r.state === 2 && prev !== 2) jumps++;
    prev = r.state;
  }
  return { x: +r.cf[0].toFixed(2), y: +r.cf[1].toFixed(2), z: +r.cf[2].toFixed(2), maxY: +maxY.toFixed(2), jumps };
}

const fwd = { move: [0, 0, -1], jump: false };
const seam = scene([['A', [0, -0.5, 0], [40, 1, 40]], ['B', [0, -0.5, -40], [40, 1, 40]]]);
run(seam, 1, { move: [0, 0, 0] });
console.log('seam crossing (expect z well past -20):', JSON.stringify(run(seam, 3, fwd)));

const lip = scene([['A', [0, -0.5, 0], [40, 1, 40]], ['B', [0, -0.45, -40], [40, 1, 40]]]);
run(lip, 1, { move: [0, 0, 0] });
console.log('seam with 0.05 lip (expect z well past -20):', JSON.stringify(run(lip, 3, fwd)));

const plate = scene([['Floor', [0, -0.5, 0], [60, 1, 60]], ['Plate', [0, 0.2, -10], [8, 0.4, 4]]]);
run(plate, 1, { move: [0, 0, 0] });
console.log('0.4-stud plate (expect walked past z=-12):', JSON.stringify(run(plate, 1.2, fwd)));

const step = scene([['Floor', [0, -0.5, 0], [60, 1, 60]], ['Brick', [0, 0.6, -10], [8, 1.2, 4]]]);
run(step, 1, { move: [0, 0, 0] });
console.log('1.2-stud brick (expect y about 1.2 higher, on top):', JSON.stringify(run(step, 1.0, fwd)));

const wall = scene([['Floor', [0, -0.5, 0], [60, 1, 60]], ['Wall', [0, 1.2, -10], [8, 2.4, 4]]]);
run(wall, 1, { move: [0, 0, 0] });
console.log('2.4-stud wall without jumping (expect blocked near z=-7):', JSON.stringify(run(wall, 2, fwd)));

const hop = scene([['Floor', [0, -0.5, 0], [60, 1, 60]]]);
run(hop, 1, { move: [0, 0, 0] });
console.log('jump held 3s (expect a few landed jumps, maxY about 9.4: a jump peaks 6.4 studs up):', JSON.stringify(run(hop, 3, { move: [0, 0, 0], jump: true })));
const ledge = scene([['Floor', [0, -0.5, 0], [60, 1, 60]], ['Ledge', [0, 2, -10], [12, 4, 6]]]);
run(ledge, 1, { move: [0, 0, 0] });
console.log('4-stud ledge, walking (expect climbed: maxY about 7):', JSON.stringify(run(ledge, 1.6, fwd)));

const rungs = scene([['Floor', [0, -0.5, 0], [60, 1, 60]], ...[0, 1, 2, 3, 4, 5, 6, 7].map((k) => ['Rung' + k, [0, 1.5 + k * 2, -6], [4, 0.4, 0.4]]), ['Top', [0, 16.2, -9], [8, 1, 6]]]);
run(rungs, 1, { move: [0, 0, 0] });
console.log('ladder of rungs 2 studs apart (expect maxY above 19):', JSON.stringify(run(rungs, 4, fwd)));

const tall = scene([['Floor', [0, -0.5, 0], [60, 1, 60]], ['Tall', [0, 10, -8], [12, 20, 1]]]);
run(tall, 1, { move: [0, 0, 0] });
console.log('tall flat wall (expect blocked, maxY 2.99):', JSON.stringify(run(tall, 2, fwd)));

function players(otherAt) {
  const s = scene([['Floor', [0, -0.5, 0], [80, 1, 80]]]);
  const { model } = buildCharacter(s.ph.dm, 'Other', otherAt);
  const proxy = new CharacterProxy(s.ph, model, { sensors: false, blocking: true });
  proxy.update(C.cf(otherAt[0], otherAt[1], otherAt[2]));
  s.ph.world.step();
  return s;
}
const block = players([0, 3, -8]);
run(block, 0.5, { move: [0, 0, 0] });
console.log('walking into a player (expect stopped near z=-6, y 2.99):', JSON.stringify(run(block, 1.5, fwd)));
const inside = players([0.4, 3, -0.3]);
console.log('spawned inside a player (expect pushed apart and able to walk away to z<-10):', JSON.stringify(run(inside, 2, fwd)));
const glance = players([1.2, 3, -8]);
run(glance, 0.5, { move: [0, 0, 0] });
console.log('brushing past a player (expect slid around, z<-14):', JSON.stringify(run(glance, 2, fwd)));
process.exit(0);
