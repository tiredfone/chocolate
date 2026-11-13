import * as C from './cframe.js';
import { parseGroups, rapierGroups, groupsCollide } from './collisiongroups.js';

export const GRAVITY = 196.2;
const STEP = 1 / 60;
const CHARACTER_PUSH_MASS = 150;
const JOINABLE = new Set([1, 2, 3, 4, 5, 6, 7, 8]);
const RIGID_JOINTS = new Set(['Weld', 'ManualWeld', 'ManualGlue', 'Snap', 'Glue', 'Motor', 'Motor6D', 'VelocityMotor']);
const HINGE_JOINTS = new Set(['Rotate', 'RotateP', 'RotateV']);

function quatOf(cf) {
  const q = C.toQuat(cf);
  return { x: q[0], y: q[1], z: q[2], w: q[3] };
}

function cfOf(t, r) {
  return C.fromQuat(t.x, t.y, t.z, r.x, r.y, r.z, r.w);
}

function wedgeHull(hx, hy, hz) {
  return new Float32Array([
    -hx, -hy, -hz, hx, -hy, -hz, -hx, -hy, hz, hx, -hy, hz,
    -hx, hy, hz, hx, hy, hz,
  ]);
}

function cornerHull(hx, hy, hz) {
  return new Float32Array([
    -hx, -hy, -hz, hx, -hy, -hz, -hx, -hy, hz, hx, -hy, hz,
    hx, hy, -hz,
  ]);
}

function surfaceOf(part, face) {
  return part.props.get(['RightSurface', 'TopSurface', 'BackSurface', 'LeftSurface', 'BottomSurface', 'FrontSurface'][face]) | 0;
}

const FACE_AXES = [[0, 1], [1, 1], [2, 1], [0, -1], [1, -1], [2, -1]];

function canJoin(a, b) {
  if (a === 9 || b === 9) return false;
  if (a === 2 || b === 2 || a === 1 || b === 1) return true;
  if ((a >= 6 && a <= 8) || (b >= 6 && b <= 8)) return true;
  if (a === 0 || b === 0) return false;
  const set = new Set([a, b]);
  if (set.has(3) && (set.has(4) || set.has(5))) return true;
  if (set.has(5) && (set.has(4) || set.has(5))) return true;
  if (set.has(6) || set.has(7) || set.has(8)) return true;
  return false;
}

export class Physics {
  constructor(dm, RAPIER, opts = {}) {
    this.dm = dm;
    this.R = RAPIER;
    this.simulate = opts.simulate !== false;
    this.world = new RAPIER.World({ x: 0, y: -GRAVITY, z: 0 });
    this.world.timestep = STEP;
    this.events = new RAPIER.EventQueue(true);
    this.parts = new Map();
    this.byHandle = new Map();
    this.assemblies = new Set();
    this.dirty = new Set();
    this.autoJoints = new Map();
    this.hinges = new Map();
    this.hingesOf = new Map();
    this.hingeSeq = 0;
    this.hingesDirty = false;
    this.fixedBody = null;
    this.vehicleSeats = new Set();
    this.joints = new Set();
    this.movers = new Set();
    this.touching = new Map();
    this.excluded = opts.excluded || (() => false);
    this.onTouch = opts.onTouch || null;
    this.onFallen = opts.onFallen || null;
    this.writing = false;
    this.acc = 0;
    this.ws = null;
    this.pendingJoin = new Set();
    this.loaded = false;
    dm.observe(this);
  }

  attachWorkspace(ws) {
    this.ws = ws;
    for (const d of ws.descendants()) this.enter(d);
    if (this.simulate) this.autoJoinAll();
    this.loaded = true;
    this.flush();
  }

  autoJoinEnabled() {
    return this.simulate && this.loaded && !(this.ws.extra && this.ws.extra.get('ExplicitAutoJoints')?.v === true);
  }

  inWorld(inst) {
    return !!this.ws && (inst === this.ws || inst.isDescendantOf(this.ws));
  }

  reparented(inst) {
    if (!this.ws) return;
    const inside = this.inWorld(inst);
    const list = [inst, ...inst.descendants()];
    for (const x of list) {
      if (inside) {
        const had = this.parts.has(x);
        this.enter(x);
        if (!had && this.parts.has(x) && !x.props.get('Anchored') && this.autoJoinEnabled()) this.pendingJoin.add(x);
      } else this.leave(x);
    }
    if (inst.isA('JointInstance') || inst.isA('BodyMover')) this.enter(inst);
  }

  destroyed(inst) {
    this.leave(inst);
  }

  groupTable() {
    return parseGroups(this.ws ? this.ws.props.get('CollisionGroups') : '');
  }

  groupsCollide(a, b) {
    return groupsCollide(this.groupTable(), a, b);
  }

  refreshGroups() {
    const t = this.groupTable();
    for (const rec of this.parts.values()) if (rec.collider) rec.collider.setCollisionGroups(rapierGroups(t, rec.part.props.get('CollisionGroupId') | 0));
  }

  changed(inst, name, old, opts) {
    if (opts && opts.physics) return;
    if (name === 'CollisionGroups' && inst === this.ws) {
      this.refreshGroups();
      return;
    }
    if (name === 'CollisionGroupId' && inst.isA('BasePart')) {
      const rec = this.parts.get(inst);
      if (rec && rec.collider) rec.collider.setCollisionGroups(rapierGroups(this.groupTable(), inst.props.get('CollisionGroupId') | 0));
      return;
    }
    if (inst.isA('BasePart')) {
      const rec = this.parts.get(inst);
      if (!rec) return;
      if (name === 'CFrame') this.moved(inst, rec, opts);
      else if (name === 'Size' || name === 'Shape' || name === 'CanCollide') this.rebuildPart(inst);
      else if (name === 'Anchored') {
        this.markDirty(inst);
      } else if (name === 'Velocity' && rec.asm && rec.asm.body && !rec.asm.anchored) {
        const v = inst.props.get('Velocity');
        rec.asm.body.setLinvel({ x: v[0], y: v[1], z: v[2] }, true);
      } else if (name === 'RotVelocity' && rec.asm && rec.asm.body && !rec.asm.anchored) {
        const v = inst.props.get('RotVelocity');
        rec.asm.body.setAngvel({ x: v[0], y: v[1], z: v[2] }, true);
      } else if (name === 'Friction' || name === 'Elasticity') {
        rec.collider.setFriction(inst.props.get('Friction'));
        rec.collider.setRestitution(inst.props.get('Elasticity') * 0.3);
      }
    } else if (inst.isA('JointInstance')) {
      if (name === 'Part0' || name === 'Part1' || name === 'C0' || name === 'C1') {
        this.leaveJoint(inst, old, name);
        if (this.inWorld(inst)) this.enterJoint(inst);
      }
    }
  }

