import path from 'path';
import { fileURLToPath } from 'url';

const CH = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const placeId = +process.argv[2];
const era = +(process.argv[3] || 2018);
if (!placeId) {
  console.log('usage: node tools/server2018.mjs <placeId> [2012|2018]');
  process.exit(1);
}
const { Game } = await import(CH + '/server/game.js');
const sent = [];
const logs = [];
const game = new Game(placeId, {
  jobId: 'test', kind: 'public', privateId: 0, allowGear: false, era,
  send: (cid, data) => sent.push(data),
  kick: (cid, reason) => logs.push(`kick ${cid}: ${reason}`),
  log: (line) => logs.push(line),
});
await game.start();
await game.join(1, { id: 1, name: 'Tester', membership: 0, age: 100, dev: true });
await new Promise((r) => setTimeout(r, +(process.env.MS || 6000)));
game.stop();
const init = sent.map((s) => JSON.parse(s)).find((m) => m.t === 'init');
const kinds = {};
for (const s of sent) {
  const t = JSON.parse(s).t;
  kinds[t] = (kinds[t] || 0) + 1;
}
console.log('init era:', init && init.era, 'snapshot records:', init && init.snap && init.snap.length);
console.log('messages:', JSON.stringify(kinds));
const dm = game.dm;
const pl = dm.services.get('Players').children.find((c) => c.ClassName === 'Player');
const ps = pl && pl.findChildOfClass('PlayerScripts');
console.log('PlayerScripts:', ps ? ps.children.map((c) => c.props.get('Name')).join(', ') : 'none');
const ch = pl && pl.props.get('Character');
console.log('Character:', ch ? ch.children.map((c) => c.props.get('Name')).join(', ') : 'none');
const chat = dm.services.get('Chat');
console.log('Chat:', chat.children.map((c) => c.props.get('Name')).join(', '));
const rs = dm.services.get('ReplicatedStorage');
console.log('ReplicatedStorage:', rs.children.map((c) => c.props.get('Name')).join(', '));
console.log(logs.filter((l) => /\[(error|warn)\]|kick|failed/.test(l)).map((l) => l.replace(/^\[place [^\]]+\] /, '').slice(0, 400)).join('\n') || 'no errors');
process.exit(0);
