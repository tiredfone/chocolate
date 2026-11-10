import { parentPort, workerData } from 'worker_threads';
import { Game } from './game.js';

const game = new Game(workerData.placeId, {
  jobId: workerData.jobId,
  kind: workerData.kind,
  privateId: workerData.privateId,
  allowGear: workerData.allowGear !== false,
  send: (cid, data) => parentPort.postMessage({ t: 'send', cid, data }),
  kick: (cid, reason) => parentPort.postMessage({ t: 'kick', cid, reason }),
  log: (line) => parentPort.postMessage({ t: 'log', line }),
});

const queue = [];
let started = false;

parentPort.on('message', (m) => {
  if (!started) {
    queue.push(m);
    return;
  }
  dispatch(m);
});

function dispatch(m) {
  if (m.t === 'join') game.join(m.cid, m.user).catch((e) => {
    parentPort.postMessage({ t: 'log', line: `[place ${workerData.placeId} ${workerData.jobId}] join failed: ${e.stack || e.message}` });
    parentPort.postMessage({ t: 'kick', cid: m.cid, reason: 'Could not join the game' });
  });
  else if (m.t === 'msg') game.message(m.cid, m.data);
  else if (m.t === 'leave') game.leave(m.cid);
  else if (m.t === 'stop') {
    game.stop();
    process.exit(0);
  }
}

game.start().then(() => {
  started = true;
  parentPort.postMessage({ t: 'ready' });
  for (const m of queue.splice(0)) dispatch(m);
}).catch((e) => {
  parentPort.postMessage({ t: 'failed', error: e.stack || e.message });
});
