import * as THREE from 'three';

const settings = { publicPath: '/chocolate', endpoints: { asset: '/asset/?id={id}', coreScript: '/asset/?id={id}' } };

export function configure(cfg) {
  if (!cfg) return;
  if (cfg.publicPath) settings.publicPath = String(cfg.publicPath).replace(/\/+$/, '');
  if (cfg.endpoints) Object.assign(settings.endpoints, cfg.endpoints);
  if (cfg.version) settings.version = String(cfg.version);
}

export function publicPath(p) {
  return settings.publicPath + p;
}

export function endpointUrl(name, id) {
  const t = settings.endpoints[name];
  return t ? String(t).replace(/\{id\}/g, String(id | 0)) : null;
}

const images = new Map();
const meshes = new Map();
const raw = new Map();
const MAX_IMAGE = 2048;

export function assetId(url) {
  if (url == null) return null;
  const s = String(url).trim();
  if (!s) return null;
  const m = /[?&]id=(\d+)/i.exec(s);
  if (m) return +m[1];
  if (/^\d+$/.test(s)) return +s;
  return null;
}

export function builtin(url) {
  const m = /^rbxasset:\/\/(.+)$/i.exec(String(url || '').trim());
  return m ? m[1].replace(/\\/g, '/').replace(/^\/+/, '') : null;
}

const contentImages = new Map();
const LOCAL_CONTENT = {
  'textures/ui/touchcontrolssheet.png': '/client/ui/TouchControlsSheet.png',
  'textures/roblox-logo.png': '/client/ui/roblox-logo.png',
  'textures/ui/leavemenubkgd.png': '/client/ui/LeaveMenuBkgd.png',
  'textures/ui/leavemenuleavebtn.png': '/client/ui/LeaveMenuLeaveBtn.png',
  'textures/ui/leavemenucancelbtn.png': '/client/ui/LeaveMenuCancelBtn.png',
};
function contentImage(path) {
  if (path.includes('..')) return Promise.resolve(null);
  let p = contentImages.get(path);
  if (!p) {
    const local = LOCAL_CONTENT[path.toLowerCase()];
    p = fetch(local ? publicPath(local) : contentUrl(path))
      .then((r) => (r.ok ? r.blob() : null))
      .then((b) => (b ? createImageBitmap(b, { imageOrientation: 'flipY', premultiplyAlpha: 'none' }) : null))
      .catch(() => null);
    contentImages.set(path, p);
  }
  return p;
}

async function fetchBytes(id) {
  let p = raw.get(id);
  if (!p) {
    p = fetch(endpointUrl('asset', id), { credentials: 'same-origin' }).then(async (r) => {
      if (!r.ok) throw new Error('asset ' + id + ' ' + r.status);
      return new Uint8Array(await r.arrayBuffer());
    });
    raw.set(id, p);
    p.catch(() => raw.delete(id));
  }
  return p;
}

export async function assetBytes(id) {
  let bytes = await fetchBytes(id);
  if (bytes[0] === 0x25) {
    const nl = bytes.indexOf(10);
    if (nl > 0) bytes = bytes.subarray(nl + 1);
  }
  return bytes;
}

function looksLikeImage(b) {
  return (b[0] === 0x89 && b[1] === 0x50) || (b[0] === 0xff && b[1] === 0xd8) || (b[0] === 0x47 && b[1] === 0x49) || (b[0] === 0x42 && b[1] === 0x4d) || (b[0] === 0x52 && b[1] === 0x49 && b[8] === 0x57);
}

async function imageFromBytes(bytes, depth = 0) {
  if (looksLikeImage(bytes)) {
    const blob = new Blob([bytes]);
    const bmp = await createImageBitmap(blob, { imageOrientation: 'flipY', premultiplyAlpha: 'none' }).catch(() => createImageBitmap(blob));
    if (bmp.width > MAX_IMAGE || bmp.height > MAX_IMAGE) {
      const k = MAX_IMAGE / Math.max(bmp.width, bmp.height);
      return createImageBitmap(bmp, { resizeWidth: Math.round(bmp.width * k), resizeHeight: Math.round(bmp.height * k) });
    }
    return bmp;
  }
  const text = new TextDecoder().decode(bytes.subarray(0, 65536));
  if (depth < 2 && text.startsWith('<roblox')) {
    const m = /<(?:Content|url)[^>]*name="(?:Texture|ShirtTemplate|PantsTemplate|Graphic|Image)"[^>]*>\s*<url>([^<]+)<\/url>/i.exec(text) || /<url>([^<]*[?&]id=\d+[^<]*)<\/url>/i.exec(text);
    const id = m && assetId(m[1].replace(/&amp;/g, '&'));
    if (id) return imageFromBytes(await fetchBytes(id), depth + 1);
  }
  throw new Error('not an image');
}

