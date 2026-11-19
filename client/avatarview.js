import { configure, assetBytes, animationBytes, loadContentIndex, useContent2018, publicPath } from './assets.js';
import { Animations, animAssetId } from '../shared/animator.js';
import { DataModel } from '../shared/instance.js';
import { parsePlace } from '../shared/rbxl.js';
import { Renderer } from './render.js';
import * as C from '../shared/cframe.js';
import { buildCharacter, buildR15, attachAccessory, gripWeld, partColorProps, Rig } from '../shared/humanoid.js';

const COLOR_PROPS = { Head: 'HeadColor', Torso: 'TorsoColor', 'Left Arm': 'LeftArmColor', 'Right Arm': 'RightArmColor', 'Left Leg': 'LeftLegColor', 'Right Leg': 'RightLegColor' };
const FRAME_MS = 1000 / 30;
const IDLE_MS = 400;
const SETTLE_MS = 45000;
const DEFAULT_ANIMS = {
  R6: { idle: '180435571', walk: '180426354', run: '180426354', jump: '125750702', fall: '180436148', climb: '180436334', swim: '180426354' },
  R15: { idle: '507766388', walk: '507777826', run: '507767714', jump: '507765000', fall: '507767968', climb: '507765644', swim: '507784897' },
};

export class AvatarView {
  constructor(canvas, opts = {}) {
    this.canvas = canvas;
    this.dm = new DataModel('client');
    this.dm.era = 2018;
    for (const s of ['Workspace', 'Lighting']) this.dm.service(s);
    this.ws = this.dm.services.get('Workspace');
    const lighting = this.dm.services.get('Lighting');
    lighting.props.set('TimeOfDay', '10:00:00');
    lighting.props.set('GeographicLatitude', 0);
    this.nodes = new Map();
    this.model = null;
    this.seq = 0;
    this.yaw = Math.PI;
    this.pitch = 0.12;
    this.dist = 13;
    this.target = [0, 2.6, 0];
    const r = new Renderer(canvas, { dm: this.dm, era: 2018 });
    r.applySky = () => {};
    r.updateSunSprite = () => {};
    r.skyDome.visible = false;
    r.camera.fov = 32;
    r.camera.near = 0.5;
    r.camera.far = 200;
    r.r.setClearColor(opts.background || 0xdfe5eb, 1);
    r.attach();
    this.renderer = r;
    this.anims = new Animations(this.dm, async (id) => {
      const bytes = await animationBytes(id);
      if (!new TextDecoder().decode(bytes.subarray(0, 8)).startsWith('<roblox')) throw new Error('asset ' + id + ' is not a model');
      const model = this.dm.create('Model', null);
      model.props.set('Name', 'Model');
      this.dm.load(parsePlace(bytes), model);
      return model;
    });
    this.rig = null;
    this.rootCF = null;
    this.animName = DEFAULT_ANIMS.R6[opts.anim] ? opts.anim : 'idle';
    this.animIds = null;
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
      if (this.rig && this.hum && !this.hum.destroyed) {
        this.until = Math.max(this.until, now + FRAME_MS * 2);
        this.settle = Math.max(this.settle, now + SETTLE_MS);
      }
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
      this.animate(dt);
      this.renderer.frame(dt);
    };
    requestAnimationFrame(loop);
  }

  animate(dt) {
    if (!this.rig || !this.model || this.model.destroyed) return;
    this.loopPreview(dt);
    this.anims.step(dt);
    const poses = this.rig.pose(this.rootCF);
    for (const [p, cf] of poses) if (p && !p.destroyed) this.dm.setProp(p, 'CFrame', cf, { local: true });
  }

  async r15Template() {
    if (!this.r15Node) {
      this.r15Node = (async () => {
        await useContent2018();
        const r = await fetch(publicPath('/content2018/avatar/characterR15V2.rbxm'));
        if (!r.ok) throw new Error('R15 template missing');
        return parsePlace(new Uint8Array(await r.arrayBuffer()))[0] || null;
      })();
      this.r15Node.catch(() => (this.r15Node = null));
    }
    return this.r15Node;
  }

  animsFrom(lists, rig) {
    const out = { ...DEFAULT_ANIMS[rig] };
    if (rig !== 'R15') return out;
    for (const nodes of lists) {
      const folder = nodes.find((n) => n.cls === 'Folder' && (n.props.get('Name')?.v ?? n.props.get('Name')) === 'R15Anim');
      if (!folder) continue;
      for (const sv of folder.children) {
        const slot = String(sv.props.get('Name')?.v ?? sv.props.get('Name') ?? '').toLowerCase();
        if (!(slot in out)) continue;
        const an = sv.children.find((c) => c.cls === 'Animation');
        const raw = an && an.props.get('AnimationId');
        const id = animAssetId(String(raw && typeof raw === 'object' && 'v' in raw ? raw.v : raw || ''));
        if (id) out[slot] = String(id);
      }
    }
    return out;
  }

  previewTrack() {
    const an = this.hum && this.anims.byHum.get(this.hum);
    return an ? an.tracks.find((t) => t.key === 'preview') : null;
  }

  loopPreview(dt) {
    const tr = this.previewTrack();
    if (!tr || !tr.seq || tr.seq.loop || tr.target === 0) return;
    if (tr.t + dt * tr.speed >= tr.seq.length) tr.t = 0;
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
    const rigType = look.avatarType === 'R15' ? 'R15' : 'R6';
    let template = null;
    if (rigType === 'R15') template = await this.r15Template().catch(() => null);
    if (seq !== this.seq) return;
    const dm = this.dm;
    let model;
    if (template) {
      const pkg = new Map();
      for (const nodes of lists) {
        const f = nodes.find((n) => n.cls === 'Folder' && (n.props.get('Name')?.v ?? n.props.get('Name')) === 'R15ArtistIntent');
        if (f) for (const c of f.children) pkg.set(c.props.get('Name')?.v ?? c.props.get('Name'), c);
      }
      const holder = pkg.size ? dm.load([...pkg.values()], null) : [];
      model = buildR15(dm, template, 'Avatar', [0, 3, 0], look.scale || null, holder).model;
      for (const h of holder) if (!h.destroyed) dm.destroy(h, true);
    } else {
      model = buildCharacter(dm, 'Avatar', [0, 3, 0]).model;
    }
    const r15 = !!template;
    const bc = dm.create('BodyColors', model);
    bc.props.set('Name', 'Body Colors');
    for (const [part, prop] of Object.entries(COLOR_PROPS)) {
      const v = look.colors && look.colors[part];
      if (v > 0) dm.setProp(bc, prop, v | 0, { force: true });
    }
    let tool = null;
    for (const nodes of lists) {
      if (!nodes.length) continue;
      const keep = nodes.filter((n) => {
        const nm = n.props.get('Name')?.v ?? n.props.get('Name');
        if (n.cls === 'Folder' && /^R15/i.test(String(nm || ''))) return false;
        if (r15 && n.cls === 'CharacterMesh') return false;
        return true;
      });
      if (keep.length) for (const m of dm.load(keep, model)) tool = this.wear(model, m, tool);
    }
    partColorProps(model);
    if (tool) {
      gripWeld(dm, model, tool);
      const sh = model.findChild('Torso') && model.findChild('Torso').findChild('Right Shoulder');
      if (sh) sh.props.set('CurrentAngle', Math.PI / 2);
    }
    const root = model.findChild('HumanoidRootPart');
    this.rootCF = r15 && root ? root.props.get('CFrame').slice() : C.cf(0, 3, 0);
    const rig = new Rig(model);
    rig.pose(this.rootCF, (p, cf) => p.props.set('CFrame', cf));
    const old = this.model;
    this.model = model;
    this.rig = rig;
    this.hum = model.findChildOfClass('Humanoid');
    dm.setParent(model, this.ws);
    if (old) dm.destroy(old);
    this.animIds = this.animsFrom(lists, r15 ? 'R15' : 'R6');
    this.toolAnim = tool ? (r15 ? '507768375' : '182393478') : null;
    this.playPreview();
    this.wake(4000);
  }

  setAnimation(name) {
    this.animName = DEFAULT_ANIMS.R6[name] ? name : 'idle';
    this.playPreview();
    this.wake(SETTLE_MS);
  }

  playPreview() {
    if (!this.hum || !this.animIds) return;
    const id = this.animIds[this.animName] || this.animIds.idle;
    const speed = this.animName === 'run' && id === this.animIds.walk ? 1.6 : 1;
    this.anims.op(this.hum, 'preview', 'play', id, 0.15, 1, speed);
    if (this.toolAnim) this.anims.op(this.hum, 'tool', 'play', this.toolAnim, 0.15, 1, 1);
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
  await useContent2018();
  return new AvatarView(canvas, cfg);
}