  enter(inst) {
    if (inst.isA('BasePart')) {
      if (inst.ClassName === 'Terrain') return;
      if (!this.parts.has(inst) && !this.excluded(inst)) this.addPart(inst);
      if (inst.ClassName === 'VehicleSeat' && this.parts.has(inst)) this.vehicleSeats.add(inst);
    } else if (inst.isA('JointInstance')) {
      this.enterJoint(inst);
    } else if (inst.isA('BodyMover')) {
      if (inst.parent && inst.parent.isA('BasePart')) this.movers.add(inst);
    }
  }

  leave(inst) {
    if (inst.isA('BasePart')) {
      this.vehicleSeats.delete(inst);
      this.removePart(inst);
    }
    else if (inst.isA('JointInstance')) this.leaveJoint(inst);
    else if (inst.isA('BodyMover')) this.movers.delete(inst);
  }

  enterJoint(j) {
    if (HINGE_JOINTS.has(j.ClassName)) {
      const a = j.props.get('Part0'), b = j.props.get('Part1');
      if (!a || !b || a === b || !this.simulate) return;
      if (!this.inWorld(j) && !this.inWorld(a)) return;
      const c0 = j.props.get('C0');
      const at = C.mul(a.props.get('CFrame'), c0);
      this.addHinge(a, b, { joint: j, point: [at[0], at[1], at[2]], axis: [at[5], at[8], at[11]] });
      return;
    }
    if (!RIGID_JOINTS.has(j.ClassName)) return;
    const a = j.props.get('Part0'), b = j.props.get('Part1');
    if (!a || !b || a === b) return;
    if (!this.inWorld(j) && !this.inWorld(a)) return;
    this.joints.add(j);
    this.markDirty(a);
    this.markDirty(b);
  }

  leaveJoint(j, old, which) {
    for (const [key, h] of this.hinges) if (h.inst === j) this.dropHingeKey(key);
    if (!this.joints.has(j)) return;
    this.joints.delete(j);
    const a = which === 'Part0' ? old : j.props.get('Part0');
    const b = which === 'Part1' ? old : j.props.get('Part1');
    if (a) this.markDirty(a);
    if (b) this.markDirty(b);
  }

  shapeDesc(part) {
    const R = this.R;
    const s = part.props.get('Size');
    const hx = Math.max(0.05, s[0] / 2), hy = Math.max(0.05, s[1] / 2), hz = Math.max(0.05, s[2] / 2);
    const cls = part.ClassName;
    let d;
    let rot = null;
    if (cls === 'WedgePart') d = R.ColliderDesc.convexHull(wedgeHull(hx, hy, hz));
    else if (cls === 'CornerWedgePart') d = R.ColliderDesc.convexHull(cornerHull(hx, hy, hz));
    else if (part.info.all.has('Shape') && part.props.get('Shape') === 0) d = R.ColliderDesc.ball(Math.min(hx, hy, hz));
    else if (part.info.all.has('Shape') && part.props.get('Shape') === 2) {
      d = R.ColliderDesc.cylinder(hx, Math.min(hy, hz));
      rot = C.axisAngle(0, 0, 1, Math.PI / 2);
    } else d = R.ColliderDesc.cuboid(hx, hy, hz);
    if (!d) d = R.ColliderDesc.cuboid(hx, hy, hz);
    return { desc: d, rot, volume: s[0] * s[1] * s[2] };
  }

  makeCollider(rec, body = null, offset = null) {
    const part = rec.part;
    if (rec.collider) {
      this.byHandle.delete(rec.collider.handle);
      this.world.removeCollider(rec.collider, true);
      rec.collider = null;
    }
    const { desc, rot, volume } = this.shapeDesc(part);
    rec.rot = rot;
    rec.volume = volume;
    const raw = offset || part.props.get('CFrame');
    const base = Array.isArray(raw) && raw.length >= 12 && raw.every(Number.isFinite) ? raw : [0, -1e4, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1];
    const full = rot ? C.mul(base, rot) : base;
    desc.setTranslation(full[0], full[1], full[2]);
    desc.setRotation(quatOf(full));
    desc.setFriction(part.props.get('Friction'));
    desc.setRestitution(part.props.get('Elasticity') * 0.3);
    desc.setDensity(0.7);
    desc.setSensor(!part.props.get('CanCollide'));
    desc.setCollisionGroups(rapierGroups(this.groupTable(), part.props.get('CollisionGroupId') | 0));
    desc.setActiveCollisionTypes(this.R.ActiveCollisionTypes.DEFAULT | this.R.ActiveCollisionTypes.KINEMATIC_FIXED | this.R.ActiveCollisionTypes.KINEMATIC_KINEMATIC);
    if (rec.touch) desc.setActiveEvents(this.R.ActiveEvents.COLLISION_EVENTS);
    rec.collider = body ? this.world.createCollider(desc, body) : this.world.createCollider(desc);
    this.byHandle.set(rec.collider.handle, rec);
  }

