export const VOXEL = 4;
export const CHUNK = 16;
const N = CHUNK * CHUNK * CHUNK;
export const MAX_CHUNKS = 6000;
const ZERO = new Uint8Array(N);

export const SMOOTH_MATERIALS = ['Air', 'Water', 'Grass', 'Slate', 'Concrete', 'Brick', 'Sand', 'WoodPlanks', 'Rock', 'Glacier', 'Snow', 'Sandstone', 'Mud', 'Basalt', 'Ground', 'CrackedLava', 'Asphalt', 'Cobblestone', 'Ice', 'LeafyGrass', 'Salt', 'Limestone', 'Pavement'];
export const SMOOTH_COLORS = {
  Grass: [106, 127, 63], Slate: [63, 127, 107], Concrete: [127, 102, 63], Brick: [138, 86, 62], Sand: [143, 126, 95], WoodPlanks: [139, 109, 79], Rock: [102, 108, 111],
  Glacier: [101, 176, 234], Snow: [195, 199, 218], Sandstone: [137, 90, 71], Mud: [58, 46, 36], Basalt: [30, 30, 37], Ground: [102, 92, 59], CrackedLava: [232, 156, 74],
  Asphalt: [115, 123, 107], Cobblestone: [132, 123, 90], Ice: [129, 194, 224], LeafyGrass: [115, 132, 74], Salt: [198, 189, 181], Limestone: [206, 173, 148], Pavement: [148, 148, 140], Water: [12, 84, 92],
};
export const SMOOTH_TILES = { Grass: [0, 1, 2], Slate: [3, 3, 3], Concrete: [4, 5, 5], Brick: [6, 6, 6], Sand: [7, 8, 8], WoodPlanks: [9, 9, 9], Rock: [10, 10, 10], Glacier: [11, 12, 13], Snow: [14, 14, 14], Sandstone: [15, 16, 17], Mud: [18, 18, 18], Basalt: [19, 19, 19], Ground: [20, 20, 20], CrackedLava: [21, 21, 21], Asphalt: [22, 23, 23], Cobblestone: [24, 25, 25], Ice: [26, 27, 27], LeafyGrass: [28, 29, 29], Salt: [30, 31, 31], Limestone: [32, 33, 33], Pavement: [34, 35, 35] };
export const SMOOTH_TILING = { Grass: 0.25, Slate: 0.55, Concrete: 0.5, Brick: 0.5, Sand: 0.5, WoodPlanks: 0.5, Rock: 0.4, Glacier: 0.4, Snow: 0.4, Sandstone: 0.4, Mud: 0.4, Basalt: 0.4, Ground: 0.4, CrackedLava: 0.4, Asphalt: 0.4, Cobblestone: 0.4, Ice: 0.4, LeafyGrass: 0.3, Salt: 0.4, Limestone: 0.4, Pavement: 0.4 };

export const CELL_MATERIALS = ['Empty', 'Grass', 'Sand', 'Brick', 'Granite', 'Asphalt', 'Iron', 'Aluminum', 'Gold', 'WoodPlank', 'WoodLog', 'Gravel', 'CinderBlock', 'MossyStone', 'Cement', 'RedPlastic', 'BluePlastic', 'Water'];
export const CELL_COLORS = [null, [91, 154, 76], [214, 194, 141], [160, 82, 64], [126, 125, 122], [70, 70, 70], [122, 120, 117], [192, 193, 195], [213, 181, 54], [158, 116, 72], [110, 78, 48], [138, 132, 120], [150, 146, 140], [96, 116, 82], [180, 178, 170], [196, 40, 28], [13, 105, 172], [45, 110, 170]];
export const CELL_WATER = 17;
export const SMOOTH_WATER = 1;

const keyOf = (cx, cy, cz) => `${cx},${cy},${cz}`;
const div = (a) => Math.floor(a / CHUNK);
const mod = (a) => ((a % CHUNK) + CHUNK) % CHUNK;
const idx = (x, y, z) => (y * CHUNK + z) * CHUNK + x;

