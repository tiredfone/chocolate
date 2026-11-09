import * as THREE from 'three';
import { contentTexture } from './assets.js';

const D = Math.PI / 180;

export const SYSTEMS = {
  fire: { quota: 40, w: 5, h: 5, tex: 'textures/fire_0.png', blend: 'add', emitter: { type: 'point', angle: 18, rate: 35, ttl: [1, 1], vel: [2.33, 7], colour: [[0.94, 0.94, 0.94, 1], [0.94, 0.94, 0.94, 1]] }, rotator: { start: [0, 365], speed: [0, 100] }, scaler: -5 },
  smoke: { quota: 70, w: 1, h: 1, tex: 'textures/smoke.png', blend: 'alpha', addSigned: true, emitter: { type: 'box', size: [1, 1, 1], angle: 180, rate: 6, ttl: [4, 6], vel: [0, 0.1], colour: [[0.8, 0.8, 0.8, 0.3], [0.8, 0.8, 0.8, 0.3]] }, fader: [-0.11, -0.11, -0.11, -0.1], scaler: 1.5 },
  sparkles: { quota: 40, w: 0.8, h: 1, tex: 'textures/sparkle.png', blend: 'srcAlphaOne', emitter: { type: 'point', angle: 180, dir: [0, -1, 0], rate: 35, ttl: [1.1, 1.1], vel: [4, 8], colour: [[1, 1, 1, 1], [1, 1, 1, 1]] }, rotator: { start: [0, 360], speed: [0, 360] }, fader: [0, 0, 0, -1] },
  ffBeam: { quota: 40, w: 0.5, h: 2, tex: 'textures/glow.png', blend: 'srcAlphaOne', oriented: true, emitter: { type: 'ring', size: [5, 5], inner: 0.8, offset: [0, -2, 0], angle: 0, rate: 20, ttl: [2, 2], vel: [2, 5], colour: [[1, 1, 1, 0], [1, 1, 1, 0]] }, fader2: { a: [0, 0, 0, 1], b: [0, 0, 0, -1], change: 1 } },
  ffRadial: { quota: 6, w: 5, h: 5, tex: 'textures/glow.png', blend: 'srcAlphaOne', emitter: { type: 'point', angle: 18, rate: 2, ttl: [2, 2], vel: [0, 0.1], colour: [[1, 1, 1, 1], [1, 1, 1, 1]] }, rotator: { start: [0, 365], speed: [4, 100] }, scaler: 6, fader: [0, 0, 0, -0.5] },
  explosionPlume: { quota: 40, w: 6, h: 6, tex: 'textures/explosion.png', blend: 'add', emitter: { type: 'ellipsoid', size: [3, 3, 3], offset: [0, 6, 0], angle: 16, rate: 100, ttl: [1.5, 1.5], vel: [25, 38], duration: 0.2, colour: [[1, 0.4, 0.2, 1], [0.7, 0.2, 0.1, 0.6]] }, fader: [-0.9, -0.5, -0.3, -1], scaler: 13, rotator: { start: [100, 300], speed: [100, 200] } },
  explosionBase: { quota: 40, w: 20, h: 20, tex: 'textures/explosion.png', blend: 'add', emitter: { type: 'ellipsoid', size: [15, 15, 15], angle: 100, rate: 80, ttl: [1.5, 1.5], vel: [11, 16], duration: 0.2, colour: [[1, 0.4, 0.2, 1], [0.7, 0.2, 0.1, 0.6]] }, fader: [-0.9, -0.5, -0.3, -1], scaler: 5 },
  explosionSparks: { quota: 120, w: 3, h: 3, tex: 'textures/spark.png', blend: 'add', emitter: { type: 'point', angle: 120, rate: 900, ttl: [1.2, 1.2], vel: [30, 60], duration: 0.1, colour: [[1, 0.6, 0.4, 1], [1, 0.6, 0.4, 1]] }, fader: [-0.7, -0.6, -0.4, -0.7], scaler: -3 },
};

