import RAPIER from '@dimforge/rapier3d-compat';
import { Lua } from 'wasmoon-lua5.1';
import { Net } from './net.js';
import { ClientWorld } from './world.js';
import { Renderer } from './render.js';
import { CameraController } from './camera.js';
import { Gui } from './gui.js';
import { TouchInput, detectTouch } from './touch.js';
import { T } from '../shared/luahost.js';
import { configure, publicPath, endpointUrl, loadContentIndex } from './assets.js';
import { CursorLayer, CURSORS } from './cursor.js';

const cfg = JSON.parse(document.getElementById('chocolate-config').textContent);
configure(cfg);
const pageUrl = (name, id) => endpointUrl(name, id) || '/';
const root = document.getElementById('chocolate');
const canvas = document.getElementById('chocolate-canvas');
const cursor = new CursorLayer(canvas);
const loading = document.getElementById('chocolate-loading');
const status = document.getElementById('chocolate-status');
const fatal = document.getElementById('chocolate-fatal');
const touch = detectTouch();

function setStatus(t) {
  status.textContent = t;
}

const bootText = loading.querySelector('.ch-boot-loading');
let bootDots = 0;
const bootTimer = setInterval(() => {
  if (loading.hidden) return clearInterval(bootTimer);
  bootDots = (bootDots + 1) % 6;
  if (bootText) bootText.textContent = 'Loading' + '.'.repeat(bootDots);
}, 300);

function showFatal(title, detail) {
  loading.hidden = true;
  fatal.hidden = false;
  fatal.querySelector('h2').textContent = title;
  fatal.querySelector('p').textContent = detail || '';
}

async function ticket() {
  const r = await fetch(endpointUrl('ticket'), {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': cfg.csrf },
    body: JSON.stringify({ placeId: cfg.placeId }),
  });
  const j = await r.json().catch(() => null);
  if (!r.ok || !j || !j.ticket) throw new Error((j && j.error) || 'Could not get a join ticket');
  return j;
}