export function loadImage(url) {
  const b = builtin(url);
  if (b) return contentImage(b);
  const id = assetId(url);
  if (!id) return Promise.resolve(null);
  let p = images.get(id);
  if (!p) {
    const attempt = async (n) => {
      try {
        return await imageFromBytes(await fetchBytes(id));
      } catch {
        raw.delete(id);
        if (n >= 3) return null;
        await new Promise((r) => setTimeout(r, 800 * 2 ** n));
        return attempt(n + 1);
      }
    };
    p = attempt(0);
    images.set(id, p);
    p.then((img) => { if (!img && images.get(id) === p) images.delete(id); });
  }
  return p;
}

const texCache = new Map();
export function loadTexture(url, opts = {}) {
  const key = String(url) + (opts.repeat ? ':r' : '') + (opts.nearest ? ':n' : '');
  let t = texCache.get(key);
  if (t) return t;
  t = loadImage(url).then((img) => {
    if (!img) return null;
    const isCanvas = img instanceof HTMLCanvasElement;
    const tex = isCanvas ? new THREE.CanvasTexture(img) : new THREE.Texture(img);
    tex.flipY = isCanvas;
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    if (opts.repeat) tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    if (opts.nearest) tex.magFilter = THREE.NearestFilter;
    tex.needsUpdate = true;
    return tex;
  });
  texCache.set(key, t);
  t.then((tex) => { if (!tex && texCache.get(key) === t) texCache.delete(key); });
  return t;
}

export function parseMesh(bytes) {
  const head = new TextDecoder().decode(bytes.subarray(0, 12));
  const mv = /^version (\d+)\.(\d+)/.exec(head);
  if (!mv) throw new Error('not a mesh');
  const major = +mv[1];
  const pos = [], nrm = [], uv = [];
  if (major === 1) {
    const sc = head.startsWith('version 1.00') ? 0.5 : 1;
    const text = new TextDecoder().decode(bytes);
    const vecs = [...text.matchAll(/\[([^\]]+)\]/g)].map((m) => m[1].split(',').map(Number));
    for (let i = 0; i + 2 < vecs.length; i += 3) {
      pos.push(vecs[i][0] * sc, vecs[i][1] * sc, vecs[i][2] * sc);
      nrm.push(vecs[i + 1][0] || 0, vecs[i + 1][1] || 0, vecs[i + 1][2] || 0);
      uv.push(vecs[i + 2][0] || 0, 1 - (vecs[i + 2][1] || 0));
    }
    return { pos: new Float32Array(pos), nrm: new Float32Array(nrm), uv: new Float32Array(uv) };
  }
  if (major !== 2 && major !== 3 && major !== 4 && major !== 5) throw new Error('mesh version ' + major + ' is not supported');
  const nl = bytes.indexOf(10);
  const at = nl + 1;
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const hs = dv.getUint16(at, true);
  let vsz = 40, fsz = 12, nv, nf, last;
  if (major === 2 || major === 3) {
    vsz = bytes[at + 2];
    fsz = bytes[at + 3];
    if (major === 3) {
      nv = dv.getUint32(at + 8, true);
      nf = dv.getUint32(at + 12, true);
    } else {
      nv = dv.getUint32(at + 4, true);
      nf = dv.getUint32(at + 8, true);
    }
  } else {
    nv = dv.getUint32(at + 4, true);
    nf = dv.getUint32(at + 8, true);
  }
  const vo = at + hs;
  let fo = vo + nv * vsz;
  if (major >= 4) {
    const nbones = dv.getUint16(at + 14, true);
    if (nbones > 0) fo += nv * 8;
  }
  last = nf;
  if (major === 3) {
    const nlod = dv.getUint16(at + 6, true);
    if (nlod > 1 && fo + nf * fsz + 8 <= bytes.length) {
      const l1 = dv.getUint32(fo + nf * fsz + 4, true);
      if (l1 > 0 && l1 <= nf) last = l1;
    }
  } else if (major >= 4) {
    const nlod = dv.getUint16(at + 12, true);
    if (nlod > 1 && fo + nf * 12 + 8 <= bytes.length) {
      const l1 = dv.getUint32(fo + nf * 12 + 4, true);
      if (l1 >= nf * 0.25 && l1 <= nf) last = l1;
    }
  }
  if (fo + last * fsz > bytes.length || nv > 2_000_000) throw new Error('truncated mesh');
  const P = new Float32Array(last * 9), N = new Float32Array(last * 9), U = new Float32Array(last * 6);
  for (let i = 0; i < last; i++) {
    for (let k = 0; k < 3; k++) {
      const vi = dv.getUint32(fo + i * fsz + k * 4, true);
      if (vi >= nv) throw new Error('bad mesh index');
      const o = vo + vi * vsz;
      const j = i * 3 + k;
      P[j * 3] = dv.getFloat32(o, true); P[j * 3 + 1] = dv.getFloat32(o + 4, true); P[j * 3 + 2] = dv.getFloat32(o + 8, true);
      N[j * 3] = dv.getFloat32(o + 12, true); N[j * 3 + 1] = dv.getFloat32(o + 16, true); N[j * 3 + 2] = dv.getFloat32(o + 20, true);
      U[j * 2] = dv.getFloat32(o + 24, true); U[j * 2 + 1] = 1 - dv.getFloat32(o + 28, true);
    }
  }
  return { pos: P, nrm: N, uv: U };
}

