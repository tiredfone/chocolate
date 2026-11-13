import * as THREE from 'three';
import { LIGHTS } from './shade2012.js';
import { meshChunk, SMOOTH_MATERIALS, SMOOTH_COLORS, SMOOTH_TILES, SMOOTH_TILING, CELL_WATER, SMOOTH_WATER } from '../shared/terrain.js';

const VS = `
#include <common>
#include <fog_pars_vertex>
#include <shadowmap_pars_vertex>
varying vec3 vWN;
varying vec3 vWP;
varying vec3 vWV;
void main() {
  vec3 objectNormal = normal;
  vec3 transformedNormal = normalMatrix * objectNormal;
  vec3 transformed = position;
  vec4 mvPosition = modelViewMatrix * vec4(transformed, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  vec4 worldPosition = modelMatrix * vec4(transformed, 1.0);
  vWN = normalize((vec4(transformedNormal, 0.0) * viewMatrix).xyz);
  vWP = worldPosition.xyz;
  vWV = cameraPosition - worldPosition.xyz;
  #include <shadowmap_vertex>
  #include <fog_vertex>
}`;

const FS = `
#include <common>
#include <packing>
#include <fog_pars_fragment>
#include <bsdfs>
#include <lights_pars_begin>
#include <shadowmap_pars_fragment>
#include <shadowmask_pars_fragment>
uniform vec3 diffuse;
uniform float alpha;
uniform float ks;
uniform float tiling;
uniform vec3 tiles;
uniform sampler2D atlas;
uniform float hasAtlas;
uniform float era2018;
uniform vec3 lamp0Dir;
uniform vec3 lamp0Color;
uniform vec3 lamp1Dir;
uniform vec3 lamp1Color;
uniform vec3 ambColor;
uniform vec3 shadowTint;
varying vec3 vWN;
varying vec3 vWP;
varying vec3 vWV;
float toGamma1(float c) {
  return c <= 0.0031308 ? c * 12.92 : pow(c, 0.41666) * 1.055 - 0.055;
}
float tileLum(float idx, vec2 uv) {
  vec2 slot = vec2(mod(idx, 6.0), floor(idx / 6.0 + 0.001));
  vec2 f = fract(uv);
  vec2 a = (slot + 0.125 + 0.75 * f) / 6.0;
  vec2 dx = dFdx(uv) * 0.125, dy = dFdy(uv) * 0.125;
  return toGamma1(textureGrad(atlas, vec2(a.x, 1.0 - a.y), dx, dy).g);
}
float noise3(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float n = dot(i, vec3(1.0, 57.0, 113.0));
  vec4 h = fract(sin(vec4(n, n + 1.0, n + 57.0, n + 58.0)) * 43758.5453);
  vec4 h2 = fract(sin(vec4(n + 113.0, n + 114.0, n + 170.0, n + 171.0)) * 43758.5453);
  vec4 m = mix(h, h2, f.z);
  vec2 k = mix(m.xz, m.yw, f.x);
  return mix(k.x, k.y, f.y);
}
void main() {
  vec3 N = normalize(vWN);
  if (!gl_FrontFacing) N = -N;
  vec3 V = normalize(vWV);
  vec3 base = diffuse;
  if (hasAtlas > 0.5) {
    vec3 w = pow(abs(N), vec3(4.0));
    w /= (w.x + w.y + w.z);
    vec3 p = vWP * tiling;
    float ly = tileLum(N.y >= 0.0 ? tiles.x : tiles.z, p.xz);
    float lx = tileLum(tiles.y, p.zy);
    float lz = tileLum(tiles.y, p.xy);
    float l = lx * w.x + ly * w.y + lz * w.z;
    base = diffuse * (0.45 + l * 1.1);
  } else {
    float n = noise3(vWP * 0.6) * 0.5 + noise3(vWP * 2.1) * 0.5;
    base = diffuse * (0.86 + n * 0.22);
  }
  float ndl0 = dot(N, lamp0Dir);
  vec3 H = normalize(V + lamp0Dir);
  float spec = ndl0 > 0.0 ? pow(max(dot(N, H), 0.0), 30.0) : 0.0;
  vec3 lit = clamp(base * (max(ndl0, 0.0) * lamp0Color + max(dot(N, lamp1Dir), 0.0) * lamp1Color + ambColor), 0.0, 1.0);
  lit += ks * spec * lamp0Color;
  lit = clamp(lit, 0.0, 1.0);
  float sm = ndl0 > 0.0 ? getShadowMask() : (era2018 > 0.5 ? 1.0 : 0.0);
  lit *= mix(shadowTint, vec3(1.0), sm);
  gl_FragColor = vec4(lit, alpha);
  #include <fog_fragment>
}`;