function wsUrl(path) {
  if (/^wss?:\/\//.test(path)) return path;
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${location.host}${path}`;
}

async function boot() {
  setStatus('Requesting a server');
  const [t, src] = await Promise.all([ticket(), fetch(publicPath('/shared/runtime.lua?v=') + cfg.version).then((r) => r.text()), RAPIER.init(), loadContentIndex()]);
  setStatus('Connecting');
  const net = new Net();
  let world = null, renderer = null, camera = null, gui = null;
  const pending = [];
  let kicked = false;
  net.on('kick', (m) => {
    kicked = true;
    showFatal('Disconnected', m.m || 'You were disconnected from the game.');
  });
  net.on('close', (ev) => {
    if (!kicked) showFatal('Connection lost', ev.code === 4003 ? 'Your join ticket was not accepted. Reload the page to try again.' : 'The connection to the game server was closed.');
  });
  net.on('anim', (m) => {
    if (world && world.ready) world.remoteAnim(m);
    else pending.push(m);
  });
  net.on('rep', (m) => {
    if (world && world.ready) world.applyRep(m);
    else pending.push(m);
  });
  net.on('chat', (m) => {
    if (!world || !world.ready) return;
    const dm = world.dm;
    const players = dm.services.get('Players');
    const speaker = m.p ? dm.byId.get(m.p) : players.children.find((c) => c.ClassName === 'Player' && c.props.get('userId') === m.u);
    const kind = m.k === 'team' ? 1 : m.k === 'whisper' ? 2 : 0;
    const to = m.to ? dm.byId.get(m.to) || null : null;
    if (speaker) dm.emit(players, 'PlayerChatted', T.e('PlayerChatType', kind), speaker, m.m, to);
    const head = m.h && dm.byId.get(m.h);
    if (head && gui && kind !== 2) gui.bubble(head, m.m);
  });
  net.on('bubble', (m) => {
    const p = world && world.dm.byId.get(m.id);
    if (p && gui) gui.bubble(p, m.m);
  });
  net.on('msg', (m) => gui && gui.setHint(m.m));
  net.on('out', (m) => {
    if (!world || !world.ready) return;
    const ls = world.dm.services.get('LogService');
    if (ls) world.dm.emit(ls, 'MessageOut', '[server] ' + m.m, T.e('MessageType', m.k === 'error' ? 3 : m.k === 'warn' ? 2 : 0));
  });
  net.on('teleport', (m) => {
    if ((m.place | 0) > 0) location.href = pageUrl('play', m.place);
  });
  net.on('init', async (m) => {
    setStatus('Loading the world');
    try {
      world = new ClientWorld(net, {
        touch,
        screenSize: () => [root.clientWidth, root.clientHeight],
        rotateCamera: (dx, dy) => camera && camera.rotateBy(dx, dy),
        cameraTilt: (dir) => camera && camera.rotateBy(0, dir * 0.1745),
        cameraZoom: (dir) => camera && camera.zoomBy(dir > 0 ? 0.8 : 1.25),
        toggleFullscreen: () => {
          if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
          else if (root.requestFullscreen) root.requestFullscreen().catch(() => {});
        },
        inFullscreen: () => !!document.fullscreenElement,
        screenshot: () => {
          if (!renderer) return;
          renderer.frame(0);
          const a = document.createElement('a');
          a.download = `${cfg.placeName || 'Screenshot'}.png`.replace(/[\\/:*?"<>|]/g, '_');
          a.href = canvas.toDataURL('image/png');
          a.click();
        },
        message: () => status.textContent,
        zoomCamera: (d) => camera && camera.zoomBy(Math.exp(-d * 0.15)),
        log: (k, msg, where) => {
          const line = where ? `${where}: ${msg}` : msg;
          if (k === 'error') console.error(line);
          else console.log(line);
        },
        kicked: (msg) => {
          kicked = true;
          net.close();
          showFatal('Disconnected', msg);
        },
        focusTextBox: (inst, on) => gui && gui.focusTextBox(inst, on),
        setMessage: (msg) => gui && gui.setHint(msg),
        bubble: (part, msg) => gui && gui.bubble(part, msg),
        ownCharacter: (model) => {
          const hum = model.findChildOfClass('Humanoid');
          world.camera.props.set('CameraSubject', hum);
        },
        died: () => {},
        leave: () => {
          net.close();
          location.href = pageUrl('gamePage', cfg.placeId);
        },
      });
      await world.init(m, RAPIER, () => Lua.create({ customWasmUri: publicPath('/client/vendor/liblua5.1.wasm') }), src);
      renderer = new Renderer(canvas, world);
      renderer.attach();
      camera = new CameraController(world, renderer, canvas);
      gui = new Gui(root, world, renderer, {
        leave: () => {
          net.close();
          location.href = pageUrl('gamePage', cfg.placeId);
        },
        sendChat: (msg) => net.send({ t: 'chat', m: msg }),
        send: (o) => net.send(o),
        flush: () => world.host.tick(world.t),
      });
      if (touch) new TouchInput(world, renderer, gui, root, canvas);
      world.ready = true;
      for (const p of pending.splice(0)) if (p.t === 'anim') world.remoteAnim(p); else world.applyRep(p);
      loading.hidden = true;
      document.addEventListener('fullscreenchange', () => {
        const us = world.host._userSettings;
        const gs = us && us.findChild('GameSettings');
        if (gs) world.dm.emit(gs, 'FullscreenChanged', !!document.fullscreenElement);
      });
      world.markLoaded();
      start(world, renderer, camera, gui, net);
    } catch (e) {
      console.error(e);
      showFatal('Something went wrong', e.message);
    }
  });
  await net.connect(wsUrl(t.ws || cfg.websocketPath || publicPath('/ws')) + '?ticket=' + encodeURIComponent(t.ticket));
  setStatus('Joining');
}

function start(world, renderer, camera, gui, net) {
  const held = new Set();
  const codes = new Set();
  let jumpQueued = false;
  const KEYMAP = { w: 'forward', arrowup: 'forward', s: 'back', arrowdown: 'back', a: 'left', d: 'right' };
  window.addEventListener('keydown', (e) => {
    if (gui.isTyping()) return;
    const k = e.key.length === 1 ? e.key.toLowerCase() : e.key.toLowerCase();
    const dm = world.dm;
    const gs = dm.services.get('GuiService');
    const keys = world.host.guiKeys;
    if (k === '/' && keys.has('special:5')) {
      e.preventDefault();
      dm.emit(gs, 'SpecialKeyPressed', T.e('SpecialKey', 5));
      return;
    }
    if (k === 'escape') dm.emit(gs, 'EscapeKeyPressed');
    const special = { insert: 0, home: 1, end: 2, pageup: 3, pagedown: 4 }[k];
    if (special !== undefined && keys.has('special:' + special)) dm.emit(gs, 'SpecialKeyPressed', T.e('SpecialKey', special));
    const claimed = k.length === 1 && keys.has(k);
    if (claimed && !e.repeat) dm.emit(gs, 'KeyPressed', k);
    if (k === 'tab') e.preventDefault();
    if (e.repeat) return;
    world.ensureAudio();
    held.add(k);
    if (e.code) codes.add(e.code);
    if (k === ' ') {
      jumpQueued = true;
      e.preventDefault();
    }
    if (k === 'arrowleft') camera.keyYaw = 1;
    if (k === 'arrowright') camera.keyYaw = -1;
    if (k === 'i') camera.zoomBy(1 / 1.25);
    if (k === 'o') camera.zoomBy(1.25);
    if (k === 'backspace') {
      e.preventDefault();
      world.dropTool();
    }
    if (/^[0-9]$/.test(k) && !claimed) {
      const items = world.backpackItems();
      const idx = k === '0' ? 9 : +k - 1;
      if (items[idx]) world.toggleSlot(items[idx]);
    }
    const lua = k === ' ' ? ' ' : k === 'enter' ? '\r' : k === 'backspace' ? '\b' : k === 'tab' ? '\t' : k === 'shift' ? String.fromCharCode(48) : k.length === 1 ? k : null;
    if (lua) world.keyDown(lua);
  });
  window.addEventListener('keyup', (e) => {
    const k = e.key.length === 1 ? e.key.toLowerCase() : e.key.toLowerCase();
    held.delete(k);
    if (e.code) codes.delete(e.code);
    if (k === 'arrowleft' || k === 'arrowright') camera.keyYaw = 0;
    const lua = k === ' ' ? ' ' : k === 'enter' ? '\r' : k === 'shift' ? String.fromCharCode(48) : k.length === 1 ? k : null;
    if (lua) world.keyUp(lua);
  });
  window.addEventListener('blur', () => {
    held.clear();
    codes.clear();
    camera.keyYaw = 0;
  });
  const ms = world.mouseState;
  canvas.addEventListener('pointermove', (e) => {
    if (e.pointerType === 'touch') return;
    const r = canvas.getBoundingClientRect();
    ms.x = e.clientX - r.left;
    ms.y = e.clientY - r.top;
    ms.ndc = [(ms.x / r.width) * 2 - 1, -(ms.y / r.height) * 2 + 1];
    world.emitMouse('Move');
  });
  canvas.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'touch') return;
    world.ensureAudio();
    if (gui.isTyping()) document.activeElement.blur();
    if (e.button === 0) world.mouseDown(0);
  });
  window.addEventListener('pointerup', (e) => {
    if (e.pointerType === 'touch') return;
    if (e.button === 0 && ms.down) world.mouseUp(0);
  });
  canvas.addEventListener('wheel', (e) => {
    world.emitMouse(e.deltaY > 0 ? 'WheelBackward' : 'WheelForward');
  });
  let last = performance.now();
  let pingT = 0;
  const loop = (now) => {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    const f = camera.forwardFlat(), rt = camera.rightFlat();
    const key = (code, letter) => (codes.size || !held.has(letter) ? codes.has(code) : true);
    let fw = (key('KeyW', 'w') || held.has('arrowup') ? 1 : 0) - (key('KeyS', 's') || held.has('arrowdown') ? 1 : 0);
    let sd = (key('KeyD', 'd') ? 1 : 0) - (key('KeyA', 'a') ? 1 : 0);
    const tm = world.touchMove;
    if (tm && !fw && !sd) {
      fw = -tm[1];
      sd = tm[0];
    }
    const move = [f[0] * fw + rt[0] * sd, 0, f[2] * fw + rt[2] * sd];
    const input = { move, jump: held.has(' ') || jumpQueued || world.touchJump, forward: fw > 0.3, back: fw < -0.3, left: sd < -0.3, right: sd > 0.3 };
    jumpQueued = false;
    world.touchJump = false;
    try {
      world.update(dt, input);
      camera.update(dt);
      const ray = renderer.pick(ms.ndc[0], ms.ndc[1]);
      ms.overGui = false;
      const cd = world.updateMouse(ray, renderer);
      const icon = (world.toolMouse && world.toolMouse.props.get('Icon')) || world.mouse.props.get('Icon');
      cursor.set(icon || (cd ? CURSORS.hand : world.mouseHit && world.mouseHit.part ? CURSORS.arrow : CURSORS.far));
      if (document.pointerLockElement === canvas) cursor.place(camera.firstPerson);
      renderer.frame(dt);
      gui.frame();
    } catch (e) {
      console.error(e);
    }
    pingT += dt;
    if (pingT > 5) {
      pingT = 0;
      net.send({ t: 'ping', x: Date.now() });
    }
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}

boot().catch((e) => {
  console.error(e);
  showFatal('Could not join', e.message);
});