export function loadMesh(url) {
  const id = assetId(url);
  if (!id) return Promise.resolve(null);
  let p = meshes.get(id);
  if (!p) {
    p = fetchBytes(id).then((b) => {
      const m = parseMesh(b);
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(m.pos, 3));
      g.setAttribute('normal', new THREE.BufferAttribute(m.nrm, 3));
      g.setAttribute('uv', new THREE.BufferAttribute(m.uv, 2));
      g.computeBoundingSphere();
      return g;
    }).catch(() => null);
    meshes.set(id, p);
  }
  return p;
}

let contentIndex = null;

export async function loadContentIndex() {
  try {
    const r = await fetch(publicPath('/client/content-index.json?v=') + (settings.version || ''));
    contentIndex = r.ok ? await r.json() : null;
  } catch {
    contentIndex = null;
  }
}

export function contentUrl(path) {
  let p = String(path).replace(/\\/g, '/').replace(/^\/+/, '').replace(/\/{2,}/g, '/');
  if (contentIndex) p = contentIndex[p.toLowerCase()] || p;
  return publicPath('/content/') + p.split('/').map(encodeURIComponent).join('/');
}

const contentBytes = new Map();
function fetchContentBytes(path) {
  if (path.includes('..')) return Promise.resolve(null);
  let p = contentBytes.get(path);
  if (!p) {
    p = fetch(contentUrl(path)).then(async (r) => (r.ok ? new Uint8Array(await r.arrayBuffer()) : null)).catch(() => null);
    contentBytes.set(path, p);
  }
  return p;
}

const rawContent = new Map();
function contentRawImage(path) {
  let p = rawContent.get(path);
  if (!p) {
    p = fetch(contentUrl(path))
      .then((r) => (r.ok ? r.blob() : null))
      .then((b) => (b ? createImageBitmap(b, { premultiplyAlpha: 'none' }) : null))
      .catch(() => null);
    rawContent.set(path, p);
  }
  return p;
}

const contentTex = new Map();
export function contentTexture(path, opts = {}) {
  const key = path + '|' + JSON.stringify(opts);
  if (contentTex.has(key)) return contentTex.get(key);
  const c = canvas(2, 2);
  const g0 = c.getContext('2d');
  g0.fillStyle = opts.placeholder || '#fff';
  g0.fillRect(0, 0, 2, 2);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  if (opts.repeat) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(opts.repeat[0], opts.repeat[1]);
  }
  contentTex.set(key, t);
  contentRawImage(path).then((img) => {
    if (!img) {
      if (opts.fallback) {
        const f = opts.fallback();
        t.dispose();
        t.image = f.image;
        t.needsUpdate = true;
      }
      return;
    }
    const [sx, sy, sw, sh] = opts.crop || [0, 0, img.width, img.height];
    const out = canvas(sw, sh);
    const g = out.getContext('2d');
    g.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
    if (opts.normalize) {
      const d = g.getImageData(0, 0, sw, sh);
      const px = d.data;
      let sum = 0, n = 0;
      for (let i = 0; i < px.length; i += 4) {
        const l = 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
        px[i] = px[i + 1] = px[i + 2] = l;
        if (px[i + 3] > 8) {
          sum += l;
          n++;
        }
      }
      const k = n && sum ? (255 * (opts.normalize === true ? 0.92 : opts.normalize) * n) / sum : 1;
      for (let i = 0; i < px.length; i += 4) px[i] = px[i + 1] = px[i + 2] = Math.min(255, px[i] * k);
      g.putImageData(d, 0, 0);
    }
    t.dispose();
    t.image = out;
    t.needsUpdate = true;
  });
  return t;
}

