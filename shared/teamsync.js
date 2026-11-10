import { Instance } from './instance.js';
import { isService } from './classes.js';
import { parsePlace } from './rbxl.js';
import { writeModel, writePlace } from './rbxlx.js';

export const FLUSH_MS = 66;
export const MAX_SOURCE = 1024 * 1024;
export const MAX_XML = 6 * 1024 * 1024;

export class GidMap {
  constructor(dm, prefix) {
    this.dm = dm;
    this.prefix = prefix;
    this.next = 1;
    this.byGid = new Map();
    this.byGid.set('root', dm.root);
    dm.root.gid = 'root';
  }

  assign(inst, gid) {
    if (inst.gid && this.byGid.get(inst.gid) === inst) this.byGid.delete(inst.gid);
    inst.gid = gid;
    this.byGid.set(gid, inst);
  }

  mint(inst) {
    if (inst.gid) return inst.gid;
    let g;
    do g = `${this.prefix}${this.next++}`; while (this.byGid.has(g));
    this.assign(inst, g);
    return g;
  }

  get(gid) {
    const inst = this.byGid.get(gid);
    return inst && !inst.destroyed ? inst : null;
  }
}

export function encodeProp(inst, name) {
  const p = inst.info.all.get(name);
  if (!p || p.type === 'any') return undefined;
  const v = inst.props.get(name);
  if (p.type === 'Ref') return v instanceof Instance && v.gid ? v.gid : null;
  if (Array.isArray(v)) return v.slice();
  return v;
}

export function decodeProp(gids, inst, name, v) {
  const p = inst.info.all.get(name);
  if (!p || p.type === 'any') return { ok: false };
  if (p.type === 'Ref') {
    if (v == null) return { ok: true, v: null };
    if (typeof v !== 'string') return { ok: false };
    const t = gids.get(v);
    return t ? { ok: true, v: t } : { ok: false };
  }
  const def = p.def;
  if (Array.isArray(def) || ['V3', 'V2', 'C3', 'CF', 'UD2', 'UD'].includes(p.type)) {
    if (!Array.isArray(v) || v.length > 12 || !v.every((x) => typeof x === 'number' && Number.isFinite(x))) return { ok: false };
    return { ok: true, v: v.slice() };
  }
  if (p.type === 'bool') return typeof v === 'boolean' ? { ok: true, v } : { ok: false };
  if (p.type === 'string' || p.type === 'Content') {
    if (typeof v !== 'string' || v.length > MAX_SOURCE) return { ok: false };
    return { ok: true, v };
  }
  if (typeof v === 'number' && Number.isFinite(v)) return { ok: true, v };
  return { ok: false };
}

export function packSubtree(dm, gids, tops) {
  const fileRefs = {};
  const included = [];
  const walk = (x, top) => {
    if (!top && x.gid) return;
    if (x.props.get('Archivable') === false) return;
    gids.mint(x);
    included.push(x);
    if (x.fileRef) fileRefs[x.gid] = x.fileRef;
    for (const c of x.children) walk(c, false);
  };
  for (const t of tops) walk(t, true);
  const set = new Set(included);
  const xml = writeModel(dm, tops, { refOf: (i) => i.gid, skip: (i) => !set.has(i) });
  return { xml, refs: fileRefs, included };
}

export function packPlace(dm, gids) {
  const fileRefs = {};
  const all = dm.root.descendants();
  for (const x of all) {
    gids.mint(x);
    if (x.fileRef) fileRefs[x.gid] = x.fileRef;
  }
  return { xml: writePlaceWithGids(dm), refs: fileRefs };
}

function writePlaceWithGids(dm) {
  const tops = dm.root.children;
  return writeModel(dm, tops, { refOf: (i) => i.gid });
}

export function unpack(dm, gids, xml, refs, parent, opts = {}) {
  const nodes = parsePlace(String(xml));
  const fix = [];
  const walk = (n) => {
    fix.push(n.ref);
    for (const c of n.children) walk(c);
  };
  for (const n of nodes) walk(n);
  if (opts.validate && !opts.validate(nodes, fix)) return null;
  const tops = dm.load(nodes, parent, { track: true });
  const stamp = (inst) => {
    const g = inst.fileRef;
    if (g) gids.assign(inst, g);
    inst.fileRef = refs && g && Object.prototype.hasOwnProperty.call(refs, g) ? String(refs[g]) : null;
    for (const c of inst.children) if (c.fileRef === undefined || (c.fileRef && !c.gid)) stamp(c);
  };
  for (const t of tops) stamp(t);
  return tops;
}

export function canMove(inst, parent, root) {
  if (!inst || inst === root || isService(inst.ClassName) || inst.parentLocked) return false;
  if (!parent) return true;
  if (parent.destroyed || parent === inst || parent.isDescendantOf(inst)) return false;
  if (parent === root) return false;
  return true;
}

export function writeWholePlace(dm) {
  return writePlace(dm);
}
