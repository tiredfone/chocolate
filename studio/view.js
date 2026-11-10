import * as THREE from 'three';
import * as C from '../shared/cframe.js';
import { publicPath } from '../client/assets.js';
import { CursorLayer, CURSORS } from '../client/cursor.js';

const FACE_PROPS = ['RightSurface', 'TopSurface', 'BackSurface', 'LeftSurface', 'BottomSurface', 'FrontSurface'];
const AXES = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
const PHYSICAL = { KeyW: 'w', KeyA: 'a', KeyS: 's', KeyD: 'd', KeyQ: 'q', KeyE: 'e' };
const AXIS_COLORS = [0xff3a3a, 0x3aff3a, 0x3a6dff];

export function partsOf(inst) {
  if (inst.isA('BasePart')) return [inst];
  return inst.descendants().filter((d) => d.isA('BasePart'));
}

export function boundsOf(parts) {
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (const p of parts) {
    const cf = p.props.get('CFrame'), s = p.props.get('Size');
    for (let i = 0; i < 3; i++) {
      const e = Math.abs(cf[3 + i * 3]) * s[0] / 2 + Math.abs(cf[4 + i * 3]) * s[1] / 2 + Math.abs(cf[5 + i * 3]) * s[2] / 2;
      min[i] = Math.min(min[i], cf[i] - e);
      max[i] = Math.max(max[i], cf[i] + e);
    }
  }
  return { min, max, center: min.map((v, i) => (v + max[i]) / 2), size: min.map((v, i) => max[i] - v) };
}

function snap(v, g) {
  return g > 0 ? Math.round(v / g) * g : v;
}

function closestOnAxis(rayO, rayD, axO, axD) {
  const w0 = rayO.clone().sub(axO);
  const a = rayD.dot(rayD), b = rayD.dot(axD), c = axD.dot(axD), d = rayD.dot(w0), e = axD.dot(w0);
  const den = a * c - b * b;
  if (Math.abs(den) < 1e-6) return 0;
  return (a * e - b * d) / den;
}

export class StudioView {
  constructor(app, container, renderer, physics) {
    this.app = app;
    this.el = container;
    this.r = renderer;
    this.ph = physics;
    this.cam = renderer.camera;
    this.focus = new THREE.Vector3(0, 0, 0);
    this.yaw = Math.PI * 0.25;
    this.pitch = -0.45;
    this.dist = 60;
    this.keys = new Set();
    this.pointers = new Map();
    this.cursor = new CursorLayer(container);
    this.outlines = new THREE.Group();
    this.outlines.renderOrder = 998;
    renderer.scene.add(this.outlines);
    this.handles = new THREE.Group();
    renderer.scene.add(this.handles);
    this.outlineMat = new THREE.LineBasicMaterial({ color: 0x1a6dff, depthTest: false, transparent: true });
    this.hoverMat = new THREE.LineBasicMaterial({ color: 0xffd23a, depthTest: false, transparent: true, opacity: 0.8 });
    this.hoverBox = null;
    this.stick = [0, 0];
    this.lift = 0;
    this.bind();
    this.touchControls();
  }

