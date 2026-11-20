import * as C from './cframe.js';
import { waterSurface } from './terrain.js';

const A = (x, y, z, rx, ry, rz) => C.mul(C.cf(x, y, z), C.angles(rx, ry, rz));
const PI = Math.PI;

export const R6 = {
  parts: {
    Head: { size: [2, 1, 1], at: [0, 4.5, 0], color: 'HeadColor' },
    Torso: { size: [2, 2, 1], at: [0, 3, 0], color: 'TorsoColor' },
    'Left Arm': { size: [1, 2, 1], at: [-1.5, 3, 0], color: 'LeftArmColor' },
    'Right Arm': { size: [1, 2, 1], at: [1.5, 3, 0], color: 'RightArmColor' },
    'Left Leg': { size: [1, 2, 1], at: [-0.5, 1, 0], color: 'LeftLegColor' },
    'Right Leg': { size: [1, 2, 1], at: [0.5, 1, 0], color: 'RightLegColor' },
  },
  joints: [
    { name: 'Neck', p1: 'Head', c0: A(0, 1, 0, -PI / 2, 0, PI), c1: A(0, -0.5, 0, -PI / 2, 0, PI) },
    { name: 'Right Shoulder', p1: 'Right Arm', c0: A(1, 0.5, 0, 0, PI / 2, 0), c1: A(-0.5, 0.5, 0, 0, PI / 2, 0) },
    { name: 'Left Shoulder', p1: 'Left Arm', c0: A(-1, 0.5, 0, 0, -PI / 2, 0), c1: A(0.5, 0.5, 0, 0, -PI / 2, 0) },
    { name: 'Right Hip', p1: 'Right Leg', c0: A(1, -1, 0, 0, PI / 2, 0), c1: A(0.5, 1, 0, 0, PI / 2, 0) },
    { name: 'Left Hip', p1: 'Left Leg', c0: A(-1, -1, 0, 0, -PI / 2, 0), c1: A(-0.5, 1, 0, 0, -PI / 2, 0) },
  ],
};

export const RIGHT_GRIP_C0 = A(0, -1, 0, -PI / 2, 0, 0);

export function gripOf(tool) {
  return tool.props.get('Grip') || C.cf(0, 0, 0);
}

const LANDED_DELAY = 0.5;
const CHARACTER_MASS = 9.8;
export function rootOf(model) {
  return model ? model.findChild('Torso') || model.findChild('HumanoidRootPart') : null;
}

const CLIMB_PUSH = 8;
const CLIMB_PUSH_TIME = 0.3;
const CLIMB_REGRAB = 0.5;
export const STATES = { idle: 0, walk: 1, jump: 2, fall: 3, sit: 4, climb: 5, dead: 6, stand: 7, swim: 8 };
export const STATE_NAMES = Object.fromEntries(Object.entries(STATES).map(([k, v]) => [v, k]));

let humanoidMemo = null;
export function withHumanoidMemo(fn) {
  const prev = humanoidMemo;
  humanoidMemo = new Map();
  try {
    return fn();
  } finally {
    humanoidMemo = prev;
  }
}

function humanoidOf(m) {
  if (!humanoidMemo) return m.findChildOfClass('Humanoid');
  let h = humanoidMemo.get(m);
  if (h === undefined) {
    h = m.findChildOfClass('Humanoid');
    humanoidMemo.set(m, h);
  }
  return h;
}

export function liveCharacterOf(part) {
  for (let m = part.parent; m; m = m.parent) {
    if (m.ClassName === 'Model' || m.ClassName === 'Workspace') {
      if (m.ClassName === 'Workspace') return null;
      const h = humanoidOf(m);
      if (h && rootOf(m) && m.findChild('Head') && h.props.get('Health') > 0 && !(m.data && m.data.dead)) {
        const torso = rootOf(m);
        if (torso.props.get('Anchored')) return null;
        return m;
      }
      return null;
    }
  }
  return null;
}

function jointAngleCF(j) {
  const a = j.isA('Motor') || j.ClassName === 'VelocityMotor' ? j.props.get('CurrentAngle') || 0 : 0;
  return a ? C.axisAngle(0, 0, 1, a) : null;
}

export class Rig {
  constructor(model) {
    this.model = model;
    this.build();
  }

  build() {
    const m = this.model;
    const torso = rootOf(m);
    this.torso = torso;
    this.edges = new Map();
    const joints = m.descendants().filter((d) => d.isA('JointInstance'));
    for (const j of joints) {
      const a = j.props.get('Part0'), b = j.props.get('Part1');
      if (!a || !b || a === b) continue;
      if (!a.isDescendantOf(m) || !b.isDescendantOf(m)) continue;
      if (!this.edges.has(a)) this.edges.set(a, []);
      if (!this.edges.has(b)) this.edges.set(b, []);
      this.edges.get(a).push([j, b, true]);
      this.edges.get(b).push([j, a, false]);
    }
    this.order = [];
    const hrp = m.findChild('HumanoidRootPart');
    if (hrp && hrp.isA('BasePart') && this.edges.has(hrp) && (!m.findChild('Torso') || this.edges.get(hrp).some(([, o]) => o === m.findChild('Torso')))) this.torso = hrp;
    if (!this.torso) return;
    const seen = new Set([this.torso]);
    const queue = [this.torso];
    while (queue.length) {
      const p = queue.shift();
      for (const [j, o, forward] of this.edges.get(p) || []) {
        if (seen.has(o)) continue;
        seen.add(o);
        this.order.push([p, j, o, forward]);
        queue.push(o);
      }
    }
    this.parts = seen;
  }

  pose(torsoCF, write) {
    const out = new Map();
    out.set(this.torso, torsoCF);
    for (const [p, j, o, forward] of this.order) {
      const base = out.get(p);
      if (!base) continue;
      const c0 = j.props.get('C0'), c1 = j.props.get('C1');
      const ang = jointAngleCF(j);
      const rot = j.anim ? (ang ? C.mul(ang, j.anim) : j.anim) : ang;
      let cf;
      if (forward) {
        const mid = rot ? C.mul(c0, rot) : c0;
        cf = C.mul(C.mul(base, mid), C.inv(c1));
      } else {
        const mid = rot ? C.mul(c1, C.inv(rot)) : c1;
        cf = C.mul(C.mul(base, mid), C.inv(c0));
      }
      out.set(o, cf);
    }
    if (write) for (const [part, cf] of out) write(part, cf);
    return out;
  }
}

export function setMotor(model, name, desired, maxVel) {
  const torso = model.findChild('Torso');
  if (!torso) return;
  const j = torso.findChild(name);
  if (!j || !j.isA('Motor')) return;
  j.props.set('DesiredAngle', desired);
  j.props.set('MaxVelocity', maxVel);
}