function b64(bytes) {
  if (typeof Buffer !== 'undefined') return Buffer.from(bytes).toString('base64');
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

function unb64(text) {
  const t = String(text).replace(/<[^>]*>/g, '').replace(/\s+/g, '');
  if (typeof Buffer !== 'undefined') return new Uint8Array(Buffer.from(t, 'base64'));
  const bin = atob(t);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

class Writer {
  constructor() {
    this.buf = new Uint8Array(1024);
    this.n = 0;
  }

  byte(v) {
    if (this.n >= this.buf.length) {
      const b = new Uint8Array(this.buf.length * 2);
      b.set(this.buf);
      this.buf = b;
    }
    this.buf[this.n++] = v & 255;
  }

  varint(v) {
    let z = v < 0 ? ((-v) << 1) - 1 : v << 1;
    do {
      let b = z & 127;
      z >>>= 7;
      if (z) b |= 128;
      this.byte(b);
    } while (z);
  }

  rle(arr) {
    let i = 0;
    while (i < arr.length) {
      const v = arr[i];
      let run = 1;
      while (i + run < arr.length && arr[i + run] === v && run < 65535) run++;
      this.varint(run);
      this.byte(v);
      i += run;
    }
  }

  bytes() {
    return this.buf.subarray(0, this.n);
  }
}

class Reader {
  constructor(b) {
    this.b = b;
    this.i = 0;
  }

  byte() {
    if (this.i >= this.b.length) throw new Error('terrain data ends early');
    return this.b[this.i++];
  }

  varint() {
    let z = 0, shift = 0, b;
    do {
      b = this.byte();
      z |= (b & 127) << shift;
      shift += 7;
    } while (b & 128 && shift < 35);
    z >>>= 0;
    return z & 1 ? -((z + 1) >>> 1) : z >>> 1;
  }

  rle(arr) {
    let i = 0;
    while (i < arr.length) {
      const run = this.varint();
      const v = this.byte();
      if (run <= 0 || i + run > arr.length) throw new Error('bad terrain run');
      arr.fill(v, i, i + run);
      i += run;
    }
  }
}

export class TerrainData {
  constructor(era = 2018) {
    this.era = era === 2018 ? 2018 : 2012;
    this.chunks = new Map();
    this.dirty = new Set();
    this.listeners = new Set();
  }

  chunk(cx, cy, cz, make) {
    const k = keyOf(cx, cy, cz);
    let c = this.chunks.get(k);
    if (!c && make && this.chunks.size < MAX_CHUNKS) {
      c = this.newChunk(cx, cy, cz);
      this.chunks.set(k, c);
    }
    return c;
  }

  newChunk(cx, cy, cz) {
    const cells = this.era !== 2018;
    return { cx, cy, cz, mat: new Uint8Array(N), occ: new Uint8Array(N), block: cells ? new Uint8Array(N) : ZERO, orient: cells ? new Uint8Array(N) : ZERO, count: 0 };
  }

  get(x, y, z) {
    const c = this.chunks.get(keyOf(div(x), div(y), div(z)));
    if (!c) return 0;
    return c.mat[idx(mod(x), mod(y), mod(z))];
  }

  occ(x, y, z) {
    const c = this.chunks.get(keyOf(div(x), div(y), div(z)));
    if (!c) return 0;
    const i = idx(mod(x), mod(y), mod(z));
    return c.mat[i] ? c.occ[i] : 0;
  }

  cell(x, y, z) {
    const c = this.chunks.get(keyOf(div(x), div(y), div(z)));
    if (!c) return [0, 0, 0, 0];
    const i = idx(mod(x), mod(y), mod(z));
    return [c.mat[i], c.occ[i], c.block[i], c.orient[i]];
  }

  set(x, y, z, mat, occ = 255, block = 0, orient = 0) {
    x |= 0;
    y |= 0;
    z |= 0;
    const cx = div(x), cy = div(y), cz = div(z);
    const c = this.chunk(cx, cy, cz, mat > 0);
    if (!c) return false;
    const i = idx(mod(x), mod(y), mod(z));
    const m = mat > 0 && occ > 0 ? mat : 0;
    const o = m ? Math.max(1, Math.min(255, occ | 0)) : 0;
    const cells = this.era !== 2018;
    const b = m && cells ? block & 7 : 0, r = m && cells ? orient & 3 : 0;
    if (c.mat[i] === m && c.occ[i] === o && c.block[i] === b && c.orient[i] === r) return false;
    if (!c.mat[i] && m) c.count++;
    else if (c.mat[i] && !m) c.count--;
    c.mat[i] = m;
    c.occ[i] = o;
    c.block[i] = b;
    c.orient[i] = r;
    this.touch(x, y, z);
    if (c.count <= 0) this.chunks.delete(keyOf(cx, cy, cz));
    return true;
  }

  touch(x, y, z) {
    const cx = div(x), cy = div(y), cz = div(z);
    const lx = mod(x), ly = mod(y), lz = mod(z);
    const r = (l) => [l === 0 ? -1 : 0, l === CHUNK - 1 ? 1 : 0];
    const [ax, bx] = r(lx), [ay, by] = r(ly), [az, bz] = r(lz);
    for (let a = ax; a <= bx; a++) for (let b = ay; b <= by; b++) for (let d = az; d <= bz; d++) this.dirty.add(keyOf(cx + a, cy + b, cz + d));
  }

  flush() {
    if (!this.dirty.size) return null;
    const keys = this.takeDirty();
    for (const l of this.listeners) {
      try {
        l(keys);
      } catch {}
    }
    return keys;
  }

  allKeys() {
    const out = new Set();
    for (const c of this.chunks.values()) for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (let d = -1; d <= 1; d++) out.add(keyOf(c.cx + a, c.cy + b, c.cz + d));
    return [...out];
  }

  takeDirty() {
    const d = [...this.dirty];
    this.dirty.clear();
    return d;
  }

  clear() {
    for (const k of this.chunks.keys()) this.dirty.add(k);
    for (const c of this.chunks.values()) for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (let d = -1; d <= 1; d++) this.dirty.add(keyOf(c.cx + a, c.cy + b, c.cz + d));
    this.chunks.clear();
  }

  bounds() {
    if (!this.chunks.size) return null;
    const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
    for (const c of this.chunks.values()) {
      lo[0] = Math.min(lo[0], c.cx * CHUNK); lo[1] = Math.min(lo[1], c.cy * CHUNK); lo[2] = Math.min(lo[2], c.cz * CHUNK);
      hi[0] = Math.max(hi[0], c.cx * CHUNK + CHUNK - 1); hi[1] = Math.max(hi[1], c.cy * CHUNK + CHUNK - 1); hi[2] = Math.max(hi[2], c.cz * CHUNK + CHUNK - 1);
    }
    return { lo, hi };
  }

  count() {
    let n = 0;
    for (const c of this.chunks.values()) n += c.count;
    return n;
  }

  encode(keys = null) {
    const w = new Writer();
    w.byte(67);
    w.byte(this.era === 2018 ? 2 : 1);
    const list = keys ? keys.map((k) => [k, this.chunks.get(k)]) : [...this.chunks].map(([k, c]) => [k, c]);
    w.varint(list.length);
    for (const [k, c] of list) {
      const [cx, cy, cz] = k.split(',').map(Number);
      w.varint(cx);
      w.varint(cy);
      w.varint(cz);
      if (!c) {
        w.byte(0);
        continue;
      }
      w.byte(1);
      w.rle(c.mat);
      w.rle(c.occ);
      if (this.era !== 2018) {
        w.rle(c.block);
        w.rle(c.orient);
      }
    }
    return b64(w.bytes());
  }

  decode(text) {
    const r = new Reader(unb64(text));
    if (r.byte() !== 67) throw new Error('not chocolate terrain data');
    const era = r.byte() === 2 ? 2018 : 2012;
    const n = r.varint();
    const changed = [];
    for (let i = 0; i < n; i++) {
      const cx = r.varint(), cy = r.varint(), cz = r.varint();
      const k = keyOf(cx, cy, cz);
      const has = r.byte();
      if (!has) {
        if (this.chunks.delete(k)) changed.push(k);
        continue;
      }
      if (!this.chunks.has(k) && this.chunks.size >= MAX_CHUNKS) throw new Error('too much terrain');
      const c = this.newChunk(cx, cy, cz);
      r.rle(c.mat);
      r.rle(c.occ);
      if (era !== 2018) {
        const bl = this.era !== 2018 ? c.block : new Uint8Array(N), or = this.era !== 2018 ? c.orient : new Uint8Array(N);
        r.rle(bl);
        r.rle(or);
      }
      for (let j = 0; j < N; j++) if (c.mat[j] > (this.era === 2018 ? SMOOTH_MATERIALS.length - 1 : CELL_MATERIALS.length - 1)) c.mat[j] = 0;
      for (let j = 0; j < N; j++) if (c.mat[j]) c.count++;
      if (c.count) this.chunks.set(k, c);
      else this.chunks.delete(k);
      changed.push(k);
    }
    for (const k of changed) {
      const [cx, cy, cz] = k.split(',').map(Number);
      for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (let d = -1; d <= 1; d++) this.dirty.add(keyOf(cx + a, cy + b, cz + d));
    }
    return changed;
  }

  fillBox(cf, size, mat, opts = {}) {
    const hx = size[0] / 2, hy = size[1] / 2, hz = size[2] / 2;
    const ext = [Math.abs(cf[3]) * hx + Math.abs(cf[4]) * hy + Math.abs(cf[5]) * hz, Math.abs(cf[6]) * hx + Math.abs(cf[7]) * hy + Math.abs(cf[8]) * hz, Math.abs(cf[9]) * hx + Math.abs(cf[10]) * hy + Math.abs(cf[11]) * hz];
    const lo = [0, 1, 2].map((k) => Math.floor((cf[k] - ext[k]) / VOXEL) - 1), hi = [0, 1, 2].map((k) => Math.floor((cf[k] + ext[k]) / VOXEL) + 1);
    if ((hi[0] - lo[0]) * (hi[1] - lo[1]) * (hi[2] - lo[2]) > 4e6) throw new Error('Region is too big');
    let n = 0;
    for (let y = lo[1]; y <= hi[1]; y++) for (let z = lo[2]; z <= hi[2]; z++) for (let x = lo[0]; x <= hi[0]; x++) {
      const occ = this.boxCover(cf, hx, hy, hz, x, y, z);
      if (occ <= 0) continue;
      if (this.writeVoxel(x, y, z, mat, occ, opts)) n++;
    }
    return n;
  }

  boxCover(cf, hx, hy, hz, x, y, z) {
    let inside = 0;
    for (let s = 0; s < 8; s++) {
      const px = (x + 0.25 + 0.5 * (s & 1)) * VOXEL, py = (y + 0.25 + 0.5 * ((s >> 1) & 1)) * VOXEL, pz = (z + 0.25 + 0.5 * ((s >> 2) & 1)) * VOXEL;
      const dx = px - cf[0], dy = py - cf[1], dz = pz - cf[2];
      const lx = cf[3] * dx + cf[6] * dy + cf[9] * dz, ly = cf[4] * dx + cf[7] * dy + cf[10] * dz, lz = cf[5] * dx + cf[8] * dy + cf[11] * dz;
      if (Math.abs(lx) <= hx && Math.abs(ly) <= hy && Math.abs(lz) <= hz) inside++;
    }
    return inside / 8;
  }

  fillBall(center, radius, mat, opts = {}) {
    const r = Math.max(0, radius);
    const lo = center.map((v) => Math.floor((v - r) / VOXEL) - 1), hi = center.map((v) => Math.floor((v + r) / VOXEL) + 1);
    if ((hi[0] - lo[0]) * (hi[1] - lo[1]) * (hi[2] - lo[2]) > 4e6) throw new Error('Region is too big');
    let n = 0;
    for (let y = lo[1]; y <= hi[1]; y++) for (let z = lo[2]; z <= hi[2]; z++) for (let x = lo[0]; x <= hi[0]; x++) {
      const d = Math.hypot((x + 0.5) * VOXEL - center[0], (y + 0.5) * VOXEL - center[1], (z + 0.5) * VOXEL - center[2]);
      const occ = Math.max(0, Math.min(1, (r - d) / VOXEL + 0.5));
      if (occ <= 0) continue;
      if (this.writeVoxel(x, y, z, mat, occ, opts)) n++;
    }
    return n;
  }

  writeVoxel(x, y, z, mat, occ, opts) {
    const [m0, o0] = this.cell(x, y, z);
    if (opts.subtract) {
      if (!m0) return false;
      const left = Math.max(0, o0 / 255 - occ);
      return this.set(x, y, z, left > 0.02 ? m0 : 0, Math.round(left * 255));
    }
    if (opts.paint) {
      if (!m0) return false;
      return this.set(x, y, z, mat, o0);
    }
    if (opts.only && m0) return false;
    const target = opts.max ? Math.max(o0 / 255 * (m0 ? 1 : 0), occ) : occ;
    return this.set(x, y, z, mat, Math.round(Math.max(target, m0 && m0 === mat ? o0 / 255 : 0) * 255));
  }
}

export function cellCenter(x, y, z) {
  return [x * VOXEL + VOXEL / 2, y * VOXEL + VOXEL / 2, z * VOXEL + VOXEL / 2];
}

export function worldToCell(p) {
  return [Math.floor(p[0] / VOXEL), Math.floor(p[1] / VOXEL), Math.floor(p[2] / VOXEL)];
}

const WEDGES = {
  1: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1], [0, 1, 1], [1, 1, 1]],
  2: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1], [1, 1, 1]],
  3: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1], [0, 1, 0], [1, 1, 1], [0, 1, 1]],
  4: [[0, 0, 0], [1, 0, 0], [0, 0, 1], [0, 1, 0], [1, 1, 0], [0, 1, 1]],
};

