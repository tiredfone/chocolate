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
    if (e) {
      e.dead = true;
      e.rt.dispose();
    }
    const rt = new THREE.WebGLRenderTarget(1024, 512, { depthBuffer: false, generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter });
    e = { key, rt };
    this.cache.set(model, e);
    this.compose(e, clothes, colors);
    return rt.texture;
  }

  async compose(e, clothes, colors) {
    const scene = new THREE.Scene();
    const add = (geo, mat, order) => {
      const m = new THREE.Mesh(geo, mat);
      m.renderOrder = order;
      m.frustumCulled = false;
      scene.add(m);
    };
    const bases = await Promise.all(Object.entries(BODY_MESH).map(async ([name, d]) => [name, await contentMesh(d.base)]));
    for (const [name, geo] of bases) {
      if (geo) add(geo, new THREE.MeshBasicMaterial({ color: srgb(brick(colors[name])), depthTest: false, depthWrite: false, side: THREE.DoubleSide }), 1);
    }
    this.draw(e, scene);
    const layers = await Promise.all(LAYERS.map(async ([k, path], i) => {
      if (!clothes[k]) return null;
      const [geo, tex] = await Promise.all([contentMesh(path), loadTexture(clothes[k])]);
      return geo && tex ? [geo, tex, i] : null;
    }));
    if (e.dead) return;
    for (const l of layers) {
      if (!l) continue;
      const [geo, tex, i] = l;
      add(geo, new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false, side: THREE.DoubleSide }), 2 + i);
    }
    this.draw(e, scene);
    for (const o of scene.children) o.material.dispose();
  }

  draw(e, scene) {
    if (e.dead) return;
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