  addPart(part) {
    const rec = { part, collider: null, rot: null, asm: null, local: null, volume: 1, touch: false };
    this.parts.set(part, rec);
    if (this.dm.hasListener(part, 'Touched') || this.dm.hasListener(part, 'TouchEnded')) rec.touch = true;
    this.makeCollider(rec);
    if (this.simulate) this.markDirty(part);
  }

  removePart(part) {
    const rec = this.parts.get(part);
    if (!rec) return;
    this.parts.delete(part);
    const asm = rec.asm;
    if (rec.collider) {
      this.byHandle.delete(rec.collider.handle);
      this.world.removeCollider(rec.collider, true);
      rec.collider = null;
    }
    this.dropAuto(part);
    this.dropHinges(part);
    const t = this.touching.get(part);
    if (t) {
      for (const o of t) {
        const ot = this.touching.get(o);
        if (ot) ot.delete(part);
      }
      this.touching.delete(part);
    }
    if (asm) {
      asm.parts.delete(part);
      for (const p of asm.parts) this.dirty.add(p);
      this.destroyAssembly(asm);
    }
    this.dirty.delete(part);
  }

  rebuildPart(part) {
    const rec = this.parts.get(part);
    if (!rec) return;
    if (rec.asm && rec.asm.body) {
      this.makeCollider(rec, rec.asm.body, rec.local);
    } else {
      this.makeCollider(rec);
    }
  }

  touchInterest(part) {
    const rec = this.parts.get(part);
    if (!rec || rec.touch) return;
    rec.touch = true;
    if (rec.collider) rec.collider.setActiveEvents(this.R.ActiveEvents.COLLISION_EVENTS);
  }

  markDirty(part) {
    if (!this.simulate) return;
    this.dirty.add(part);
  }

  addAuto(a, b) {
    if (!this.autoJoints.has(a)) this.autoJoints.set(a, new Set());
    if (!this.autoJoints.has(b)) this.autoJoints.set(b, new Set());
    this.autoJoints.get(a).add(b);
    this.autoJoints.get(b).add(a);
    this.markDirty(a);
    this.markDirty(b);
  }

  dropAuto(part) {
    const s = this.autoJoints.get(part);
    if (!s) return;
    for (const o of s) {
      const os = this.autoJoints.get(o);
      if (os) os.delete(part);
      this.markDirty(o);
    }
    this.autoJoints.delete(part);
  }

  addHinge(a, b, spec) {
    const key = ++this.hingeSeq;
    const h = { key, a, b, point: spec.point, axis: spec.axis, inst: spec.joint || null, joint: null, b1: null, b2: null, lpA: null, laA: null, radiusA: 1, radiusB: 1 };
    const cfA = a.props.get('CFrame'), cfB = b.props.get('CFrame');
    const ia = C.inv(cfA), ib = C.inv(cfB);
    h.lpA = C.point(ia, ...h.point);
    h.laA = C.vector(ia, ...h.axis);
    h.lpB = C.point(ib, ...h.point);
    h.laB = C.vector(ib, ...h.axis);
    const radiusOf = (part, la) => {
      const sz = part.props.get('Size');
      const ax = la.map(Math.abs);
      const k = ax.indexOf(Math.max(...ax));
      return Math.max(0.25, Math.max(...sz.filter((_, i) => i !== k)) / 2);
    };
    h.radiusA = radiusOf(a, h.laA);
    h.radiusB = radiusOf(b, h.laB);
    this.hinges.set(key, h);
    for (const p of [a, b]) {
      if (!this.hingesOf.has(p)) this.hingesOf.set(p, new Set());
      this.hingesOf.get(p).add(key);
    }
    this.hingesDirty = true;
    this.markDirty(a);
    this.markDirty(b);
  }

  dropHingeKey(key) {
    const h = this.hinges.get(key);
    if (!h) return;
    this.hinges.delete(key);
    for (const p of [h.a, h.b]) {
      const set = this.hingesOf.get(p);
      if (set) {
        set.delete(key);
        if (!set.size) this.hingesOf.delete(p);
      }
      this.markDirty(p);
    }
    this.removeHingeJoint(h);
  }

  dropHinges(part) {
    const set = this.hingesOf.get(part);
    if (!set) return;
    for (const key of [...set]) this.dropHingeKey(key);
  }

  removeHingeJoint(h) {
    if (h.joint && h.b1 && h.b2 && this.world.getRigidBody(h.b1.handle) === h.b1 && this.world.getRigidBody(h.b2.handle) === h.b2) {
      try {
        this.world.removeImpulseJoint(h.joint, true);
      } catch {}
    }
    h.joint = null;
    h.b1 = h.b2 = null;
  }

  hingeBody(asm) {
    if (asm.body) return asm.body;
    if (!this.fixedBody) this.fixedBody = this.world.createRigidBody(this.R.RigidBodyDesc.fixed());
    return this.fixedBody;
  }

  syncHinges() {
    this.hingesDirty = false;
    const R = this.R;
    const pairs = new Map();
    for (const h of this.hinges.values()) {
      const ra = this.parts.get(h.a), rb = this.parts.get(h.b);
      if (!ra || !rb || !ra.asm || !rb.asm || ra.asm === rb.asm || (!ra.asm.body && !rb.asm.body)) {
        this.removeHingeJoint(h);
        continue;
      }
      const b1 = this.hingeBody(ra.asm), b2 = this.hingeBody(rb.asm);
      const pk = b1.handle < b2.handle ? b1.handle + ':' + b2.handle : b2.handle + ':' + b1.handle;
      if (pairs.has(pk) && pairs.get(pk) !== h) {
        this.removeHingeJoint(h);
        continue;
      }
      pairs.set(pk, h);
      if (h.joint && h.b1 === b1 && h.b2 === b2 && this.world.getRigidBody(b1.handle) === b1 && this.world.getRigidBody(b2.handle) === b2) continue;
      this.removeHingeJoint(h);
      const local = (body, part, lp, la) => {
        const bcf = cfOf(body.translation(), body.rotation());
        const inv = C.inv(bcf);
        const pcf = part.props.get('CFrame');
        const wp = C.point(pcf, ...lp), wa = C.vector(pcf, ...la);
        return [C.point(inv, ...wp), C.vector(inv, ...wa)];
      };
      const [p1, a1] = local(b1, h.a, h.lpA, h.laA);
      const [p2, a2] = local(b2, h.a, h.lpA, h.laA);
      const v = (x) => ({ x: x[0], y: x[1], z: x[2] });
      const data = R.JointData.revoluteWithAxes(v(p1), v(p2), v(a1), v(a2));
      const joint = this.world.createImpulseJoint(data, b1, b2, true);
      joint.setContactsEnabled(false);
      h.joint = joint;
      h.b1 = b1;
      h.b2 = b2;
    }
  }

