import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import { fileURLToPath } from 'url';

const CH = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(CH, 'studio/ui2018');
const [exePath, ribbonPath] = process.argv.slice(2);
if (!exePath || !ribbonPath || !fs.existsSync(exePath) || !fs.existsSync(ribbonPath)) {
  console.error('usage: node tools/studio2018-ui.mjs <RobloxStudioBeta.exe> <RobloxStudioRibbon.xml>   (Studio 2017-2018, ribbon UI)');
  process.exit(1);
}
const d = fs.readFileSync(exePath);
const u16 = (o) => d.readUInt16BE(o);
const u32 = (o) => d.readUInt32BE(o);

function findAll(needle) {
  const out = [];
  let i = d.indexOf(needle);
  while (i >= 0) {
    out.push(i);
    i = d.indexOf(needle, i + 1);
  }
  return out;
}

function nameAt(o) {
  if (o < 0 || o + 6 > d.length) return null;
  const n = u16(o);
  if (n === 0 || n > 300 || o + 6 + 2 * n > d.length) return null;
  const s = Buffer.from(d.subarray(o + 6, o + 6 + 2 * n)).swap16().toString('utf16le');
  return /^[\x20-\x7e]+$/.test(s) ? s : null;
}

function tryTree(root, size) {
  const cnt = u32(root + 6), first = u32(root + 10);
  if (cnt < 2 || cnt > 64) return null;
  const kids = [];
  for (let i = 0; i < cnt; i++) {
    const k = root + size * (first + i);
    if (k + size > d.length) return null;
    const flags = u16(k + 4);
    if (flags > 3) return null;
    kids.push(u32(k));
  }
  const anchors = [...findAll(Buffer.from('RibbonBar', 'utf16le').swap16())];
  for (const a of anchors) {
    for (const off of kids) {
      const base = a - 6 - off;
      if (kids.every((o) => nameAt(base + o))) return { root, size, names: base, kids: kids.map((o) => nameAt(base + o)) };
    }
  }
  return null;
}

let tree = null;
const pattern = Buffer.from([0, 0, 0, 0, 0, 2, 0, 0, 0]);
for (const r of findAll(pattern)) {
  if (u32(r + 10) !== 1) continue;
  for (const size of [14, 22]) {
    tree = tryTree(r, size);
    if (tree) break;
  }
  if (tree) break;
}
if (!tree) {
  console.error('No Qt resource tree with RibbonBar images was found in this executable.');
  process.exit(1);
}

const files = [];
const node = (i) => tree.root + tree.size * i;
const walk = (i, p) => {
  const o = node(i);
  const nm = i ? nameAt(tree.names + u32(o)) : '';
  const full = i ? (p ? p + '/' + nm : nm) : '';
  const flags = u16(o + 4);
  if (flags & 2) {
    const c = u32(o + 6), f = u32(o + 10);
    for (let k = 0; k < c; k++) walk(f + k, full);
  } else files.push({ path: full, flags, off: u32(o + 10) });
};
walk(0, '');

const pngs = new Set(findAll(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])));
const pngFiles = files.filter((f) => /\.png$/i.test(f.path) && !(f.flags & 1)).slice(0, 30);
let dataBase = null;
for (const p of pngs) {
  const base = p - 4 - pngFiles[0].off;
  const hits = pngFiles.filter((f) => pngs.has(base + f.off + 4)).length;
  if (hits >= Math.min(25, pngFiles.length)) {
    dataBase = base;
    break;
  }
}
if (dataBase == null) {
  console.error('Could not locate the resource data table.');
  process.exit(1);
}

fs.rmSync(OUT, { recursive: true, force: true });
let written = 0;
for (const f of files) {
  if (!/\.(png|jpg|gif|css)$/i.test(f.path)) continue;
  const size = u32(dataBase + f.off);
  let data = d.subarray(dataBase + f.off + 4, dataBase + f.off + 4 + size);
  if (f.flags & 1) data = zlib.inflateSync(data.subarray(4));
  const dst = path.join(OUT, f.path);
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.writeFileSync(dst, data);
  written++;
}

const src = fs.readFileSync(ribbonPath, 'utf8');
const ent = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
const unesc = (s) => s.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (m, e) => (e[0] === '#' ? String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : +e.slice(1)) : ent[e] ?? m));
const root = { tag: '#', attrs: {}, kids: [] };
const stack = [root];
const re = /<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<(\/?)([\w.]+)((?:\s+[\w:.-]+\s*=\s*"[^"]*")*)\s*(\/?)>/g;
let m;
while ((m = re.exec(src))) {
  if (!m[2]) continue;
  if (m[1]) {
    if (stack.length > 1) stack.pop();
    continue;
  }
  const attrs = {};
  for (const a of m[3].matchAll(/([\w:.-]+)\s*=\s*"([^"]*)"/g)) if (!(a[1] in attrs)) attrs[a[1]] = unesc(a[2]);
  const el = { tag: m[2], attrs, kids: [] };
  stack[stack.length - 1].kids.push(el);
  if (!m[4]) stack.push(el);
}
const mainWindow = root.kids.find((k) => k.tag === 'MainWindow');
fs.writeFileSync(path.join(OUT, 'ribbon.json'), JSON.stringify(mainWindow));
console.log(`studio/ui2018: ${written} images and stylesheets, ribbon.json with ${mainWindow.kids.find((k) => k.tag === 'RibbonBar').kids.filter((k) => k.tag === 'TabPage').length} tabs`);
