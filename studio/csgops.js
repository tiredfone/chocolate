import * as C from '../shared/cframe.js';
import { parseCSG, base64Bytes, unionValue, unionBounds } from '../shared/csg.js';

const EPS = 1e-5;
const CSG_KEY = [86, 46, 110, 88, 49, 32, 48, 4, 52, 105, 12, 119, 12, 1, 94, 0, 26, 96, 55, 105, 29, 82, 43, 7, 79, 36, 89, 101, 83, 4, 122];

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const unit = (a) => {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};

class Plane {
  constructor(n, w) {
    this.n = n;
    this.w = w;
  }

  static from(a, b, c) {
    const n = unit(cross(sub(b, a), sub(c, a)));
    return new Plane(n, dot(n, a));
  }

  flip() {
    this.n = [-this.n[0], -this.n[1], -this.n[2]];
    this.w = -this.w;
  }

  clone() {
    return new Plane(this.n.slice(), this.w);
  }

  split(poly, coFront, coBack, front, back) {
    let type = 0;
    const types = [];
    for (const v of poly.v) {
      const t = dot(this.n, v) - this.w;
      const k = t < -EPS ? 2 : t > EPS ? 1 : 0;
      type |= k;
      types.push(k);
    }
    if (type === 0) (dot(this.n, poly.plane.n) > 0 ? coFront : coBack).push(poly);
    else if (type === 1) front.push(poly);
    else if (type === 2) back.push(poly);
    else {
      const f = [], b = [];
      for (let i = 0; i < poly.v.length; i++) {
        const j = (i + 1) % poly.v.length;
        const ti = types[i], tj = types[j], vi = poly.v[i], vj = poly.v[j];
        if (ti !== 2) f.push(vi);
        if (ti !== 1) b.push(vi);
        if ((ti | tj) === 3) {
          const t = (this.w - dot(this.n, vi)) / dot(this.n, sub(vj, vi));
          const v = lerp(vi, vj, t);
          f.push(v);
          b.push(v.slice());
        }
      }
      if (f.length >= 3) front.push(new Poly(f, poly.plane.clone()));
      if (b.length >= 3) back.push(new Poly(b, poly.plane.clone()));
    }
  }
}

class Poly {
  constructor(v, plane) {
    this.v = v;
    this.plane = plane || Plane.from(v[0], v[1], v[2]);
  }

  clone() {
    return new Poly(this.v.map((x) => x.slice()), this.plane.clone());
  }

  flip() {
    this.v.reverse();
    this.plane.flip();
  }
}

class Node {
  constructor(polys) {
    this.plane = null;
    this.front = null;
    this.back = null;
    this.polys = [];
    if (polys) this.build(polys);
  }

  invert() {
    const stack = [this];
    while (stack.length) {
      const n = stack.pop();
      for (const p of n.polys) p.flip();
      if (n.plane) n.plane.flip();
      const t = n.front;
      n.front = n.back;
      n.back = t;
      if (n.front) stack.push(n.front);
      if (n.back) stack.push(n.back);
    }
  }

  clip(polys) {
    if (!this.plane) return polys.slice();
    let front = [], back = [];
    for (const p of polys) this.plane.split(p, front, back, front, back);
    if (this.front) front = this.front.clip(front);
    back = this.back ? this.back.clip(back) : [];
    return front.concat(back);
  }

  clipTo(bsp) {
    const stack = [this];
    while (stack.length) {
      const n = stack.pop();
      n.polys = bsp.clip(n.polys);
      if (n.front) stack.push(n.front);
      if (n.back) stack.push(n.back);
    }
  }

  all() {
    const out = [];
    const stack = [this];
    while (stack.length) {
      const n = stack.pop();
      for (const p of n.polys) out.push(p);
      if (n.front) stack.push(n.front);
      if (n.back) stack.push(n.back);
    }
    return out;
  }

  build(polys) {
    const work = [[this, polys]];
    while (work.length) {
      const [n, list] = work.pop();
      if (!list.length) continue;
      if (!n.plane) n.plane = list[0].plane.clone();
      const front = [], back = [];
      for (const p of list) n.plane.split(p, n.polys, n.polys, front, back);
      if (front.length) {
        if (!n.front) n.front = new Node();
        work.push([n.front, front]);
      }
      if (back.length) {
        if (!n.back) n.back = new Node();
        work.push([n.back, back]);
      }
    }
  }
}

function union(a, b) {
  const A = new Node(a.map((p) => p.clone())), B = new Node(b.map((p) => p.clone()));
  A.clipTo(B);
  B.clipTo(A);
  B.invert();
  B.clipTo(A);
  B.invert();
  A.build(B.all());
  return A.all();
}

