import RAPIER from '@dimforge/rapier3d-compat';
import { configure, endpointUrl, loadContentIndex } from '../client/assets.js';
import { DataModel } from '../shared/instance.js';
import { parsePlace } from '../shared/rbxl.js';
import { Physics } from '../shared/physics.js';
import { Renderer } from '../client/render.js';
import { Studio } from './studio.js';
import { connectTeam, loadSnapshot, TeamSync } from './teamcreate.js';

const cfg = JSON.parse(document.getElementById('chocolate-config').textContent || '{}');
configure(cfg);
const status = document.getElementById('studio-status');
const say = (t) => {
  if (status) status.textContent = t;
};

async function placeBytes() {
  const url = endpointUrl('studioPlace', cfg.placeId);
  if (!url) return null;
  const r = await fetch(url, { credentials: 'same-origin', cache: 'no-store' });
  if (!r.ok) throw new Error(r.status === 403 ? 'You do not own this place.' : `The place could not be loaded (${r.status}).`);
  return new Uint8Array(await r.arrayBuffer());
}

async function boot() {
  let team = null, teamError = null;
  if (endpointUrl('studioTicket', cfg.placeId)) {
    say('Joining Team Create');
    await Promise.all([RAPIER.init(), loadContentIndex()]);
    team = await connectTeam(cfg).catch((e) => {
      teamError = e;
      return null;
    });
  }
  const dm = new DataModel('client');
  for (const s of ['Workspace', 'Lighting', 'StarterGui', 'StarterPack']) dm.service(s);
  let gids = null;
  if (team) {
    say('Reading place');
    gids = loadSnapshot(dm, team.snap);
  } else {
    say('Loading place');
    const [bytes] = await Promise.all([placeBytes(), RAPIER.init(), loadContentIndex()]);
    if (bytes && bytes.length) {
      say('Reading place');
      dm.load(parsePlace(bytes), dm.root, { track: true });
    }
  }
  const ws = dm.services.get('Workspace');
  if (!team && !ws.children.some((c) => c.isA && c.isA('BasePart'))) {
    const base = dm.create('Part', null);
    base.props.set('Name', 'Baseplate');
    base.props.set('Anchored', true);
    base.props.set('Locked', true);
    base.props.set('Size', [512, 1.2, 512]);
    base.props.set('CFrame', [0, -0.6, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1]);
    base.props.set('BrickColor', 1);
    base.props.set('TopSurface', 3);
    base.props.set('BottomSurface', 4);
    dm.setParent(base, ws);
  }
  say('Starting');
  const canvas = document.createElement('canvas');
  const renderer = new Renderer(canvas, { dm });
  renderer.attach();
  const physics = new Physics(dm, RAPIER, { simulate: false, excluded: () => false });
  physics.attachWorkspace(ws);
  const root = document.getElementById('studio');
  root.replaceChildren();
  const app = new Studio({ root, dm, renderer, physics, cfg });
  window.__studio = app;
  if (team) app.team = new TeamSync(app, team, gids);
  else if (teamError) app.print(`Team Create is unavailable (${teamError.message}). You are editing on your own; save before others edit.`, 'err');
  let last = performance.now();
  const loop = (now) => {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    try {
      app.frame(dt);
    } catch (e) {
      console.error(e);
    }
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}

boot().catch((e) => {
  console.error(e);
  say(e.message || 'Studio could not start.');
});