function hullFaces(pts) {
  const faces = [];
  const n = pts.length;
  const c = [0, 1, 2].map((k) => pts.reduce((s, p) => s + p[k], 0) / n);
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) for (let k = j + 1; k < n; k++) {
    const a = pts[i], b = pts[j], d = pts[k];
    const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], v = [d[0] - a[0], d[1] - a[1], d[2] - a[2]];
    let nn = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    const len = Math.hypot(...nn);
    if (len < 1e-9) continue;
    nn = nn.map((x) => x / len);
    let side = 0, ok = true;
    for (let m = 0; m < n && ok; m++) {
      const t = (pts[m][0] - a[0]) * nn[0] + (pts[m][1] - a[1]) * nn[1] + (pts[m][2] - a[2]) * nn[2];
      if (Math.abs(t) < 1e-9) continue;
      if (!side) side = Math.sign(t);
      else if (Math.sign(t) !== side) ok = false;
    }
    if (!ok) continue;
    if (side > 0) nn = nn.map((x) => -x);
    const key = nn.map((x) => x.toFixed(4)).join(',');
    if (faces.some((f) => f.key === key)) continue;
    const on = pts.filter((p) => Math.abs((p[0] - a[0]) * nn[0] + (p[1] - a[1]) * nn[1] + (p[2] - a[2]) * nn[2]) < 1e-9);
    const fc = [0, 1, 2].map((q) => on.reduce((s, p) => s + p[q], 0) / on.length);
    const ax = Math.abs(nn[0]) > 0.9 ? [0, 1, 0] : [1, 0, 0];
    const t1 = [nn[1] * ax[2] - nn[2] * ax[1], nn[2] * ax[0] - nn[0] * ax[2], nn[0] * ax[1] - nn[1] * ax[0]];
    const t2 = [nn[1] * t1[2] - nn[2] * t1[1], nn[2] * t1[0] - nn[0] * t1[2], nn[0] * t1[1] - nn[1] * t1[0]];
    on.sort((p, q) => Math.atan2((p[0] - fc[0]) * t2[0] + (p[1] - fc[1]) * t2[1] + (p[2] - fc[2]) * t2[2], (p[0] - fc[0]) * t1[0] + (p[1] - fc[1]) * t1[1] + (p[2] - fc[2]) * t1[2]) - Math.atan2((q[0] - fc[0]) * t2[0] + (q[1] - fc[1]) * t2[1] + (q[2] - fc[2]) * t2[2], (q[0] - fc[0]) * t1[0] + (q[1] - fc[1]) * t1[1] + (q[2] - fc[2]) * t1[2]));
    faces.push({ key, n: nn, pts: on });
  }
  for (const f of faces) {
    const [a, b, d] = f.pts;
    const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], v = [d[0] - a[0], d[1] - a[1], d[2] - a[2]];
    const cr = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    if (cr[0] * f.n[0] + cr[1] * f.n[1] + cr[2] * f.n[2] < 0) f.pts.reverse();
  }
  return faces;
}

