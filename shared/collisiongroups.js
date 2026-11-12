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
