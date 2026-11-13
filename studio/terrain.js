import * as THREE from 'three';
import { el } from './ui.js';
import { contentUrl } from '../client/assets.js';
import { terrainOf, autowedge, VOXEL, CHUNK, SMOOTH_MATERIALS, CELL_MATERIALS, CELL_COLORS, CELL_WATER, SMOOTH_WATER } from '../shared/terrain.js';

const TOOLS_2018 = [
  ['generate', 'Generate', 'mt_generate'], ['add', 'Add', 'mt_add'], ['subtract', 'Subtract', 'mt_subtract'], ['paint', 'Paint', 'mt_paint'],
  ['grow', 'Grow', 'mt_grow'], ['erode', 'Erode', 'mt_erode'], ['smooth', 'Smooth', 'mt_smooth'], ['flatten', 'Flatten', 'mt_regions'], ['clear', 'Clear', null],
];
const TOOLS_2012 = [
  ['generate', 'Generate'], ['add', 'Add'], ['subtract', 'Remove'], ['paint', 'Paint'], ['elevate', 'Elevation'], ['crater', 'Crater'], ['smooth', 'Smoother'], ['clear', 'Clear'],
];
const BRUSH_TOOLS = new Set(['add', 'subtract', 'paint', 'grow', 'erode', 'smooth', 'flatten', 'elevate', 'crater']);
const keyOf = (cx, cy, cz) => `${cx},${cy},${cz}`;

