import * as THREE from 'three';
import { brick } from '../shared/brickcolor.js';
import { contentMesh, loadTexture } from './assets.js';

export const BODY_MESH = {
  Torso: { path: 'fonts/torso.mesh', size: [2, 2, 1], base: 'fonts/CompositTorsoBase.mesh' },
  'Left Arm': { path: 'fonts/leftarm.mesh', size: [1, 2, 1], base: 'fonts/CompositLeftArmBase.mesh' },
  'Right Arm': { path: 'fonts/rightarm.mesh', size: [1, 2, 1], base: 'fonts/CompositRightArmBase.mesh' },
  'Left Leg': { path: 'fonts/leftleg.mesh', size: [1, 2, 1], base: 'fonts/CompositLeftLegBase.mesh' },
  'Right Leg': { path: 'fonts/rightleg.mesh', size: [1, 2, 1], base: 'fonts/CompositRightLegBase.mesh' },
};
const LAYERS = [['pants', 'fonts/CompositPantsTemplate.mesh'], ['shirt', 'fonts/CompositShirtTemplate.mesh'], ['tshirt', 'fonts/CompositTShirt.mesh']];

function srgb(c) {
  return new THREE.Color().setRGB(c.r, c.g, c.b, THREE.SRGBColorSpace);
}

export function clothingOf(model) {
  const shirt = model.findChildOfClass('Shirt');
  const pants = model.findChildOfClass('Pants');
  const graphic = model.findChildOfClass('ShirtGraphic');
  const out = {
    shirt: shirt ? shirt.props.get('ShirtTemplate') : '',
    pants: pants ? pants.props.get('PantsTemplate') : '',
    tshirt: graphic ? graphic.props.get('Graphic') : '',
  };
  return out.shirt || out.pants || out.tshirt ? out : null;
}

export class CharacterAtlases {
  constructor(renderer) {
    this.r = renderer;
    this.cache = new WeakMap();
    this.cam = new THREE.OrthographicCamera(0, 1024, 512, 0, -1000, 1000);
  }

  colors(model) {
    const out = {};
    for (const name of Object.keys(BODY_MESH)) {
      const p = model.findChild(name);
      out[name] = p && p.isA('BasePart') ? p.props.get('BrickColor') : 194;
    }
    return out;
  }

  get(model) {
    const clothes = clothingOf(model);
    if (!clothes) return null;
    const colors = this.colors(model);
    const key = JSON.stringify([clothes, colors]);
    let e = this.cache.get(model);
    if (e && e.key === key) return e.rt.texture;
    if (!e) {
      const rt = new THREE.WebGLRenderTarget(1024, 512, { depthBuffer: false, generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter });
      e = { key, rt, gen: 0 };
      this.cache.set(model, e);
    }
    e.key = key;
    e.gen++;
    this.compose(e, clothes, colors, e.gen);
    return e.rt.texture;
  }

  async compose(e, clothes, colors, gen) {
    const scene = new THREE.Scene();
    const add = (geo, mat, order) => {
      const m = new THREE.Mesh(geo, mat);
      m.renderOrder = order;
      m.frustumCulled = false;
      scene.add(m);
    };
    const bases = await Promise.all(Object.entries(BODY_MESH).map(async ([name, d]) => [name, await contentMesh(d.base)]));
    if (e.gen !== gen) return;
    for (const [name, geo] of bases) {
      if (geo) add(geo, new THREE.MeshBasicMaterial({ color: srgb(brick(colors[name])), depthTest: false, depthWrite: false, side: THREE.DoubleSide }), 1);
    }
    if (gen === 1) this.draw(e, scene);
    const layers = await Promise.all(LAYERS.map(async ([k, path], i) => {
      if (!clothes[k]) return null;
      const [geo, tex] = await Promise.all([contentMesh(path), loadTexture(clothes[k])]);
      return geo && tex ? [geo, tex, i] : null;
    }));
    if (e.gen !== gen) {
      for (const o of scene.children) o.material.dispose();
      return;
    }
    for (const l of layers) {
      if (!l) continue;
      const [geo, tex, i] = l;
      add(geo, new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false, side: THREE.DoubleSide }), 2 + i);
    }
    this.draw(e, scene);
    for (const o of scene.children) o.material.dispose();
  }

  draw(e, scene) {
    const r = this.r;
    const prev = r.getRenderTarget();
    const cc = r.getClearColor(new THREE.Color()), ca = r.getClearAlpha();
    r.setRenderTarget(e.rt);
    r.setClearColor(0x000000, 0);
    r.clear();
    r.render(scene, this.cam);
    r.setRenderTarget(prev);
    r.setClearColor(cc, ca);
  }
}

