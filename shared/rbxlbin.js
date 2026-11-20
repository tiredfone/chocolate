import { tree } from './rbxl.js';

const BINARY_PROPS = new Set(['Tags', 'ChocolateTerrain', 'MeshData', 'ChildData', 'PhysicalConfigData']);
const CONTENT_PROPS = new Set(['MeshId', 'TextureId', 'TextureID', 'Texture', 'ShirtTemplate', 'PantsTemplate', 'Graphic', 'SoundId', 'Image',
  'SkyboxBk', 'SkyboxDn', 'SkyboxFt', 'SkyboxLf', 'SkyboxRt', 'SkyboxUp', 'MoonTextureId', 'SunTextureId', 'AnimationId', 'LinkedSource']);
const MAGIC = [0x3c, 0x72, 0x6f, 0x62, 0x6c, 0x6f, 0x78, 0x21, 0x89, 0xff, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00];
const te = new TextEncoder();

class Unsupported extends Error {}

function num(t) {
  t = String(t).trim();
  if (/^-?inf/i.test(t)) return t[0] === '-' ? -Infinity : Infinity;
  if (/^-?nan/i.test(t)) return NaN;
  const v = parseFloat(t);
  return Number.isFinite(v) ? v : 0;
}

function cnum(el, tag, d = 0) {
  for (const k of el.kids) if (k.tag === tag) return num(k.text);
  return d;
}

function hasKid(el, tag) {
  return el.kids.some((k) => k.tag === tag);
}