const VS = `
attribute vec3 iPos;
attribute vec2 iSize;
attribute float iRot;
attribute vec4 iColor;
varying vec2 vUv;
varying vec4 vColor;
void main() {
  vUv = uv;
  vColor = iColor;
  #ifdef ORIENTED
    vec3 up = vec3(0.0, 1.0, 0.0);
    vec3 toCam = cameraPosition - iPos;
    vec3 right = normalize(cross(up, toCam));
    vec3 wp = iPos + right * position.x * iSize.x + up * position.y * iSize.y;
    gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
  #else
    vec4 mv = viewMatrix * vec4(iPos, 1.0);
    float c = cos(iRot), s = sin(iRot);
    vec2 p = vec2(position.x * iSize.x, position.y * iSize.y);
    mv.xy += vec2(c * p.x - s * p.y, s * p.x + c * p.y);
    gl_Position = projectionMatrix * mv;
  #endif
}`;

const FS = `
uniform sampler2D map;
varying vec2 vUv;
varying vec4 vColor;
vec4 toGamma(vec4 c) {
  return vec4(mix(pow(c.rgb, vec3(0.41666)) * 1.055 - vec3(0.055), c.rgb * 12.92, vec3(lessThanEqual(c.rgb, vec3(0.0031308)))), c.a);
}
void main() {
  vec4 t = toGamma(texture2D(map, vUv));
  #ifdef ADD_SIGNED
    gl_FragColor = vec4(clamp(vColor.rgb + t.rgb - 0.5, 0.0, 1.0), t.a * vColor.a);
  #else
    gl_FragColor = t * vColor;
  #endif
}`;

export function preloadParticles() {
  for (const d of Object.values(SYSTEMS)) contentTexture(d.tex, { placeholder: 'rgba(0,0,0,0)' });
}

const rnd = (a, b) => a + Math.random() * (b - a);

