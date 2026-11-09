const MAX_INSTANCES = 200000;
const MAX_DEPTH = 256;

const ENT = { lt: '<', gt: '>', amp: '&', quot: '"', apos: "'" };

function unesc(s) {
  if (s.indexOf('&') < 0) return s;
  return s.replace(/&(#x[0-9a-fA-F]+|#\d+|[a-z]+);/g, (m, e) => {
    if (e[0] === '#') {
      const cp = e[1] === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      if (!(cp > 0 && cp <= 0x10ffff) || (cp >= 0xd800 && cp <= 0xdfff)) return '';
      return String.fromCodePoint(cp);
    }
    return ENT[e] ?? m;
  });
}

function num(t) {
  t = String(t).trim();
  if (/^-?inf/i.test(t)) return t[0] === '-' ? -Infinity : Infinity;
  const v = parseFloat(t);
  return Number.isFinite(v) ? v : 0;
}

function parseAttrs(s) {
  const out = {};
  const re = /([\w.:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
  let m;
  while ((m = re.exec(s))) out[m[1]] = unesc(m[2] ?? m[3] ?? '');
  return out;
}

function tree(src, start, end) {
  const root = { tag: '#', attrs: {}, kids: [], text: '' };
  const stack = [root];
  let i = start;
  while (i < end) {
    const lt = src.indexOf('<', i);
    const cur = stack[stack.length - 1];
    if (lt < 0 || lt >= end) {
      cur.text += unesc(src.slice(i, end));
      break;
    }
    if (lt > i) cur.text += unesc(src.slice(i, lt));
    if (src.startsWith('<![CDATA[', lt)) {
      const e = src.indexOf(']]>', lt + 9);
      cur.text += src.slice(lt + 9, e < 0 ? end : e);
      i = e < 0 ? end : e + 3;
      continue;
    }
    const gt = src.indexOf('>', lt);
    if (gt < 0) break;
    if (src[lt + 1] === '/') {
      if (stack.length > 1) stack.pop();
    } else if (src[lt + 1] !== '!' && src[lt + 1] !== '?') {
      const self = src[gt - 1] === '/';
      const body = src.slice(lt + 1, self ? gt - 1 : gt);
      const sp = body.search(/\s/);
      const tag = sp < 0 ? body : body.slice(0, sp);
      const el = { tag, attrs: sp < 0 ? {} : parseAttrs(body.slice(sp)), kids: [], text: '' };
      cur.kids.push(el);
      if (!self) stack.push(el);
    }
    i = gt + 1;
  }
  return root;
}

function child(el, tag) {
  for (const k of el.kids) if (k.tag === tag) return k;
  return null;
}

function cnum(el, tag, d = 0) {
  const c = child(el, tag);
  return c ? num(c.text) : d;
}

function color32(u) {
  u = Number(BigInt.asUintN(32, BigInt(Math.trunc(num(u)))));
  return [((u >>> 16) & 255) / 255, ((u >>> 8) & 255) / 255, (u & 255) / 255];
}

function xmlProp(el) {
  const t = el.tag;
  switch (t) {
    case 'string': case 'ProtectedString':
      return ['string', el.text];
    case 'bool':
      return ['bool', el.text.trim() === 'true'];
    case 'int': case 'int64':
      return ['int', Math.trunc(num(el.text))];
    case 'float': case 'double':
      return ['number', num(el.text)];
    case 'token':
      return ['enum', Math.trunc(num(el.text))];
    case 'Vector3':
      return ['V3', [cnum(el, 'X'), cnum(el, 'Y'), cnum(el, 'Z')]];
    case 'Vector2':
      return ['V2', [cnum(el, 'X'), cnum(el, 'Y')]];
    case 'Color3':
      if (child(el, 'R')) return ['C3', [cnum(el, 'R'), cnum(el, 'G'), cnum(el, 'B')]];
      return ['C3', color32(el.text.trim() || '0')];
    case 'Color3uint8':
      return ['C3', color32(el.text.trim() || '0')];
    case 'CoordinateFrame': case 'CFrame':
      return ['CF', [cnum(el, 'X'), cnum(el, 'Y'), cnum(el, 'Z'),
        cnum(el, 'R00', 1), cnum(el, 'R01'), cnum(el, 'R02'),
        cnum(el, 'R10'), cnum(el, 'R11', 1), cnum(el, 'R12'),
        cnum(el, 'R20'), cnum(el, 'R21'), cnum(el, 'R22', 1)]];
    case 'UDim2':
      return ['UD2', [cnum(el, 'XS'), cnum(el, 'XO'), cnum(el, 'YS'), cnum(el, 'YO')]];
    case 'UDim':
      return ['UD', [cnum(el, 'S'), cnum(el, 'O')]];
    case 'Ref': {
      const r = el.text.trim();
      return ['Ref', r === 'null' || r === '' ? null : r];
    }
    case 'Content': case 'url': {
      const u = child(el, 'url') || child(el, 'uri');
      return ['Content', u ? u.text.trim() : el.kids.length ? '' : el.text.trim()];
    }
    default:
      return null;
  }
}

function parseXML(src) {
  const roots = [];
  let count = 0;
  const stack = [];
  let i = src.indexOf('<roblox');
  if (i < 0) throw new Error('not a Roblox XML file');
  const re = /<(\/?)(Item|Properties)\b([^>]*)>/g;
  re.lastIndex = i;
  let m;
  while ((m = re.exec(src))) {
    const closing = m[1] === '/';
    if (m[2] === 'Item') {
      if (closing) {
        stack.pop();
        continue;
      }
      if (++count > MAX_INSTANCES) throw new Error('too many instances');
      if (stack.length > MAX_DEPTH) throw new Error('nested too deeply');
      const a = parseAttrs(m[3]);
      const node = { cls: a.class || 'Instance', ref: a.referent || null, props: new Map(), children: [] };
      if (stack.length) stack[stack.length - 1].children.push(node);
      else roots.push(node);
      stack.push(node);
      if (m[3].trimEnd().endsWith('/')) stack.pop();
    } else if (!closing) {
      const end = src.indexOf('</Properties>', re.lastIndex);
      if (end < 0) break;
      const node = stack[stack.length - 1];
      const t = tree(src, re.lastIndex, end);
      if (node) {
        for (const p of t.kids) {
          const name = p.attrs.name;
          if (!name) continue;
          const v = xmlProp(p);
          if (v) node.props.set(name, { t: v[0], v: v[1] });
        }
      }
      re.lastIndex = end + 13;
    }
  }
  return roots;
}

function lz4(src, outLen) {
  const out = new Uint8Array(outLen);
  let i = 0, o = 0;
  const n = src.length;
  while (i < n) {
    const tok = src[i++];
    let lit = tok >> 4;
    if (lit === 15) {
      let k;
      do { k = src[i++]; lit += k; } while (k === 255);
    }
    if (o + lit > outLen) throw new Error('lz4 overflow');
    out.set(src.subarray(i, i + lit), o);
    i += lit;
    o += lit;
    if (i >= n) break;
    const off = src[i] | (src[i + 1] << 8);
    i += 2;
    let ml = tok & 15;
    if (ml === 15) {
      let k;
      do { k = src[i++]; ml += k; } while (k === 255);
    }
    ml += 4;
    if (off === 0 || off > o || o + ml > outLen) throw new Error('bad lz4');
    for (let k = 0; k < ml; k++, o++) out[o] = out[o - off];
  }
  if (o !== outLen) throw new Error('lz4 size mismatch');
  return out;
}

const ROT = {
  0x02: [1, 0, 0, 0, 1, 0, 0, 0, 1], 0x03: [1, 0, 0, 0, 0, -1, 0, 1, 0], 0x05: [1, 0, 0, 0, -1, 0, 0, 0, -1], 0x06: [1, 0, 0, 0, 0, 1, 0, -1, 0],
  0x07: [0, 1, 0, 1, 0, 0, 0, 0, -1], 0x09: [0, 0, 1, 1, 0, 0, 0, 1, 0], 0x0a: [0, -1, 0, 1, 0, 0, 0, 0, 1], 0x0c: [0, 0, -1, 1, 0, 0, 0, -1, 0],
  0x0d: [0, 1, 0, 0, 0, 1, 1, 0, 0], 0x0e: [0, 0, -1, 0, 1, 0, 1, 0, 0], 0x10: [0, -1, 0, 0, 0, -1, 1, 0, 0], 0x11: [0, 0, 1, 0, -1, 0, 1, 0, 0],
  0x14: [-1, 0, 0, 0, 1, 0, 0, 0, -1], 0x15: [-1, 0, 0, 0, 0, 1, 0, 1, 0], 0x17: [-1, 0, 0, 0, -1, 0, 0, 0, 1], 0x18: [-1, 0, 0, 0, 0, -1, 0, -1, 0],
  0x19: [0, 1, 0, -1, 0, 0, 0, 0, 1], 0x1b: [0, 0, -1, -1, 0, 0, 0, 1, 0], 0x1c: [0, -1, 0, -1, 0, 0, 0, 0, -1], 0x1e: [0, 0, 1, -1, 0, 0, 0, -1, 0],
  0x1f: [0, 1, 0, 0, 0, -1, -1, 0, 0], 0x20: [0, 0, 1, 0, 1, 0, -1, 0, 0], 0x22: [0, -1, 0, 0, 0, 1, -1, 0, 0], 0x23: [0, 0, -1, 0, -1, 0, -1, 0, 0],
};

const CONTENT_PROPS = new Set(['MeshId', 'TextureId', 'TextureID', 'Texture', 'ShirtTemplate', 'PantsTemplate', 'Graphic', 'SoundId', 'Image',
  'SkyboxBk', 'SkyboxDn', 'SkyboxFt', 'SkyboxLf', 'SkyboxRt', 'SkyboxUp', 'MoonTextureId', 'SunTextureId', 'AnimationId', 'LinkedSource']);

function parseBinary(bytes) {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const td = new TextDecoder();
  const u32 = (d, q) => d[q] | (d[q + 1] << 8) | (d[q + 2] << 16) | (d[q + 3] * 16777216);
  const raw = (d, q, n, size) => {
    const out = new Array(n);
    for (let i = 0; i < n; i++) {
      let u = 0;
      for (let b = 0; b < size; b++) u = u * 256 + d[q + b * n + i];
      out[i] = u;
    }
    return out;
  };
  const ints = (d, q, n) => raw(d, q, n, 4).map((u) => (u % 2 ? -(Math.floor(u / 2) + 1) : u / 2));
  const fbuf = new DataView(new ArrayBuffer(4));
  const floats = (d, q, n) => raw(d, q, n, 4).map((u) => {
    const v = ((u >>> 1) | ((u & 1) << 31)) >>> 0;
    fbuf.setUint32(0, v);
    return fbuf.getFloat32(0);
  });
  const classes = new Map();
  const insts = new Map();
  let parents = [];
  let p = 32;
  while (p + 16 <= bytes.length) {
    const name = td.decode(bytes.subarray(p, p + 4)).replace(/\0+$/, '');
    const cl = dv.getUint32(p + 4, true);
    const ul = dv.getUint32(p + 8, true);
    p += 16;
    let data;
    if (cl === 0) {
      data = bytes.subarray(p, p + ul);
      p += ul;
    } else {
      if (bytes[p] === 0x28 && bytes[p + 1] === 0xb5) throw new Error('zstd-compressed models are not supported');
      data = lz4(bytes.subarray(p, p + cl), ul);
      p += cl;
    }
    if (name === 'END') break;
    let q = 0;
    if (name === 'INST') {
      const id = u32(data, q); q += 4;
      const ln = u32(data, q); q += 4;
      const cn = td.decode(data.subarray(q, q + ln)); q += ln + 1;
      const n = u32(data, q); q += 4;
      if (n > MAX_INSTANCES || insts.size + n > MAX_INSTANCES) throw new Error('too many instances');
      const refs = ints(data, q, n);
      let acc = 0;
      const list = [];
      for (let i = 0; i < n; i++) {
        acc += refs[i];
        const node = { cls: cn, ref: String(acc), props: new Map(), children: [] };
        list.push(node);
        insts.set(acc, node);
      }
      classes.set(id, list);
    } else if (name === 'PROP') {
      const cid = u32(data, q); q += 4;
      const pl = u32(data, q); q += 4;
      const pn = td.decode(data.subarray(q, q + pl)); q += pl;
      const ty = data[q++];
      const list = classes.get(cid);
      if (!list) continue;
      const n = list.length;
      let vals = null;
      let t = null;
      switch (ty) {
        case 1: {
          vals = [];
          for (let i = 0; i < n; i++) {
            const l = u32(data, q); q += 4;
            vals.push(td.decode(data.subarray(q, q + l))); q += l;
          }
          t = CONTENT_PROPS.has(pn) ? 'Content' : 'string';
          break;
        }
        case 2: vals = Array.from(data.subarray(q, q + n), (b) => b !== 0); t = 'bool'; break;
        case 3: vals = ints(data, q, n); t = 'int'; break;
        case 4: vals = floats(data, q, n); t = 'number'; break;
        case 5: vals = []; for (let i = 0; i < n; i++) vals.push(new DataView(data.buffer, data.byteOffset).getFloat64(q + i * 8, true)); t = 'number'; break;
        case 7: {
          const S = floats(data, q, n), O = ints(data, q + n * 4, n), S2 = floats(data, q + n * 8, n), O2 = ints(data, q + n * 12, n);
          vals = S.map((s, i) => [s, O[i], S2[i], O2[i]]); t = 'UD2'; break;
        }
        case 11: vals = raw(data, q, n, 4); t = 'BC'; break;
        case 12: {
          const R = floats(data, q, n), G = floats(data, q + n * 4, n), B = floats(data, q + n * 8, n);
          vals = R.map((r, i) => [r, G[i], B[i]]); t = 'C3'; break;
        }
        case 13: {
          const X = floats(data, q, n), Y = floats(data, q + n * 4, n);
          vals = X.map((x, i) => [x, Y[i]]); t = 'V2'; break;
        }
        case 14: {
          const X = floats(data, q, n), Y = floats(data, q + n * 4, n), Z = floats(data, q + n * 8, n);
          vals = X.map((x, i) => [x, Y[i], Z[i]]); t = 'V3'; break;
        }
        case 16: {
          const ms = [];
          const ddv = new DataView(data.buffer, data.byteOffset, data.byteLength);
          for (let i = 0; i < n; i++) {
            const rid = data[q++];
            if (rid === 0) {
              const m9 = [];
              for (let k = 0; k < 9; k++) m9.push(ddv.getFloat32(q + k * 4, true));
              q += 36;
              ms.push(m9);
            } else ms.push(ROT[rid] || ROT[2]);
          }
          const X = floats(data, q, n), Y = floats(data, q + n * 4, n), Z = floats(data, q + n * 8, n);
          vals = ms.map((m, i) => [X[i], Y[i], Z[i], ...m]); t = 'CF'; break;
        }
        case 18: vals = raw(data, q, n, 4); t = 'enum'; break;
        case 19: {
          let a = 0;
          vals = ints(data, q, n).map((v) => { a += v; return a < 0 ? null : String(a); });
          t = 'Ref'; break;
        }
        case 26: vals = []; for (let i = 0; i < n; i++) vals.push([data[q + i] / 255, data[q + n + i] / 255, data[q + 2 * n + i] / 255]); t = 'C3'; break;
        default: break;
      }
      if (vals) for (let i = 0; i < n; i++) list[i].props.set(pn, { t, v: vals[i] });
    } else if (name === 'PRNT') {
      q += 1;
      const n = u32(data, q); q += 4;
      const a = ints(data, q, n), b = ints(data, q + n * 4, n);
      let ca = 0, pa = 0;
      parents = [];
      for (let i = 0; i < n; i++) {
        ca += a[i];
        pa += b[i];
        parents.push([ca, pa]);
      }
    }
  }
  const roots = [];
  const placed = new Set();
  for (const [c, pr] of parents) {
    const node = insts.get(c);
    if (!node || placed.has(node)) continue;
    placed.add(node);
    const par = pr < 0 ? null : insts.get(pr);
    let loop = false;
    if (par) {
      const seen = new Set([node]);
      let x = par;
      let up = parentOf;
      while (x) {
        if (seen.has(x)) { loop = true; break; }
        seen.add(x);
        x = up.get(x);
      }
    }
    if (par && !loop) {
      par.children.push(node);
      parentOf.set(node, par);
    } else roots.push(node);
  }
  parentOf.clear();
  return roots;
}

const parentOf = new Map();

export function parsePlace(input) {
  let bytes = null;
  let text = null;
  if (typeof input === 'string') text = input;
  else bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  if (bytes && bytes.length >= 8 && String.fromCharCode(...bytes.subarray(0, 8)) === '<roblox!') return parseBinary(bytes);
  if (text === null) text = new TextDecoder().decode(bytes);
  return parseXML(text);
}