export const R15_GROUP = {
  UpperTorso: 'torso', LowerTorso: 'torso',
  LeftUpperArm: 'leftArm', LeftLowerArm: 'leftArm', LeftHand: 'leftArm',
  RightUpperArm: 'rightArm', RightLowerArm: 'rightArm', RightHand: 'rightArm',
  LeftUpperLeg: 'leftLeg', LeftLowerLeg: 'leftLeg', LeftFoot: 'leftLeg',
  RightUpperLeg: 'rightLeg', RightLowerLeg: 'rightLeg', RightFoot: 'rightLeg',
};
const R15_ATLAS = {
  torso: { base: 'avatar/compositing/R15CompositTorsoBase.mesh', w: 388, h: 272, layers: ['pants', 'shirt'], color: 'UpperTorso' },
  leftArm: { base: 'avatar/compositing/R15CompositLeftArmBase.mesh', w: 264, h: 284, layers: ['shirt'], color: 'LeftUpperArm' },
  rightArm: { base: 'avatar/compositing/R15CompositRightArmBase.mesh', w: 264, h: 284, layers: ['shirt'], color: 'RightUpperArm' },
  leftLeg: { base: 'avatar/compositing/R15CompositLeftArmBase.mesh', w: 264, h: 284, layers: ['pants'], color: 'LeftUpperLeg' },
  rightLeg: { base: 'avatar/compositing/R15CompositRightArmBase.mesh', w: 264, h: 284, layers: ['pants'], color: 'RightUpperLeg' },
};

export class R15Atlases {
  constructor(renderer) {
    this.r = renderer;
    this.cache = new WeakMap();
  }

  get(model, partName) {
    const group = R15_GROUP[partName];
    if (!group) return null;
    const clothes = clothingOf(model);
    if (!clothes) return null;
    const def = R15_ATLAS[group];
    const cp = model.findChild(def.color);
    const color = cp && cp.isA('BasePart') ? cp.props.get('Color') || null : null;
    const bc = cp && cp.isA('BasePart') ? cp.props.get('BrickColor') : 194;
    const key = JSON.stringify([clothes.shirt, clothes.pants, color, bc]);
    let all = this.cache.get(model);
    if (!all) {
      all = {};
      this.cache.set(model, all);
    }
    let e = all[group];
    if (e && e.key === key) return e.rt.texture;
    if (!e) {
      const rt = new THREE.WebGLRenderTarget(def.w * 2, def.h * 2, { depthBuffer: false, generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter });
      rt.texture.colorSpace = THREE.SRGBColorSpace;
      e = { key, rt, gen: 0, cam: new THREE.OrthographicCamera(0, def.w, def.h, 0, -1000, 1000) };
      all[group] = e;
    }
    e.key = key;
    e.gen++;
    const tint = color && color.length === 3 ? new THREE.Color().setRGB(color[0], color[1], color[2], THREE.SRGBColorSpace) : srgb(brick(bc));
    this.compose(e, def, clothes, tint, e.gen);
    return e.rt.texture;
  }

  async compose(e, def, clothes, tint, gen) {
    const geo = await contentMesh(def.base);
    if (!geo || e.gen !== gen) return;
    const scene = new THREE.Scene();
    const add = (mat, order) => {
      const m = new THREE.Mesh(geo, mat);
      m.renderOrder = order;
      m.frustumCulled = false;
      scene.add(m);
    };
    add(new THREE.MeshBasicMaterial({ color: tint, depthTest: false, depthWrite: false, side: THREE.DoubleSide }), 1);
    this.draw(e, scene);
    const texs = await Promise.all(def.layers.map((k) => (clothes[k] ? loadTexture(clothes[k]) : null)));
    if (e.gen !== gen) {
      for (const o of scene.children) o.material.dispose();
      return;
    }
    texs.forEach((tex, i) => {
      if (tex) add(new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false, side: THREE.DoubleSide }), 2 + i);
    });
    this.draw(e, scene);
    for (const o of scene.children) o.material.dispose();
  }

  draw(e, scene) {
    const r = this.r;
    const prev = r.getRenderTarget();
    const cc = r.getClearColor(new THREE.Color()), ca = r.getClearAlpha();
    r.setRenderTarget(e.rt);
    r.setClearColor(0x000000, 0);
    r.clear();
    r.render(scene, e.cam);
    r.setRenderTarget(prev);
    r.setClearColor(cc, ca);
  }
}