export const LIMB_MOTORS = ['Right Shoulder', 'Left Shoulder', 'Right Hip', 'Left Hip'];

export function readLimbAngles(model) {
  const torso = model.findChild('Torso');
  if (!torso) return null;
  const out = [];
  for (const name of LIMB_MOTORS) {
    const j = torso.findChild(name);
    out.push(j && j.isA('Motor') ? Math.round((+j.props.get('CurrentAngle') || 0) * 1000) / 1000 : 0);
  }
  return out;
}

export function applyLimbAngles(model, angles) {
  const torso = model.findChild('Torso');
  if (!torso || !Array.isArray(angles)) return;
  LIMB_MOTORS.forEach((name, i) => {
    const a = +angles[i];
    if (!Number.isFinite(a)) return;
    const j = torso.findChild(name);
    if (j && j.isA('Motor')) j.props.set('CurrentAngle', Math.max(-7, Math.min(7, a)));
  });
}

export function stepMotors(model, dt) {
  const torso = model.findChild('Torso');
  if (!torso) return;
  for (const j of torso.children) {
    if (!j.isA('Motor')) continue;
    const cur = j.props.get('CurrentAngle') || 0;
    const des = j.props.get('DesiredAngle') || 0;
    const mv = Math.abs(j.props.get('MaxVelocity') || 0) * 60 * dt;
    if (mv <= 0) continue;
    const d = des - cur;
    j.props.set('CurrentAngle', Math.abs(d) <= mv ? des : cur + Math.sign(d) * mv);
  }
}

export function animate(model, state, speed, t, holdingTool) {
  let amp = 0, freq = 9, rs, ls, rh, lh;
  const mv = 0.15;
  if (state === STATES.jump || state === STATES.fall) {
    rs = PI; ls = -PI; rh = 0; lh = 0;
    setMotor(model, 'Right Shoulder', holdingTool ? PI / 2 : rs, 0.5);
    setMotor(model, 'Left Shoulder', ls, 0.5);
    setMotor(model, 'Right Hip', rh, 0.5);
    setMotor(model, 'Left Hip', lh, 0.5);
    return;
  }
  if (state === STATES.swim) {
    const sw = (speed > 0.5 ? 0.9 : 0.25) * Math.sin(t * (speed > 0.5 ? 7 : 2));
    setMotor(model, 'Right Shoulder', holdingTool ? PI / 2 : PI - sw, 0.4);
    setMotor(model, 'Left Shoulder', -(PI - sw), 0.4);
    setMotor(model, 'Right Hip', sw * 0.6, 0.4);
    setMotor(model, 'Left Hip', -sw * 0.6, 0.4);
    return;
  }
  if (state === STATES.sit) {
    setMotor(model, 'Right Shoulder', holdingTool ? PI / 2 : PI / 2, 0.15);
    setMotor(model, 'Left Shoulder', -PI / 2, 0.15);
    setMotor(model, 'Right Hip', PI / 2, 0.15);
    setMotor(model, 'Left Hip', -PI / 2, 0.15);
    return;
  }
  if (state === STATES.climb) {
    amp = 1;
    freq = 9;
    const d = amp * Math.sin(t * freq);
    setMotor(model, 'Right Shoulder', PI - d, 0.5);
    setMotor(model, 'Left Shoulder', -(PI - d), 0.5);
    setMotor(model, 'Right Hip', d, 0.5);
    setMotor(model, 'Left Hip', d, 0.5);
    return;
  }
  if (state === STATES.walk && speed > 0.5) {
    amp = 1;
    freq = 9;
  } else {
    amp = 0.1;
    freq = 1;
  }
  const d = amp * Math.sin(t * freq);
  setMotor(model, 'Right Shoulder', holdingTool ? PI / 2 : d, holdingTool ? 0.5 : mv);
  setMotor(model, 'Left Shoulder', d, mv);
  setMotor(model, 'Right Hip', -d, mv);
  setMotor(model, 'Left Hip', -d, mv);
}

export function holdsTool(model) {
  for (const c of model.children) if (c.ClassName === 'Tool') return true;
  return false;
}

export function flatYaw(cf) {
  const lv = C.lookVector(cf);
  const l = Math.hypot(lv[0], lv[2]);
  if (l < 1e-6) return C.cf(cf[0], cf[1], cf[2]);
  return C.lookAt(cf[0], cf[1], cf[2], cf[0] + lv[0] / l, cf[1], cf[2] + lv[2] / l);
}

export class Controller {
  constructor(physics, model, humanoid) {
    this.ph = physics;
    this.model = model;
    this.hum = humanoid;
    this.R = physics.R;
    const world = physics.world;
    const torso = rootOf(model);
    const cf = torso.props.get('CFrame');
    this.off = model.findChild('Torso') ? 0.5 : -0.1;
    this.vel = [0, 0, 0];
    this.state = STATES.fall;
    this.grounded = false;
    this.jumpHeld = false;
    this.yawCF = flatYaw(cf);
    this.body = world.createRigidBody(this.R.RigidBodyDesc.kinematicPositionBased().setTranslation(cf[0], cf[1] - this.off, cf[2]));
    this.collider = world.createCollider(this.R.ColliderDesc.cuboid(1, 2.45, 0.5).setActiveCollisionTypes(this.R.ActiveCollisionTypes.ALL), this.body);
    this.jumpCooldown = 0;
    this.landedFor = 0;
    physics.byHandle.set(this.collider.handle, { part: torso, noRay: true, character: model });
    this.kcc = world.createCharacterController(0.04);
    this.kcc.setUp({ x: 0, y: 1, z: 0 });
    this.kcc.setMaxSlopeClimbAngle((60 * Math.PI) / 180);
    this.kcc.setMinSlopeSlideAngle((75 * Math.PI) / 180);
    this.kcc.enableAutostep(1.3, 0.2, true);
    this.kcc.enableSnapToGround(0.6);
    this.kcc.setApplyImpulsesToDynamicBodies(true);
    this.kcc.setSlideEnabled(true);
    this.kcc.setNormalNudgeFactor(0.01);
    this.pos = [cf[0], cf[1] - this.off, cf[2]];
    this.rot = { x: 0, y: 0, z: 0, w: 1 };
    this.rotCF = C.cf();
  }

  bodyLift(dt) {
    this.liftAge = (this.liftAge || 0) + dt;
    if (this.liftAge < 0.1 && this.liftValue !== undefined) return this.liftValue;
    this.liftAge = 0;
    let fy = 0, mass = 0, forces = false;
    for (const d of this.model.descendants()) {
      if (d.ClassName === 'BodyForce') {
        const f = d.props.get('Force');
        if (f && d.parent && d.parent.isA('BasePart')) {
          fy += f[1];
          forces = true;
        }
      } else if (d.isA('BasePart')) {
        const sz = d.props.get('Size');
        if (sz) mass += sz[0] * sz[1] * sz[2] * 0.7;
      }
    }
    this.liftValue = forces && mass > 0 ? fy / mass : 0;
    return this.liftValue;
  }

