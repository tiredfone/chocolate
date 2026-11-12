import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import { fileURLToPath } from 'url';

const CH = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = process.argv[2];
if (!src || !fs.existsSync(path.join(src, 'content'))) {
  console.log('usage: node tools/content2018.mjs /path/to/2018-client (the folder holding content/ and PlatformContent/)');
  process.exit(1);
}
const out = path.join(CH, 'content2018');

function rgb565(c) {
  return [((c >> 11) & 31) * 255 / 31, ((c >> 5) & 63) * 255 / 63, (c & 31) * 255 / 31];
}

function decodeDDS(buf) {
  if (buf.toString('latin1', 0, 4) !== 'DDS ') throw new Error('not a DDS file');
  const h = buf.readUInt32LE(12), w = buf.readUInt32LE(16);
  const four = buf.toString('latin1', 84, 88);
  const dxt5 = four === 'DXT5', dxt3 = four === 'DXT3';
  if (four !== 'DXT1' && !dxt5 && !dxt3) throw new Error('unsupported DDS format ' + four);
  const px = Buffer.alloc(w * h * 4);
  let o = 128;
  const bw = Math.max(1, (w + 3) >> 2), bh = Math.max(1, (h + 3) >> 2);
  for (let by = 0; by < bh; by++) for (let bx = 0; bx < bw; bx++) {
    const alpha = new Array(16).fill(255);
    if (dxt5) {
      const a0 = buf[o], a1 = buf[o + 1];
      const table = [a0, a1];
      if (a0 > a1) for (let i = 1; i < 7; i++) table.push(((7 - i) * a0 + i * a1) / 7);
      else {
        for (let i = 1; i < 5; i++) table.push(((5 - i) * a0 + i * a1) / 5);
        table.push(0, 255);
      }
      let bits = 0n;
      for (let i = 0; i < 6; i++) bits |= BigInt(buf[o + 2 + i]) << BigInt(8 * i);
      for (let i = 0; i < 16; i++) alpha[i] = table[Number((bits >> BigInt(3 * i)) & 7n)];
      o += 8;
    } else if (dxt3) {
      for (let i = 0; i < 16; i++) alpha[i] = ((buf[o + (i >> 1)] >> ((i & 1) * 4)) & 15) * 17;
      o += 8;
    }
    const c0 = buf.readUInt16LE(o), c1 = buf.readUInt16LE(o + 2);
    const p0 = rgb565(c0), p1 = rgb565(c1);
    const cols = [p0, p1];
    if (c0 > c1 || dxt5 || dxt3) {
      cols.push(p0.map((v, i) => (2 * v + p1[i]) / 3), p0.map((v, i) => (v + 2 * p1[i]) / 3));
    } else {
      cols.push(p0.map((v, i) => (v + p1[i]) / 2), [0, 0, 0, 0]);
    }
    const idx = buf.readUInt32LE(o + 4);
    o += 8;
    for (let i = 0; i < 16; i++) {
      const x = bx * 4 + (i & 3), y = by * 4 + (i >> 2);
      if (x >= w || y >= h) continue;
      const ci = (idx >> (2 * i)) & 3;
      const c = cols[ci];
      const q = (y * w + x) * 4;
      px[q] = c[0]; px[q + 1] = c[1]; px[q + 2] = c[2];
      px[q + 3] = c.length === 4 && !dxt5 && !dxt3 ? 0 : alpha[i];
    }
  }
  return { w, h, px };
}

const CRC = new Int32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c;
});
function crc32(b) {
  let c = -1;
  for (const x of b) c = CRC[(c ^ x) & 255] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png({ w, h, px }) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6;
  const rows = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) px.copy(rows, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(rows, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

let copied = 0, converted = 0, failed = 0;
function walk(from, to) {
  for (const e of fs.readdirSync(from, { withFileTypes: true })) {
    const a = path.join(from, e.name), b = path.join(to, e.name);
    if (e.isDirectory()) {
      walk(a, b);
      continue;
    }
    fs.mkdirSync(to, { recursive: true });
    const ext = path.extname(e.name).toLowerCase();
    if (ext === '.dds' || ext === '.tex') {
      try {
        fs.writeFileSync(b.slice(0, -ext.length) + '.png', png(decodeDDS(fs.readFileSync(a))));
        converted++;
      } catch (err) {
        failed++;
        console.log('skipped', a, err.message);
      }
      continue;
    }
    fs.copyFileSync(a, b);
    copied++;
  }
}

fs.rmSync(out, { recursive: true, force: true });
walk(path.join(src, 'content'), out);
const plat = path.join(src, 'PlatformContent', 'pc');
if (fs.existsSync(plat)) walk(plat, path.join(out, 'platform'));
const files = [];
const list = (d, rel) => {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const r = rel ? rel + '/' + e.name : e.name;
    if (e.isDirectory()) list(path.join(d, e.name), r);
    else files.push(r);
  }
};
list(out, '');
fs.writeFileSync(path.join(CH, 'client', 'content2018-index.json'), JSON.stringify(Object.fromEntries(files.sort().map((f) => [f.toLowerCase(), f]))));
console.log(`content2018: ${copied} copied, ${converted} textures converted to PNG, ${failed} skipped, ${files.length} indexed`);