function coneDir(dir, angle) {
  const a = Math.random() * angle * D;
  const phi = Math.random() * Math.PI * 2;
  const d = new THREE.Vector3(dir[0], dir[1], dir[2]).normalize();
  const t = Math.abs(d.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
  const u = new THREE.Vector3().crossVectors(d, t).normalize();
  const w = new THREE.Vector3().crossVectors(d, u);
  return d.multiplyScalar(Math.cos(a)).addScaledVector(u, Math.sin(a) * Math.cos(phi)).addScaledVector(w, Math.sin(a) * Math.sin(phi));
}

export class ParticleSystem2012 {
  constructor(scene, def, opts = {}) {
    this.scene = scene;
    this.def = def;
    this.sizeScale = opts.sizeScale || 1;
    this.velScale = opts.velScale || 1;
    this.tint = opts.tint || null;
    this.tint2 = opts.tint2 || null;
    this.alphaScale = opts.alphaScale === undefined ? 1 : opts.alphaScale;
    this.enabled = true;
    this.age = 0;
    this.acc = 0;
    this.parts = [];
    const n = def.quota;
    const plane = new THREE.PlaneGeometry(1, 1);
    const geo = new THREE.InstancedBufferGeometry();
    geo.index = plane.index;
    geo.setAttribute('position', plane.attributes.position);
    geo.setAttribute('uv', plane.attributes.uv);
    this.aPos = new THREE.InstancedBufferAttribute(new Float32Array(n * 3), 3);
    this.aSize = new THREE.InstancedBufferAttribute(new Float32Array(n * 2), 2);
    this.aRot = new THREE.InstancedBufferAttribute(new Float32Array(n), 1);
    this.aColor = new THREE.InstancedBufferAttribute(new Float32Array(n * 4), 4);
    for (const a of [this.aPos, this.aSize, this.aRot, this.aColor]) a.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('iPos', this.aPos);
    geo.setAttribute('iSize', this.aSize);
    geo.setAttribute('iRot', this.aRot);
    geo.setAttribute('iColor', this.aColor);
    geo.instanceCount = 0;
    const defines = {};
    if (def.oriented) defines.ORIENTED = '';
    if (def.addSigned) defines.ADD_SIGNED = '';
    const mat = new THREE.ShaderMaterial({
      vertexShader: VS, fragmentShader: FS, defines, transparent: true, depthWrite: false,
      uniforms: { map: { value: contentTexture(def.tex, { placeholder: 'rgba(0,0,0,0)' }) } },
    });
    if (def.blend === 'add') {
      mat.blending = THREE.CustomBlending;
      mat.blendSrc = THREE.OneFactor;
      mat.blendDst = THREE.OneFactor;
    } else if (def.blend === 'srcAlphaOne') mat.blending = THREE.AdditiveBlending;
    else mat.blending = THREE.NormalBlending;
    this.geo = geo;
    this.mat = mat;
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 5;
    scene.add(this.mesh);
  }

  get done() {
    const e = this.def.emitter;
    return !!e.duration && this.age > e.duration && !this.parts.length;
  }

  spawn(origin) {
    const e = this.def.emitter;
    const off = e.offset || [0, 0, 0];
    let x = 0, y = 0, z = 0;
    const s = this.sizeScale;
    if (e.type === 'box' || e.type === 'ellipsoid') {
      for (;;) {
        x = rnd(-0.5, 0.5); y = rnd(-0.5, 0.5); z = rnd(-0.5, 0.5);
        if (e.type === 'box' || x * x + y * y + z * z <= 0.25) break;
      }
      x *= e.size[0] * s; y *= e.size[1] * s; z *= e.size[2] * s;
    } else if (e.type === 'ring') {
      const a = Math.random() * Math.PI * 2;
      const r = rnd(e.inner, 1) * 0.5;
      x = Math.cos(a) * r * e.size[0] * s;
      z = Math.sin(a) * r * e.size[1] * s;
    }
    const dir = coneDir(e.dir || [0, 1, 0], e.angle);
    const v = rnd(e.vel[0], e.vel[1]) * this.velScale;
    const k = Math.random();
    const c0 = e.colour[0], c1 = e.colour[1];
    const col = [0, 1, 2, 3].map((i) => c0[i] + (c1[i] - c0[i]) * k);
    if (this.tint) for (let i = 0; i < 3; i++) col[i] *= this.tint[i];
    col[3] *= this.alphaScale;
    const r = this.def.rotator;
    this.parts.push({
      p: [origin[0] + (off[0] * s) + x, origin[1] + (off[1] * s) + y, origin[2] + (off[2] * s) + z],
      v: [dir.x * v, dir.y * v, dir.z * v],
      c: col,
      w: this.def.w * s,
      h: this.def.h * s,
      rot: r ? rnd(r.start[0], r.start[1]) * D : 0,
      spin: r ? rnd(r.speed[0], r.speed[1]) * D : 0,
      ttl: rnd(e.ttl[0], e.ttl[1]),
      life: 0,
    });
  }

  step(dt, origin) {
    const def = this.def, e = def.emitter;
    this.age += dt;
    const emitting = this.enabled && origin && (!e.duration || this.age <= e.duration);
    if (emitting) {
      this.acc += e.rate * dt;
      while (this.acc >= 1) {
        this.acc -= 1;
        if (this.parts.length < def.quota) this.spawn(origin);
      }
    }
    const out = [];
    for (const q of this.parts) {
      q.life += dt;
      if (q.life >= q.ttl) continue;
      q.p[0] += q.v[0] * dt; q.p[1] += q.v[1] * dt; q.p[2] += q.v[2] * dt;
      q.rot += q.spin * dt;
      const sc = (def.scaler || 0) * this.sizeScale * dt;
      q.w = Math.max(0, q.w + sc);
      q.h = Math.max(0, q.h + sc);
      let f = def.fader;
      if (def.fader2) f = q.ttl - q.life > def.fader2.change ? def.fader2.a : def.fader2.b;
      if (f) for (let i = 0; i < 4; i++) q.c[i] = Math.min(1, Math.max(0, q.c[i] + f[i] * dt));
      if (this.tint2 && this.tint) {
        const t = q.life / q.ttl;
        q.tc = [0, 1, 2].map((i) => q.c[i] * ((1 - t) + t * (this.tint2[i] / Math.max(0.01, this.tint[i]))));
      }
      out.push(q);
    }
    this.parts = out;
    const P = this.aPos.array, S = this.aSize.array, R = this.aRot.array, C = this.aColor.array;
    out.forEach((q, i) => {
      P[i * 3] = q.p[0]; P[i * 3 + 1] = q.p[1]; P[i * 3 + 2] = q.p[2];
      S[i * 2] = q.w; S[i * 2 + 1] = q.h;
      R[i] = q.rot;
      const c = q.tc || q.c;
      C[i * 4] = c[0]; C[i * 4 + 1] = c[1]; C[i * 4 + 2] = c[2]; C[i * 4 + 3] = q.c[3];
    });
    this.geo.instanceCount = out.length;
    for (const a of [this.aPos, this.aSize, this.aRot, this.aColor]) a.needsUpdate = true;
  }

  dispose() {
    this.scene.remove(this.mesh);
    this.geo.dispose();
    this.mat.dispose();
  }
}