  era2018() {
    return !!(this.hum && this.hum.dm && this.hum.dm.era === 2018);
  }

  foot(dx, dz) {
    if (!this.era2018()) return [dx, dz];
    const v = C.vector(this.rotCF, dx, 0, dz);
    return [v[0], v[2]];
  }

  turnBox() {
    if (!this.era2018()) return;
    const yaw = C.rotOnly(this.yawCF);
    const q = C.toQuat(yaw);
    const rot = { x: q[0], y: q[1], z: q[2], w: q[3] };
    if (Math.abs(rot.x * this.rot.x + rot.y * this.rot.y + rot.z * this.rot.z + rot.w * this.rot.w) > 0.99999) return;
    const R = this.R;
    if (!this.probe) this.probe = { inner: new R.Cuboid(0.95, 2.4, 0.45), outer: new R.Cuboid(1, 2.45, 0.5) };
    const base = this.filter();
    let blocked = false;
    this.ph.world.intersectionsWithShape({ x: this.pos[0], y: this.pos[1] + 0.1, z: this.pos[2] }, rot, this.probe.inner, () => {
      blocked = true;
      return false;
    }, R.QueryFilterFlags.EXCLUDE_SENSORS, undefined, this.collider, this.body, (c) => {
      const r = this.ph.byHandle.get(c.handle);
      return r && r.solidProxy ? false : base(c);
    });
    if (blocked) return;
    this.rot = rot;
    this.rotCF = yaw;
    this.body.setNextKinematicRotation(rot);
  }

  destroy() {
    const w = this.ph.world;
    this.ph.byHandle.delete(this.collider.handle);
    w.removeCharacterController(this.kcc);
    w.removeRigidBody(this.body);
  }

  teleport(cf) {
    this.pos = [cf[0], cf[1] - this.off, cf[2]];
    this.body.setTranslation({ x: this.pos[0], y: this.pos[1], z: this.pos[2] }, true);
    this.yawCF = flatYaw(cf);
    this.vel = [0, 0, 0];
    if (this.era2018()) {
      const yaw = C.rotOnly(this.yawCF);
      const q = C.toQuat(yaw);
      this.rot = { x: q[0], y: q[1], z: q[2], w: q[3] };
      this.rotCF = yaw;
      this.body.setRotation(this.rot, true);
    }
  }

  filter() {
    const model = this.model;
    const root = model && (model.findChild('HumanoidRootPart') || model.findChild('Torso'));
    const own = root ? root.props.get('CollisionGroupId') | 0 : 0;
    const skip = this.passThrough;
    return (c) => {
      if (c.handle === this.collider.handle) return false;
      if (skip && skip.has(c.handle)) return false;
      const rec = this.ph.byHandle.get(c.handle);
      if (!rec || rec.terrain) return true;
      if (rec.character === model) return false;
      if (rec.part && (rec.part === model || rec.part.isDescendantOf(model))) return false;
      if (rec.sensorOnly) return false;
      if (rec.part && !rec.part.props.get('CanCollide')) return false;
      if (rec.part && this.ph.groupsCollide && !this.ph.groupsCollide(own, rec.part.props.get('CollisionGroupId') | 0)) return false;
      return true;
    };
  }

  climbCheck(dir) {
    if (Math.hypot(dir[0], dir[2]) < 0.1) return false;
    const origin = [this.pos[0], this.pos[1] - 1.5, this.pos[2]];
    for (const dy of [-0.8, 0, 1.5, 3]) {
      const o = [origin[0], origin[1] + dy, origin[2]];
      const r = this.ph.raycast(o, [dir[0] * 1.6, 0, dir[2] * 1.6], [this.model], (q) => !liveCharacterOf(q));
      if (r.part && r.part.ClassName === 'TrussPart') {
        this.ledgeTop = undefined;
        return true;
      }
    }
    return this.ledgeAhead(dir);
  }

  ledgeAhead(dir) {
    const reach = 1.7;
    const foot = this.pos[1] - 2.5;
    let prev = Infinity;
    const minRise = this.state === STATES.climb && this.ledgeTop !== undefined ? 0.3 : 2.6;
    let lastHit = -Infinity;
    const ds = [];
    for (let k = 0; k <= 22; k++) {
      const y = foot + k * 0.25;
      const r = this.ph.raycast([this.pos[0], y, this.pos[2]], [dir[0] * reach, 0, dir[2] * reach], [this.model], (q) => q.ClassName !== 'Terrain' && q.props.get('CanCollide') && !liveCharacterOf(q));
      const facing = r.part && Math.abs(r.normal[1]) < 0.35 && r.normal[0] * dir[0] + r.normal[2] * dir[2] < -0.5;
      ds.push(facing ? Math.hypot(r.point[0] - this.pos[0], r.point[2] - this.pos[2]) : Infinity);
    }
    let seen = false, gap = 0, rungs = false;
    for (const d of ds) {
      if (d < Infinity) {
        if (seen && gap >= 3) rungs = true;
        seen = true;
        gap = 0;
      } else if (seen) gap++;
    }
    for (let k = 0; k <= 22; k++) {
      const y = foot + k * 0.25;
      const d = ds[k];
      if (d < Infinity) lastHit = y;
      if (k * 0.25 >= minRise && prev <= reach && d > prev + 0.8) {
        this.ledgeTop = lastHit + 0.25;
        return true;
      }
      prev = d;
    }
    if (rungs) {
      this.ledgeTop = undefined;
      return true;
    }
    return false;
  }

  unstick() {
    const R = this.R;
    const world = this.ph.world;
    const base = this.filter();
    const filter = (c) => {
      const r = this.ph.byHandle.get(c.handle);
      return r && r.solidProxy ? false : base(c);
    };
    if (!this.probe) this.probe = { inner: new R.Cuboid(0.95, 2.4, 0.45), outer: new R.Cuboid(1, 2.45, 0.5) };
    const rot = this.rot;
    let inside = false;
    world.intersectionsWithShape({ x: this.pos[0], y: this.pos[1], z: this.pos[2] }, rot, this.probe.inner, () => {
      inside = true;
      return false;
    }, R.QueryFilterFlags.EXCLUDE_SENSORS, undefined, this.collider, this.body, filter);
    if (!inside) return false;
    const lift = 3.2;
    const from = { x: this.pos[0], y: this.pos[1] + lift, z: this.pos[2] };
    const hit = world.castShape(from, rot, { x: 0, y: -1, z: 0 }, this.probe.outer, 0, lift, true, R.QueryFilterFlags.EXCLUDE_SENSORS, undefined, this.collider, this.body, filter);
    if (!hit || hit.time_of_impact <= 0) return false;
    const y = from.y - hit.time_of_impact + 0.05;
    if (y <= this.pos[1]) return false;
    this.pos[1] = y;
    this.body.setTranslation({ x: this.pos[0], y: this.pos[1], z: this.pos[2] }, true);
    if (this.vel[1] < 0) this.vel[1] = 0;
    return true;
  }

