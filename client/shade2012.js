import * as THREE from 'three';

export const LIGHTS = {
  lamp0Dir: { value: new THREE.Vector3(0.4, 0.8, 0.3).normalize() },
  lamp0Color: { value: new THREE.Color(0.9, 0.9, 0.9) },
  lamp1Dir: { value: new THREE.Vector3(-0.4, -0.8, -0.3).normalize() },
  lamp1Color: { value: new THREE.Color(0.28, 0.28, 0.28) },
  ambColor: { value: new THREE.Color(0.5, 0.5, 0.5) },
  shadowTint: { value: new THREE.Color(0.7, 0.7, 0.72) },
  envMap: { value: null },
};

export const MATERIALS = {
  plastic: { ks: 0.75, exp: 81 },
  smoothplastic: { ks: 0.75, exp: 81 },
  neon: { ks: 0, exp: 1, neon: true },
  fabric: { ks: 0.1, exp: 20 },
  wood: { ks: 0.2696, exp: 4, tex: 'textures/WoodFallback.png', u: [0.01699672, 0.1353425, -0.03733006, 0], v: [-0.1155417, -0.07062286, -0.04077413, 0] },
  woodplanks: { ks: 0.2696, exp: 4, tex: 'textures/WoodFallback.png', u: [0.01699672, 0.1353425, -0.03733006, 0], v: [-0.1155417, -0.07062286, -0.04077413, 0] },
  slate: { ks: 0.1, exp: 40, tex: 'textures/SlateTileMono.png', u: [0.28, 0, 0, 0], v: [0, 0.28, 0, 0] },
  granite: { ks: 0.1, exp: 40, tex: 'textures/SlateTileMono.png', u: [0.28, 0, 0, 0], v: [0, 0.28, 0, 0] },
  brick: { ks: 0.1, exp: 40, tex: 'textures/SlateTileMono.png', u: [0.28, 0, 0, 0], v: [0, 0.28, 0, 0] },
  pebble: { ks: 0.1, exp: 40, tex: 'textures/SlateTileMono.png', u: [0.28, 0, 0, 0], v: [0, 0.28, 0, 0] },
  cobblestone: { ks: 0.1, exp: 40, tex: 'textures/SlateTileMono.png', u: [0.28, 0, 0, 0], v: [0, 0.28, 0, 0] },
  concrete: { ks: 0.19, exp: 14, tex: 'textures/ConcreteFallback.png', u: [0.18, 0, 0, 0], v: [0, 0.18, 0, 0] },
  sand: { ks: 0.19, exp: 14, tex: 'textures/ConcreteFallback.png', u: [0.18, 0, 0, 0], v: [0, 0.18, 0, 0] },
  corrodedmetal: { ks: 0.12, exp: 70, tex: 'textures/rust_combined.png', blend: true, u: [0.05, 0.0376, 0, 0], v: [-0.0376, 0.05, 0, 0] },
  diamondplate: { ks: 0, exp: 25, tex: 'textures/DiamondPlateFallback.png', u: [0.28, 0, 0, 0], v: [0, 0.28, 0, 0] },
  foil: { ks: 0, exp: 25, tex: 'textures/AluminumFallback.png', u: [0.06, 0, 0, 0], v: [0, 0.06, 0, 0] },
  metal: { ks: 0, exp: 25, tex: 'textures/AluminumFallback.png', u: [0.06, 0, 0, 0], v: [0, 0.06, 0, 0] },
  grass: { ks: 0.1, exp: 50, tex: 'textures/Grass_Texture_gray.jpg', u: [0.1, 0, 0, 0], v: [0, 0.1, 0, 0] },
  ice: { ks: 0, exp: 25, tex: 'textures/IceFallback.png', u: [0.06, 0, 0, 0], v: [0, 0.06, 0, 0] },
  glass: { ks: 0.75, exp: 81 },
  truss: { ks: 0.75, exp: 81 },
};

let ERA = 2012;
export function setShadeEra(e) {
  ERA = e === 2018 ? 2018 : 2012;
}
export function shadeEra() {
  return ERA;
}