  driveVehicles() {
    for (const seat of this.vehicleSeats) {
      const rec = this.parts.get(seat);
      if (!rec || !rec.asm || !rec.asm.body || seat.props.get('Disabled')) continue;
      const th = seat.props.get('Throttle') | 0, st = seat.props.get('Steer') | 0;
      const on = !!seat.props.get('Occupant') && (th || st);
      const cf = seat.props.get('CFrame');
      const f = [-cf[5], -cf[8], -cf[11]], u = [cf[4], cf[7], cf[10]], rt = [cf[3], cf[6], cf[9]];
      const spin = [u[1] * f[2] - u[2] * f[1], u[2] * f[0] - u[0] * f[2], u[0] * f[1] - u[1] * f[0]];
      const maxSpeed = Math.max(0, seat.props.get('MaxSpeed') || 0);
      const torque = Math.max(0, seat.props.get('Torque') || 0);
      const turn = Math.max(0, seat.props.get('TurnSpeed') ?? 1);
      for (const h of this.hinges.values()) {
        if (!h.joint) continue;
        const asmA = this.parts.get(h.a)?.asm, asmB = this.parts.get(h.b)?.asm;
        let wheelPart, sign;
        if (asmA === rec.asm && asmB !== rec.asm) {
          wheelPart = h.b;
          sign = 1;
        } else if (asmB === rec.asm && asmA !== rec.asm) {
          wheelPart = h.a;
          sign = -1;
        } else continue;
        if (!on) {
          h.joint.configureMotorVelocity(0, 0);
          h.cmd = 0;
          continue;
        }
        const wcf = wheelPart.props.get('CFrame');
        const side = (wcf[0] - cf[0]) * rt[0] + (wcf[1] - cf[1]) * rt[1] + (wcf[2] - cf[2]) * rt[2];
        const s = maxSpeed * Math.max(-1, Math.min(1, th - st * turn * Math.sign(side || 0)));
        const pcf = h.a.props.get('CFrame');
        const axis = C.vector(pcf, ...h.laA);
        const wv = (spin[0] * axis[0] + spin[1] * axis[1] + spin[2] * axis[2]) * (s / (sign > 0 ? h.radiusB : h.radiusA)) * sign;
        const wb = this.parts.get(wheelPart)?.asm?.body;
        const m = wb ? wb.mass() : 1;
        const radius = Math.max(0.1, sign > 0 ? h.radiusB : h.radiusA);
        const step = ((Math.max(1, torque) * (st ? 3 : 1)) / radius) * STEP;
        const cur = Number.isFinite(h.cmd) ? h.cmd : 0;
        h.cmd = cur + Math.max(-step, Math.min(step, wv - cur));
        h.joint.configureMotorVelocity(h.cmd, Math.max(0.5, torque * m * 0.02));
        if (wb && wb.isSleeping()) wb.wakeUp();
        if (rec.asm.body.isSleeping()) rec.asm.body.wakeUp();
      }
    }
  }

  breakJoints(part) {
    this.dropAuto(part);
    this.dropHinges(part);
    for (const j of [...this.joints]) {
      if (j.props.get('Part0') === part || j.props.get('Part1') === part) {
        if (!j.destroyed) this.dm.destroy(j);
        this.joints.delete(j);
      }
    }
    this.markDirty(part);
  }

  aabbOf(part, pad = 0) {
    const cf = part.props.get('CFrame');
    const s = part.props.get('Size');
    const lo = [], hi = [];
    for (let k = 0; k < 3; k++) {
      const e = Math.abs(cf[3 + k * 3]) * s[0] / 2 + Math.abs(cf[4 + k * 3]) * s[1] / 2 + Math.abs(cf[5 + k * 3]) * s[2] / 2 + pad;
      lo.push(cf[k] - e);
      hi.push(cf[k] + e);
    }
    return [lo, hi];
  }

  buildGrid() {
    const CELL = 8;
    const grid = new Map();
    for (const [p] of this.parts) {
      const [lo, hi] = this.aabbOf(p, 0.1);
      if (hi[0] - lo[0] > 400 || hi[1] - lo[1] > 400 || hi[2] - lo[2] > 400) {
        if (!grid.has('big')) grid.set('big', []);
        grid.get('big').push([p, lo, hi]);
        continue;
      }
      for (let x = Math.floor(lo[0] / CELL); x <= Math.floor(hi[0] / CELL); x++)
        for (let y = Math.floor(lo[1] / CELL); y <= Math.floor(hi[1] / CELL); y++)
          for (let z = Math.floor(lo[2] / CELL); z <= Math.floor(hi[2] / CELL); z++) {
            const k = x + ',' + y + ',' + z;
            if (!grid.has(k)) grid.set(k, []);
            grid.get(k).push([p, lo, hi]);
          }
    }
    return { grid, CELL };
  }