  separate(dt) {
    const R = this.R;
    if (!this.probe) this.probe = { inner: new R.Cuboid(0.95, 2.4, 0.45), outer: new R.Cuboid(1, 2.45, 0.5) };
    const skip = new Set();
    const push = [0, 0];
    this.ph.world.intersectionsWithShape({ x: this.pos[0], y: this.pos[1], z: this.pos[2] }, this.rot, this.probe.inner, (c) => {
      const rec = this.ph.byHandle.get(c.handle);
      if (!rec || !rec.solidProxy || rec.character === this.model) return true;
      skip.add(c.handle);
      const t = c.translation();
      let dx = this.pos[0] - t.x, dz = this.pos[2] - t.z;
      let l = Math.hypot(dx, dz);
      if (l < 1e-3) {
        dx = 1;
        dz = 0;
        l = 1;
      }
      const k = Math.max(0, 2.2 - l) / 2.2;
      push[0] += (dx / l) * k;
      push[1] += (dz / l) * k;
      return true;
    }, R.QueryFilterFlags.EXCLUDE_SENSORS, undefined, this.collider, this.body);
    this.passThrough = skip.size ? skip : null;
    if (!skip.size) return [0, 0];
    return [push[0] * 10 * dt, push[1] * 10 * dt];
  }

  characterMover() {
    for (const name of ['HumanoidRootPart', 'Torso', 'UpperTorso']) {
      const part = this.model.findChild(name);
      if (!part) continue;
      for (const c of part.children) if (c.ClassName === 'BodyVelocity' && !c.destroyed) return c;
    }
    return null;
  }

  feetOnGround() {
    const p = this.pos;
    const from = p[1] - 2.3;
    for (const [ox, oz] of [[0, 0], [0.9, 0.4], [-0.9, 0.4], [0.9, -0.4], [-0.9, -0.4]]) {
      const [dx, dz] = this.foot(ox, oz);
      const r = this.ph.raycast([p[0] + dx, from, p[2] + dz], [0, -0.55, 0], [this.model], (q) => q.props.get('CanCollide'));
      if (r.part && r.normal[1] > 0.5) return true;
    }
    return false;
  }

  groundClamp() {
    const p = this.pos;
    const from = p[1] - 2.15;
    let top = -Infinity;
    for (const [ox, oz] of [[0, 0], [0.95, 0.45], [-0.95, 0.45], [0.95, -0.45], [-0.95, -0.45]]) {
      const [dx, dz] = this.foot(ox, oz);
      const r = this.ph.raycast([p[0] + dx, from, p[2] + dz], [0, -0.6, 0], [this.model], (q) => q.props.get('CanCollide'));
      if (!r.part || r.normal[1] < 0.99) return false;
      top = Math.max(top, r.point[1]);
    }
    const y = top + 2.49;
    if (Math.abs(y - p[1]) > 0.15) return false;
    p[1] = y;
    return true;
  }

  applySlope() {
    const e18 = this.hum.dm && this.hum.dm.era === 2018;
    const a = e18 ? Math.max(0, Math.min(89, +this.hum.props.get('MaxSlopeAngle'))) : 60;
    const deg = Number.isFinite(a) ? a : e18 ? 89 : 60;
    if (deg === this.slopeDeg) return;
    this.slopeDeg = deg;
    this.kcc.setMaxSlopeClimbAngle((deg * Math.PI) / 180);
    this.kcc.setMinSlopeSlideAngle((Math.max(75, deg + 0.5) * Math.PI) / 180);
  }

