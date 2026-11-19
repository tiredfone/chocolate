import * as THREE from 'three';
import { brick } from '../shared/brickcolor.js';
import { sunDirection } from '../shared/luahost.js';
import { loadTexture, loadMesh, loadImage, proceduralTexture, trussTexture, spriteTexture, contentTexture, loadUnionMesh, unionGeometry } from './assets.js';
import { Material2012, MATERIALS, MATERIALS2018, LIGHTS, rawColor, texPosAttribute, applyLighting as light2012, setShadeEra, shadeEra } from './shade2012.js';
import { ParticleSystem2012, SYSTEMS, preloadParticles } from './particles2012.js';
import { CharacterAtlases, R15Atlases, BODY_MESH, clothingOf } from './character2012.js';
import { contentMesh } from './assets.js';
import { TerrainView } from './terrainview.js';
import { terrainOf, CELL_COLORS, CELL_WATER } from '../shared/terrain.js';

const MATERIAL_KIND = {
  256: 'plastic', 272: 'smoothplastic', 288: 'neon', 512: 'wood', 528: 'woodplanks', 784: 'slate', 800: 'slate', 816: 'concrete', 832: 'granite',
  848: 'brick', 864: 'pebble', 880: 'cobblestone', 1040: 'corrodedmetal', 1056: 'diamondplate', 1072: 'foil', 1088: 'metal', 1280: 'grass',
  1296: 'sand', 1312: 'fabric', 1536: 'ice', 1568: 'glass',
};
const BUCKET_CAP = 1024;
const LOOSE_BATCH_MIN = 256;
const SURFACE_TEX = { 1: 'glue', 2: 'weld', 3: 'studs', 4: 'inlet', 5: 'universal' };
const SURFACE_ROW = { studs: 0, inlet: 1, weld: 2, glue: 3, universal: 4 };
const SKY_2012 = ['rt', 'lf', 'up', 'dn', 'bk', 'ft'].map((f) => `rbxasset://sky/null_plainsky512_${f}.jpg`);
const SKY_2018 = ['rt', 'lf', 'up', 'dn', 'bk', 'ft'].map((f) => `rbxasset://textures/sky/sky512_${f}.tex`);
let DEFAULT_SKY = SKY_2012;