  touchControls() {
    const sheet = publicPath('/client/ui/TouchControlsSheet.png');
    const wrap = document.createElement('div');
    wrap.className = 'st-touch';
    const outer = document.createElement('div');
    outer.className = 'st-stick';
    const inner = document.createElement('div');
    inner.className = 'st-stick-knob';
    outer.appendChild(inner);
    const art = new Image();
    art.onload = () => {
      outer.style.backgroundImage = inner.style.backgroundImage = `url("${sheet}")`;
      outer.classList.add('art');
    };
    art.src = sheet;
    const btns = document.createElement('div');
    btns.className = 'st-lift';
    const mk = (dir, idx) => {
      const b = document.createElement('div');
      b.className = 'st-lift-btn';
      const i = document.createElement('i');
      i.style.backgroundImage = `url("${publicPath('/studio/ui/toolbar-standard.png')}")`;
      i.style.backgroundPosition = `${-idx * 15}px 0`;
      b.appendChild(i);
      const on = (e) => {
        e.preventDefault();
        e.stopPropagation();
        try {
          b.setPointerCapture(e.pointerId);
        } catch {}
        this.lift = dir;
        b.classList.add('down');
      };
      const off = (e) => {
        e.stopPropagation();
        if (this.lift === dir) this.lift = 0;
        b.classList.remove('down');
      };
      b.addEventListener('pointerdown', on);
      b.addEventListener('pointerup', off);
      b.addEventListener('pointercancel', off);
      b.addEventListener('lostpointercapture', off);
      return b;
    };
    btns.appendChild(mk(1, 12));
    btns.appendChild(mk(-1, 13));
    let id = null;
    const set = (e) => {
      const r = outer.getBoundingClientRect();
      const cx = r.left + r.width / 2, cy = r.top + r.height / 2, max = r.width / 2;
      let dx = e.clientX - cx, dy = e.clientY - cy;
      const l = Math.hypot(dx, dy);
      if (l > max) {
        dx *= max / l;
        dy *= max / l;
      }
      inner.style.transform = `translate(${dx}px, ${dy}px)`;
      const k = Math.min(1, l / max);
      this.stick = l > 4 ? [(dx / max) * (k > 0.15 ? 1 : 0), (dy / max) * (k > 0.15 ? 1 : 0)] : [0, 0];
    };
    const end = (e) => {
      if (e.pointerId !== id) return;
      id = null;
      this.stick = [0, 0];
      inner.style.transform = '';
    };
    outer.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (id !== null) return;
      id = e.pointerId;
      try {
        outer.setPointerCapture(e.pointerId);
      } catch {}
      set(e);
    });
    outer.addEventListener('pointermove', (e) => {
      if (e.pointerId === id) {
        e.stopPropagation();
        set(e);
      }
    });
    outer.addEventListener('pointerup', end);
    outer.addEventListener('pointercancel', end);
    outer.addEventListener('lostpointercapture', end);
    wrap.appendChild(outer);
    wrap.appendChild(btns);
    this.el.appendChild(wrap);
  }

  frameAll() {
    const ws = this.app.dm.services.get('Workspace');
    const parts = ws.descendants().filter((d) => d.isA('BasePart') && d.ClassName !== 'Terrain');
    if (!parts.length) return;
    const b = boundsOf(parts.length > 4000 ? parts.slice(0, 4000) : parts);
    const spawn = parts.find((p) => p.ClassName === 'SpawnLocation');
    if (spawn) {
      const cf = spawn.props.get('CFrame');
      this.focus.set(cf[0], cf[1], cf[2]);
      this.dist = 60;
    } else {
      this.focus.set(...b.center);
      this.dist = Math.min(400, Math.max(30, Math.hypot(...b.size) * 0.6));
    }
  }

  lookAt(parts) {
    if (!parts.length) return;
    const b = boundsOf(parts);
    this.focus.set(...b.center);
    this.dist = Math.max(8, Math.hypot(...b.size) * 1.4);
  }

  updateCamera(dt) {
    const k = this.keys;
    const speed = (k.has('shift') ? 80 : 30) * dt;
    const fwd = new THREE.Vector3(-Math.sin(this.yaw) * Math.cos(this.pitch), Math.sin(this.pitch), -Math.cos(this.yaw) * Math.cos(this.pitch));
    const right = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    const mv = new THREE.Vector3();
    if (k.has('w')) mv.add(fwd);
    if (k.has('s')) mv.sub(fwd);
    if (k.has('d')) mv.add(right);
    if (k.has('a')) mv.sub(right);
    if (k.has('e')) mv.y += 1;
    if (k.has('q')) mv.y -= 1;
    if (mv.lengthSq()) this.focus.addScaledVector(mv.normalize(), speed);
    const st = this.stick;
    if (st[0] || st[1] || this.lift) {
      const fast = Math.max(20, Math.min(120, this.dist * 0.9)) * dt;
      this.focus.addScaledVector(fwd, -st[1] * fast).addScaledVector(right, st[0] * fast);
      this.focus.y += this.lift * fast * 0.8;
    }
    if (k.has('arrowleft')) this.yaw += dt * 1.6;
    if (k.has('arrowright')) this.yaw -= dt * 1.6;
    if (k.has('arrowup')) this.pitch = Math.min(1.5, this.pitch + dt * 1.2);
    if (k.has('arrowdown')) this.pitch = Math.max(-1.5, this.pitch - dt * 1.2);
    const c = this.cam;
    c.position.set(
      this.focus.x + Math.sin(this.yaw) * Math.cos(this.pitch) * this.dist,
      this.focus.y - Math.sin(this.pitch) * this.dist,
      this.focus.z + Math.cos(this.yaw) * Math.cos(this.pitch) * this.dist,
    );
    c.lookAt(this.focus);
    c.updateMatrixWorld();
  }

  look(dx, dy) {
    const cp = Math.cos(this.pitch);
    const px = this.focus.x + Math.sin(this.yaw) * cp * this.dist;
    const py = this.focus.y - Math.sin(this.pitch) * this.dist;
    const pz = this.focus.z + Math.cos(this.yaw) * cp * this.dist;
    this.yaw -= dx * 0.006;
    this.pitch = Math.max(-1.55, Math.min(1.55, this.pitch - dy * 0.006));
    const np = Math.cos(this.pitch);
    this.focus.set(px - Math.sin(this.yaw) * np * this.dist, py + Math.sin(this.pitch) * this.dist, pz - Math.cos(this.yaw) * np * this.dist);
  }

  dolly(e, inward) {
    const ray = this.ray(e);
    const hit = this.pick(e, { locked: true });
    const far = hit.part ? Math.hypot(hit.point[0] - ray.origin.x, hit.point[1] - ray.origin.y, hit.point[2] - ray.origin.z) : this.dist;
    const step = Math.max(0.5, Math.min(200, far * 0.2)) * (inward ? 1 : -1);
    this.focus.addScaledVector(ray.direction, step);
  }

  orbit(dx, dy) {
    this.yaw -= dx * 0.008;
    this.pitch = Math.max(-1.55, Math.min(1.55, this.pitch - dy * 0.008));
  }

  pan(dx, dy) {
    const right = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    const up = new THREE.Vector3().crossVectors(right, new THREE.Vector3(-Math.sin(this.yaw) * Math.cos(this.pitch), Math.sin(this.pitch), -Math.cos(this.yaw) * Math.cos(this.pitch))).normalize();
    const k = this.dist * 0.0018;
    this.focus.addScaledVector(right, -dx * k).addScaledVector(up, -dy * k);
  }

  zoom(f) {
    this.dist = Math.max(2, Math.min(3000, this.dist * f));
  }

  ndc(e) {
    const r = this.el.getBoundingClientRect();
    return [((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1];
  }

  ray(e) {
    const [x, y] = this.ndc(e);
    const rc = new THREE.Raycaster();
    rc.setFromCamera(new THREE.Vector2(x, y), this.cam);
    return rc.ray;
  }

  pick(e, opts = {}) {
    const ray = this.ray(e);
    const o = ray.origin, d = ray.direction;
    const hit = this.ph.raycast([o.x, o.y, o.z], [d.x * 3000, d.y * 3000, d.z * 3000], opts.ignore || [], (p) => p.ClassName !== 'Terrain' && (opts.locked || !p.props.get('Locked')) && !this.app.hiddenPart(p));
    return hit;
  }

  selectable(part, deep) {
    if (deep) return part;
    const ws = this.app.dm.services.get('Workspace');
    let top = part;
    for (let p = part.parent; p && p !== ws && p !== this.app.dm.root; p = p.parent) if (p.ClassName === 'Model' || p.ClassName === 'Tool') top = p;
    return top;
  }

  faceOf(part, normal) {
    const cf = part.props.get('CFrame');
    const local = [cf[3] * normal[0] + cf[6] * normal[1] + cf[9] * normal[2], cf[4] * normal[0] + cf[7] * normal[1] + cf[10] * normal[2], cf[5] * normal[0] + cf[8] * normal[1] + cf[11] * normal[2]];
    let best = 0, bv = -Infinity;
    for (let i = 0; i < 3; i++) {
      if (local[i] > bv) { bv = local[i]; best = i; }
      if (-local[i] > bv) { bv = -local[i]; best = i + 3; }
    }
    return FACE_PROPS[best];
  }

  bind() {
    const el = this.el;
    el.tabIndex = 0;
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    el.addEventListener('wheel', (e) => {
      e.preventDefault();
      if (e.ctrlKey) this.zoom(e.deltaY > 0 ? 1.12 : 1 / 1.12);
      else this.dolly(e, e.deltaY < 0);
    }, { passive: false });
    el.addEventListener('pointerdown', (e) => this.down(e));
    el.addEventListener('pointermove', (e) => this.move(e));
    el.addEventListener('pointerup', (e) => this.up(e));
    el.addEventListener('pointercancel', (e) => this.up(e, true));
    el.addEventListener('pointerleave', () => this.setHover(null));
    window.addEventListener('keydown', (e) => {
      if (e.target.closest && e.target.closest('input, textarea, select')) return;
      const k = PHYSICAL[e.code] || e.key.toLowerCase();
      if (!e.ctrlKey && !e.metaKey && !e.altKey && ['w', 'a', 's', 'd', 'q', 'e', 'shift', 'arrowleft', 'arrowright', 'arrowup', 'arrowdown'].includes(k)) {
        if (document.activeElement === el || !document.activeElement || document.activeElement === document.body) this.keys.add(k);
      }
    });
    window.addEventListener('keyup', (e) => {
      this.keys.delete(PHYSICAL[e.code] || e.key.toLowerCase());
      this.keys.delete(e.key.toLowerCase());
    });
    window.addEventListener('blur', () => this.keys.clear());
  }

  down(e) {
    this.el.focus({ preventScroll: true });
    try {
      this.el.setPointerCapture(e.pointerId);
    } catch {}
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, button: e.button, type: e.pointerType, t: performance.now() });
    if (this.pointers.size === 2) {
      if (this.drag && this.drag.cancel) this.drag.cancel();
      this.drag = { kind: 'gesture' };
      return;
    }
    if (this.pointers.size > 2) return;
    if (e.button === 2) {
      this.drag = { kind: e.pointerType === 'mouse' ? 'look' : 'orbit' };
      return;
    }
    if (e.button === 1) {
      this.drag = { kind: 'pan' };
      return;
    }
    const h = this.pickHandle(e);
    if (h) {
      this.drag = this.beginHandle(h, e);
      return;
    }
    this.drag = this.app.toolDown(e, this) || { kind: e.pointerType === 'touch' ? 'orbit-or-tap' : 'tap' };
  }

  move(e) {
    const p = this.pointers.get(e.pointerId);
    if (!p) {
      if (e.pointerType === 'mouse') this.hover(e);
      return;
    }
    const dx = e.clientX - p.x, dy = e.clientY - p.y;
    p.x = e.clientX;
    p.y = e.clientY;
    const d = this.drag;
    if (!d) return;
    if (d.kind === 'gesture' && this.pointers.size === 2) {
      const [a, b] = [...this.pointers.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y), mid = [(a.x + b.x) / 2, (a.y + b.y) / 2];
      if (d.dist) {
        this.zoom(d.dist / Math.max(1, dist));
        this.pan(mid[0] - d.mid[0], mid[1] - d.mid[1]);
      }
      d.dist = dist;
      d.mid = mid;
      return;
    }
    if (d.kind === 'orbit' || (d.kind === 'orbit-or-tap' && Math.hypot(e.clientX - p.sx, e.clientY - p.sy) > 8)) {
      d.kind = 'orbit';
      this.orbit(dx, dy);
      return;
    }
    if (d.kind === 'look') {
      this.look(dx, dy);
      return;
    }
    if (d.kind === 'pan') {
      this.pan(dx, dy);
      return;
    }
    if (d.move) d.move(e);
    else if (e.pointerType === 'mouse') this.hover(e);
  }

  up(e, cancelled) {
    const p = this.pointers.get(e.pointerId);
    this.pointers.delete(e.pointerId);
    const d = this.drag;
    if (!p || !d) return;
    if (d.kind === 'gesture') {
      if (!this.pointers.size) this.drag = null;
      return;
    }
    this.drag = null;
    const moved = Math.hypot(e.clientX - p.sx, e.clientY - p.sy) > 6;
    if (cancelled) {
      if (d.cancel) d.cancel();
      return;
    }
    if (d.end) d.end(e, moved);
    else if ((d.kind === 'tap' || d.kind === 'orbit-or-tap') && !moved) this.app.toolTap(e, this);
  }

  hover(e) {
    if (this.app.tool.startsWith('surface') || ['paint', 'dropper', 'material', 'lock', 'anchor'].includes(this.app.tool) || this.app.tool === 'drag') {
      const hit = this.pick(e, { locked: this.app.tool === 'lock' });
      this.setHover(hit.part ? (this.app.tool === 'drag' ? this.selectable(hit.part, e.altKey) : hit.part) : null);
    } else this.setHover(null);
  }

  updateCursor() {
    const t = this.app.tool;
    const h = this.hoverInst;
    const part = h && h.isA && h.isA('BasePart') ? h : null;
    const tex = (n) => `rbxasset://textures/${n}.png`;
    let c = h ? CURSORS.arrow : CURSORS.far;
    if (this.drag && (this.drag.kind === 'orbit' || this.drag.kind === 'look' || this.drag.kind === 'pan' || this.drag.kind === 'gesture')) c = CURSORS.far;
    else if (this.drag && this.drag.move) c = tex(t === 'resize' || t === 'size' ? 'ResizeCursor' : 'GrabCursor');
    else if (t === 'lock') c = tex(part && part.props.get('Locked') ? 'UnlockCursor' : 'LockCursor');
    else if (t === 'anchor') c = tex(part && part.props.get('Anchored') ? 'UnAnchorCursor' : 'AnchorCursor');
    else if (t === 'paint') c = tex('FillCursor');
    else if (t === 'dropper') c = tex('DropperCursor');
    else if (t === 'material') c = tex('MaterialCursor');
    else if (t === 'resize' || t === 'size') c = h ? tex('ResizeCursor') : CURSORS.far;
    else if (t.startsWith('surface')) c = tex({ 0: 'FlatCursor', 2: 'WeldCursor', 6: 'HingeCursor', 7: 'MotorCursor' }[+t.slice(7)] || 'ArrowCursor');
    this.cursor.set(c);
  }

  setHover(inst) {
    if (this.hoverInst === inst) return;
    this.hoverInst = inst;
    if (this.hoverBox) {
      this.r.scene.remove(this.hoverBox);
      this.hoverBox.geometry.dispose();
      this.hoverBox = null;
    }
    if (!inst || this.app.selection.has(inst)) return;
    const parts = partsOf(inst);
    if (!parts.length || parts.length > 400) return;
    this.hoverBox = this.boxLines(parts, this.hoverMat);
    this.r.scene.add(this.hoverBox);
  }

  boxLines(parts, mat) {
    const pos = [];
    const corners = [[-1, -1, -1], [1, -1, -1], [1, 1, -1], [-1, 1, -1], [-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]];
    const edges = [[0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4], [0, 4], [1, 5], [2, 6], [3, 7]];
    for (const p of parts) {
      const cf = p.props.get('CFrame'), s = p.props.get('Size');
      const w = corners.map(([x, y, z]) => C.point(cf, x * (s[0] / 2 + 0.05), y * (s[1] / 2 + 0.05), z * (s[2] / 2 + 0.05)));
      for (const [a, b] of edges) pos.push(...w[a], ...w[b]);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    const l = new THREE.LineSegments(g, mat);
    l.renderOrder = 998;
    l.frustumCulled = false;
    return l;
  }

  refreshSelection() {
    for (const c of [...this.outlines.children]) {
      this.outlines.remove(c);
      c.geometry.dispose();
    }
    const parts = [];
    for (const s of this.app.selection) if (s.parent) parts.push(...partsOf(s));
    if (parts.length) this.outlines.add(this.boxLines(parts.length > 3000 ? parts.slice(0, 3000) : parts, this.outlineMat));
    this.selParts = parts;
    this.buildHandles();
    this.setHover(null);
  }

  buildHandles() {
    for (const c of [...this.handles.children]) {
      this.handles.remove(c);
      c.traverse((o) => o.geometry && o.geometry.dispose());
    }
    this.handleList = [];
    const tool = this.app.tool;
    const parts = this.selParts || [];
    if (!parts.length) return;
    const b = boundsOf(parts);
    this.handleBounds = b;
    const mk = (geo, color) => new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color, depthTest: false, transparent: true, opacity: 0.95 }));
    if (tool === 'axis' || tool === 'move') {
      for (let a = 0; a < 3; a++) for (const sgn of [1, -1]) {
        const m = mk(new THREE.ConeGeometry(0.35, 1, 14), AXIS_COLORS[a]);
        const stem = mk(new THREE.CylinderGeometry(0.07, 0.07, 1, 6), AXIS_COLORS[a]);
        stem.position.y = -0.7;
        m.add(stem);
        m.userData = { kind: 'move', axis: a, sign: sgn };
        this.handleList.push(m);
        this.handles.add(m);
      }
    } else if ((tool === 'resize' || tool === 'size') && parts.length === 1 && this.app.selection.size === 1) {
      for (let a = 0; a < 3; a++) for (const sgn of [1, -1]) {
        const m = mk(new THREE.SphereGeometry(0.4, 14, 10), tool === 'resize' ? 0x2a6bff : 0x18c7ff);
        m.userData = { kind: 'resize', axis: a, sign: sgn, part: parts[0] };
        this.handleList.push(m);
        this.handles.add(m);
      }
    } else if (tool === 'rotate') {
      for (let a = 0; a < 3; a++) {
        const m = mk(new THREE.TorusGeometry(1, 0.06, 6, 48), AXIS_COLORS[a]);
        m.userData = { kind: 'rotate', axis: a };
        this.handleList.push(m);
        this.handles.add(m);
      }
    }
    this.placeHandles();
  }

  placeHandles() {
    if (!this.handleList || !this.handleList.length) return;
    const parts = this.selParts;
    const b = boundsOf(parts);
    const c = new THREE.Vector3(...b.center);
    const scale = Math.max(0.6, c.distanceTo(this.cam.position) * 0.035);
    for (const h of this.handleList) {
      const u = h.userData;
      h.scale.setScalar(scale);
      if (u.kind === 'move') {
        const dir = new THREE.Vector3(...AXES[u.axis]).multiplyScalar(u.sign);
        h.position.copy(c).addScaledVector(dir, b.size[u.axis] / 2 + scale * 1.4);
        h.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
      } else if (u.kind === 'resize') {
        const cf = u.part.props.get('CFrame'), s = u.part.props.get('Size');
        const ax = [cf[3 + u.axis], cf[6 + u.axis], cf[9 + u.axis]];
        const off = s[u.axis] / 2 + scale * 0.9;
        h.position.set(cf[0] + ax[0] * off * u.sign, cf[1] + ax[1] * off * u.sign, cf[2] + ax[2] * off * u.sign);
      } else if (u.kind === 'rotate') {
        const r = Math.max(...b.size) * 0.5 / scale + 1.5;
        h.scale.set(scale * r, scale * r, scale);
        h.position.copy(c);
        if (u.axis === 0) h.rotation.set(0, Math.PI / 2, 0);
        else if (u.axis === 1) h.rotation.set(Math.PI / 2, 0, 0);
        else h.rotation.set(0, 0, 0);
      }
      h.renderOrder = 999;
      h.traverse((o) => (o.renderOrder = 999));
    }
  }

  pickHandle(e) {
    if (!this.handleList || !this.handleList.length) return null;
    const rc = new THREE.Raycaster();
    const [x, y] = this.ndc(e);
    rc.setFromCamera(new THREE.Vector2(x, y), this.cam);
    rc.params.Line.threshold = 0.3;
    const touch = e.pointerType === 'touch';
    let best = null;
    for (const h of this.handleList) {
      const hits = rc.intersectObject(h, true);
      if (hits.length && (!best || hits[0].distance < best.d)) best = { h, d: hits[0].distance };
    }
    if (best) return best.h;
    if (touch) {
      const r = this.el.getBoundingClientRect();
      let near = null;
      for (const h of this.handleList) {
        const p = h.position.clone().project(this.cam);
        const sx = (p.x + 1) / 2 * r.width + r.left, sy = (1 - p.y) / 2 * r.height + r.top;
        const d = Math.hypot(sx - e.clientX, sy - e.clientY);
        if (d < 34 && (!near || d < near.d)) near = { h, d };
      }
      if (near) return near.h;
    }
    return null;
  }

  beginHandle(h, e) {
    const u = h.userData;
    const app = this.app;
    const targets = [...app.selection];
    const start = app.snapshot(targets);
    const b = boundsOf(this.selParts);
    const center = new THREE.Vector3(...b.center);
    const grid = app.grid;
    if (u.kind === 'move') {
      const axis = new THREE.Vector3(...AXES[u.axis]);
      const ray0 = this.ray(e);
      const t0 = closestOnAxis(ray0.origin, ray0.direction, center, axis);
      let applied = 0;
      return {
        kind: 'handle',
        move: (ev) => {
          const r = this.ray(ev);
          const t = snap(closestOnAxis(r.origin, r.direction, center, axis) - t0, grid || 0);
          if (t === applied) return;
          applied = t;
          const off = [0, 0, 0];
          off[u.axis] = t;
          app.restore(start);
          app.translate(targets, off, false);
          this.placeHandles();
        },
        end: () => app.commitTransform(start, targets, 'Move'),
        cancel: () => app.restore(start),
      };
    }
    if (u.kind === 'resize') {
      const part = u.part;
      const cf0 = part.props.get('CFrame').slice(), s0 = part.props.get('Size').slice();
      const axis = new THREE.Vector3(cf0[3 + u.axis], cf0[6 + u.axis], cf0[9 + u.axis]).multiplyScalar(u.sign);
      const origin = new THREE.Vector3(cf0[0], cf0[1], cf0[2]);
      const ray0 = this.ray(e);
      const t0 = closestOnAxis(ray0.origin, ray0.direction, origin, axis);
      const g = grid || 0.01;
      const minSize = part.ClassName === 'TrussPart' ? 2 : g >= 1 ? 1 : 0.2;
      return {
        kind: 'handle',
        move: (ev) => {
          const r = this.ray(ev);
          let d = snap(closestOnAxis(r.origin, r.direction, origin, axis) - t0, grid || 0);
          const ns = Math.max(minSize, s0[u.axis] + d);
          d = ns - s0[u.axis];
          const size = s0.slice();
          size[u.axis] = ns;
          const cf = C.withPos(cf0, cf0[0] + axis.x * d / 2, cf0[1] + axis.y * d / 2, cf0[2] + axis.z * d / 2);
          part.dm.setProp(part, 'Size', size);
          part.dm.setProp(part, 'CFrame', cf);
          this.placeHandles();
          app.refreshSelectionSoon();
        },
        end: () => app.commitResize(part, cf0, s0),
        cancel: () => {
          part.dm.setProp(part, 'Size', s0);
          part.dm.setProp(part, 'CFrame', cf0);
        },
      };
    }
    if (u.kind === 'rotate') {
      const axis = new THREE.Vector3(...AXES[u.axis]);
      const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(axis, center);
      const hitAt = (ev) => this.ray(ev).intersectPlane(plane, new THREE.Vector3());
      const p0 = hitAt(e);
      if (!p0) return null;
      const v0 = p0.clone().sub(center).normalize();
      const step = grid >= 1 ? Math.PI / 4 : grid > 0 ? Math.PI / 12 : 0;
      let applied = 0;
      return {
        kind: 'handle',
        move: (ev) => {
          const p = hitAt(ev);
          if (!p) return;
          const v = p.sub(center).normalize();
          let ang = Math.atan2(new THREE.Vector3().crossVectors(v0, v).dot(axis), v0.dot(v));
          if (step) ang = Math.round(ang / step) * step;
          if (ang === applied) return;
          applied = ang;
          app.restore(start);
          app.rotateAround(targets, [center.x, center.y, center.z], AXES[u.axis], ang);
        },
        end: () => app.commitTransform(start, targets, 'Rotate'),
        cancel: () => app.restore(start),
      };
    }
    return null;
  }

  dragTool(e, hit) {
    const app = this.app;
    const targets = [...app.selection];
    const start = app.snapshot(targets);
    const parts = targets.flatMap(partsOf);
    if (!parts.length) return null;
    const b0 = boundsOf(parts);
    const grab = hit.point.slice();
    const offset = [b0.center[0] - grab[0], b0.center[2] - grab[2]];
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -grab[1]);
    let moved = false;
    return {
      kind: 'drag',
      move: (ev) => {
        const h = this.pick(ev, { ignore: targets, locked: true });
        let x, z, bottom;
        if (h.part) {
          x = h.point[0] + offset[0];
          z = h.point[2] + offset[1];
          bottom = h.normal[1] > 0.5 ? h.point[1] : b0.min[1];
        } else {
          const p = this.ray(ev).intersectPlane(plane, new THREE.Vector3());
          if (!p) return;
          x = p.x + offset[0];
          z = p.z + offset[1];
          bottom = b0.min[1];
        }
        const g = app.grid;
        const dx = snap(x - b0.center[0], g), dz = snap(z - b0.center[2], g);
        const dy = bottom - b0.min[1];
        if (!moved && Math.abs(dx) + Math.abs(dz) + Math.abs(dy) < 1e-6) return;
        moved = true;
        app.restore(start);
        app.translate(targets, [dx, dy, dz], false);
        this.placeHandles();
        app.refreshSelectionSoon();
      },
      end: () => {
        if (moved) app.commitTransform(start, targets, 'Drag');
      },
      cancel: () => app.restore(start),
    };
  }

  frame(dt) {
    this.updateCamera(dt);
    this.placeHandles();
    this.updateCursor();
  }
}