const sliceCache = new Map();
export function nineSlice(prefix) {
  let p = sliceCache.get(prefix);
  if (!p) {
    p = Promise.all([1, 2, 3, 4, 5, 6, 7, 8, 9].map((i) => contentRawImage(`${prefix}_slice${i}.png`))).then((s) => {
      if (s.some((x) => !x)) return null;
      const cw = [s[0].width, s[1].width, s[2].width], rh = [s[0].height, s[3].height, s[6].height];
      const out = canvas(cw[0] + cw[1] + cw[2], rh[0] + rh[1] + rh[2]);
      const g = out.getContext('2d');
      for (let r = 0; r < 3; r++) for (let col = 0; col < 3; col++) {
        const img = s[r * 3 + col];
        const x = col === 0 ? 0 : col === 1 ? cw[0] : cw[0] + cw[1];
        const y = r === 0 ? 0 : r === 1 ? rh[0] : rh[0] + rh[1];
        g.drawImage(img, x, y, cw[col], rh[r]);
      }
      return { url: out.toDataURL('image/png'), top: rh[0], right: cw[2], bottom: rh[2], left: cw[0] };
    });
    sliceCache.set(prefix, p);
  }
  return p;
}

export async function loadAudio(ctx, url) {
  const b = builtin(url);
  const id = b ? null : assetId(url);
  if (!b && !id) return null;
  const bytes = await (b ? fetchContentBytes(b) : fetchBytes(id).catch(() => null));
  if (!bytes) return null;
  try {
    return await ctx.decodeAudioData(bytes.slice().buffer);
  } catch {
    return null;
  }
}

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

const builtins = new Map();
export function builtinImage(name) {
  if (builtins.has(name)) return builtins.get(name);
  let c = null;
  if (/face/i.test(name)) c = faceCanvas();
  builtins.set(name, c);
  return c;
}

export function faceCanvas() {
  const c = canvas(128, 128);
  const g = c.getContext('2d');
  g.fillStyle = '#141414';
  g.beginPath();
  g.ellipse(44, 50, 7, 11, 0, 0, Math.PI * 2);
  g.ellipse(84, 50, 7, 11, 0, 0, Math.PI * 2);
  g.fill();
  g.lineWidth = 6;
  g.lineCap = 'round';
  g.strokeStyle = '#141414';
  g.beginPath();
  g.arc(64, 70, 24, Math.PI * 0.18, Math.PI * 0.82);
  g.stroke();
  return c;
}

function surfaceCanvas(kind) {
  const c = canvas(64, 64);
  const g = c.getContext('2d');
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, 64, 64);
  if (kind === 'studs') {
    const grd = g.createRadialGradient(28, 28, 2, 32, 32, 18);
    grd.addColorStop(0, '#ffffff');
    grd.addColorStop(0.7, '#e2e2e2');
    grd.addColorStop(1, '#a9a9a9');
    g.fillStyle = grd;
    g.beginPath();
    g.arc(32, 32, 17, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = 'rgba(0,0,0,0.25)';
    g.lineWidth = 2;
    g.stroke();
  } else if (kind === 'inlet') {
    const grd = g.createRadialGradient(36, 36, 2, 32, 32, 18);
    grd.addColorStop(0, '#9a9a9a');
    grd.addColorStop(1, '#d6d6d6');
    g.fillStyle = grd;
    g.beginPath();
    g.arc(32, 32, 16, 0, Math.PI * 2);
    g.fill();
  } else if (kind === 'universal') {
    g.fillStyle = '#c8c8c8';
    g.fillRect(14, 14, 36, 36);
    g.fillStyle = '#ffffff';
    g.beginPath();
    g.arc(32, 32, 11, 0, Math.PI * 2);
    g.fill();
  } else if (kind === 'weld') {
    g.strokeStyle = '#bdbdbd';
    g.lineWidth = 4;
    for (let i = -64; i < 128; i += 16) {
      g.beginPath();
      g.moveTo(i, 0);
      g.lineTo(i + 64, 64);
      g.stroke();
    }
  } else if (kind === 'glue') {
    g.fillStyle = '#d9d9d9';
    for (let y = 8; y < 64; y += 16) for (let x = 8; x < 64; x += 16) {
      g.beginPath();
      g.arc(x, y, 4, 0, Math.PI * 2);
      g.fill();
    }
  }
  g.strokeStyle = 'rgba(0,0,0,0.06)';
  g.lineWidth = 2;
  g.strokeRect(0, 0, 64, 64);
  return c;
}