  update(dt, input) {
    const hum = this.hum;
    this.applySlope();
    this.unstick();
    const ws = hum.props.get('WalkSpeed');
    const move = input.move || [0, 0, 0];
    const ml = Math.hypot(move[0], move[2]);
    const dir = ml > 1e-3 ? [move[0] / ml, 0, move[2] / ml] : [0, 0, 0];
    const platform = hum.props.get('PlatformStand');
    const speed = platform ? 0 : ws;
    this.vel[0] = dir[0] * speed;
    this.vel[2] = dir[2] * speed;
    if ((input.jump || hum.props.get('Jump')) && !platform) this.jumpHeldFor = hum.dm && hum.dm.era === 2018 ? 0.05 : 0.3;
    else this.jumpHeldFor = Math.max(0, (this.jumpHeldFor || 0) - dt);
    const wantJump = this.jumpHeldFor > 0 && !platform;
    if (hum.props.get('Jump')) hum.dm.setProp(hum, 'Jump', false, { local: true });
    this.climbBlock = Math.max(0, (this.climbBlock || 0) - dt);
    if (!platform && wantJump && this.state === STATES.climb && this.climbDir) {
      this.climbOff = { dir: [-this.climbDir[0], 0, -this.climbDir[2]], t: CLIMB_PUSH_TIME };
      this.climbBlock = CLIMB_REGRAB;
      this.vel[1] = (hum.props.get('JumpPower') || 50) * 0.8;
      this.grounded = false;
      this.jumped = true;
      this.jumpHeldFor = 0;
      this.ledgeTop = undefined;
      this.state = STATES.jump;
    }
    if (this.climbOff && this.climbOff.t > 0) {
      const push = Math.max(CLIMB_PUSH, ws * 0.6);
      this.vel[0] = this.climbOff.dir[0] * push;
      this.vel[2] = this.climbOff.dir[2] * push;
      this.climbOff.t -= dt;
    }
    const canClimb = !platform && this.climbBlock <= 0;
    const moving = canClimb && this.climbCheck(dir);
    const dotc = this.climbDir && ml > 1e-3 ? dir[0] * this.climbDir[0] + dir[2] * this.climbDir[2] : 0;
    const holding = !moving && canClimb && !this.grounded && this.state === STATES.climb && this.climbDir && (ml <= 1e-3 || dotc <= 0.5) && this.climbCheck(this.climbDir);
    const climbing = moving || holding;
    let fell = false;
    let swimming = false;
    this.waterTop = null;
    if (!climbing && !platform && this.ph.terrainData) {
      const surf = waterSurface(this.ph.terrainData, this.pos[0], this.pos[1], this.pos[2]);
      if (surf !== null && surf - (this.pos[1] - 2.45) > (this.swimming ? 3.4 : 4.2)) {
        swimming = true;
        this.waterTop = surf;
      }
    }
    this.swimming = swimming;
    if (holding) {
      this.vel[1] = dotc < -0.5 ? -ws * 0.7 : 0;
      this.vel[0] = ml > 1e-3 ? (dir[0] - this.climbDir[0] * dotc) * ws * 0.7 : 0;
      this.vel[2] = ml > 1e-3 ? (dir[2] - this.climbDir[2] * dotc) * ws * 0.7 : 0;
      this.state = STATES.climb;
    } else if (climbing) {
      this.vel[1] = ws * 0.7;
      this.state = STATES.climb;
      this.climbDir = dir;
    } else if (this.state === STATES.climb && ml > 1e-3 && !platform && this.climbDir && dir[0] * this.climbDir[0] + dir[2] * this.climbDir[2] > 0.5) {
      const ledgeHop = this.ledgeTop !== undefined;
      const rise = ledgeHop ? Math.min(2.4, Math.max(0.3, this.ledgeTop - (this.pos[1] - 2.5) + 0.2)) : 2.4;
      const up = Math.sqrt(2 * this.ph.gravity * rise);
      this.vel[1] = ledgeHop ? up : Math.max(this.vel[1], up);
      this.ledgeTop = undefined;
    } else if (swimming) {
      const surf = this.waterTop;
      const target = surf - (wantJump ? 0.9 : 1.5);
      const lim = ws * 0.6;
      const want = Math.max(-lim, Math.min(lim, (target - this.pos[1]) * 4));
      this.vel[1] += (want - this.vel[1]) * Math.min(1, dt * 6);
      this.vel[0] *= 0.8;
      this.vel[2] *= 0.8;
      this.jumped = false;
      this.jumpHeldFor = 0;
    } else {
      this.vel[1] -= (this.ph.gravity - this.bodyLift(dt)) * dt;
      fell = true;
      this.jumpCooldown = Math.max(0, this.jumpCooldown - dt);
      const e18 = hum.dm && hum.dm.era === 2018;
      const footing = e18 ? (this.grounded && this.feetOnGround()) || (!this.jumped && (this.sinceGround || 0) < 0.12) : this.grounded || (!this.jumped && (this.sinceGround || 0) < 0.12);
      if (footing && wantJump && (e18 || this.landedFor > LANDED_DELAY) && this.jumpCooldown <= 0 && this.vel[1] <= 0) {
        this.vel[1] = (hum.props.get('JumpPower') || 50) - this.ph.gravity * dt;
        this.grounded = false;
        this.jumped = true;
        this.landedFor = 0;
        this.jumpCooldown = e18 ? 0.08 : 0.35;
        this.jumpHeldFor = 0;
      }
    }
    const bv = platform ? null : this.characterMover();
    if (bv) {
      const tv = bv.props.get('Velocity') || [0, 0, 0], mf = bv.props.get('MaxForce') || [0, 0, 0];
      for (let k = 0; k < 3; k++) {
        if (!(mf[k] > 0)) continue;
        const acc = (mf[k] / CHARACTER_MASS) * dt;
        this.vel[k] += Math.max(-acc, Math.min(acc, tv[k] - this.vel[k]));
      }
      if (this.vel[1] > 0) this.grounded = false;
    }
    const settle = this.grounded && this.vel[1] <= 0 && !climbing && !swimming;
    const sep = this.separate(dt);
    const wallHold = moving && this.ledgeTop !== undefined;
    const desired = { x: (wallHold ? 0 : this.vel[0] * dt) + sep[0], y: settle ? 0 : (this.vel[1] + (fell ? 0.5 * this.ph.gravity * dt : 0)) * dt, z: (wallHold ? 0 : this.vel[2] * dt) + sep[1] };
    this.kcc.computeColliderMovement(this.collider, desired, this.R.QueryFilterFlags.EXCLUDE_SENSORS, undefined, this.filter());
    const mvd = this.kcc.computedMovement();
    let grounded = this.kcc.computedGrounded();
    this.pos = [this.pos[0] + mvd.x, this.pos[1] + mvd.y, this.pos[2] + mvd.z];
    if (settle && this.groundClamp()) grounded = true;
    this.body.setNextKinematicTranslation({ x: this.pos[0], y: this.pos[1], z: this.pos[2] });
    if (grounded && this.vel[1] <= 0) this.vel[1] = 0;
    if (!grounded && mvd.y > desired.y + 1e-4 && this.vel[1] < 0) this.vel[1] = Math.max(this.vel[1], mvd.y / dt);
    if (this.vel[1] > 0 && mvd.y < desired.y - 1e-4) this.vel[1] = 0;
    this.grounded = grounded;
    if (grounded && this.vel[1] <= 0 && (!this.jumped || !(hum.dm && hum.dm.era === 2018) || this.feetOnGround())) {
      this.sinceGround = 0;
      this.jumped = false;
    } else this.sinceGround = (this.sinceGround || 0) + dt;
    this.airFor = grounded && this.vel[1] <= 0 ? 0 : (this.airFor || 0) + dt;
    this.landedFor = grounded && this.vel[1] <= 0 ? this.landedFor + dt : this.airFor > 0.15 || this.jumped ? 0 : this.landedFor;
    if (swimming) this.state = STATES.swim;
    else if (!climbing) {
      if (grounded) this.state = ml > 1e-3 && speed > 0 ? STATES.walk : STATES.idle;
      else this.state = this.vel[1] > 0 ? STATES.jump : STATES.fall;
    }
    if (platform) this.state = STATES.stand;
    const face = input.face;
    if (climbing && this.climbDir && !platform) {
      this.yawCF = C.lookAt(0, 0, 0, this.climbDir[0], 0, this.climbDir[2]);
    } else if (face && Math.hypot(face[0], face[2]) > 1e-3 && !platform) {
      this.yawCF = C.lookAt(0, 0, 0, face[0], 0, face[2]);
    } else if (hum.props.get('AutoRotate') && ml > 1e-3 && !platform) {
      const target = C.lookAt(0, 0, 0, dir[0], 0, dir[2]);
      this.yawCF = C.lerp(C.rotOnly(this.yawCF), target, Math.min(1, dt * 12));
    }
    this.turnBox();
    let drop = 0;
    if (this.era2018() && grounded && this.vel[1] <= 0 && !climbing && !platform && !swimming) {
      const hit = this.ph.raycast([this.pos[0], this.pos[1] - 1, this.pos[2]], [0, -4, 0], [this.model], (q) => q.props.get('CanCollide'));
      if (hit.part && hit.part.ClassName === 'Terrain' && hit.normal[1] > 0.5) {
        const gap = this.pos[1] - 2.49 - hit.point[1];
        if (gap > 0.02 && gap < 1.6) drop = gap;
      }
    }
    this.drop = (this.drop || 0) + (drop - (this.drop || 0)) * Math.min(1, dt * 15);
    if (this.drop < 0.005) this.drop = 0;
    const cf = C.withPos(this.yawCF, this.pos[0], this.pos[1] + this.off - this.drop, this.pos[2]);
    return { cf, vel: [mvd.x / dt, mvd.y / dt, mvd.z / dt], state: this.state };
  }
}