const tex18 = (name, scale, extra = {}) => ({ tex: `platform/textures/${name}/diffuse.png`, mul: true, u: [1 / scale, 0, 0, 0], v: [0, 1 / scale, 0, 0], ...extra });
export const MATERIALS2018 = {
  plastic: { ks: 0.35, exp: 40 },
  smoothplastic: { ks: 0.25, exp: 60 },
  neon: { ks: 0, exp: 1, neon: true },
  fabric: { ks: 0.05, exp: 10, ...tex18('fabric', 4) },
  wood: { ks: 0.15, exp: 8, ...tex18('wood', 8) },
  woodplanks: { ks: 0.15, exp: 8, ...tex18('wood', 6) },
  slate: { ks: 0.1, exp: 20, ...tex18('slate', 8) },
  granite: { ks: 0.1, exp: 20, ...tex18('granite', 8) },
  marble: { ks: 0.4, exp: 60, ...tex18('marble', 8) },
  brick: { ks: 0.05, exp: 10, ...tex18('brick', 8) },
  pebble: { ks: 0.1, exp: 20, ...tex18('pebble', 6) },
  cobblestone: { ks: 0.1, exp: 20, ...tex18('cobblestone', 8) },
  concrete: { ks: 0.1, exp: 14, ...tex18('concrete', 8) },
  sand: { ks: 0.05, exp: 10, ...tex18('sand', 6) },
  corrodedmetal: { ks: 0.2, exp: 40, ...tex18('rust', 8) },
  diamondplate: { ks: 0.5, exp: 50, ...tex18('diamondplate', 4) },
  foil: { ks: 0.6, exp: 60, ...tex18('aluminum', 8) },
  metal: { ks: 0.5, exp: 50, ...tex18('metal', 8) },
  grass: { ks: 0.05, exp: 10, ...tex18('grass', 8) },
  ice: { ks: 0.6, exp: 80, ...tex18('ice', 8) },
  glass: { ks: 0.8, exp: 120 },
  truss: { ks: 0.35, exp: 40 },
};

const VS = `
#include <common>
#include <fog_pars_vertex>
#include <shadowmap_pars_vertex>
attribute vec3 tpos;
varying vec3 vWN;
varying vec3 vWV;
varying vec2 vUv;
varying vec3 vTP;
void main() {
  vec3 objectNormal = normal;
  vec3 transformedNormal = normalMatrix * objectNormal;
  vec3 transformed = position;
  vec4 mvPosition = modelViewMatrix * vec4(transformed, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  vec4 worldPosition = modelMatrix * vec4(transformed, 1.0);
  vWN = normalize((vec4(transformedNormal, 0.0) * viewMatrix).xyz);
  vWV = cameraPosition - worldPosition.xyz;
  vUv = uv;
  vTP = tpos;
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
uniform float specExp;
uniform float refl;
uniform float cutoff;
uniform vec3 lamp0Dir;
uniform vec3 lamp0Color;
uniform vec3 lamp1Dir;
uniform vec3 lamp1Color;
uniform vec3 ambColor;
uniform vec3 shadowTint;
uniform sampler2D map;
uniform sampler2D matMap;
uniform vec4 matU;
uniform vec4 matV;
uniform sampler2D studMap;
uniform float studRow;
uniform samplerCube envMap;
varying vec3 vWN;
varying vec3 vWV;
varying vec2 vUv;
varying vec3 vTP;
vec4 toGamma(vec4 c) {
  return vec4(mix(pow(c.rgb, vec3(0.41666)) * 1.055 - vec3(0.055), c.rgb * 12.92, vec3(lessThanEqual(c.rgb, vec3(0.0031308)))), c.a);
}
void main() {
  vec3 N = normalize(vWN);
  if (!gl_FrontFacing) N = -N;
  vec3 V = normalize(vWV);
  vec4 base = vec4(diffuse, alpha);
  #ifdef USE_MAP
    vec4 t = toGamma(texture2D(map, vUv));
    base *= t;
    if (base.a < cutoff) discard;
  #endif
  #ifdef STUD_ONLY
    vec2 so = vec2(vUv.x * 0.5, vUv.y * 0.25);
    vec2 sf = fract(so);
    vec4 sv = toGamma(textureGrad(studMap, vec2(sf.x, (4.0 - studRow + sf.y) / 5.0), dFdx(so) * vec2(1.0, 0.2), dFdy(so) * vec2(1.0, 0.2)));
    if (sv.a < 0.004) discard;
    gl_FragColor = vec4(sv.rgb * mix(shadowTint, vec3(1.0), dot(N, lamp0Dir) > 0.0 ? getShadowMask() : 0.0), sv.a);
    #include <fog_fragment>
    return;
  #endif
  #ifdef NEON
    vec3 lit = base.rgb;
  #else
    float ndl0 = dot(N, lamp0Dir);
    vec3 H = normalize(V + lamp0Dir);
    float spec = ndl0 > 0.0 ? pow(max(dot(N, H), 0.0), specExp) : 0.0;
    vec3 lit = clamp(base.rgb * (max(ndl0, 0.0) * lamp0Color + max(dot(N, lamp1Dir), 0.0) * lamp1Color + ambColor), 0.0, 1.0);
    #ifdef USE_MATTEX
      vec2 mt = vec2(dot(matU, vec4(vTP, 1.0)), dot(matV, vec4(vTP, 1.0)));
      vec4 m = toGamma(texture2D(matMap, mt));
      #ifdef MAT_BLEND
        lit = mix(lit, m.rgb, m.a);
      #elif defined(MAT_MUL)
        lit = lit * clamp(m.rgb * 1.45, 0.0, 1.6);
      #else
        lit = lit + m.rgb - 0.5;
      #endif
    #endif
    #ifdef USE_STUDS
      vec2 su = vec2(vUv.x * 0.5, vUv.y * 0.25);
      vec2 f = fract(su);
      vec2 auv = vec2(f.x, (4.0 - studRow + f.y) / 5.0);
      vec4 s = toGamma(textureGrad(studMap, auv, dFdx(su) * vec2(1.0, 0.2), dFdy(su) * vec2(1.0, 0.2)));
      lit = mix(lit, s.rgb, s.a);
    #endif
    lit += ks * spec * lamp0Color;
    #ifdef USE_ENV
      vec3 r = reflect(-V, N);
      vec3 env = toGamma(textureCube(envMap, vec3(-r.x, r.y, r.z))).rgb;
      lit = mix(lit, env, refl);
    #endif
    lit = clamp(lit, 0.0, 1.0);
    #ifdef ERA2018
      lit *= mix(shadowTint, vec3(1.0), ndl0 > 0.0 ? getShadowMask() : 1.0);
    #else
      lit *= mix(shadowTint, vec3(1.0), ndl0 > 0.0 ? getShadowMask() : 0.0);
    #endif
  #endif
  gl_FragColor = vec4(lit, base.a);
  #include <fog_fragment>
}`;