function noise(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function materialCanvas(kind) {
  const N = 256;
  const c = canvas(N, N);
  const g = c.getContext('2d');
  const rnd = noise(kind.length * 977);
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, N, N);
  if (kind === 'wood' || kind === 'woodplanks') {
    for (let y = 0; y < N; y++) {
      const v = 225 + Math.sin(y * 0.35 + Math.sin(y * 0.05) * 4) * 18 + rnd() * 10;
      g.fillStyle = `rgb(${v},${v * 0.93},${v * 0.86})`;
      g.fillRect(0, y, N, 1);
    }
    if (kind === 'woodplanks') {
      g.fillStyle = 'rgba(60,40,20,0.35)';
      for (let y = 0; y < N; y += 64) g.fillRect(0, y, N, 2);
    }
  } else if (kind === 'slate' || kind === 'concrete' || kind === 'granite' || kind === 'pebble' || kind === 'sand' || kind === 'cobblestone') {
    const img = g.getImageData(0, 0, N, N);
    const amp = kind === 'slate' ? 40 : kind === 'concrete' ? 26 : 34;
    for (let i = 0; i < N * N; i++) {
      const v = 230 - rnd() * amp;
      img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v;
    }
    g.putImageData(img, 0, 0);
    if (kind === 'slate') {
      g.strokeStyle = 'rgba(0,0,0,0.18)';
      for (let i = 0; i < 14; i++) {
        g.beginPath();
        g.moveTo(rnd() * N, rnd() * N);
        g.lineTo(rnd() * N, rnd() * N);
        g.stroke();
      }
    }
  } else if (kind === 'diamondplate') {
    g.fillStyle = '#d5d5d5';
    g.fillRect(0, 0, N, N);
    g.fillStyle = '#f5f5f5';
    for (let y = 0; y < N; y += 32) for (let x = 0; x < N; x += 32) {
      g.save();
      g.translate(x + ((y / 32) % 2) * 16 + 8, y + 16);
      g.rotate(((y / 32) % 2 ? 1 : -1) * 0.7);
      g.fillRect(-10, -3, 20, 6);
      g.restore();
    }
  } else if (kind === 'corrodedmetal') {
    const img = g.getImageData(0, 0, N, N);
    for (let i = 0; i < N * N; i++) {
      const r = rnd();
      const v = 205 + rnd() * 30;
      img.data[i * 4] = v * (r < 0.15 ? 1.05 : 1);
      img.data[i * 4 + 1] = v * (r < 0.15 ? 0.82 : 1);
      img.data[i * 4 + 2] = v * (r < 0.15 ? 0.7 : 1);
    }
    g.putImageData(img, 0, 0);
  } else if (kind === 'grass') {
    const img = g.getImageData(0, 0, N, N);
    for (let i = 0; i < N * N; i++) {
      const v = 200 + rnd() * 55;
      img.data[i * 4] = v * 0.92;
      img.data[i * 4 + 1] = v;
      img.data[i * 4 + 2] = v * 0.88;
    }
    g.putImageData(img, 0, 0);
  } else if (kind === 'ice' || kind === 'glass') {
    g.fillStyle = '#f4f8ff';
    g.fillRect(0, 0, N, N);
    g.strokeStyle = 'rgba(255,255,255,0.9)';
    for (let i = 0; i < 10; i++) {
      g.beginPath();
      g.moveTo(rnd() * N, rnd() * N);
      g.lineTo(rnd() * N, rnd() * N);
      g.stroke();
    }
  } else if (kind === 'foil' || kind === 'metal') {
    const grd = g.createLinearGradient(0, 0, N, N);
    grd.addColorStop(0, '#ffffff');
    grd.addColorStop(0.5, '#cfcfcf');
    grd.addColorStop(1, '#f2f2f2');
    g.fillStyle = grd;
    g.fillRect(0, 0, N, N);
  } else if (kind === 'brick') {
    g.fillStyle = '#e8e8e8';
    g.fillRect(0, 0, N, N);
    g.fillStyle = '#b8b8b8';
    for (let y = 0; y < N; y += 32) {
      g.fillRect(0, y, N, 3);
      for (let x = (y / 32) % 2 ? 32 : 0; x < N; x += 64) g.fillRect(x, y, 3, 32);
    }
  } else if (kind === 'fabric') {
    for (let y = 0; y < N; y += 2) {
      g.fillStyle = y % 4 ? '#f0f0f0' : '#dedede';
      g.fillRect(0, y, N, 1);
    }
  }
  return c;
}