export class CharacterProxy {
  constructor(physics, model, opts = {}) {
    this.ph = physics;
    this.model = model;
    this.R = physics.R;
    const torso = rootOf(model);
    const t0 = torso ? torso.props.get('CFrame') : C.cf();
    const q0 = C.toQuat(t0);
    this.body = physics.world.createRigidBody(this.R.RigidBodyDesc.kinematicPositionBased().setTranslation(t0[0], t0[1], t0[2]).setRotation({ x: q0[0], y: q0[1], z: q0[2], w: q0[3] }));
    this.limbs = new Map();
    this.solid = null;
    this.sensors = opts.sensors !== false;
    this.blocking = opts.blocking !== false;
    this.refresh();
  }

  refresh() {
    const w = this.ph.world;
    for (const [, c] of this.limbs) {
      this.ph.byHandle.delete(c.handle);
      w.removeCollider(c, false);
    }
    this.limbs.clear();
    if (this.solid) {
      this.ph.byHandle.delete(this.solid.handle);
      w.removeCollider(this.solid, false);
      this.solid = null;
    }
    const torso = rootOf(this.model);
    if (!torso) return;
    if (this.blocking) {
      this.solid = w.createCollider(this.R.ColliderDesc.cylinder(2.45, 0.9).setTranslation(0, -0.5, 0).setEnabled(!this.seated).setActiveHooks(this.R.ActiveHooks.FILTER_CONTACT_PAIRS), this.body);
      this.ph.byHandle.set(this.solid.handle, { part: torso, noRay: true, character: this.model, solidProxy: true });
    }
    const bt = this.body.translation(), br = this.body.rotation();
    const inv = C.inv(C.fromQuat(bt.x, bt.y, bt.z, br.x, br.y, br.z, br.w));
    for (const p of this.model.descendants()) {
      if (!p.isA('BasePart')) continue;
      const s = p.props.get('Size');
      const pad = this.sensors ? 0.12 : 0;
      const local = C.mul(inv, p.props.get('CFrame'));
      const lq = C.toQuat(local);
      const d = this.R.ColliderDesc.cuboid(s[0] / 2 + pad, s[1] / 2 + pad, s[2] / 2 + pad)
        .setTranslation(local[0], local[1], local[2])
        .setRotation({ x: lq[0], y: lq[1], z: lq[2], w: lq[3] })
        .setSensor(true)
        .setActiveCollisionTypes(this.R.ActiveCollisionTypes.ALL);
      if (this.sensors) d.setActiveEvents(this.R.ActiveEvents.COLLISION_EVENTS);
      const c = w.createCollider(d, this.body);
      this.limbs.set(p, c);
      this.ph.byHandle.set(c.handle, { part: p, character: this.model, sensorOnly: true });
    }
  }

  setSeated(on) {
    this.seated = !!on;
    if (this.solid) this.solid.setEnabled(!on);
  }

  update(torsoCF, poses) {
    const q = C.toQuat(torsoCF);
    this.body.setNextKinematicTranslation({ x: torsoCF[0], y: torsoCF[1], z: torsoCF[2] });
    this.body.setNextKinematicRotation({ x: q[0], y: q[1], z: q[2], w: q[3] });
    const inv = C.inv(torsoCF);
    for (const [p, c] of this.limbs) {
      const cf = poses ? poses.get(p) || p.props.get('CFrame') : p.props.get('CFrame');
      const local = C.mul(inv, cf);
      const lq = C.toQuat(local);
      c.setTranslationWrtParent({ x: local[0], y: local[1], z: local[2] });
      c.setRotationWrtParent({ x: lq[0], y: lq[1], z: lq[2], w: lq[3] });
    }
  }

  destroy() {
    const w = this.ph.world;
    for (const [, c] of this.limbs) this.ph.byHandle.delete(c.handle);
    if (this.solid) this.ph.byHandle.delete(this.solid.handle);
    w.removeRigidBody(this.body);
    this.limbs.clear();
  }
}

export const R15_COLORS = {
  Head: 'HeadColor', UpperTorso: 'TorsoColor', LowerTorso: 'TorsoColor',
  LeftUpperArm: 'LeftArmColor', LeftLowerArm: 'LeftArmColor', LeftHand: 'LeftArmColor',
  RightUpperArm: 'RightArmColor', RightLowerArm: 'RightArmColor', RightHand: 'RightArmColor',
  LeftUpperLeg: 'LeftLegColor', LeftLowerLeg: 'LeftLegColor', LeftFoot: 'LeftLegColor',
  RightUpperLeg: 'RightLegColor', RightLowerLeg: 'RightLegColor', RightFoot: 'RightLegColor',
};

export function partColorProps(model) {
  const bc = model.findChildOfClass('BodyColors');
  if (!bc) return;
  for (const [name, info] of Object.entries(R6.parts)) {
    const p = model.findChild(name);
    if (p && p.isA('BasePart')) p.dm.setProp(p, 'BrickColor', bc.props.get(info.color));
  }
  if (model.findChild('Torso')) return;
  for (const [name, prop] of Object.entries(R15_COLORS)) {
    const p = model.findChild(name);
    if (!p || !p.isA('BasePart')) continue;
    const c3 = bc.props.get(prop + '3');
    if (Array.isArray(c3) && p.info.all.has('Color')) p.dm.setProp(p, 'Color', c3.slice());
    else p.dm.setProp(p, 'BrickColor', bc.props.get(prop));
  }
}

const rigScales = new WeakMap();

export function r15ScaleOf(model) {
  return rigScales.get(model) || null;
}