  gridNeighbours(g, part) {
    const [lo, hi] = this.aabbOf(part, 0.1);
    const out = new Set();
    const test = (e) => {
      if (e[0] === part) return;
      if (e[1][0] > hi[0] || e[2][0] < lo[0] || e[1][1] > hi[1] || e[2][1] < lo[1] || e[1][2] > hi[2] || e[2][2] < lo[2]) return;
      out.add(e[0]);
    };
    for (const e of g.grid.get('big') || []) test(e);
    const C2 = g.CELL;
    for (let x = Math.floor(lo[0] / C2); x <= Math.floor(hi[0] / C2); x++)
      for (let y = Math.floor(lo[1] / C2); y <= Math.floor(hi[1] / C2); y++)
        for (let z = Math.floor(lo[2] / C2); z <= Math.floor(hi[2] / C2); z++) {
          const list = g.grid.get(x + ',' + y + ',' + z);
          if (list) for (const e of list) test(e);
        }
    return out;
  }

  makeJoints(parts) {
    if (!parts.length) return;
    const g = this.buildGrid();
    for (const p of parts) {
      for (const o of this.gridNeighbours(g, p)) {
        if (o === p) continue;
        const f = this.faceContact(p, o, true);
        if (!f) continue;
        const sp = surfaceOf(p, f[0]), so = surfaceOf(o, f[1]);
        if (!canJoin(sp, so)) continue;
        const hp = sp >= 6 && sp <= 8, ho = so >= 6 && so <= 8;
        if (hp || ho) {
          const [hinge, other, face] = hp ? [p, o, f[0]] : [o, p, f[1]];
          const known = this.hingesOf.get(hinge);
          if (known && [...known].some((k) => {
            const h = this.hinges.get(k);
            return h && !h.inst && ((h.a === hinge && h.b === other) || (h.a === other && h.b === hinge));
          })) continue;
          const cf = hinge.props.get('CFrame'), sz = hinge.props.get('Size');
          const [ax, sg] = FACE_AXES[face];
          const n = [cf[3 + ax] * sg, cf[6 + ax] * sg, cf[9 + ax] * sg];
          const pt = [cf[0] + n[0] * sz[ax] / 2, cf[1] + n[1] * sz[ax] / 2, cf[2] + n[2] * sz[ax] / 2];
          this.addHinge(hinge, other, { point: pt, axis: n });
        } else this.addAuto(p, o);
      }
    }
  }

  contactJointClass(a, b) {
    const f = this.faceContact(a, b, true);
    if (!f) return null;
    const sa = surfaceOf(a, f[0]), sb = surfaceOf(b, f[1]);
    if (!canJoin(sa, sb)) return null;
    if (sa === 2 || sb === 2) return 'Weld';
    if (sa === 1 || sb === 1) return 'Glue';
    return 'Snap';
  }

  autoJoinAll() {
    const loose = [];
    for (const [p] of this.parts) if (!p.props.get('Anchored')) loose.push(p);
    const explicit = new Set();
    for (const j of this.joints) {
      explicit.add(j.props.get('Part0'));
      explicit.add(j.props.get('Part1'));
    }
    this.makeJoints(loose.filter((p) => !explicit.has(p)));
  }

  neighbours(part) {
    const rec = this.parts.get(part);
    if (!rec) return [];
    const out = [];
    const cf = part.props.get('CFrame');
    const s = part.props.get('Size');
    const e = [0, 1, 2].map((k) => Math.abs(cf[3 + k * 3]) * s[0] / 2 + Math.abs(cf[4 + k * 3]) * s[1] / 2 + Math.abs(cf[5 + k * 3]) * s[2] / 2 + 0.1);
    const aabb = { x: cf[0], y: cf[1], z: cf[2] };
    this.world.collidersWithAabbIntersectingAabb(aabb, { x: e[0], y: e[1], z: e[2] }, (c) => {
      const r = this.byHandle.get(c.handle);
      if (r && r.part !== part) out.push(r.part);
      return true;
    });
    return out;
  }

  faceContact(a, b, deep = false) {
    const ca = a.props.get('CFrame'), cb = b.props.get('CFrame');
    const sa = a.props.get('Size'), sb = b.props.get('Size');
    for (let fa = 0; fa < 6; fa++) {
      const [axA, sgA] = FACE_AXES[fa];
      const na = [ca[3 + axA] * sgA, ca[6 + axA] * sgA, ca[9 + axA] * sgA];
      for (let fb = 0; fb < 6; fb++) {
        const [axB, sgB] = FACE_AXES[fb];
        const nb = [cb[3 + axB] * sgB, cb[6 + axB] * sgB, cb[9 + axB] * sgB];
        if (na[0] * nb[0] + na[1] * nb[1] + na[2] * nb[2] > -0.999) continue;
        const pa = sa[axA] / 2, pb = sb[axB] / 2;
        const ctrA = [ca[0] + na[0] * pa, ca[1] + na[1] * pa, ca[2] + na[2] * pa];
        const ctrB = [cb[0] + nb[0] * pb, cb[1] + nb[1] * pb, cb[2] + nb[2] * pb];
        const d = (ctrB[0] - ctrA[0]) * na[0] + (ctrB[1] - ctrA[1]) * na[1] + (ctrB[2] - ctrA[2]) * na[2];
        if (Math.abs(d) > 0.08) {
          if (!deep || d > 0 || -d > Math.min(sa[axA], sb[axB])) continue;
          const ha = surfaceOf(a, fa), hb = surfaceOf(b, fb);
          if (!(ha >= 6 && ha <= 8) && !(hb >= 6 && hb <= 8)) continue;
        }
        if (this.overlap2d(ca, sa, axA, cb, sb, axB, na)) return [fa, fb];
      }
    }
    return null;
  }