function unb64(text) {
  const s = atob(text.replace(/[^A-Za-z0-9+/]/g, ''));
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

const fview = new DataView(new ArrayBuffer(8));

function floatBits(v) {
  fview.setFloat32(0, v);
  const u = fview.getUint32(0);
  return ((u << 1) | (u >>> 31)) >>> 0;
}

function zig(v) {
  v = Math.trunc(v) | 0;
  return ((v << 1) ^ (v >> 31)) >>> 0;
}

function interleave(values) {
  const n = values.length;
  const out = new Uint8Array(n * 4);
  for (let i = 0; i < n; i++) {
    const v = values[i] >>> 0;
    out[i] = v >>> 24;
    out[n + i] = (v >>> 16) & 255;
    out[2 * n + i] = (v >>> 8) & 255;
    out[3 * n + i] = v & 255;
  }
  return out;
}

function concat(parts) {
  let n = 0;
  for (const p of parts) n += p.length;
  const out = new Uint8Array(n);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

function u32le(v) {
  const b = new Uint8Array(4);
  new DataView(b.buffer).setUint32(0, v >>> 0, true);
  return b;
}

function lz4Compress(src) {
  const n = src.length;
  const out = [];
  const table = new Int32Array(1 << 16).fill(-1);
  const hash = (i) => (Math.imul(src[i] | (src[i + 1] << 8) | (src[i + 2] << 16) | (src[i + 3] << 24), 2654435761) >>> 16) & 0xffff;
  const pushLen = (len) => {
    while (len >= 255) {
      out.push(255);
      len -= 255;
    }
    out.push(len);
  };
  let anchor = 0;
  let i = 0;
  const limit = n - 12;
  while (i < limit) {
    const h = hash(i);
    const cand = table[h];
    table[h] = i;
    if (cand >= 0 && i - cand < 65536 && src[cand] === src[i] && src[cand + 1] === src[i + 1] && src[cand + 2] === src[i + 2] && src[cand + 3] === src[i + 3]) {
      let ml = 4;
      const maxMatch = n - 5 - i;
      while (ml < maxMatch && src[cand + ml] === src[i + ml]) ml++;
      const lit = i - anchor;
      const tokPos = out.length;
      out.push(0);
      let tok = Math.min(lit, 15) << 4;
      if (lit >= 15) pushLen(lit - 15);
      for (let k = anchor; k < i; k++) out.push(src[k]);
      const off = i - cand;
      out.push(off & 255, off >> 8);
      const mlc = ml - 4;
      tok |= Math.min(mlc, 15);
      if (mlc >= 15) pushLen(mlc - 15);
      out[tokPos] = tok;
      i += ml;
      anchor = i;
    } else i++;
  }
  const lit = n - anchor;
  out.push(Math.min(lit, 15) << 4);
  if (lit >= 15) pushLen(lit - 15);
  for (let k = anchor; k < n; k++) out.push(src[k]);
  return Uint8Array.from(out);
}

function chunk(name, data, compress) {
  const head = new Uint8Array(16);
  for (let i = 0; i < name.length; i++) head[i] = name.charCodeAt(i);
  let body = data;
  let cl = 0;
  if (compress && data.length > 32) {
    const c = lz4Compress(data);
    if (c.length < data.length) {
      body = c;
      cl = c.length;
    }
  }
  const dv = new DataView(head.buffer);
  dv.setUint32(4, cl, true);
  dv.setUint32(8, data.length, true);
  return concat([head, body]);
}

function str(s) {
  const b = te.encode(s);
  return concat([u32le(b.length), b]);
}

const TYPE_OF_TAG = {
  string: 1, ProtectedString: 1, bool: 2, int: 3, float: 4, double: 5, UDim: 6, UDim2: 7, Color3: 12, Vector2: 13, Vector3: 14,
  CoordinateFrame: 16, CFrame: 16, token: 18, Ref: 19, Content: 1, BinaryString: 1,
};

function typeOf(el, name) {
  if (el.tag === 'BinaryString') {
    if (!BINARY_PROPS.has(name)) throw new Unsupported(el.tag + ' ' + name);
    return 1;
  }
  if (el.tag === 'Content' && !CONTENT_PROPS.has(name)) throw new Unsupported('Content ' + name);
  if (el.tag === 'Color3') {
    if (name === 'Color3uint8') return 26;
    return 12;
  }
  if (el.tag === 'int' && name === 'BrickColor') return 11;
  const t = TYPE_OF_TAG[el.tag];
  if (!t) throw new Unsupported(el.tag);
  return t;
}

function color3(el) {
  if (el.kids.some((k) => k.tag === 'R')) return [cnum(el, 'R'), cnum(el, 'G'), cnum(el, 'B')];
  const u = Number(BigInt.asUintN(32, BigInt(Math.trunc(num(el.text.trim() || '0')))));
  return [((u >>> 16) & 255) / 255, ((u >>> 8) & 255) / 255, (u & 255) / 255];
}

function encodeProp(type, els, name, ids) {
  const n = els.length;
  switch (type) {
    case 1: {
      const parts = [];
      for (const e of els) {
        let bytes;
        if (e.tag === 'BinaryString') bytes = unb64(e.text);
        else if (e.tag === 'Content') {
          const u = e.kids.find((k) => k.tag === 'url' || k.tag === 'uri');
          bytes = te.encode(u ? u.text.trim() : e.kids.length ? '' : e.text.trim());
        } else bytes = te.encode(e.text);
        parts.push(u32le(bytes.length), bytes);
      }
      return concat(parts);
    }
    case 2: return Uint8Array.from(els, (e) => (e.text.trim() === 'true' ? 1 : 0));
    case 3: return interleave(els.map((e) => zig(num(e.text))));
    case 4: return interleave(els.map((e) => floatBits(num(e.text))));
    case 5: {
      const b = new Uint8Array(n * 8);
      const dv = new DataView(b.buffer);
      els.forEach((e, i) => dv.setFloat64(i * 8, num(e.text), true));
      return b;
    }
    case 6: return concat([interleave(els.map((e) => floatBits(cnum(e, 'S')))), interleave(els.map((e) => zig(cnum(e, 'O'))))]);
    case 7: return concat([
      interleave(els.map((e) => floatBits(cnum(e, 'XS')))), interleave(els.map((e) => floatBits(cnum(e, 'YS')))),
      interleave(els.map((e) => zig(cnum(e, 'XO')))), interleave(els.map((e) => zig(cnum(e, 'YO')))),
    ]);
    case 11: return interleave(els.map((e) => Math.trunc(num(e.text)) >>> 0));
    case 12: {
      const c = els.map(color3);
      return concat([0, 1, 2].map((k) => interleave(c.map((v) => floatBits(v[k])))));
    }
    case 26: {
      const c = els.map(color3);
      const b = new Uint8Array(n * 3);
      c.forEach((v, i) => {
        for (let k = 0; k < 3; k++) b[k * n + i] = Math.max(0, Math.min(255, Math.round(v[k] * 255)));
      });
      return b;
    }
    case 13: return concat([interleave(els.map((e) => floatBits(cnum(e, 'X')))), interleave(els.map((e) => floatBits(cnum(e, 'Y'))))]);
    case 14: return concat(['X', 'Y', 'Z'].map((k) => interleave(els.map((e) => floatBits(cnum(e, k))))));
    case 16: {
      const rot = new Uint8Array(n * 37);
      const dv = new DataView(rot.buffer);
      const keys = ['R00', 'R01', 'R02', 'R10', 'R11', 'R12', 'R20', 'R21', 'R22'];
      const dflt = [1, 0, 0, 0, 1, 0, 0, 0, 1];
      els.forEach((e, i) => {
        const o = i * 37;
        rot[o] = 0;
        keys.forEach((k, j) => dv.setFloat32(o + 1 + j * 4, cnum(e, k, dflt[j]), true));
      });
      return concat([rot, ...['X', 'Y', 'Z'].map((k) => interleave(els.map((e) => floatBits(cnum(e, k)))))]);
    }
    case 18: return interleave(els.map((e) => Math.trunc(num(e.text)) >>> 0));
    case 19: {
      let prev = 0;
      const vals = els.map((e) => {
        const r = e.text.trim();
        let id = r === 'null' || r === '' ? -1 : ids.get(r);
        if (id === undefined) id = -1;
        const d = id - prev;
        prev = id;
        return zig(d);
      });
      return interleave(vals);
    }
    default: throw new Unsupported('type ' + type);
  }
}

export function xmlToBinary(xml, opts = {}) {
  const at = xml.indexOf('<roblox');
  if (at < 0) return null;
  let root;
  try {
    root = tree(xml, at, xml.length);
  } catch {
    return null;
  }
  const top = root.kids.find((k) => k.tag === 'roblox');
  if (!top) return null;
  const compress = opts.compress !== false;
  const insts = [];
  const ids = new Map();
  try {
    const walk = (item, parent) => {
      const rec = { cls: item.attrs.class || 'Instance', ref: item.attrs.referent || null, parent, props: new Map(), id: insts.length };
      insts.push(rec);
      if (rec.ref) ids.set(rec.ref, rec.id);
      for (const k of item.kids) {
        if (k.tag === 'Properties') {
          for (const p of k.kids) {
            const name = p.attrs.name;
            if (!name) throw new Unsupported('unnamed');
            rec.props.set(name, { el: p, type: typeOf(p, name) });
          }
        } else if (k.tag === 'Item') walk(k, rec.id);
      }
    };
    for (const k of top.kids) if (k.tag === 'Item') walk(k, -1);
    const groups = new Map();
    for (const r of insts) {
      const sig = r.cls + '\u0000' + [...r.props].map(([n, v]) => n + ':' + v.type + (v.el.tag === 'BinaryString' ? 'b' : '')).sort().join('|');
      let g = groups.get(sig);
      if (!g) {
        g = { cls: r.cls, list: [], names: [...r.props.keys()] };
        groups.set(sig, g);
      }
      g.list.push(r);
    }
    const chunks = [];
    let cid = 0;
    for (const g of groups.values()) {
      const id = cid++;
      const refs = [];
      let prev = 0;
      for (const r of g.list) {
        refs.push(zig(r.id - prev));
        prev = r.id;
      }
      chunks.push(chunk('INST', concat([u32le(id), str(g.cls), Uint8Array.of(0), u32le(g.list.length), interleave(refs)]), compress));
      for (const name of g.names) {
        const first = g.list[0].props.get(name);
        const body = encodeProp(first.type, g.list.map((r) => r.props.get(name).el), name, ids);
        chunks.push(chunk('PROP', concat([u32le(id), str(name), Uint8Array.of(first.type), body]), compress));
      }
    }
    const n = insts.length;
    const child = [], par = [];
    let pc = 0, pp = 0;
    for (const r of insts) {
      child.push(zig(r.id - pc));
      pc = r.id;
      par.push(zig(r.parent - pp));
      pp = r.parent;
    }
    chunks.push(chunk('PRNT', concat([Uint8Array.of(0), u32le(n), interleave(child), interleave(par)]), compress));
    chunks.push(chunk('END', te.encode('</roblox>'), false));
    const head = new Uint8Array(32);
    head.set(MAGIC, 0);
    const dv = new DataView(head.buffer);
    dv.setUint32(16, cid, true);
    dv.setUint32(20, n, true);
    return concat([head, ...chunks]);
  } catch (e) {
    if (e instanceof Unsupported) return null;
    throw e;
  }
}

export function isBinaryPlace(bytes) {
  return bytes && bytes.length >= 8 && String.fromCharCode(...bytes.subarray(0, 8)) === '<roblox!';
}