function scaleRig(dm, model, hum, sc) {
  const body = [sc.width, sc.height, sc.depth];
  const head = [sc.head, sc.head, sc.head];
  const kOf = (p) => (p && p.props.get('Name') === 'Head' ? head : body);
  const mulPos = (cf, k) => {
    const o = cf.slice();
    o[0] *= k[0];
    o[1] *= k[1];
    o[2] *= k[2];
    return o;
  };
  for (const p of model.children) {
    if (!p.isA('BasePart')) continue;
    const k = kOf(p);
    const sz = p.props.get('Size');
    p.props.set('Size', [sz[0] * k[0], sz[1] * k[1], sz[2] * k[2]]);
    for (const c of p.children) {
      if (c.ClassName === 'Attachment') c.props.set('CFrame', mulPos(c.props.get('CFrame'), k));
      else if (c.ClassName === 'SpecialMesh') {
        const ms = c.props.get('Scale') || [1, 1, 1];
        c.props.set('Scale', [ms[0] * k[0], ms[1] * k[1], ms[2] * k[2]]);
        const off = c.props.get('Offset');
        if (off) c.props.set('Offset', [off[0] * k[0], off[1] * k[1], off[2] * k[2]]);
      } else if (c.isA('JointInstance')) {
        const p0 = c.props.get('Part0'), p1 = c.props.get('Part1');
        if (c.props.get('C0')) c.props.set('C0', mulPos(c.props.get('C0'), kOf(p0)));
        if (c.props.get('C1')) c.props.set('C1', mulPos(c.props.get('C1'), kOf(p1)));
      }
    }
  }
  if (hum) {
    hum.props.set('HipHeight', (+hum.props.get('HipHeight') || 2) * sc.height);
    for (const [n, v] of [['BodyHeightScale', sc.height], ['BodyWidthScale', sc.width], ['BodyDepthScale', sc.depth], ['HeadScale', sc.head]]) {
      let nv = hum.findChild(n);
      if (!nv || nv.ClassName !== 'NumberValue') {
        nv = dm.create('NumberValue', hum);
        nv.props.set('Name', n);
      }
      nv.props.set('Value', v);
    }
  }
  rigScales.set(model, sc);
}

export function applyR15Package(dm, model, parts) {
  let changed = false;
  for (const src of parts || []) {
    const name = src.props.get('Name');
    const tgt = model.findChild(name);
    if (!tgt || !tgt.isA('BasePart') || name === 'HumanoidRootPart' || name === 'Head' || !src.isA('BasePart')) continue;
    for (const k of ['MeshId', 'TextureID']) if (tgt.info.all.has(k)) tgt.props.set(k, src.props.get(k) || '');
    const size = src.props.get('Size');
    if (Array.isArray(size)) tgt.props.set('Size', size.slice());
    const init = src.info.all.has('InitialSize') ? src.props.get('InitialSize') : null;
    if (tgt.info.all.has('InitialSize')) tgt.props.set('InitialSize', (Array.isArray(init) ? init : size).slice());
    for (const a of src.children) {
      if (a.ClassName !== 'Attachment') continue;
      const an = a.props.get('Name');
      let t = tgt.children.find((c) => c.ClassName === 'Attachment' && c.props.get('Name') === an);
      if (!t) {
        t = dm.create('Attachment', tgt);
        t.props.set('Name', an);
      }
      t.props.set('CFrame', a.props.get('CFrame').slice());
    }
    changed = true;
  }
  if (!changed) return false;
  const att = (p, n) => p && p.children.find((c) => c.ClassName === 'Attachment' && c.props.get('Name') === n);
  for (const j of model.descendants()) {
    if (j.ClassName !== 'Motor6D') continue;
    const n = j.props.get('Name') + 'RigAttachment';
    const a0 = att(j.props.get('Part0'), n), a1 = att(j.props.get('Part1'), n);
    if (a0 && a1) {
      j.props.set('C0', a0.props.get('CFrame').slice());
      j.props.set('C1', a1.props.get('CFrame').slice());
    }
  }
  const hum = model.findChildOfClass('Humanoid');
  const root = model.findChild('HumanoidRootPart');
  if (hum && root) {
    const joint = (p1) => model.descendants().find((d) => d.ClassName === 'Motor6D' && d.props.get('Part1') === p1);
    let lowest = Infinity;
    for (const foot of ['LeftFoot', 'RightFoot']) {
      const chain = [];
      for (let p = model.findChild(foot); p && p !== root; ) {
        const j = joint(p);
        if (!j) break;
        chain.unshift(j);
        p = j.props.get('Part0');
      }
      if (!chain.length || chain[0].props.get('Part0') !== root) continue;
      let cf = C.cf(0, 0, 0);
      for (const j of chain) cf = C.mul(C.mul(cf, j.props.get('C0')), C.inv(j.props.get('C1')));
      const fp = model.findChild(foot);
      lowest = Math.min(lowest, cf[1] - fp.props.get('Size')[1] / 2);
    }
    if (Number.isFinite(lowest)) hum.props.set('HipHeight', Math.max(0.5, -lowest - root.props.get('Size')[1] / 2));
  }
  return true;
}

export function buildR15(dm, template, name, at, scale, pkg = null) {
  const [model] = dm.load([template], null);
  model.props.set('Name', name);
  const root = model.findChild('HumanoidRootPart');
  const hum = model.findChildOfClass('Humanoid');
  if (pkg && pkg.length) applyR15Package(dm, model, pkg);
  if (scale && ['height', 'width', 'depth', 'head'].some((k) => Number.isFinite(scale[k]) && Math.abs(scale[k] - 1) > 1e-4)) scaleRig(dm, model, hum, { height: 1, width: 1, depth: 1, head: 1, ...scale });
  const hip = hum ? +hum.props.get('HipHeight') || 1.35 : 1.35;
  const rc = root.props.get('CFrame');
  const target = [at[0], at[1] - 3 + hip + root.props.get('Size')[1] / 2, at[2]];
  const d = [target[0] - rc[0], target[1] - rc[1], target[2] - rc[2]];
  for (const p of model.descendants()) {
    if (!p.isA('BasePart')) continue;
    const cf = p.props.get('CFrame').slice();
    cf[0] += d[0];
    cf[1] += d[1];
    cf[2] += d[2];
    p.props.set('CFrame', cf);
    p.props.set('Locked', true);
  }
  for (const v of model.descendants()) if (v.ClassName === 'Vector3Value' && v.props.get('Name') === 'OriginalSize') dm.destroy(v);
  model.props.set('PrimaryPart', root);
  if (hum && hum.info.all.has('RigType')) hum.props.set('RigType', 1);
  return { model, humanoid: hum };
}