function hash(x, z, seed) {
  let h = (x * 374761393 + z * 668265263 + seed * 2246822519) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function noise2(x, z, seed) {
  const x0 = Math.floor(x), z0 = Math.floor(z);
  const fx = x - x0, fz = z - z0;
  const sx = fx * fx * (3 - 2 * fx), sz = fz * fz * (3 - 2 * fz);
  const a = hash(x0, z0, seed), b = hash(x0 + 1, z0, seed), c = hash(x0, z0 + 1, seed), d = hash(x0 + 1, z0 + 1, seed);
  return a + (b - a) * sx + (c - a) * sz + (a - b - c + d) * sx * sz;
}

function fbm(x, z, seed, oct = 5) {
  let v = 0, amp = 0.5, f = 1, n = 0;
  for (let i = 0; i < oct; i++) {
    v += noise2(x * f, z * f, seed + i * 17) * amp;
    n += amp;
    amp *= 0.5;
    f *= 2;
  }
  return v / n;
}

export class TerrainTools {
  constructor(app) {
    this.app = app;
    this.era = app.era === 2018 ? 2018 : 2012;
    this.tool = null;
    this.size = this.era === 2018 ? 12 : 3;
    this.strength = 0.5;
    this.shape = 'sphere';
    this.material = this.era === 2018 ? 2 : 1;
    this.box = null;
    this.preview = null;
    this.stroke = null;
  }

  terrain() {
    const dm = this.app.dm;
    const ws = dm.services.get('Workspace');
    let inst = ws.findChildOfClass('Terrain');
    if (!inst) {
      inst = dm.create('Terrain', null);
      inst.props.set('Name', 'Terrain');
      inst.props.set('Anchored', true);
      inst.props.set('Locked', true);
      dm.setParent(inst, ws);
    }
    const data = terrainOf(inst, this.era);
    if (this.app.ph.terrainData !== data) this.app.ph.setTerrain(inst, data);
    if (this.app.r.attachTerrain) this.app.r.attachTerrain(inst);
    return { inst, data };
  }

  handles(id) {
    return id.startsWith('terrain:');
  }

  checked(id) {
    return id === 'terrain:' + this.tool || (id === 'terrain:editor' && this.app.ui.paneOpen('terrain'));
  }

  exec(id) {
    const name = id.slice(8);
    if (name === 'editor') return this.open(true);
    if (name === 'generate') return this.generate();
    if (name === 'clear') return this.clearAll();
    if (BRUSH_TOOLS.has(name)) {
      this.setTool(this.tool === name ? null : name);
      this.open(true);
    }
  }

  setTool(t) {
    this.tool = t;
    if (t && this.app.tool !== 'none') {
      this.app.tool = 'none';
      if (this.app.view) this.app.view.refreshSelection();
    }
    if (!t) this.hidePreview();
    this.renderPane();
    this.app.refreshUI();
    if (t) this.app.ui.status(`Terrain: ${this.label(t)}. Click and drag in the viewport.`);
  }

  active() {
    return !!this.tool && BRUSH_TOOLS.has(this.tool);
  }

  label(t) {
    const list = this.era === 2018 ? TOOLS_2018 : TOOLS_2012;
    const hit = list.find((x) => x[0] === t);
    return hit ? hit[1] : t;
  }

  open(show) {
    if (!this.box) {
      const body = this.app.ui.addPane('terrain', this.era === 2018 ? 'Terrain Editor' : 'Terrain', 'right');
      this.box = el('div', 'st-terrain', body);
    }
    this.app.ui.togglePane('terrain', show);
    this.renderPane();
  }

  icon(name) {
    return contentUrl(`textures/TerrainTools/${name}.png`);
  }

  renderPane() {
    const box = this.box;
    if (!box) return;
    box.replaceChildren();
    const tools = el('div', 'st-terrain-tools', box);
    for (const [id, label, ic] of this.era === 2018 ? TOOLS_2018 : TOOLS_2012) {
      const b = el('button', 'st-terrain-tool', tools);
      if (ic && this.era === 2018) {
        const i = el('i', null, b);
        i.style.backgroundImage = `url("${this.icon(ic)}")`;
      }
      el('span', null, b, label);
      if (this.tool === id) b.classList.add('active');
      b.addEventListener('click', () => this.exec('terrain:' + id));
    }
    const row = (label) => {
      const r = el('label', 'st-terrain-row', box);
      el('span', null, r, label);
      return r;
    };
    const slider = (label, min, max, step, get, set, fmt = (v) => v) => {
      const r = row(label);
      const s = el('input', null, r);
      s.type = 'range';
      s.min = min;
      s.max = max;
      s.step = step;
      s.value = get();
      const out = el('em', null, r, String(fmt(get())));
      s.addEventListener('input', () => {
        set(+s.value);
        out.textContent = String(fmt(+s.value));
      });
    };
    el('div', 'st-terrain-head', box, 'Brush Settings');
    if (this.era === 2018) slider('Size', 1, 64, 1, () => this.size, (v) => (this.size = v), (v) => `${v * 2} studs`);
    else slider('Size', 1, 12, 1, () => this.size, (v) => (this.size = v), (v) => `${v} cells`);
    slider('Strength', 0.1, 1, 0.05, () => this.strength, (v) => (this.strength = v), (v) => `${Math.round(v * 100)}%`);
    if (this.era === 2018) {
      const r = row('Shape');
      for (const s of ['sphere', 'cube']) {
        const b = el('button', 'st-terrain-shape', r);
        const i = el('i', null, b);
        i.style.backgroundImage = `url("${this.icon('icon_shape_' + s)}")`;
        b.title = s === 'sphere' ? 'Sphere' : 'Cube';
        if (this.shape === s) b.classList.add('active');
        b.addEventListener('click', () => {
          this.shape = s;
          this.renderPane();
        });
      }
    }
    el('div', 'st-terrain-head', box, 'Material');
    const grid = el('div', 'st-terrain-mats', box);
    const list = this.era === 2018 ? SMOOTH_MATERIALS.map((n, i) => [i, n]).filter(([i]) => i > 0) : CELL_MATERIALS.map((n, i) => [i, n]).filter(([i]) => i > 0);
    for (const [i, name] of list) {
      const b = el('button', 'st-terrain-mat', grid);
      b.title = name;
      if (this.era === 2018) b.style.backgroundImage = `url("${this.icon('mtrl_' + name.toLowerCase())}")`;
      else {
        const c = CELL_COLORS[i];
        b.style.background = `rgb(${c[0]},${c[1]},${c[2]})`;
      }
      el('span', null, b, name);
      if (this.material === i) b.classList.add('active');
      b.addEventListener('click', () => {
        this.material = i;
        this.renderPane();
      });
    }
    el('div', 'st-terrain-hint', box, this.era === 2018 ? 'Hold the left mouse button over the world to use a brush. Flatten levels terrain to the height where the stroke started.' : 'Terrain is made of 4-stud cells. Hold the left mouse button over the world to use a tool. Smoother adds wedges to the edges under the brush.');
  }

  hit(e, view) {
    const ray = view.ray(e);
    const o = ray.origin, d = ray.direction;
    const r = this.app.ph.raycast([o.x, o.y, o.z], [d.x * 3000, d.y * 3000, d.z * 3000], [], (p) => !this.app.hiddenPart(p));
    if (r.part) return { point: r.point, normal: r.normal, terrain: r.part.ClassName === 'Terrain' };
    if (Math.abs(d.y) > 1e-4) {
      const t = -o.y / d.y;
      if (t > 0 && t < 3000) return { point: [o.x + d.x * t, 0, o.z + d.z * t], normal: [0, 1, 0], terrain: false };
    }
    return null;
  }

  radius() {
    return this.era === 2018 ? this.size : this.size * VOXEL;
  }

  showPreview(h) {
    const scene = this.app.r.scene;
    const want = this.era === 2018 ? this.shape : 'cube';
    if (!this.preview || this.preview.userData.shape !== want) {
      this.hidePreview();
      const geo = want === 'sphere' ? new THREE.SphereGeometry(1, 24, 16) : new THREE.BoxGeometry(2, 2, 2);
      const mat = new THREE.MeshBasicMaterial({ color: 0x3b9cff, transparent: true, opacity: 0.22, depthWrite: false });
      this.preview = new THREE.Mesh(geo, mat);
      const wire = new THREE.LineSegments(new THREE.EdgesGeometry(geo, 30), new THREE.LineBasicMaterial({ color: 0x9fd0ff, transparent: true, opacity: 0.7 }));
      this.preview.add(wire);
      this.preview.userData.shape = want;
      this.preview.renderOrder = 997;
      scene.add(this.preview);
    }
    const c = this.center(h);
    const r = this.radius();
    this.preview.position.set(c[0], c[1], c[2]);
    this.preview.scale.set(r, r, r);
    this.preview.visible = true;
  }

  hidePreview() {
    if (this.preview) {
      this.preview.parent && this.preview.parent.remove(this.preview);
      this.preview.geometry.dispose();
      this.preview = null;
    }
  }

  center(h) {
    if (this.era === 2018) return h.point;
    const p = h.point.map((v, k) => v + h.normal[k] * (this.tool === 'add' ? 1 : -1));
    return p.map((v) => Math.floor(v / VOXEL) * VOXEL + VOXEL / 2);
  }

  hover(e, view) {
    if (!this.active()) return this.hidePreview();
    const h = this.hit(e, view);
    if (!h) return this.hidePreview();
    this.showPreview(h);
  }

  down(e, view) {
    const h = this.hit(e, view);
    if (!h) return { kind: 'terrain' };
    const { data } = this.terrain();
    this.stroke = { before: new Map(), keys: new Set(), plane: h.point[1], last: 0, data };
    this.apply(h);
    const timer = setInterval(() => {
      if (this.stroke && this.lastHit) this.apply(this.lastHit, true);
    }, 90);
    return {
      kind: 'terrain',
      move: (ev) => {
        const hh = this.hit(ev, view);
        if (!hh) return;
        this.showPreview(hh);
        this.lastHit = hh;
        this.apply(hh);
      },
      end: () => {
        clearInterval(timer);
        this.finishStroke();
      },
      cancel: () => {
        clearInterval(timer);
        this.finishStroke();
      },
    };
  }

  keysIn(lo, hi) {
    const out = [];
    const c0 = lo.map((v) => Math.floor(Math.floor(v / VOXEL - 1) / CHUNK)), c1 = hi.map((v) => Math.floor(Math.floor(v / VOXEL + 1) / CHUNK));
    for (let x = c0[0]; x <= c1[0]; x++) for (let y = c0[1]; y <= c1[1]; y++) for (let z = c0[2]; z <= c1[2]; z++) out.push(keyOf(x, y, z));
    return out;
  }

  remember(keys) {
    const s = this.stroke;
    const fresh = keys.filter((k) => !s.before.has(k));
    if (fresh.length) {
      const enc = s.data.encode(fresh);
      for (const k of fresh) s.before.set(k, enc);
    }
    for (const k of keys) s.keys.add(k);
  }

  apply(h, repeat = false) {
    const s = this.stroke;
    if (!s) return;
    const now = performance.now();
    if (!repeat && now - s.last < 45) return;
    s.last = now;
    this.lastHit = h;
    const c = this.center(h);
    const r = this.radius();
    const keys = this.keysIn(c.map((v) => v - r - VOXEL), c.map((v) => v + r + VOXEL));
    this.remember(keys);
    if (this.era === 2018) this.brushSmooth(s.data, c, r);
    else this.brushCells(s.data, c, h);
    this.share(keys);
  }

  brushSmooth(d, c, r) {
    const t = this.tool, k = this.strength;
    const lo = c.map((v) => Math.floor((v - r) / VOXEL) - 1), hi = c.map((v) => Math.floor((v + r) / VOXEL) + 1);
    const cover = (x, y, z) => {
      const px = (x + 0.5) * VOXEL - c[0], py = (y + 0.5) * VOXEL - c[1], pz = (z + 0.5) * VOXEL - c[2];
      if (this.shape === 'cube') return Math.min(...[px, py, pz].map((v) => Math.max(0, Math.min(1, (r - Math.abs(v)) / VOXEL + 0.5))));
      return Math.max(0, Math.min(1, (r - Math.hypot(px, py, pz)) / VOXEL + 0.5));
    };
    const N6 = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
    const writes = [];
    for (let y = lo[1]; y <= hi[1]; y++) for (let z = lo[2]; z <= hi[2]; z++) for (let x = lo[0]; x <= hi[0]; x++) {
      const f = cover(x, y, z);
      if (f <= 0) continue;
      const [m, o0] = d.cell(x, y, z);
      const o = m ? o0 / 255 : 0;
      let nm = m, no = o;
      if (t === 'add') {
        nm = m && m !== SMOOTH_WATER ? m : this.material;
        no = Math.max(o, Math.min(1, o + f * k));
        if (m === SMOOTH_WATER) no = Math.min(1, f * k + 0.2);
      } else if (t === 'subtract') {
        no = o - f * k;
      } else if (t === 'paint') {
        if (!m || f < 0.3) continue;
        nm = this.material;
      } else if (t === 'grow' || t === 'erode') {
        let near = 0, nmat = 0, empty = false;
        for (const [a, b, e] of N6) {
          const [mm, oo] = d.cell(x + a, y + b, z + e);
          if (mm && mm !== SMOOTH_WATER && oo > 127) {
            near++;
            nmat = mm;
          } else empty = true;
        }
        if (t === 'grow') {
          if (!near && !m) continue;
          nm = m && m !== SMOOTH_WATER ? m : nmat || this.material;
          no = Math.min(1, o + f * k * 0.5);
        } else {
          if (!m || !empty) continue;
          no = o - f * k * 0.5;
        }
      } else if (t === 'smooth') {
        let sum = 0, n = 0, best = m;
        for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (let e = -1; e <= 1; e++) {
          const [mm, oo] = d.cell(x + a, y + b, z + e);
          sum += mm && mm !== SMOOTH_WATER ? oo / 255 : 0;
          n++;
          if (!best && mm && mm !== SMOOTH_WATER) best = mm;
        }
        if (m === SMOOTH_WATER) continue;
        no = o + (sum / n - o) * f * k;
        nm = best || this.material;
      } else if (t === 'flatten') {
        const top = (y + 1) * VOXEL, bottom = y * VOXEL;
        const plane = this.stroke.plane;
        const want = Math.max(0, Math.min(1, (plane - bottom) / VOXEL));
        no = o + (want - o) * Math.min(1, f * k * 1.5);
        nm = m && m !== SMOOTH_WATER ? m : this.material;
        if (top < plane - VOXEL && !m) {
          let below = false;
          for (let yy = y - 1; yy >= y - 6; yy--) if (d.get(x, yy, z)) below = true;
          if (!below) continue;
        }
      }
      if (no < 0.02) {
        if (m) writes.push([x, y, z, 0, 0]);
        continue;
      }
      if (nm !== m || Math.round(no * 255) !== o0) writes.push([x, y, z, nm, Math.round(no * 255)]);
    }
    for (const [x, y, z, m, o] of writes) d.set(x, y, z, m, o);
  }

  brushCells(d, c, h) {
    const t = this.tool;
    const r = this.size - 1;
    const cc = c.map((v) => Math.floor(v / VOXEL));
    const inR = (a, b, e) => a * a + b * b + e * e <= (r + 0.5) * (r + 0.5);
    if (t === 'add' || t === 'subtract' || t === 'paint' || t === 'crater') {
      for (let a = -r; a <= r; a++) for (let b = -r; b <= r; b++) for (let e = -r; e <= r; e++) {
        if (t !== 'add' && t !== 'paint' && !inR(a, b, e)) continue;
        if (t === 'add' && !inR(a, b, e) && this.shape === 'sphere') continue;
        const x = cc[0] + a, y = cc[1] + b, z = cc[2] + e;
        if (t === 'add') {
          if (!d.get(x, y, z)) d.set(x, y, z, this.material, 255, 0, 0);
        } else if (t === 'paint') {
          const [m, , bl, or] = d.cell(x, y, z);
          if (m && inR(a, b, e)) d.set(x, y, z, this.material, 255, bl, or);
        } else d.set(x, y, z, 0);
      }
      if (t === 'crater') this.wedgeArea(d, cc, r + 2);
    } else if (t === 'elevate') {
      const up = h.normal[1] >= 0;
      for (let a = -r; a <= r; a++) for (let e = -r; e <= r; e++) {
        if (a * a + e * e > (r + 0.5) * (r + 0.5)) continue;
        const x = cc[0] + a, z = cc[2] + e;
        let top = null;
        for (let y = cc[1] + 12; y >= cc[1] - 24; y--) if (d.get(x, y, z) && d.get(x, y, z) !== CELL_WATER) {
          top = y;
          break;
        }
        if (top == null) continue;
        const m = d.get(x, top, z);
        if (up) {
          d.set(x, top, z, m, 255, 0, 0);
          d.set(x, top + 1, z, m, 255, 0, 0);
        } else d.set(x, top, z, 0);
      }
    } else if (t === 'smooth') {
      this.wedgeArea(d, cc, r + 1);
    }
  }

  wedgeArea(d, cc, r) {
    for (let a = -r; a <= r; a++) for (let b = -r; b <= r; b++) for (let e = -r; e <= r; e++) {
      const x = cc[0] + a, y = cc[1] + b, z = cc[2] + e;
      const [m, , bl] = d.cell(x, y, z);
      if (!m || m === CELL_WATER) continue;
      if (bl) d.set(x, y, z, m, 255, 0, 0);
    }
    for (let a = -r; a <= r; a++) for (let b = -r; b <= r; b++) for (let e = -r; e <= r; e++) autowedge(d, cc[0] + a, cc[1] + b, cc[2] + e);
  }

  share(keys) {
    const team = this.app.team;
    if (!team || !team.open || !keys.length) return;
    const d = this.terrain().data;
    team.send({ t: 'terr', d: d.encode(keys) });
  }

  finishStroke() {
    const s = this.stroke;
    this.stroke = null;
    if (!s || !s.keys.size) return;
    const keys = [...s.keys];
    const before = [...new Set(s.before.values())];
    const after = s.data.encode(keys);
    this.commit(`Terrain ${this.label(this.tool)}`, s.data, before, after, keys);
  }

  commit(name, d, before, after, keys) {
    const restore = (list) => {
      for (const enc of list) d.decode(enc);
      this.share(keys);
      this.app.markDirty();
    };
    this.app.record(name, () => restore(before), () => restore([after]));
  }

  clearAll() {
    const { data } = this.terrain();
    if (!data.chunks.size) return this.app.ui.status('There is no terrain to clear');
    const keys = data.allKeys();
    const before = data.encode(keys);
    data.clear();
    this.share(keys);
    this.commit('Clear Terrain', data, [before], data.encode(keys), keys);
  }

  async generate() {
    const opts = await this.app.ui.dialog('Generate Terrain', (body) => {
      const f = (label, input) => {
        const r = el('label', 'st-terrain-row', body);
        el('span', null, r, label);
        r.appendChild(input);
        return input;
      };
      const size = el('select');
      for (const [v, t] of [[256, 'Small (256 studs)'], [512, 'Medium (512 studs)'], [1024, 'Large (1024 studs)']]) {
        const o = el('option', null, size, t);
        o.value = v;
      }
      size.value = '512';
      f('Map Size', size);
      const height = el('input');
      height.type = 'range';
      height.min = 8;
      height.max = 120;
      height.value = 48;
      f('Hill Height', height);
      const water = el('input');
      water.type = 'checkbox';
      water.checked = true;
      f('Water', water);
      const caves = el('input');
      caves.type = 'checkbox';
      caves.checked = false;
      if (this.era === 2018) f('Caves', caves);
      const seed = el('input');
      seed.type = 'number';
      seed.value = String((Math.random() * 100000) | 0);
      f('Seed', seed);
      return () => ({ size: +size.value, height: +height.value, water: water.checked, caves: caves.checked, seed: +seed.value | 0 });
    });
    if (!opts) return;
    const { data } = this.terrain();
    const half = opts.size / 2;
    const lo = [-half, -24, -half], hi = [half, opts.height + 16, half];
    const keys = [...new Set([...this.keysIn(lo, hi), ...data.allKeys()])];
    const before = data.encode(keys);
    this.app.ui.status('Generating terrain...');
    await new Promise((r) => setTimeout(r, 20));
    if (this.era === 2018) this.generateSmooth(data, opts);
    else this.generateCells(data, opts);
    this.share(keys);
    this.commit('Generate Terrain', data, [before], data.encode(keys), keys);
    this.app.ui.status('Terrain generated');
  }

  heightAt(x, z, o) {
    const n = fbm(x / 160, z / 160, o.seed);
    const m = fbm(x / 60 + 100, z / 60, o.seed + 7, 3);
    return 4 + Math.pow(n, 1.6) * o.height * 1.6 + m * 6;
  }

  generateSmooth(d, o) {
    const n = Math.round(o.size / VOXEL / 2);
    const waterLevel = o.water ? 10 : -Infinity;
    const SM = (name) => SMOOTH_MATERIALS.indexOf(name);
    for (let x = -n; x < n; x++) for (let z = -n; z < n; z++) {
      const h = this.heightAt((x + 0.5) * VOXEL, (z + 0.5) * VOXEL, o);
      const top = Math.floor(h / VOXEL);
      for (let y = -4; y <= top; y++) {
        const occ = y < top ? 1 : Math.max(0.05, h / VOXEL - top);
        const wy = y * VOXEL;
        let mat;
        if (y === top || y === top - 1) mat = h < waterLevel + 3 ? SM('Sand') : h > o.height * 1.3 ? SM('Snow') : h > o.height * 0.9 ? SM('Rock') : SM('Grass');
        else mat = wy < -8 ? SM('Rock') : SM('Ground');
        if (o.caves && y < top - 2 && y > -3 && fbm(x / 6, (z + y * 37) / 6, o.seed + 3, 2) > 0.66) continue;
        d.set(x, y, z, mat, Math.round(occ * 255));
      }
      if (o.water) for (let y = top + 1; (y + 0.5) * VOXEL < waterLevel; y++) if (!d.get(x, y, z)) d.set(x, y, z, SMOOTH_WATER, 255);
    }
  }

  generateCells(d, o) {
    const n = Math.round(o.size / VOXEL / 2);
    const waterLevel = o.water ? 2 : -Infinity;
    for (let x = -n; x < n; x++) for (let z = -n; z < n; z++) {
      const h = this.heightAt((x + 0.5) * VOXEL, (z + 0.5) * VOXEL, o) / VOXEL;
      const top = Math.floor(h);
      for (let y = -2; y <= top; y++) d.set(x, y, z, y === top ? (top <= waterLevel ? 2 : 1) : y > top - 3 ? 11 : 4, 255, 0, 0);
      if (o.water) for (let y = top + 1; y <= waterLevel; y++) d.set(x, y, z, CELL_WATER, 255, 0, 0);
    }
    for (let x = -n; x < n; x++) for (let z = -n; z < n; z++) {
      for (let y = 40; y >= -2; y--) {
        const m = d.get(x, y, z);
        if (!m) continue;
        if (m !== CELL_WATER) autowedge(d, x, y, z);
        break;
      }
    }
  }
}

