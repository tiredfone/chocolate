import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';

const CH = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(CH, 'studio/ui');
const input = process.argv[2];
if (!input || !fs.existsSync(input)) {
  console.error('usage: node tools/studio-ui.mjs <RobloxApp.exe or the 2012 client .zip>');
  process.exit(1);
}
const exe = input.toLowerCase().endsWith('.zip') ? execFileSync('unzip', ['-p', input, 'RobloxApp.exe'], { maxBuffer: 256 << 20 }) : fs.readFileSync(input);

function resources(d) {
  const pe = d.readUInt32LE(0x3c);
  const nsec = d.readUInt16LE(pe + 6), optsz = d.readUInt16LE(pe + 20), opt = pe + 24;
  const dd = opt + (d.readUInt16LE(opt) === 0x10b ? 96 : 112);
  const rva = d.readUInt32LE(dd + 16);
  const secs = [];
  for (let i = 0; i < nsec; i++) {
    const s = pe + 24 + optsz + 40 * i;
    secs.push([d.readUInt32LE(s + 12), Math.max(d.readUInt32LE(s + 8), d.readUInt32LE(s + 16)), d.readUInt32LE(s + 20)]);
  }
  const off = (r) => {
    for (const [va, sz, ra] of secs) if (r >= va && r < va + sz) return r - va + ra;
    return -1;
  };
  const base = off(rva);
  const out = [];
  const nameOf = (v) => {
    if (!(v & 0x80000000)) return v;
    const p = base + (v & 0x7fffffff);
    return d.toString('utf16le', p + 2, p + 2 + 2 * d.readUInt16LE(p)).replace(/^"|"$/g, '');
  };
  const walk = (o, keys) => {
    const n = d.readUInt16LE(base + o + 12) + d.readUInt16LE(base + o + 14);
    for (let i = 0; i < n; i++) {
      const e = base + o + 16 + 8 * i;
      const key = nameOf(d.readUInt32LE(e)), ptr = d.readUInt32LE(e + 4);
      if (ptr & 0x80000000) walk(ptr & 0x7fffffff, [...keys, key]);
      else out.push({ type: keys[0], name: keys[1], data: d.subarray(off(d.readUInt32LE(base + ptr)), off(d.readUInt32LE(base + ptr)) + d.readUInt32LE(base + ptr + 4)) });
    }
  };
  walk(0, []);
  return out;
}

const CRC = new Int32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c;
});
function crc(buf) {
  let c = -1;
  for (const b of buf) c = CRC[(c ^ b) & 255] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}
function chunk(type, data) {
  const t = Buffer.from(type, 'latin1'), len = Buffer.alloc(4), c = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  c.writeUInt32BE(crc(Buffer.concat([t, data])));
  return Buffer.concat([len, t, data, c]);
}
function png(w, h, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const raw = Buffer.alloc(h * (w * 4 + 1));
  for (let y = 0; y < h; y++) rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

function bitmap(b) {
  const hs = b.readUInt32LE(0), w = b.readInt32LE(4), hRaw = b.readInt32LE(8), bpp = b.readUInt16LE(14);
  const ncol = b.readUInt32LE(32) || (bpp <= 8 ? 1 << bpp : 0);
  const h = Math.abs(hRaw), stride = Math.ceil((w * bpp) / 32) * 4, px = hs + 4 * ncol;
  const rgba = Buffer.alloc(w * h * 4);
  const at = (x, y) => {
    const line = px + (hRaw > 0 ? h - 1 - y : y) * stride;
    if (bpp === 32) return [b[line + x * 4 + 2], b[line + x * 4 + 1], b[line + x * 4], b[line + x * 4 + 3]];
    if (bpp === 24) return [b[line + x * 3 + 2], b[line + x * 3 + 1], b[line + x * 3], 255];
    const i = bpp === 8 ? b[line + x] : bpp === 4 ? (b[line + (x >> 1)] >> (x & 1 ? 0 : 4)) & 15 : (b[line + (x >> 3)] >> (7 - (x & 7))) & 1;
    return [b[hs + 4 * i + 2], b[hs + 4 * i + 1], b[hs + 4 * i], 255];
  };
  const key = bpp === 32 ? null : at(0, 0);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const c = at(x, y);
    if (key && c[0] === key[0] && c[1] === key[1] && c[2] === key[2]) c[3] = 0;
    rgba.set(c, (y * w + x) * 4);
  }
  return png(w, h, rgba);
}

const STRIPS = { 128: 'toolbar-standard', 135: 'toolbar-edit', 137: 'toolbar-run', 145: 'toolbar-camera', 228: 'toolbar-advanced', 196: 'toolbar-objects', 132: 'toolbar-gui' };
fs.mkdirSync(OUT, { recursive: true });
let n = 0;
for (const r of resources(exe)) {
  if (r.type === 'PNG' && typeof r.name === 'string' && /_16(_[DH])?$/.test(r.name)) {
    fs.writeFileSync(path.join(OUT, r.name.toLowerCase() + '.png'), r.data);
    n++;
  } else if (r.type === 'PNG' && r.name === 133) {
    fs.writeFileSync(path.join(OUT, 'class-images.png'), r.data);
    n++;
  } else if (r.type === 2 && STRIPS[r.name]) {
    fs.writeFileSync(path.join(OUT, STRIPS[r.name] + '.png'), bitmap(r.data));
    n++;
  }
}
if (!fs.existsSync(path.join(OUT, 'class-images.png'))) {
  console.error('RobloxApp.exe did not contain the expected Studio resources');
  process.exit(1);
}
console.log('wrote', n, 'images to', path.relative(process.cwd(), OUT) || '.');