  overlap2d(ca, sa, axA, cb, sb, axB, n) {
    const axesA = [0, 1, 2].filter((k) => k !== axA);
    const tangents = axesA.map((k) => [ca[3 + k], ca[6 + k], ca[9 + k]]);
    const proj = (cf, s, t) => {
      let ext = 0;
      for (let k = 0; k < 3; k++) ext += Math.abs(cf[3 + k] * t[0] + cf[6 + k] * t[1] + cf[9 + k] * t[2]) * s[k] / 2;
      const c = cf[0] * t[0] + cf[1] * t[1] + cf[2] * t[2];
      return [c - ext, c + ext];
    };
    for (const t of tangents) {
      const [a0, a1] = proj(ca, sa.map((v, k) => (k === axA ? 0 : v)), t);
      const [b0, b1] = proj(cb, sb.map((v, k) => (k === axB ? 0 : v)), t);
      if (Math.min(a1, b1) - Math.max(a0, b0) < 0.01) return false;
    }
    return true;
  }

  flush() {
    if (this.pendingJoin.size) {
      const list = [...this.pendingJoin].filter((p) => this.parts.has(p));
      this.pendingJoin.clear();
      this.makeJoints(list);
    }
    if (!this.simulate) return;
    if (!this.dirty.size) {
      if (this.hingesDirty) this.syncHinges();
      return;
    }
    const seeds = [...this.dirty].filter((p) => this.parts.has(p));
    this.dirty.clear();
    const seen = new Set();
    for (const s of seeds) {
      if (seen.has(s)) continue;
      const group = this.connected(s);
      for (const p of group) seen.add(p);
      this.buildAssembly(group);
    }
    this.syncHinges();
  }

  connected(start) {
    const adj = (p) => {
      const out = [];
      const a = this.autoJoints.get(p);
      if (a) for (const o of a) out.push(o);
      return out;
    };
    if (!this.jointIndex || this.jointIndexStamp !== this.joints.size) {
      this.jointIndex = new Map();
      for (const j of this.joints) {
        const a = j.props.get('Part0'), b = j.props.get('Part1');
        if (!a || !b) continue;
        if (!this.jointIndex.has(a)) this.jointIndex.set(a, []);
        if (!this.jointIndex.has(b)) this.jointIndex.set(b, []);
        this.jointIndex.get(a).push(b);
        this.jointIndex.get(b).push(a);
      }
      this.jointIndexStamp = this.joints.size;
    }
    const out = new Set([start]);
    const stack = [start];
    while (stack.length) {
      const p = stack.pop();
      for (const o of [...adj(p), ...(this.jointIndex.get(p) || [])]) {
        if (!out.has(o) && this.parts.has(o)) {
          out.add(o);
          stack.push(o);
        }
      }
    }
    return out;
  }

  destroyAssembly(asm) {
    if (!this.assemblies.has(asm)) return;
    this.assemblies.delete(asm);
    for (const p of asm.parts) {
      const rec = this.parts.get(p);
      if (rec && rec.asm === asm) rec.asm = null;
    }
    if (asm.body) {
      const body = asm.body;
      asm.body = null;
      for (const p of asm.parts) {
        const rec = this.parts.get(p);
        if (rec && rec.collider && rec.collider.parent() === body) {
          this.byHandle.delete(rec.collider.handle);
          rec.collider = null;
        }
      }
      this.world.removeRigidBody(body);
      for (const p of asm.parts) {
        const rec = this.parts.get(p);
        if (rec && !rec.collider) this.makeCollider(rec);
      }
    }
  }

  buildAssembly(group) {
    const old = new Set();
    for (const p of group) {
      const rec = this.parts.get(p);
      if (rec && rec.asm) old.add(rec.asm);
    }
    let vel = null, avel = null;
    for (const a of old) {
      if (a.body && !vel) {
        vel = a.body.linvel();
        avel = a.body.angvel();
      }
      this.destroyAssembly(a);
    }
    const parts = [...group];
    const anchored = parts.some((p) => p.props.get('Anchored'));
    let root = parts[0];
    let best = -1;
    for (const p of parts) {
      const rec = this.parts.get(p);
      if (p.props.get('Anchored') && !anchored) continue;
      const v = rec.volume + (p.props.get('Anchored') ? 1e9 : 0);
      if (v > best) {
        best = v;
        root = p;
      }
    }
    const asm = { parts: new Set(parts), anchored, root, body: null, sleeping: false };
    this.assemblies.add(asm);
    if (anchored || parts.length === 0) {
      for (const p of parts) {
        const rec = this.parts.get(p);
        rec.asm = asm;
        if (!rec.collider) this.makeCollider(rec);
      }
      return asm;
    }
    const R = this.R;
    const rcf = root.props.get('CFrame');
    const bd = R.RigidBodyDesc.dynamic().setTranslation(rcf[0], rcf[1], rcf[2]).setRotation(quatOf(rcf)).setCanSleep(true).setCcdEnabled(false);
    const body = this.world.createRigidBody(bd);
    if (vel) {
      body.setLinvel(vel, true);
      body.setAngvel(avel, true);
    } else {
      const v = root.props.get('Velocity'), w = root.props.get('RotVelocity');
      body.setLinvel({ x: v[0], y: v[1], z: v[2] }, true);
      body.setAngvel({ x: w[0], y: w[1], z: w[2] }, true);
    }
    asm.body = body;
    const inv = C.inv(rcf);
    for (const p of parts) {
      const rec = this.parts.get(p);
      rec.asm = asm;
      rec.local = C.mul(inv, p.props.get('CFrame'));
      this.makeCollider(rec, body, rec.local);
    }
    return asm;
  }

  moved(part, rec, opts) {
    const cf = part.props.get('CFrame');
    if (!rec.collider) return;
    const asm = rec.asm;
    if (asm && asm.body) {
      const target = C.mul(cf, C.inv(rec.local));
      asm.body.setTranslation({ x: target[0], y: target[1], z: target[2] }, true);
      asm.body.setRotation(quatOf(target), true);
      if (!opts || !opts.model) {
        this.writing = true;
        for (const p of asm.parts) {
          if (p === part) continue;
          const r = this.parts.get(p);
          if (r) this.dm.setProp(p, 'CFrame', C.mul(target, r.local), { physics: true });
        }
        this.writing = false;
      }
      return;
    }
    const full = rec.rot ? C.mul(cf, rec.rot) : cf;
    rec.collider.setTranslation({ x: full[0], y: full[1], z: full[2] });
    rec.collider.setRotation(quatOf(full));
    if (this.simulate && !part.props.get('Anchored')) this.markDirty(part);
  }