export class Material2012 extends THREE.ShaderMaterial {
  constructor(o = {}) {
    const uniforms = THREE.UniformsUtils.merge([THREE.UniformsLib.lights, THREE.UniformsLib.fog, {
      diffuse: { value: new THREE.Color(1, 1, 1) },
      alpha: { value: 1 },
      ks: { value: 0.75 },
      specExp: { value: 81 },
      refl: { value: 0 },
      cutoff: { value: 0 },
      map: { value: null },
      matMap: { value: null },
      matU: { value: new THREE.Vector4() },
      matV: { value: new THREE.Vector4() },
      studMap: { value: null },
      studRow: { value: 0 },
    }]);
    for (const k of Object.keys(LIGHTS)) uniforms[k] = LIGHTS[k];
    super({ uniforms, vertexShader: VS, fragmentShader: FS, lights: true, fog: true });
    this.defines = {};
    if (ERA === 2018) this.defines.ERA2018 = '';
    if (o.color) this.uniforms.diffuse.value.copy(o.color);
    if (o.ks !== undefined) this.uniforms.ks.value = o.ks;
    if (o.exp !== undefined) this.uniforms.specExp.value = o.exp;
    if (o.neon) this.defines.NEON = '';
    if (o.studOnly) this.defines.STUD_ONLY = '';
    if (o.refl > 0) {
      this.uniforms.refl.value = Math.min(1, o.refl);
      this.defines.USE_ENV = '';
    }
    if (o.cutoff) this.uniforms.cutoff.value = o.cutoff;
    for (const k of ['transparent', 'depthWrite', 'side', 'polygonOffset', 'polygonOffsetFactor', 'polygonOffsetUnits']) if (o[k] !== undefined) this[k] = o[k];
    this.opacity = o.opacity === undefined ? 1 : o.opacity;
    if (o.map) this.map = o.map;
  }

  get color() {
    return this.uniforms ? this.uniforms.diffuse.value : null;
  }

  get opacity() {
    return this._opacity === undefined ? 1 : this._opacity;
  }

  set opacity(v) {
    this._opacity = v;
    if (this.uniforms && this.uniforms.alpha) this.uniforms.alpha.value = v;
  }

  get map() {
    return this.uniforms ? this.uniforms.map.value : null;
  }

  set map(t) {
    if (!this.uniforms) return;
    this.uniforms.map.value = t;
    if (t) this.defines.USE_MAP = '';
    else delete this.defines.USE_MAP;
    this.needsUpdate = true;
  }

