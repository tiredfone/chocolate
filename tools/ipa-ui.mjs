import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';

const CH = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(CH, 'client/ui');
const ipa = process.argv[2];
if (!ipa || !fs.existsSync(ipa)) {
  console.error('usage: node tools/ipa-ui.mjs <path to the ROBLOX 2.4.1 .ipa>');
  process.exit(1);
}

const entries = execFileSync('unzip', ['-Z1', ipa], { encoding: 'utf8', maxBuffer: 64 << 20 }).split('\n');
function read(name) {
  const entry = entries.find((e) => /^Payload\/[^/]+\.app\//.test(e) && e.endsWith('/' + name));
  if (!entry) throw new Error(`${name} is not in the IPA`);
  return execFileSync('unzip', ['-p', ipa, entry], { maxBuffer: 64 << 20 });
}

function paeth(a, b, c) {
  const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
}

function decode(buf) {
  let i = 8, w = 0, h = 0, type = 6, cgbi = false;
  const idat = [];
  while (i < buf.length) {
    const n = buf.readUInt32BE(i);
    const t = buf.toString('latin1', i + 4, i + 8);
    const d = buf.subarray(i + 8, i + 8 + n);
    if (t === 'CgBI') cgbi = true;
    else if (t === 'IHDR') {
      w = d.readUInt32BE(0);
      h = d.readUInt32BE(4);
      type = d[9];
      if (d[8] !== 8 || (type !== 6 && type !== 2)) throw new Error('unsupported PNG format');
    } else if (t === 'IDAT') idat.push(d);
    i += 12 + n;
  }
  const raw = cgbi ? zlib.inflateRawSync(Buffer.concat(idat)) : zlib.inflateSync(Buffer.concat(idat));
  const bpp = type === 6 ? 4 : 3, stride = w * bpp;
  const rgba = Buffer.alloc(w * h * 4);
  let prev = Buffer.alloc(stride);
  for (let y = 0, p = 0; y < h; y++) {
    const f = raw[p];
    const line = Buffer.from(raw.subarray(p + 1, p + 1 + stride));
    p += 1 + stride;
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? line[x - bpp] : 0, b = prev[x], c = x >= bpp ? prev[x - bpp] : 0;
      if (f === 1) line[x] = (line[x] + a) & 255;
      else if (f === 2) line[x] = (line[x] + b) & 255;
      else if (f === 3) line[x] = (line[x] + ((a + b) >> 1)) & 255;
      else if (f === 4) line[x] = (line[x] + paeth(a, b, c)) & 255;
    }
    prev = line;
    for (let x = 0; x < w; x++) {
      const s = x * bpp, o = (y * w + x) * 4;
      let r = line[s], g = line[s + 1], bl = line[s + 2];
      const al = bpp === 4 ? line[s + 3] : 255;
      if (cgbi) {
        [r, bl] = [bl, r];
        if (al) {
          r = Math.min(255, Math.round((r * 255) / al));
          g = Math.min(255, Math.round((g * 255) / al));
          bl = Math.min(255, Math.round((bl * 255) / al));
        }
      }
      rgba[o] = r; rgba[o + 1] = g; rgba[o + 2] = bl; rgba[o + 3] = al;
    }
  }
  return { w, h, rgba };
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
  const t = Buffer.from(type, 'latin1');
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const c = Buffer.alloc(4);
  c.writeUInt32BE(crc(Buffer.concat([t, data])));
  return Buffer.concat([len, t, data, c]);
}
function encode({ w, h, rgba }) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const raw = Buffer.alloc(h * (w * 4 + 1));
  for (let y = 0; y < h; y++) rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

function blit(dst, src, ox, oy) {
  for (let y = 0; y < src.h; y++) for (let x = 0; x < src.w; x++) {
    const dx = ox + x, dy = oy + y;
    if (dx >= dst.w || dy >= dst.h) continue;
    src.rgba.copy(dst.rgba, (dy * dst.w + dx) * 4, (y * src.w + x) * 4, (y * src.w + x) * 4 + 4);
  }
}

fs.mkdirSync(OUT, { recursive: true });
const sheet = { w: 512, h: 512, rgba: Buffer.alloc(512 * 512 * 4) };
for (const [name, x, y] of [['thumbstickOuter.png', 0, 0], ['thumbstickInner.png', 220, 0], ['jumpButtonPress.png', 0, 222], ['jumpbutton.png', 176, 222]]) blit(sheet, decode(read(name)), x, y);
fs.writeFileSync(path.join(OUT, 'TouchControlsSheet.png'), encode(sheet));
const copies = {
  'roblox-logo@2x.png': 'roblox-logo.png',
  'IPadInGameGUI_LeaveMenuBkgd.png': 'LeaveMenuBkgd.png',
  'IPadInGameGUI_LeaveMenuCancelBtn.png': 'LeaveMenuCancelBtn.png',
  'IPadInGameGUI_LeaveMenuLeaveBtn.png': 'LeaveMenuLeaveBtn.png',
};
for (const [from, to] of Object.entries(copies)) fs.writeFileSync(path.join(OUT, to), encode(decode(read(from))));
console.log('wrote', ['TouchControlsSheet.png', ...Object.values(copies)].join(', '), 'to', path.relative(process.cwd(), OUT) || '.');
