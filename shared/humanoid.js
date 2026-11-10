import * as C from './cframe.js';
import { GRAVITY } from './physics.js';

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
export const STATES = { idle: 0, walk: 1, jump: 2, fall: 3, sit: 4, climb: 5, dead: 6, stand: 7 };
export const STATE_NAMES = Object.fromEntries(Object.entries(STATES).map(([k, v]) => [v, k]));

export function liveCharacterOf(part) {
  for (let m = part.parent; m; m = m.parent) {
    if (m.ClassName === 'Model' || m.ClassName === 'Workspace') {
      if (m.ClassName === 'Workspace') return null;
      const h = m.findChildOfClass('Humanoid');
      if (h && m.findChild('Torso') && m.findChild('Head') && h.props.get('Health') > 0 && !(m.data && m.data.dead)) {
        const torso = m.findChild('Torso');
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
    const torso = m.findChild('Torso');
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
    if (!torso) return;
    const seen = new Set([torso]);
    const queue = [torso];
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
    const torso = model.findChild('Torso');
    const cf = torso.props.get('CFrame');
    this.vel = [0, 0, 0];
    this.state = STATES.fall;
    this.grounded = false;
    this.jumpHeld = false;
    this.yawCF = flatYaw(cf);
    this.body = world.createRigidBody(this.R.RigidBodyDesc.kinematicPositionBased().setTranslation(cf[0], cf[1] - 0.5, cf[2]));
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
    this.pos = [cf[0], cf[1] - 0.5, cf[2]];
  }

  destroy() {
    const w = this.ph.world;
    this.ph.byHandle.delete(this.collider.handle);
    w.removeCharacterController(this.kcc);
    w.removeRigidBody(this.body);
  }

  teleport(cf) {
    this.pos = [cf[0], cf[1] - 0.5, cf[2]];
    this.body.setTranslation({ x: this.pos[0], y: this.pos[1], z: this.pos[2] }, true);
    this.yawCF = flatYaw(cf);
    this.vel = [0, 0, 0];
  }

  filter() {
    const model = this.model;
    return (c) => {
      if (c.handle === this.collider.handle) return false;
      const rec = this.ph.byHandle.get(c.handle);
      if (!rec) return true;
      if (rec.character === model) return false;
      if (rec.part && (rec.part === model || rec.part.isDescendantOf(model))) return false;
      if (rec.sensorOnly) return false;
      if (rec.part && !rec.part.props.get('CanCollide')) return false;
      return true;
    };
  }

  climbCheck(dir) {
    if (Math.hypot(dir[0], dir[2]) < 0.1) return false;
    const origin = [this.pos[0], this.pos[1] - 1.5, this.pos[2]];
    for (const dy of [-0.8, 0, 1.5, 3]) {
      const o = [origin[0], origin[1] + dy, origin[2]];
      const r = this.ph.raycast(o, [dir[0] * 1.6, 0, dir[2] * 1.6], [this.model]);
      if (r.part && (r.part.ClassName === 'TrussPart' || this.ladderish(r.part))) return true;
    }
    return false;
  }

  ladderish(part) {
    return false;
  }

  unstick() {
    const R = this.R;
    const world = this.ph.world;
    const filter = this.filter();
    if (!this.probe) this.probe = { inner: new R.Cuboid(0.95, 2.4, 0.45), outer: new R.Cuboid(1, 2.45, 0.5) };
    const rot = { x: 0, y: 0, z: 0, w: 1 };
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

  update(dt, input) {
    const hum = this.hum;
    this.unstick();
    const ws = hum.props.get('WalkSpeed');
    const move = input.move || [0, 0, 0];
    const ml = Math.hypot(move[0], move[2]);
    const dir = ml > 1e-3 ? [move[0] / ml, 0, move[2] / ml] : [0, 0, 0];
    const platform = hum.props.get('PlatformStand');
    const speed = platform ? 0 : ws;
    this.vel[0] = dir[0] * speed;
    this.vel[2] = dir[2] * speed;
    if ((input.jump || hum.props.get('Jump')) && !platform) this.jumpHeldFor = 0.3;
    else this.jumpHeldFor = Math.max(0, (this.jumpHeldFor || 0) - dt);
    const wantJump = this.jumpHeldFor > 0 && !platform;
    if (hum.props.get('Jump')) hum.dm.setProp(hum, 'Jump', false, { local: true });
    const climbing = !platform && this.climbCheck(dir);
    if (climbing) {
      this.vel[1] = ws * 0.7;
      this.state = STATES.climb;
      this.climbDir = dir;
    } else if (this.state === STATES.climb && ml > 1e-3 && !platform && this.climbDir && dir[0] * this.climbDir[0] + dir[2] * this.climbDir[2] > 0.5) {
      this.vel[1] = Math.max(this.vel[1], Math.sqrt(2 * GRAVITY * 2.4));
    } else {
      this.vel[1] -= GRAVITY * dt;
      this.jumpCooldown = Math.max(0, this.jumpCooldown - dt);
      if (this.grounded && wantJump && this.landedFor > LANDED_DELAY && this.jumpCooldown <= 0 && this.vel[1] <= 0) {
        this.vel[1] = hum.props.get('JumpPower') || 50;
        this.grounded = false;
        this.landedFor = 0;
        this.jumpCooldown = 0.35;
        this.jumpHeldFor = 0;
      }
    }
    const desired = { x: this.vel[0] * dt, y: this.vel[1] * dt, z: this.vel[2] * dt };
    this.kcc.computeColliderMovement(this.collider, desired, this.R.QueryFilterFlags.EXCLUDE_SENSORS, undefined, this.filter());
    const mvd = this.kcc.computedMovement();
    const grounded = this.kcc.computedGrounded();
    this.pos = [this.pos[0] + mvd.x, this.pos[1] + mvd.y, this.pos[2] + mvd.z];
    this.body.setNextKinematicTranslation({ x: this.pos[0], y: this.pos[1], z: this.pos[2] });
    if (grounded && this.vel[1] <= 0) this.vel[1] = 0;
    if (!grounded && mvd.y > desired.y + 1e-4 && this.vel[1] < 0) this.vel[1] = Math.max(this.vel[1], mvd.y / dt);
    if (this.vel[1] > 0 && mvd.y < desired.y - 1e-4) this.vel[1] = 0;
    this.grounded = grounded;
    this.landedFor = grounded && this.vel[1] <= 0 ? this.landedFor + dt : 0;
    if (!climbing) {
      if (grounded) this.state = ml > 1e-3 && speed > 0 ? STATES.walk : STATES.idle;
      else this.state = this.vel[1] > 0 ? STATES.jump : STATES.fall;
    }
    if (platform) this.state = STATES.stand;
    const face = input.face;
    if (face && Math.hypot(face[0], face[2]) > 1e-3 && !platform) {
      this.yawCF = C.lookAt(0, 0, 0, face[0], 0, face[2]);
    } else if (hum.props.get('AutoRotate') && ml > 1e-3 && !platform) {
      const target = C.lookAt(0, 0, 0, dir[0], 0, dir[2]);
      this.yawCF = C.lerp(C.rotOnly(this.yawCF), target, Math.min(1, dt * 12));
    }
    const cf = C.withPos(this.yawCF, this.pos[0], this.pos[1] + 0.5, this.pos[2]);
    return { cf, vel: [mvd.x / dt, mvd.y / dt, mvd.z / dt], state: this.state };
  }
}

export class CharacterProxy {
  constructor(physics, model, opts = {}) {
    this.ph = physics;
    this.model = model;
    this.R = physics.R;
    const torso = model.findChild('Torso');
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
    const torso = this.model.findChild('Torso');
    if (!torso) return;
    if (this.blocking) {
      this.solid = w.createCollider(this.R.ColliderDesc.cuboid(1, 2.45, 0.5).setTranslation(0, -0.5, 0).setEnabled(!this.seated), this.body);
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

export function partColorProps(model) {
  const bc = model.findChildOfClass('BodyColors');
  if (!bc) return;
  for (const [name, info] of Object.entries(R6.parts)) {
    const p = model.findChild(name);
    if (p && p.isA('BasePart')) p.dm.setProp(p, 'BrickColor', bc.props.get(info.color));
  }
}

export function buildCharacter(dm, name, at) {
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
  return { model, parts, humanoid: hum };
}

export function attachAccessory(dm, model, acc) {
  const head = model.findChild('Head');
  const handle = acc.findChild('Handle');
  if (!head || !handle || !handle.isA('BasePart')) return;
  const ap = acc.props.get('AttachmentPoint') || C.cf();
  const w = dm.create('Weld', handle);
  w.props.set('Name', 'HeadWeld');
  w.props.set('Part0', head);
  w.props.set('Part1', handle);
  w.props.set('C0', C.cf(0, 0.5, 0));
  w.props.set('C1', ap.slice());
  handle.props.set('CFrame', C.mul(C.mul(head.props.get('CFrame'), C.cf(0, 0.5, 0)), C.inv(ap)));
  handle.props.set('CanCollide', false);
  handle.props.set('Anchored', false);
}

export function syncGrip(dm, tool) {
  const model = tool.parent;
  const handle = tool.findChild('Handle');
  const arm = model && model.findChild && model.findChild('Right Arm');
  const w = arm && arm.findChild('RightGrip');
  if (!w || !handle || w.props.get('Part1') !== handle) return;
  dm.setProp(w, 'C1', gripOf(tool).slice());
}

export function gripWeld(dm, model, tool) {
  const arm = model.findChild('Right Arm');
  const handle = tool.findChild('Handle');
  if (!arm || !handle || !handle.isA('BasePart')) return null;
  const old = arm.findChild('RightGrip');
  if (old) dm.destroy(old);
  const w = dm.create('Weld', null);
  w.props.set('Name', 'RightGrip');
  w.props.set('Part0', arm);
  w.props.set('Part1', handle);
  w.props.set('C0', RIGHT_GRIP_C0.slice());
  w.props.set('C1', gripOf(tool).slice());
  for (const o of dm.observers) if (o.created) o.created(w);
  dm.setParent(w, arm);
  return w;
}