  setAlphaTest(v) {
    this.uniforms.cutoff.value = v;
  }

  setMaterialTexture(tex, def) {
    this.uniforms.matMap.value = tex;
    this.uniforms.matU.value.fromArray(def.u);
    this.uniforms.matV.value.fromArray(def.v);
    this.defines.USE_MATTEX = '';
    if (def.blend) this.defines.MAT_BLEND = '';
    if (def.mul) this.defines.MAT_MUL = '';
    this.needsUpdate = true;
  }

  setStuds(tex, row) {
    this.uniforms.studMap.value = tex;
    this.uniforms.studRow.value = row;
    this.defines.USE_STUDS = '';
    this.needsUpdate = true;
  }
}

export function rawColor(r, g, b) {
  return new THREE.Color().setRGB(r, g, b);
}

export function texPosAttribute(geo) {
  const P = geo.attributes.position, N = geo.attributes.normal, U = geo.attributes.uv;
  const out = new Float32Array(P.count * 3);
  for (let i = 0; i < P.count; i++) {
    out[i * 3] = U ? U.getX(i) : 0;
    out[i * 3 + 1] = U ? U.getY(i) : 0;
    out[i * 3 + 2] = N ? P.getX(i) * N.getX(i) + P.getY(i) * N.getY(i) + P.getZ(i) * N.getZ(i) : 0;
  }
  geo.setAttribute('tpos', new THREE.BufferAttribute(out, 3));
  return geo;
}

function applyLighting2018(L, sunDir) {
  const amb = L.props.get('Ambient');
  const out = L.props.has('OutdoorAmbient') ? L.props.get('OutdoorAmbient') : [0.5, 0.5, 0.5];
  const bright = L.props.get('Brightness');
  const top = L.props.get('ColorShift_Top');
  const bot = L.props.get('ColorShift_Bottom');
  const day = sunDir[1] >= 0;
  const d = day ? sunDir : [-sunDir[0], -sunDir[1], -sunDir[2]];
  const k = day ? Math.min(1, 0.25 + sunDir[1] * 4) : 0.15;
  LIGHTS.lamp0Dir.value.set(d[0], Math.max(d[1], 0.05), d[2]).normalize();
  LIGHTS.lamp1Dir.value.copy(LIGHTS.lamp0Dir.value).negate();
  const sun = [0, 1, 2].map((i) => Math.min(1.6, (0.62 + top[i] * 0.5) * bright * k));
  LIGHTS.lamp0Color.value.setRGB(sun[0], sun[1], sun[2]);
  LIGHTS.lamp1Color.value.setRGB(0.08 + bot[0] * 0.4, 0.08 + bot[1] * 0.4, 0.08 + bot[2] * 0.4);
  const a = [0, 1, 2].map((i) => Math.min(1, amb[i] + out[i] * 0.55));
  LIGHTS.ambColor.value.setRGB(a[0], a[1], a[2]);
  const t = [0, 1, 2].map((i) => Math.max(0.35, Math.min(1, (a[i] + 0.1) / (a[i] + sun[i] + 0.1))));
  LIGHTS.shadowTint.value.setRGB(t[0], t[1], t[2]);
}

export function applyLighting(L, sunDir) {
  if (ERA === 2018) return applyLighting2018(L, sunDir);
  const amb = L.props.get('Ambient');
  const bright = L.props.get('Brightness');
  const top = L.props.get('ColorShift_Top');
  const bot = L.props.get('ColorShift_Bottom');
  const sh = L.props.get('ShadowColor');
  const day = sunDir[1] >= 0;
  const d = day ? sunDir : [-sunDir[0], -sunDir[1], -sunDir[2]];
  const k = day ? Math.min(1, 0.35 + sunDir[1] * 3) : 0.3;
  LIGHTS.lamp0Dir.value.set(d[0], Math.max(d[1], 0.05), d[2]).normalize();
  LIGHTS.lamp1Dir.value.copy(LIGHTS.lamp0Dir.value).negate();
  LIGHTS.lamp0Color.value.setRGB((0.9 + top[0] * 0.6) * bright * k, (0.9 + top[1] * 0.6) * bright * k, (0.9 + top[2] * 0.6) * bright * k);
  LIGHTS.lamp1Color.value.setRGB(0.28 + bot[0] * 0.6, 0.28 + bot[1] * 0.6, 0.28 + bot[2] * 0.6);
  LIGHTS.ambColor.value.setRGB(amb[0], amb[1], amb[2]);
  LIGHTS.shadowTint.value.setRGB(sh[0], sh[1], sh[2]);
}