function subtract(a, b) {
  const A = new Node(a.map((p) => p.clone())), B = new Node(b.map((p) => p.clone()));
  A.invert();
  A.clipTo(B);
  B.clipTo(A);
  B.invert();
  B.clipTo(A);
  B.invert();
  A.build(B.all());
  A.invert();
  return A.all();
}

function boxPolys(hx, hy, hz) {
  const c = (x, y, z) => [x * hx, y * hy, z * hz];
  const faces = [
    [c(1, -1, -1), c(1, 1, -1), c(1, 1, 1), c(1, -1, 1)], [c(-1, -1, 1), c(-1, 1, 1), c(-1, 1, -1), c(-1, -1, -1)],
    [c(-1, 1, -1), c(-1, 1, 1), c(1, 1, 1), c(1, 1, -1)], [c(-1, -1, 1), c(-1, -1, -1), c(1, -1, -1), c(1, -1, 1)],
    [c(-1, -1, 1), c(1, -1, 1), c(1, 1, 1), c(-1, 1, 1)], [c(1, -1, -1), c(-1, -1, -1), c(-1, 1, -1), c(1, 1, -1)],
  ];
  return faces.map((f) => new Poly(f));
}

function wedgePolys(hx, hy, hz) {
  const a = [-hx, -hy, -hz], b = [hx, -hy, -hz], c = [hx, -hy, hz], d = [-hx, -hy, hz], e = [-hx, hy, hz], f = [hx, hy, hz];
  return [new Poly([a, b, c, d]), new Poly([d, c, f, e]), new Poly([a, e, f, b]), new Poly([a, d, e]), new Poly([b, f, c])].map(orient([0, -hy / 3, hz / 3]));
}

function cornerPolys(hx, hy, hz) {
  const a = [-hx, -hy, -hz], b = [hx, -hy, -hz], c = [hx, -hy, hz], d = [-hx, -hy, hz], t = [hx, hy, -hz];
  return [new Poly([a, b, c, d]), new Poly([b, t, c]), new Poly([a, t, b]), new Poly([d, c, t]), new Poly([a, d, t])].map(orient([hx / 3, -hy / 2, -hz / 3]));
}

function orient(mid) {
  return (p) => {
    const ctr = p.v.reduce((s, v) => [s[0] + v[0] / p.v.length, s[1] + v[1] / p.v.length, s[2] + v[2] / p.v.length], [0, 0, 0]);
    if (dot(p.plane.n, sub(ctr, mid)) < 0) p.flip();
    return p;
  };
}

function cylinderPolys(hx, hy, hz, seg = 24) {
  const r = Math.min(hy, hz);
  const ring = [];
  for (let i = 0; i < seg; i++) {
    const t = (i / seg) * Math.PI * 2;
    ring.push([Math.cos(t) * r, Math.sin(t) * r]);
  }
  const out = [];
  const cap = (x, rev) => {
    const v = ring.map(([y, z]) => [x, y, z]);
    out.push(new Poly(rev ? v.reverse() : v));
  };
  cap(hx, false);
  cap(-hx, true);
  for (let i = 0; i < seg; i++) {
    const [y0, z0] = ring[i], [y1, z1] = ring[(i + 1) % seg];
    out.push(new Poly([[-hx, y0, z0], [-hx, y1, z1], [hx, y1, z1], [hx, y0, z0]]));
  }
  return out.map(orient([0, 0, 0]));
}

function spherePolys(r, slices = 18, stacks = 12) {
  const out = [];
  const at = (i, j) => {
    const th = (i / slices) * Math.PI * 2, ph = (j / stacks) * Math.PI;
    return [Math.cos(th) * Math.sin(ph) * r, Math.cos(ph) * r, Math.sin(th) * Math.sin(ph) * r];
  };
  for (let i = 0; i < slices; i++) {
    for (let j = 0; j < stacks; j++) {
      const v = [at(i, j)];
      if (j > 0) v.push(at(i + 1, j));
      if (j < stacks - 1) v.push(at(i + 1, j + 1));
      v.push(at(i, j + 1));
      if (v.length >= 3) out.push(new Poly(v));
    }
  }
  return out.map(orient([0, 0, 0]));
}

function meshPolys(m, scale) {
  const out = [];
  for (let i = 0; i + 2 < m.idx.length; i += 3) {
    const v = [m.idx[i], m.idx[i + 1], m.idx[i + 2]].map((k) => [m.pos[k * 3] * scale[0], m.pos[k * 3 + 1] * scale[1], m.pos[k * 3 + 2] * scale[2]]);
    const n = cross(sub(v[1], v[0]), sub(v[2], v[0]));
    if (Math.hypot(n[0], n[1], n[2]) < 1e-9) continue;
    out.push(new Poly(v));
  }
  return out;
}

