import * as THREE from 'three';
import { brick } from '../shared/brickcolor.js';
import { sunDirection } from '../shared/luahost.js';
import { loadTexture, loadMesh, loadImage, proceduralTexture, trussTexture, spriteTexture, contentTexture } from './assets.js';
import { Material2012, MATERIALS, LIGHTS, rawColor, texPosAttribute, applyLighting as light2012 } from './shade2012.js';
import { ParticleSystem2012, SYSTEMS, preloadParticles } from './particles2012.js';
import { CharacterAtlases, BODY_MESH } from './character2012.js';
import { contentMesh } from './assets.js';

const MATERIAL_KIND = {
  256: 'plastic', 272: 'smoothplastic', 288: 'neon', 512: 'wood', 528: 'woodplanks', 784: 'slate', 800: 'slate', 816: 'concrete', 832: 'granite',
  848: 'brick', 864: 'pebble', 880: 'cobblestone', 1040: 'corrodedmetal', 1056: 'diamondplate', 1072: 'foil', 1088: 'metal', 1280: 'grass',
  1296: 'sand', 1312: 'fabric', 1536: 'ice', 1568: 'glass',
};
const SURFACE_TEX = { 1: 'glue', 2: 'weld', 3: 'studs', 4: 'inlet', 5: 'universal' };
const SURFACE_ROW = { studs: 0, inlet: 1, weld: 2, glue: 3, universal: 4 };
const DEFAULT_SKY = ['rt', 'lf', 'up', 'dn', 'bk', 'ft'].map((f) => `rbxasset://sky/null_plainsky512_${f}.jpg`);

let studAtlas = null;
function studTexture() {
  if (!studAtlas) studAtlas = contentTexture('textures/surfacesAlpha.png', { placeholder: 'rgba(0,0,0,0)' });
  return studAtlas;
}

const matTextures = new Map();
function materialTexture(path) {
  let t = matTextures.get(path);
  if (!t) {
    t = contentTexture(path, { repeat: [1, 1], placeholder: '#808080' });
    matTextures.set(path, t);
  }
  return t;
}
const FACE_PROPS = ['RightSurface', 'LeftSurface', 'TopSurface', 'BottomSurface', 'BackSurface', 'FrontSurface'];
const LIMB_REGION = { Torso: 'torso', 'Right Arm': 'right', 'Left Arm': 'left', 'Right Leg': 'right', 'Left Leg': 'left' };

const tmpM = new THREE.Matrix4();

function srgb(r, g, b) {
  return new THREE.Color().setRGB(r, g, b, THREE.SRGBColorSpace);
}

export function applyCF(obj, cf) {
  tmpM.set(cf[3], cf[4], cf[5], cf[0], cf[6], cf[7], cf[8], cf[1], cf[9], cf[10], cf[11], cf[2], 0, 0, 0, 1);
  tmpM.decompose(obj.position, obj.quaternion, obj.scale);
  obj.scale.set(1, 1, 1);
}

function boxGeometry(sx, sy, sz) {
  const g = new THREE.BoxGeometry(sx, sy, sz);
  const uv = g.attributes.uv;
  const dims = [[sz, sy], [sz, sy], [sx, sz], [sx, sz], [sx, sy], [sx, sy]];
  for (let f = 0; f < 6; f++) for (let k = 0; k < 4; k++) {
    const i = f * 4 + k;
    uv.setXY(i, uv.getX(i) * dims[f][0], uv.getY(i) * dims[f][1]);
  }
  return g;
}

function wedgeGeometry(sx, sy, sz) {
  const hx = sx / 2, hy = sy / 2, hz = sz / 2;
  const P = {
    a: [-hx, -hy, -hz], b: [hx, -hy, -hz], c: [hx, -hy, hz], d: [-hx, -hy, hz], e: [-hx, hy, hz], f: [hx, hy, hz],
  };
  const tris = [];
  const quad = (p, q, r, s, w, h, group) => tris.push([p, q, r, w, h, group, [0, 0], [w, 0], [w, h]], [p, r, s, w, h, group, [0, 0], [w, h], [0, h]]);
  quad(P.a, P.d, P.c, P.b, sx, sz, 3);
  quad(P.d, P.e, P.f, P.c, sx, sy, 4);
  quad(P.a, P.b, P.f, P.e, sx, Math.hypot(sy, sz), 5);
  tris.push([P.a, P.e, P.d, 0, 0, 1, [0, 0], [sz, sy], [sz, 0]]);
  tris.push([P.b, P.c, P.f, 0, 0, 0, [0, 0], [sz, 0], [sz, sy]]);
  return trisToGeometry(tris);
}

function cornerWedgeGeometry(sx, sy, sz) {
  const hx = sx / 2, hy = sy / 2, hz = sz / 2;
  const a = [-hx, -hy, -hz], b = [hx, -hy, -hz], c = [hx, -hy, hz], d = [-hx, -hy, hz], t = [hx, hy, -hz];
  const tris = [
    [a, d, c, 0, 0, 3, [0, 0], [0, sz], [sx, sz]], [a, c, b, 0, 0, 3, [0, 0], [sx, sz], [sx, 0]],
    [b, c, t, 0, 0, 0, [0, 0], [sz, 0], [0, sy]], [a, b, t, 0, 0, 5, [0, 0], [sx, 0], [sx, sy]],
    [d, t, c, 0, 0, 4, [0, 0], [sx, sy], [sx, 0]], [a, t, d, 0, 0, 1, [0, 0], [sx, sy], [0, 0]],
  ];
  return trisToGeometry(tris);
}