const shapeCache = new Map();
function cellShape(block, orient) {
  const key = block * 4 + orient;
  let s = shapeCache.get(key);
  if (s) return s;
  const base = WEDGES[block];
  const rot = (p) => {
    let [x, z] = [p[0] - 0.5, p[2] - 0.5];
    for (let i = 0; i < orient; i++) [x, z] = [z, -x];
    return [x + 0.5, p[1], z + 0.5];
  };
  s = base ? hullFaces(base.map(rot)) : null;
  shapeCache.set(key, s);
  return s;
}

function pushQuadFace(out, pts, n) {
  for (let i = 1; i + 1 < pts.length; i++) {
    for (const p of [pts[0], pts[i], pts[i + 1]]) {
      out.pos.push(p[0], p[1], p[2]);
      out.nrm.push(n[0], n[1], n[2]);
      const ax = Math.abs(n[0]) > 0.6 ? 0 : Math.abs(n[1]) > 0.6 ? 1 : 2;
      const u = ax === 0 ? p[2] : p[0], v = ax === 1 ? p[2] : p[1];
      out.uv.push(u, v);
    }
  }
}

const FACES = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];

export function meshCells(t, cx, cy, cz) {
  const groups = new Map();
  const solid = [];
  const c = t.chunks.get(keyOf(cx, cy, cz));
  if (!c) return { groups, solid };
  const group = (m) => {
    let g = groups.get(m);
    if (!g) groups.set(m, (g = { pos: [], nrm: [], uv: [] }));
    return g;
  };
  for (let ly = 0; ly < CHUNK; ly++) for (let lz = 0; lz < CHUNK; lz++) for (let lx = 0; lx < CHUNK; lx++) {
    const i = idx(lx, ly, lz);
    const m = c.mat[i];
    if (!m) continue;
    const x = cx * CHUNK + lx, y = cy * CHUNK + ly, z = cz * CHUNK + lz;
    const ox = x * VOXEL, oy = y * VOXEL, oz = z * VOXEL;
    const g = group(m);
    const water = m === CELL_WATER;
    if (c.block[i] && !water) {
      for (const f of cellShape(c.block[i], c.orient[i])) {
        pushQuadFace(g, f.pts.map((p) => [ox + p[0] * VOXEL, oy + p[1] * VOXEL, oz + p[2] * VOXEL]), f.n);
      }
      continue;
    }
    for (const [dx, dy, dz] of FACES) {
      const [nm, , nb] = t.cell(x + dx, y + dy, z + dz);
      if (nm && !nb && (nm !== CELL_WATER || water)) continue;
      const h = VOXEL;
      let pts;
      if (dx) {
        const fx = dx > 0 ? ox + h : ox;
        pts = dx > 0 ? [[fx, oy, oz], [fx, oy + h, oz], [fx, oy + h, oz + h], [fx, oy, oz + h]] : [[fx, oy, oz], [fx, oy, oz + h], [fx, oy + h, oz + h], [fx, oy + h, oz]];
      } else if (dy) {
        const fy = dy > 0 ? oy + h : oy;
        pts = dy > 0 ? [[ox, fy, oz], [ox, fy, oz + h], [ox + h, fy, oz + h], [ox + h, fy, oz]] : [[ox, fy, oz], [ox + h, fy, oz], [ox + h, fy, oz + h], [ox, fy, oz + h]];
      } else {
        const fz = dz > 0 ? oz + h : oz;
        pts = dz > 0 ? [[ox, oy, fz], [ox + h, oy, fz], [ox + h, oy + h, fz], [ox, oy + h, fz]] : [[ox, oy, fz], [ox, oy + h, fz], [ox + h, oy + h, fz], [ox + h, oy, fz]];
      }
      pushQuadFace(g, pts, [dx, dy, dz]);
    }
  }
  for (const [m, g] of groups) if (m !== CELL_WATER) for (let i = 0; i < g.pos.length; i++) solid.push(g.pos[i]);
  return { groups, solid };
}