function localPolys(part) {
  const s = part.props.get('Size');
  const hx = s[0] / 2, hy = s[1] / 2, hz = s[2] / 2;
  if (part.isA('PartOperation')) {
    const inline = unionValue(part, 'MeshData');
    let m = null;
    try {
      if (typeof inline === 'string' && inline.replace(/<[^>]*>/g, '').trim()) m = parseCSG(base64Bytes(inline));
    } catch {}
    if (!m && part.csgMesh) m = part.csgMesh;
    if (m) {
      const init = unionValue(part, 'InitialSize');
      const base = Array.isArray(init) && init.every((v) => v > 0) ? init : unionBounds(m);
      return meshPolys(m, [s[0] / base[0], s[1] / base[1], s[2] / base[2]]);
    }
    return null;
  }
  if (part.ClassName === 'WedgePart') return wedgePolys(hx, hy, hz);
  if (part.ClassName === 'CornerWedgePart') return cornerPolys(hx, hy, hz);
  if (part.info.all.has('Shape')) {
    const sh = part.props.get('Shape');
    if (sh === 0) return spherePolys(Math.min(hx, hy, hz));
    if (sh === 2) return cylinderPolys(hx, hy, hz);
  }
  return boxPolys(hx, hy, hz);
}

function worldPolys(part) {
  const local = localPolys(part);
  if (!local) return null;
  const cf = part.props.get('CFrame');
  return local.map((p) => new Poly(p.v.map((v) => C.point(cf, v[0], v[1], v[2]))));
}

function encode(mesh) {
  const nv = mesh.pos.length / 3, ni = mesh.idx.length;
  const stride = 24;
  const buf = new Uint8Array(42 + 8 + nv * stride + 4 + ni * 4);
  const dv = new DataView(buf.buffer);
  buf.set([...'CSGMDL'].map((c) => c.charCodeAt(0)), 0);
  dv.setInt32(6, 2, true);
  dv.setInt32(42, nv, true);
  dv.setInt32(46, stride, true);
  let o = 50;
  for (let i = 0; i < nv; i++) {
    for (let k = 0; k < 3; k++) dv.setFloat32(o + k * 4, mesh.pos[i * 3 + k], true);
    for (let k = 0; k < 3; k++) dv.setFloat32(o + 12 + k * 4, mesh.nrm[i * 3 + k], true);
    o += stride;
  }
  dv.setInt32(o, ni, true);
  o += 4;
  for (let i = 0; i < ni; i++) dv.setInt32(o + i * 4, mesh.idx[i], true);
  for (let i = 0; i < buf.length; i++) buf[i] ^= CSG_KEY[i % CSG_KEY.length];
  let bin = '';
  for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
  return btoa(bin);
}

function toMesh(polys, center) {
  const pos = [], nrm = [], idx = [];
  for (const p of polys) {
    const n = p.plane.n;
    const base = pos.length / 3;
    for (const v of p.v) {
      pos.push(v[0] - center[0], v[1] - center[1], v[2] - center[2]);
      nrm.push(n[0], n[1], n[2]);
    }
    for (let i = 1; i + 1 < p.v.length; i++) idx.push(base, base + i, base + i + 1);
  }
  return { pos: new Float32Array(pos), nrm: new Float32Array(nrm), idx: new Uint32Array(idx) };
}

function bounds(polys) {
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (const p of polys) for (const v of p.v) for (let k = 0; k < 3; k++) {
    if (v[k] < lo[k]) lo[k] = v[k];
    if (v[k] > hi[k]) hi[k] = v[k];
  }
  return { lo, hi };
}

export function solid(parts) {
  const pos = parts.filter((p) => p.ClassName !== 'NegateOperation');
  const neg = parts.filter((p) => p.ClassName === 'NegateOperation');
  if (!pos.length) throw new Error('Select at least one part that is not negated');
  let acc = null;
  for (const p of pos) {
    const w = worldPolys(p);
    if (!w) throw new Error(`${p.props.get('Name')} has no geometry this Studio can combine`);
    acc = acc ? union(acc, w) : w;
  }
  for (const p of neg) {
    const w = worldPolys(p);
    if (w) acc = subtract(acc, w);
  }
  if (!acc.length) throw new Error('Nothing is left after subtracting the negated parts');
  const { lo, hi } = bounds(acc);
  const center = [(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, (lo[2] + hi[2]) / 2];
  const size = [Math.max(0.05, hi[0] - lo[0]), Math.max(0.05, hi[1] - lo[1]), Math.max(0.05, hi[2] - lo[2])];
  const mesh = toMesh(acc, center);
  return { center, size, mesh, data: encode(mesh) };
}

export function shapeOf(part) {
  const local = localPolys(part);
  if (!local) return null;
  const mesh = toMesh(local, [0, 0, 0]);
  return { mesh, data: encode(mesh) };
}