function trisToGeometry(tris) {
  const pos = [], nrm = [], uv = [];
  const groups = new Map();
  tris.sort((x, y) => x[5] - y[5]);
  let idx = 0;
  for (const t of tris) {
    let [p, q, r] = t;
    let uq = t[7], ur = t[8];
    let u = [q[0] - p[0], q[1] - p[1], q[2] - p[2]], v = [r[0] - p[0], r[1] - p[1], r[2] - p[2]];
    let n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    const cx = p[0] + q[0] + r[0], cy = p[1] + q[1] + r[1], cz = p[2] + q[2] + r[2];
    if (n[0] * cx + n[1] * cy + n[2] * cz < 0) {
      [q, r] = [r, q];
      [uq, ur] = [ur, uq];
      n = n.map((x) => -x);
    }
    const l = Math.hypot(...n) || 1;
    for (const [vert, tuv] of [[p, t[6]], [q, uq], [r, ur]]) {
      pos.push(...vert);
      nrm.push(n[0] / l, n[1] / l, n[2] / l);
      uv.push(tuv[0], tuv[1]);
    }
    const gi = t[5];
    if (!groups.has(gi)) groups.set(gi, [idx, 0]);
    groups.get(gi)[1] += 3;
    idx += 3;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  for (const [gi, [start, count]] of groups) g.addGroup(start, count, gi);
  return g;
}

function headGeometry(w, h, d) {
  const pts = [];
  const r = 0.5, cap = 0.18, hh = 0.5;
  pts.push(new THREE.Vector2(0, -hh));
  for (let i = 0; i <= 6; i++) {
    const a = (i / 6) * (Math.PI / 2);
    pts.push(new THREE.Vector2(r - cap + Math.sin(a) * cap, -hh + cap - Math.cos(a) * cap));
  }
  for (let i = 0; i <= 6; i++) {
    const a = (i / 6) * (Math.PI / 2);
    pts.push(new THREE.Vector2(r - cap + Math.cos(a) * cap, hh - cap + Math.sin(a) * cap));
  }
  pts.push(new THREE.Vector2(0, hh));
  const g = new THREE.LatheGeometry(pts, 32);
  g.scale(w, h, d);
  return g;
}

function faceProjected(geo) {
  const g = geo.clone();
  const p = g.attributes.position;
  g.computeBoundingBox();
  const bb = g.boundingBox;
  const uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    if (z > (bb.min.z + bb.max.z) / 2 + (bb.max.z - bb.min.z) * 0.15) {
      uv[i * 2] = -4;
      uv[i * 2 + 1] = -4;
      continue;
    }
    uv[i * 2] = 1 - (x - bb.min.x) / (bb.max.x - bb.min.x);
    uv[i * 2 + 1] = (y - bb.min.y) / (bb.max.y - bb.min.y);
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return g;
}

const SKY_VS = `varying vec3 vDir; void main(){ vDir = normalize(position); vec4 p = projectionMatrix * modelViewMatrix * vec4(position,1.0); gl_Position = p.xyww; }`;
const SKY_FS = `uniform vec3 top; uniform vec3 horizon; uniform vec3 bottom; uniform vec3 sunDir; uniform float sunVis; varying vec3 vDir;
void main(){ vec3 d = normalize(vDir); float h = d.y; vec3 c = h > 0.0 ? mix(horizon, top, pow(clamp(h,0.0,1.0),0.55)) : mix(horizon, bottom, clamp(-h*3.0,0.0,1.0));
float s = max(dot(d, normalize(sunDir)), 0.0); c += vec3(1.0,0.95,0.8) * (pow(s, 900.0) * 1.6 + pow(s, 12.0) * 0.18) * sunVis; gl_FragColor = vec4(c, 1.0); }`;

export class Renderer {
  constructor(canvas, world) {
    this.world = world;
    this.dm = world.dm;
    this.canvas = canvas;
    const r = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
    r.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFShadowMap;
    this.r = r;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(70, 1, 0.1, 5000);
    this.visuals = new Map();
    this.materials = new Map();
    this.geoCache = new Map();
    this.smooth = new Set();
    this.effects = new Set();
    this.clothingDirty = new Set();
    this.hidden = new Set();
    this.localTransparency = new Map();
    this.buckets = new Map();
    this.bucketsDirty = new Set();
    this.setupLighting();
    preloadParticles();
    this.atlases = new CharacterAtlases(r);
    contentMesh('fonts/head.mesh').then((g) => {
      if (!g) return;
      g = g.clone();
      g.computeBoundingBox();
      const bb = g.boundingBox, c = bb.getCenter(new THREE.Vector3()), sz = bb.getSize(new THREE.Vector3());
      g.translate(-c.x, -c.y, -c.z);
      g.scale(1 / (sz.x || 1), 1 / (sz.y || 1), 1 / (sz.z || 1));
      this.headMesh = g;
      for (const v of [...this.visuals.values()]) {
        const m = v.part && v.part.children.find((c) => c.isA('DataModelMesh'));
        if (m && this.isHeadMesh(m)) this.rebuild(v.part);
      }
    });
    this.resize();
    window.addEventListener('resize', () => this.resize());
    this.dm.observe(this);
  }

  resize() {
    const w = this.canvas.clientWidth || window.innerWidth, h = this.canvas.clientHeight || window.innerHeight;
    this.r.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  setupLighting() {
    this.hemi = new THREE.HemisphereLight(0xffffff, 0x7f7f7f, 1.3);
    this.scene.add(this.hemi);
    this.ambient = new THREE.AmbientLight(0x808080, 0.6);
    this.scene.add(this.ambient);
    this.sun = new THREE.DirectionalLight(0xffffff, 1.9);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const sc = this.sun.shadow.camera;
    sc.left = -90; sc.right = 90; sc.top = 90; sc.bottom = -90; sc.near = 1; sc.far = 600;
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.14;
    this.scene.add(this.sun);
    this.scene.add(this.sun.target);
    this.skyMat = new THREE.ShaderMaterial({
      vertexShader: SKY_VS, fragmentShader: SKY_FS, side: THREE.BackSide, depthWrite: false,
      uniforms: { top: { value: new THREE.Color(0.34, 0.6, 0.95) }, horizon: { value: new THREE.Color(0.78, 0.88, 0.98) }, bottom: { value: new THREE.Color(0.55, 0.55, 0.55) }, sunDir: { value: new THREE.Vector3(0.4, 0.8, 0.3) }, sunVis: { value: 1 } },
    });
    this.skyDome = new THREE.Mesh(new THREE.SphereGeometry(2000, 32, 16), this.skyMat);
    this.skyDome.renderOrder = -10;
    this.skyDome.frustumCulled = false;
    this.scene.add(this.skyDome);
    this.scene.fog = null;
  }

  applyLighting() {
    const L = this.dm.services.get('Lighting');
    if (!L) return;
    const dir = sunDirection(L);
    const ambient = L.props.get('Ambient');
    const bright = L.props.get('Brightness');
    const up = Math.max(0, dir[1]);
    const day = Math.min(1, Math.max(0, dir[1] * 4 + 0.35));
    this.ambient.color.copy(srgb(ambient[0], ambient[1], ambient[2]));
    this.ambient.intensity = 0.55 + 0.25 * day;
    const top = L.props.get('ColorShift_Top');
    const bot = L.props.get('ColorShift_Bottom');
    this.hemi.color.copy(srgb(0.85 + top[0] * 0.3, 0.85 + top[1] * 0.3, 0.85 + top[2] * 0.3));
    this.hemi.groundColor.copy(srgb(0.45 + bot[0] * 0.5, 0.45 + bot[1] * 0.5, 0.45 + bot[2] * 0.5));
    this.hemi.intensity = 0.35 + 0.95 * day;
    this.sun.intensity = (0.2 + 1.7 * Math.min(1, up * 3)) * bright * day;
    this.sun.color.copy(srgb(1, 0.92 + 0.08 * up, 0.82 + 0.18 * up));
    this.sunDir = dir;
    light2012(L, dir);
    this.updateSunSprite(dir);
    const sky = this.skyMat.uniforms;
    sky.sunDir.value.set(dir[0], dir[1], dir[2]);
    sky.top.value.copy(srgb(0.36 * day + 0.02, 0.6 * day + 0.03, 0.95 * day + 0.08));
    sky.horizon.value.copy(srgb(0.8 * day + 0.05, 0.88 * day + 0.06, 0.98 * day + 0.12));
    sky.sunVis.value = day;
    const fs = L.props.get('FogStart'), fe = L.props.get('FogEnd');
    if (fe < 5000) {
      const fc = L.props.get('FogColor');
      this.scene.fog = new THREE.Fog(rawColor(fc[0], fc[1], fc[2]), fs, fe);
    } else this.scene.fog = null;
    this.applySky(L);
  }

  applySky(L) {
    const sky = L.findChildOfClass('Sky');
    const urls = ['SkyboxRt', 'SkyboxLf', 'SkyboxUp', 'SkyboxDn', 'SkyboxBk', 'SkyboxFt'].map((k, i) => (sky && sky.props.get(k)) || DEFAULT_SKY[i]);
    const key = urls.join('|');
    if (key === this.skyKey) return;
    this.skyKey = key;
    Promise.all(urls.map((u, i) => loadImage(u).then((img) => img || (u === DEFAULT_SKY[i] ? null : loadImage(DEFAULT_SKY[i]))))).then((imgs) => {
      if (this.skyKey !== key || imgs.some((i) => !i)) return;
      const cube = new THREE.CubeTexture(imgs.map((im) => {
        const c = document.createElement('canvas');
        c.width = im.width;
        c.height = im.height;
        const g = c.getContext('2d');
        g.translate(0, c.height);
        g.scale(1, -1);
        g.drawImage(im, 0, 0);
        return c;
      }));
      cube.colorSpace = THREE.SRGBColorSpace;
      cube.needsUpdate = true;
      this.scene.background = cube;
      LIGHTS.envMap.value = cube;
      this.skyDome.visible = false;
    });
  }

  updateSunSprite(dir) {
    if (!this.sunSprite) {
      const mat = new THREE.SpriteMaterial({ map: contentTexture('sky/sun.jpg', { placeholder: '#000' }), blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
      this.sunSprite = new THREE.Sprite(mat);
      this.sunSprite.scale.setScalar(260);
      this.sunSprite.renderOrder = -5;
      this.sunSprite.frustumCulled = false;
      this.scene.add(this.sunSprite);
      const mm = new THREE.SpriteMaterial({ map: contentTexture('sky/moon.jpg', { placeholder: '#000' }), alphaMap: contentTexture('sky/moon-alpha.jpg', { placeholder: '#000' }), transparent: true, depthWrite: false, fog: false });
      this.moonSprite = new THREE.Sprite(mm);
      this.moonSprite.scale.setScalar(110);
      this.moonSprite.renderOrder = -5;
      this.moonSprite.frustumCulled = false;
      this.scene.add(this.moonSprite);
    }
    this.sunSprite.userData.dir = dir;
    this.sunSprite.visible = dir[1] > -0.1;
    this.moonSprite.visible = dir[1] < 0.1;
  }

  material(part, face) {
    const b = part.props.get('BrickColor');
    const mat = part.props.get('Material');
    const transp = this.localTransparency.has(part) ? this.localTransparency.get(part) : part.props.get('Transparency');
    const refl = part.props.get('Reflectance');
    let kind = MATERIAL_KIND[mat] || 'plastic';
    const surf = face >= 0 ? part.props.get(FACE_PROPS[face]) | 0 : 0;
    if (part.ClassName === 'TrussPart') kind = 'truss';
    const key = `${b}|${kind}|${surf}|${transp.toFixed(2)}|${refl.toFixed(2)}`;
    let m = this.materials.get(key);
    if (m) return m;
    const c = brick(b);
    const def = MATERIALS[kind] || MATERIALS.plastic;
    const opts = { color: rawColor(c.r, c.g, c.b), ks: def.ks, exp: def.exp, refl, neon: def.neon };
    if (transp > 0) {
      opts.transparent = true;
      opts.opacity = 1 - transp;
      opts.depthWrite = transp < 0.5;
    }
    if (kind === 'truss') {
      opts.side = THREE.DoubleSide;
      opts.cutoff = 0.5;
    }
    m = new Material2012(opts);
    if (kind === 'truss') m.map = trussTexture();
    if (def.tex) m.setMaterialTexture(materialTexture(def.tex), def);
    const st = SURFACE_TEX[surf];
    if (st && kind !== 'truss' && kind !== 'neon') m.setStuds(studTexture(), SURFACE_ROW[st]);
    this.materials.set(key, m);
    return m;
  }

  partMaterials(part) {
    return [0, 1, 2, 3, 4, 5].map((f) => this.material(part, f));
  }

  inWorld(inst) {
    const ws = this.dm.services.get('Workspace');
    return !!ws && inst.isDescendantOf(ws);
  }

  reparented(inst) {
    const inside = this.inWorld(inst);
    const list = [inst, ...inst.descendants()];
    for (const x of list) {
      if (inside) this.add(x);
      else this.remove(x);
    }
    if (inside && inst.parent) this.touchParent(inst);
    else if (!inside) for (const v of this.visuals.values()) if (v.part && (v.decalSrc === inst || v.meshSrc === inst)) this.rebuild(v.part);
    if (inst.ClassName === 'Sky' || (inst.parent && inst.parent.ClassName === 'Lighting')) this.applyLighting();
    if (['Shirt', 'Pants', 'ShirtGraphic', 'BodyColors'].includes(inst.ClassName)) for (const v of this.visuals.values()) if (v.part && v.part.parent) this.clothingDirty.add(v.part.parent);
  }

  destroyed(inst) {
    this.remove(inst);
  }

  touchParent(inst) {
    const p = inst.parent;
    if (!p) return;
    if (inst.isA('DataModelMesh') || inst.isA('Decal') || ['Fire', 'Smoke', 'Sparkles', 'PointLight', 'SpotLight', 'SurfaceLight'].includes(inst.ClassName)) {
      if (p.isA('BasePart')) this.rebuild(p);
    }
    if (inst.ClassName === 'ForceField' || inst.isA('Clothing') || inst.ClassName === 'ShirtGraphic' || inst.ClassName === 'BodyColors') this.clothingDirty.add(p);
  }

  changed(inst, name, old, opts) {
    if (inst.ClassName === 'Lighting' || inst.ClassName === 'Sky') {
      this.applyLighting();
      return;
    }
    const v = this.visuals.get(inst);
    if (inst.isA('BasePart')) {
      if (!v) return;
      if (name === 'CFrame') {
        if (v.batched) {
          v.dynamic = true;
          this.rebuild(inst);
          return;
        }
        if (opts && opts.remote && !opts.snap) {
          v.target = inst.props.get('CFrame');
          this.smooth.add(v);
        } else {
          v.target = null;
          this.smooth.delete(v);
          applyCF(v.group, inst.props.get('CFrame'));
        }
      } else if (['Size', 'BrickColor', 'Transparency', 'Reflectance', 'Material', 'Shape', ...FACE_PROPS].includes(name)) {
        if (v.batched) v.dynamic = true;
        this.rebuild(inst);
      } else if (name === 'Anchored' && !inst.props.get('Anchored') && v.batched) {
        v.dynamic = true;
        this.rebuild(inst);
      }
      return;
    }
    const p = inst.parent;
    if (p && p.isA('BasePart') && (inst.isA('DataModelMesh') || inst.isA('Decal') || ['Fire', 'Smoke', 'Sparkles', 'PointLight', 'SpotLight'].includes(inst.ClassName))) this.rebuild(p);
    if (inst.isA('Clothing') || inst.ClassName === 'ShirtGraphic' || inst.ClassName === 'BodyColors') if (p) this.clothingDirty.add(p);
  }

  add(inst) {
    if (this.visuals.has(inst)) return;
    if (inst.isA('BasePart')) {
      if (inst.ClassName === 'Terrain') return;
      const group = new THREE.Group();
      group.matrixAutoUpdate = true;
      const v = { part: inst, group, children: [], target: null, effects: [] };
      this.visuals.set(inst, v);
      this.scene.add(group);
      applyCF(group, inst.props.get('CFrame'));
      this.build(v);
    } else if (inst.ClassName === 'Explosion') {
      this.explosion(inst);
    } else if (inst.ClassName === 'SelectionBox') {
      this.selectionBox(inst);
    }
  }

  remove(inst) {
    const v = this.visuals.get(inst);
    if (!v) return;
    this.visuals.delete(inst);
    this.smooth.delete(v);
    this.unbatch(v);
    if (v.group) {
      this.scene.remove(v.group);
      this.disposeGroup(v);
    }
    if (v.dispose) v.dispose();
  }

  disposeGroup(v) {
    for (const e of v.effects || []) {
      this.effects.delete(e);
      if (e.dispose) e.dispose();
    }
    v.effects = [];
    v.group.traverse((o) => {
      if (o.isMesh && o.geometry && !o.geometry.userData.shared) o.geometry.dispose();
      if (o.isPoints && o.geometry) o.geometry.dispose();
    });
  }

  rebuild(part) {
    const v = this.visuals.get(part);
    if (!v) return;
    this.unbatch(v);
    for (const c of [...v.group.children]) v.group.remove(c);
    this.disposeGroup(v);
    applyCF(v.group, part.props.get('CFrame'));
    this.build(v);
  }

  isCharacterPart(part) {
    const m = part.parent;
    return !!m && m.ClassName === 'Model' && !!m.findChildOfClass('Humanoid') && LIMB_REGION[part.props.get('Name')] !== undefined;
  }

  build(v) {
    const part = v.part;
    const size = part.props.get('Size');
    const transp = this.localTransparency.has(part) ? this.localTransparency.get(part) : part.props.get('Transparency');
    const meshInst = part.children.find((c) => c.isA('DataModelMesh'));
    let body = null;
    if (meshInst) {
      body = this.buildMesh(v, part, meshInst, size);
    } else if (part.isA('BasePart')) {
      const shape = part.info.all.has('Shape') ? part.props.get('Shape') : 1;
      let geo;
      if (part.ClassName === 'WedgePart') geo = wedgeGeometry(...size);
      else if (part.ClassName === 'CornerWedgePart') geo = cornerWedgeGeometry(...size);
      else if (shape === 0) geo = new THREE.SphereGeometry(Math.min(...size) / 2, 24, 16);
      else if (shape === 2) {
        geo = new THREE.CylinderGeometry(Math.min(size[1], size[2]) / 2, Math.min(size[1], size[2]) / 2, size[0], 24);
        geo.rotateZ(Math.PI / 2);
      } else geo = boxGeometry(...size);
      texPosAttribute(geo);
      let mats;
      const limb = BODY_MESH[part.props.get('Name')];
      if (limb && shape === 1 && this.isCharacterPart(part)) body = this.buildLimb(part, limb, size, geo, transp);
      else {
        if (part.ClassName === 'WedgePart' || part.ClassName === 'CornerWedgePart') mats = [0, 1, 2, 3, 4, 5].map((g) => this.material(part, g));
        else if (shape === 1) mats = this.partMaterials(part);
        else mats = this.material(part, -1);
        body = new THREE.Mesh(geo, mats);
      }
    }
    if (body) {
      body.traverse((o) => {
        o.castShadow = transp < 0.5 && !o.userData.overlay;
        o.receiveShadow = true;
      });
      body.userData.part = part;
      v.body = body;
      if (transp >= 1) body.visible = false;
      if (!meshInst && transp < 1 && this.batchable(v)) this.batch(v, body);
      else v.group.add(body);
    }
    if (!meshInst || this.isHeadMesh(meshInst)) this.buildDecals(v, part, size, meshInst);
    this.buildEffects(v, part);
  }

  buildLimb(part, limb, size, box, transp) {
    const atlas = this.atlases.get(part.parent);
    const c = brick(part.props.get('BrickColor'));
    const mat = new Material2012({ color: atlas ? rawColor(1, 1, 1) : rawColor(c.r, c.g, c.b), ks: 0.3, exp: 30, transparent: transp > 0, opacity: 1 - transp });
    if (atlas) mat.map = atlas;
    const group = new THREE.Group();
    const mesh = new THREE.Mesh(box, mat);
    group.add(mesh);
    contentMesh(limb.path).then((g) => {
      if (!g || !mesh.parent) return;
      box.dispose();
      mesh.geometry = g;
      mesh.scale.set(size[0] / limb.size[0], size[1] / limb.size[1], size[2] / limb.size[2]);
    });
    for (const [prop, y, rx] of atlas ? [] : [['TopSurface', size[1] / 2, -Math.PI / 2], ['BottomSurface', -size[1] / 2, Math.PI / 2]]) {
      const kind = SURFACE_TEX[part.props.get(prop) | 0];
      if (!kind || SURFACE_ROW[kind] === undefined) continue;
      const plane = new THREE.PlaneGeometry(size[0] * 0.94, size[2] * 0.94);
      const uv = plane.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * size[0], uv.getY(i) * size[2]);
      const om = new Material2012({ studOnly: true, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
      om.setStuds(studTexture(), SURFACE_ROW[kind]);
      const o = new THREE.Mesh(plane, om);
      o.position.y = y + Math.sign(y) * 0.004;
      o.rotation.x = rx;
      o.userData.overlay = true;
      group.add(o);
    }
    return group;
  }

  batchable(v) {
    const p = v.part;
    if (v.dynamic || !p.props.get('Anchored') || this.localTransparency.has(p)) return false;
    if (p.parent && p.parent.ClassName === 'Model' && p.parent.findChildOfClass('Humanoid')) return false;
    return true;
  }

  batch(v, body) {
    const geo = body.geometry;
    const mats = Array.isArray(body.material) ? body.material : null;
    const groups = geo.groups.length ? geo.groups : [{ start: 0, count: geo.index ? geo.index.count : geo.attributes.position.count, materialIndex: 0 }];
    v.batched = true;
    v.batchGeo = geo;
    v.batchMats = new Set();
    for (const g of groups) {
      const mat = mats ? mats[g.materialIndex] : body.material;
      if (!mat) continue;
      let b = this.buckets.get(mat);
      if (!b) {
        b = { mat, parts: new Map(), mesh: null };
        this.buckets.set(mat, b);
      }
      if (!b.parts.has(v)) b.parts.set(v, []);
      b.parts.get(v).push(g);
      v.batchMats.add(b);
      this.bucketsDirty.add(b);
    }
  }

  unbatch(v) {
    if (!v.batched) return;
    v.batched = false;
    for (const b of v.batchMats || []) {
      b.parts.delete(v);
      this.bucketsDirty.add(b);
    }
    v.batchMats = null;
    if (v.batchGeo) v.batchGeo.dispose();
    v.batchGeo = null;
  }

  rebuildBucket(b) {
    if (b.mesh) {
      this.scene.remove(b.mesh);
      b.mesh.geometry.dispose();
      b.mesh = null;
    }
    if (!b.parts.size) {
      this.buckets.delete(b.mat);
      return;
    }
    let n = 0;
    for (const [, groups] of b.parts) for (const g of groups) n += g.count;
    const pos = new Float32Array(n * 3), nrm = new Float32Array(n * 3), uv = new Float32Array(n * 2), tp = new Float32Array(n * 3);
    let o = 0;
    const m = new THREE.Matrix4(), nm = new THREE.Matrix3(), va = new THREE.Vector3();
    for (const [v, groups] of b.parts) {
      const cf = v.part.props.get('CFrame');
      m.set(cf[3], cf[4], cf[5], cf[0], cf[6], cf[7], cf[8], cf[1], cf[9], cf[10], cf[11], cf[2], 0, 0, 0, 1);
      nm.getNormalMatrix(m);
      const g = v.batchGeo;
      const P = g.attributes.position, N = g.attributes.normal, U = g.attributes.uv, T = g.attributes.tpos, I = g.index;
      for (const gr of groups) {
        for (let k = gr.start; k < gr.start + gr.count; k++) {
          const i = I ? I.getX(k) : k;
          va.set(P.getX(i), P.getY(i), P.getZ(i)).applyMatrix4(m);
          pos[o * 3] = va.x; pos[o * 3 + 1] = va.y; pos[o * 3 + 2] = va.z;
          va.set(N.getX(i), N.getY(i), N.getZ(i)).applyMatrix3(nm).normalize();
          nrm[o * 3] = va.x; nrm[o * 3 + 1] = va.y; nrm[o * 3 + 2] = va.z;
          uv[o * 2] = U ? U.getX(i) : 0; uv[o * 2 + 1] = U ? U.getY(i) : 0;
          if (T) { tp[o * 3] = T.getX(i); tp[o * 3 + 1] = T.getY(i); tp[o * 3 + 2] = T.getZ(i); }
          o++;
        }
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geo.setAttribute('tpos', new THREE.BufferAttribute(tp, 3));
    geo.computeBoundingSphere();
    const mesh = new THREE.Mesh(geo, b.mat);
    mesh.castShadow = !b.mat.transparent || b.mat.opacity > 0.5;
    mesh.receiveShadow = true;
    mesh.matrixAutoUpdate = false;
    b.mesh = mesh;
    this.scene.add(mesh);
  }

  isHeadMesh(m) {
    return m.ClassName === 'SpecialMesh' && m.props.get('MeshType') === 0;
  }

  buildMesh(v, part, m, size) {
    const scale = m.props.get('Scale');
    const off = m.props.get('Offset');
    const vc = m.props.get('VertexColor');
    const c = brick(part.props.get('BrickColor'));
    const transp = this.localTransparency.has(part) ? this.localTransparency.get(part) : part.props.get('Transparency');
    const mat = new Material2012({ color: rawColor(c.r, c.g, c.b), ks: 0.5, exp: 40, refl: part.props.get('Reflectance'), transparent: transp > 0, opacity: 1 - transp });
    const holder = new THREE.Group();
    holder.position.set(off[0], off[1], off[2]);
    let type = m.ClassName === 'SpecialMesh' ? m.props.get('MeshType') : m.ClassName === 'FileMesh' ? 5 : m.ClassName === 'CylinderMesh' ? 100 : 6;
    let geo = null;
    if (type === 5) {
      const url = m.props.get('MeshId');
      const tex = m.props.get('TextureId');
      if (tex) {
        mat.color.setRGB(vc[0], vc[1], vc[2]);
        loadTexture(tex).then((t) => {
          if (!t) {
            mat.color.copy(rawColor(c.r, c.g, c.b));
            return;
          }
          mat.setAlphaTest(0.1);
          mat.map = t;
        });
      }
      const mesh = new THREE.Mesh(new THREE.BufferGeometry(), mat);
      mesh.scale.set(scale[0], scale[1], scale[2]);
      mesh.castShadow = true;
      loadMesh(url).then((g) => {
        if (!g) return;
        g.userData.shared = true;
        mesh.geometry = g;
      });
      holder.add(mesh);
      return holder;
    }
    const sx = size[0] * scale[0], sy = size[1] * scale[1], sz = size[2] * scale[2];
    switch (type) {
      case 0:
        if (this.headMesh) {
          geo = this.headMesh.clone();
          geo.scale(size[2] * scale[0], size[1] * scale[1], size[2] * scale[2]);
          geo.computeBoundingBox();
        } else geo = headGeometry(size[2] * scale[0] * 0.98, size[1] * scale[1], size[2] * scale[2] * 0.98);
        break;
      case 1: geo = boxGeometry(sx, sy, sz); break;
      case 2: geo = wedgeGeometry(sx, sy, sz); break;
      case 3: geo = new THREE.SphereGeometry(0.5, 24, 16); geo.scale(sx, sy, sz); break;
      case 4: geo = new THREE.CylinderGeometry(0.5, 0.5, 1, 24); geo.rotateZ(Math.PI / 2); geo.scale(sx, sy, sz); break;
      case 7: geo = new THREE.CylinderGeometry(0.5, 0.5, 1, 3); geo.rotateX(Math.PI / 2); geo.scale(sx, sy, sz); break;
      case 8: geo = new THREE.ConeGeometry(0.7071, 1, 4); geo.rotateY(Math.PI / 4); geo.scale(sx, sy, sz); break;
      case 9: case 10: geo = wedgeGeometry(sx, sy, sz); break;
      case 11: geo = cornerWedgeGeometry(sx, sy, sz); break;
      case 100: geo = new THREE.CylinderGeometry(0.5, 0.5, 1, 24); geo.scale(sx, sy, sz); break;
      default: geo = boxGeometry(sx, sy, sz); break;
    }
    if (m.ClassName === 'SpecialMesh' && m.props.get('TextureId')) {
      mat.color.setRGB(vc[0], vc[1], vc[2]);
      loadTexture(m.props.get('TextureId')).then((t) => {
        if (t) mat.map = t;
      });
    }
    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData.part = part;
    holder.add(mesh);
    holder.userData.headGeo = type === 0 ? geo : null;
    return holder;
  }

  buildDecals(v, part, size, meshInst) {
    const decals = part.children.filter((c) => c.isA('Decal'));
    for (const d of decals) {
      const face = d.props.get('Face');
      const tex = d.props.get('Texture');
      if (!tex) continue;
      const transp = d.props.get('Transparency');
      const dc = d.props.get('Color3') || [1, 1, 1];
      const mat = new Material2012({ color: rawColor(dc[0], dc[1], dc[2]), ks: Math.min(1, (d.props.get('Specular') || 0) * 0.5), exp: d.props.get('Shiny') || 20, transparent: true, opacity: 1 - transp, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
      mat.visible = false;
      const isTexture = d.ClassName === 'Texture';
      if (meshInst && this.isHeadMesh(meshInst)) {
        if (face !== 5) continue;
        const holder = v.body;
        const headGeo = holder && holder.userData.headGeo;
        if (!headGeo) continue;
        const geo = faceProjected(headGeo);
        const mesh = new THREE.Mesh(geo, mat);
        const off = meshInst.props.get('Offset');
        mesh.position.set(off[0], off[1], off[2]);
        mesh.scale.setScalar(1.002);
        v.group.add(mesh);
      } else {
        const dims = [[size[2], size[1]], [size[0], size[2]], [size[0], size[1]], [size[2], size[1]], [size[0], size[2]], [size[0], size[1]]][face] || [1, 1];
        const geo = new THREE.PlaneGeometry(dims[0], dims[1]);
        const mesh = new THREE.Mesh(geo, mat);
        const h = [size[0] / 2, size[1] / 2, size[2] / 2];
        const e = 0.002;
        switch (face) {
          case 0: mesh.position.set(h[0] + e, 0, 0); mesh.rotation.y = Math.PI / 2; break;
          case 1: mesh.position.set(0, h[1] + e, 0); mesh.rotation.x = -Math.PI / 2; break;
          case 2: mesh.position.set(0, 0, h[2] + e); break;
          case 3: mesh.position.set(-h[0] - e, 0, 0); mesh.rotation.y = -Math.PI / 2; break;
          case 4: mesh.position.set(0, -h[1] - e, 0); mesh.rotation.x = Math.PI / 2; break;
          default: mesh.position.set(0, 0, -h[2] - e); mesh.rotation.y = Math.PI; break;
        }
        if (isTexture) {
          const u = d.props.get('StudsPerTileU') || 2, w = d.props.get('StudsPerTileV') || 2;
          const uv = geo.attributes.uv;
          for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) * dims[0]) / u, (uv.getY(i) * dims[1]) / w);
        }
        v.group.add(mesh);
      }
      loadTexture(tex, { repeat: isTexture }).then((t) => {
        if (!t) return;
        mat.map = t;
        mat.visible = true;
      });
    }
  }

  buildEffects(v, part) {
    for (const c of part.children) {
      if (c.ClassName === 'Fire' && c.props.get('Enabled')) v.effects.push(this.particles(v, c, 'fire'));
      else if (c.ClassName === 'Smoke' && c.props.get('Enabled')) v.effects.push(this.particles(v, c, 'smoke'));
      else if (c.ClassName === 'Sparkles' && c.props.get('Enabled')) v.effects.push(this.particles(v, c, 'sparkles'));
      else if ((c.ClassName === 'PointLight' || c.ClassName === 'SpotLight' || c.ClassName === 'SurfaceLight') && c.props.get('Enabled')) {
        const col = c.props.get('Color');
        const l = new THREE.PointLight(srgb(col[0], col[1], col[2]), c.props.get('Brightness') * 3, c.props.get('Range') * 1.2, 1.2);
        v.group.add(l);
      }
    }
    for (const e of v.effects) this.effects.add(e);
  }

  particles(v, inst, kind) {
    const opts = {};
    if (kind === 'fire') {
      opts.sizeScale = (inst.props.get('Size') || 5) / 5;
      opts.velScale = Math.max(0.1, (inst.props.get('Heat') || 9) / 9);
      opts.tint = inst.props.get('Color');
      opts.tint2 = inst.props.get('SecondaryColor');
    } else if (kind === 'smoke') {
      opts.sizeScale = inst.props.get('Size') || 1;
      opts.velScale = Math.max(0, inst.props.get('RiseVelocity') || 0) * 10;
      opts.tint = inst.props.get('Color');
      opts.alphaScale = (inst.props.get('Opacity') || 0.5) / 0.3;
    } else opts.tint = inst.props.get('SparkleColor');
    const sys = new ParticleSystem2012(this.scene, SYSTEMS[kind], opts);
    return {
      step: (dt) => {
        const cf = v.part.props.get('CFrame');
        sys.step(dt, [cf[0], cf[1], cf[2]]);
      },
      dispose: () => sys.dispose(),
    };
  }

  explosion(inst) {
    if (inst.props.get('Visible') === false) return;
    const pos = inst.props.get('Position');
    const k = Math.max(0.5, (inst.props.get('BlastRadius') || 4) / 4);
    const systems = ['explosionPlume', 'explosionBase', 'explosionSparks'].map((n) => new ParticleSystem2012(this.scene, SYSTEMS[n], { sizeScale: k, velScale: k }));
    const e = {
      step: (dt) => {
        for (const sys of systems) sys.step(dt, pos);
        if (systems.every((sys) => sys.done)) {
          for (const sys of systems) sys.dispose();
          this.effects.delete(e);
        }
      },
    };
    this.effects.add(e);
  }

  selectionBox(inst) {
    const v = { group: new THREE.Group(), effects: [] };
    const mat = new THREE.LineBasicMaterial({ color: 0x1e88ff });
    let line = null;
    const e = {
      step: () => {
        const a = inst.props.get('Adornee');
        if (!a || !a.isA('BasePart') || !inst.props.get('Visible')) {
          if (line) line.visible = false;
          return;
        }
        const s = a.props.get('Size');
        if (!line || line.userData.key !== s.join(',')) {
          if (line) {
            v.group.remove(line);
            line.geometry.dispose();
          }
          line = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(s[0] + 0.1, s[1] + 0.1, s[2] + 0.1)), mat);
          line.userData.key = s.join(',');
          v.group.add(line);
        }
        const b = brick(inst.props.get('Color'));
        mat.color.copy(srgb(b.r, b.g, b.b));
        line.visible = true;
        applyCF(v.group, a.props.get('CFrame'));
      },
    };
    this.scene.add(v.group);
    v.dispose = () => {
      this.scene.remove(v.group);
      this.effects.delete(e);
    };
    this.visuals.set(inst, v);
    this.effects.add(e);
  }

  setLocalTransparency(part, t) {
    if (t == null) this.localTransparency.delete(part);
    else this.localTransparency.set(part, t);
    this.rebuild(part);
  }

  attach() {
    const ws = this.dm.services.get('Workspace');
    for (const d of ws.descendants()) this.add(d);
    this.applyLighting();
  }

  forceFields(dt) {
    if (!this.ffSystems) this.ffSystems = new Map();
    const seen = new Set();
    for (const v of this.visuals.values()) {
      const p = v.part;
      if (!p || p.props.get('Name') !== 'Torso') continue;
      const m = p.parent;
      if (!m || !m.findChildOfClass('ForceField')) continue;
      seen.add(m);
      let ff = this.ffSystems.get(m);
      if (!ff) {
        ff = [new ParticleSystem2012(this.scene, SYSTEMS.ffBeam), new ParticleSystem2012(this.scene, SYSTEMS.ffRadial)];
        this.ffSystems.set(m, ff);
      }
      const o = v.group.position;
      for (const sys of ff) sys.step(dt, [o.x, o.y, o.z]);
    }
    for (const [m, ff] of this.ffSystems) {
      if (!seen.has(m)) {
        for (const sys of ff) sys.dispose();
        this.ffSystems.delete(m);
      }
    }
  }

  frame(dt) {
    const k = 1 - Math.exp(-dt * 18);
    for (const v of this.smooth) {
      if (!v.target) {
        this.smooth.delete(v);
        continue;
      }
      const g = v.group;
      tmpM.set(v.target[3], v.target[4], v.target[5], v.target[0], v.target[6], v.target[7], v.target[8], v.target[1], v.target[9], v.target[10], v.target[11], v.target[2], 0, 0, 0, 1);
      const tp = new THREE.Vector3(), tq = new THREE.Quaternion(), ts = new THREE.Vector3();
      tmpM.decompose(tp, tq, ts);
      if (g.position.distanceToSquared(tp) > 400) {
        g.position.copy(tp);
        g.quaternion.copy(tq);
      } else {
        g.position.lerp(tp, k);
        g.quaternion.slerp(tq, k);
      }
      if (g.position.distanceToSquared(tp) < 1e-6) this.smooth.delete(v);
    }
    if (this.bucketsDirty.size) {
      for (const b of this.bucketsDirty) this.rebuildBucket(b);
      this.bucketsDirty.clear();
    }
    for (const m of this.clothingDirty) {
      this.clothingDirty.delete(m);
      for (const c of m.children) if (c.isA('BasePart') && this.visuals.has(c)) this.rebuild(c);
    }
    for (const e of this.effects) e.step(dt);
    this.forceFields(dt);
    const cam = this.camera.position;
    this.skyDome.position.copy(cam);
    if (this.sunDir) {
      const d = LIGHTS.lamp0Dir.value;
      this.sun.position.set(cam.x + d.x * 300, cam.y + d.y * 300, cam.z + d.z * 300);
      this.sun.target.position.set(cam.x, cam.y, cam.z);
      const s = this.sunDir;
      if (this.sunSprite) {
        this.sunSprite.position.set(cam.x + s[0] * 1800, cam.y + s[1] * 1800, cam.z + s[2] * 1800);
        this.moonSprite.position.set(cam.x - s[0] * 1800, cam.y - s[1] * 1800, cam.z - s[2] * 1800);
      }
    }
    this.r.render(this.scene, this.camera);
  }

  pick(ndcX, ndcY, ignore) {
    const ray = new THREE.Raycaster();
    ray.setFromCamera(new THREE.Vector2(ndcX, ndcY), this.camera);
    return { origin: ray.ray.origin.toArray(), dir: ray.ray.direction.toArray() };
  }
}