export function buildCharacter(dm, name, at, opts = {}) {
  const model = dm.create('Model', null);
  model.props.set('Name', name);
  const base = C.cf(at[0], at[1], at[2]);
  const parts = {};
  for (const [pn, info] of Object.entries(R6.parts)) {
    const p = dm.create('Part', model);
    p.props.set('Name', pn);
    p.props.set('Size', info.size.slice());
    p.props.set('FormFactor', 0);
    p.props.set('CFrame', C.mul(base, C.cf(info.at[0], info.at[1] - 3, info.at[2])));
    p.props.set('BrickColor', pn === 'Torso' ? 23 : pn.includes('Leg') ? 119 : 24);
    p.props.set('Locked', true);
    for (const s of ['Top', 'Bottom', 'Left', 'Right', 'Front', 'Back']) p.props.set(s + 'Surface', 0);
    if (pn !== 'Head') p.props.set('TopSurface', 3);
    p.props.set('BottomSurface', 4);
    if (pn === 'Torso') {
      p.props.set('LeftSurface', 2);
      p.props.set('RightSurface', 2);
    }
    parts[pn] = p;
  }
  const head = parts.Head;
  const mesh = dm.create('SpecialMesh', head);
  mesh.props.set('Name', 'Mesh');
  mesh.props.set('MeshType', 0);
  mesh.props.set('Scale', [1.25, 1.25, 1.25]);
  const face = dm.create('Decal', head);
  face.props.set('Name', 'face');
  face.props.set('Face', 5);
  face.props.set('Texture', 'rbxasset://textures/face.png');
  for (const j of R6.joints) {
    const m = dm.create('Motor6D', parts.Torso);
    m.props.set('Name', j.name);
    m.props.set('Part0', parts.Torso);
    m.props.set('Part1', parts[j.p1]);
    m.props.set('C0', j.c0.slice());
    m.props.set('C1', j.c1.slice());
    m.props.set('MaxVelocity', 0.1);
  }
  const hum = dm.create('Humanoid', model);
  hum.props.set('Name', 'Humanoid');
  model.props.set('PrimaryPart', head);
  if (opts.rootPart) {
    const root = dm.create('Part', null);
    root.props.set('Name', 'HumanoidRootPart');
    root.props.set('Size', [2, 2, 1]);
    root.props.set('FormFactor', 0);
    root.props.set('Transparency', 1);
    root.props.set('CanCollide', false);
    root.props.set('Locked', true);
    root.props.set('CFrame', parts.Torso.props.get('CFrame').slice());
    for (const s of ['Top', 'Bottom', 'Left', 'Right', 'Front', 'Back']) root.props.set(s + 'Surface', 0);
    dm.setParent(root, model);
    const rj = dm.create('Motor6D', root);
    const r = [0, 0, 0, -1, 0, 0, 0, 0, 1, 0, 1, 0];
    rj.props.set('Name', 'RootJoint');
    rj.props.set('Part0', root);
    rj.props.set('Part1', parts.Torso);
    rj.props.set('C0', r.slice());
    rj.props.set('C1', r.slice());
    rj.props.set('MaxVelocity', 0.1);
    parts.HumanoidRootPart = root;
    model.props.set('PrimaryPart', root);
  }
  return { model, parts, humanoid: hum };
}

function scaleHandle(model, handle, onHead) {
  const sc = rigScales.get(model);
  if (!sc) return;
  const k = onHead ? sc.head : (sc.width + sc.height + sc.depth) / 3;
  if (Math.abs(k - 1) < 1e-4) return;
  const sz = handle.props.get('Size');
  handle.props.set('Size', [sz[0] * k, sz[1] * k, sz[2] * k]);
  for (const c of handle.children) {
    if (c.ClassName === 'Attachment') {
      const cf = c.props.get('CFrame').slice();
      cf[0] *= k;
      cf[1] *= k;
      cf[2] *= k;
      c.props.set('CFrame', cf);
    } else if (c.isA('DataModelMesh')) {
      const ms = c.props.get('Scale') || [1, 1, 1];
      c.props.set('Scale', [ms[0] * k, ms[1] * k, ms[2] * k]);
      const off = c.props.get('Offset');
      if (off) c.props.set('Offset', [off[0] * k, off[1] * k, off[2] * k]);
    }
  }
}

export function attachAccessory(dm, model, acc) {
  const head = model.findChild('Head');
  const handle = acc.findChild('Handle');
  if (!head || !handle || !handle.isA('BasePart')) return;
  for (const ha of handle.children) {
    if (ha.ClassName !== 'Attachment') continue;
    const name = ha.props.get('Name');
    let body = null;
    for (const p of model.children) if (p.isA('BasePart') && p !== handle) {
      body = p.children.find((c) => c.ClassName === 'Attachment' && c.props.get('Name') === name);
      if (body) break;
    }
    if (!body) continue;
    const part = body.parent;
    scaleHandle(model, handle, part.props.get('Name') === 'Head');
    const w = dm.create('Weld', handle);
    w.props.set('Name', 'AccessoryWeld');
    w.props.set('Part0', part);
    w.props.set('Part1', handle);
    w.props.set('C0', body.props.get('CFrame').slice());
    w.props.set('C1', ha.props.get('CFrame').slice());
    handle.props.set('CFrame', C.mul(C.mul(part.props.get('CFrame'), body.props.get('CFrame')), C.inv(ha.props.get('CFrame'))));
    handle.props.set('CanCollide', false);
    handle.props.set('Anchored', false);
    return;
  }
  scaleHandle(model, handle, true);
  const sc = rigScales.get(model);
  const hk = sc ? sc.head : 1;
  const ap = (acc.props.get('AttachmentPoint') || C.cf()).slice();
  ap[0] *= hk;
  ap[1] *= hk;
  ap[2] *= hk;
  const top = C.cf(0, 0.5 * hk, 0);
  const w = dm.create('Weld', handle);
  w.props.set('Name', 'HeadWeld');
  w.props.set('Part0', head);
  w.props.set('Part1', handle);
  w.props.set('C0', top);
  w.props.set('C1', ap.slice());
  handle.props.set('CFrame', C.mul(C.mul(head.props.get('CFrame'), top), C.inv(ap)));
  handle.props.set('CanCollide', false);
  handle.props.set('Anchored', false);
}

export function gripArm(model) {
  return model && model.findChild ? model.findChild('Right Arm') || model.findChild('RightHand') : null;
}

function gripC0(arm) {
  if (arm.props.get('Name') !== 'RightHand') return RIGHT_GRIP_C0.slice();
  const att = arm.findChild('RightGripAttachment');
  const cf = att && att.props.get('CFrame');
  return Array.isArray(cf) && cf.length === 12 ? cf.slice() : A(0, -0.15, 0, -PI / 2, 0, 0);
}

export function syncGrip(dm, tool) {
  const model = tool.parent;
  const handle = tool.findChild('Handle');
  const arm = gripArm(model);
  const w = arm && arm.findChild('RightGrip');
  if (!w || !handle || w.props.get('Part1') !== handle) return;
  dm.setProp(w, 'C1', gripOf(tool).slice());
}

export function gripWeld(dm, model, tool) {
  const arm = gripArm(model);
  const handle = tool.findChild('Handle');
  if (!arm || !handle || !handle.isA('BasePart')) return null;
  const old = arm.findChild('RightGrip');
  if (old) dm.destroy(old);
  const w = dm.create('Weld', null);
  w.props.set('Name', 'RightGrip');
  w.props.set('Part0', arm);
  w.props.set('Part1', handle);
  w.props.set('C0', gripC0(arm));
  w.props.set('C1', gripOf(tool).slice());
  for (const o of dm.observers) if (o.created) o.created(w);
  dm.setParent(w, arm);
  return w;
}
