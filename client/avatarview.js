import { configure, assetBytes, loadContentIndex } from './assets.js';
import { DataModel } from '../shared/instance.js';
import { parsePlace } from '../shared/rbxl.js';
import { Renderer } from './render.js';
import * as C from '../shared/cframe.js';
import { buildCharacter, attachAccessory, gripWeld, partColorProps, Rig } from '../shared/humanoid.js';

const COLOR_PROPS = { Head: 'HeadColor', Torso: 'TorsoColor', 'Left Arm': 'LeftArmColor', 'Right Arm': 'RightArmColor', 'Left Leg': 'LeftLegColor', 'Right Leg': 'RightLegColor' };
const FRAME_MS = 1000 / 30;
const IDLE_MS = 400;
const SETTLE_MS = 45000;

export class AvatarView {
  constructor(canvas, opts = {}) {
    this.canvas = canvas;
    this.dm = new DataModel('client');
    for (const s of ['Workspace', 'Lighting']) this.dm.service(s);
    this.ws = this.dm.services.get('Workspace');
    this.nodes = new Map();
    this.model = null;
    this.seq = 0;
    this.yaw = Math.PI;
    this.pitch = 0.12;
    this.dist = 13;
    this.target = [0, 2.6, 0];
    const r = new Renderer(canvas, { dm: this.dm });
    r.applySky = () => {};
    r.updateSunSprite = () => {};
    r.skyDome.visible = false;
    r.camera.fov = 32;
    r.camera.near = 0.5;
    r.camera.far = 200;
    r.r.setClearColor(opts.background || 0xdfe5eb, 1);
    r.attach();
    this.renderer = r;
    this.bindInput();
    this.placeCamera();
    this.running = false;
    this.visible = true;
    if ('IntersectionObserver' in window) {
      new IntersectionObserver((es) => {
        this.visible = es.some((e) => e.isIntersecting);
        this.wake();
      }).observe(canvas);
    }
    document.addEventListener('visibilitychange', () => this.wake());
    new ResizeObserver(() => {
      r.resize();
      this.wake();
    }).observe(canvas);
  }

  setBackground(c) {
    this.renderer.r.setClearColor(c, 1);
    this.wake();
  }