const procTex = new Map();
export function proceduralTexture(kind) {
  if (procTex.has(kind)) return procTex.get(kind);
  const c = ['studs', 'inlet', 'universal', 'weld', 'glue'].includes(kind) ? surfaceCanvas(kind) : materialCanvas(kind);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  procTex.set(kind, t);
  return t;
}

export function trussTexture() {
  if (procTex.has('truss')) return procTex.get('truss');
  const c = canvas(64, 64);
  const g = c.getContext('2d');
  g.clearRect(0, 0, 64, 64);
  g.fillStyle = '#fff';
  g.fillRect(0, 0, 64, 8);
  g.fillRect(0, 56, 64, 8);
  g.fillRect(0, 0, 8, 64);
  g.fillRect(56, 0, 8, 64);
  g.save();
  g.translate(32, 32);
  g.rotate(Math.PI / 4);
  g.fillRect(-45, -4, 90, 8);
  g.restore();
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  procTex.set('truss', t);
  return t;
}

const SPRITES = { spark: 'textures/sparkle.png', soft: 'textures/Smoke.png', fire: 'textures/fire_0.png' };
export function spriteTexture(kind) {
  if (SPRITES[kind]) return contentTexture(SPRITES[kind], { fallback: () => proceduralSprite(kind) });
  return proceduralSprite(kind);
}

function proceduralSprite(kind) {
  const key = 'sprite:' + kind;
  if (procTex.has(key)) return procTex.get(key);
  const c = canvas(64, 64);
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  if (kind === 'spark') {
    grd.addColorStop(0, 'rgba(255,255,255,1)');
    grd.addColorStop(0.25, 'rgba(255,255,255,0.8)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
  } else {
    grd.addColorStop(0, 'rgba(255,255,255,0.9)');
    grd.addColorStop(0.5, 'rgba(255,255,255,0.35)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
  }
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  procTex.set(key, t);
  return t;
}

const CORE_ALIASES = { 53878057: 53878058 };

async function fetchCoreSource(id) {
  const real = CORE_ALIASES[id] || id;
  const r = await fetch(endpointUrl('coreScript', real), { credentials: 'same-origin' });
  if (!r.ok) return null;
  let text = await r.text();
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  if (text.startsWith('%')) text = text.slice(text.indexOf('\n') + 1);
  if (text.startsWith('<') || /^Failed to fetch asset/.test(text)) return null;
  return text;
}

export async function loadCoreSources(rootIds) {
  const out = new Map();
  let frontier = [...rootIds];
  for (let depth = 0; depth < 4 && frontier.length; depth++) {
    const next = [];
    const fetched = await Promise.all(frontier.filter((id) => !out.has(id)).map(async (id) => [id, await fetchCoreSource(id).catch(() => null)]));
    for (const [id, src] of fetched) {
      out.set(id, src);
      if (!src) continue;
      for (const m of src.matchAll(/AddCoreScript\(\s*(\d+)/g)) next.push(+m[1]);
      for (const m of src.matchAll(/AddStarterScript\(\s*(\d+)/g)) next.push(+m[1]);
      for (const m of src.matchAll(/RegisterLibrary\([^,]+,\s*["']?(\d+)/g)) next.push(+m[1]);
    }
    frontier = [...new Set(next)].filter((id) => !out.has(id));
  }
  return out;
}