export function meshSmooth(t, cx, cy, cz) {
  const groups = new Map();
  const solid = [];
  const x0 = cx * CHUNK, y0 = cy * CHUNK, z0 = cz * CHUNK;
  const water = (x, y, z) => t.get(x, y, z) === SMOOTH_WATER;
  const dens = (x, y, z, wantWater) => {
    const m = t.get(x, y, z);
    if (!m) return 0;
    if ((m === SMOOTH_WATER) !== wantWater) return wantWater ? 0 : 0;
    return t.occ(x, y, z) / 255;
  };
  for (const wantWater of [false, true]) {
    const verts = new Map();
    const vert = (i, j, k) => {
      const key = `${i},${j},${k}`;
      let v = verts.get(key);
      if (v !== undefined) return v;
      let sx = 0, sy = 0, sz = 0, n = 0;
      const d = [];
      for (let c = 0; c < 8; c++) d.push(dens(i + (c & 1), j + ((c >> 1) & 1), k + ((c >> 2) & 1), wantWater));
      const edges = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];
      for (const [a, b] of edges) {
        const da = d[a] - 0.5, db = d[b] - 0.5;
        if ((da >= 0) === (db >= 0)) continue;
        const f = da / (da - db);
        const pa = [a & 1, (a >> 1) & 1, (a >> 2) & 1], pb = [b & 1, (b >> 1) & 1, (b >> 2) & 1];
        sx += pa[0] + (pb[0] - pa[0]) * f;
        sy += pa[1] + (pb[1] - pa[1]) * f;
        sz += pa[2] + (pb[2] - pa[2]) * f;
        n++;
      }
      if (!n) v = null;
      else {
        const gx = (d[1] + d[3] + d[5] + d[7]) - (d[0] + d[2] + d[4] + d[6]);
        const gy = (d[2] + d[3] + d[6] + d[7]) - (d[0] + d[1] + d[4] + d[5]);
        const gz = (d[4] + d[5] + d[6] + d[7]) - (d[0] + d[1] + d[2] + d[3]);
        const gl = Math.hypot(gx, gy, gz) || 1;
        v = { p: [(i + 0.5 + sx / n) * VOXEL, (j + 0.5 + sy / n) * VOXEL, (k + 0.5 + sz / n) * VOXEL], n: [-gx / gl, -gy / gl, -gz / gl] };
      }
      verts.set(key, v);
      return v;
    };
    for (let y = y0; y < y0 + CHUNK; y++) for (let z = z0; z < z0 + CHUNK; z++) for (let x = x0; x < x0 + CHUNK; x++) {
      const d0 = dens(x, y, z, wantWater);
      for (const ax of [0, 1, 2]) {
        const nx = x + (ax === 0), ny = y + (ax === 1), nz = z + (ax === 2);
        const d1 = dens(nx, ny, nz, wantWater);
        if ((d0 >= 0.5) === (d1 >= 0.5)) continue;
        if (wantWater && d0 < 0.5 && t.get(x, y, z) && !water(x, y, z)) continue;
        if (wantWater && d1 < 0.5 && t.get(nx, ny, nz) && !water(nx, ny, nz)) continue;
        const inside = d0 >= 0.5 ? [x, y, z] : [nx, ny, nz];
        const m = t.get(...inside);
        let cells;
        if (ax === 0) cells = [[x, y - 1, z - 1], [x, y, z - 1], [x, y, z], [x, y - 1, z]];
        else if (ax === 1) cells = [[x - 1, y, z - 1], [x - 1, y, z], [x, y, z], [x, y, z - 1]];
        else cells = [[x - 1, y - 1, z], [x, y - 1, z], [x, y, z], [x - 1, y, z]];
        const vs = cells.map((c) => vert(...c));
        if (vs.some((v) => !v)) continue;
        if (d0 < 0.5) vs.reverse();
        let g = groups.get(m);
        if (!g) groups.set(m, (g = { pos: [], nrm: [], uv: [] }));
        for (const tri of [[0, 1, 2], [0, 2, 3]]) {
          for (const q of tri) {
            const v = vs[q];
            g.pos.push(v.p[0], v.p[1], v.p[2]);
            g.nrm.push(v.n[0], v.n[1], v.n[2]);
            g.uv.push(0, 0);
            if (!wantWater) solid.push(v.p[0], v.p[1], v.p[2]);
          }
        }
      }
    }
  }
  return { groups, solid };
}

