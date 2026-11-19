import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const CH = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(CH + '/package.json');
const RAPIER = require('@dimforge/rapier3d-compat');
await RAPIER.init();
const { DataModel } = await import(CH + '/shared/instance.js');
const { Physics } = await import(CH + '/shared/physics.js');
const { propInfo } = await import(CH + '/shared/classes.js');

const dm = new DataModel('client');
dm.era = 2018;
const ws = dm.service('Workspace');
const physics = new Physics(dm, RAPIER, { simulate: false });
physics.attachWorkspace(ws);
const mk = (cls, name, parent, props = {}) => {
  const i = dm.create(cls, null);
  i.props.set('Name', name);
  for (const [k, v] of Object.entries(props)) i.props.set(k, v);
  dm.setParent(i, parent);
  return i;
};
const cf = (x, y, z) => [x, y, z, 1, 0, 0, 0, 1, 0, 0, 0, 1];
const fails = [];
const check = (label, ok) => {
  console.log(ok ? 'ok  ' : 'FAIL', label);
  if (!ok) fails.push(label);
};

const base = mk('Part', 'Base', ws, { Anchored: true, Size: [200, 0.2, 200], CFrame: cf(0, 0, 0) });
const filter = mk('Folder', 'TargetFilter', ws);
const placing = mk('Folder', 'Placing', filter);
const ghost = mk('Model', 'Ghost', placing);
mk('Part', 'Hitbox', ghost, { Anchored: true, Size: [4, 4, 4], CFrame: cf(0, 2, 0) });
physics.world.step();

const origin = [0, 30, 0];
const down = [0, -1000, 0];
let hit = physics.raycast(origin, down, [filter]);
check('ray passes through TargetFilter descendants and hits base', hit.part === base && Math.abs(hit.normal[1] - 1) < 1e-6);
hit = physics.raycast(origin, down, []);
check('without filter the ghost hitbox is hit', hit.part && hit.part.props.get('Name') === 'Hitbox');

check('SelectionBox.Color3 exists in 2018', !!propInfo('SelectionBox', 'Color3'));

const occA = mk('Part', 'Occupy', mk('Model', 'A', ws), { Anchored: true, CanCollide: true, Size: [4, 0.2, 4], CFrame: cf(50, 1, 50) });
physics.world.step();
const occB = mk('Part', 'Occupy', mk('Model', 'B', ws), { Anchored: true, CanCollide: true, Size: [4, 0.2, 4], CFrame: cf(51, 1, 50) });
let t = physics.touchingParts(occB);
check('fresh anchored CanCollide part sees overlapping anchored part before any step', t.includes(occA));
const occC = mk('Part', 'Occupy', mk('Model', 'C', ws), { Anchored: true, CanCollide: true, Size: [4, 0.2, 4], CFrame: cf(80, 1, 50) });
check('non-overlapping part not reported', !physics.touchingParts(occC).includes(occA));
const occD = mk('Part', 'Occupy', mk('Model', 'D', ws), { Anchored: true, CanCollide: false, Size: [4, 0.2, 4], CFrame: cf(50.5, 1, 50) });
check('CanCollide=false part reports overlaps', physics.touchingParts(occD).includes(occA));
process.exit(fails.length ? 1 : 0);