class TerrainMaterial extends THREE.ShaderMaterial {
  constructor(o) {
    const uniforms = THREE.UniformsUtils.merge([THREE.UniformsLib.lights, THREE.UniformsLib.fog, {
      diffuse: { value: new THREE.Color(1, 1, 1) },
      alpha: { value: 1 },
      ks: { value: 0.05 },
      tiling: { value: 0.125 },
      tiles: { value: new THREE.Vector3() },
      atlas: { value: null },
      hasAtlas: { value: 0 },
      era2018: { value: 0 },
    }]);
    for (const k of Object.keys(LIGHTS)) uniforms[k] = LIGHTS[k];
    super({ uniforms, vertexShader: VS, fragmentShader: FS, lights: true, fog: true });
    this.uniforms.diffuse.value.setRGB(o.color[0], o.color[1], o.color[2]);
    this.uniforms.era2018.value = o.era === 2018 ? 1 : 0;
    if (o.atlas) {
      this.uniforms.atlas.value = o.atlas;
      this.uniforms.hasAtlas.value = 1;
      this.uniforms.tiles.value.set(o.tiles[0], o.tiles[1], o.tiles[2]);
      this.uniforms.tiling.value = o.tiling;
    }
    if (o.ks !== undefined) this.uniforms.ks.value = o.ks;
    if (o.opacity !== undefined && o.opacity < 1) {
      this.transparent = true;
      this.uniforms.alpha.value = o.opacity;
      this.depthWrite = false;
    }
  }
}

export class TerrainView {
  constructor(renderer, inst, data, opts = {}) {
    this.r = renderer;
    this.inst = inst;
    this.data = data;
    this.era = data.era;
    this.atlas = opts.atlas || null;
    this.cellMaterial = opts.cellMaterial || null;
    this.group = new THREE.Group();
    this.group.name = 'Terrain';
    renderer.scene.add(this.group);
    this.chunks = new Map();
    this.mats = new Map();
    this.listener = (keys) => this.update(keys);
    data.listeners.add(this.listener);
    this.update(data.allKeys());
  }

  waterColor() {
    const c = this.inst.props.get('WaterColor');
    return Array.isArray(c) && c[0] + c[1] + c[2] > 0.01 ? c : [12 / 255, 84 / 255, 92 / 255];
  }

  material(m) {
    let mat = this.mats.get(m);
    if (mat) return mat;
    if (this.era === 2018) {
      if (m === SMOOTH_WATER) {
        const t = this.inst.props.get('WaterTransparency');
        mat = new TerrainMaterial({ color: this.waterColor(), opacity: Math.max(0.25, 1 - (Number.isFinite(t) ? t : 0.3)), ks: 0.6, era: 2018 });
      } else {
        const name = SMOOTH_MATERIALS[m] || 'Grass';
        const own = this.inst.materialColors && this.inst.materialColors.get(name);
        const col = own || (SMOOTH_COLORS[name] || [127, 127, 127]).map((v) => v / 255);
        mat = new TerrainMaterial({ color: col, atlas: this.atlas, tiles: SMOOTH_TILES[name] || [0, 1, 2], tiling: (SMOOTH_TILING[name] || 0.4) * 0.5, era: 2018 });
      }
    } else if (this.cellMaterial) {
      mat = this.cellMaterial(m);
    }
    this.mats.set(m, mat);
    return mat;
  }

  update(keys) {
    if (this.inst.materialColors && this.inst.materialColors !== this.colorsSeen) {
      this.colorsSeen = this.inst.materialColors;
      this.resetMaterials();
    }
    for (const k of keys) {
      const old = this.chunks.get(k);
      if (old) {
        this.group.remove(old);
        old.traverse((o) => o.geometry && o.geometry.dispose());
        this.chunks.delete(k);
      }
      const { groups } = meshChunk(this.data, k);
      if (!groups.size) continue;
      const g = new THREE.Group();
      for (const [m, d] of groups) {
        if (!d.pos.length) continue;
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute(d.pos, 3));
        geo.setAttribute('normal', new THREE.Float32BufferAttribute(d.nrm, 3));
        geo.setAttribute('uv', new THREE.Float32BufferAttribute(d.uv, 2));
        if (this.era !== 2018) {
          const P = d.pos, N = d.nrm, U = d.uv;
          const tp = new Float32Array(P.length);
          for (let i = 0; i < P.length / 3; i++) {
            tp[i * 3] = U[i * 2];
            tp[i * 3 + 1] = U[i * 2 + 1];
            tp[i * 3 + 2] = P[i * 3] * N[i * 3] + P[i * 3 + 1] * N[i * 3 + 1] + P[i * 3 + 2] * N[i * 3 + 2];
          }
          geo.setAttribute('tpos', new THREE.BufferAttribute(tp, 3));
        }
        geo.computeBoundingSphere();
        const mesh = new THREE.Mesh(geo, this.material(m));
        mesh.userData.m = m;
        const water = this.era === 2018 ? m === SMOOTH_WATER : m === CELL_WATER;
        mesh.castShadow = !water;
        mesh.receiveShadow = true;
        if (water) mesh.renderOrder = 2;
        g.add(mesh);
      }
      this.chunks.set(k, g);
      this.group.add(g);
    }
  }

  resetMaterials() {
    for (const m of this.mats.values()) if (m && m.dispose) m.dispose();
    this.mats.clear();
    for (const g of this.chunks.values()) g.traverse((o) => {
      if (o.isMesh) o.material = this.material(o.userData.m);
    });
  }

  setVisible(v) {
    this.group.visible = v;
  }

  dispose() {
    this.data.listeners.delete(this.listener);
    this.r.scene.remove(this.group);
    this.group.traverse((o) => o.geometry && o.geometry.dispose());
    for (const m of this.mats.values()) if (m && m.dispose) m.dispose();
  }
}