export function meshChunk(t, key) {
  const [cx, cy, cz] = key.split(',').map(Number);
  return t.era === 2018 ? meshSmooth(t, cx, cy, cz) : meshCells(t, cx, cy, cz);
}

export function terrainOf(inst, era) {
  if (!inst) return null;
  if (!inst.terrain) {
    inst.terrain = new TerrainData(era);
    const raw = inst.extra && inst.extra.get('ChocolateTerrain');
    if (raw && typeof raw.v === 'string') {
      try {
        inst.terrain.decode(raw.v);
      } catch {}
    }
  }
  return inst.terrain;
}

export function storeTerrain(inst) {
  if (!inst || !inst.terrain) return;
  if (!inst.extra) inst.extra = new Map();
  if (!inst.terrain.chunks.size) {
    inst.extra.delete('ChocolateTerrain');
    return;
  }
  inst.extra.set('ChocolateTerrain', { t: 'raw', v: `<BinaryString name="ChocolateTerrain">${inst.terrain.encode()}</BinaryString>` });
}

export function smoothIndex(material) {
  const i = SMOOTH_MATERIALS.indexOf(String(material));
  return i > 0 ? i : -1;
}

export function autowedge(d, x, y, z) {
  const [m] = d.cell(x, y, z);
  if (!m || m === CELL_WATER || d.get(x, y + 1, z) || !d.get(x, y - 1, z)) return false;
  const open = [[0, -1], [1, 0], [0, 1], [-1, 0]].map(([a, c]) => {
    const n = d.get(x + a, y, z + c);
    return !n || n === CELL_WATER;
  });
  const nOpen = open.filter(Boolean).length;
  if (nOpen === 1) return d.set(x, y, z, m, 255, 1, [2, 1, 0, 3][(open.indexOf(true) + 2) % 4]);
  if (nOpen === 2) {
    const i = open.indexOf(true), j = open.lastIndexOf(true);
    if (j - i === 2) return false;
    return d.set(x, y, z, m, 255, 2, [3, 2, 1, 0][j - i === 1 ? i : 3]);
  }
  return false;
}