  applyMovers(dt) {
    for (const m of this.movers) {
      if (m.destroyed || !m.parent) {
        this.movers.delete(m);
        continue;
      }
      const rec = this.parts.get(m.parent);
      if (!rec || !rec.asm || !rec.asm.body) continue;
      const body = rec.asm.body;
      const mass = body.mass();
      const v = body.linvel();
      const cls = m.ClassName;
      if (cls === 'BodyVelocity') {
        const tv = m.props.get('Velocity'), mf = m.props.get('MaxForce');
        const lim = (k, d) => Math.max(-mf[k] * dt, Math.min(mf[k] * dt, d));
        const g = GRAVITY * dt * mass;
        body.applyImpulse({ x: lim(0, (tv[0] - v.x) * mass), y: lim(1, (tv[1] - v.y) * mass + g) , z: lim(2, (tv[2] - v.z) * mass) }, true);
      } else if (cls === 'BodyPosition') {
        const tp = m.props.get('Position'), mf = m.props.get('MaxForce');
        const P = m.props.get('P'), D = m.props.get('D');
        const pos = body.translation();
        const f = [P * (tp[0] - pos.x) - D * v.x, P * (tp[1] - pos.y) - D * v.y + mass * GRAVITY * (mf[1] > mass * GRAVITY ? 1 : 0), P * (tp[2] - pos.z) - D * v.z];
        const lim = (k) => Math.max(-mf[k], Math.min(mf[k], f[k])) * dt;
        const imp = { x: lim(0), y: lim(1), z: lim(2) };
        const maxImp = mass * 2000 * dt;
        imp.x = Math.max(-maxImp, Math.min(maxImp, imp.x));
        imp.y = Math.max(-maxImp, Math.min(maxImp, imp.y));
        imp.z = Math.max(-maxImp, Math.min(maxImp, imp.z));
        body.applyImpulse(imp, true);
      } else if (cls === 'BodyForce') {
        const f = m.props.get('Force');
        body.applyImpulse({ x: f[0] * dt, y: f[1] * dt, z: f[2] * dt }, true);
      } else if (cls === 'BodyThrust') {
        const f = m.props.get('Force'), loc = m.props.get('Location');
        const cf = rec.part.props.get('CFrame');
        const wf = C.vector(cf, f[0], f[1], f[2]);
        const wp = C.point(cf, loc[0], loc[1], loc[2]);
        body.applyImpulseAtPoint({ x: wf[0] * dt, y: wf[1] * dt, z: wf[2] * dt }, { x: wp[0], y: wp[1], z: wp[2] }, true);
      } else if (cls === 'BodyGyro') {
        const target = m.props.get('CFrame'), mt = m.props.get('MaxTorque');
        const P = m.props.get('P'), D = m.props.get('D');
        const cur = rec.part.props.get('CFrame');
        const err = C.mul(C.rotOnly(target), C.inv(C.rotOnly(cur)));
        const q = C.toQuat(err);
        let ang = 2 * Math.acos(Math.max(-1, Math.min(1, q[3])));
        if (ang > Math.PI) ang -= 2 * Math.PI;
        const s = Math.sqrt(Math.max(1e-9, 1 - q[3] * q[3]));
        const axis = [q[0] / s, q[1] / s, q[2] / s];
        const w = body.angvel();
        const inertia = mass * 2;
        const tq = [0, 1, 2].map((k) => {
          const raw = (P * axis[k] * ang - D * [w.x, w.y, w.z][k]) * 0.01 * inertia;
          return Math.max(-mt[k], Math.min(mt[k], raw)) * dt;
        });
        if (mt[0] + mt[1] + mt[2] > 0) body.applyTorqueImpulse({ x: tq[0], y: tq[1], z: tq[2] }, true);
      } else if (cls === 'BodyAngularVelocity') {
        const tv = m.props.get('AngularVelocity'), mt = m.props.get('MaxTorque');
        const w = body.angvel();
        const inertia = mass * 2;
        const lim = (k, d) => Math.max(-mt[k] * dt, Math.min(mt[k] * dt, d * inertia * 0.5));
        body.applyTorqueImpulse({ x: lim(0, tv[0] - w.x), y: lim(1, tv[1] - w.y), z: lim(2, tv[2] - w.z) }, true);
      } else if (cls === 'RocketPropulsion') {
        const tgt = m.props.get('Target');
        if (!tgt || !m.data || !m.data.firing) continue;
        const tcf = tgt.props.get('CFrame');
        const pos = body.translation();
        const d = [tcf[0] - pos.x, tcf[1] - pos.y, tcf[2] - pos.z];
        const l = Math.hypot(...d) || 1;
        const ms = m.props.get('MaxSpeed');
        const want = d.map((x) => (x / l) * ms);
        body.setLinvel({ x: want[0], y: want[1], z: want[2] }, true);
      }
    }
  }

  step(dt) {
    this.flush();
    if (!this.simulate) return;
    this.acc = Math.min(this.acc + dt, STEP * 4);
    while (this.acc >= STEP) {
      this.applyMovers(STEP);
      if (this.vehicleSeats.size) this.driveVehicles();
      this.world.step(this.events, this.pushHooks());
      this.acc -= STEP;
      this.drainEvents();
    }
    this.writeBack();
  }

  pushHooks() {
    if (this.hooks) return this.hooks;
    const R = this.R;
    this.hooks = {
      filterContactPair: (c1, c2, b1, b2) => {
        const i1 = this.byHandle.get(c1);
        const other = i1 && i1.solidProxy ? b2 : b1;
        const body = this.world.getRigidBody(other);
        if (body && body.isDynamic() && body.mass() > CHARACTER_PUSH_MASS) return null;
        return R.SolverFlags.COMPUTE_IMPULSE;
      },
      filterIntersectionPair: () => true,
    };
    return this.hooks;
  }