  bindInput() {
    const c = this.canvas;
    let drag = null;
    const pointers = new Map();
    c.style.touchAction = 'pan-y';
    c.addEventListener('pointerdown', (e) => {
      pointers.set(e.pointerId, [e.clientX, e.clientY]);
      drag = { x: e.clientX, y: e.clientY, yaw: this.yaw, pitch: this.pitch, moved: false };
      c.setPointerCapture(e.pointerId);
    });
    c.addEventListener('pointermove', (e) => {
      if (!drag || !pointers.has(e.pointerId)) return;
      pointers.set(e.pointerId, [e.clientX, e.clientY]);
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      if (!drag.moved && Math.abs(dx) + Math.abs(dy) < 4) return;
      drag.moved = true;
      this.yaw = drag.yaw - dx * 0.012;
      this.pitch = Math.max(-0.5, Math.min(0.9, drag.pitch + dy * 0.006));
      this.placeCamera();
    });
    const up = (e) => {
      pointers.delete(e.pointerId);
      if (!pointers.size) drag = null;
    };
    c.addEventListener('pointerup', up);
    c.addEventListener('pointercancel', up);
    c.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.dist = Math.max(6, Math.min(22, this.dist + Math.sign(e.deltaY)));
      this.placeCamera();
    }, { passive: false });
  }

  placeCamera() {
    const cam = this.renderer.camera;
    const [tx, ty, tz] = this.target;
    const cp = Math.cos(this.pitch);
    cam.position.set(tx + Math.sin(this.yaw) * cp * this.dist, ty + Math.sin(this.pitch) * this.dist, tz + Math.cos(this.yaw) * cp * this.dist);
    cam.lookAt(tx, ty, tz);
    this.wake(400);
  }

  wake(ms = 1500) {
    const now0 = performance.now();
    this.until = Math.max(this.until || 0, now0 + ms);
    this.settle = Math.max(this.settle || 0, now0 + SETTLE_MS);
    if (this.running) return;
    this.running = true;
    let last = now0;
    let due = last;
    const loop = (now) => {
      if (document.hidden || !this.visible || now > this.settle) {
        this.running = false;
        return;
      }
      requestAnimationFrame(loop);
      if (now < due - 1) return;
      const step = now > this.until ? IDLE_MS : FRAME_MS;
      due = due + step < now ? now + step : due + step;
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      this.renderer.frame(dt);
    };
    requestAnimationFrame(loop);
  }

  async assetNodes(id) {
    let p = this.nodes.get(id);
    if (!p) {
      p = assetBytes(id).then((b) => {
        const head = String.fromCharCode(...b.subarray(0, 8));
        if (!head.startsWith('<roblox')) return [];
        return parsePlace(b);
      }).catch(() => []);
      this.nodes.set(id, p);
    }
    return p;
  }

  async set(look) {
    const seq = ++this.seq;
    const ids = [...new Set((look.assets || []).map((a) => a | 0).filter((a) => a > 0))];
    const lists = await Promise.all(ids.map((id) => this.assetNodes(id)));
    if (seq !== this.seq) return;
    const dm = this.dm;
    const { model } = buildCharacter(dm, 'Avatar', [0, 3, 0]);
    const bc = dm.create('BodyColors', model);
    bc.props.set('Name', 'Body Colors');
    for (const [part, prop] of Object.entries(COLOR_PROPS)) {
      const v = look.colors && look.colors[part];
      if (v > 0) bc.props.set(prop, v | 0);
    }
    let tool = null;
    for (const nodes of lists) {
      if (!nodes.length) continue;
      for (const m of dm.load(nodes, model)) tool = this.wear(model, m, tool);
    }
    partColorProps(model);
    if (tool) {
      gripWeld(dm, model, tool);
      const sh = model.findChild('Torso') && model.findChild('Torso').findChild('Right Shoulder');
      if (sh) sh.props.set('CurrentAngle', Math.PI / 2);
    }
    new Rig(model).pose(C.cf(0, 3, 0), (p, cf) => p.props.set('CFrame', cf));
    const old = this.model;
    this.model = model;
    dm.setParent(model, this.ws);
    if (old) dm.destroy(old);
    this.wake(4000);
  }

  wear(model, inst, tool) {
    const dm = this.dm;
    if (inst.isA('Accoutrement')) {
      attachAccessory(dm, model, inst);
    } else if (inst.ClassName === 'Decal' && /face/i.test(inst.props.get('Name'))) {
      const head = model.findChild('Head');
      const oldFace = head && head.findChild('face');
      if (oldFace) dm.destroy(oldFace);
      if (head) dm.setParent(inst, head);
      inst.props.set('Face', 5);
    } else if (inst.ClassName === 'SpecialMesh') {
      const head = model.findChild('Head');
      const oldMesh = head && head.findChildOfClass('SpecialMesh');
      if (oldMesh) dm.destroy(oldMesh);
      if (head) dm.setParent(inst, head);
    } else if (inst.isA('Tool')) {
      if (tool || !inst.findChild('Handle')) dm.destroy(inst);
      else return inst;
    } else if (inst.ClassName === 'HopperBin') {
      dm.destroy(inst);
    } else if (inst.ClassName === 'Model') {
      for (const c of [...inst.children]) {
        dm.setParent(c, model);
        tool = this.wear(model, c, tool);
      }
      dm.destroy(inst);
    }
    return tool;
  }
}

export async function mountAvatarView(canvas, cfg) {
  configure(cfg);
  await loadContentIndex();
  return new AvatarView(canvas, cfg);
}
