export const MAX_COLLISION_GROUPS = 32;

const cache = new Map();

export function parseGroups(str) {
  const key = String(str || '');
  let t = cache.get(key);
  if (t) return t;
  const groups = [];
  for (const entry of key.split('\\')) {
    if (!entry) continue;
    const parts = entry.split('^');
    if (parts.length < 3) continue;
    const id = parseInt(parts[parts.length - 2], 10);
    const mask = parseInt(parts[parts.length - 1], 10);
    const name = parts.slice(0, parts.length - 2).join('^');
    if (!Number.isInteger(id) || id < 0 || id >= MAX_COLLISION_GROUPS) continue;
    groups.push({ name, id, mask: Number.isFinite(mask) ? mask | 0 : -1 });
  }
  if (!groups.some((g) => g.id === 0)) groups.unshift({ name: 'Default', id: 0, mask: -1 });
  groups.sort((a, b) => a.id - b.id);
  t = { groups, byId: new Map(groups.map((g) => [g.id, g])), byName: new Map(groups.map((g) => [g.name, g])) };
  if (cache.size > 64) cache.clear();
  cache.set(key, t);
  return t;
}

export function serializeGroups(groups) {
  return groups.slice().sort((a, b) => a.id - b.id).map((g) => `${g.name}^${g.id}^${g.mask | 0}`).join('\\');
}

export function groupsCollide(table, a, b) {
  a |= 0;
  b |= 0;
  if (a === b && a === 0) return true;
  const ga = table.byId.get(a), gb = table.byId.get(b);
  if (!ga || !gb) return true;
  return ((ga.mask >>> b) & 1) === 1 && ((gb.mask >>> a) & 1) === 1;
}

export function rapierGroups(table, id) {
  id |= 0;
  const bit = (n) => (n < 16 ? 1 << n : 1 << 15);
  let filter = 0;
  for (const g of table.groups) if (groupsCollide(table, id, g.id)) filter |= bit(g.id);
  if (id >= 16 || table.groups.some((g) => g.id >= 16)) filter = 0xffff;
  return ((bit(id) & 0xffff) << 16) | (filter & 0xffff);
}

export function groupsFromData(raw) {
  let bytes = null;
  if (raw instanceof Uint8Array) bytes = raw;
  else {
    let s = String(raw || '');
    const m = /<BinaryString[^>]*>([^<]*)<\/BinaryString>/i.exec(s);
    if (m) s = m[1];
    s = s.replace(/<!\[CDATA\[|\]\]>/g, '').replace(/\s+/g, '');
    if (!s) return '';
    try {
      const bin = atob(s);
      bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    } catch {
      return '';
    }
  }
  if (!bytes || bytes.length < 2) return '';
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const count = bytes[1];
  let o = 2;
  const groups = [];
  for (let i = 0; i < count && o + 7 <= bytes.length; i++) {
    const id = bytes[o];
    const maskLen = bytes[o + 1];
    o += 2;
    if (maskLen !== 4 || o + 5 > bytes.length) return '';
    const mask = dv.getInt32(o, true);
    o += 4;
    const nameLen = bytes[o++];
    if (o + nameLen > bytes.length) return '';
    let name = '';
    for (let k = 0; k < nameLen; k++) name += String.fromCharCode(bytes[o + k]);
    o += nameLen;
    if (id < MAX_COLLISION_GROUPS) groups.push({ name, id, mask });
  }
  return groups.length ? serializeGroups(groups) : '';
}