  drainEvents() {
    this.events.drainCollisionEvents((h1, h2, started) => {
      const a = this.byHandle.get(h1), b = this.byHandle.get(h2);
      if (!a || !b) return;
      this.touchPair(a.part, b.part, started);
    });
  }

  touchPair(a, b, started) {
    const ta = this.touching.get(a) || new Set();
    const tb = this.touching.get(b) || new Set();
    if (started) {
      if (ta.has(b)) return;
      ta.add(b);
      tb.add(a);
    } else {
      if (!ta.has(b)) return;
      ta.delete(b);
      tb.delete(a);
    }
    this.touching.set(a, ta);
    this.touching.set(b, tb);
    if (this.onTouch) this.onTouch(a, b, started);
  }

  touchingParts(part) {
    return [...(this.touching.get(part) || [])];
  }

  writeBack() {
    const fallen = [];
    const destroyY = this.ws ? this.ws.props.get('FallenPartsDestroyHeight') : -500;
    for (const asm of this.assemblies) {
      const body = asm.body;
      if (!body) continue;
      if (body.isSleeping()) {
        if (!asm.sleeping) {
          asm.sleeping = true;
          for (const p of asm.parts) {
            this.dm.setProp(p, 'Velocity', [0, 0, 0], { physics: true });
            this.dm.setProp(p, 'RotVelocity', [0, 0, 0], { physics: true });
          }
        }
        continue;
      }
      asm.sleeping = false;
      const bcf = cfOf(body.translation(), body.rotation());
      const lv = body.linvel(), av = body.angvel();
      const vel = [lv.x, lv.y, lv.z], avel = [av.x, av.y, av.z];
      if (bcf[1] < destroyY || !C.isFiniteCF(bcf)) {
        fallen.push(asm);
        continue;
      }
      for (const p of asm.parts) {
        const rec = this.parts.get(p);
        if (!rec) continue;
        this.dm.setProp(p, 'CFrame', C.mul(bcf, rec.local), { physics: true });
        this.dm.setProp(p, 'Velocity', vel, { physics: true });
        this.dm.setProp(p, 'RotVelocity', avel, { physics: true });
      }
    }
    for (const asm of fallen) {
      const parts = [...asm.parts];
      if (this.onFallen) this.onFallen(parts);
      else for (const p of parts) if (!p.destroyed) this.dm.destroy(p);
    }
  }

  rootPart(part) {
    const rec = this.parts.get(part);
    return rec && rec.asm ? rec.asm.root : part;
  }

  connectedParts(part) {
    const rec = this.parts.get(part);
    return rec && rec.asm ? [...rec.asm.parts] : [part];
  }

  awake() {
    const out = [];
    for (const asm of this.assemblies) if (asm.body && !asm.body.isSleeping()) out.push(asm);
    return out;
  }

  raycast(origin, dir, ignore = [], filter = null) {
    const len = Math.hypot(dir[0], dir[1], dir[2]);
    if (len < 1e-9) return { part: null, point: origin.slice(), normal: [0, 1, 0] };
    const maxLen = Math.min(len, 5000);
    const R = this.R;
    const ray = new R.Ray({ x: origin[0], y: origin[1], z: origin[2] }, { x: dir[0] / len, y: dir[1] / len, z: dir[2] / len });
    const ig = ignore.filter(Boolean);
    const pred = (c) => {
      const rec = this.byHandle.get(c.handle);
      if (!rec) return !!c.__solid;
      if (rec.noRay) return false;
      for (const x of ig) if (rec.part === x || rec.part.isDescendantOf(x)) return false;
      if (filter && !filter(rec.part)) return false;
      return true;
    };
    const hit = this.world.castRayAndGetNormal(ray, maxLen, true, undefined, undefined, undefined, undefined, pred);
    if (!hit) return { part: null, point: [origin[0] + (dir[0] / len) * maxLen, origin[1] + (dir[1] / len) * maxLen, origin[2] + (dir[2] / len) * maxLen], normal: [0, 1, 0] };
    const t = hit.timeOfImpact;
    const rec = this.byHandle.get(hit.collider.handle);
    return {
      part: rec ? rec.part : null,
      point: [origin[0] + (dir[0] / len) * t, origin[1] + (dir[1] / len) * t, origin[2] + (dir[2] / len) * t],
      normal: [hit.normal.x, hit.normal.y, hit.normal.z],
    };
  }

  explode(center, radius, pressure, onHit) {
    const hits = [];
    this.world.collidersWithAabbIntersectingAabb({ x: center[0], y: center[1], z: center[2] }, { x: radius, y: radius, z: radius }, (c) => {
      const rec = this.byHandle.get(c.handle);
      if (rec) hits.push(rec.part);
      return true;
    });
    const touched = [];
    for (const p of hits) {
      const cf = p.props.get('CFrame');
      const d = Math.hypot(cf[0] - center[0], cf[1] - center[1], cf[2] - center[2]);
      if (d > radius) continue;
      touched.push([p, d]);
    }
    for (const [p, d] of touched) {
      if (onHit) onHit(p, d);
      if (p.props.get('Anchored')) continue;
      this.breakJoints(p);
    }
    this.flush();
    for (const [p, d] of touched) {
      const rec = this.parts.get(p);
      if (!rec || !rec.asm || !rec.asm.body) continue;
      const cf = p.props.get('CFrame');
      const dir = [cf[0] - center[0], cf[1] - center[1], cf[2] - center[2]];
      const l = Math.hypot(...dir) || 1;
      const k = (pressure / 500000) * 120 * (1 - d / (radius + 1)) * rec.asm.body.mass();
      rec.asm.body.applyImpulse({ x: (dir[0] / l) * k, y: (dir[1] / l) * k + k * 0.3, z: (dir[2] / l) * k }, true);
    }
  }
}