let studAtlas = null;
let studAtlas2018 = null;
function studTexture() {
  if (shadeEra() === 2018) {
    if (!studAtlas2018) studAtlas2018 = contentTexture('platform/textures/studs.png', { placeholder: 'rgb(128,128,128)' });
    return studAtlas2018;
  }
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
const CELL_KIND = [null, 'grass', 'sand', 'brick', 'granite', 'concrete', 'corrodedmetal', 'metal', 'foil', 'woodplanks', 'wood', 'pebble', 'concrete', 'slate', 'concrete', 'plastic', 'plastic', 'plastic'];
const R15_LIMBS = new Set(['Head', 'UpperTorso', 'LowerTorso', 'LeftUpperArm', 'LeftLowerArm', 'LeftHand', 'RightUpperArm', 'RightLowerArm', 'RightHand', 'LeftUpperLeg', 'LeftLowerLeg', 'LeftFoot', 'RightUpperLeg', 'RightLowerLeg', 'RightFoot']);
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

function mergeItems(items) {
  let n = 0;
  for (const it of items) for (const g of it.groups) n += g.count;
  const pos = new Float32Array(n * 3), nrm = new Float32Array(n * 3), uv = new Float32Array(n * 2), tp = new Float32Array(n * 3);
  let o = 0;
  const nm = new THREE.Matrix3(), va = new THREE.Vector3();
  for (const it of items) {
    nm.getNormalMatrix(it.m);
    const g = it.geo;
    const P = g.attributes.position, N = g.attributes.normal, U = g.attributes.uv, T = g.attributes.tpos, I = g.index;
    for (const gr of it.groups) {
      for (let k = gr.start; k < gr.start + gr.count; k++) {
        const i = I ? I.getX(k) : k;
        va.set(P.getX(i), P.getY(i), P.getZ(i)).applyMatrix4(it.m);
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
  return geo;
}

function cfMatrix(cf) {
  return new THREE.Matrix4().set(cf[3], cf[4], cf[5], cf[0], cf[6], cf[7], cf[8], cf[1], cf[9], cf[10], cf[11], cf[2], 0, 0, 0, 1);
}

const ASM_EFFECTS = new Set(['Fire', 'Smoke', 'Sparkles', 'PointLight', 'SpotLight', 'SurfaceLight', 'ForceField']);

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

function studUvGeometry(geo) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  const P = g.attributes.position;
  const uv = new Float32Array(P.count * 2);
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  for (let i = 0; i + 2 < P.count; i += 3) {
    a.fromBufferAttribute(P, i);
    b.fromBufferAttribute(P, i + 1);
    c.fromBufferAttribute(P, i + 2);
    const n = b.clone().sub(a).cross(c.clone().sub(a));
    const ax = Math.abs(n.x), ay = Math.abs(n.y), az = Math.abs(n.z);
    const axis = ax >= ay && ax >= az ? 0 : ay >= az ? 1 : 2;
    for (let j = 0; j < 3; j++) {
      const x = P.getX(i + j), y = P.getY(i + j), z = P.getZ(i + j);
      uv[(i + j) * 2] = axis === 0 ? z : x;
      uv[(i + j) * 2 + 1] = axis === 1 ? z : y;
    }
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
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
  const seen = new Map();
  for (const t of tris) for (const v of [t[0], t[1], t[2]]) seen.set(v.join(','), v);
  const mid = [0, 0, 0];
  for (const v of seen.values()) for (let k = 0; k < 3; k++) mid[k] += v[k] / seen.size;
  let idx = 0;
  for (const t of tris) {
    let [p, q, r] = t;
    let uq = t[7], ur = t[8];
    let u = [q[0] - p[0], q[1] - p[1], q[2] - p[2]], v = [r[0] - p[0], r[1] - p[1], r[2] - p[2]];
    let n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    const cx = p[0] + q[0] + r[0] - 3 * mid[0], cy = p[1] + q[1] + r[1] - 3 * mid[1], cz = p[2] + q[2] + r[2] - 3 * mid[2];
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

const PACKAGE_PART = { Torso: 1, 'Left Arm': 2, 'Right Arm': 3, 'Left Leg': 4, 'Right Leg': 5 };

function packageMesh(part) {
  const n = PACKAGE_PART[part.props.get('Name')];
  const m = part.parent;
  if (!n || !m) return 0;
  for (const c of m.children) if (c.ClassName === 'CharacterMesh' && c.props.get('BodyPart') === n && c.props.get('MeshId') > 0) return c.props.get('MeshId');
  return 0;
}

export class Renderer {
  constructor(canvas, world) {
    this.world = world;
    setShadeEra(world.era);
    DEFAULT_SKY = world.era === 2018 ? SKY_2018 : SKY_2012;
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
    this.looseCount = 0;
    this.bucketsDirty = new Set();
    this.asmIndex = new Map();
    this.asms = new Map();
    this.asmDirty = new Set();
    this.asmMoved = new Set();
    this.setupLighting();
    preloadParticles();
    this.atlases = new CharacterAtlases(r);
    this.r15Atlases = new R15Atlases(r);
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

  setQuality(level) {
    const q = level | 0;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const ratio = q === 0 ? dpr : Math.max(0.5, Math.min(dpr, 0.5 + q * 0.15));
    if (Math.abs(this.r.getPixelRatio() - ratio) > 1e-3) {
      this.r.setPixelRatio(ratio);
      this.resize();
    }
    const shadows = q === 0 || q >= 4;
    if (this.sun.castShadow !== shadows) {
      this.sun.castShadow = shadows;
      this.r.shadowMap.needsUpdate = true;
    }
    const high = q === 0 || q >= 8;
    const maxTex = this.r.capabilities.maxTextureSize || 2048;
    const size = Math.min(maxTex, high ? 4096 : q >= 4 ? 2048 : 1024);
    const half = high ? 200 : 150;
    const sc = this.sun.shadow.camera;
    if (sc.right !== half) {
      sc.left = -half; sc.right = half; sc.top = half; sc.bottom = -half;
      sc.updateProjectionMatrix();
    }
    if (this.sun.shadow.mapSize.x !== size) {
      this.sun.shadow.mapSize.set(size, size);
      if (this.sun.shadow.map) {
        this.sun.shadow.map.dispose();
        this.sun.shadow.map = null;
      }
    }
    this.camera.far = q === 0 || q >= 6 ? 5000 : 900 + q * 300;
    this.camera.updateProjectionMatrix();
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
    this.sun.shadow.mapSize.set(4096, 4096);
    const sc = this.sun.shadow.camera;
    sc.left = -200; sc.right = 200; sc.top = 200; sc.bottom = -200; sc.near = 1; sc.far = 700;
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
    const load = (list) => Promise.all(list.map((u) => Promise.resolve(loadImage(u)).catch(() => null)));
    load(urls).then((imgs) => (imgs.every((i) => i && i.width && i.height) || urls.every((u, i) => u === DEFAULT_SKY[i]) ? imgs : load(DEFAULT_SKY))).then((imgs) => {
      if (this.skyKey !== key || imgs.some((i) => !i || !i.width || !i.height)) return;
      const big = Math.max(...imgs.map((im) => Math.max(im.width, im.height)));
      let size = 64;
      while (size < big && size < 1024) size *= 2;
      const cube = new THREE.CubeTexture(imgs.map((im, i) => {
        const c = document.createElement('canvas');
        c.width = size;
        c.height = size;
        const g = c.getContext('2d');
        if (i === 2) g.setTransform(0, -1, 1, 0, 0, size);
        else if (i === 3) g.setTransform(0, 1, -1, 0, size, 0);
        else g.setTransform(1, 0, 0, -1, 0, size);
        g.drawImage(im, 0, 0, size, size);
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

  partColor(part) {
    if (part.ClassName === 'NegateOperation') return { r: 1, g: 0.35, b: 0.35 };
    if (this.world.era === 2018 && part.info.all.has('Color')) {
      const c = part.props.get('Color');
      if (Array.isArray(c)) return { r: c[0], g: c[1], b: c[2] };
    }
    return brick(part.props.get('BrickColor'));
  }

  partTransparency(part) {
    if (this.localTransparency.has(part)) return this.localTransparency.get(part);
    if (part.ClassName === 'NegateOperation') return Math.max(0.5, +part.props.get('Transparency') || 0);
    const t = part.props.get('Transparency');
    const ltm = this.world.era === 2018 && part.props.has('LocalTransparencyModifier') ? +part.props.get('LocalTransparencyModifier') || 0 : 0;
    return ltm > 0 ? 1 - (1 - t) * (1 - ltm) : t;
  }

  material(part, face) {
    const pc = this.partColor(part);
    const b = `${pc.r.toFixed(3)},${pc.g.toFixed(3)},${pc.b.toFixed(3)}`;
    const mat = part.props.get('Material');
    const transp = this.partTransparency(part);
    const refl = part.props.get('Reflectance');
    let kind = MATERIAL_KIND[mat] || 'plastic';
    const surf = face >= 0 ? part.props.get(FACE_PROPS[face]) | 0 : 0;
    if (part.ClassName === 'TrussPart') kind = 'truss';
    const key = `${b}|${kind}|${surf}|${transp.toFixed(2)}|${refl.toFixed(2)}`;
    let m = this.materials.get(key);
    if (m) return m;
    const c = pc;
    const table = this.world.era === 2018 ? MATERIALS2018 : MATERIALS;
    const def = table[kind] || table.plastic;
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
    if (['Shirt', 'Pants', 'ShirtGraphic', 'BodyColors', 'CharacterMesh'].includes(inst.ClassName)) for (const v of this.visuals.values()) if (v.part && v.part.parent) this.clothingDirty.add(v.part.parent);
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
    if (inst.ClassName === 'ForceField' || inst.isA('Clothing') || inst.ClassName === 'ShirtGraphic' || inst.ClassName === 'BodyColors' || inst.ClassName === 'CharacterMesh') this.clothingDirty.add(p);
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
        const ra = this.asms.get(inst.id);
        if (ra) this.asmMoved.add(ra);
        if (v.asm && !ra) {
          v.asm.check.add(v);
          applyCF(v.group, inst.props.get('CFrame'));
          return;
        }
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
      } else if (['Size', 'BrickColor', 'Color', 'MeshId', 'TextureID', 'LocalTransparencyModifier', 'Transparency', 'Reflectance', 'Material', 'Shape', ...FACE_PROPS].includes(name)) {
        if (v.batched) v.dynamic = true;
        this.rebuild(inst);
      } else if (name === 'Anchored' && v.asm) {
        v.noAsm = true;
        this.rebuild(inst);
      } else if (name === 'Anchored' && !inst.props.get('Anchored') && v.batched) {
        v.dynamic = true;
        this.rebuild(inst);
      } else if ((name === 'Velocity' || name === 'RotVelocity') && !v.batched && !v.asm && v.loose && this.canRestBatch(inst) && Array.isArray(old) && (old[0] || old[1] || old[2])) {
        v.dynamic = false;
        this.rebuild(inst);
      }
      return;
    }
    const p = inst.parent;
    if (p && p.isA('BasePart') && (inst.isA('DataModelMesh') || inst.isA('Decal') || ['Fire', 'Smoke', 'Sparkles', 'PointLight', 'SpotLight'].includes(inst.ClassName))) this.rebuild(p);
    if (inst.isA('Clothing') || inst.ClassName === 'ShirtGraphic' || inst.ClassName === 'BodyColors' || inst.ClassName === 'CharacterMesh') if (p) this.clothingDirty.add(p);
  }

  add(inst) {
    if (this.visuals.has(inst)) return;
    if (inst.isA('BasePart')) {
      if (inst.ClassName === 'Terrain') {
        this.attachTerrain(inst);
        return;
      }
      const group = new THREE.Group();
      group.matrixAutoUpdate = true;
      const v = { part: inst, group, children: [], target: null, effects: [] };
      if (!inst.props.get('Anchored')) {
        v.loose = true;
        this.looseCount++;
      }
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
    if (v.loose) this.looseCount--;
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
    const transp = this.partTransparency(part);
    const meshInst = part.children.find((c) => c.isA('DataModelMesh'));
    let body = null;
    if (meshInst) {
      body = this.buildMesh(v, part, meshInst, size);
    } else if (part.isA('PartOperation')) {
      body = this.buildUnion(part, size, transp);
    } else if (part.ClassName === 'MeshPart') {
      body = this.buildMeshPart(part, size, transp);
    } else if (part.isA('BasePart')) {
      const shape = part.info.all.has('Shape') ? part.props.get('Shape') : 1;
      let geo;
      if (part.ClassName === 'WedgePart') geo = wedgeGeometry(...size);
      else if (part.ClassName === 'CornerWedgePart') geo = cornerWedgeGeometry(...size);
      else if (shape === 0) geo = studUvGeometry(new THREE.SphereGeometry(Math.min(...size) / 2, 24, 16));
      else if (shape === 2) {
        geo = new THREE.CylinderGeometry(Math.min(size[1], size[2]) / 2, Math.min(size[1], size[2]) / 2, size[0], 24);
        geo.rotateZ(Math.PI / 2);
        geo = studUvGeometry(geo);
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
      const worn = !!part.parent && (part.parent.ClassName === 'Hat' || part.parent.ClassName === 'Accessory' || part.parent.ClassName === 'Accoutrement') && part.props.get('Name') === 'Handle';
      body.traverse((o) => {
        o.castShadow = transp < 0.5 && !o.userData.overlay && !worn;
        o.receiveShadow = true;
      });
      body.userData.part = part;
      v.body = body;
      if (transp >= 1) body.visible = false;
      const plain = !meshInst && !part.isA('PartOperation') && part.ClassName !== 'MeshPart' && body.geometry && transp < 1;
      if (plain && this.asmJoin(v, body)) {
      } else if (plain && this.batchable(v)) this.batch(v, body);
      else v.group.add(body);
    }
    if (!meshInst || this.isHeadMesh(meshInst)) this.buildDecals(v, part, size, meshInst);
    this.buildEffects(v, part);
  }

  buildLimb(part, limb, size, box, transp) {
    const atlas = this.atlases.get(part.parent);
    const c = this.partColor(part);
    const mat = new Material2012({ color: atlas ? rawColor(1, 1, 1) : rawColor(c.r, c.g, c.b), ks: 0.3, exp: 30, transparent: transp > 0, opacity: 1 - transp });
    if (atlas) mat.map = atlas;
    const group = new THREE.Group();
    const mesh = new THREE.Mesh(box, mat);
    group.add(mesh);
    const pkg = packageMesh(part);
    if (pkg) {
      loadMesh(String(pkg)).then((g) => {
        if (!g || !mesh.parent) return;
        g.userData.shared = true;
        box.dispose();
        mesh.geometry = g;
      });
    } else contentMesh(limb.path).then((g) => {
      if (!g || !mesh.parent) return;
      if (!this.flatLimbs) this.flatLimbs = new Map();
      let flat = this.flatLimbs.get(limb.path);
      if (!flat) {
        flat = g.clone();
        flat.deleteAttribute('normal');
        flat.computeVertexNormals();
        flat.userData.shared = true;
        this.flatLimbs.set(limb.path, flat);
      }
      box.dispose();
      mesh.geometry = flat;
      mesh.scale.set(size[0] / limb.size[0], size[1] / limb.size[1], size[2] / limb.size[2]);
    });
    const name = part.props.get('Name');
    const clothes = clothingOf(part.parent);
    const faces = [];
    if (this.world.era !== 2018 && !(clothes && clothes.shirt) && (name === 'Torso' || name === 'Left Arm' || name === 'Right Arm')) {
      faces.push(['studs', size[1] / 2, -Math.PI / 2, false]);
      if (name !== 'Torso') faces.push(['inlet', -size[1] / 2, Math.PI / 2, true]);
    }
    for (const [kind, y, rx, solid] of faces) {
      const k = solid ? 1 : 0.94;
      const plane = new THREE.PlaneGeometry(size[0] * k, size[2] * k);
      const uv = plane.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * size[0] * k, uv.getY(i) * size[2] * k);
      texPosAttribute(plane);
      const om = solid
        ? new Material2012({ color: rawColor(c.r, c.g, c.b), ks: 0.3, exp: 30, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 })
        : new Material2012({ studOnly: true, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
      om.setStuds(studTexture(), SURFACE_ROW[kind]);
      const o = new THREE.Mesh(plane, om);
      o.position.y = y + Math.sign(y) * 0.004;
      o.rotation.x = rx;
      o.userData.overlay = !solid;
      group.add(o);
    }
    return group;
  }

  batchable(v) {
    const p = v.part;
    if (v.dynamic || this.localTransparency.has(p)) return false;
    if (!p.props.get('Anchored') && !this.canRestBatch(p)) return false;
    if (p.parent && p.parent.ClassName === 'Model' && p.parent.findChildOfClass('Humanoid')) return false;
    return true;
  }

  canRestBatch(p) {
    if (this.looseCount < LOOSE_BATCH_MIN || p.props.get('Anchored')) return false;
    const a = p.props.get('Velocity'), b = p.props.get('RotVelocity');
    if (a[0] || a[1] || a[2] || b[0] || b[1] || b[2]) return false;
    return !(p.parent && p.parent.ClassName === 'Model' && p.parent.findChildOfClass('Humanoid'));
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
      let list = this.buckets.get(mat);
      if (!list) {
        list = [];
        this.buckets.set(mat, list);
      }
      let b = list.find((x) => x.parts.size < BUCKET_CAP || x.parts.has(v));
      if (!b) {
        b = { mat, parts: new Map(), mesh: null };
        list.push(b);
      }
      if (!b.parts.has(v)) b.parts.set(v, []);
      b.parts.get(v).push(g);
      v.batchMats.add(b);
      this.bucketsDirty.add(b);
    }
  }

  unbatch(v) {
    if (v.asm) this.asmLeave(v);
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
      const list = this.buckets.get(b.mat);
      if (list) {
        const i = list.indexOf(b);
        if (i >= 0) list.splice(i, 1);
        if (!list.length) this.buckets.delete(b.mat);
      }
      return;
    }
    const items = [];
    for (const [v, groups] of b.parts) {
      const cf = v.part.props.get('CFrame');
      items.push({ geo: v.batchGeo, groups, m: new THREE.Matrix4().set(cf[3], cf[4], cf[5], cf[0], cf[6], cf[7], cf[8], cf[1], cf[9], cf[10], cf[11], cf[2], 0, 0, 0, 1) });
    }
    const geo = mergeItems(items);
    const mesh = new THREE.Mesh(geo, b.mat);
    mesh.castShadow = !b.mat.transparent || b.mat.opacity > 0.5;
    mesh.receiveShadow = true;
    mesh.matrixAutoUpdate = false;
    b.mesh = mesh;
    this.scene.add(mesh);
  }

  setAssemblies(adds, dels) {
    const touched = new Set();
    const drop = (r) => {
      const asm = this.asms.get(r);
      if (!asm) return;
      this.asms.delete(r);
      this.asmDirty.delete(asm);
      this.asmMoved.delete(asm);
      for (const m of asm.meshes) {
        this.scene.remove(m);
        m.geometry.dispose();
      }
      asm.meshes = [];
      for (const v of [...asm.members.keys()]) {
        this.asmLeave(v);
        v.noAsm = false;
        touched.add(v.part.id);
      }
      for (const id of asm.ids) {
        if (this.asmIndex.get(id) === r) this.asmIndex.delete(id);
        touched.add(id);
      }
    };
    for (const r of dels) drop(r);
    for (const [r, d] of adds) {
      drop(r);
      const ids = [];
      let id = 0;
      for (const x of d) {
        id += x;
        ids.push(id);
      }
      this.asms.set(r, { root: r, ids, members: new Map(), meshes: [], check: new Set() });
      for (const i of ids) {
        this.asmIndex.set(i, r);
        touched.add(i);
      }
    }
    for (const id of touched) {
      const part = this.dm.byId.get(id);
      const v = part && this.visuals.get(part);
      if (!v) continue;
      v.noAsm = false;
      this.rebuild(part);
    }
  }

  asmEligible(v) {
    const p = v.part;
    if (v.noAsm || p.props.get('Anchored') || this.localTransparency.has(p)) return false;
    if (p.parent && p.parent.ClassName === 'Model' && p.parent.findChildOfClass('Humanoid')) return false;
    for (const c of p.children) if (c.isA('Decal') || c.isA('DataModelMesh') || ASM_EFFECTS.has(c.ClassName)) return false;
    return true;
  }

  asmJoin(v, body) {
    if (!this.asmIndex.size) return false;
    const part = v.part;
    const rid = this.asmIndex.get(part.id);
    if (rid === undefined) return false;
    const asm = this.asms.get(rid);
    const rootPart = this.dm.byId.get(rid);
    if (!asm || !rootPart || !this.asmEligible(v)) return false;
    const geo = body.geometry;
    const mats = Array.isArray(body.material) ? body.material : null;
    const groups = geo.groups.length ? geo.groups : [{ start: 0, count: geo.index ? geo.index.count : geo.attributes.position.count, materialIndex: 0 }];
    const entries = [];
    for (const g of groups) {
      const mat = mats ? mats[g.materialIndex] : body.material;
      if (mat) entries.push({ mat, g });
    }
    const local = cfMatrix(rootPart.props.get('CFrame')).invert().multiply(cfMatrix(part.props.get('CFrame')));
    asm.members.set(v, { geo, entries, local });
    v.asm = asm;
    this.asmDirty.add(asm);
    return true;
  }

  asmLeave(v) {
    const asm = v.asm;
    if (!asm) return;
    v.asm = null;
    const m = asm.members.get(v);
    asm.members.delete(v);
    asm.check.delete(v);
    if (m && m.geo && !m.geo.userData.shared) m.geo.dispose();
    if (this.asms.get(asm.root) === asm) this.asmDirty.add(asm);
  }

  asmBuild(asm) {
    for (const m of asm.meshes) {
      this.scene.remove(m);
      m.geometry.dispose();
    }
    asm.meshes = [];
    const rootPart = this.dm.byId.get(asm.root);
    if (!rootPart || !this.visuals.has(rootPart)) {
      for (const v of [...asm.members.keys()]) {
        v.noAsm = true;
        this.rebuild(v.part);
      }
      return;
    }
    const byMat = new Map();
    for (const [, m] of asm.members) {
      for (const e of m.entries) {
        let list = byMat.get(e.mat);
        if (!list) byMat.set(e.mat, (list = []));
        list.push({ geo: m.geo, groups: [e.g], m: m.local });
      }
    }
    for (const [mat, items] of byMat) {
      const mesh = new THREE.Mesh(mergeItems(items), mat);
      mesh.castShadow = !mat.transparent || mat.opacity > 0.5;
      mesh.receiveShadow = true;
      asm.meshes.push(mesh);
      this.scene.add(mesh);
    }
    asm.check.clear();
    this.asmSync(asm);
  }

  asmSync(asm) {
    const rv = this.visuals.get(this.dm.byId.get(asm.root));
    for (const m of asm.meshes) {
      if (!rv) {
        m.visible = false;
        continue;
      }
      m.visible = true;
      m.position.copy(rv.group.position);
      m.quaternion.copy(rv.group.quaternion);
    }
  }

  asmVerify(asm) {
    const rootPart = this.dm.byId.get(asm.root);
    const rm = cfMatrix(rootPart.props.get('CFrame'));
    const e = new THREE.Matrix4();
    const out = [];
    for (const v of asm.check) {
      const m = asm.members.get(v);
      if (!m) continue;
      e.multiplyMatrices(rm, m.local);
      const a = e.elements, b = cfMatrix(v.part.props.get('CFrame')).elements;
      const dist = Math.hypot(m.local.elements[12], m.local.elements[13], m.local.elements[14]);
      let bad = Math.hypot(a[12] - b[12], a[13] - b[13], a[14] - b[14]) > 0.05 + 0.004 * dist;
      for (let i = 0; i < 11 && !bad; i++) if (i % 4 !== 3 && Math.abs(a[i] - b[i]) > 0.02) bad = true;
      if (bad) out.push(v);
    }
    asm.check.clear();
    for (const v of out) {
      v.noAsm = true;
      this.rebuild(v.part);
    }
  }

  asmStep() {
    for (const asm of [...this.asmMoved]) {
      if (this.asmDirty.has(asm)) continue;
      this.asmSync(asm);
      const rv = this.visuals.get(this.dm.byId.get(asm.root));
      if (!rv || !this.smooth.has(rv)) this.asmMoved.delete(asm);
    }
    for (const asm of this.asms.values()) if (asm.check.size && !this.asmDirty.has(asm)) this.asmVerify(asm);
    if (this.asmDirty.size) {
      const list = [...this.asmDirty];
      this.asmDirty.clear();
      for (const asm of list) if (this.asms.get(asm.root) === asm) this.asmBuild(asm);
    }
  }

  isHeadMesh(m) {
    return m.ClassName === 'SpecialMesh' && m.props.get('MeshType') === 0;
  }

  buildMeshPart(part, size, transp) {
    const holder = new THREE.Group();
    const c = this.partColor(part);
    const mat = new Material2012({ color: rawColor(c.r, c.g, c.b), ks: 0.3, exp: 30, refl: part.props.get('Reflectance'), transparent: transp > 0, opacity: 1 - transp });
    const mesh = new THREE.Mesh(new THREE.BufferGeometry(), mat);
    mesh.castShadow = transp < 0.5;
    mesh.receiveShadow = true;
    mesh.userData.part = part;
    holder.add(mesh);
    const tex = part.props.get('TextureID');
    const model = part.parent;
    const limb = !!(model && model.findChildOfClass && model.findChildOfClass('Humanoid') && R15_LIMBS.has(part.props.get('Name')) && part.props.get('Name') !== 'Head');
    let over = null;
    if (limb) {
      const t = this.r15Atlases.get(model, part.props.get('Name'));
      if (t) {
        mat.color.setRGB(1, 1, 1);
        mat.map = t;
      }
    }
    if (tex && limb) {
      const om = new Material2012({ color: rawColor(1, 1, 1), ks: 0.3, exp: 30, transparent: true, opacity: 1 - transp, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
      om.visible = false;
      over = new THREE.Mesh(mesh.geometry, om);
      over.userData.part = part;
      over.userData.overlay = true;
      mesh.add(over);
      loadTexture(tex).then((t) => {
        if (!t) return;
        om.map = t;
        om.visible = true;
      });
    } else if (tex) {
      loadTexture(tex).then((t) => {
        if (!t) return;
        mat.color.setRGB(1, 1, 1);
        mat.setAlphaTest(0.1);
        mat.map = t;
      });
    }
    const url = part.props.get('MeshId');
    if (url) loadMesh(url).then((g) => {
      if (!g) {
        if (mesh.geometry && !mesh.geometry.getAttribute('position')) {
          const box = boxGeometry(size[0], size[1], size[2]);
          texPosAttribute(box);
          mesh.geometry = box;
        }
        return;
      }
      g.userData.shared = true;
      if (!g.boundingBox) g.computeBoundingBox();
      const bb = g.boundingBox;
      const ext = [bb.max.x - bb.min.x, bb.max.y - bb.min.y, bb.max.z - bb.min.z];
      mesh.scale.set(size[0] / (ext[0] || 1), size[1] / (ext[1] || 1), size[2] / (ext[2] || 1));
      mesh.position.set(-(bb.max.x + bb.min.x) / 2 * mesh.scale.x, -(bb.max.y + bb.min.y) / 2 * mesh.scale.y, -(bb.max.z + bb.min.z) / 2 * mesh.scale.z);
      mesh.geometry = g;
      if (over) over.geometry = g;
    });
    else {
      const box = boxGeometry(size[0], size[1], size[2]);
      texPosAttribute(box);
      mesh.geometry = box;
      if (over) over.geometry = box;
    }
    return holder;
  }

  buildUnion(part, size, transp) {
    const holder = new THREE.Group();
    const mat = this.material(part, -1);
    const mesh = new THREE.Mesh(new THREE.BufferGeometry(), mat);
    mesh.castShadow = transp < 0.5;
    mesh.receiveShadow = true;
    mesh.userData.part = part;
    holder.add(mesh);
    const extra = (n) => (part.info.all.has(n) && part.props.get(n) != null && part.props.get(n) !== '' ? part.props.get(n) : part.extra && part.extra.get(n) ? part.extra.get(n).v : null);
    const init = extra('InitialSize');
    const fit = (g) => {
      if (!g) {
        const box = boxGeometry(size[0], size[1], size[2]);
        texPosAttribute(box);
        mesh.geometry = box;
        return;
      }
      g.userData.shared = true;
      const bb = g.boundingBox;
      const base = Array.isArray(init) ? init : [bb.max.x - bb.min.x, bb.max.y - bb.min.y, bb.max.z - bb.min.z];
      mesh.scale.set(size[0] / (base[0] || 1), size[1] / (base[1] || 1), size[2] / (base[2] || 1));
      mesh.geometry = g;
    };
    const inline = extra('MeshData');
    if (typeof inline === 'string' && inline.length > 8) {
      try {
        const bin = atob(inline.replace(/<[^>]*>/g, '').replace(/\s+/g, ''));
        const raw = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) raw[i] = bin.charCodeAt(i);
        fit(unionGeometry(raw));
        return holder;
      } catch {}
    }
    const url = extra('AssetId');
    if (typeof url === 'string' && url) loadUnionMesh(url).then(fit);
    else fit(null);
    return holder;
  }

  buildMesh(v, part, m, size) {
    const scale = m.props.get('Scale');
    const off = m.props.get('Offset');
    const vc = m.props.get('VertexColor');
    const c = this.partColor(part);
    const transp = this.partTransparency(part);
    const textured = !!m.props.get('TextureId');
    const mat = new Material2012({ color: rawColor(c.r, c.g, c.b), ks: 0.5, exp: 40, refl: textured ? 0 : part.props.get('Reflectance'), transparent: transp > 0, opacity: 1 - transp });
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
      const own = +d.props.get('Transparency') || 0;
      const lt = this.localTransparency.has(part) ? this.localTransparency.get(part) : this.world.era === 2018 && part.props.has('LocalTransparencyModifier') ? +part.props.get('LocalTransparencyModifier') || 0 : 0;
      const transp = lt > 0 ? 1 - (1 - own) * (1 - lt) : own;
      if (transp >= 1) continue;
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
        mesh.receiveShadow = true;
        v.group.add(mesh);
      } else {
        const dims = [[size[2], size[1]], [size[0], size[2]], [size[0], size[1]], [size[2], size[1]], [size[0], size[2]], [size[0], size[1]]][face] || [1, 1];
        const geo = new THREE.PlaneGeometry(dims[0], dims[1]);
        const mesh = new THREE.Mesh(geo, mat);
        const h = [size[0] / 2, size[1] / 2, size[2] / 2];
        const e = 0.002;
        switch (face) {
          case 0: mesh.position.set(h[0] + e, 0, 0); mesh.rotation.y = Math.PI / 2; break;
          case 1: mesh.position.set(0, h[1] + e, 0); mesh.rotation.set(-Math.PI / 2, 0, Math.PI); break;
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
        mesh.receiveShadow = true;
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
        const c3 = this.world.era === 2018 ? inst.props.get('Color3') : null;
        if (Array.isArray(c3)) mat.color.copy(srgb(c3[0], c3[1], c3[2]));
        else {
          const b = brick(inst.props.get('Color'));
          mat.color.copy(srgb(b.r, b.g, b.b));
        }
        line.visible = inst.props.get('Transparency') < 1;
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

  attachTerrain(inst) {
    if (this.terrainView && this.terrainView.inst === inst) return;
    if (this.terrainView) this.terrainView.dispose();
    const era = this.world.era === 2018 ? 2018 : 2012;
    const data = terrainOf(inst, era);
    this.terrain = data;
    this.terrainView = new TerrainView(this, inst, data, {
      atlas: era === 2018 ? contentTexture('platform/terrain/diffuse.png', { placeholder: 'rgb(128,128,128)' }) : null,
      cellMaterial: (m) => this.cellMaterial(m),
    });
  }

  cellMaterial(m) {
    const c = CELL_COLORS[m] || [127, 127, 127];
    const kind = CELL_KIND[m] || 'plastic';
    const def = MATERIALS[kind] || MATERIALS.plastic;
    const water = m === CELL_WATER;
    const mat = new Material2012({ color: rawColor(c[0] / 255, c[1] / 255, c[2] / 255), ks: water ? 0.8 : def.ks, exp: water ? 80 : def.exp, transparent: water, opacity: water ? 0.55 : 1, depthWrite: !water });
    if (def.tex && !water) mat.setMaterialTexture(materialTexture(def.tex), def);
    return mat;
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
    if (this.terrain) this.terrain.flush();
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
    if (this.asms.size) this.asmStep();
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
      const sc = this.sun.shadow.camera;
      const texel = (sc.right - sc.left) / (this.sun.shadow.mapSize.x || 2048);
      const dl = Math.hypot(d.x, d.y, d.z) || 1;
      const dx = d.x / dl, dy = d.y / dl, dz = d.z / dl;
      let rx = -dz, ry = 0, rz = dx;
      let rl = Math.hypot(rx, ry, rz);
      if (rl < 1e-4) { rx = 1; ry = 0; rz = 0; rl = 1; }
      rx /= rl; ry /= rl; rz /= rl;
      const ux = dy * rz - dz * ry, uy = dz * rx - dx * rz, uz = dx * ry - dy * rx;
      const a = Math.round((cam.x * rx + cam.y * ry + cam.z * rz) / texel) * texel;
      const b = Math.round((cam.x * ux + cam.y * uy + cam.z * uz) / texel) * texel;
      const c = cam.x * dx + cam.y * dy + cam.z * dz;
      const cx = rx * a + ux * b + dx * c, cy = ry * a + uy * b + dy * c, cz = rz * a + uz * b + dz * c;
      this.sun.position.set(cx + dx * 300, cy + dy * 300, cz + dz * 300);
      this.sun.target.position.set(cx, cy, cz);
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
